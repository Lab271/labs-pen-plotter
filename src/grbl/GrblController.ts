import type { Transport } from '../transport/Transport';
import { Emitter } from './emitter';
import { LineReader } from './lineReader';
import { classifyLine } from './parse';
import { Calibration, DEFAULT_CALIBRATION } from './settings';
import type { GrblSettings, Position, StatusReport } from './types';

/** Real-time single-byte commands (sent out-of-band, never queued, no `ok`). */
export const RT = {
  STATUS: 0x3f, // ?
  HOLD: 0x21, // !
  RESUME: 0x7e, // ~
  RESET: 0x18, // Ctrl-X soft reset
  JOG_CANCEL: 0x85,
  FEED_100: 0x90,
  FEED_PLUS_10: 0x91,
  FEED_MINUS_10: 0x92,
  FEED_PLUS_1: 0x93,
  FEED_MINUS_1: 0x94,
} as const;

/**
 * Character-counting window. GRBL's serial RX buffer is 128 bytes; the in-flight
 * byte count must stay STRICTLY below it (one byte is always reserved by the ring
 * buffer), so we use 127. Filling to exactly 128 can drop a byte at a boundary,
 * corrupting a line so GRBL never acks it — a silent stall at a repeatable point.
 */
const RX_BUFFER = 127;
const STATUS_INTERVAL_MS = 200; // ~5 Hz — GRBL's recommended max polling rate

type ControllerEvents = {
  connected: { version: string };
  disconnected: undefined;
  status: StatusReport;
  settings: GrblSettings;
  error: { code: number; line: string };
  alarm: { code: number };
  streamProgress: { acked: number; total: number };
  streamComplete: undefined;
  streamAborted: { reason: string };
  log: { dir: 'tx' | 'rx' | 'info'; text: string };
};

interface Pending {
  line: string;
  len: number; // byte length including the '\n' terminator
  resolve: () => void;
  reject: (err: Error) => void;
  isStream: boolean;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : Number(n.toFixed(3)).toString();
}

/**
 * The portable GRBL engine. Depends only on the Transport interface — no React,
 * no DOM, no Web Serial — so it can run unchanged under Node on a Raspberry Pi.
 */
export class GrblController {
  private readonly events = new Emitter<ControllerEvents>();
  private readonly encoder = new TextEncoder();
  private readonly reader: LineReader;

  private unsubData?: () => void;
  private unsubClose?: () => void;

  // Character-counting flow control.
  private queue: Pending[] = [];
  private inflight: Pending[] = [];
  private inflightBytes = 0;
  // Soft pause: stop feeding new lines (the machine drains its buffer and idles)
  // instead of a firmware feed-hold, which wedges the FluidNC/USB link here.
  private paused = false;

  // Serialized writer so a real-time byte never interleaves inside a line.
  private writeChain: Promise<void> = Promise.resolve();

  // Streaming job state.
  private stream: { total: number; acked: number; aborted: boolean } | null = null;
  private pendingComplete = false;

  // Connection/status state.
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private bannerWaiters: Array<(seen: boolean) => void> = [];
  private version = 'unknown';
  private _connected = false;
  private _lastStatus: StatusReport | null = null;
  private _lastWco: Position = { x: 0, y: 0, z: 0 };
  // True once a status with a *real* WCO field has arrived for the current
  // connection. Until then `_lastWco` is a stale/default guess (it carries over
  // between connects for smooth display), so a reconstructed work position is
  // untrustworthy — the gateway must not persist it. Reset on every (re)connect.
  private _wcoKnown = false;
  // Current feed-rate override (%). GRBL has no absolute-set byte, so we step
  // toward a target with the ±10/±1 real-time bytes and track the result here.
  private _feedOverride = 100;
  private _settings: GrblSettings = {};

  calibration: Calibration = { ...DEFAULT_CALIBRATION };

