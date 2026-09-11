import type { Polyline } from './types';
// The marker's meaning ("stop feeding lines here") belongs to the streamer, so
// its definition lives there and this module emits what that module reads.
import { PEN_CHANGE_PREFIX } from '../grbl/program';

export interface PenOptions {
  /** Z that lifts the pen clear (≤ 0 on this inverted-Z machine). */
  penUpZ: number;
  /** Z that puts the pen on the paper (positive — inverted Z). */
  penDownZ: number;
  /** Settle dwell after each pen move, in milliseconds. */
  dwellMs: number;
  /** Feed rate for pen-down (drawing) moves, mm/min. */
  drawFeed: number;
  /** Feed rate for pen-up (travel) moves, mm/min. */
  travelFeed: number;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : Number(n.toFixed(3)).toString();
}

function dist2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function orderPolylines(polylines: Polyline[]): Polyline[] {
  const remaining = polylines.filter((poly) => poly.length >= 2);
  const ordered: Polyline[] = [];
  let cursor = { x: 0, y: 0 };

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestReverse = false;
    let bestDistance = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const poly = remaining[i];
      const start = poly[0];
      const end = poly[poly.length - 1];
      const startDistance = dist2(cursor, start);
      if (startDistance < bestDistance) {
        bestIndex = i;
        bestReverse = false;
        bestDistance = startDistance;
      }
      const endDistance = dist2(cursor, end);
      if (endDistance < bestDistance) {
        bestIndex = i;
        bestReverse = true;
        bestDistance = endDistance;
      }
    }

    const [poly] = remaining.splice(bestIndex, 1);
    const next = bestReverse ? [...poly].reverse() : poly;
    ordered.push(next);
    cursor = next[next.length - 1];
  }

  return ordered;
}

/** One pen's share of a drawing: everything drawn before the next pen change. */
export interface PenGroup {
  /** What to ask the operator to load, e.g. "Red 0.5 fineliner". */
  label: string;
  polylines: Polyline[];
}

/**
 * Generate GRBL G-code in WORK coordinates from polylines given in paper
 * millimeters with the top-left corner as origin.
 *
 * Applies the hardware-confirmed mapping (verified by the orientation test):
 *   machineX = artworkX,  machineY = artworkY   (identity — NO Y flip;
 *   machine +Y is physically "down the page", matching the artwork's Y-down)
 *
 * Frames the program in mm/absolute, starts and ends pen-up, and returns to
 * the work origin. Strokes are ordered by nearest pen-up travel from the
 * current position; stroke direction may be reversed when that reduces travel.
 */
export function generateGcode(polylines: Polyline[], opts: PenOptions): string[] {
  const up = fmt(opts.penUpZ);
  const down = fmt(opts.penDownZ);
  const dwell = fmt(opts.dwellMs / 1000);
  const draw = Math.round(opts.drawFeed);
  const travel = Math.round(opts.travelFeed);

  const lines: string[] = ['G21', 'G90', `G0 Z${up}`];

  for (const poly of orderPolylines(polylines)) {
    const start = poly[0];
    // Travel to the stroke start with the pen up.
    lines.push(`G1 X${fmt(start.x)} Y${fmt(start.y)} F${travel}`);
    // Pen down + settle.
    lines.push(`G0 Z${down}`, `G4 P${dwell}`);
    // Draw the remaining points.
    for (let i = 1; i < poly.length; i++) {
      lines.push(`G1 X${fmt(poly[i].x)} Y${fmt(poly[i].y)} F${draw}`);
    }
    // Pen up + settle before the next travel.
    lines.push(`G0 Z${up}`, `G4 P${dwell}`);
  }

  // Return to the work origin (pen up).
  lines.push(`G1 X0 Y0 F${travel}`);
  return lines;
}

export interface MotionOpts {
  /** Axis acceleration, mm/s² (GRBL $120/$121). Default 500. */
  accel?: number;
  /** Junction deviation, mm (GRBL $11) — governs cornering speed. Default 0.01. */
  jdev?: number;
}

