/**
 * Hold-down magnets: where they are, where they could go, and what they are in
 * the way of.
 *
 * The machine has no vacuum bed. Paper and vinyl are held down by magnets
 * dropped on the sheet, and a magnet in the carriage's path is not a cosmetic
 * problem: at travel feed the pen or knife holder strikes it, drags the sheet,
 * and the work origin is gone — with no limit switches, nothing recovers it.
 *
 * This module is the geometry of that: pure, so the question "does the toolpath
 * touch a magnet?" has one answer shared by the preview, the warning and (in
 * cutting) the routing.
 */
import { bounds } from './place';
import type { Point, Polyline } from './types';

export interface Magnet {
  /** Stable key, so a magnet can be moved and removed by identity. */
  id: string;
  /** Centre in paper mm. */
  x: number;
  y: number;
  /**
   * Radius of the keep-out circle: the magnet's own radius plus a safety
   * margin for the carriage. Not the magnet's physical size alone — what
   * matters is how close the tool may come to it.
   */
  radiusMm: number;
}

/** A 20 mm magnet with ~2 mm of clearance for the holder. */
export const DEFAULT_MAGNET_RADIUS_MM = 12;

/** How far a recommended magnet sits from the paper's edge, beyond its radius. */
const EDGE_MARGIN_MM = 4;

/** Shortest distance from a point to a line segment, in mm. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** True when any part of a polyline passes within the magnet's keep-out circle. */
export function polylineHitsMagnet(poly: Polyline, magnet: Magnet): boolean {
  if (poly.length === 1) {
    return Math.hypot(poly[0].x - magnet.x, poly[0].y - magnet.y) <= magnet.radiusMm;
  }
  for (let i = 1; i < poly.length; i++) {
    if (distanceToSegment(magnet, poly[i - 1], poly[i]) <= magnet.radiusMm) return true;
  }
  return false;
}

/**
 * Which magnets the drawn geometry runs into. These are the ones that matter
 * most: travel can be routed around a magnet, but a stroke that has to be drawn
 * *through* one cannot be, and the job should not start.
 */
export function magnetsHitBy(magnets: readonly Magnet[], polylines: readonly Polyline[]): Magnet[] {
  return magnets.filter((m) => polylines.some((poly) => polylineHitsMagnet(poly, m)));
}

/**
 * Suggest magnet positions for a sheet: the corners first, then the edge
 * midpoints, each inset far enough that the whole keep-out circle is on the
 * paper — a magnet half off the sheet holds nothing down.
 *
 * Positions that would overlap the drawing are dropped rather than nudged: the
 * operator can see the gap and place one by hand, whereas a suggestion that has
 * been quietly shifted somewhere arbitrary is worse than no suggestion.
 */
export function recommendMagnets(
  paperW: number,
  paperH: number,
  polylines: readonly Polyline[],
  radiusMm = DEFAULT_MAGNET_RADIUS_MM,
): Magnet[] {
  const inset = radiusMm + EDGE_MARGIN_MM;
  if (paperW < inset * 2 || paperH < inset * 2) return [];

  const drawn = polylines.length > 0 ? bounds(polylines as Polyline[]) : null;
  const candidates: Point[] = [
    { x: inset, y: inset },
    { x: paperW - inset, y: inset },
    { x: paperW - inset, y: paperH - inset },
    { x: inset, y: paperH - inset },
    { x: paperW / 2, y: inset },
    { x: paperW / 2, y: paperH - inset },
    { x: inset, y: paperH / 2 },
    { x: paperW - inset, y: paperH / 2 },
  ];

  const clear = candidates.filter((c) => {
    if (!drawn) return true;
    // Keep the whole circle off the drawing's box, not just its centre.
    return (
      c.x + radiusMm < drawn.minX ||
      c.x - radiusMm > drawn.maxX ||
      c.y + radiusMm < drawn.minY ||
      c.y - radiusMm > drawn.maxY
    );
  });

  return clear.map((c, i) => ({ id: `mag${i + 1}`, x: c.x, y: c.y, radiusMm }));
}

/** Coerce a stored magnet list into usable geometry (session data, hand-editable). */
export function normalizeMagnets(raw: unknown): Magnet[] {
  if (!Array.isArray(raw)) return [];
  const out: Magnet[] = [];
  raw.forEach((entry, i) => {
    if (typeof entry !== 'object' || entry === null) return;
    const r = entry as Record<string, unknown>;
    const num = (v: unknown, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    const radius = num(r.radiusMm, DEFAULT_MAGNET_RADIUS_MM);
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : `mag${i + 1}`,
      x: num(r.x, 0),
      y: num(r.y, 0),
      // A zero or negative keep-out radius would silently disable every check
      // that exists to keep the carriage off the magnet.
      radiusMm: radius > 0 ? radius : DEFAULT_MAGNET_RADIUS_MM,
    });
  });
  return out;
}
