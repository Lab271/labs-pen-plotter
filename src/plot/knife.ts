/**
 * The drag-knife tool profile: what the machine needs to *cut* rather than draw.
 *
 * Kept apart from the pen's calibration because the two tools disagree about
 * almost everything — the knife goes deeper, runs slower, and has two settings
 * (overcut, blade offset) that mean nothing to a pen. Switching mode should not
 * mean re-typing either tool's setup.
 */
import { DEFAULT_CUT_OPTIONS, type CutOptions } from './cut';

export interface KnifeProfile extends CutOptions {
  /** Z that puts the blade into the material (positive — inverted Z). */
  downZ: number;
  /** Z that lifts the blade clear (≤ 0). */
  upZ: number;
  /**
   * Settle dwell after a blade move, ms. Often shorter than a pen's: the blade
   * does not need ink to start flowing, only the holder to stop bouncing.
   */
  dwellMs: number;
  /** Feed rate while cutting, mm/min — slower than drawing. */
  cutFeed: number;
  /** Feed rate for blade-up travel, mm/min. */
  travelFeed: number;
}

export const DEFAULT_KNIFE: KnifeProfile = {
  downZ: 4,
  upZ: 0,
  dwellMs: 150,
  cutFeed: 800,
  travelFeed: 5000,
  ...DEFAULT_CUT_OPTIONS,
};

/** Largest sane value for any of the profile's millimetre settings. */
const MAX_MM = 50;

/**
 * Coerce a stored profile into a usable one. Same reasoning as the pen library:
 * these numbers become blade depth and feed rate in real G-code, so a hand-edit
 * that leaves a string or a NaN in the file must fall back to a default rather
 * than reach the machine.
 */
export function normalizeKnife(raw: unknown): KnifeProfile {
  const out = { ...DEFAULT_KNIFE };
  if (typeof raw !== 'object' || raw === null) return out;
  const rec = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_KNIFE) as (keyof KnifeProfile)[]) {
    const v = rec[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if ((key === 'overcutMm' || key === 'bladeOffsetMm') && (v < 0 || v > MAX_MM)) continue;
    out[key] = v;
  }
  return out;
}
