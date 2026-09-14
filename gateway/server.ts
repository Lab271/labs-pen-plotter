import { createServer, type IncomingMessage } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, rename, readdir, mkdir, unlink, stat } from 'node:fs/promises';
import { readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { GrblController } from '../src/grbl/GrblController';
import { NodeSerialTransport } from './NodeSerialTransport';
import { isOriginAllowed, parseAllowedOrigins } from './origin';
import { DEFAULT_GATEWAY_PORT } from '../src/gateway/protocol';
import type {
  ClientMessage,
  ProjectSummary,
  Snapshot,
  StreamDebug,
  UpdateStatus,
} from '../src/gateway/protocol';
import { projectFileName, sanitizeProjectName } from '../src/plot/project';
import {
  canRestorePosition,
  MOTORS_HOLDING,
  reduceMotorPower,
  shouldDropMotors,
  type MotorPower,
  type MotorPowerEvent,
} from '../src/grbl/motorPower';
import { DEFAULT_CALIBRATION } from '../src/grbl/settings';
import {
  appSettingsFromLegacySession,
  normalizeAppSettings,
  type AppSettings,
} from '../src/gateway/appSettings';
import type { StatusReport, GrblSettings } from '../src/grbl/types';
import { APP_VERSION } from './version';

const PORT = Number(process.env.GATEWAY_PORT ?? DEFAULT_GATEWAY_PORT);
// Bind to loopback by default so the app is reachable only via an SSH tunnel
// (access control = SSH keys). Set GATEWAY_HOST=0.0.0.0 to expose on the LAN.
const HOST = process.env.GATEWAY_HOST ?? '127.0.0.1';
const DEVICE_PATH = process.env.PLOTTER_PATH; // optional explicit path
const RETRY_MS = 3000;
// Served GUI. Defaults to the source-relative dist/ for dev; the package sets
// GATEWAY_DIST=/opt/penplotter271/dist (the bundled gateway.js sits beside dist/,
// not one level up as in the source tree).
const DIST =
  process.env.GATEWAY_DIST ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
// Remembered position survives daemon AND plotter power-off (no homing on this
// machine, so position is otherwise lost every power cycle). Path override lets
// it live in a writable spot under the service user on the Pi.
const STATE_FILE =
  process.env.PLOTTER_STATE ??
  join(fileURLToPath(new URL('.', import.meta.url)), '.plotter-state.json');
// The editable session (artwork + page layout) lives on the Pi so any device
// that connects gets the current drawing back. Path override lets it live in a
// writable spot under the service user (the package sets PLOTTER_SESSION).
const SESSION_FILE =
  process.env.PLOTTER_SESSION ??
  join(fileURLToPath(new URL('.', import.meta.url)), '.session.json');
// App settings (machine setup, preferences) live here — one plotter, one setup,
// so every client that attaches adopts these. Separate from the session file on
// purpose: the artwork is replaced constantly, the machine setup almost never.
//
// Defaults are derived from the *state* file's directory, not from the bundle's,
// because the packaged app lives in a read-only /opt and its config file is a
// dpkg conffile: an upgraded Pi whose operator had edited that file would keep
// the old copy, never learn the new variable, and silently fail to write here.
// PLOTTER_STATE has been set since the first packaged release, so its directory
// is the one place known to be writable. (`UPDATE_STATUS` already does this.)
const APP_SETTINGS_FILE =
  process.env.PLOTTER_APP_SETTINGS ?? join(dirname(STATE_FILE), '.app-settings.json');
// Saved projects live on the Pi so it holds a library of plots any client can
// open — one file per project, in a directory of their own.
const PROJECTS_DIR = process.env.PLOTTER_PROJECTS ?? join(dirname(STATE_FILE), 'projects');

// ---- self-update config ----
// Where the update oneshot records its progress; the daemon reads it back after
// the restart an update causes (the WebSocket drops, so status lives in a file).
const UPDATE_STATUS_FILE =
  process.env.UPDATE_STATUS ?? join(dirname(STATE_FILE), '.update-status.json');
// GitHub repo (owner/name) whose latest Release supplies the update `.deb`.
const GITHUB_REPO = process.env.GITHUB_REPO ?? 'LAB271/labs-pen-plotter';
// The daemon can't restart its own service; it kicks this detached oneshot, which
// runs the apt-get install + restart as root. The sudoers rule scopes the user to
// exactly this command (incl. --no-block).
const UPDATE_SERVICE = 'plotter-update.service';

const transport = new NodeSerialTransport({ path: DEVICE_PATH });
const ctrl = new GrblController(transport);

// ---- persisted position (last work position + work origin) ----
interface Vec3 {
  x: number;
  y: number;
  z: number;
}
interface SavedState {
  wpos: Vec3;
  wco: Vec3;
  savedAt: string;
  /**
   * Whether this position was trustworthy when it was written. Absent on files
   * from before the motors could be powered down — those were only ever written
   * while the steppers were holding the gantry, so absent reads as `true`.
   * `false` means it was recorded on the wrong side of a power-down and must
   * never be reinstated as the work origin.
   */
  trusted?: boolean;
}
let lastWpos: Vec3 | null = null;
let lastWco: Vec3 = { x: 0, y: 0, z: 0 };
let restoredNote: string | null = null;
// Only persist once the position is trustworthy: after a restore from file, or
// after the operator sets work zero. Avoids saving a meaningless boot position.
let posReady = false;

let lastSavedKey = '';
let writing = false; // serialize async writes so 5 Hz updates can't overlap/corrupt

// Write atomically (temp file + rename) so an abrupt power-off can never leave a
// half-written/empty file — a corrupt file reads back as null and loses the home.
// The sync path additionally fsyncs, for the writes that happen as the process is
// on its way out (SIGTERM, the plotter dropping, the motors being disabled).
function writeStateSync(data: SavedState) {
  const tmp = `${STATE_FILE}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    const fd = openSync(tmp, 'r'); // fsync the data to disk before the rename
    fsyncSync(fd);
    closeSync(fd);
    renameSync(tmp, STATE_FILE);
  } catch {
    /* ignore */
  }
}

function persistState(sync = false) {
  if (!lastWpos) return;
  // Skip when unchanged (idle machine → no churn) or while a write is in flight.
  const key = `${lastWpos.x.toFixed(2)},${lastWpos.y.toFixed(2)},${lastWpos.z.toFixed(2)}`;
  if (!sync && (key === lastSavedKey || writing)) return;
  lastSavedKey = key;
  // Callers gate on `posReady`, so anything written here is an origin the
  // operator established and the steppers have held ever since.
  const data: SavedState = {
    wpos: lastWpos,
    wco: lastWco,
    savedAt: new Date().toISOString(),
    trusted: true,
  };
  if (sync) {
    writeStateSync(data);
    return;
  }
  writing = true;
  void writeFile(`${STATE_FILE}.tmp`, JSON.stringify(data, null, 2))
    .then(() => rename(`${STATE_FILE}.tmp`, STATE_FILE))
    .catch(() => undefined)
    .finally(() => {
      writing = false;
    });
}

/**
 * Mark the position on disk as no longer an origin — called the instant the
 * steppers are de-energized.
 *
 * Without this the daemon would restart hours later, read a position recorded
 * when the gantry was already free, and hand it straight to `G10 L20` as the
 * work origin. With soft limits disabled per-axis, the next plot then drives
 * into the frame. The coordinates are kept (they say where it *thought* it was,
 * which is worth having) — only the claim that they mean something is dropped.
 *
 * Written synchronously: the whole point is that it survives whatever happens
 * next, including someone pulling the plug.
 */
function invalidateSavedPosition() {
  const saved = readSavedState();
  const wpos = lastWpos ?? saved?.wpos;
  if (!wpos) return; // nothing was ever saved — nothing can be wrongly restored
  writeStateSync({
    wpos,
    wco: lastWco,
    savedAt: new Date().toISOString(),
    trusted: false,
  });
  // The dedupe key would otherwise suppress the first write after a re-zero (the
  // position has not changed yet), leaving `trusted: false` on disk.
  lastSavedKey = '';
}

function readSavedState(): SavedState | null {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as SavedState;
  } catch {
    return null;
  }
}

// ---- persisted editable session (artwork + page) ----
let session: unknown = (() => {
  try {
    return JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as unknown;
  } catch {
    return null;
  }
})();
function saveSessionBlob(blob: unknown) {
  session = blob;
  void writeFile(SESSION_FILE, JSON.stringify(blob)).catch(() => undefined);
}

// ---- persisted app settings (machine setup, preferences) ----
// `null` until the operator has saved settings at least once: the first client
// to attach then seeds them from its own, instead of everyone adopting defaults
// over a tuned setup. Everything read from disk goes through normalizeAppSettings
// (the file is operator-editable, and a garbage feed would end up in G-code).
let appSettings: AppSettings | null = (() => {
  try {
    return normalizeAppSettings(JSON.parse(readFileSync(APP_SETTINGS_FILE, 'utf8')));
  } catch {
    // No settings file yet. On a daemon upgraded from <1.3 the machine setup is
    // in the session blob (where shared calibration used to live) — lift it, so
    // the operator's tuned feeds survive the move to a settings file.
    return appSettingsFromLegacySession(session);
  }
})();

let settingsWrite: Promise<unknown> = Promise.resolve();
function saveAppSettings(raw: unknown) {
  appSettings = normalizeAppSettings(raw);
  const json = JSON.stringify(appSettings, null, 2);
  // Atomic (temp + rename), and serialized behind the previous write: this file
  // holds the pen-down Z and the feeds, so a half-written one would come back as
  // defaults and quietly plot with the wrong setup.
  const tmp = `${APP_SETTINGS_FILE}.tmp`;
  settingsWrite = settingsWrite
    .then(() => writeFile(tmp, json))
    .then(() => rename(tmp, APP_SETTINGS_FILE))
    .catch(() => undefined);
}

// ---- stored projects ----
const PROJECT_SUFFIX = '.plot.json';

/** List stored projects, newest first. Never throws: a missing directory is empty. */
async function listProjects(): Promise<ProjectSummary[]> {
  try {
    const names = await readdir(PROJECTS_DIR);
    const out: ProjectSummary[] = [];
    for (const file of names) {
      if (!file.endsWith(PROJECT_SUFFIX)) continue;
      const info = await stat(join(PROJECTS_DIR, file)).catch(() => null);
      out.push({
        name: file.slice(0, -PROJECT_SUFFIX.length),
        savedAt: info ? info.mtime.toISOString() : '',
      });
    }
    return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch {
    return [];
  }
}

/**
 * The path a project is stored at, or null if the name is unusable.
 *
 * The name arrives over the WebSocket, so it is sanitised (shared with the
 * client, and unit-tested there) and then checked *again* against the resolved
 * path: defence in depth, because this is the one place a remote string
 * becomes a filesystem path on the Pi.
 */
function projectPath(name: string): string | null {
  const safe = sanitizeProjectName(name);
  if (!safe) return null;
  const path = join(PROJECTS_DIR, projectFileName(safe));
  return path.startsWith(PROJECTS_DIR + '/') ? path : null;
}

async function broadcastProjects(): Promise<void> {
  broadcast({ type: 'event', event: 'projects', payload: await listProjects() });
}

/**
 * Restore the remembered work position after (re)connecting — a port open resets
 * the controller and (with no homing) it forgets where it is. Telling it the
 * current position equals the last saved one reinstates the work origin/home.
 * Assumes the gantry didn't move while powered off; the operator can re-calibrate
 * (Set Work Zero) if it did.
 */
async function restoreSavedPosition() {
  const saved = readSavedState();
  if (!saved?.wpos) return;
  // Recorded after the motors were powered down: the gantry was free from that
  // moment on, so this is a coordinate, not an origin. Reinstating it is exactly
  // the failure this feature exists to prevent — come up untrusted instead and
  // let the operator re-zero. (An older file has no flag and is still trusted.)
  if (!canRestorePosition(saved)) {
    setMotors({ kind: 'staleRestore' });
    restoredNote =
      `Not restoring the saved position (${saved.wpos.x.toFixed(1)}, ${saved.wpos.y.toFixed(1)}, ` +
      `saved ${saved.savedAt}): the motors were powered down after it was recorded, so the gantry ` +
      'may have moved. Re-zero at the paper’s top-left corner before plotting.';
    log(restoredNote);
    broadcast({ type: 'event', event: 'log', payload: { dir: 'info', text: restoredNote } });
    return;
  }
  try {
    // Restore X/Y (paper alignment) but zero Z: restoring the pen's last Z would
    // make "pen up" (work Z0) a negative machine Z. Work Z0 = pen-up at boot.
    await ctrl.setWorkPosition(saved.wpos.x, saved.wpos.y, 0);
  } catch (e) {
    log(`restore failed (machine not idle?): ${String((e as Error)?.message ?? e)}`);
    return; // don't claim a restore that didn't apply
  }
  posReady = true; // valid origin reinstated → safe to keep persisting
  restoredNote = `Restored last position ${saved.wpos.x.toFixed(1)}, ${saved.wpos.y.toFixed(1)} (saved ${saved.savedAt}). Re-calibrate (Set Work Zero) if the gantry was moved.`;
  log(restoredNote);
  broadcast({ type: 'event', event: 'log', payload: { dir: 'info', text: restoredNote } });
}

// ---- motor power + position trust ----
// The steppers are the only thing holding the gantry (no limit switches, no
// homing), so de-energizing them is also how the work origin gets lost. Both
// facts live here; the rules that move between them are pure and tested in
// src/grbl/motorPower.ts.
let motors: MotorPower = { ...MOTORS_HOLDING };
/** Epoch ms of the last commanded motion — what the idle timer measures from. */
let lastActivityAt = Date.now();
/** Guard so a slow `$MD` can't have a second tick queue another one behind it. */
let droppingMotors = false;

/** Apply a motor/origin event and tell every client, since there is one machine. */
function setMotors(event: MotorPowerEvent) {
  const next = reduceMotorPower(motors, event);
  if (
    next.powered === motors.powered &&
    next.posTrusted === motors.posTrusted &&
    next.reason === motors.reason
  ) {
    return; // no change (e.g. motion on an already-energized machine) → no chatter
  }
  motors = next;
  broadcast({ type: 'event', event: 'motors', payload: motors });
}

/** The configured idle period, falling back to the default when nothing is stored yet. */
function motorIdleMinutes(): number {
  return appSettings?.calibration.motorIdleMin ?? DEFAULT_CALIBRATION.motorIdleMin;
}

/**
 * De-energize the steppers and record what that costs.
 *
 * Order matters: `$MD` goes out first and the state only changes once it has,
 * because a disable that never reached the controller leaves the motors holding
 * and the origin perfectly good. Then persistence stops *before* the file is
 * invalidated, so the 5 Hz status handler cannot slip a `trusted: true` write in
 * between.
 */
async function dropMotors(event: { kind: 'idleTimeout'; minutes: number } | { kind: 'manualOff' }) {
  await ctrl.motorsOff();
  posReady = false;
  invalidateSavedPosition();
  setMotors(event);
  log(motors.reason ?? 'motors powered down');
  broadcast({ type: 'event', event: 'log', payload: { dir: 'info', text: motors.reason ?? '' } });
}

/**
 * Idle check, run on a coarse tick. The period is measured in minutes, so being
 * up to one tick late costs nothing and keeps the Pi from waking 120× an hour to
 * be punctual about something nobody is watching.
 */
const IDLE_TICK_MS = 30_000;
async function checkIdleMotors() {
  if (droppingMotors) return;
  const minutes = motorIdleMinutes();
  const due = shouldDropMotors({
    now: Date.now(),
    lastActivityAt,
    idleMinutes: minutes,
    connected,
    busy: isPlotting(),
    powered: motors.powered,
  });
  if (!due) return;
  droppingMotors = true;
  try {
    await dropMotors({ kind: 'idleTimeout', minutes });
  } catch (e) {
    // Nothing is marked: the motors are still on, so the origin is still good.
    log(`idle power-down failed: ${String((e as Error)?.message ?? e)}`);
  } finally {
    droppingMotors = false;
  }
}

// ---- daemon state (for snapshots) ----
let connected = false;
let version = 'unknown';
let lastStatus: StatusReport | null = null;
let settings: GrblSettings = {};
let controller: WebSocket | null = null; // the single client holding control
let latestVersion: string | null = null; // latest released version, best-effort
let lastUpdateStatus: UpdateStatus | null = null; // set below once log() exists

const clients = new Set<WebSocket>();
const send = (ws: WebSocket, msg: unknown) =>
  ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));
const broadcast = (msg: unknown) => clients.forEach((ws) => send(ws, msg));
const log = (text: string) => console.log(`[gateway] ${text}`);

// ---- self-update ----
function readUpdateStatus(): UpdateStatus | null {
  try {
    return JSON.parse(readFileSync(UPDATE_STATUS_FILE, 'utf8')) as UpdateStatus;
  } catch {
    return null;
  }
}
function writeUpdateStatus(s: UpdateStatus) {
  lastUpdateStatus = s;
  try {
    writeFileSync(UPDATE_STATUS_FILE, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  broadcast({ type: 'event', event: 'updateStatus', payload: s });
}
lastUpdateStatus = readUpdateStatus(); // pick up the outcome of an update that just restarted us

// dpkg restarts us *mid-install*, so the status we just read is the non-terminal
// "installing" the updater wrote before apt-get returned. The update oneshot runs
// in its own cgroup and writes the terminal success/error a moment later, but the
// WebSocket is gone so it can't push it to us — and we'd otherwise never re-read
// the file, leaving the "Updating…" banner stuck forever. Poll until it settles,
// then broadcast. No-op unless we actually booted into an in-flight update.
function pollUpdateCompletion(): void {
  const inflight = lastUpdateStatus?.state;
  if (inflight !== 'downloading' && inflight !== 'installing') return;
  const deadline = Date.now() + 120_000;
  const tick = () => {
    const s = readUpdateStatus();
    if (s && JSON.stringify(s) !== JSON.stringify(lastUpdateStatus)) {
      lastUpdateStatus = s;
      broadcast({ type: 'event', event: 'updateStatus', payload: s });
    }
    const settled = s?.state === 'success' || s?.state === 'error';
    if (!settled && Date.now() < deadline) setTimeout(tick, 1000).unref();
  };
  setTimeout(tick, 1000).unref();
}
pollUpdateCompletion();

/** True if a plot is running or paused mid-plot — used to refuse a self-update. */
function isPlotting(): boolean {
  const sd = ctrl.streamDebug;
  return (
    sd.inflight > 0 ||
    sd.queued > 0 ||
    ctrl.isPaused ||
    // Held at a pen change: idle and empty-queued, but very much mid-job. An
    // update here would restart the daemon and abort a plot that is only
    // waiting for a hand.
    ctrl.penChange !== null ||
    lastStatus?.state === 'Run' ||
    lastStatus?.state === 'Hold'
  );
}

/** Best-effort: query GitHub for the latest release version. Never throws/blocks. */
async function refreshLatestVersion() {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'penplotter271' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return;
    const body = (await res.json()) as { tag_name?: string };
    const tag = body.tag_name?.replace(/^v/, '') ?? null;
    if (tag && tag !== latestVersion) {
      latestVersion = tag;
      broadcast({
        type: 'event',
        event: 'versionInfo',
        payload: { appVersion: APP_VERSION, latestVersion },
      });
    }
  } catch {
    /* offline / rate-limited — best-effort, leave latestVersion as-is */
  }
}

/** Kick the detached update oneshot (runs apt-get install + restart as root). */
function startUpdate() {
  writeUpdateStatus({
    state: 'installing',
    fromVersion: APP_VERSION,
    toVersion: latestVersion ?? undefined,
    message: 'Starting update…',
    at: new Date().toISOString(),
  });
  // --no-block so this call returns before the oneshot restarts our service.
  const child = spawn('sudo', ['/usr/bin/systemctl', 'start', '--no-block', UPDATE_SERVICE], {
    stdio: 'ignore',
    detached: true,
  });
  child.on('error', (e) =>
    writeUpdateStatus({
      state: 'error',
      fromVersion: APP_VERSION,
      message: `Could not start the updater: ${String(e?.message ?? e)}`,
      at: new Date().toISOString(),
    }),
  );
  child.unref();
}

// ---- forward controller events to all clients ----
const fwd = (event: string) => (payload: unknown) => broadcast({ type: 'event', event, payload });

ctrl.on('connected', (e) => {
  connected = true;
  version = e.version;
  log(`plotter connected — GRBL ${e.version}`);
  fwd('connected')(e);
});
ctrl.on('disconnected', () => {
  connected = false;
  if (posReady && ctrl.wcoKnown) persistState(true); // flush the freshest position at power-off time
  // Stop persisting until the next restore. If the plotter power-cycled, it
  // reconnects reporting mpos=0 with a stale WCO; persisting that bogus position
  // (~5 Hz status) would overwrite the saved home before restoreSavedPosition()
  // can read it. restoreSavedPosition re-enables posReady once the origin is back.
  posReady = false;
  lastStatus = null;
  log('plotter disconnected');
  fwd('disconnected')(undefined);
  scheduleReconnect(); // unexpected drop → debounced retry (device re-enumerates)
});
ctrl.on('status', (s) => {
  lastStatus = s;
  // Anything actually moving is use, whoever asked for it. Without this the idle
  // clock would run from the command that *started* a two-hour plot, and the
  // motors would be due to drop the moment it finished.
  if (s.state === 'Run' || s.state === 'Jog' || isPlotting()) lastActivityAt = Date.now();
  if (s.wco) lastWco = s.wco;
  lastWpos = { x: s.mpos.x - lastWco.x, y: s.mpos.y - lastWco.y, z: s.mpos.z - lastWco.z };
  // Persist on every changed status (~5 Hz) so a mid-plot power-off restores
  // accurately; persistState dedupes unchanged positions and serializes writes.
  // Gate on wcoKnown: until the controller reports a real WCO this connection,
  // the cached offset is stale and lastWpos would be raw machine coords — saving
  // that would corrupt the home (the >5 cm Pi-reboot drift).
  if (posReady && ctrl.wcoKnown) persistState();
  broadcast({ type: 'event', event: 'status', payload: s });
  broadcast({ type: 'streamDebug', payload: ctrl.streamDebug as StreamDebug });
});
ctrl.on('settings', (s) => {
  settings = s;
  fwd('settings')(s);
});
ctrl.on('error', fwd('error'));
ctrl.on('alarm', fwd('alarm'));
ctrl.on('streamProgress', fwd('streamProgress'));
ctrl.on('streamComplete', () => fwd('streamComplete')(undefined));
ctrl.on('streamAborted', fwd('streamAborted'));
ctrl.on('penChange', (e) => {
  log(`pen change: load ${e.label || 'the next pen'}`);
  fwd('penChange')(e);
});
ctrl.on('log', fwd('log'));

// ---- connect with retry; never busy-reopen a present device ----
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void ensureConnected();
  }, RETRY_MS);
}
/** Reject if a promise doesn't settle in time — so a hung connect can't wedge the retry loop. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out`)), ms)),
  ]);
}