  constructor(private readonly transport: Transport) {
    this.reader = new LineReader((line) => this.handleLine(line));
    // Subscribe immediately so the engine is testable without open().
    this.unsubData = this.transport.onData((bytes) => this.reader.push(bytes));
    this.unsubClose = this.transport.onClose(() => this.handleUnexpectedClose());
  }

  // ---- public observation API ----
  on = this.events.on.bind(this.events);
  get connected(): boolean {
    return this._connected;
  }
  get lastStatus(): StatusReport | null {
    return this._lastStatus;
  }
  /** True once a real WCO has been reported this connection (work position is trustworthy). */
  get wcoKnown(): boolean {
    return this._wcoKnown;
  }
  get settings(): GrblSettings {
    return this._settings;
  }
  get firmwareVersion(): string {
    return this.version;
  }
  /** True when GRBL homing is enabled ($22=1); known after connect reads $$. */
  get homingEnabled(): boolean {
    return this._settings[22] === 1;
  }

  // ---- connection lifecycle ----

  async connect(): Promise<void> {
    this.resetSessionState();
    await this.transport.open();
    await this.afterOpen();
  }

  /**
   * Re-open an already-granted device without a user gesture (e.g. after a
   * replug auto-recovery). Returns false if no device is available / openable.
   */
  async reconnect(): Promise<boolean> {
    if (!this.transport.reopen) return false;
    this.resetSessionState();
    if (!(await this.transport.reopen())) return false;
    await this.afterOpen();
    return true;
  }

  /** Clear transient per-session state so a (re)connect starts clean. */
  private resetSessionState(): void {
    this.reader.reset();
    this.bannerWaiters = [];
    this._lastStatus = null;
    this._wcoKnown = false; // the cached WCO is now stale until the controller re-reports it
    this.writeChain = Promise.resolve();
    this.paused = false;
    this._feedOverride = 100;
  }

  /** Shared post-open handshake for connect() and reconnect(). */
  private async afterOpen(): Promise<void> {
    // GRBL only prints its banner right after a reset. Wait briefly; if nothing
    // arrives, force a soft reset to elicit it.
    const seen = await this.waitForBanner(1500);
    if (!seen) {
      await this.sendRealtime(RT.RESET);
      await this.waitForBanner(2000);
    }

    this.startPolling();
    // Set modal defaults and read settings. Tolerate per-line errors so one
    // rejection can't abort the whole connect.
    await this.enqueueLine('G21').catch(() => undefined); // millimeters
    await this.enqueueLine('G90').catch(() => undefined); // absolute positioning
    await this.enqueueLine('$$').catch(() => undefined); // settings dump

    this._connected = true;
    this.events.emit('connected', { version: this.version });
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    this.clearPending('disconnected');
    this._connected = false;
    await this.transport.close();
    this.events.emit('disconnected', undefined);
  }

  private handleUnexpectedClose(): void {
    if (!this._connected) return;
    this.stopPolling();
    this.clearPending('connection lost');
    this._connected = false;
    this.events.emit('disconnected', undefined);
  }

  // ---- incoming line handling ----

  private handleLine(raw: string): void {
    this.events.emit('log', { dir: 'rx', text: raw });
    const line = classifyLine(raw);
    switch (line.kind) {
      case 'ok':
        this.handleAck(true);
        break;
      case 'error':
        this.handleAck(false, line.code);
        break;
      case 'alarm':
        this.handleAlarm(line.code);
        break;
      case 'status': {
        // GRBL/FluidNC only sends WCO occasionally — cache it and apply it to
        // every report so derived work position doesn't jump.
        const report = line.report;
        if (report.wco) {
          this._lastWco = report.wco;
          this._wcoKnown = true;
        } else report.wco = this._lastWco;
        this._lastStatus = report;
        this.events.emit('status', report);
        if (this.pendingComplete && report.state === 'Idle') this.finishStream();
        break;
      }
      case 'setting':
        this._settings[line.num] = line.value;
        this.events.emit('settings', { ...this._settings });
        break;
      case 'banner':
        // A banner means GRBL just reset and cleared its buffers — resync.
        this.version = line.version;
        this.resyncAfterReset();
        this.resolveBanner();
        break;
      case 'message':
      case 'other':
        break;
    }
  }

