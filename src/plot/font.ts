/**
 * A single-line stroke font, and the text → polylines conversion that uses it.
 *
 * A pen plotter draws with a line, not with ink coverage, so text has to be a
 * *skeleton* — one stroke down the middle of each letter. An ordinary outline
 * font gives the letter's contour, which a plotter draws as a hollow double
 * line and which looks wrong at anything under ~20 mm. That is the whole reason
 * this file exists instead of a font library.
 *
 * ## The glyph format
 *
 * Each glyph is a string of space-separated `x,y` points, with `M` starting a
 * new stroke (pen up, move, pen down). Coordinates are font units in a frame
 * where **y is up**: baseline 0, cap height 7, x-height 4.5, descenders to -2.
 * `textPolylines` scales those to millimetres and flips y, because the plot
 * frame has y running *down* the page.
 *
 * Kept as strings because that is what a human can actually edit: adding a
 * glyph means typing the points you would draw, not maintaining a nested array.
 */
import type { Point, Polyline } from './types';

/** Font units for the cap height — the size a caller asks for in mm. */
const CAP_UNITS = 7;

interface Glyph {
  /** Advance width in font units (how far the pen moves on to the next glyph). */
  width: number;
  /** Strokes, in the mini-format described above. */
  d: string;
}

/**
 * The built-in face: upper and lower case, digits, and the punctuation that
 * turns up in a plotted label. Single-storey lowercase forms throughout — they
 * read better than two-storey ones when drawn as a bare skeleton.
 */