async function ensureConnected() {
  if (connected) return;
  try {
    // Time-box the handshake: after a USB drop the reopened port can be half-alive
    // and `$$` never gets an `ok`, hanging connect() forever (no recovery). The
    // timeout makes it fail so we clean up and retry until the real device responds.
    await withTimeout(ctrl.connect(), 12000, 'connect');
    // This machine can't home ($22=0). Soft limits then (a) lock it in "must home"
    // Alarm and (b) false-trip after a position restore, because the work area maps
    // to NEGATIVE machine coords (e.g. Y target:-51, Z target:-3) → ALARM:2. On
    // FluidNC `$20` is read-only, so disable soft limits PER-AXIS via the named
    // config (brute force, best-effort), then clear the alarm.
    log('disabling per-axis soft limits (FluidNC) — unusable without homing here');
    for (const ax of ['x', 'y', 'z']) {
      await ctrl.sendRaw(`$axes/${ax}/soft_limits=false`).catch(() => undefined);
    }
    await ctrl.unlock().catch(() => undefined); // $X — clear any boot/soft-limit alarm → Idle
    await restoreSavedPosition(); // now Idle → G10 L20 applies (syncs home + position)
  } catch (e) {
    log(`connect failed (${String((e as Error)?.message ?? e)}); retrying in ${RETRY_MS}ms`);
    await ctrl.disconnect().catch(() => undefined); // close a half-open/zombie port before retrying
    scheduleReconnect();
  }
}

