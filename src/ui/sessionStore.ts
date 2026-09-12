import type { CalibrationPoint, Placement, Point, Polyline } from '../plot/types';
import type { ArtControls } from '../plot/controls';
import type { ShapeSpec } from '../plot/shapes';
import type { TextSpec } from '../plot/font';
import type { ImportSpec } from './ImportWizard';
import type { Magnet } from '../plot/magnet';
import type { Calibration } from '../grbl/settings';

/** A placed artwork as persisted (matches App's PlacedArt). */
export interface PersistedArt {
  id: string;
  name: string;
  /** What this object is, and so which controls apply (optional for old sessions). */
  kind?: 'svg' | 'png' | 'shape' | 'text';
  /**
   * For drawn objects: the parameters the geometry is generated from. Persisted
   * (unlike an import's source, which is in memory only) so text stays editable
   * after a reload — a label you cannot retype is barely a label.
   */
  spec?: ShapeSpec | TextSpec;
  /**
   * Imported images: the wizard settings that produced the geometry, so the
   * import can be reopened and retuned. The decoded image itself is not
   * persisted (it is large, and a session already carries the traced result).
   */
  importSpec?: ImportSpec;
  master: Polyline[];
  widthMm: number;
  heightMm: number;
  placement: Placement;
  /** Per-artwork drawing controls (optional for sessions saved before they existed). */
  controls?: ArtControls;
  /** Which pen draws this artwork (`Pen.id`). Optional for older sessions. */
  penId?: string;
  /** Page position and registration marks from import (optional: PNGs, old sessions). */
  pageOffset?: Point;
  calibrationPoints?: CalibrationPoint[];
}

/**
 * The editable session (artwork + page layout). Persisted in localStorage so
 * reopening the tab / reloading after a reconnect restores what you were
 * plotting — the daemon keeps the plot running, but the artwork is browser state.
 */
export interface Session {
  items: PersistedArt[];
  /** Last-selected object — kept for sessions written before multi-selection. */
  selectedId: string | null;
  /** The whole selection. Optional: older sessions only recorded one. */
  selectedIds?: string[];
  nextId: number;
  paperIdx: number;
  orientation: 'landscape' | 'portrait';
  useCustomPaper: boolean;
  customPaper: { widthMm: number; heightMm: number };
  /**
   * Which stock the canvas draws behind the artwork (`PAPER_STYLES` id).
   * Preview only — it never reaches the G-code. Optional for older sessions.
   */
  paperStyleId?: string;
  /** The pen newly imported artwork is assigned (`Pen.id`). Optional for older sessions. */
  selectedPenId?: string;
  /**
   * What this job is: drawing with a pen, or cutting with a drag knife. Part of
   * the session rather than the settings because it belongs to the job on the
   * bed — the sheet of vinyl is what makes it a cut. Optional for old sessions.
   */
  mode?: 'draw' | 'cut';
  /**
   * Where the hold-down magnets are. Session data because they belong to the
   * sheet currently on the bed, and they outlive a browser tab — the machine
   * is still holding the same sheet down.
   */
  magnets?: Magnet[];
  /**
   * Machine calibration, as pre-1.3 sessions carried it. Still read (so an old
   * session or an old daemon keeps a tuned setup) but no longer written: the
   * machine setup is app settings now, stored on the gateway — see
   * `src/gateway/appSettings.ts`.
   */
  calibration?: Calibration;
}

const KEY = 'penplotter271.session';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota exceeded (very large artwork) or storage unavailable — skip, no crash */
  }
}
