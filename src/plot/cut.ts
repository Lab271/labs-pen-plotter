/**
 * Cutting-mode geometry: what a drag knife needs that a pen does not.
 *
 * A drag knife is not mounted on the axis it cuts along — the blade tip trails
 * behind the holder's pivot by a fraction of a millimetre. It also cannot be
 * "lifted at exactly the right instant": a contour that stops precisely where it
 * started leaves the last fraction of a millimetre uncut, and the piece stays
 * attached by a whisker of vinyl.
 *
 * Both are geometry problems, so they are solved here, on polylines, rather than
 * in the G-code writer — which stays the same one the pen uses.
 */
import { applyTabs, DEFAULT_TABS, type TabOptions } from './tabs';
import type { Point, Polyline } from './types';

export interface CutOptions extends TabOptions {
  /**
   * How far past the closure point the blade keeps cutting, in mm. Without it
   * the loop does not release; with too much it cuts into the neighbouring
   * piece. 0 disables it.
   */
  overcutMm: number;
  /**
   * Distance the blade tip trails the holder's pivot, in mm. Compensation is
   * only correct when this matches the physical blade; 0 disables it.
   */
  bladeOffsetMm: number;
}

export const DEFAULT_CUT_OPTIONS: CutOptions = {
  ...DEFAULT_TABS,
  overcutMm: 1,
  // Off by default: a wrong offset is worse than none, and the right value has
  // to be measured on the actual blade holder.
  bladeOffsetMm: 0,
};

/** Distance below which two points are treated as the same place. */
const EPS_MM = 1e-6;

/**
 * How far a contour's end may miss its start and still count as closed.
 *
 * Not a floating-point epsilon: a closed path in an SVG comes through the
 * flattener as *sampled points*, and the last sample lands wherever the
 * sampling step put it — tens of microns to a couple of tenths of a millimetre
 * from the first. Judging closure at machine epsilon therefore calls every real
 * contour "open", which silently disables the overcut and leaves every piece
 * attached by the last whisker of vinyl. (That is exactly what it did, until a
 * cut of a flattened rectangle came out with no overcut at all.)
 *
 * 0.25 mm is narrower than the blade's own kerf, so a gap this small is not a
 * gap anyone could see or cut around.
 */
export const CLOSURE_TOLERANCE_MM = 0.25;

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * True when a polyline ends where it began — the definition of a contour that
 * can be cut out. Nothing else in the pipeline knew this, because a pen does
 * not care.
 */
export function isClosed(poly: Polyline, epsMm = CLOSURE_TOLERANCE_MM): boolean {
  return poly.length >= 3 && dist(poly[0], poly[poly.length - 1]) <= epsMm;
}

/** Total length of a polyline, in mm. */
export function polylineLength(poly: Polyline): number {
  let total = 0;
  for (let i = 1; i < poly.length; i++) total += dist(poly[i - 1], poly[i]);
  return total;
}

/**
 * Continue a closed contour past its start point by `overcutMm`, following the
 * shape it already cut. An open polyline is returned untouched: there is no
 * closure to secure, and extending it would cut into material the operator did
 * not ask to cut.
 */
export function applyOvercut(poly: Polyline, overcutMm: number): Polyline {
  if (overcutMm <= 0 || !isClosed(poly)) return poly;
  const out = [...poly];
  let remaining = overcutMm;
  // Walk forward from the start, re-tracing the beginning of the contour.
  for (let i = 1; i < poly.length && remaining > 0; i++) {
    const a = poly[i - 1];
    const b = poly[i];
    const seg = dist(a, b);
    if (seg <= EPS_MM) continue;
    if (seg >= remaining) {
      const t = remaining / seg;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      remaining = 0;
    } else {
      out.push(b);
      remaining -= seg;
    }
  }
  return out;
}

/**
 * Blade-offset compensation at corners.
 *
 * The blade trails the pivot, so at a corner it is still pointing the old way
 * and has to be swung round before it cuts the new direction. Left alone it
 * rounds the corner off, taking a bite out of the piece. The standard fix is to
 * overshoot each corner by the trailing distance, so the blade has swivelled by
 * the time the cut resumes.
 *
 * Only corners sharper than `minAngleDeg` are compensated: on a smooth curve
 * every vertex is a "corner", and inserting an overshoot at each one would turn
 * a circle into a polygon of spikes.
 */
export function applyBladeOffset(poly: Polyline, offsetMm: number, minAngleDeg = 20): Polyline {
  if (offsetMm <= 0 || poly.length < 3) return poly;
  const minTurn = (minAngleDeg * Math.PI) / 180;
  const out: Polyline = [poly[0]];
  for (let i = 1; i < poly.length - 1; i++) {
    const prev = poly[i - 1];
    const cur = poly[i];
    const next = poly[i + 1];
    const inLen = dist(prev, cur);
    const outLen = dist(cur, next);
    if (inLen <= EPS_MM || outLen <= EPS_MM) {
      out.push(cur);
      continue;
    }
    const inAngle = Math.atan2(cur.y - prev.y, cur.x - prev.x);
    const outAngle = Math.atan2(next.y - cur.y, next.x - cur.x);
    let turn = outAngle - inAngle;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    if (Math.abs(turn) < minTurn) {
      out.push(cur);
      continue;
    }
    // Overshoot along the incoming direction, then come back along the outgoing
    // one: the blade swivels during the overshoot instead of during the cut.
    out.push(cur);
    out.push({
      x: cur.x + Math.cos(inAngle) * offsetMm,
      y: cur.y + Math.sin(inAngle) * offsetMm,
    });
    out.push(cur);
  }
  out.push(poly[poly.length - 1]);
  return out;
}

/**
 * Prepare polylines for cutting: blade-offset compensation, then overcut, then
 * holding tabs.
 *
 * The order is the whole design. Compensation inserts corner overshoots, which
 * change the path's start and end neighbourhood, so the overcut has to come
 * after it to re-trace the path the blade actually follows. Tabs come last
 * because they *split* the path — after them there is no closed contour left
 * for the overcut to recognise, and it would silently do nothing.
 *
 * Whether the contour was closed is decided once, up front, and carried
 * through: it is a property of the artwork, not of the intermediate path.
 */
export function prepareForCut(polylines: Polyline[], opts: CutOptions): Polyline[] {
  return polylines.flatMap((poly) => {
    const closed = isClosed(poly);
    const compensated = applyBladeOffset(poly, opts.bladeOffsetMm);
    const overcut = applyOvercut(compensated, opts.overcutMm);
    return applyTabs(overcut, {
      tabWidthMm: opts.tabWidthMm,
      tabCount: opts.tabCount,
      minContourMm: opts.minContourMm,
      closed,
      // Keep tabs out of the stretch the overcut re-traces, or the overcut
      // cuts straight through the first bridge and both features look broken.
      protectStartMm: opts.overcutMm,
    });
  });
}