function snapshot(ws: WebSocket): Snapshot {
  return {
    connected,
    version,
    appVersion: APP_VERSION,
    latestVersion,
    update: lastUpdateStatus,
    status: lastStatus,
    settings,
    streamDebug: ctrl.streamDebug as StreamDebug,
    inControl: controller === ws,
    paused: ctrl.isPaused,
    restoredNote,
    session,
    appSettings,
    penChange: ctrl.penChange,
    // Filled in by the caller: listing the directory is async, and a snapshot
    // has to be ready the moment a client attaches.
    projects: knownProjects,
    motors,
  };
}

// Cached listing, refreshed whenever a project is written or removed.
let knownProjects: ProjectSummary[] = [];

function releaseControlOnClose(ws: WebSocket) {
  clients.delete(ws);
  if (controller === ws) {
    controller = clients.values().next().value ?? null; // hand control to the next client
    if (controller) send(controller, { type: 'control', inControl: true });
    log('control released');
  }
}

/**
 * Commands that mean the operator is standing at the machine using it. Only
 * these reset the idle clock: a browser that autosaves its session every couple
 * of seconds would otherwise hold the steppers energized forever, which is the
 * whole thing this change is trying to stop.
 */
const ACTIVITY_COMMANDS = new Set<ClientMessage['cmd']>([
  'plot',
  'resume',
  'stop',
  'jog',
  'penUp',
  'penDown',
  'goToWorkZero',
  'setWorkZero',
  'continueProgram',
  'unlock',
]);