/**
 * Estimate how long a generated G-code program takes to plot, in seconds,
 * modelling GRBL-style trapezoidal acceleration and cornering — not just
 * distance ÷ feed.
 *
 * Why: on fine artwork the machine rarely reaches its commanded feed. It ramps
 * up and back down on every stroke (the pen stops to lift/lower between
 * strokes), and it crawls through sharp corners (junction-deviation limited).
 * Ignoring those made a plain distance/feed estimate roughly 2× too low.
 *
 * Model: split the program into "blocks" — runs of XY moves the machine
 * executes without stopping (a pen-up/down Z move or a dwell ends a block).
 * Each block is planned like GRBL: a per-vertex junction speed (capped by the
 * cornering limit v = √(a·R), R derived from junction deviation), then forward
 * and backward acceleration passes, then trapezoidal time per segment. Dwells
 * add their time. Z-move time is ignored (small; the settle dwell already
 * accounts for the pen cycle).
 */
export function estimatePlotTime(lines: string[], opts: MotionOpts = {}): number {
  const accel = opts.accel && opts.accel > 0 ? opts.accel : 500; // mm/s²
  const jdev = opts.jdev && opts.jdev > 0 ? opts.jdev : 0.01; // mm

  let x = 0;
  let y = 0;
  let feed = 0; // mm/min, last seen
  let pts: { x: number; y: number }[] = [];
  let blockFeed = 0; // mm/min for the block being accumulated
  let seconds = 0;

  const flush = () => {
    if (pts.length >= 2 && blockFeed > 0) {
      seconds += planBlock(pts, blockFeed / 60, accel, jdev);
    }
    pts = [];
  };

  for (const l of lines) {
    const dwell = /^G4 P([\d.]+)/.exec(l);
    if (dwell) {
      flush();
      seconds += parseFloat(dwell[1]);
      continue;
    }
    const mf = /F(-?[\d.]+)/.exec(l);
    if (mf) feed = parseFloat(mf[1]);
    const mx = /X(-?[\d.]+)/.exec(l);
    const my = /Y(-?[\d.]+)/.exec(l);
    if (!mx && !my) {
      // A Z-only move (pen lift/lower) stops the machine — end the block.
      if (/\bZ-?[\d.]+/.test(l)) flush();
      continue;
    }
    const nx = mx ? parseFloat(mx[1]) : x;
    const ny = my ? parseFloat(my[1]) : y;
    if (pts.length === 0) {
      pts.push({ x, y });
      blockFeed = feed;
    } else if (feed !== blockFeed) {
      // Feed change mid-run: close the current block and start a new one here.
      flush();
      pts.push({ x, y });
      blockFeed = feed;
    }
    pts.push({ x: nx, y: ny });
    x = nx;
    y = ny;
  }
  flush();

  return seconds;
}

/** Plan one continuous block of points; returns its motion time in seconds. */
function planBlock(
  pts: { x: number; y: number }[],
  vnom: number, // cruise speed, mm/s
  a: number, // acceleration, mm/s²
  jdev: number, // junction deviation, mm
): number {
  const n = pts.length - 1; // segment count
  const len: number[] = [];
  const ux: number[] = [];
  const uy: number[] = [];
  for (let i = 0; i < n; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const L = Math.hypot(dx, dy);
    len.push(L);
    ux.push(L > 0 ? dx / L : 0);
    uy.push(L > 0 ? dy / L : 0);
  }
  // Junction speed at each vertex; the block starts and ends at rest.
  const vj: number[] = new Array(n + 1).fill(vnom);
  vj[0] = 0;
  vj[n] = 0;
  for (let i = 1; i < n; i++) {
    if (len[i - 1] === 0 || len[i] === 0) {
      vj[i] = 0;
      continue;
    }
    const dot = ux[i - 1] * ux[i] + uy[i - 1] * uy[i];
    const cosTheta = -dot; // GRBL junction convention
    const sinHalf = Math.sqrt(Math.max(0, (1 - cosTheta) / 2));
    if (sinHalf >= 1 - 1e-9) {
      vj[i] = vnom; // straight-through corner — no slowdown
    } else {
      const R = (jdev * sinHalf) / (1 - sinHalf);
      vj[i] = Math.min(vnom, Math.sqrt(a * R));
    }
  }
  // Forward then backward acceleration passes bound junction speeds to what the
  // machine can actually reach given the segment lengths.
  for (let i = 0; i < n; i++) {
    vj[i + 1] = Math.min(vj[i + 1], Math.sqrt(vj[i] * vj[i] + 2 * a * len[i]));
  }
  for (let i = n - 1; i >= 0; i--) {
    vj[i] = Math.min(vj[i], Math.sqrt(vj[i + 1] * vj[i + 1] + 2 * a * len[i]));
  }
  let t = 0;
  for (let i = 0; i < n; i++) {
    t += segTime(vj[i], vj[i + 1], vnom, a, len[i]);
  }
  return t;
}