const GLYPHS: Record<string, Glyph> = {
  ' ': { width: 4, d: '' },
  A: { width: 6, d: '0,0 3,7 6,0 M 1,2.3 5,2.3' },
  B: { width: 6, d: '0,0 0,7 4,7 5,6 5,4.5 4,3.5 0,3.5 M 4,3.5 5,2.5 5,1 4,0 0,0' },
  C: { width: 6, d: '6,5.5 5,7 2,7 0,5 0,2 2,0 5,0 6,1.5' },
  D: { width: 6, d: '0,0 0,7 3,7 5,5.5 5,1.5 3,0 0,0' },
  E: { width: 5.5, d: '5,7 0,7 0,0 5,0 M 0,3.5 4,3.5' },
  F: { width: 5.5, d: '0,0 0,7 5,7 M 0,3.5 4,3.5' },
  G: { width: 6.5, d: '6,5.5 5,7 2,7 0,5 0,2 2,0 5,0 6,1.5 6,3 3.5,3' },
  H: { width: 6, d: '0,0 0,7 M 6,0 6,7 M 0,3.5 6,3.5' },
  I: { width: 2, d: '1,0 1,7' },
  J: { width: 5, d: '4,7 4,2 3,0 1,0 0,1.5' },
  K: { width: 5.5, d: '0,0 0,7 M 5,7 0,3.5 M 2,5 5,0' },
  L: { width: 5.5, d: '0,7 0,0 5,0' },
  M: { width: 7, d: '0,0 0,7 3.5,3 7,7 7,0' },
  N: { width: 6.5, d: '0,0 0,7 6.5,0 6.5,7' },
  O: { width: 6.5, d: '2,7 4.5,7 6.5,5 6.5,2 4.5,0 2,0 0,2 0,5 2,7' },
  P: { width: 6, d: '0,0 0,7 4,7 5,6 5,4.5 4,3.5 0,3.5' },
  Q: { width: 6.5, d: '2,7 4.5,7 6.5,5 6.5,2 4.5,0 2,0 0,2 0,5 2,7 M 4,1.5 6.5,-1' },
  R: { width: 6, d: '0,0 0,7 4,7 5,6 5,4.5 4,3.5 0,3.5 M 3,3.5 5.5,0' },
  S: { width: 6, d: '5.5,6 4,7 1.5,7 0,5.5 1.5,3.5 4,3.5 5.5,1.5 4,0 1.5,0 0,1' },
  T: { width: 6, d: '0,7 6,7 M 3,7 3,0' },
  U: { width: 6, d: '0,7 0,2 2,0 4,0 6,2 6,7' },
  V: { width: 6, d: '0,7 3,0 6,7' },
  W: { width: 7.5, d: '0,7 1.8,0 3.75,4.5 5.7,0 7.5,7' },
  X: { width: 6, d: '0,0 6,7 M 0,7 6,0' },
  Y: { width: 6, d: '0,7 3,3.5 6,7 M 3,3.5 3,0' },
  Z: { width: 6, d: '0,7 6,7 0,0 6,0' },
  a: { width: 5, d: '4.5,0 4.5,4.5 M 4.5,3.5 3.5,4.5 1,4.5 0,3.5 0,1 1,0 3.5,0 4.5,1' },
  b: { width: 5, d: '0,7 0,0 M 0,3.5 1,4.5 3.5,4.5 4.5,3.5 4.5,1 3.5,0 1,0 0,1' },
  c: { width: 5, d: '4.5,3.5 3.5,4.5 1,4.5 0,3.5 0,1 1,0 3.5,0 4.5,1' },
  d: { width: 5, d: '4.5,7 4.5,0 M 4.5,3.5 3.5,4.5 1,4.5 0,3.5 0,1 1,0 3.5,0 4.5,1' },
  e: { width: 5, d: '0,2.2 4.5,2.2 4.5,3.5 3.5,4.5 1,4.5 0,3.5 0,1 1,0 3.5,0 4.5,1' },
  f: { width: 3.5, d: '1,0 1,6 2,7 3.5,7 M 0,4.5 3,4.5' },
  g: {
    width: 5,
    d: '4.5,4.5 4.5,-1 3.5,-2 1,-2 0,-1.5 M 4.5,3.5 3.5,4.5 1,4.5 0,3.5 0,1 1,0 3.5,0 4.5,1',
  },
  h: { width: 5, d: '0,7 0,0 M 0,3.5 1.5,4.5 3.5,4.5 4.5,3.5 4.5,0' },
  i: { width: 2, d: '1,0 1,4.5 M 1,6 1,6.4' },
  j: { width: 3, d: '2,4.5 2,-1 1,-2 0,-2 M 2,6 2,6.4' },
  k: { width: 5, d: '0,7 0,0 M 4,4.5 0.5,1.5 M 2,3 4.5,0' },
  l: { width: 2, d: '1,7 1,0' },
  m: {
    width: 7,
    d: '0,0 0,4.5 M 0,3.5 1,4.5 2.5,4.5 3.5,3.5 3.5,0 M 3.5,3.5 4.5,4.5 6,4.5 7,3.5 7,0',
  },
  n: { width: 5, d: '0,0 0,4.5 M 0,3.5 1.5,4.5 3.5,4.5 4.5,3.5 4.5,0' },
  o: { width: 5, d: '1,4.5 3.5,4.5 4.5,3.5 4.5,1 3.5,0 1,0 0,1 0,3.5 1,4.5' },
  p: { width: 5, d: '0,-2 0,4.5 M 0,3.5 1,4.5 3.5,4.5 4.5,3.5 4.5,1 3.5,0 1,0 0,1' },
  q: { width: 5, d: '4.5,-2 4.5,4.5 M 4.5,3.5 3.5,4.5 1,4.5 0,3.5 0,1 1,0 3.5,0 4.5,1' },
  r: { width: 3.5, d: '0,0 0,4.5 M 0,3 1,4.5 2.5,4.5 3.2,4.2' },
  s: { width: 4.5, d: '4,3.8 3,4.5 1,4.5 0,3.8 1,2.4 3,2.1 4,1.4 3,0 1,0 0,0.7' },
  t: { width: 3.5, d: '1,7 1,1 2,0 3,0 M 0,4.5 3,4.5' },
  u: { width: 5, d: '0,4.5 0,1 1,0 3,0 4.5,1 M 4.5,4.5 4.5,0' },
  v: { width: 4.5, d: '0,4.5 2.25,0 4.5,4.5' },
  w: { width: 6.5, d: '0,4.5 1.6,0 3.25,3 4.9,0 6.5,4.5' },
  x: { width: 4.5, d: '0,0 4.5,4.5 M 0,4.5 4.5,0' },
  y: { width: 4.5, d: '0,4.5 2.25,0 M 4.5,4.5 1,-2' },
  z: { width: 4.5, d: '0,4.5 4.5,4.5 0,0 4.5,0' },
  '0': { width: 6, d: '2,7 4,7 6,5 6,2 4,0 2,0 0,2 0,5 2,7' },
  '1': { width: 5, d: '1,5.5 3,7 3,0' },
  '2': { width: 6, d: '0,5.5 1,7 4,7 5.5,5.5 5.5,4 0,0 6,0' },
  '3': { width: 6, d: '0,6.5 1.5,7 4.5,7 6,5.5 4.5,3.5 2.5,3.5 M 4.5,3.5 6,2 4.5,0 1.5,0 0,0.5' },
  '4': { width: 6, d: '4.5,0 4.5,7 0,2 6,2' },
  '5': { width: 6, d: '5.5,7 0.5,7 0,4 1.5,4.5 4,4.5 5.5,3.5 5.5,1.5 4,0 1.5,0 0,1' },
  '6': { width: 6, d: '5.5,6 4,7 2,7 0.5,5.5 0,3 0,1.5 1.5,0 4,0 5.5,1.5 5.5,2.5 4,4 1.5,4 0.3,3' },
  '7': { width: 6, d: '0,7 6,7 2.5,0' },
  '8': {
    width: 6,
    d: '2,3.5 0.5,4.5 0.5,6 2,7 4,7 5.5,6 5.5,4.5 4,3.5 2,3.5 0,2.5 0,1 1.5,0 4.5,0 6,1 6,2.5 4,3.5',
  },
  '9': { width: 6, d: '0.5,1 2,0 4,0 5.5,1.5 6,4 6,5.5 4.5,7 2,7 0.5,5.5 0.5,4.5 2,3 4.5,3 5.7,4' },
  '.': { width: 2.5, d: '1,0 1,0.4' },
  ',': { width: 2.5, d: '1.2,0.4 1.2,0 0.5,-1.5' },
  ':': { width: 2.5, d: '1,0 1,0.4 M 1,3 1,3.4' },
  ';': { width: 2.5, d: '1,3 1,3.4 M 1.2,0.4 1.2,0 0.5,-1.5' },
  '!': { width: 2.5, d: '1,7 1,1.5 M 1,0 1,0.4' },
  '?': { width: 5, d: '0,5.5 1,7 3.5,7 4.5,6 4.5,4.5 2.5,3 2.5,1.5 M 2.5,0 2.5,0.4' },
  '-': { width: 5, d: '0.5,3 4.5,3' },
  _: { width: 5, d: '0,-1 5,-1' },
  '+': { width: 5, d: '0.5,3 4.5,3 M 2.5,1 2.5,5' },
  '=': { width: 5, d: '0.5,2 4.5,2 M 0.5,4 4.5,4' },
  '/': { width: 5, d: '0,0 4.5,7' },
  '\\': { width: 5, d: '0,7 4.5,0' },
  '(': { width: 3, d: '2,7 0.5,5 0.5,2 2,0' },
  ')': { width: 3, d: '0.5,7 2,5 2,2 0.5,0' },
  '[': { width: 3, d: '2,7 0.5,7 0.5,0 2,0' },
  ']': { width: 3, d: '0.5,7 2,7 2,0 0.5,0' },
  "'": { width: 2, d: '1,7 1,5.5' },
  '"': { width: 3.5, d: '1,7 1,5.5 M 2.5,7 2.5,5.5' },
  '*': { width: 5, d: '2.25,5.5 2.25,1.5 M 0.5,4.5 4,2.5 M 0.5,2.5 4,4.5' },
  '#': { width: 6, d: '1.5,0 2.2,7 M 3.8,0 4.5,7 M 0.5,2.3 5.5,2.3 M 0.5,4.7 5.5,4.7' },
  '%': {
    width: 7,
    d: '0,0 6.5,7 M 0.5,5.5 1.8,5.5 1.8,7 0.5,7 0.5,5.5 M 4.7,0 6,0 6,1.5 4.7,1.5 4.7,0',
  },
  '&': {
    width: 6.5,
    d: '6.5,0 2,4.5 1,5.5 1,6.3 1.8,7 2.8,7 3.6,6.3 3.6,5.5 0,2.5 0,1 1.3,0 3,0 4.5,1.5',
  },
  '@': {
    width: 7.5,
    d: '5.5,2.5 4.5,1.5 3,1.5 2.5,2.5 2.5,4 3.5,5 5,5 5.5,4 5.5,1.5 6.5,1.5 7.5,3 7.5,5 6,7 3,7 1,5.5 1,2 2.5,0 5.5,0',
  },
};