/**
 * The subset that actually drives the steppers, which is what brings them back
 * after a `$MD` (FluidNC re-energizes on motion). `setWorkZero` and `unlock` are
 * not here on purpose: they write an offset and clear an alarm. Reporting the
 * gantry as held because of either would tell the operator it is safe to walk
 * away from a machine that is still free to be pushed.
 */
const MOVES_THE_MACHINE = new Set<ClientMessage['cmd']>([
  'plot',
  'resume',
  'jog',
  'penUp',
  'penDown',
  'goToWorkZero',
  'continueProgram',
]);

/**
 * Commands whose meaning depends on the work origin. Refused while the position
 * is untrusted — in the daemon, not in the browser, because there can be several
 * browsers and only one gantry. Jog is deliberately absent: the operator needs it
 * to reach the corner, and the motion is fine, it is the numbers that are fiction.
 */
const NEEDS_TRUSTED_POSITION = new Set<ClientMessage['cmd']>(['plot', 'goToWorkZero']);

async function handleCommand(ws: WebSocket, msg: ClientMessage) {
  const id = msg.id;
  if (controller !== ws) {
    send(ws, { type: 'cmdError', id, message: 'Another operator is in control.' });
    return;
  }
  if (!motors.posTrusted && NEEDS_TRUSTED_POSITION.has(msg.cmd)) {
    send(ws, {
      type: 'cmdError',
      id,
      message: `Refused: ${motors.reason} Move the head to the paper’s top-left corner and set home (Calibrate) first.`,
    });
    return;
  }
  if (ACTIVITY_COMMANDS.has(msg.cmd)) lastActivityAt = Date.now();
  // Commanding a move re-energizes the steppers. It says nothing about the
  // origin — only a human at the paper's corner can restore that.
  if (MOVES_THE_MACHINE.has(msg.cmd)) setMotors({ kind: 'motion' });
  try {
    switch (msg.cmd) {
      case 'plot':
        ctrl.streamProgram(msg.gcode);
        break;
      case 'pause':
        ctrl.pause();
        break;
      case 'resume':
        ctrl.resume();
        break;
      case 'stop':
        // Stop always stops. But `stopAndReturnHome` is two actions welded
        // together, and while the origin is unknown the second one is a rapid to
        // a coordinate nothing has measured — so run the abort on its own.
        if (motors.posTrusted) await ctrl.stopAndReturnHome();
        else await ctrl.stop();
        break;
      case 'jog':
        await ctrl.jog(msg.dx, msg.dy, msg.dz, msg.feed);
        break;
      case 'jogCancel':
        await ctrl.jogCancel();
        break;
      case 'feedOverride':
        await ctrl.setFeedOverride(msg.percent);
        break;
      case 'penUp':
        await ctrl.penUp();
        break;
      case 'penDown':
        await ctrl.penDown();
        break;
      case 'setWorkZero':
        await ctrl.setWorkZero();
        posReady = true;
        // `G10 L20 P1 X0 Y0 Z0` *defines* this spot as work zero, so the work
        // position is 0,0,0 by construction. Say so rather than persisting the
        // pre-calibration reading that `lastWpos` still holds until the next
        // status arrives (~200 ms) — that value would restore a wrong origin if
        // the daemon died in between, which is the whole hazard here.
        lastWpos = { x: 0, y: 0, z: 0 };
        persistState();
        // The one thing that restores trust: a person put the head on the corner
        // and said so. Nothing the machine can do on its own counts.
        setMotors({ kind: 'setWorkZero' });
        break;
      case 'goToWorkZero':
        await ctrl.goToWorkZero();
        break;
      case 'motorsOff':
        // Deliberately identical to the idle timeout: the operator switching the
        // motors off frees the gantry exactly as the timer does, and the origin
        // is exactly as gone.
        await dropMotors({ kind: 'manualOff' });
        break;
      case 'unlock':
        await ctrl.unlock();
        break;
      case 'setSetting':
        await ctrl.setSetting(msg.num, msg.value);
        break;
      case 'setCalibration':
        ctrl.calibration = msg.calibration;
        break;
      case 'saveSession':
        saveSessionBlob(msg.session);
        break;
      case 'continueProgram':
        ctrl.continueProgram();
        break;
      case 'saveProject': {
        const path = projectPath(msg.name);
        if (!path) {
          send(ws, { type: 'cmdError', id, message: 'That project name cannot be used.' });
          return;
        }
        await mkdir(PROJECTS_DIR, { recursive: true });
        // Atomic: a project half-written by a power cut would be unopenable,
        // and the operator would not know until they came to plot it.
        const tmp = `${path}.tmp`;
        await writeFile(tmp, JSON.stringify(msg.project));
        await rename(tmp, path);
        knownProjects = await listProjects();
        await broadcastProjects();
        break;
      }
      case 'loadProject': {
        const path = projectPath(msg.name);
        if (!path) {
          send(ws, { type: 'cmdError', id, message: 'No such project.' });
          return;
        }
        const raw = await readFile(path, 'utf8').catch(() => null);
        if (raw === null) {
          send(ws, { type: 'cmdError', id, message: `No project named "${msg.name}".` });
          return;
        }
        // Only to the client that asked: opening a project replaces what is on
        // screen, which is not something to do to another operator's session.
        send(ws, {
          type: 'event',
          event: 'projectLoaded',
          payload: { name: msg.name, project: JSON.parse(raw) },
        });
        break;
      }
      case 'deleteProject': {
        const path = projectPath(msg.name);
        if (!path) {
          send(ws, { type: 'cmdError', id, message: 'No such project.' });
          return;
        }
        await unlink(path).catch(() => undefined);
        knownProjects = await listProjects();
        await broadcastProjects();
        break;
      }
      case 'saveAppSettings':
        saveAppSettings(msg.settings);
        // Push to the *other* clients so every device shows one setup. Echoing
        // it back to the sender would fight its own local edit (and loop).
        for (const c of clients) {
          if (c !== ws) send(c, { type: 'event', event: 'appSettings', payload: appSettings });
        }
        break;
      case 'update':
        if (isPlotting()) {
          send(ws, { type: 'cmdError', id, message: 'Refused: a plot is running.' });
          return;
        }
        startUpdate();
        break;
      default:
        send(ws, { type: 'cmdError', id, message: `Unknown command` });
        return;
    }
    send(ws, { type: 'ack', id }); // round-trip ack — paces the client's held jog
  } catch (e) {
    send(ws, { type: 'cmdError', id, message: String((e as Error)?.message ?? e) });
  }
}