/** Trapezoidal time for one segment: entry → cruise → exit over length L. */
function segTime(ve: number, vx: number, vc: number, a: number, L: number): number {
  if (L <= 0) return 0;
  const da = (vc * vc - ve * ve) / (2 * a); // distance to ramp ve→vc
  const dd = (vc * vc - vx * vx) / (2 * a); // distance to ramp vc→vx
  if (da + dd <= L) {
    return (vc - ve) / a + (L - da - dd) / vc + (vc - vx) / a;
  }
  // Triangle: the segment is too short to reach cruise speed.
  const vp = Math.sqrt(Math.max((2 * a * L + ve * ve + vx * vx) / 2, ve * ve, vx * vx));
  return (vp - ve) / a + (vp - vx) / a;
}

/**
 * Format a duration in seconds as a compact, human-readable estimate:
 *   <60s   → `~45s`
 *   <1h    → `~12m 30s`
 *   ≥1h    → `~1h 04m`
 */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  if (total < 60) return `~${total}s`;
  if (total < 3600) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `~${m}m ${String(s).padStart(2, '0')}s`;
  }
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  return `~${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Generate one program covering several pens, with a pen-change marker between
 * groups.
 *
 * Each group is framed exactly like a single-pen program and **ends parked at
 * the work origin with the pen up**, so the machine is somewhere safe and
 * predictable to swap a pen — not stopped over the drawing, where a hand
 * reaching in would foul the artwork.
 *
 * Groups with nothing to draw are dropped rather than producing a pen change
 * the operator would have to answer for no reason. A single remaining group
 * yields exactly what `generateGcode` produces, so a one-pen drawing is
 * byte-for-byte the plot it was before pens existed.
 */
export function generatePenGroupGcode(groups: PenGroup[], opts: PenOptions): string[] {
  const drawable = groups.filter((g) => g.polylines.some((p) => p.length >= 2));
  if (drawable.length === 0) return generateGcode([], opts);
  if (drawable.length === 1) return generateGcode(drawable[0].polylines, opts);

  const up = fmt(opts.penUpZ);
  const dwell = fmt(opts.dwellMs / 1000);
  const draw = Math.round(opts.drawFeed);
  const travel = Math.round(opts.travelFeed);
  const down = fmt(opts.penDownZ);

  const lines: string[] = ['G21', 'G90', `G0 Z${up}`];
  drawable.forEach((group, i) => {
    for (const poly of orderPolylines(group.polylines)) {
      const start = poly[0];
      lines.push(`G1 X${fmt(start.x)} Y${fmt(start.y)} F${travel}`);
      lines.push(`G0 Z${down}`, `G4 P${dwell}`);
      for (let j = 1; j < poly.length; j++) {
        lines.push(`G1 X${fmt(poly[j].x)} Y${fmt(poly[j].y)} F${draw}`);
      }
      lines.push(`G0 Z${up}`, `G4 P${dwell}`);
    }
    // Park at the origin before the pen change (and at the end of the job).
    lines.push(`G1 X0 Y0 F${travel}`);
    if (i < drawable.length - 1) lines.push(`${PEN_CHANGE_PREFIX}${drawable[i + 1].label}`);
  });
  return lines;
}