/** Characters this face can draw, for callers that want to warn before plotting. */
export function supportedCharacters(): string[] {
  return Object.keys(GLYPHS);
}

/** Characters in `text` this face has no glyph for (newlines excluded). */
export function missingGlyphs(text: string): string[] {
  const missing = new Set<string>();
  for (const ch of text) {
    if (ch === '\n' || ch === '\r') continue;
    if (!GLYPHS[ch]) missing.add(ch);
  }
  return [...missing];
}

export interface TextSpec {
  kind: 'text';
  text: string;
  /** Cap height in mm — the height of an upper-case letter. */
  sizeMm: number;
  /** Extra space between glyphs, in mm (may be negative to tighten). */
  letterSpacingMm: number;
  /** Baseline-to-baseline distance as a multiple of the cap height. */
  lineSpacing: number;
}

export const DEFAULT_TEXT: TextSpec = {
  kind: 'text',
  text: 'Hello',
  sizeMm: 20,
  letterSpacingMm: 0,
  lineSpacing: 1.6,
};

function parseGlyph(d: string): Point[][] {
  if (!d) return [];
  return d
    .split('M')
    .map((stroke) =>
      stroke
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((pair) => {
          const [x, y] = pair.split(',').map(Number);
          return { x, y };
        }),
    )
    .filter((pts) => pts.length >= 2);
}

