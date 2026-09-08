import type { PenOptions } from './gcode';
import type { Point } from './types';

export const MIN_PASSES = 1;
export const MAX_PASSES = 10;
export const DEFAULT_PASSES = 3;

/** Clamp an operator-entered pass count to the supported range (NaN → default). */
export function clampPasses(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PASSES;
  return Math.min(MAX_PASSES, Math.max(MIN_PASSES, Math.round(n)));
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * G-code for a registration check: touch the pen down once at each calibration
 * point, in order, and repeat for `passes` passes; start and end pen-up at the
 * work origin.
 *
 * Same tokens and pen model as generateGcode (G21/G90, travel feed for pen-up
 * moves, pen-down Z + settle dwell, pen-up Z + dwell), so the calibrated pen
 * depth and dwell apply and the plot-time estimate works unchanged. Points are
 * in paper mm — already placed — because the run must test the placement the
 * cut will use, not the file's coordinates.
 *
 * Why a mark rather than a hover: the printed dots are 0.4 mm radius. A touch
 * that lands inside the dot disappears; a miss is a visible offset the operator
 * reads with a loupe and types in as the correction. Repeating exposes lost
 * steps and backlash, which a single pass cannot.
 */
export function generateCalibrationGcode(
  points: Point[],
  passes: number,
  opts: PenOptions,
): string[] {
  const up = fmt(opts.penUpZ);
  const down = fmt(opts.penDownZ);
  const dwell = fmt(opts.dwellMs / 1000);
  const travel = Math.round(opts.travelFeed);
  const n = clampPasses(passes);

  const lines: string[] = ['G21', 'G90', `G0 Z${up}`];
  if (points.length > 0) {
    for (let pass = 0; pass < n; pass++) {
      for (const p of points) {
        lines.push(`G1 X${fmt(p.x)} Y${fmt(p.y)} F${travel}`);
        lines.push(`G0 Z${down}`, `G4 P${dwell}`);
        lines.push(`G0 Z${up}`, `G4 P${dwell}`);
      }
    }
  }
  lines.push(`G1 X0 Y0 F${travel}`);
  return lines;
}