  private handleAck(ok: boolean, code?: number): void {
    const entry = this.inflight.shift();
    if (!entry) return;
    this.inflightBytes -= entry.len;

    if (ok) {
      entry.resolve();
      if (entry.isStream && this.stream && !this.stream.aborted) {
        this.stream.acked++;
        this.events.emit('streamProgress', {
          acked: this.stream.acked,
          total: this.stream.total,
        });
        if (this.stream.acked >= this.stream.total) {
          // Completion requires queue empty AND GRBL Idle (not just last ok).
          if (this._lastStatus?.state === 'Idle') this.finishStream();
          else this.pendingComplete = true;
        }
      }
    } else {
      entry.reject(new Error(`error:${code}`));
      this.events.emit('error', { code: code ?? -1, line: entry.line });
      if (entry.isStream) this.abortStream(`error:${code} on "${entry.line}"`);
    }
    this.pump();
  }

  private handleAlarm(code: number): void {
    this.events.emit('alarm', { code });
    if (this.stream && !this.stream.aborted) this.abortStream(`ALARM:${code}`);
  }

  // ---- character-counting send pump ----

  private pump(): void {
    while (this.queue.length > 0) {
      if (this.paused) break; // soft pause: hold new lines; inflight ones finish
      const next = this.queue[0];
      // Always allow at least one line when nothing is in flight; otherwise the
      // line must fit within the remaining RX-buffer window.
      if (this.inflight.length > 0 && this.inflightBytes + next.len > RX_BUFFER) break;
      this.queue.shift();
      this.inflight.push(next);
      this.inflightBytes += next.len;
      this.events.emit('log', { dir: 'tx', text: next.line });
      void this.writeRaw(this.encoder.encode(next.line + '\n'));
    }
  }