/**
 * Convert text to plottable polylines, in paper mm with y running **down** and
 * the result normalised so its top-left corner is the origin — the same frame
 * and convention an imported artwork arrives in, so text is placed, scaled and
 * plotted by exactly the code that already handles artwork.
 *
 * Unsupported characters are skipped (see `missingGlyphs`), because drawing a
 * placeholder box would put marks on the paper that the operator did not ask
 * for and cannot remove afterwards.
 */
export function textPolylines(spec: TextSpec): Polyline[] {
  const scale = spec.sizeMm / CAP_UNITS;
  const lineStep = spec.sizeMm * (spec.lineSpacing > 0 ? spec.lineSpacing : 1.6);
  const out: Polyline[] = [];
  let penY = 0; // baseline of the current line, in mm, y DOWN

  for (const line of spec.text.split('\n')) {
    let penX = 0;
    for (const ch of line) {
      const glyph = GLYPHS[ch];
      if (!glyph) continue;
      for (const stroke of parseGlyph(glyph.d)) {
        out.push(
          // Flip y: font units are y-up, the paper frame is y-down.
          stroke.map((p) => ({ x: penX + p.x * scale, y: penY - p.y * scale })),
        );
      }
      penX += glyph.width * scale + spec.letterSpacingMm;
    }
    penY += lineStep;
  }

  // Normalise to the origin so the object's own box starts at (0,0).
  let minX = Infinity;
  let minY = Infinity;
  for (const poly of out)
    for (const p of poly) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
    }
  if (!isFinite(minX)) return [];
  return out.map((poly) => poly.map((p) => ({ x: p.x - minX, y: p.y - minY })));
}
