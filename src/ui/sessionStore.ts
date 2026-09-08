import type { CalibrationPoint, Placement, Point, Polyline } from '../plot/types';
import type { ArtControls } from '../plot/controls';
import type { Calibration } from '../grbl/settings';

/** A placed artwork as persisted (matches App's PlacedArt). */
export interface PersistedArt {
  id: string;
  name: string;
  /** 'svg' | 'png' — which source-stage controls apply (optional for old sessions). */
  kind?: 'svg' | 'png';
  master: Polyline[];
  widthMm: number;
  heightMm: number;
  placement: Placement;
  /** Per-artwork drawing controls (optional for sessions saved before they existed). */
  controls?: ArtControls;
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
  selectedId: string | null;
  nextId: number;
  paperIdx: number;
  orientation: 'landscape' | 'portrait';
  useCustomPaper: boolean;
  customPaper: { widthMm: number; heightMm: number };
  /** Machine calibration (pen Z, feeds incl. draw speed). Shared across devices so
   * a plot started from any device uses the same setup. Optional for old sessions. */
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
