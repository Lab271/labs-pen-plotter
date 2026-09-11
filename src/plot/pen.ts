/**
 * A pen: what the machine actually draws with. Pure data, so the preview, the
 * pen library on the settings page and (later) multi-pen plotting all read the
 * same model.
 *
 * Two properties matter today:
 *  - **colour**, so the canvas shows what the drawing will look like rather than
 *    uniform slate — and so a multi-pen drawing can be told apart at a glance;
 *  - **width in mm**, the physical line the tip lays down. It is the preview's
 *    stroke width, and it is what hatching and fills have to space themselves by
 *    if they are not to smear into solid ink.
 *
 * Deliberately not modelled yet: ink type, brand, pressure. Add them when
 * something reads them — a field nothing uses is a field nothing maintains.
 */
export interface Pen {
  /** Stable key, referenced by artwork and persisted. */
  id: string;
  /** Human-friendly label, e.g. "Black 0.5 fineliner". */
  name: string;
  /** Stroke colour as CSS (hex from the colour picker, or a plain colour name). */
  color: string;
  /** Line width the tip lays down, in mm. */
  widthMm: number;
}

/**
 * The starting library. Fineliner sizes an operator is likely to have on the
 * shelf, plus a white gel pen — the one that only makes sense on dark stock,
 * and the reason the preview has to know a pen's colour at all.
 */
export const DEFAULT_PENS: Pen[] = [
  { id: 'black-05', name: 'Black 0.5 fineliner', color: '#1e293b', widthMm: 0.5 },
  { id: 'black-08', name: 'Black 0.8 fineliner', color: '#1e293b', widthMm: 0.8 },
  { id: 'red-05', name: 'Red 0.5 fineliner', color: '#dc2626', widthMm: 0.5 },
  { id: 'blue-05', name: 'Blue 0.5 fineliner', color: '#2563eb', widthMm: 0.5 },
  { id: 'green-05', name: 'Green 0.5 fineliner', color: '#16a34a', widthMm: 0.5 },
  { id: 'white-07', name: 'White gel 0.7', color: '#f8fafc', widthMm: 0.7 },
];

/** Widest line any real pen in this library lays down — an upper sanity bound. */
const MAX_PEN_WIDTH_MM = 20;

/**
 * Resolve a pen id against a library. Falls back to the first pen, because a
 * reference can outlive the pen it names (a session from before the operator
 * deleted it) and an artwork with no drawable pen is worse than one drawn in
 * the wrong colour.
 */
export function resolvePen(pens: readonly Pen[], id: string | undefined | null): Pen {
  const lib = pens.length > 0 ? pens : DEFAULT_PENS;
  return lib.find((p) => p.id === id) ?? lib[0];
}

/** Accepted colour forms: a hex value from the picker, or a plain CSS colour name. */
const COLOR_RE = /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i;

/**
 * Coerce one entry of a stored pen library into a usable pen, or null if there
 * is nothing usable in it. The library is operator-edited and round-trips
 * through JSON, so a width of `"thick"` or a missing id has to be survivable —
 * a NaN width would silently stop the preview from drawing the artwork at all.
 */
export function normalizePen(raw: unknown, fallbackId: string): Pen | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : fallbackId;
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : id;
  const color =
    typeof r.color === 'string' && COLOR_RE.test(r.color.trim()) ? r.color.trim() : '#1e293b';
  const w = typeof r.widthMm === 'number' && Number.isFinite(r.widthMm) ? r.widthMm : NaN;
  const widthMm = w > 0 && w <= MAX_PEN_WIDTH_MM ? w : 0.5;
  return { id, name, color, widthMm };
}

/**
 * Normalise a whole stored library: drop unusable entries, keep the first of
 * any duplicated id (ids are what artwork points at, so two pens cannot share
 * one), and fall back to the defaults when nothing usable is left.
 */
export function normalizePens(raw: unknown): Pen[] {
  if (!Array.isArray(raw)) return DEFAULT_PENS.map((p) => ({ ...p }));
  const seen = new Set<string>();
  const out: Pen[] = [];
  raw.forEach((entry, i) => {
    const pen = normalizePen(entry, `pen${i + 1}`);
    if (!pen || seen.has(pen.id)) return;
    seen.add(pen.id);
    out.push(pen);
  });
  return out.length > 0 ? out : DEFAULT_PENS.map((p) => ({ ...p }));
}
