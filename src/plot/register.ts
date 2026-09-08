import type { Placement, Point } from './types';

/** Result of fitting an artwork's calibration points to measured machine positions. */
export interface RegistrationFit {
  /** Placement that maps the artwork frame onto the measured points (scale fixed at 1). */
  placement: Placement;
  /** Per-point distance between the fitted position and the measurement, mm. */
  residuals: number[];
  /** Root-mean-square of the residuals, mm. */
  rms: number;
  /**
   * Scale the measurements imply relative to the file (1 = printed at true size).
   * Reported, not applied: a sticker is cut 1:1, so a deviation is a warning
   * that the print or the measurement is off, not something to correct for.
   */
  impliedScale: number;
}

/**
 * Least-squares rigid fit (rotation + translation, no scale) of the artwork's
 * calibration points onto the work positions the operator jogged to.
 *
 * Same transform convention as placePolylines: paper = t + R(θ)·local with
 * R = [[cos, −sin], [sin, cos]] on a Y-down page, so the result drops straight
 * into a Placement. This is the 2-D Kabsch/Procrustes solution: centre both
 * sets, θ = atan2(Σ cross, Σ dot) of the centred pairs, then t from the
 * centroids. With two points it is exact up to the scale mismatch; with three
 * the third point is the check and shows up in the residuals. One point gives a
 * pure translation.
 *
 * Why not solve for scale too: the sticker is printed 1:1 and the cut must
 * match its real size, not stretch to a mis-measured point. The implied scale
 * is returned so the wizard can warn when the measurements disagree with the
 * print by more than a printer would.
 */
export function fitRegistration(local: Point[], measured: Point[]): RegistrationFit {
  const n = Math.min(local.length, measured.length);
  if (n === 0) throw new Error('No points to fit.');
  const lc = centroid(local.slice(0, n));
  const qc = centroid(measured.slice(0, n));
  let dot = 0;
  let cross = 0;
  let la = 0;
  let qb = 0;
  for (let i = 0; i < n; i++) {
    const ax = local[i].x - lc.x;
    const ay = local[i].y - lc.y;
    const bx = measured[i].x - qc.x;
    const by = measured[i].y - qc.y;
    dot += ax * bx + ay * by;
    cross += ax * by - ay * bx;
    la += ax * ax + ay * ay;
    qb += bx * bx + by * by;
  }
  const theta = n >= 2 && la > 0 ? Math.atan2(cross, dot) : 0;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const t = { x: qc.x - (lc.x * cos - lc.y * sin), y: qc.y - (lc.x * sin + lc.y * cos) };
  const residuals: number[] = [];
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const fx = t.x + local[i].x * cos - local[i].y * sin;
    const fy = t.y + local[i].x * sin + local[i].y * cos;
    const d = Math.hypot(fx - measured[i].x, fy - measured[i].y);
    residuals.push(d);
    sq += d * d;
  }
  return {
    placement: { x: t.x, y: t.y, scale: 1, rotation: normalizeDeg((theta * 180) / Math.PI) },
    residuals,
    rms: Math.sqrt(sq / n),
    impliedScale: la > 0 ? Math.sqrt(qb / la) : 1,
  };
}

function centroid(pts: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

/** Wrap an angle into (−180, 180], the range the placement UI shows. */
function normalizeDeg(d: number): number {
  let r = ((((d + 180) % 360) + 360) % 360) - 180;
  if (r === -180) r = 180;
  return r;
}
