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

/**
 * What a suggestion was computed from: the sheet, and the box the drawing
 * occupied on it. `recommendMagnets` reads nothing else (the radius is the
 * fixed default), so two equal fingerprints would get the same suggestion.
 *
 * Kept so the app can say when its last suggestion no longer fits the sheet.
 * It is *not* a trigger to recompute: once the operator has put magnets down
 * where a suggestion said, the markers are where real magnets are, and moving
 * the markers because the artwork moved would make them lie.
 */
export interface SuggestionFingerprint {
  paperW: number;
  paperH: number;
  /** The drawing's extent in paper mm, or null when the sheet was empty. */
  drawn: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

/** Fingerprint the inputs of a `recommendMagnets` call. */
export function suggestionFingerprint(
  paperW: number,
  paperH: number,
  polylines: readonly Polyline[],
): SuggestionFingerprint {
  const nonEmpty = polylines.filter((p) => p.length > 0);
  if (nonEmpty.length === 0) return { paperW, paperH, drawn: null };
  const b = bounds(nonEmpty as Polyline[]);
  return { paperW, paperH, drawn: { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY } };
}

/**
 * Differences smaller than this are not a change. Placement arithmetic and a
 * JSON round-trip through the session can wobble the last digits; a tenth of
 * a millimetre is far below anything that moves a suggested magnet.
 */
const FINGERPRINT_TOLERANCE_MM = 0.05;

/**
 * Has the sheet changed since the last suggestion, and if so, how?
 *
 * Returns null when nothing relevant changed — or when there was no
 * suggestion to go stale. A comparison only: it never moves a magnet.
 * Paper is reported ahead of artwork, because a new sheet size invalidates
 * every edge position at once, whatever the artwork did.
 */
export function suggestionStaleness(
  last: SuggestionFingerprint | null,
  now: SuggestionFingerprint,
): 'paper' | 'artwork' | null {
  if (!last) return null;
  const differs = (a: number, b: number) => Math.abs(a - b) > FINGERPRINT_TOLERANCE_MM;
  if (differs(last.paperW, now.paperW) || differs(last.paperH, now.paperH)) return 'paper';
  if (!last.drawn || !now.drawn) return last.drawn === now.drawn ? null : 'artwork';
  const a = last.drawn;
  const b = now.drawn;
  if (
    differs(a.minX, b.minX) ||
    differs(a.minY, b.minY) ||
    differs(a.maxX, b.maxX) ||
    differs(a.maxY, b.maxY)
  ) {
    return 'artwork';
  }
  return null;
}

/** Coerce a stored fingerprint (session data, hand-editable) into one, or null. */
export function normalizeSuggestionFingerprint(raw: unknown): SuggestionFingerprint | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!finite(r.paperW) || !finite(r.paperH)) return null;
  if (r.drawn === null) return { paperW: r.paperW, paperH: r.paperH, drawn: null };
  if (typeof r.drawn !== 'object') return null;
  const d = r.drawn as Record<string, unknown>;
  if (!finite(d.minX) || !finite(d.minY) || !finite(d.maxX) || !finite(d.maxY)) return null;
  return {
    paperW: r.paperW,
    paperH: r.paperH,
    drawn: { minX: d.minX, minY: d.minY, maxX: d.maxX, maxY: d.maxY },
  };
}

/** What the app knows about the carriage when the operator presses Set. */
export interface CarriageReading {
  /** Live work position in paper mm, or null when there is no status from the machine. */
  position: Point | null;
  /** The controller's reported state (`Idle`, `Jog`, `Alarm`, …), or null when unknown. */
  machineState: string | null;
  /** Is the work origin still the one the operator set? (`MotorPower.posTrusted`) */
  posTrusted: boolean;
  /** Why it is not, in the operator's words. (`MotorPower.reason`) */
  untrustedReason: string | null;
  /** A job is streaming. */
  plotting: boolean;
}

/**
 * Where a magnet set from the carriage goes — or why it cannot be set.
 *
 * The point of jog-to-set is that the position is *measured*: the operator
 * puts the pen over the real magnet and the machine says where that is. A
 * reading that is not a measurement is worse than none, because the router
 * trusts a recorded magnet as a keep-out zone and plans travel around it —
 * so every doubt refuses, with the reason, rather than recording a guess.
 *
 * The work position is taken as it is. Work coordinates *are* paper mm here
 * (origin at the paper's top-left, identity mapping, machine +Y runs down the
 * page), so there is nothing to convert and, in particular, no Y to flip.
 */
export function magnetCentreFromCarriage(
  reading: CarriageReading,
): { ok: true; x: number; y: number } | { ok: false; reason: string } {
  const { position, machineState } = reading;
  if (!position || machineState === null) {
    return { ok: false, reason: 'Connect to the plotter to read where the carriage is.' };
  }
  if (reading.plotting) {
    return { ok: false, reason: 'Not while a plot is running — the carriage is moving.' };
  }
  if (!reading.posTrusted) {
    // A powered-down gantry can be pushed; the coordinates it reports after
    // that are a claim, not a position. Jog still works, but its numbers
    // only mean something again once the origin is re-zeroed.
    return {
      ok: false,
      reason:
        `${reading.untrustedReason ?? 'The work position is not trusted.'} ` +
        'Re-zero first — until then the carriage position is not where the magnet is.',
    };
  }
  if (machineState === 'Alarm') {
    return { ok: false, reason: 'The controller is in alarm. Unlock it first.' };
  }
  if (machineState !== 'Idle') {
    // Mid-jog the reported position is somewhere along the move, not where
    // the pen will come to rest over the magnet.
    return { ok: false, reason: 'Wait for the carriage to stop moving.' };
  }
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return { ok: false, reason: 'The plotter did not report a usable position.' };
  }
  return { ok: true, x: position.x, y: position.y };
}
