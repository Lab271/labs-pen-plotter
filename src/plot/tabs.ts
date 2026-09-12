/**
 * Holding tabs: short uncut bridges that keep a cut piece attached to the sheet.
 *
 * A closed contour is severed the moment its loop closes, and the overcut in
 * `cut.ts` exists to make sure of it. That is right for the last piece and wrong
 * for everything before it: a freed piece can shift or lift under the drag knife
 * while later contours are still being cut, and the sheet cannot be handled as
 * one until the job is done. Tabs are the opposite control, and both are wanted
 * per job.
 *
 * The trick is that no new idea is needed downstream. A tabbed contour is just
 * *several strokes* with gaps between them, and the G-code writer already lifts
 * the tool between strokes — so this is a polylines-in, polylines-out transform,
 * and the bridges come out for free.
 */
import type { Point, Polyline } from './types';

export interface TabOptions {
  /** Length of each uncut bridge, in mm. The usual vinyl figure is ~0.5 mm. */
  tabWidthMm: number;
  /** How many bridges per contour. 0 disables tabs — today's behaviour. */
  tabCount: number;
  /**
   * Contours shorter than this get no tabs. A bridge as long as the shape
   * itself destroys small detail rather than holding it.
   */
  minContourMm: number;
}

export const DEFAULT_TABS: TabOptions = {
  tabWidthMm: 0.5,
  // Off by default: a cut with no tabs is what the machine did before, and a
  // piece that unexpectedly stays attached is as surprising as one that does not.
  tabCount: 0,
  minContourMm: 30,
};

/** Turn sharper than this counts as a corner, where a bridge tears rather than snaps. */
const CORNER_DEG = 35;
/** How far a tab may be nudged along the contour to get off a corner, as a fraction of its spacing. */
const MAX_NUDGE_FRACTION = 0.4;

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** Cumulative arc length at each vertex. */
function arcLengths(poly: Polyline): number[] {
  const acc = [0];
  for (let i = 1; i < poly.length; i++) acc.push(acc[i - 1] + dist(poly[i - 1], poly[i]));
  return acc;
}

/** Point at a given arc length along the polyline. */
function pointAt(poly: Polyline, acc: number[], s: number): Point {
  if (s <= 0) return poly[0];
  const total = acc[acc.length - 1];
  if (s >= total) return poly[poly.length - 1];
  let i = 1;
  while (i < acc.length && acc[i] < s) i++;
  const seg = acc[i] - acc[i - 1];
  const t = seg > 0 ? (s - acc[i - 1]) / seg : 0;
  const a = poly[i - 1];
  const b = poly[i];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Arc positions of the contour's sharp corners. */
function cornerPositions(poly: Polyline, acc: number[]): number[] {
  const minTurn = (CORNER_DEG * Math.PI) / 180;
  const out: number[] = [];
  for (let i = 1; i < poly.length - 1; i++) {
    const inAngle = Math.atan2(poly[i].y - poly[i - 1].y, poly[i].x - poly[i - 1].x);
    const outAngle = Math.atan2(poly[i + 1].y - poly[i].y, poly[i + 1].x - poly[i].x);
    let turn = outAngle - inAngle;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    if (Math.abs(turn) >= minTurn) out.push(acc[i]);
  }
  return out;
}

/** The slice of a polyline between two arc lengths, as its own polyline. */
function sliceByArc(poly: Polyline, acc: number[], from: number, to: number): Polyline {
  if (to - from <= 0) return [];
  const out: Polyline = [pointAt(poly, acc, from)];
  for (let i = 0; i < poly.length; i++) {
    if (acc[i] > from && acc[i] < to) out.push(poly[i]);
  }
  out.push(pointAt(poly, acc, to));
  // Two coincident points are not a stroke: the ordering step drops anything
  // shorter than two points, so a degenerate slice would vanish silently.
  return dist(out[0], out[out.length - 1]) > 1e-9 ? out : [];
}

export interface ApplyTabsOptions extends TabOptions {
  /** Whether this path came from a closed contour (tabs are meaningless otherwise). */
  closed: boolean;
  /**
   * Leading arc length to keep tabs out of — the stretch an overcut re-traces
   * at the end of the path. A tab there would be cut through by the overcut,
   * which is exactly the interaction that makes both features look broken.
   */
  protectStartMm?: number;
}

/**
 * Split a cut path into the strokes that should actually be cut, leaving the
 * tab spans out. Returns the path unchanged (as a single stroke) whenever tabs
 * do not apply — disabled, open geometry, or a contour too short to bridge.
 */
export function applyTabs(path: Polyline, opts: ApplyTabsOptions): Polyline[] {
  const count = Math.floor(opts.tabCount);
  if (!opts.closed || count < 1 || opts.tabWidthMm <= 0 || path.length < 3) return [path];

  const acc = arcLengths(path);
  const total = acc[acc.length - 1];
  if (total < opts.minContourMm) return [path];

  const protect = Math.max(0, opts.protectStartMm ?? 0);
  const usable = total - protect;
  // Every bridge needs cut on both sides of it; if the contour cannot afford
  // that many, cut the number down rather than producing a dotted line.
  const maxTabs = Math.floor(usable / (opts.tabWidthMm * 4));
  const n = Math.min(count, maxTabs);
  if (n < 1) return [path];

  const spacing = usable / n;
  const corners = cornerPositions(path, acc);
  const nudgeLimit = spacing * MAX_NUDGE_FRACTION;
  const half = opts.tabWidthMm / 2;

  const spans: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) {
    let centre = protect + (k + 0.5) * spacing;
    // A bridge on a corner tears instead of snapping, so shuffle it along the
    // contour until it sits on a straight span (or give up and take the corner).
    const tooClose = (c: number) => corners.some((x) => Math.abs(x - c) < half + 1);
    let moved = 0;
    while (tooClose(centre) && moved < nudgeLimit) {
      centre += Math.min(1, nudgeLimit - moved);
      moved += 1;
    }
    spans.push([Math.max(0, centre - half), Math.min(total, centre + half)]);
  }

  const out: Polyline[] = [];
  let cursor = 0;
  for (const [from, to] of spans) {
    const piece = sliceByArc(path, acc, cursor, from);
    if (piece.length >= 2) out.push(piece);
    cursor = to;
  }
  const tail = sliceByArc(path, acc, cursor, total);
  if (tail.length >= 2) out.push(tail);
  return out.length > 0 ? out : [path];
}