// ---- static GUI + WebSocket on one HTTP server ----
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  // A lazily-loaded chunk (the PDF worker) is served as .mjs. Browsers refuse
  // to execute a module served as application/octet-stream, so without this the
  // feature fails only in the packaged build — never in the dev server.
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
};
const httpServer = createServer(async (req, res) => {
  try {
    const url = (req.url ?? '/').split('?')[0];
    const rel = url === '/' ? 'index.html' : normalize(url).replace(/^(\.\.[/\\])+/, '');
    const file = join(DIST, rel);
    const body = await readFile(file).catch(() => readFile(join(DIST, 'index.html'))); // SPA fallback
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found (build the GUI with `npm run build`).');
  }
});

// Reject cross-origin handshakes. There is no auth on this socket, so without
// this any web page a user on the network opens could take control of the
// machine from their browser. See gateway/origin.ts for the rules.
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.GATEWAY_ALLOWED_ORIGINS);
const wss = new WebSocketServer({
  server: httpServer,
  verifyClient: ({ origin, req }: { origin: string; secure: boolean; req: IncomingMessage }) => {
    if (isOriginAllowed(origin, req.headers.host, ALLOWED_ORIGINS)) return true;
    console.warn(`[gateway] rejected WebSocket handshake from origin ${origin}`);
    return false;
  },
});

