/**
 * App-level settings, shared by every client of one gateway.
 *
 * These describe the *machine and the operator's preferences*, not the drawing:
 * one plotter has one setup, so the daemon owns them and every browser that
 * attaches adopts them. That is the opposite of the editable session (artwork +
 * page), which is a drawing the operator replaces all the time.
 *
 * Pure data + defaults, framework-free, so both the daemon (persisting to disk)
 * and the browser (reading it back) import the same shape and the same
 * normalisation. `normalizeAppSettings` is the only way settings should be
 * accepted from disk or from the wire: the file is operator-editable and an
 * older client may send a partial record, so every field falls back to its
 * default rather than trusting the input.
 */
import { DEFAULT_CALIBRATION, type Calibration } from '../grbl/settings';
import { DEFAULT_PENS, normalizePens, type Pen } from '../plot/pen';
import { DEFAULT_KNIFE, normalizeKnife, type KnifeProfile } from '../plot/knife';

export interface AppSettings {
  /**
   * Schema version. Bump only when a field's *meaning* changes (a rename or a
   * unit change) — adding a field needs no bump, because normalisation fills
   * missing ones from the defaults.
   */
  version: 1;
  /** Machine setup: work area, pen Z, dwell, feeds, and import defaults. */
  calibration: Calibration;
  /**
   * The pens the operator owns. A library, not a choice: which pen a piece of
   * artwork is drawn with is part of the drawing (the session), but the pens
   * that exist belong to the machine's shelf, so every client sees the same set.
   */
  pens: Pen[];
  /**
   * The drag-knife tool profile. Separate from the pen's calibration because
   * the two tools want different depths and feeds, and switching mode should
   * not mean re-typing either of them.
   */
  knife: KnifeProfile;
}

export const APP_SETTINGS_VERSION = 1;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  version: APP_SETTINGS_VERSION,
  calibration: { ...DEFAULT_CALIBRATION },
  pens: DEFAULT_PENS.map((p) => ({ ...p })),
  knife: { ...DEFAULT_KNIFE },
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Take the numeric fields of `DEFAULT_CALIBRATION` from `raw` where they are
 * real finite numbers, and the default everywhere else. A hand-edited settings
 * file with `"drawFeed": "fast"` must not put a `NaN` feed into a plot's
 * G-code, so the type check is on the value, not on the key's presence.
 */
function normalizeCalibration(raw: unknown): Calibration {
  const out = { ...DEFAULT_CALIBRATION };
  if (!isRecord(raw)) return out;
  for (const key of Object.keys(DEFAULT_CALIBRATION) as (keyof Calibration)[]) {
    const v = raw[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
  }
  return out;
}

/**
 * Merge anything (disk contents, a wire message, `undefined`) onto the defaults.
 * Always returns a fresh object — callers hold on to the result and edit it, so
 * sharing the defaults' nested objects would let one client's edit rewrite them.
 */
export function normalizeAppSettings(raw: unknown): AppSettings {
  const rec = isRecord(raw) ? raw : {};
  return {
    version: APP_SETTINGS_VERSION,
    calibration: normalizeCalibration(rec.calibration),
    pens: normalizePens(rec.pens),
    knife: normalizeKnife(rec.knife),
  };
}

/**
 * Settings carried by the pre-1.3 shared *session* blob, which is where machine
 * calibration used to live (see the `shared-calibration` change). Used once, to
 * seed the settings file on a daemon that is upgraded with a session already on
 * disk — otherwise the operator's tuned feeds would silently revert to defaults.
 */
export function appSettingsFromLegacySession(session: unknown): AppSettings | null {
  if (!isRecord(session) || !isRecord(session.calibration)) return null;
  return normalizeAppSettings({ calibration: session.calibration });
}
