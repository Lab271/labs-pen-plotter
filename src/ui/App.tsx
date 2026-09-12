import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GatewayClient } from '../transport/GatewayClient';
import { Calibration } from '../grbl/settings';
import { StatusReport, type GrblSettings } from '../grbl/types';
import { loadAppSettings, saveAppSettings } from './settingsStore';
import { loadSession, saveSession, type Session, type PersistedArt } from './sessionStore';
import { flattenSvg, ABORTED } from '../plot/svg';
import { RegistrationWizard } from './RegistrationWizard';
import { StepPicker } from './StepPicker';
import { btn, btnPrimary, field } from './styles';
import { imageToField, traceField, type FieldSource } from '../plot/raster';
import { ImportWizard, type ImportSpec } from './ImportWizard';
import { loadPdf, type LoadedPdf } from '../plot/pdf';
import { sniffFile } from '../plot/sniff';
import { downloadFileName, makeProject, readProject } from '../plot/project';
import type { ProjectSummary } from '../gateway/protocol';
import { applyDetail } from '../plot/detail';
import {
  estimatePlotTime,
  formatDuration,
  generateGcode,
  generatePenGroupGcode,
  travelLegs,
} from '../plot/gcode';
import {
  actualSizePlacement,
  anchorPlacement,
  bounds,
  fitPlacement,
  placeOnPage,
  placePolylines,
} from '../plot/place';
import { DEFAULT_PAPER_STYLE_ID, PAPER_SIZES, PAPER_STYLES, paperDims } from '../plot/paper';
import { resolvePen } from '../plot/pen';
import {
  DEFAULT_SHAPE,
  shapePolylines,
  shapeSize,
  type ShapeKind,
  type ShapeSpec,
} from '../plot/shapes';
import { DEFAULT_TEXT, missingGlyphs, textPolylines, type TextSpec } from '../plot/font';
import { copyName, pastePlacement, reorderMany } from '../plot/scene';
import { prepareForCut } from '../plot/cut';
import {
  DEFAULT_MAGNET_RADIUS_MM,
  magnetsHitBy,
  recommendMagnets,
  type Magnet,
} from '../plot/magnet';
import type { Artwork, CalibrationPoint, Placement, Point, Polyline } from '../plot/types';
import {
  type ArtControls,
  DEFAULT_CONTROLS,
  CONTROL_RANGES,
  SOURCE_KEYS,
  normalizeControls,
} from '../plot/controls';
import { PlotCanvas } from './PlotCanvas';
import { SettingsPage } from './SettingsPage';
import { Logo } from './Logo';
import type { UpdateStatus } from '../gateway/protocol';
import type { AppSettings } from '../gateway/appSettings';

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
/** The parameters a drawn object's geometry is generated from. */
type ObjectSpec = ShapeSpec | TextSpec;

interface PlacedArt {
  id: string;
  name: string;
  kind: 'svg' | 'png' | 'shape' | 'text';
  /** Drawn objects only: what to regenerate the geometry from. */
  spec?: ObjectSpec;
  /** Imported images: the wizard settings, so the import can be reopened. */
  importSpec?: ImportSpec;
  /** Full-detail flattened polylines (paper-mm, normalized to origin). */
  master: Polyline[];
  widthMm: number;
  heightMm: number;
  placement: Placement;
  /** Per-artwork drawing controls. */
  controls: ArtControls;
  /** Which pen draws it (`Pen.id`); resolved against the library at render time. */
  penId?: string;
  /** Where the file put the artwork on its page (SVG only) — for Place on page. */
  pageOffset?: Point;
  /** Registration marks from the file's reference layer, artwork frame (never plotted). */
  calibrationPoints?: CalibrationPoint[];
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
  // Held at a pen change: the machine is deliberately Idle with no progress, so
  // the stall watchdog must not read it as a wedged plot and stop the job.
  const penChangeRef = useRef(false);
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
  // The controller's own `$$` settings, shown read-only on the Settings page.
  const [grbl, setGrbl] = useState<GrblSettings>({});
  const [showSettings, setShowSettings] = useState(false);
  const [alert, setAlert] = useState('');
  // App settings (machine setup + preferences) live on the daemon so every
  // client of one plotter shares them. What's loaded here is the local cache:
  // it decides the first paint and seeds a daemon that has none yet.
  const [settings, setSettings] = useState<AppSettings>(loadAppSettings);
  // True once we know what the daemon has (adopted it, or learned it has none).
  // Until then we don't push, so a stale local copy can't clobber a newer shared
  // one — the same guard the shared session uses.
  const [settingsSynced, setSettingsSynced] = useState(false);
  const cal = settings.calibration;
  const pens = settings.pens;
  const knife = settings.knife;
  const setCal = useCallback(
    (update: (prev: Calibration) => Calibration) =>
      setSettings((s) => ({ ...s, calibration: update(s.calibration) })),
    [],
  );

  // Restore the editable session (artwork + page) so reopening the tab / reloading
  // after a reconnect keeps the drawing — it's browser state, not on the daemon.
  const [restored] = useState(loadSession);

