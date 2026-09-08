import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GatewayClient } from '../transport/GatewayClient';
import { Calibration } from '../grbl/settings';
import { StatusReport, type GrblSettings } from '../grbl/types';
import { loadCalibration, saveCalibration } from './calibrationStore';
import { loadSession, saveSession, type Session, type PersistedArt } from './sessionStore';
import { flattenSvg, ABORTED } from '../plot/svg';
import { imageToField, traceField, type FieldSource } from '../plot/raster';
import { applyDetail } from '../plot/detail';
import { estimatePlotTime, formatDuration, generateGcode } from '../plot/gcode';
import {
  actualSizePlacement,
  anchorPlacement,
  bounds,
  fitPlacement,
  placePolylines,
} from '../plot/place';
import { PAPER_SIZES, paperDims } from '../plot/paper';
import type { Artwork, Placement, Polyline } from '../plot/types';
import {
  type ArtControls,
  DEFAULT_CONTROLS,
  CONTROL_RANGES,
  SOURCE_KEYS,
  normalizeControls,
} from '../plot/controls';
import { PlotCanvas } from './PlotCanvas';
import { Logo } from './Logo';
import type { UpdateStatus } from '../gateway/protocol';

type Orientation = 'landscape' | 'portrait';

/** True if release version `latest` is strictly newer than `current` (semver-ish). */
function isNewerVersion(latest: string | null, current: string): boolean {
  if (!latest || !current || current === 'unknown') return false;
  const a = latest.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

// Artwork is flattened/traced once at full detail (the "master"); the detail
// slider thins it live for both the preview and the plot. 0.2 mm is finer than
// any pen tip — going finer just slows import (more getPointAtLength sampling).
const MASTER_TOLERANCE_MM = 0.2;
const MASTER_MAXDIM = 600;
// Abort a plot if the machine sits Idle this long without acking the next line.
const STALL_MS = 20000;
// Declare the link dead if no serial data arrives for this long during a plot
// (status normally arrives ~10×/s, so multi-second silence means it's gone).
const LINK_DEAD_MS = 5000;

/** The retained source of an artwork, kept in memory so source controls can
 * re-derive the master live (not persisted — large, and the master is saved). */
type ArtSource = { kind: 'svg'; text: string } | { kind: 'png'; field: FieldSource };

/** An artwork placed on the page (multiple may share the paper). */
interface PlacedArt {
  id: string;
  name: string;
  kind: 'svg' | 'png';
  /** Full-detail flattened polylines (paper-mm, normalized to origin). */
  master: Polyline[];
  widthMm: number;
  heightMm: number;
  placement: Placement;
  /** Per-artwork drawing controls. */
  controls: ArtControls;
}

/** Fill kind/controls defaults so sessions saved before they existed still load. */
function normalizeArt(p: PersistedArt): PlacedArt {
  return { ...p, kind: p.kind ?? 'svg', controls: normalizeControls(p.controls) };
}

export function App() {
  const ctrlRef = useRef<GatewayClient | null>(null);
  const heldRef = useRef(false);
  const canvasBox = useRef<HTMLDivElement>(null);
  const size = useElementSize(canvasBox);

  // Smooth progress: accumulate XY distance the pen actually travels vs total path.
  const plottingRef = useRef(false);
  const traveledRef = useRef(0);
  const lastMposRef = useRef<{ x: number; y: number } | null>(null);
  const plotTotalRef = useRef(0);
  const [progressFrac, setProgressFrac] = useState(0);

  // Stall watchdog: if the machine sits Idle mid-plot with no progress, abort.
  const lastTxRef = useRef('');
  const ackedRef = useRef(0);
  const ackChangedAtRef = useRef(0);
  const stallHandledRef = useRef(false);
  const pausedRef = useRef(false);
  const totalRef = useRef(0);

  // Diagnostic log: a ring buffer kept in a ref (no re-render on write) plus a
  // mirror to the console. Survives a UI freeze so the last events are visible.
  const logRef = useRef<string[]>([]);
  const lastRxRef = useRef(0);
  const statusStateRef = useRef('—');
  const [showLog, setShowLog] = useState(false);
  const [logText, setLogText] = useState('');
  const pushLog = useCallback((tag: string, text: string) => {
    const t = new Date();
    const ts =
      `${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}` +
      `.${String(t.getMilliseconds()).padStart(3, '0')}`;
    const line = `${ts} ${tag} ${text}`;
    const buf = logRef.current;
    buf.push(line);
    if (buf.length > 1000) buf.splice(0, buf.length - 1000);
    console.log(line);
  }, []);

  const [connected, setConnected] = useState(false);
  const [version, setVersion] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [status, setStatus] = useState<StatusReport | null>(null);
  const [progress, setProgress] = useState<{ acked: number; total: number } | null>(null);
  // Machine motion limits read from GRBL settings ($120/$121 accel, $11 junction
  // deviation), used to estimate plot time with realistic accel/cornering.
  const [motion, setMotion] = useState<{ accel?: number; jdev?: number }>({});
  const [alert, setAlert] = useState('');
  const [cal, setCal] = useState<Calibration>(loadCalibration);

  // Restore the editable session (artwork + page) so reopening the tab / reloading
  // after a reconnect keeps the drawing — it's browser state, not on the daemon.
  const [restored] = useState(loadSession);

  const [jogStep, setJogStep] = useState(10);
  const [items, setItems] = useState<PlacedArt[]>(() => (restored?.items ?? []).map(normalizeArt));
  const [selectedId, setSelectedId] = useState<string | null>(restored?.selectedId ?? null);
  const idRef = useRef(restored?.nextId ?? 0);
  // Retained sources (in memory only) keyed by artwork id, so source controls can
  // re-derive the master without re-importing. Absent after a reload (master kept).
  const sourcesRef = useRef(new Map<string, ArtSource>());
  // Latest items, for the debounced re-derivation to read current controls.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const deriveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Abort token for the in-flight SVG flatten (import or re-derive). Starting a new
  // one flips the previous token's `aborted`, so the superseded run bails out at its
  // next yield instead of wasting cycles or clobbering newer state.
  const flattenAbort = useRef<{ aborted: boolean }>({ aborted: false });
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  // True while a plot is streaming — locks placement + drawing controls.
  const [plotting, setPlotting] = useState(false);
  // Plotting-speed override (% of programmed feed); applied live via the daemon.
  const [speedPct, setSpeedPct] = useState(100);
  // Don't push to the daemon until we've synced with its stored session on connect
  // (avoids a stale local push overwriting a newer session from another device).
  const sessionLoadedRef = useRef(false);
  const [paperIdx, setPaperIdx] = useState(restored?.paperIdx ?? 2); // A2
  const [orientation, setOrientation] = useState<Orientation>(restored?.orientation ?? 'landscape');
  const [useCustomPaper, setUseCustomPaper] = useState(restored?.useCustomPaper ?? false);
  const [customPaper, setCustomPaper] = useState(
    restored?.customPaper ?? { widthMm: 600, heightMm: 400 },
  );

  useEffect(() => {
    const ctrl = new GatewayClient();
    ctrlRef.current = ctrl;
    ctrl.calibration = cal;
    const unsubs = [
      ctrl.on('connected', (e) => {
        setConnected(true);
        setVersion(e.version);
        setMotion(readMotion(ctrl.settings)); // settings arrive with the snapshot
        setAlert('');
        pushLog('SYS', `connected — GRBL ${e.version}`);
      }),
      ctrl.on('settings', (s) => setMotion(readMotion(s))),
      ctrl.on('versionInfo', (e) => {
        setAppVersion(e.appVersion);
        setLatestVersion(e.latestVersion);
      }),
      ctrl.on('updateStatus', (s) => setUpdateStatus(s)),
      ctrl.on('disconnected', () => {
        setConnected(false);
        setStatus(null);
        setProgress(null);
        heldRef.current = false; // stop any in-progress press-and-hold jog loop
        plottingRef.current = false;
        setPlotting(false);
        setSpeedPct(100);
        pushLog('SYS', 'disconnected');
      }),
      ctrl.on('status', (s) => {
        setStatus(s);
        statusStateRef.current = s.state;
        lastRxRef.current = Date.now();
        if (plottingRef.current) {
          const last = lastMposRef.current;
          if (last) traveledRef.current += Math.hypot(s.mpos.x - last.x, s.mpos.y - last.y);
          lastMposRef.current = { x: s.mpos.x, y: s.mpos.y };
          setProgressFrac(
            plotTotalRef.current > 0 ? Math.min(1, traveledRef.current / plotTotalRef.current) : 0,
          );
          // Watchdog: machine Idle but the plot hasn't advanced → it's wedged.
          // Skipped while paused (a held plot legitimately makes no progress).
          if (
            !stallHandledRef.current &&
            !pausedRef.current &&
            s.state === 'Idle' &&
            Date.now() - ackChangedAtRef.current > STALL_MS
          ) {
            stallHandledRef.current = true;
            plottingRef.current = false;
            const msg = `Plot stalled at line ${ackedRef.current} (last sent: ${lastTxRef.current || '—'}). Lifting the pen and returning home.`;
            pushLog('STALL', msg);
            setAlert(msg);
            void ctrl.stopAndReturnHome().catch(() => undefined);
          }
        }
      }),
      ctrl.on('log', (e) => {
        if (e.dir === 'tx') {
          lastTxRef.current = e.text;
          pushLog('TX', e.text);
        } else {
          lastRxRef.current = Date.now();
          // Skip the 10 Hz status reports ('<...>'); log acks/errors/messages.
          if (!e.text.startsWith('<')) pushLog('RX', e.text);
        }
      }),
      ctrl.on('streamProgress', (p) => {
        setProgress(p);
        totalRef.current = p.total;
        if (p.acked !== ackedRef.current) {
          ackedRef.current = p.acked;
          ackChangedAtRef.current = Date.now();
        }
      }),
      ctrl.on('streamComplete', () => {
        plottingRef.current = false;
        setPlotting(false);
        setProgress(null);
        setProgressFrac(1);
        setAlert('Plot complete.');
        pushLog('SYS', 'plot complete');
      }),
      ctrl.on('streamAborted', (e) => {
        plottingRef.current = false;
        setPlotting(false);
        setProgress(null);
        setAlert(`Stream aborted: ${e.reason}`);
        pushLog('ABORT', e.reason);
      }),
      ctrl.on('error', (e) => {
        setAlert(`error:${e.code} on "${e.line}"`);
        pushLog('ERR', `error:${e.code} on "${e.line}"`);
      }),
      ctrl.on('session', (data) => {
        // Daemon's stored artwork/page is authoritative — restore it on connect so
        // any device sees the current drawing. (null = daemon has none yet.)
        const s = data as Session | null;
        if (s && Array.isArray(s.items)) {
          setItems((s.items as PersistedArt[]).map(normalizeArt));
          setSelectedId(s.selectedId ?? null);
          if (typeof s.nextId === 'number') idRef.current = Math.max(idRef.current, s.nextId);
          if (typeof s.paperIdx === 'number') setPaperIdx(s.paperIdx);
          if (s.orientation) setOrientation(s.orientation);
          if (typeof s.useCustomPaper === 'boolean') setUseCustomPaper(s.useCustomPaper);
          if (s.customPaper) setCustomPaper(s.customPaper);
          // Adopt the shared calibration (pen Z + feeds incl. draw speed) so a plot
          // started from this device uses the same setup as the laptop — the plot's
          // G-code is generated here from `cal`, so without this a phone would bake
          // in its own (default, slow) feeds.
          if (s.calibration) setCal((prev) => ({ ...prev, ...s.calibration }));
        }
        sessionLoadedRef.current = true; // now safe to push local edits to the daemon
      }),
      ctrl.on('alarm', (e) => {
        setAlert(`ALARM:${e.code} — unlock ($X) or reset.`);
        pushLog('ALARM', `ALARM:${e.code}`);
      }),
    ];
    void ctrl.connect(); // auto-attach to the daemon on load
    return () => {
      unsubs.forEach((u) => u());
      void ctrl.disconnect();
    };
  }, []);

  useEffect(() => {
    if (ctrlRef.current) ctrlRef.current.calibration = cal;
    saveCalibration(cal);
  }, [cal]);

  // Persist the editable session: always to localStorage (instant, offline), and
  // to the daemon (lives on the Pi, any device) once we've synced its session.
  useEffect(() => {
    const blob: Session = {
      items,
      selectedId,
      nextId: idRef.current,
      paperIdx,
      orientation,
      useCustomPaper,
      customPaper,
      calibration: cal,
    };
    saveSession(blob);
    if (sessionLoadedRef.current) ctrlRef.current?.saveSession(blob);
  }, [items, selectedId, paperIdx, orientation, useCustomPaper, customPaper, cal]);

  // (Device reconnection is now owned by the gateway daemon; the browser client
  // auto-reattaches its WebSocket. No browser-side Web Serial reconnect needed.)

  // Refresh the visible log a few times a second only while the panel is open.
  useEffect(() => {
    if (!showLog) return;
    const tick = () => setLogText(logRef.current.join('\n'));
    tick();
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, [showLog]);

  // Timer-based heartbeat — fires from a timer, NOT from serial reads, so it
  // keeps logging even if reads die. If these stop, the JS thread itself froze;
  // if they continue while `rxAge` grows, the serial read pipeline died.
  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => {
      if (!plottingRef.current) return;
      const c = ctrlRef.current;
      if (!c) return;
      const d = c.streamDebug;
      const rxAge = Date.now() - lastRxRef.current;
      pushLog(
        'HB',
        `state=${statusStateRef.current} acked=${ackedRef.current}/${totalRef.current} ` +
          `inflight=${d.inflight} bytes=${d.bytes} queued=${d.queued} ` +
          `rxAge=${rxAge}ms${pausedRef.current ? ' [paused]' : ''}`,
      );
      // Dead-link detector: runs from this timer (not serial reads), so it fires
      // even when the machine goes silent. Polling stays on during a soft pause,
      // so any multi-second silence — even mid-pause — is a real dead link.
      if (!stallHandledRef.current && rxAge > LINK_DEAD_MS) {
        stallHandledRef.current = true;
        plottingRef.current = false;
        const msg =
          `Lost contact with the machine — no response for ${Math.round(rxAge / 1000)}s ` +
          `(acked ${ackedRef.current}/${totalRef.current}, last sent: ${lastTxRef.current || '—'}). ` +
          'Press Disconnect, then Connect, and re-plot.';
        pushLog('DEADLINK', msg);
        setAlert(msg);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [connected, pushLog]);

  const ctrl = () => ctrlRef.current;
  const bedW = cal.workAreaX;
  const bedH = cal.workAreaY;
  const paper = useCustomPaper
    ? { widthMm: customPaper.widthMm, heightMm: customPaper.heightMm }
    : paperDims(PAPER_SIZES[paperIdx], orientation);
  const wco = status?.wco;
  const penPos = status
    ? wco
      ? { x: status.mpos.x - wco.x, y: status.mpos.y - wco.y }
      : { x: status.mpos.x, y: status.mpos.y }
    : null;

  async function run(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      setAlert(String((e as Error).message ?? e));
    }
  }

  async function onConnect() {
    setAlert('');
    await run(() => ctrl()!.connect());
  }

  // One discrete jog of exactly `jogStep` mm per click. (The old press-and-hold
  // loop cancelled the jog on release, which truncated the move — so the set
  // step distance was never honoured. Click again to step further.)
  function jogBy(dx: number, dy: number) {
    const c = ctrl();
    if (!c || !connected) return;
    void c.jog(dx * jogStep, dy * jogStep, 0, cal.jogFeed).catch(() => undefined);
  }

  function addArtwork(
    name: string,
    kind: 'svg' | 'png',
    art: Artwork,
    controls: ArtControls,
    source: ArtSource,
  ) {
    const id = `art${++idRef.current}`;
    sourcesRef.current.set(id, source);
    const placement = fitPlacement(art.widthMm, art.heightMm, 0, paper.widthMm, paper.heightMm);
    setItems((list) => [
      ...list,
      {
        id,
        name,
        kind,
        master: art.polylines,
        widthMm: art.widthMm,
        heightMm: art.heightMm,
        placement,
        controls,
      },
    ]);
    setSelectedId(id);
  }

  async function onLoadSvg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;
    const signal = (flattenAbort.current = { aborted: false });
    try {
      const text = await file.text();
      const controls: ArtControls = { ...DEFAULT_CONTROLS, samplingMm: MASTER_TOLERANCE_MM };
      setAlert('Importing SVG…');
      const { artwork: art, skipped } = await flattenSvg(text, controls.samplingMm, {
        signal,
        onProgress: (done, total) =>
          setAlert(`Importing SVG… ${total ? Math.round((100 * done) / total) : 0}%`),
      });
      if (art.polylines.length === 0) {
        setAlert(
          'No plottable stroke geometry in that SVG (it is likely fill-based). ' +
            'Export it as a PNG and use “Upload PNG” instead.',
        );
        return;
      }
      addArtwork(file.name, 'svg', art, controls, { kind: 'svg', text });
      setAlert(
        skipped > 0
          ? `Imported. ${skipped} element(s) skipped (hidden layers, fills, or text).`
          : '',
      );
    } catch (err) {
      if (err === ABORTED) return; // superseded by a newer import — stay quiet
      setAlert(String((err as Error).message ?? err));
    }
  }

  async function onLoadPng(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAlert('Tracing image…');
    try {
      const field = await imageToField(file, MASTER_MAXDIM);
      const controls: ArtControls = {
        ...DEFAULT_CONTROLS,
        threshold: cal.pngThreshold,
        levels: cal.pngLevels,
      };
      const { artwork: art } = traceField(field, {
        threshold: controls.threshold,
        levels: controls.levels,
        invert: controls.invert,
        contrast: controls.contrast,
        toleranceMm: MASTER_TOLERANCE_MM,
      });
      if (art.polylines.length === 0) {
        setAlert('No contours found — try a higher threshold or a higher-contrast image.');
        return;
      }
      addArtwork(file.name, 'png', art, controls, { kind: 'png', field });
      setAlert('');
    } catch (err) {
      setAlert(String((err as Error).message ?? err));
    }
  }

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;
  // Source-stage controls are disabled while plotting (locked) or when the source
  // wasn't retained (after a reload — the master is kept, geometry controls still work).
  const sourceAvailable = !!selectedItem && sourcesRef.current.has(selectedItem.id);
  const srcLocked = !selectedItem || plotting || !sourceAvailable;

  // Apply each artwork's detail control to its master → what is previewed and plotted.
  const displayItems = useMemo(
    () =>
      items.map((i) => ({
        id: i.id,
        polylines: applyDetail(i.master, i.controls.detail),
        placement: i.placement,
        w: i.widthMm,
        h: i.heightMm,
      })),
    [items],
  );
  const selectedStrokes = displayItems.find((d) => d.id === selectedId)?.polylines.length ?? 0;

  // Estimated total plot time for the currently placed artwork (recomputed when
  // the artwork, layout, or feeds change). Walks the program the same placement
  // would generate, so it reflects the feeds, segment count, and stroke order.
  const totalEstSec = useMemo(() => {
    if (displayItems.length === 0) return 0;
    const placed = displayItems.flatMap((i) => placePolylines(i.polylines, i.placement));
    const gc = generateGcode(placed, {
      penUpZ: cal.penUpZ,
      penDownZ: cal.penDownZ,
      dwellMs: cal.penDwellMs,
      drawFeed: cal.drawFeed,
      travelFeed: cal.travelFeed,
    });
    return estimatePlotTime(gc, motion);
  }, [displayItems, cal, motion]);

  const updatePlacement = useCallback((id: string, pl: Placement) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, placement: pl } : i)));
  }, []);

  // Re-derive an artwork's master from its retained source at its current controls.
  // Expensive (re-trace / re-flatten) — called debounced from scheduleDerive.
  async function deriveMaster(id: string) {
    const src = sourcesRef.current.get(id);
    const it = itemsRef.current.find((i) => i.id === id);
    if (!src || !it) return;
    const signal = (flattenAbort.current = { aborted: false });
    try {
      const c = it.controls;
      const art =
        src.kind === 'svg'
          ? (await flattenSvg(src.text, c.samplingMm, { signal })).artwork
          : traceField(src.field, {
              threshold: c.threshold,
              levels: c.levels,
              invert: c.invert,
              contrast: c.contrast,
              toleranceMm: MASTER_TOLERANCE_MM,
            }).artwork;
      setItems((list) =>
        list.map((i) =>
          i.id === id
            ? { ...i, master: art.polylines, widthMm: art.widthMm, heightMm: art.heightMm }
            : i,
        ),
      );
    } catch (e) {
      if (e === ABORTED) return; // superseded by a newer derive/import — stay quiet
      setAlert(String((e as Error).message ?? e));
    }
  }

  function scheduleDerive(id: string) {
    if (!sourcesRef.current.has(id)) return; // source dropped (e.g. after a reload)
    setUpdatingId(id);
    if (deriveTimer.current) clearTimeout(deriveTimer.current);
    deriveTimer.current = setTimeout(async () => {
      await deriveMaster(id);
      setUpdatingId((cur) => (cur === id ? null : cur));
    }, 200);
  }

  // Update one control. Source-stage changes re-derive the master (debounced);
  // geometry-stage changes (detail) just re-thin the cached master, immediately.
  function setControl<K extends keyof ArtControls>(id: string, key: K, value: ArtControls[K]) {
    setItems((list) =>
      list.map((i) => (i.id === id ? { ...i, controls: { ...i.controls, [key]: value } } : i)),
    );
    if ((SOURCE_KEYS as string[]).includes(key as string)) scheduleDerive(id);
  }

  function removeItem(id: string) {
    flattenAbort.current.aborted = true; // stop any in-flight derive/import work
    sourcesRef.current.delete(id);
    setItems((list) => list.filter((i) => i.id !== id));
    setSelectedId((sel) => (sel === id ? null : sel));
  }
  function fitToCorner() {
    if (!selectedItem) return;
    updatePlacement(
      selectedItem.id,
      anchorPlacement(selectedItem.widthMm, selectedItem.heightMm, selectedItem.placement),
    );
  }
  function fitToPaper() {
    if (!selectedItem) return;
    const { widthMm, heightMm } = selectedItem;
    updatePlacement(
      selectedItem.id,
      fitPlacement(
        widthMm,
        heightMm,
        selectedItem.placement.rotation,
        paper.widthMm,
        paper.heightMm,
      ),
    );
  }
  function actualSize() {
    if (!selectedItem) return;
    updatePlacement(
      selectedItem.id,
      actualSizePlacement(selectedItem.widthMm, selectedItem.heightMm, selectedItem.placement),
    );
  }
  function rotate90() {
    if (!selectedItem) return;
    const rotation = (selectedItem.placement.rotation + 90) % 360;
    const { widthMm, heightMm } = selectedItem;
    // Re-anchor so the rotated box stays on the page (operator then fits-to-paper).
    updatePlacement(
      selectedItem.id,
      anchorPlacement(widthMm, heightMm, { ...selectedItem.placement, rotation }),
    );
  }

  function onPlot() {
    const c = ctrl();
    if (!c || items.length === 0) return;
    const placed = displayItems.flatMap((i) => placePolylines(i.polylines, i.placement));
    const b = bounds(placed);
    if (b.minX < -0.01 || b.minY < -0.01 || b.maxX > bedW + 0.01 || b.maxY > bedH + 0.01) {
      setAlert('Artwork is outside the work area — scale or move it to fit before plotting.');
      return;
    }
    const gc = generateGcode(placed, {
      penUpZ: cal.penUpZ,
      penDownZ: cal.penDownZ,
      dwellMs: cal.penDwellMs,
      drawFeed: cal.drawFeed,
      travelFeed: cal.travelFeed,
    });
    plotTotalRef.current = gcodeXYLength(gc);
    traveledRef.current = 0;
    lastMposRef.current = null;
    plottingRef.current = true;
    setPlotting(true);
    setSpeedPct(100); // each plot starts at 100% (the engine resets the override too)
    pausedRef.current = false;
    ackedRef.current = 0;
    totalRef.current = gc.length;
    ackChangedAtRef.current = Date.now();
    stallHandledRef.current = false;
    setProgressFrac(0);
    setAlert('');
    pushLog('SYS', `plot start — ${gc.length} G-code lines, ${displayItems.length} artwork(s)`);
    c.streamProgram(gc);
  }

  const setCalField = (k: keyof Calibration) => (v: number) => setCal((p) => ({ ...p, [k]: v }));

  // Progress fraction: prefer the local distance-based one (smooth, set by the
  // device running the plot); fall back to the daemon's broadcast acked/total so
  // other devices (e.g. a phone watching a laptop-started plot) still track it.
  const lineFrac = progress && progress.total > 0 ? progress.acked / progress.total : 0;
  const fracDone = progressFrac > 0 ? progressFrac : lineFrac;
  const pct = Math.round(fracDone * 100);

  // Time readout: remaining (scaled by the live speed override) while plotting,
  // otherwise the estimated total for the placed artwork. Both derive from the
  // shared estimate, so every device shows it — not just the one that started.
  const remainingSec = Math.max(0, (totalEstSec * (1 - fracDone) * 100) / Math.max(10, speedPct));
  const timeText = progress
    ? `${formatDuration(remainingSec)} left`
    : totalEstSec > 0
      ? `${formatDuration(totalEstSec)} total`
      : '';

  const updateAvailable = isNewerVersion(latestVersion, appVersion);
  const updating = updateStatus?.state === 'downloading' || updateStatus?.state === 'installing';

  return (
    <div className="flex h-dvh flex-col bg-slate-100 text-slate-800">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-300 bg-white px-4 py-2 shadow-sm md:gap-3">
        <Logo className="h-4 w-auto" />
        <span className="text-sm font-semibold tracking-tight">
          PenPlotter271
          {appVersion ? (
            <span className="ml-1 align-top text-[10px] font-normal text-slate-400">
              v{appVersion}
            </span>
          ) : null}
        </span>
        <span
          className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`}
        />
        {!connected ? (
          <button className={btn} onClick={onConnect}>
            Connect
          </button>
        ) : (
          <button className={btn} onClick={() => ctrl()?.disconnect()}>
            Disconnect
          </button>
        )}
        <span className="hidden text-xs text-slate-500 md:inline">
          {connected ? `GRBL ${version} · bed ${bedW}×${bedH} mm` : 'not connected'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs">Paper</label>
          <select
            className={field}
            value={useCustomPaper ? 'custom' : paperIdx}
            onChange={(e) => {
              if (e.target.value === 'custom') setUseCustomPaper(true);
              else {
                setUseCustomPaper(false);
                setPaperIdx(Number(e.target.value));
              }
            }}
          >
            {PAPER_SIZES.map((p, i) => (
              <option key={p.name} value={i}>
                {p.name}
              </option>
            ))}
            <option value="custom">Custom…</option>
          </select>
          {useCustomPaper ? (
            <span className="flex items-center gap-1 text-xs">
              <input
                type="number"
                className={`${field} w-16`}
                value={customPaper.widthMm}
                onChange={(e) => setCustomPaper((p) => ({ ...p, widthMm: Number(e.target.value) }))}
              />
              ×
              <input
                type="number"
                className={`${field} w-16`}
                value={customPaper.heightMm}
                onChange={(e) =>
                  setCustomPaper((p) => ({ ...p, heightMm: Number(e.target.value) }))
                }
              />
              mm
            </span>
          ) : (
            <select
              className={field}
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as Orientation)}
            >
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          )}
          <button
            className={btnPrimary}
            disabled={!connected || items.length === 0}
            onClick={onPlot}
          >
            ▶ Plot
          </button>
        </div>
      </header>

      {/* Self-update banner: shown when a newer release exists or an update is in
          flight. "Update now" is disabled while plotting (the daemon also refuses). */}
      {(updateAvailable || updating || updateStatus?.state === 'error') && (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
          {updating ? (
            <span>
              Updating… {updateStatus?.message ?? ''} The app will reconnect automatically.
            </span>
          ) : updateStatus?.state === 'error' && !updateAvailable ? (
            <span className="text-red-700">Update failed: {updateStatus.message}</span>
          ) : (
            <>
              <span>
                Update available — v{appVersion} → v{latestVersion}
                {updateStatus?.state === 'error'
                  ? ` (last attempt failed: ${updateStatus.message})`
                  : ''}
              </span>
              <button
                className={btnPrimary}
                disabled={!connected || plotting}
                title={plotting ? 'Disabled while a plot is running' : undefined}
                onClick={() =>
                  void ctrl()
                    ?.update()
                    .catch(() => undefined)
                }
              >
                Update now
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        {/* Center canvas — fills the screen on phones; middle column on desktop. */}
        <div
          ref={canvasBox}
          className="relative min-h-0 w-full min-w-0 flex-1 bg-slate-200 md:order-2 md:h-auto md:w-auto md:flex-1"
        >
          {size.width > 0 && (
            <PlotCanvas
              width={size.width}
              height={size.height}
              bedW={bedW}
              bedH={bedH}
              paperW={paper.widthMm}
              paperH={paper.heightMm}
              artworks={displayItems}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onPlacement={updatePlacement}
              penPos={penPos}
              locked={plotting}
            />
          )}
          {items.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
              Add an SVG or PNG to place it on the page
            </div>
          )}
        </div>

        {/* Controls: a compact bottom row on phones; dissolves into the columns on desktop. */}
        <div className="flex max-h-[50%] min-h-0 shrink-0 overflow-hidden md:contents">
          {/* Left panel */}
          <aside className="w-1/2 shrink-0 overflow-y-auto border-r border-slate-300 bg-white p-3 text-sm md:order-1 md:w-60">
            <Section title="Artwork" className="hidden md:block">
              <div className="flex gap-2">
                <label className={`${btnPrimary} flex-1 cursor-pointer text-center`}>
                  + SVG
                  <input type="file" accept=".svg" onChange={onLoadSvg} className="hidden" />
                </label>
                <label className={`${btnPrimary} flex-1 cursor-pointer text-center`}>
                  + PNG
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={onLoadPng}
                    className="hidden"
                  />
                </label>
              </div>

              {items.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {items.map((it) => (
                    <li
                      key={it.id}
                      className={`flex items-center gap-1 rounded border px-2 py-1 text-xs ${
                        it.id === selectedId ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
                      }`}
                    >
                      <button
                        className="min-w-0 flex-1 truncate text-left"
                        onClick={() => setSelectedId(it.id)}
                      >
                        {it.name}
                      </button>
                      <button
                        className="shrink-0 px-1 text-slate-400 hover:text-red-600"
                        title="Remove"
                        onClick={() => removeItem(it.id)}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-2 grid grid-cols-2 gap-1">
                <button className={btn} disabled={!selectedItem} onClick={fitToCorner}>
                  Fit corner
                </button>
                <button className={btn} disabled={!selectedItem} onClick={fitToPaper}>
                  Fit paper
                </button>
                <button
                  className={btn}
                  disabled={!selectedItem}
                  onClick={actualSize}
                  title="Plot at the size the file declares (100%)"
                >
                  Actual size 1:1
                </button>
                <button className={btn} disabled={!selectedItem} onClick={rotate90}>
                  Rotate 90°
                </button>
              </div>
              {selectedItem && (
                <p className="mt-2 text-xs text-slate-500">
                  {selectedStrokes} strokes · {selectedItem.widthMm.toFixed(0)}×
                  {selectedItem.heightMm.toFixed(0)} mm ·{' '}
                  {(selectedItem.placement.scale * 100).toFixed(0)}% ·{' '}
                  {selectedItem.placement.rotation.toFixed(0)}°
                </p>
              )}
            </Section>

            <Section title="Jog">
              <NumberField label="Step (mm)" value={jogStep} onChange={setJogStep} />
              <div className="mt-2 grid w-44 grid-cols-3 gap-1 md:w-36">
                <span />
                <JogBtn label="↑" onPress={() => jogBy(0, -1)} disabled={!connected} />
                <span />
                <JogBtn label="←" onPress={() => jogBy(-1, 0)} disabled={!connected} />
                <span />
                <JogBtn label="→" onPress={() => jogBy(1, 0)} disabled={!connected} />
                <span />
                <JogBtn label="↓" onPress={() => jogBy(0, 1)} disabled={!connected} />
                <span />
              </div>
              <div className="mt-2 flex gap-2">
                <button className={btn} disabled={!connected} onClick={() => ctrl()?.penDown()}>
                  Pen down
                </button>
                <button className={btn} disabled={!connected} onClick={() => ctrl()?.penUp()}>
                  Pen up
                </button>
              </div>
            </Section>
          </aside>

          {/* Right panel */}
          <aside className="w-1/2 shrink-0 overflow-y-auto border-l border-slate-300 bg-white p-3 text-sm md:order-3 md:w-64">
            <Section title="Home / calibration">
              <p className="mb-1.5 text-xs text-slate-500">
                Move the pen to the paper's top-left corner — jog with the arrows, or use “Motors
                off” and push it by hand — then Calibrate.
              </p>
              <button
                className={`${btnPrimary} w-full`}
                disabled={!connected}
                onClick={() => run(() => ctrl()!.setWorkZero())}
              >
                Calibrate (set home here)
              </button>
              <div className="mt-1 grid grid-cols-3 gap-1">
                <button
                  className={btn}
                  disabled={!connected}
                  onClick={() => run(() => ctrl()!.goToWorkZero())}
                >
                  Go to home
                </button>
                <button
                  className={btn}
                  disabled={!connected}
                  onClick={() => run(() => ctrl()!.motorsOff())}
                >
                  Motors off
                </button>
                <button
                  className={btn}
                  disabled={!connected}
                  onClick={() => run(() => ctrl()!.unlock())}
                >
                  Unlock
                </button>
              </div>
            </Section>

            <Section title="Pen & feeds" className="hidden md:block">
              <NumberField
                label="Pen-down Z"
                value={cal.penDownZ}
                step={0.1}
                onChange={setCalField('penDownZ')}
              />
              <NumberField
                label="Pen-up Z"
                value={cal.penUpZ}
                step={0.1}
                onChange={setCalField('penUpZ')}
              />
              <NumberField
                label="Dwell (ms)"
                value={cal.penDwellMs}
                step={10}
                onChange={setCalField('penDwellMs')}
              />
              <NumberField
                label="Draw feed"
                value={cal.drawFeed}
                step={100}
                onChange={setCalField('drawFeed')}
              />
              <NumberField
                label="Travel feed"
                value={cal.travelFeed}
                step={100}
                onChange={setCalField('travelFeed')}
              />
              <NumberField
                label="Jog feed"
                value={cal.jogFeed}
                step={100}
                onChange={setCalField('jogFeed')}
              />
            </Section>

            <Section title="Drawing controls" className="hidden md:block">
              {!selectedItem && (
                <p className="text-xs text-slate-500">Select an artwork to fine-tune its look.</p>
              )}
              {selectedItem && (
                <>
                  {plotting && (
                    <p className="mb-1.5 text-xs text-amber-600">Locked while plotting.</p>
                  )}
                  {!plotting && !sourceAvailable && (
                    <p className="mb-1.5 text-xs text-slate-500">
                      Re-import to re-tune source controls (the current look is kept).
                    </p>
                  )}
                  {selectedItem.kind === 'png' ? (
                    <>
                      <Slider
                        label="Threshold"
                        value={selectedItem.controls.threshold}
                        {...CONTROL_RANGES.threshold}
                        disabled={srcLocked}
                        onChange={(v) => setControl(selectedItem.id, 'threshold', v)}
                      />
                      <Slider
                        label="Levels"
                        value={selectedItem.controls.levels}
                        {...CONTROL_RANGES.levels}
                        disabled={srcLocked}
                        onChange={(v) => setControl(selectedItem.id, 'levels', v)}
                      />
                      <label className="mb-2 flex items-center justify-between text-xs text-slate-600">
                        <span>Invert</span>
                        <input
                          type="checkbox"
                          checked={selectedItem.controls.invert}
                          disabled={srcLocked}
                          onChange={(e) => setControl(selectedItem.id, 'invert', e.target.checked)}
                        />
                      </label>
                      <Slider
                        label="Contrast"
                        value={selectedItem.controls.contrast}
                        {...CONTROL_RANGES.contrast}
                        disabled={srcLocked}
                        onChange={(v) => setControl(selectedItem.id, 'contrast', v)}
                      />
                    </>
                  ) : (
                    <Slider
                      label="Sampling (mm)"
                      value={selectedItem.controls.samplingMm}
                      {...CONTROL_RANGES.samplingMm}
                      disabled={srcLocked}
                      onChange={(v) => setControl(selectedItem.id, 'samplingMm', v)}
                    />
                  )}
                  <Slider
                    label="Detail / smoothing"
                    value={selectedItem.controls.detail}
                    {...CONTROL_RANGES.detail}
                    disabled={plotting}
                    onChange={(v) => setControl(selectedItem.id, 'detail', v)}
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    {selectedStrokes} strokes{updatingId === selectedItem.id ? ' · updating…' : ''}
                  </p>
                </>
              )}
            </Section>
          </aside>
        </div>
      </div>

      {/* Diagnostic log panel */}
      {showLog && (
        <div className="flex h-56 flex-col border-t border-slate-300 bg-slate-900 text-slate-100">
          <div className="flex items-center gap-2 border-b border-slate-700 px-3 py-1 text-xs">
            <span className="font-semibold">Serial log</span>
            <span className="text-slate-400">(HB = heartbeat ~1/s)</span>
            <div className="ml-auto flex gap-2">
              <button
                className="rounded border border-slate-600 px-2 py-0.5 hover:bg-slate-700"
                onClick={() => void navigator.clipboard?.writeText(logRef.current.join('\n'))}
              >
                Copy
              </button>
              <button
                className="rounded border border-slate-600 px-2 py-0.5 hover:bg-slate-700"
                onClick={() => {
                  logRef.current = [];
                  setLogText('');
                }}
              >
                Clear
              </button>
            </div>
          </div>
          <pre className="flex-1 overflow-auto whitespace-pre-wrap px-3 py-1 font-mono text-[11px] leading-tight">
            {logText || '(no entries yet)'}
          </pre>
        </div>
      )}

      {/* Bottom strip */}
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-300 bg-white px-4 py-2 text-xs">
        <span>
          State: <b>{status?.state ?? '—'}</b>
        </span>
        <span className="hidden md:inline">MPos {fmtPos(status?.mpos)}</span>
        <span>WPos {fmtPos(penPos)}</span>
        <div className="h-2 w-48 overflow-hidden rounded bg-slate-200">
          <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="whitespace-nowrap">
          {pct > 0 ? `${pct}%` : ''}
          {timeText ? `${pct > 0 ? ' · ' : ''}${timeText}` : ''}
        </span>
        {/* Speed = live feed override (pause, change, resume). Desktop only. */}
        <label className="hidden items-center gap-1 md:flex" title="Plotting speed (% of feed)">
          <span className="text-slate-500">Speed</span>
          <input
            type="number"
            className={`${field} w-16`}
            value={speedPct}
            min={10}
            max={200}
            step={10}
            disabled={!connected}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSpeedPct(v);
              void ctrl()?.setFeedOverride(v);
            }}
          />
          <span className="text-slate-500">%</span>
        </label>
        <div className="ml-auto flex gap-2">
          <button
            className={transportBtn}
            disabled={!connected}
            onClick={() => {
              pausedRef.current = true;
              pushLog('SYS', 'pause pressed (feed hold)');
              ctrl()?.pause();
            }}
          >
            Pause
          </button>
          <button
            className={transportBtn}
            disabled={!connected}
            onClick={() => {
              pausedRef.current = false;
              ackChangedAtRef.current = Date.now(); // fresh stall window after a hold
              lastRxRef.current = Date.now(); // don't let a held gap trip the dead-link check
              pushLog('SYS', 'resume pressed (cycle start)');
              ctrl()?.resume();
            }}
          >
            Resume
          </button>
          <button
            className={transportBtn}
            disabled={!connected}
            onClick={() => {
              pausedRef.current = false;
              pushLog('SYS', 'stop pressed');
              run(() => ctrl()!.stopAndReturnHome());
            }}
          >
            Stop
          </button>
          <button className={btn} onClick={() => setShowLog((v) => !v)}>
            {showLog ? 'Hide log' : 'Log'}
          </button>
        </div>
        {alert && <span className="text-red-600">{alert}</span>}
      </footer>
    </div>
  );
}

// ---- small presentational helpers ----

const btn =
  'rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40';
// Transport controls (Pause/Resume/Stop): large touch targets on phones,
// compact on desktop (md:) where they match the regular `btn` size.
const transportBtn =
  'rounded border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40 md:px-2 md:py-1 md:text-xs';
const btnPrimary =
  'rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40';
const field = 'rounded border border-slate-300 px-1.5 py-1 text-xs';

function Section(props: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`mb-4 ${props.className ?? ''}`}>
      <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-1 flex items-center justify-between gap-2">
      <span className="text-xs text-slate-600">{props.label}</span>
      <input
        type="number"
        className={`${field} w-20`}
        value={props.value}
        step={props.step ?? 1}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

/** A labelled slider with a numeric box — drag for quick changes or type an exact
 * value (the box accepts values beyond the slider's nominal range). */
function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step, disabled, onChange } = props;
  return (
    <label className="mb-2 block">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>{label}</span>
        <input
          type="number"
          className={`${field} w-16`}
          value={value}
          step={step}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full"
      />
    </label>
  );
}

function JogBtn(props: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <button
      className="rounded border border-slate-300 bg-white py-3 text-sm hover:bg-slate-50 disabled:opacity-40 md:py-2 md:text-xs"
      disabled={props.disabled}
      onClick={props.onPress}
    >
      {props.label}
    </button>
  );
}

function fmtPos(p: { x: number; y: number } | null | undefined): string {
  return p ? `${p.x.toFixed(1)}, ${p.y.toFixed(1)}` : '—';
}

/** Pull motion limits from GRBL settings: accel = min($120,$121), jdev = $11. */
function readMotion(s: GrblSettings): { accel?: number; jdev?: number } {
  const accels = [s[120], s[121]].filter((v): v is number => typeof v === 'number' && v > 0);
  const accel = accels.length ? Math.min(...accels) : undefined;
  const jdev = typeof s[11] === 'number' && s[11] > 0 ? s[11] : undefined;
  return { accel, jdev };
}

/** Total XY travel distance (mm) of a G-code program — for smooth progress. */
function gcodeXYLength(lines: string[]): number {
  let x = 0;
  let y = 0;
  let total = 0;
  for (const l of lines) {
    const mx = /X(-?[\d.]+)/.exec(l);
    const my = /Y(-?[\d.]+)/.exec(l);
    if (!mx && !my) continue;
    const nx = mx ? parseFloat(mx[1]) : x;
    const ny = my ? parseFloat(my[1]) : y;
    total += Math.hypot(nx - x, ny - y);
    x = nx;
    y = ny;
  }
  return total;
}

function useElementSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
