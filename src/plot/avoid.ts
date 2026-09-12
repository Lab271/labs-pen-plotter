/**
 * Routing travel around keep-out zones.
 *
 * `orderPolylines` picks the next stroke by nearest distance, so on an A0 bed a
 * pen-up leg can cross the whole sheet in a straight line — straight over a
 * hold-down magnet. The carriage then strikes it at travel feed, drags the
 * sheet, and the work origin is gone (no limit switches, nothing recovers it).
 *
 * The zones are few and far apart, so this does not need a general path
 * planner: pushing the leg out to the edge of the circle it clips, and then
 * doing the same to the two halves, converges on a path that hugs the zone.
 */
import type { Magnet } from './magnet';
import { distanceToSegment } from './magnet';
import type { Point, Polyline } from './types';

/** Extra clearance beyond the zone's own radius, so the detour does not graze it. */
const MARGIN_MM = 0.5;

/**
 * How many times a leg may be split. Each level halves the remaining clip, so
 * four is already well under a tenth of a millimetre for a realistic magnet —
 * and the cap matters more than the precision: an unbounded recursion on a
 * degenerate input would build G-code until the tab died.
 */
const MAX_DEPTH = 4;

const len = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const inside = (p: Point, z: Magnet) => len(p, { x: z.x, y: z.y }) <= z.radiusMm;

/** The zone this segment clips first, measured from `a`, or null if it clips none. */
function firstClipped(a: Point, b: Point, zones: readonly Magnet[]): Magnet | null {
  let best: Magnet | null = null;
  let bestDist = Infinity;
  for (const z of zones) {
    if (distanceToSegment({ x: z.x, y: z.y }, a, b) > z.radiusMm) continue;
    const d = len(a, { x: z.x, y: z.y });
    if (d < bestDist) {
      best = z;
      bestDist = d;
    }
  }
  return best;
}

/** Point on the segment closest to `c` (clamped to the segment's ends). */
function closestPoint(c: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return a;
  let t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/**
 * A travel path from `a` to `b` that stays out of the zones, as a polyline
 * including both endpoints.
 *
 * Returns the straight line when an endpoint is *inside* a zone: there is no
 * detour to make when the destination itself is in the keep-out, and that case
 * is geometry the operator has to fix (it is blocked before plotting) rather
 * than something routing can paper over.
 */
export function routeAround(
  a: Point,
  b: Point,
  zones: readonly Magnet[],
  depth = MAX_DEPTH,
): Polyline {
  if (zones.length === 0 || depth <= 0) return [a, b];
  const zone = firstClipped(a, b, zones);
  if (!zone) return [a, b];
  const centre = { x: zone.x, y: zone.y };
  if (inside(a, zone) || inside(b, zone)) return [a, b];

  const near = closestPoint(centre, a, b);
  const d = len(near, centre);
  // Push the closest approach out past the zone's edge. When the leg runs
  // through the centre there is no "outward" direction to use, so step off
  // perpendicular to the leg — either side is the same length.
  let ux: number;
  let uy: number;
  if (d > 1e-9) {
    ux = (near.x - centre.x) / d;
    uy = (near.y - centre.y) / d;
  } else {
    const legLen = len(a, b) || 1;
    ux = -(b.y - a.y) / legLen;
    uy = (b.x - a.x) / legLen;
  }
  const reach = zone.radiusMm + MARGIN_MM;
  const waypoint = { x: centre.x + ux * reach, y: centre.y + uy * reach };

  // Route each half as well: the two new legs may still clip this zone (or
  // another), and each pass takes a smaller bite than the last.
  const first = routeAround(a, waypoint, zones, depth - 1);
  const second = routeAround(waypoint, b, zones, depth - 1);
  return [...first.slice(0, -1), ...second];
}

/** True when a path stays clear of every zone. Used by tests and by the plot check. */
export function pathIsClear(path: Polyline, zones: readonly Magnet[]): boolean {
  for (let i = 1; i < path.length; i++) {
    for (const z of zones) {
      if (distanceToSegment({ x: z.x, y: z.y }, path[i - 1], path[i]) < z.radiusMm - 1e-6) {
        return false;
      }
    }
  }
  return true;
}