  const [jogStep, setJogStep] = useState(10);
  const [items, setItems] = useState<PlacedArt[]>(() => (restored?.items ?? []).map(normalizeArt));
  // The selection is a list: editing acts on all of it, while the panels that
  // only make sense for one object (registration, drawing controls) read the
  // last one selected — which is also what a plain click leaves behind.
  const [selectedIds, setSelectedIds] = useState<string[]>(
    restored?.selectedIds ?? (restored?.selectedId ? [restored.selectedId] : []),
  );
  const selectedId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;
  const setSelectedId = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);
  /** Click selection: replace, or toggle into the selection for Shift/Cmd-click. */
  const selectObject = useCallback((id: string | null, additive = false) => {
    if (!id) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds((cur) =>
      additive
        ? cur.includes(id)
          ? cur.filter((x) => x !== id)
          : [...cur, id]
        : cur.length === 1 && cur[0] === id
          ? cur
          : [id],
    );
  }, []);
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
  // The pen the machine is waiting for, or null. Comes from the daemon (snapshot
  // or event), so any client — including one that just attached — can answer it.
  const [penChange, setPenChange] = useState<{ index: number; label: string } | null>(null);
  // Don't push to the daemon until we've synced with its stored session on connect
  // (avoids a stale local push overwriting a newer session from another device).
  const sessionLoadedRef = useRef(false);
  const [paperIdx, setPaperIdx] = useState(restored?.paperIdx ?? 2); // A2
  const [orientation, setOrientation] = useState<Orientation>(restored?.orientation ?? 'landscape');
  const [useCustomPaper, setUseCustomPaper] = useState(restored?.useCustomPaper ?? false);
  // A multi-page PDF waiting for the operator to say which page to import.
  const [pdfPick, setPdfPick] = useState<{ name: string; doc: LoadedPdf } | null>(null);
  // Projects stored on the daemon, and the name this job was last saved under.
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectName, setProjectName] = useState('');
  // Import wizard: the image being converted. `artId` is set when reopening an
  // existing import, so confirming replaces that object instead of adding one.
  const [importing, setImporting] = useState<{
    name: string;
    source: FieldSource;
    initial?: ImportSpec;
    artId?: string;
  } | null>(null);
  // Registration wizard: the artwork it is open for (opens itself after an SVG
  // import that carries calibration points; reopened with Register…).
  const [wizardFor, setWizardFor] = useState<string | null>(null);
  const [customPaper, setCustomPaper] = useState(
    restored?.customPaper ?? { widthMm: 600, heightMm: 400 },
  );
  // The stock shown behind the artwork. Preview only — see `PAPER_STYLES`.
  const [paperStyleId, setPaperStyleId] = useState(
    restored?.paperStyleId ?? DEFAULT_PAPER_STYLE_ID,
  );
  // The pen newly imported artwork gets. Per job (it is part of the drawing),
  // while the library of pens that exist is app settings.
  const [selectedPenId, setSelectedPenId] = useState<string | undefined>(restored?.selectedPenId);
  // Draw with a pen, or cut with a drag knife. The mode decides which tool
  // profile a job uses, how an import is placed, and what the machine is told.
  const [mode, setMode] = useState<'draw' | 'cut'>(restored?.mode ?? 'draw');
  const cutting = mode === 'cut';
  // Where the hold-down magnets are. The machine has no vacuum bed, and a
  // magnet the carriage strikes at travel feed drags the sheet and takes the
  // work origin with it — so the app has to know about them.
  const [magnets, setMagnets] = useState<Magnet[]>(restored?.magnets ?? []);
  const magnetIdRef = useRef(0);

  useEffect(() => {
    const ctrl = new GatewayClient();
    ctrlRef.current = ctrl;
    ctrl.calibration = cal;
    const unsubs = [
      ctrl.on('connected', (e) => {
        setConnected(true);
        setVersion(e.version);
        setMotion(readMotion(ctrl.settings)); // settings arrive with the snapshot
        setGrbl(ctrl.settings);
        setAlert('');
        pushLog('SYS', `connected — GRBL ${e.version}`);
      }),
      ctrl.on('settings', (s) => {
        setMotion(readMotion(s));
        setGrbl(s);
      }),
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
            !penChangeRef.current &&
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
      ctrl.on('projects', (list) => setProjects(list)),
      ctrl.on('projectLoaded', (e) => {
        openProject(e.project, e.name);
      }),
      ctrl.on('penChange', (e) => {
        penChangeRef.current = !!e;
        setPenChange(e);
        if (e) pushLog('SYS', `pen change — load ${e.label || 'the next pen'}`);
      }),
      ctrl.on('streamComplete', () => {
        plottingRef.current = false;
        setPlotting(false);
        penChangeRef.current = false;
        setPenChange(null);
        setProgress(null);
        setProgressFrac(1);
        setAlert('Plot complete.');
        pushLog('SYS', 'plot complete');
      }),
      ctrl.on('streamAborted', (e) => {
        plottingRef.current = false;
        setPlotting(false);
        penChangeRef.current = false;
        setPenChange(null);
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
          setSelectedIds(s.selectedIds ?? (s.selectedId ? [s.selectedId] : []));
          if (typeof s.nextId === 'number') idRef.current = Math.max(idRef.current, s.nextId);
          if (typeof s.paperIdx === 'number') setPaperIdx(s.paperIdx);
          if (s.orientation) setOrientation(s.orientation);
          if (typeof s.useCustomPaper === 'boolean') setUseCustomPaper(s.useCustomPaper);
          if (s.customPaper) setCustomPaper(s.customPaper);
          if (s.paperStyleId) setPaperStyleId(s.paperStyleId);
          if (s.selectedPenId) setSelectedPenId(s.selectedPenId);
          if (s.mode) setMode(s.mode);
          if (s.magnets) setMagnets(s.magnets);
          // Pre-1.3 sessions carried the shared calibration. Still adopted, for a
          // client talking to an older daemon that has no app-settings record —
          // the `appSettings` snapshot field (emitted right after this) wins when
          // the daemon is new enough to have one.
          if (s.calibration) setCal((prev) => ({ ...prev, ...s.calibration }));
        }
        sessionLoadedRef.current = true; // now safe to push local edits to the daemon
      }),
      ctrl.on('appSettings', (s) => {
        // The daemon's settings are authoritative: one plotter, one setup. `null`
        // means it has none yet, so we keep ours — flipping `settingsSynced`
        // then seeds the daemon with them via the persist effect.
        if (s) setSettings(s);
        setSettingsSynced(true);
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

  // Push the machine setup to the daemon's engine (it reads pen Z / dwell for
  // manual pen moves), and mirror the settings locally for the next first paint.
  useEffect(() => {
    if (ctrlRef.current) ctrlRef.current.calibration = cal;
  }, [cal]);

  useEffect(() => {
    saveAppSettings(settings);
    if (settingsSynced) ctrlRef.current?.saveAppSettings(settings);
  }, [settings, settingsSynced]);

  // Persist the editable session: always to localStorage (instant, offline), and
  // to the daemon (lives on the Pi, any device) once we've synced its session.
  useEffect(() => {
    // One builder for the session, shared with project saving: two copies of
    // this list would drift, and the field someone forgets to add to the second
    // one is a field that quietly vanishes from every saved project.
    const blob = currentSession();
    saveSession(blob);
    if (sessionLoadedRef.current) ctrlRef.current?.saveSession(blob);
  }, [
    items,
    selectedId,
    selectedIds,
    paperIdx,
    orientation,
    useCustomPaper,
    customPaper,
    paperStyleId,
    selectedPenId,
    mode,
    magnets,
  ]);

  // (Device reconnection is now owned by the gateway daemon; the browser client
  // auto-reattaches its WebSocket. No browser-side Web Serial reconnect needed.)

  // Editing shortcuts. Bound on the window rather than a focused element: the
  // operator's attention is on the canvas, which is a <canvas> and takes no
  // focus of its own. Anything typed into a field is left alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable)
        return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'c') {
        copySelection();
      } else if (mod && e.key.toLowerCase() === 'v') {
        pasteClipboard();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault(); // browsers bookmark on Cmd+D
        duplicateSelection();
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedIds(items.map((i) => i.id));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Backspace is "go back" on some setups — only act when something is
        // selected, so an accidental press outside the editor does nothing.
        if (selectedIds.length > 0) e.preventDefault();
        deleteSelection();
      } else if (e.key === 'Escape') {
        setSelectedIds([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
    // Resolve rather than store the raw selection: the chosen pen may have been
    // deleted from the library since, and artwork must always name a real pen.
    const pen = resolvePen(pens, selectedPenId);
    sourcesRef.current.set(id, source);
    // A cut is 1:1 or it is wrong — the sticker has to match the print it was
    // designed against, so cutting never scales the artwork to fit the page.
    // Where the file says which part of the page it occupies, that is used.
    const placement = cutting
      ? placeOnPage(art.widthMm, art.heightMm, art.pageOffset, {
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
        })
      : fitPlacement(art.widthMm, art.heightMm, 0, paper.widthMm, paper.heightMm);
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
        penId: pen.id,
        pageOffset: art.pageOffset,
        calibrationPoints: art.calibrationPoints,
      },
    ]);
    setSelectedId(id);
    return id;
  }

  /**
   * Geometry for a drawn object, plus the box it occupies. Text measures its own
   * box from the strokes (a descender or a wide glyph decides it); a shape's box
   * is the size the operator asked for, even where the outline does not reach
   * the corners — dragging a 50 mm circle should report 50 mm.
   */
  function geometryFor(spec: ObjectSpec): {
    polylines: Polyline[];
    widthMm: number;
    heightMm: number;
  } {
    if (spec.kind === 'shape') {
      return { polylines: shapePolylines(spec), ...shapeSize(spec) };
    }
    const polylines = textPolylines(spec);
    const b = bounds(polylines);
    return { polylines, widthMm: b.width, heightMm: b.height };
  }

  /** Add a drawn object at the top-left of the page, at its real size. */
  function addDrawn(name: string, spec: ObjectSpec) {
    const { polylines, widthMm, heightMm } = geometryFor(spec);
    if (polylines.length === 0) {
      setAlert('Nothing to draw — that text has no characters this font can draw.');
      return;
    }
    const id = `art${++idRef.current}`;
    setItems((list) => [
      ...list,
      {
        id,
        name,
        kind: spec.kind === 'shape' ? 'shape' : 'text',
        spec,
        master: polylines,
        widthMm,
        heightMm,
        // Real size, inset from the corner: a drawn object is created at the
        // size that was asked for, unlike an import, which is fitted to the page.
        // Cascaded, so adding three shapes in a row does not stack them exactly
        // on top of each other where they look like one.
        placement: {
          x: 10 + (list.length % 8) * 8,
          y: 10 + (list.length % 8) * 8,
          scale: 1,
          rotation: 0,
        },
        controls: { ...DEFAULT_CONTROLS },
        penId: resolvePen(pens, selectedPenId).id,
      },
    ]);
    setSelectedIds([id]);
  }

  function addShape(shape: ShapeKind) {
    const spec: ShapeSpec = { ...DEFAULT_SHAPE, shape };
    addDrawn(shape.charAt(0).toUpperCase() + shape.slice(1), spec);
  }

  /** Re-generate a drawn object from an edited spec. */
  function setSpec(id: string, spec: ObjectSpec) {
    const { polylines, widthMm, heightMm } = geometryFor(spec);
    setItems((list) =>
      list.map((i) =>
        i.id === id
          ? {
              ...i,
              spec,
              // Keep the previous geometry when an edit leaves nothing drawable
              // (an empty text box mid-typing) so the object does not vanish
              // from the page and take its placement with it.
              master: polylines.length > 0 ? polylines : i.master,
              widthMm: polylines.length > 0 ? widthMm : i.widthMm,
              heightMm: polylines.length > 0 ? heightMm : i.heightMm,
            }
          : i,
      ),
    );
  }

  async function importSvgFile(file: File) {
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
          'No plottable stroke geometry in that SVG (it is likely fill-based, or everything ' +
            'is on a calibration/reference layer or pure blue, which is never cut). ' +
            'Export it as a PNG and import that — the wizard converts it to lines.',
        );
        return;
      }
      const id = addArtwork(file.name, 'svg', art, controls, { kind: 'svg', text });
      const notes: string[] = [];
      const nCal = art.calibrationPoints?.length ?? 0;
      if (nCal >= 2) setWizardFor(id); // registration is what a reference layer is for
      if (nCal > 0)
        notes.push(`${nCal} calibration point(s) found — reference layer excluded from the cut.`);
      if (skipped > 0) notes.push(`${skipped} element(s) skipped (hidden layers, fills, or text).`);
      setAlert(notes.length ? `Imported. ${notes.join(' ')}` : '');
    } catch (err) {
      if (err === ABORTED) return; // superseded by a newer import — stay quiet
      setAlert(String((err as Error).message ?? err));
    }
  }

  /**
   * One entry for every image. A vector file is already lines, so it goes
   * straight in (keeping its real size and its reference layer); anything raster
   * has to be *converted*, and which conversion is the operator's decision — so
   * it opens the wizard instead of guessing.
   */
  /**
   * One entry for every source. What a file *is* decides the route, and that is
   * read from its contents rather than its name: operators rename files, and a
   * phone will hand over an `image.jpg` that is really HEIC.
   */
  async function onLoadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;
    setAlert('Reading file…');
    try {
      const kind = await sniffFile(file);
      if (kind === 'svg') {
        await importSvgFile(file);
        return;
      }
      if (kind === 'pdf') {
        await importPdfFile(file);
        return;
      }
      if (kind === 'unknown') {
        setAlert(`Could not read ${file.name}. Supported: SVG, PDF, PNG, JPEG, WebP, GIF and BMP.`);
        return;
      }
      try {
        const source = await imageToField(file, MASTER_MAXDIM);
        setAlert('');
        setImporting({ name: file.name, source });
      } catch (err) {
        // HEIC is the common case here: iPhones produce it by default and most
        // browsers cannot decode it, so say what to do rather than "failed".
        if (kind === 'heic') {
          setAlert(
            `This browser cannot read HEIC images. Convert ${file.name} to JPEG on your phone ` +
              '(Settings → Camera → Formats → Most Compatible), or export it as PNG.',
          );
          return;
        }
        throw err;
      }
    } catch (err) {
      setAlert(String((err as Error).message ?? err));
    }
  }

  /** Open a PDF: one page goes straight in, several ask which. */
  async function importPdfFile(file: File) {
    setAlert('Reading PDF…');
    const doc = await loadPdf(file);
    if (doc.numPages === 1) {
      await importPdfPage(file.name, doc, 1);
      return;
    }
    setAlert('');
    setPdfPick({ name: file.name, doc });
  }

  /**
   * Import one page. A vector page is already the thing we want — paths at the
   * size the page declares — so it goes in like an SVG, keeping its page
   * position for registration. A page that is really a scan goes to the wizard,
   * which is where deciding how a picture becomes lines belongs.
   */
  async function importPdfPage(name: string, doc: LoadedPdf, pageNumber: number) {
    setPdfPick(null);
    setAlert('Reading PDF…');
    try {
      const label = doc.numPages > 1 ? `${name} (page ${pageNumber})` : name;
      const geometry = await doc.geometry(pageNumber, MASTER_TOLERANCE_MM);
      if (geometry.polylines.length > 0) {
        const box = bounds(geometry.polylines);
        const normalised = geometry.polylines.map((poly) =>
          poly.map((pt) => ({ x: pt.x - box.minX, y: pt.y - box.minY })),
        );
        addArtwork(
          label,
          'svg',
          {
            polylines: normalised,
            widthMm: box.width,
            heightMm: box.height,
            // Where the drawing sits on its page, so Place on page and the
            // registration wizard work exactly as they do for an SVG.
            pageOffset: { x: box.minX, y: box.minY },
          },
          { ...DEFAULT_CONTROLS, samplingMm: MASTER_TOLERANCE_MM },
          { kind: 'svg', text: '' },
        );
        setAlert(
          geometry.skippedText > 0
            ? `Imported. ${geometry.skippedText} text run(s) skipped — a PDF's text is glyph ` +
                'outlines, which plot as hollow letters. Add it with the Text tool instead.'
            : '',
        );
        await doc.destroy();
        return;
      }
      // No paths: it is a scan (or a page of nothing but text and images).
      const source = await doc.field(pageNumber, MASTER_MAXDIM);
      await doc.destroy();
      setAlert('');
      setImporting({ name: label, source });
    } catch (err) {
      setAlert(String((err as Error).message ?? err));
    }
  }

  /** Reopen the wizard for an already-imported image (same session only). */
  function reopenImport(art: PlacedArt) {
    const src = sourcesRef.current.get(art.id);
    if (!src || src.kind !== 'png') return;
    setImporting({
      name: art.name,
      source: src.field,
      initial: art.importSpec,
      artId: art.id,
    });
  }

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;
  // One control, two jobs: with artwork selected it is that artwork's pen; with
  // nothing selected it is the pen the next import will get. Both are what the
  // operator means by "the pen I'm drawing with".
  const activePen = resolvePen(pens, selectedItem ? selectedItem.penId : selectedPenId);
  function setPen(penId: string) {
    setSelectedPenId(penId);
    if (selectedItem) {
      setItems((list) => list.map((i) => (i.id === selectedItem.id ? { ...i, penId } : i)));
    }
  }
  // Source-stage controls are disabled while plotting (locked) or when the source
  // wasn't retained (after a reload — the master is kept, geometry controls still work).
  const sourceAvailable = !!selectedItem && sourcesRef.current.has(selectedItem.id);
  const srcLocked = !selectedItem || plotting || !sourceAvailable;

  // Apply each artwork's detail control to its master → what is previewed and plotted.
  const displayItems = useMemo(
    () =>
      items.map((i) => {
        const p = resolvePen(pens, i.penId);
        return {
          id: i.id,
          polylines: applyDetail(i.master, i.controls.detail),
          placement: i.placement,
          w: i.widthMm,
          h: i.heightMm,
          penId: p.id,
          penColor: p.color,
          penWidthMm: p.widthMm,
        };
      }),
    [items, pens],
  );
  const selectedStrokes = displayItems.find((d) => d.id === selectedId)?.polylines.length ?? 0;

  // The placed geometry, grouped by pen and ordered by the pen library — so the
  // sequence of colours is predictable (and reorderable, by reordering the
  // library) rather than depending on the order artwork happened to be imported.
  const penGroups = useMemo(() => {
    const byPen = new Map<string, Polyline[]>();
    for (const i of displayItems) {
      const placed = placePolylines(i.polylines, i.placement);
      byPen.set(i.penId, (byPen.get(i.penId) ?? []).concat(placed));
    }
    return pens
      .filter((pen) => byPen.has(pen.id))
      .map((pen) => ({ label: pen.name, polylines: byPen.get(pen.id)! }));
  }, [displayItems, pens]);

  // Magnets the artwork itself crosses. Travel can be routed around a magnet;
  // a stroke that has to be *drawn* through one cannot be.
  const placedPolylines = useMemo(
    () => displayItems.flatMap((i) => placePolylines(i.polylines, i.placement)),
    [displayItems],
  );
  const hitMagnets = useMemo(
    // Test the geometry that will actually be cut or drawn: in cutting mode the
    // overcut carries the blade a little past the contour, and a magnet sitting
    // in exactly that tail is still a magnet the blade would hit.
    () => magnetsHitBy(magnets, cutting ? prepareForCut(placedPolylines, knife) : placedPolylines),
    [magnets, placedPolylines, cutting, knife],
  );

  /**
   * Which magnet is on which artwork, in words. "2 magnets are in the way" is
   * not actionable; "the magnet at 245, 155 mm on Rect" is — the operator can
   * walk to the bed and move that one.
   */
  const magnetConflicts = useMemo(
    () =>
      hitMagnets.map((m) => {
        const hitItem = displayItems.find(
          (i) => magnetsHitBy([m], placePolylines(i.polylines, i.placement)).length > 0,
        );
        const name = items.find((i) => i.id === hitItem?.id)?.name;
        return `the magnet at ${m.x.toFixed(0)}, ${m.y.toFixed(0)} mm${name ? ` on ${name}` : ''}`;
      }),
    [hitMagnets, displayItems, items],
  );

  // The program that Plot sends — built here so the time estimate is costed on
  // exactly the G-code that will run, pen changes and all.
  //
  // Cutting is a different tool, not a different generator: the geometry is
  // prepared for a blade (overcut, corner compensation) and the knife's own
  // Z and feeds are used, but the same writer emits it. Pen changes do not
  // apply — there is one blade — so the whole job is one group.
  const program = useMemo(() => {
    if (cutting) {
      const placed = penGroups.flatMap((g) => g.polylines);
      return generateGcode(prepareForCut(placed, knife), {
        penUpZ: knife.upZ,
        penDownZ: knife.downZ,
        dwellMs: knife.dwellMs,
        drawFeed: knife.cutFeed,
        travelFeed: knife.travelFeed,
        // A prepared contour must not be reversed: blade-offset compensation
        // overshoots each corner along the direction of travel.
        allowReverse: false,
        avoidZones: magnets,
      });
    }
    return generatePenGroupGcode(penGroups, {
      penUpZ: cal.penUpZ,
      penDownZ: cal.penDownZ,
      dwellMs: cal.penDwellMs,
      drawFeed: cal.drawFeed,
      travelFeed: cal.travelFeed,
      avoidZones: magnets,
    });
  }, [penGroups, cal, cutting, knife, magnets]);

  // What the blade will actually follow: the overcut tail and the gaps the
  // holding tabs leave. Shown only in cutting mode, where those are the details
  // that decide whether a sheet comes out usable.
  const cutPreview = useMemo(
    () =>
      cutting && placedPolylines.length > 0 ? prepareForCut(placedPolylines, knife) : undefined,
    [cutting, placedPolylines, knife],
  );

  // Travel legs, shown on the canvas only where a magnet forces a detour —
  // drawing every pen-up move all the time would bury the artwork in dashes.
  const travelPreview = useMemo(() => {
    if (magnets.length === 0 || placedPolylines.length === 0) return undefined;
    const legs = travelLegs(cutting ? prepareForCut(placedPolylines, knife) : placedPolylines, {
      penUpZ: cal.penUpZ,
      penDownZ: cal.penDownZ,
      dwellMs: cal.penDwellMs,
      drawFeed: cal.drawFeed,
      travelFeed: cal.travelFeed,
      allowReverse: !cutting,
      avoidZones: magnets,
    });
    const detours = legs.filter((leg) => leg.length > 2);
    return detours.length > 0 ? detours : undefined;
  }, [magnets, placedPolylines, cutting, knife, cal]);

  // Estimated total plot time for the currently placed artwork (recomputed when
  // the artwork, layout, or feeds change). Walks the program that will actually
  // be sent, so it reflects the feeds, segment count, and stroke order.
  const totalEstSec = useMemo(
    () => (displayItems.length === 0 ? 0 : estimatePlotTime(program, motion)),
    [displayItems.length, program, motion],
  );

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
            ? {
                ...i,
                master: art.polylines,
                widthMm: art.widthMm,
                heightMm: art.heightMm,
                pageOffset: art.pageOffset ?? i.pageOffset,
                calibrationPoints: art.calibrationPoints ?? i.calibrationPoints,
              }
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

  // Clipboard: full copies of the objects, kept in a ref rather than the system
  // clipboard. The artwork is megabytes of polylines with an in-memory source
  // attached, which does not survive a serialise → paste round trip, and the
  // operator means "duplicate this drawing", not "put SVG text on my clipboard".
  const clipboard = useRef<PlacedArt[]>([]);
  const [clipboardCount, setClipboardCount] = useState(0);

  const selectedItems = items.filter((i) => selectedIds.includes(i.id));

  function copySelection() {
    if (selectedItems.length === 0) return;
    clipboard.current = selectedItems.map((i) => ({ ...i }));
    setClipboardCount(selectedItems.length);
    setAlert(`Copied ${selectedItems.length} object(s).`);
  }

  function pasteClipboard() {
    if (clipboard.current.length === 0 || plotting) return;
    const taken = items.map((i) => i.name);
    const pasted: PlacedArt[] = clipboard.current.map((src) => {
      const id = `art${++idRef.current}`;
      // Carry the retained source across so the copy's source controls still
      // re-derive; the master polylines are immutable, so sharing them is safe.
      const source = sourcesRef.current.get(src.id);
      if (source) sourcesRef.current.set(id, source);
      const name = copyName(src.name, taken);
      taken.push(name);
      return {
        ...src,
        id,
        name,
        placement: pastePlacement(
          { id: src.id, placement: src.placement, widthMm: src.widthMm, heightMm: src.heightMm },
          paper.widthMm,
          paper.heightMm,
        ),
      };
    });
    setItems((list) => [...list, ...pasted]);
    setSelectedIds(pasted.map((i) => i.id));
  }

  function duplicateSelection() {
    copySelection();
    // Paste reads the ref, which copySelection has already filled — so this is
    // one gesture, not a copy that also clobbers whatever was on the clipboard
    // for the operator's next paste.
    pasteClipboard();
  }

  function deleteSelection() {
    if (plotting || selectedIds.length === 0) return;
    flattenAbort.current.aborted = true; // stop any in-flight derive/import work
    for (const id of selectedIds) sourcesRef.current.delete(id);
    setItems((list) => list.filter((i) => !selectedIds.includes(i.id)));
    setSelectedIds([]);
  }

  function addMagnet(at?: { x: number; y: number }) {
    const id = `mag-${Date.now().toString(36)}-${++magnetIdRef.current}`;
    const x = at?.x ?? paper.widthMm / 2;
    const y = at?.y ?? paper.heightMm / 2;
    setMagnets((list) => [...list, { id, x, y, radiusMm: DEFAULT_MAGNET_RADIUS_MM }]);
  }

  function suggestMagnets() {
    const suggested = recommendMagnets(
      paper.widthMm,
      paper.heightMm,
      placedPolylines,
      DEFAULT_MAGNET_RADIUS_MM,
    );
    if (suggested.length === 0) {
      setAlert('No clear spot for a magnet — the drawing reaches every edge of the sheet.');
      return;
    }
    // Replace rather than append: these are suggestions for the sheet as it is
    // now, and mixing them with the previous set would be neither.
    setMagnets(suggested.map((m, i) => ({ ...m, id: `mag-suggest-${i + 1}` })));
    setAlert('');
  }

  function moveMagnet(id: string, x: number, y: number) {
    setMagnets((list) => list.map((m) => (m.id === id ? { ...m, x, y } : m)));
  }

  /** Everything that makes up the job, as a project file would store it. */
  function currentSession(): Session {
    return {
      items,
      // `selectedId` stays in the blob so an older build (or an older daemon's
      // stored session) still restores a sensible selection.
      selectedId,
      selectedIds,
      nextId: idRef.current,
      paperIdx,
      orientation,
      useCustomPaper,
      customPaper,
      paperStyleId,
      selectedPenId,
      mode,
      magnets,
    };
  }

  /**
   * Replace the page with a stored project. The pens it was drawn with come
   * with it and are merged into the library: artwork refers to pens by id, so a
   * project opened on another machine would otherwise come out in whatever
   * pens happen to be defined there.
   */
  function openProject(raw: unknown, fallbackName = '') {
    const result = readProject(raw);
    if (!result.ok) {
      setAlert(result.error);
      return;
    }
    const { project } = result;
    const s = project.session as Session | null;
    if (!s || !Array.isArray(s.items)) {
      setAlert('That project file has no drawing in it.');
      return;
    }
    if (project.pens.length > 0) {
      setSettings((prev) => {
        const byId = new Map(prev.pens.map((pen) => [pen.id, pen]));
        for (const pen of project.pens) if (!byId.has(pen.id)) byId.set(pen.id, pen);
        return { ...prev, pens: [...byId.values()] };
      });
    }
    // The retained import sources belong to the drawing being replaced.
    sourcesRef.current.clear();
    setItems(s.items.map(normalizeArt));
    setSelectedIds(s.selectedIds ?? (s.selectedId ? [s.selectedId] : []));
    if (typeof s.nextId === 'number') idRef.current = Math.max(idRef.current, s.nextId);
    if (typeof s.paperIdx === 'number') setPaperIdx(s.paperIdx);
    if (s.orientation) setOrientation(s.orientation);
    if (typeof s.useCustomPaper === 'boolean') setUseCustomPaper(s.useCustomPaper);
    if (s.customPaper) setCustomPaper(s.customPaper);
    if (s.paperStyleId) setPaperStyleId(s.paperStyleId);
    if (s.selectedPenId) setSelectedPenId(s.selectedPenId);
    if (s.mode) setMode(s.mode);
    setMagnets(s.magnets ?? []);
    setProjectName(project.name || fallbackName);
    setAlert(`Opened ${project.name || fallbackName}.`);
  }

  /** Save the job to the operator's own machine, as a file they can keep. */
  function downloadProject() {
    const name = projectName.trim() || 'Untitled';
    const blob = new Blob([JSON.stringify(makeProject(name, currentSession(), pens), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadFileName(name);
    a.click();
    // Revoking immediately can cancel the download in some browsers; a tick is
    // enough for the click to have taken the URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAlert(`Saved ${a.download}.`);
  }

  async function openProjectFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      openProject(JSON.parse(await file.text()), file.name.replace(/\.plot\.json$/i, ''));
    } catch {
      setAlert(`Could not read ${file.name} — it is not a project file.`);
    }
  }

  function saveProjectToPi() {
    const name = projectName.trim();
    if (!name) {
      setAlert('Give the project a name first.');
      return;
    }
    void ctrl()
      ?.saveProject(name, makeProject(name, currentSession(), pens))
      .then(() => setAlert(`Saved "${name}" on the plotter.`))
      .catch((err) => setAlert(String((err as Error).message ?? err)));
  }

  function restack(delta: number) {
    if (plotting || selectedIds.length === 0) return;
    setItems((list) => reorderMany(list, selectedIds, delta));
  }

  /** Remove one object (the ✕ in the artwork list), selected or not. */
  function removeItem(id: string) {
    flattenAbort.current.aborted = true; // stop any in-flight derive/import work
    sourcesRef.current.delete(id);
    setItems((list) => list.filter((i) => i.id !== id));
    setSelectedIds((sel) => sel.filter((x) => x !== id));
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
  function onPlaceOnPage() {
    if (!selectedItem) return;
    updatePlacement(
      selectedItem.id,
      placeOnPage(
        selectedItem.widthMm,
        selectedItem.heightMm,
        selectedItem.pageOffset,
        selectedItem.placement,
      ),
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
    if (hitMagnets.length > 0) {
      // Geometry through a magnet cannot be routed around: the tool has to be
      // there. Stopping here costs a sheet; not stopping costs the work origin.
      setAlert(`Cannot plot through ${magnetConflicts.join(', ')} — move it, or move the artwork.`);
      return;
    }
    startProgram(
      program,
      `plot start — ${program.length} G-code lines, ${displayItems.length} artwork(s), ` +
        `${penGroups.length} pen(s)`,
    );
  }

  function startProgram(gc: string[], logLine: string) {
    const c = ctrl();
    if (!c) return;
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
    pushLog('SYS', logLine);
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

  const wizardItem = wizardFor ? (items.find((i) => i.id === wizardFor) ?? null) : null;
  const updateAvailable = isNewerVersion(latestVersion, appVersion);
  const updating = updateStatus?.state === 'downloading' || updateStatus?.state === 'installing';

  return (
    <div className="flex h-dvh flex-col bg-slate-100 text-slate-800">
      {wizardItem && (
        <RegistrationWizard
          artName={wizardItem.name}
          points={wizardItem.calibrationPoints ?? []}
          pageOffset={wizardItem.pageOffset}
          penPos={penPos}
          connected={connected}
          busy={plotting || !!progress}
          jogStep={jogStep}
          setJogStep={setJogStep}
          onJog={jogBy}
          onPenUp={() => void ctrl()?.penUp()}
          onPenDown={() => void ctrl()?.penDown()}
          onApply={(pl) => {
            updatePlacement(wizardItem.id, pl);
            setSelectedId(wizardItem.id);
            setWizardFor(null);
            setAlert(
              `Registered ${wizardItem.name}: rotation ${pl.rotation.toFixed(2)}°, offset ${pl.x.toFixed(1)}, ${pl.y.toFixed(1)} mm.`,
            );
          }}
          onCancel={() => setWizardFor(null)}
        />
      )}
      {pdfPick && (
        <PdfPagePicker
          name={pdfPick.name}
          pages={pdfPick.doc.numPages}
          onPick={(n) => void importPdfPage(pdfPick.name, pdfPick.doc, n)}
          onCancel={() => {
            void pdfPick.doc.destroy();
            setPdfPick(null);
          }}
        />
      )}
      {importing && (
        <ImportWizard
          name={importing.name}
          source={importing.source}
          initial={importing.initial}
          contourOnly={cutting}
          onCancel={() => setImporting(null)}
          onConfirm={(result, spec) => {
            const { artId, name, source } = importing;
            setImporting(null);
            if (artId) {
              // Reopened: replace that object's geometry, keeping its placement,
              // pen and position in the stack — the operator is retuning the
              // same drawing, not adding another one.
              setItems((list) =>
                list.map((i) =>
                  i.id === artId
                    ? {
                        ...i,
                        master: result.polylines,
                        widthMm: result.widthMm,
                        heightMm: result.heightMm,
                        importSpec: spec,
                      }
                    : i,
                ),
              );
              return;
            }
            const id = addArtwork(
              name,
              'png',
              { polylines: result.polylines, widthMm: result.widthMm, heightMm: result.heightMm },
              { ...DEFAULT_CONTROLS },
              { kind: 'png', field: source },
            );
            setItems((list) => list.map((i) => (i.id === id ? { ...i, importSpec: spec } : i)));
          }}
        />
      )}
      {penChange && (
        <PenChangePrompt
          label={penChange.label}
          color={pens.find((pen) => pen.name === penChange.label)?.color}
          done={progress ? `${Math.round(fracDone * 100)}%` : ''}
          onContinue={() => {
            // Clear locally at once so the prompt cannot be answered twice; the
            // daemon ignores a stray continue anyway, but two clients both
            // pressing it should not leave one of them showing a stale prompt.
            penChangeRef.current = false;
            ackChangedAtRef.current = Date.now(); // fresh stall window after the swap
            setPenChange(null);
            pushLog('SYS', 'pen change confirmed — continuing');
            void ctrl()
              ?.continueProgram()
              .catch((e) => setAlert(String((e as Error).message ?? e)));
          }}
        />
      )}
      {showSettings && (
        <SettingsPage
          cal={cal}
          onCalField={setCalField}
          pens={pens}
          onPens={(next) => setSettings((prev) => ({ ...prev, pens: next }))}
          knife={knife}
          onKnife={(key) => (value) =>
            setSettings((prev) => ({ ...prev, knife: { ...prev.knife, [key]: value } }))
          }
          grbl={grbl}
          connected={connected}
          firmwareVersion={version}
          appVersion={appVersion}
          latestVersion={latestVersion}
          updateAvailable={updateAvailable}
          plotting={plotting}
          onUpdate={() =>
            void ctrl()
              ?.update()
              .catch(() => undefined)
          }
          onClose={() => setShowSettings(false)}
        />
      )}
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
          <label className="text-xs" htmlFor="job-mode">
            Mode
          </label>
          <select
            id="job-mode"
            className={field}
            value={mode}
            title="Draw with a pen, or cut with a drag knife"
            onChange={(e) => setMode(e.target.value as 'draw' | 'cut')}
          >
            <option value="draw">Draw</option>
            <option value="cut">Cut</option>
          </select>
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
          <select
            className={field}
            value={paperStyleId}
            title="Paper type — preview only; it changes nothing about what is plotted"
            aria-label="Paper type"
            onChange={(e) => setPaperStyleId(e.target.value)}
          >
            {PAPER_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            className={btn}
            title="Settings — machine, pen, feeds, import defaults"
            aria-label="Settings"
            onClick={() => setShowSettings(true)}
          >
            ⚙
          </button>
          <button
            className={btnPrimary}
            disabled={!connected || items.length === 0}
            onClick={onPlot}
          >
            {cutting ? '✂ Cut' : '▶ Plot'}
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
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col md:order-2 md:h-auto md:w-auto md:flex-1">
          <EditToolbar
            count={selectedIds.length}
            total={items.length}
            canPaste={clipboardCount > 0}
            locked={plotting}
            onSelectAll={() => setSelectedIds(items.map((i) => i.id))}
            onSelectNone={() => setSelectedIds([])}
            onCopy={copySelection}
            onPaste={pasteClipboard}
            onDuplicate={duplicateSelection}
            onDelete={deleteSelection}
            onForward={() => restack(1)}
            onBackward={() => restack(-1)}
          />
          <div ref={canvasBox} className="relative min-h-0 w-full min-w-0 flex-1 bg-slate-200">
            {size.width > 0 && (
              <PlotCanvas
                width={size.width}
                height={size.height}
                bedW={bedW}
                bedH={bedH}
                paperW={paper.widthMm}
                paperH={paper.heightMm}
                paperStyleId={paperStyleId}
                cutting={cutting}
                magnets={magnets}
                magnetsHit={hitMagnets.map((m) => m.id)}
                onMagnetMove={plotting ? undefined : moveMagnet}
                travel={travelPreview}
                cutPath={cutPreview}
                artworks={displayItems}
                selectedIds={selectedIds}
                onSelect={selectObject}
                onSelectMany={setSelectedIds}
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
        </div>

        {/* Controls: a compact bottom row on phones; dissolves into the columns on desktop. */}
        <div className="flex max-h-[50%] min-h-0 shrink-0 overflow-hidden md:contents">
          {/* Left panel */}
          <aside className="w-1/2 shrink-0 overflow-y-auto border-r border-slate-300 bg-white p-3 text-sm md:order-1 md:w-60">
            {/* Phones: import only, and the camera — the point of #56 is that a
                sketch on paper can be photographed and traced without leaving
                the app, which is a thing you do standing at the machine. The
                placement controls stay on the desktop layout. */}
            <Section title="Artwork" className="md:hidden">
              <label className={`${btnPrimary} block cursor-pointer text-center`}>
                Take photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onLoadImage}
                  className="hidden"
                />
              </label>
              <label className={`${btn} mt-1 block cursor-pointer text-center`}>
                + Image
                <input
                  type="file"
                  accept="image/*,application/pdf,.svg,.pdf,.heic,.heif"
                  onChange={onLoadImage}
                  className="hidden"
                />
              </label>
            </Section>

            <Section title="Artwork" className="hidden md:block">
              <label className={`${btnPrimary} block w-full cursor-pointer text-center`}>
                + Image
                <input
                  type="file"
                  accept="image/*,application/pdf,.svg,.pdf,.heic,.heif"
                  onChange={onLoadImage}
                  className="hidden"
                />
              </label>

              <div className="mt-1.5 grid grid-cols-4 gap-1">
                <button className={btn} title="Add a line" onClick={() => addShape('line')}>
                  Line
                </button>
                <button className={btn} title="Add a rectangle" onClick={() => addShape('rect')}>
                  Rect
                </button>
                <button className={btn} title="Add an ellipse" onClick={() => addShape('ellipse')}>
                  Ellipse
                </button>
                <button className={btn} title="Add a polygon" onClick={() => addShape('polygon')}>
                  Polygon
                </button>
                <button
                  className={`${btn} col-span-4`}
                  title="Add text, drawn with the single-line plotter font"
                  onClick={() => addDrawn('Text', { ...DEFAULT_TEXT })}
                >
                  + Text
                </button>
              </div>

              {items.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {items.map((it) => (
                    <li
                      key={it.id}
                      className={`flex items-center gap-1 rounded border px-2 py-1 text-xs ${
                        selectedIds.includes(it.id)
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200'
                      }`}
                    >
                      <button
                        className="min-w-0 flex-1 truncate text-left"
                        onClick={(e) => selectObject(it.id, e.shiftKey || e.metaKey || e.ctrlKey)}
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
                <button
                  className={`${btn} col-span-2`}
                  disabled={!selectedItem}
                  onClick={onPlaceOnPage}
                  title="1:1 at the position the file gives it, so file mm = paper mm (registration cuts)"
                >
                  Place on page
                </button>
              </div>
              <label className={`mt-2 flex items-center gap-1.5 ${cutting ? 'hidden' : ''}`}>
                <span className="text-xs text-slate-600">Pen</span>
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300"
                  style={{ backgroundColor: activePen.color }}
                />
                <select
                  className={`${field} min-w-0 flex-1`}
                  value={activePen.id}
                  disabled={plotting}
                  title={
                    selectedItem
                      ? `Pen for ${selectedItem.name}`
                      : 'Pen newly imported artwork is drawn with'
                  }
                  onChange={(e) => setPen(e.target.value)}
                >
                  {pens.map((pen) => (
                    <option key={pen.id} value={pen.id}>
                      {pen.name} · {pen.widthMm} mm
                    </option>
                  ))}
                </select>
              </label>
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
              <StepPicker value={jogStep} onChange={setJogStep} />
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

            <Section title="Projects" collapsible>
              <p className="mb-1.5 text-xs text-slate-500">
                A project is the whole job — artwork, placement, pens, paper, mode and magnets.
                Saved on the plotter it is reachable from any device; saved to this machine it is a
                file you keep.
              </p>
              <input
                className={`${field} mb-1 w-full`}
                placeholder="Project name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-1">
                <button
                  className={btn}
                  disabled={!connected || items.length === 0}
                  title="Store this job on the plotter"
                  onClick={saveProjectToPi}
                >
                  Save to plotter
                </button>
                <button
                  className={btn}
                  disabled={items.length === 0}
                  title="Download this job as a file"
                  onClick={downloadProject}
                >
                  Save to this device
                </button>
                <label className={`${btn} col-span-2 cursor-pointer text-center`}>
                  Open a project file…
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={openProjectFile}
                    className="hidden"
                  />
                </label>
              </div>
              {projects.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {projects.map((p) => (
                    <li
                      key={p.name}
                      className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs"
                    >
                      <button
                        className="min-w-0 flex-1 truncate text-left"
                        title={p.savedAt ? `Saved ${new Date(p.savedAt).toLocaleString()}` : ''}
                        onClick={() => void ctrl()?.loadProject(p.name)}
                      >
                        {p.name}
                      </button>
                      <button
                        className="shrink-0 px-1 text-slate-400 hover:text-red-600"
                        title="Delete from the plotter"
                        onClick={() => void ctrl()?.deleteProject(p.name)}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {connected && projects.length === 0 && (
                <p className="mt-1 text-[10px] text-slate-400">No projects on the plotter yet.</p>
              )}
            </Section>

            <Section title="Magnets" collapsible>
              <p className="mb-1.5 text-xs text-slate-500">
                The bed has no vacuum. A magnet the carriage hits at travel speed drags the sheet
                and takes the work origin with it — so tell the app where they are.
              </p>
              <div className="grid grid-cols-2 gap-1">
                <button className={btn} onClick={() => suggestMagnets()}>
                  Suggest
                </button>
                <button className={btn} onClick={() => addMagnet()}>
                  Add one
                </button>
              </div>
              {magnets.length > 0 && (
                <>
                  <ul className="mt-2 space-y-1">
                    {magnets.map((m) => {
                      const hit = hitMagnets.some((h) => h.id === m.id);
                      return (
                        <li
                          key={m.id}
                          className={`flex items-center gap-1 rounded border px-2 py-1 text-xs ${
                            hit ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200'
                          }`}
                        >
                          <span className="flex-1 tabular-nums">
                            {m.x.toFixed(0)}, {m.y.toFixed(0)} mm
                          </span>
                          <input
                            type="number"
                            className={`${field} w-14`}
                            value={m.radiusMm}
                            step={1}
                            min={1}
                            aria-label="Keep-out radius in mm"
                            onChange={(e) =>
                              setMagnets((list) =>
                                list.map((x) =>
                                  x.id === m.id
                                    ? { ...x, radiusMm: Math.max(1, Number(e.target.value)) }
                                    : x,
                                ),
                              )
                            }
                          />
                          <button
                            className="px-1 text-slate-400 hover:text-red-600"
                            title="Remove"
                            onClick={() => setMagnets((list) => list.filter((x) => x.id !== m.id))}
                          >
                            ✕
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-1 text-[10px] text-slate-400">
                    Drag a magnet on the canvas to move it. The circle is the keep-out zone, not the
                    magnet.
                  </p>
                  {hitMagnets.length > 0 && (
                    <p className="mt-1 text-xs text-red-600">
                      Plotting is blocked: {magnetConflicts.join(', ')}.
                    </p>
                  )}
                </>
              )}
            </Section>

            <Section title="Registration">
              {!selectedItem?.calibrationPoints?.length ? (
                <p className="text-xs text-slate-500">
                  {selectedItem
                    ? 'No calibration points in this artwork. Put crosshairs on a layer named “calibration” (or ids cal-…), or draw them pure blue.'
                    : 'Select an artwork with calibration points.'}
                </p>
              ) : (
                <>
                  <ul className="mb-1.5 text-xs text-slate-600">
                    {selectedItem.calibrationPoints.map((p, i) => (
                      <li key={p.name + i} className="flex justify-between">
                        <span>{p.name}</span>
                        <span className="tabular-nums">
                          page {(p.x + (selectedItem.pageOffset?.x ?? 0)).toFixed(1)},{' '}
                          {(p.y + (selectedItem.pageOffset?.y ?? 0)).toFixed(1)} mm
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    className={`${btnPrimary} w-full`}
                    disabled={plotting}
                    onClick={() => setWizardFor(selectedItem.id)}
                    title="Jog the pen onto each printed point; the cut lines are then fitted to where the sticker really is"
                  >
                    Register…
                  </button>
                </>
              )}
            </Section>

            <Section title="Drawing controls" collapsible>
              {!selectedItem && (
                <p className="text-xs text-slate-500">Select an artwork to fine-tune its look.</p>
              )}
              {selectedItem && (
                <>
                  {plotting && (
                    <p className="mb-1.5 text-xs text-amber-600">Locked while plotting.</p>
                  )}
                  {!plotting && !sourceAvailable && !selectedItem.spec && (
                    <p className="mb-1.5 text-xs text-slate-500">
                      Re-import to re-tune source controls (the current look is kept).
                    </p>
                  )}
                  {selectedItem.importSpec && sourceAvailable && (
                    <button
                      className={`${btn} mb-2 w-full`}
                      disabled={plotting}
                      onClick={() => reopenImport(selectedItem)}
                    >
                      Reopen import wizard…
                    </button>
                  )}
                  {selectedItem.spec ? (
                    <SpecEditor
                      spec={selectedItem.spec}
                      disabled={plotting}
                      onChange={(spec) => setSpec(selectedItem.id, spec)}
                    />
                  ) : selectedItem.importSpec ? (
                    // The wizard owns this object's conversion. Showing the old
                    // inline threshold/levels sliders too would give two
                    // controls for one thing, and moving one would silently
                    // throw away what the wizard produced.
                    <p className="mb-1.5 text-xs text-slate-500">
                      Converted with the import wizard — reopen it to change the algorithm or its
                      settings.
                    </p>
                  ) : selectedItem.kind === 'png' ? (
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

/** Which page of a multi-page PDF to import. */
function PdfPagePicker(props: {
  name: string;
  pages: number;
  onPick: (page: number) => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a PDF page"
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
        <h2 className="truncate text-sm font-semibold">{props.name}</h2>
        <p className="mt-1 text-xs text-slate-500">
          {props.pages} pages. Which one do you want to plot?
        </p>
        <div className="mt-3 flex max-h-56 flex-wrap gap-1 overflow-y-auto">
          {Array.from({ length: props.pages }, (_, i) => (
            <button key={i} className={btn} onClick={() => props.onPick(i + 1)}>
              {i + 1}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button className={btn} onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Blocks the screen while the machine waits for a pen. It is modal on purpose:
 * the job is halted with the carriage parked, nothing else in the app can
 * usefully be done, and the one thing that matters is that the operator loads
 * the named pen before pressing Continue.
 */
function PenChangePrompt(props: {
  label: string;
  color?: string;
  done: string;
  onContinue: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Load the next pen"
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold">Load the next pen</h2>
        <p className="mt-2 flex items-center gap-2 text-sm">
          {props.color && (
            <span
              className="h-4 w-4 shrink-0 rounded-full border border-slate-300"
              style={{ backgroundColor: props.color }}
            />
          )}
          <span className="font-semibold">{props.label || 'the next pen'}</span>
        </p>
        <p className="mt-2 text-xs text-slate-500">
          The carriage is parked at the work origin with the pen up. Swap the pen, then continue —
          the plot picks up exactly where it stopped.
          {props.done ? ` ${props.done} of the job is drawn.` : ''}
        </p>
        <div className="mt-4 flex justify-end">
          <button className={btnPrimary} onClick={props.onContinue}>
            Pen loaded — continue
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The editing toolbar: what acts on the *selection*, kept above the canvas
 * where the selection is. Everything here is also a keyboard shortcut — the
 * buttons exist because a touch screen has no Cmd key, and because they say
 * what the shortcuts are.
 */
function EditToolbar(props: {
  count: number;
  total: number;
  canPaste: boolean;
  locked: boolean;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onForward: () => void;
  onBackward: () => void;
}) {
  const none = props.count === 0;
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-300 bg-white px-2 py-1 text-xs">
      <span className="mr-1 text-slate-500">
        {props.count > 0 ? `${props.count} selected` : `${props.total} object(s)`}
      </span>
      <button
        className={btn}
        disabled={props.total === 0}
        title="Select all (⌘A)"
        onClick={
          props.count === props.total && props.total > 0 ? props.onSelectNone : props.onSelectAll
        }
      >
        {props.count === props.total && props.total > 0 ? 'Select none' : 'Select all'}
      </button>
      <button className={btn} disabled={none} title="Copy (⌘C)" onClick={props.onCopy}>
        Copy
      </button>
      <button
        className={btn}
        disabled={!props.canPaste || props.locked}
        title="Paste (⌘V)"
        onClick={props.onPaste}
      >
        Paste
      </button>
      <button
        className={btn}
        disabled={none || props.locked}
        title="Duplicate (⌘D)"
        onClick={props.onDuplicate}
      >
        Duplicate
      </button>
      <button
        className={btn}
        disabled={none || props.locked}
        title="Bring forward"
        onClick={props.onForward}
      >
        ↑
      </button>
      <button
        className={btn}
        disabled={none || props.locked}
        title="Send backward"
        onClick={props.onBackward}
      >
        ↓
      </button>
      <button
        className={btn}
        disabled={none || props.locked}
        title="Delete (⌫)"
        onClick={props.onDelete}
      >
        Delete
      </button>
      {props.locked && <span className="text-amber-600">Locked while plotting</span>}
    </div>
  );
}

/**
 * Editor for a drawn object. Unlike the import controls next to it, these
 * regenerate the geometry outright rather than retuning a retained source — so
 * they are cheap, immediate, and still work after a reload (the spec is saved
 * with the session; an import's source is not).
 */
function SpecEditor(props: {
  spec: ObjectSpec;
  disabled?: boolean;
  onChange: (spec: ObjectSpec) => void;
}) {
  const { spec, disabled, onChange } = props;
  if (spec.kind === 'shape') {
    return (
      <>
        <Slider
          label="Width (mm)"
          value={spec.widthMm}
          min={1}
          max={1000}
          step={1}
          disabled={disabled}
          onChange={(v) => onChange({ ...spec, widthMm: v })}
        />
        <Slider
          label="Height (mm)"
          value={spec.heightMm}
          min={1}
          max={1000}
          step={1}
          disabled={disabled}
          onChange={(v) => onChange({ ...spec, heightMm: v })}
        />
        {spec.shape === 'polygon' && (
          <Slider
            label="Sides"
            value={spec.sides}
            min={3}
            max={24}
            step={1}
            disabled={disabled}
            onChange={(v) => onChange({ ...spec, sides: v })}
          />
        )}
      </>
    );
  }
  const missing = missingGlyphs(spec.text);
  return (
    <>
      <label className="mb-2 block">
        <span className="text-xs text-slate-600">Text</span>
        <textarea
          className={`${field} mt-1 w-full`}
          rows={2}
          value={spec.text}
          disabled={disabled}
          onChange={(e) => onChange({ ...spec, text: e.target.value })}
        />
      </label>
      <Slider
        label="Size (mm)"
        value={spec.sizeMm}
        min={2}
        max={200}
        step={1}
        disabled={disabled}
        onChange={(v) => onChange({ ...spec, sizeMm: v })}
      />
      <Slider
        label="Letter spacing (mm)"
        value={spec.letterSpacingMm}
        min={-2}
        max={10}
        step={0.5}
        disabled={disabled}
        onChange={(v) => onChange({ ...spec, letterSpacingMm: v })}
      />
      <Slider
        label="Line spacing"
        value={spec.lineSpacing}
        min={1}
        max={3}
        step={0.1}
        disabled={disabled}
        onChange={(v) => onChange({ ...spec, lineSpacing: v })}
      />
      {missing.length > 0 && (
        <p className="text-[10px] text-amber-600">
          Not in this font, so not drawn: {missing.join(' ')}
        </p>
      )}
    </>
  );
}

// ---- small presentational helpers ----

// Transport controls (Pause/Resume/Stop): large touch targets on phones,
// compact on desktop (md:) where they match the regular `btn` size.
const transportBtn =
  'rounded border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40 md:px-2 md:py-1 md:text-xs';

/**
 * A panel on the main page. `collapsible` starts it closed: the per-artwork
 * drawing controls are wanted next to the artwork but not in the way of the
 * job, and closed-by-default is also what makes them usable on a phone, where
 * the whole control strip is half the screen.
 */
function Section(props: {
  title: string;
  children: React.ReactNode;
  className?: string;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(!props.collapsible);
  const heading = 'text-xs font-semibold uppercase tracking-wide text-slate-500';
  return (
    <section className={`mb-4 ${props.className ?? ''}`}>
      {props.collapsible ? (
        <button
          className={`mb-1.5 flex w-full items-center gap-1 ${heading}`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="text-[10px]">{open ? '▾' : '▸'}</span>
          {props.title}
        </button>
      ) : (
        <h2 className={`mb-1.5 ${heading}`}>{props.title}</h2>
      )}
      {(!props.collapsible || open) && props.children}
    </section>
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
    // Measure once up front. ResizeObserver delivery is throttled in a hidden or
    // backgrounded tab, and the canvas only mounts once it has a size — without
    // this, a tab restored from the background can come back to an empty page.
    const r0 = el.getBoundingClientRect();
    if (r0.width > 0 && r0.height > 0) setSize({ width: r0.width, height: r0.height });
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