  /** Enqueue a line command; resolves on `ok`, rejects on `error:`/reset. */
  private enqueueLine(line: string, isStream = false): Promise<void> {
    const len = this.encoder.encode(line + '\n').length;
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ line, len, resolve, reject, isStream });
      this.pump();
    });
  }

  /**
   * Send a real-time byte. These bypass BOTH the line queue and the serialized
   * write-chain, writing straight to the transport so pause/resume/stop/status
   * are immediate. GRBL extracts real-time bytes from the stream even mid-line,
   * so this is safe.
   */
  sendRealtime(byte: number): Promise<void> {
    return this.transport.write(new Uint8Array([byte]));
  }

  private writeRaw(data: Uint8Array): Promise<void> {
    // Chain writes so bytes are emitted atomically and never interleave.
    this.writeChain = this.writeChain.then(
      () => this.transport.write(data),
      () => this.transport.write(data),
    );
    return this.writeChain;
  }

  // ---- streaming ----

  /**
   * True while a program is streaming or held. A stopped (aborted) program no
   * longer counts, so Stop → Plot works without waiting for the Idle settle.
   */
  get isStreaming(): boolean {
    return (this.stream !== null && !this.stream.aborted) || this.paused;
  }

  /**
   * Stream a G-code program. Completion/abort is reported via events.
   *
   * Refuses while another program is streaming: there is no in-progress guard
   * anywhere else, and a second program would interleave into the running
   * queue line by line — the pen would draw a merge of both. The UI disables
   * Plot/Run while streaming; this is the backstop for every other caller.
   */
  streamProgram(rawLines: string[]): void {
    if (this.isStreaming) throw new Error('A program is already running — stop it first.');
    const program = rawLines.map((l) => stripComment(l)).filter((l) => l.length > 0);
    this.paused = false;
    // Start every plot at 100% feed so speed is predictable (override persists in
    // GRBL across jobs otherwise).
    this._feedOverride = 100;
    void this.sendRealtime(RT.FEED_100).catch(() => undefined);
    this.stream = { total: program.length, aborted: false, acked: 0 };
    this.pendingComplete = false;
    if (program.length === 0) {
      this.finishStream();
      return;
    }
    for (const line of program) {
      // Errors are surfaced via the 'error'/'streamAborted' events, not here.
      this.enqueueLine(line, true).catch(() => undefined);
    }
  }

  /**
   * Pause immediately with a feed-hold (stops mid-move, unlike draining the
   * buffer). Also set `paused` so the pump stops feeding new lines. Polling stays
   * on so the link keeps breathing and we see the Hold state.
   */
  pause(): void {
    this.paused = true;
    void this.sendRealtime(RT.HOLD).catch(() => undefined);
  }

  resume(): void {
    this.paused = false;
    void this.sendRealtime(RT.RESUME).catch(() => undefined);
    this.pump();
  }

  /**
   * Stop the current plot immediately: drop the remaining program, feed-hold to
   * halt motion now, wait for it to settle, then soft-reset to flush the buffer.
   * (Reset preserves the G54 work zero — $22=0 means no homing/alarm — so the
   * paper corner stays valid.)
   */
  async stop(): Promise<void> {
    this.abortStream('stopped by operator');
    await this.sendRealtime(RT.HOLD);
    // Wait until motion settles before reset — resetting mid-motion raises
    // ALARM:3 ("reset while in motion") and locks out the pen-up/home that follows.
    await this.waitUntilStopped(3000);
    await this.sendRealtime(RT.RESET);
  }

  /** Poll status until the work position stops changing (motion halted) or timeout. */
  private async waitUntilStopped(maxMs: number): Promise<void> {
    let prev = this._lastStatus?.mpos;
    for (let waited = 0; waited < maxMs; waited += 120) {
      await delay(120);
      const cur = this._lastStatus?.mpos;
      if (cur && prev && cur.x === prev.x && cur.y === prev.y && (cur.z ?? 0) === (prev.z ?? 0)) {
        return; // position stable across two polls → motion has stopped
      }
      prev = cur;
    }
  }

  /** Stop, then lift the pen and rapid back to the work origin, ready to re-plot. */
  async stopAndReturnHome(): Promise<void> {
    await this.stop();
    await delay(300); // let the reset banner resync before queuing motion
    await this.goToWorkZero();
  }

  private abortStream(reason: string): void {
    this.paused = false;
    if (this.stream && !this.stream.aborted) {
      this.stream.aborted = true;
      this.events.emit('streamAborted', { reason });
    }
    // Drop any queued stream lines (keep non-stream commands intact).
    this.queue = this.queue.filter((p) => {
      if (p.isStream) {
        p.reject(new Error(reason));
        return false;
      }
      return true;
    });
    this.pendingComplete = false;
  }

  private finishStream(): void {
    this.pendingComplete = false;
    const done = this.stream;
    this.stream = null;
    if (done && !done.aborted) this.events.emit('streamComplete', undefined);
  }

  // ---- manual control ----

  /** Relative jog in mm at the given feed rate (mm/min). */
  jog(dx: number, dy: number, dz: number, feed: number): Promise<void> {
    const axes: string[] = [];
    if (dx) axes.push(`X${fmt(dx)}`);
    if (dy) axes.push(`Y${fmt(dy)}`);
    if (dz) axes.push(`Z${fmt(dz)}`);
    if (axes.length === 0) return Promise.resolve();
    return this.enqueueLine(`$J=G91 G21 ${axes.join(' ')} F${Math.round(feed)}`);
  }

  jogCancel(): Promise<void> {
    return this.sendRealtime(RT.JOG_CANCEL);
  }

  /** Current feed-rate override in percent (10–200). */
  get feedOverride(): number {
    return this._feedOverride;
  }

  /**
   * Step GRBL's real-time feed override toward `targetPct` (clamped 10–200%).
   * Scales the programmed feed live, so it changes the speed of an in-flight plot
   * without regenerating G-code — works during a feed-hold (pause) too, taking
   * effect on resume. GRBL has no absolute-set byte, so we apply ±10%/±1% steps.
   */
  async setFeedOverride(targetPct: number): Promise<void> {
    const target = Math.max(10, Math.min(200, Math.round(targetPct)));
    let cur = this._feedOverride;
    while (cur !== target) {
      const diff = target - cur;
      if (diff >= 10) {
        await this.sendRealtime(RT.FEED_PLUS_10);
        cur += 10;
      } else if (diff <= -10) {
        await this.sendRealtime(RT.FEED_MINUS_10);
        cur -= 10;
      } else if (diff > 0) {
        await this.sendRealtime(RT.FEED_PLUS_1);
        cur += 1;
      } else {
        await this.sendRealtime(RT.FEED_MINUS_1);
        cur -= 1;
      }
    }
    this._feedOverride = target;
  }

  /** Lower the pen onto the paper (inverted Z: down is positive), then settle. */
  async penDown(): Promise<void> {
    await this.enqueueLine(`G0 Z${fmt(this.calibration.penDownZ)}`);
    await this.enqueueLine(`G4 P${fmt(this.calibration.penDwellMs / 1000)}`);
  }

  /** Raise the pen clear of the paper, then settle. */
  async penUp(): Promise<void> {
    await this.enqueueLine(`G0 Z${fmt(this.calibration.penUpZ)}`);
    await this.enqueueLine(`G4 P${fmt(this.calibration.penDwellMs / 1000)}`);
  }

  /** Clear an alarm so motion is allowed again. */
  unlock(): Promise<void> {
    return this.enqueueLine('$X');
  }

  /** Run the GRBL homing cycle. Resolves when homing completes (`ok`). */
  home(): Promise<void> {
    return this.enqueueLine('$H');
  }

  /** True when GRBL soft limits are enabled ($20=1). */
  get softLimitsEnabled(): boolean {
    return this._settings[20] === 1;
  }

  /** Snapshot of the streaming pipeline for diagnostics/logging. */
  get streamDebug(): { inflight: number; bytes: number; queued: number } {
    return { inflight: this.inflight.length, bytes: this.inflightBytes, queued: this.queue.length };
  }

  /** True while a plot is paused (feed-hold + held feeding). */
  get isPaused(): boolean {
    return this.paused;
  }

  /** Write a GRBL `$` setting (e.g. setSetting(20, 0) → "$20=0") and update the cache. */
  async setSetting(num: number, value: number): Promise<void> {
    await this.enqueueLine(`$${num}=${value}`);
    this._settings[num] = value;
    this.events.emit('settings', { ...this._settings });
  }

  /** Set the current position as the work origin (G54 0,0,0). */
  setWorkZero(): Promise<void> {
    return this.enqueueLine('G10 L20 P1 X0 Y0 Z0');
  }

  /**
   * Declare the current physical position to be this work position (G10 L20).
   * Used to restore a remembered position after a power cycle so the operator
   * doesn't have to re-calibrate — VALID ONLY IF the gantry hasn't moved while
   * powered off (there are no limit switches to verify). Restoring the last
   * position also restores the work origin/home (the paper corner).
   */
  setWorkPosition(x: number, y: number, z: number): Promise<void> {
    return this.enqueueLine(`G10 L20 P1 X${fmt(x)} Y${fmt(y)} Z${fmt(z)}`);
  }

  /**
   * Shift the work origin by a relative offset without moving: declare the
   * current position to be `wpos + (dx, dy)` (G10 L20, Z untouched).
   *
   * Sign: dx/dy are *where the pen's mark landed relative to the printed
   * target*, in page axes (X right, Y down). If a touch commanded at X=15
   * landed 1 mm to the right of the dot, the spot the machine calls 15 is
   * truly 16, so the current position is declared 1 mm further along and the
   * origin moves 1 mm left; the next X=15 lands on the dot. Idle only — GRBL
   * rejects G10 mid-motion and a stale wpos would shift by the wrong amount.
   */
  shiftWorkZero(dx: number, dy: number): Promise<void> {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      return Promise.reject(new Error('Correction must be a number of millimetres.'));
    }
    if (this.isStreaming) return Promise.reject(new Error('Refused: a program is running.'));
    const st = this._lastStatus;
    if (!st || !this._wcoKnown) {
      return Promise.reject(new Error('No work position yet — is the plotter connected?'));
    }
    if (st.state !== 'Idle') return Promise.reject(new Error(`Machine is ${st.state}, not Idle.`));
    // WPos = MPos − WCO; the report itself may omit WCO (GRBL sends it periodically).
    const wpos = { x: st.mpos.x - this._lastWco.x, y: st.mpos.y - this._lastWco.y };
    return this.enqueueLine(`G10 L20 P1 X${fmt(wpos.x + dx)} Y${fmt(wpos.y + dy)}`);
  }

  /** Clear the work-coordinate offset so work position equals machine position. */
  resetWorkOffset(): Promise<void> {
    return this.enqueueLine('G10 L2 P1 X0 Y0 Z0');
  }

  /** Send an arbitrary line (admin/config use, e.g. FluidNC named `$` settings). */
  sendRaw(line: string): Promise<void> {
    return this.enqueueLine(line);
  }

  /** Disable the steppers (FluidNC $MD) so the gantry can be moved by hand. */
  motorsOff(): Promise<void> {
    return this.enqueueLine('$MD');
  }

  /** Lift the pen, then rapid to the work origin (work 0,0). */
  async goToWorkZero(): Promise<void> {
    await this.enqueueLine(`G0 Z${fmt(this.calibration.penUpZ)}`);
    await this.enqueueLine('G0 X0 Y0');
  }

  // ---- helpers ----

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      void this.sendRealtime(RT.STATUS).catch(() => undefined);
    }, STATUS_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private waitForBanner(timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, timeoutMs);
      this.bannerWaiters.push((seen) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(seen);
        }
      });
    });
  }

  private resolveBanner(): void {
    const waiters = this.bannerWaiters;
    this.bannerWaiters = [];
    for (const w of waiters) w(true);
  }

  /** GRBL reset cleared its buffers; reject all in-flight/queued work and resync. */
  private resyncAfterReset(): void {
    if (this.stream && !this.stream.aborted) {
      this.stream.aborted = true;
      this.events.emit('streamAborted', { reason: 'machine reset' });
    }
    for (const e of this.inflight) e.reject(new Error('reset'));
    for (const e of this.queue) e.reject(new Error('reset'));
    this.inflight = [];
    this.queue = [];
    this.inflightBytes = 0;
    this.stream = null;
    this.pendingComplete = false;
  }

  private clearPending(reason: string): void {
    this.abortStream(reason);
    for (const e of this.inflight) e.reject(new Error(reason));
    for (const e of this.queue) e.reject(new Error(reason));
    this.inflight = [];
    this.queue = [];
    this.inflightBytes = 0;
  }

  /**
   * Permanent teardown: disconnect AND drop the transport subscriptions. Only
   * for unmount/disposal — a normal disconnect() keeps the listeners so the same
   * controller can connect again without losing incoming data.
   */
  dispose(): void {
    void this.disconnect().catch(() => undefined);
    this.unsubData?.();
    this.unsubClose?.();
  }
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Strip GRBL/G-code comments (`;...` and `(...)`) and trim. */
function stripComment(line: string): string {
  return line
    .replace(/\(.*?\)/g, '')
    .replace(/;.*$/, '')
    .trim();
}