// Keepalive: ping each client every 30 s and drop ones that don't pong. Keeps
// the browser↔Pi link alive through router/WiFi idle timeouts and reaps dead
// sockets (so a laptop that slept doesn't linger as a phantom controller).
const alive = new WeakSet<WebSocket>();
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) {
      ws.terminate();
      continue;
    }
    alive.delete(ws); // expect a pong before the next tick
    ws.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

wss.on('connection', (ws) => {
  clients.add(ws);
  alive.add(ws);
  ws.on('pong', () => alive.add(ws));
  if (!controller) controller = ws; // first client holds control
  send(ws, { type: 'snapshot', payload: snapshot(ws) });
  log(
    `client connected (${clients.size} total)${controller === ws ? ' — in control' : ' — read-only'}`,
  );

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      send(ws, { type: 'cmdError', message: 'Malformed message' });
      return;
    }
    if (msg?.type === 'cmd') void handleCommand(ws, msg);
  });
  ws.on('close', () => {
    releaseControlOnClose(ws);
    log(`client disconnected (${clients.size} total)`);
  });
});

// Keep macOS awake for the daemon's lifetime. When the laptop is left idle the
// OS throttles/suspends the process (App Nap) and dims the display (which also
// throttles the browser tab) — the plot then stalls. `caffeinate -w <pid>` holds
// idle/display/system-sleep assertions until this process exits. No-op elsewhere
// (the Pi should disable sleep at the OS level instead).
function preventIdleSleep() {
  if (process.platform !== 'darwin') return;
  try {
    const c = spawn('caffeinate', ['-dimsu', '-w', String(process.pid)], { stdio: 'ignore' });
    c.on('error', () =>
      log('caffeinate unavailable — run `caffeinate -dimsu npm run gateway` manually'),
    );
    log('caffeinate engaged — Mac will not idle-sleep while the daemon runs');
  } catch {
    log('could not start caffeinate');
  }
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    if (posReady && ctrl.wcoKnown) persistState(true); // save the latest position synchronously before exiting
    void transport.close().finally(() => process.exit(0));
  });
}

void listProjects().then((list) => {
  knownProjects = list;
});

httpServer.listen(PORT, HOST, () => {
  log(`PenPlotter271 gateway v${APP_VERSION}`);
  log(
    `listening on http://${HOST}:${PORT}  (GUI + WebSocket)${HOST === '127.0.0.1' ? ' — loopback only; reach it via an SSH tunnel' : ''}`,
  );
  preventIdleSleep();
  void ensureConnected();
  // Best-effort latest-release lookup: once on boot, then every 6 h. Non-blocking.
  void refreshLatestVersion();
  setInterval(() => void refreshLatestVersion(), 6 * 60 * 60 * 1000);
  // Idle motor power-down. Started here rather than at module load so it never
  // ticks in a process that failed to come up.
  setInterval(() => void checkIdleMotors(), IDLE_TICK_MS);
});
