/**
 * Image → lines: the conversion algorithms the import wizard offers.
 *
 * Each takes an adjusted grayscale field and returns polylines in millimetres,
 * normalised to the origin — the same shape an SVG import produces, so whatever
 * an algorithm emits is an ordinary object on the page.
 *
 * The algorithms are pure and live here rather than in the wizard because the
 * wizard is a preview of them: the picture on screen has to be produced by the
 * same code that produces the plot, or the operator is tuning something else.
 */
import { isoContours, type FieldSource } from './raster';
import { simplifyPolyline } from './svg';
import type { Polyline } from './types';

export type AlgorithmId = 'outline' | 'hatch' | 'crosshatch' | 'stipple' | 'edges';

export interface AlgorithmParams {
  /** Darkness cutoff 0..1: tones lighter than this get no ink. */
  threshold: number;
  /** Tonal steps — contour levels, or hatch passes. */
  levels: number;
  /** Hatching: distance between neighbouring lines, mm. */
  spacingMm: number;
  /** Hatching: direction of the lines, degrees clockwise from horizontal. */
  angleDeg: number;
  /** Polyline simplification tolerance, mm. */
  toleranceMm: number;
  /** Crosshatch: how many directions the hatching is built from. */
  passes: number;
}

export const DEFAULT_PARAMS: AlgorithmParams = {
  threshold: 0.5,
  levels: 1,
  spacingMm: 1.5,
  angleDeg: 45,
  toleranceMm: 0.2,
  passes: 3,
};

export interface AlgorithmInfo {
  id: AlgorithmId;
  name: string;
  /** One line the operator reads while choosing. */
  description: string;
  /** Which parameters this algorithm actually uses, for the tuning panel. */
  params: (keyof AlgorithmParams)[];
  /**
   * True when the algorithm *fills* an area rather than outlining it. A fill is
   * meaningless to a drag knife — it would shred the sticker — so cutting mode
   * offers only the algorithms where this is false.
   */
  fills: boolean;
}

export const ALGORITHMS: AlgorithmInfo[] = [
  {
    id: 'outline',
    name: 'Outline',
    description: 'Traces the edges between light and dark. Line art, logos, high-contrast photos.',
    params: ['threshold', 'levels', 'toleranceMm'],
    fills: false,
  },
  {
    id: 'hatch',
    name: 'Hatching',
    description: 'Fills dark areas with parallel lines, denser where the image is darker.',
    params: ['threshold', 'levels', 'spacingMm', 'angleDeg'],
    fills: true,
  },
  {
    id: 'crosshatch',
    name: 'Crosshatch',
    description: 'Hatching from several directions — the darker the tone, the more directions.',
    params: ['threshold', 'spacingMm', 'angleDeg', 'passes'],
    fills: true,
  },
  {
    id: 'stipple',
    name: 'Stippling',
    description: 'Dots, spread by error diffusion. Soft gradients, portraits, textures.',
    params: ['threshold', 'spacingMm'],
    fills: true,
  },
  {
    id: 'edges',
    name: 'Edge detect',
    description: 'Finds where the image changes sharply. Photographs with a busy background.',
    params: ['threshold', 'toleranceMm'],
    fills: false,
  },
];

/** The algorithms a drag knife can use: outlines, never fills. */
export function contourAlgorithms(): AlgorithmInfo[] {
  return ALGORITHMS.filter((a) => !a.fills);
}

export interface AlgorithmResult {
  polylines: Polyline[];
  widthMm: number;
  heightMm: number;
}

export function runAlgorithm(
  id: AlgorithmId,
  src: FieldSource,
  params: AlgorithmParams,
): AlgorithmResult {
  switch (id) {
    case 'hatch':
      return finish(hatch(src, params));
    case 'crosshatch':
      return finish(crosshatch(src, params));
    case 'stipple':
      return finish(stipple(src, params));
    case 'edges':
      return finish(outline(edgeField(src), { ...params, levels: 1 }));
    default:
      return finish(outline(src, params));
  }
}

/**
 * Iso-contour tracing: the edges where the image crosses a brightness level.
 * With one level that is the silhouette; with more, nested contours read as
 * tone, which is what makes a photograph legible in pen.
 */
function outline(src: FieldSource, params: AlgorithmParams): Polyline[] {
  const levels = Math.max(1, Math.round(params.levels));
  const t = Math.min(0.999, Math.max(0.001, params.threshold));
  const out: Polyline[] = [];
  for (let k = 1; k <= levels; k++) {
    const value = (t * k) / levels;
    for (const c of isoContours(src.field, src.gw, src.gh, value)) {
      const mm = c.map((p) => ({ x: p.x * src.mmPerGrid, y: p.y * src.mmPerGrid }));
      const simplified = simplifyPolyline(mm, params.toleranceMm);
      if (simplified.length >= 2) out.push(simplified);
    }
  }
  return out;
}

/**
 * Tonal hatching: parallel lines across the image, drawn only where the tone is
 * dark enough for that line.
 *
 * Every line draws in the darkest areas; every second line also draws in
 * mid-tones; and so on — so density, not line weight, carries the tone. That is
 * how a pen shades: it has exactly one ink colour and one line width.
 *
 * Lines run at `angleDeg` across the image's bounding box. A run of "pen down"
 * samples becomes one polyline, and runs shorter than the line spacing are
 * dropped: below that, the pen spends more time lifting and dropping than
 * drawing, and the result reads as noise rather than tone.
 */
function hatch(src: FieldSource, params: AlgorithmParams): Polyline[] {
  const { gw, gh, mmPerGrid } = src;
  const wMm = (gw - 1) * mmPerGrid;
  const hMm = (gh - 1) * mmPerGrid;
  const spacing = Math.max(0.2, params.spacingMm);
  const levels = Math.max(1, Math.round(params.levels));
  const threshold = Math.min(1, Math.max(0, params.threshold));

  const rad = (params.angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  // Normal to the lines: stepping along it by `spacing` is what spaces them.
  const nx = -dy;
  const ny = dx;

  // Project the image's corners onto both axes to find how far the family of
  // lines has to run to cover it at this angle.
  const corners = [
    { x: 0, y: 0 },
    { x: wMm, y: 0 },
    { x: 0, y: hMm },
    { x: wMm, y: hMm },
  ];
  const along = corners.map((c) => c.x * dx + c.y * dy);
  const across = corners.map((c) => c.x * nx + c.y * ny);
  const a0 = Math.min(...along);
  const a1 = Math.max(...along);
  const c0 = Math.min(...across);
  const c1 = Math.max(...across);

  // Sample at least twice per grid cell so a thin dark feature is not stepped over.
  const step = Math.max(0.05, Math.min(spacing / 2, mmPerGrid / 2));
  const sample = (x: number, y: number): number | null => {
    const gx = x / mmPerGrid;
    const gy = y / mmPerGrid;
    if (gx < 0 || gy < 0 || gx > gw - 1 || gy > gh - 1) return null;
    // Nearest sample: the field is already a downsampled working copy, so
    // bilinear filtering would only blur features the operator can see.
    return src.field[Math.round(gy) * gw + Math.round(gx)];
  };

  const out: Polyline[] = [];
  const lineCount = Math.ceil((c1 - c0) / spacing);
  for (let i = 0; i <= lineCount; i++) {
    const c = c0 + i * spacing;
    // The darkness this line requires: every line draws in the darkest tones,
    // each successive line in one fewer tonal band.
    const need = (threshold * ((i % levels) + 1)) / levels;
    let run: Polyline = [];
    for (let a = a0; a <= a1; a += step) {
      const x = dx * a + nx * c;
      const y = dy * a + ny * c;
      const v = sample(x, y);
      const inked = v !== null && 1 - v >= 1 - need;
      if (inked) {
        run.push({ x, y });
      } else if (run.length > 0) {
        pushRun(out, run, spacing);
        run = [];
      }
    }
    pushRun(out, run, spacing);
  }
  return out;
}

/**
 * Crosshatch: hatching from several directions, where the number of directions
 * is what carries the tone.
 *
 * Each pass is a full hatch at its own angle, but only in tones dark enough to
 * deserve it: the first pass covers everything past the threshold, the last only
 * the darkest areas. That is how hatching is built up by hand, and it gives
 * darker darks than a single direction can without the lines merging into a
 * solid block of ink.
 */
function crosshatch(src: FieldSource, params: AlgorithmParams): Polyline[] {
  const passes = Math.max(1, Math.min(6, Math.round(params.passes)));
  const out: Polyline[] = [];
  for (let k = 0; k < passes; k++) {
    // Spread the directions evenly over a half turn — past 180° a line repeats
    // the direction of (angle - 180), so the extra passes would draw on top of
    // earlier ones instead of crossing them.
    const angleDeg = params.angleDeg + (k * 180) / passes;
    // Pass k only draws where the tone is in the darkest (k+1)/passes of the range.
    const threshold = (params.threshold * (passes - k)) / passes;
    out.push(...hatch(src, { ...params, angleDeg, threshold, levels: 1 }));
  }
  return out;
}

/**
 * Stippling: dots on a grid, placed by Floyd–Steinberg error diffusion so that
 * their local density matches the tone. Error diffusion rather than a threshold
 * per cell, because a plain threshold produces flat bands where a gradient
 * should be smooth — the error carried into neighbouring cells is what turns a
 * binary decision into continuous tone.
 *
 * Each dot is a short segment rather than a point: the G-code generator draws
 * polylines, and a zero-length one leaves the pen down in one spot without
 * moving, which on an inked tip blots rather than dots.
 */
function stipple(src: FieldSource, params: AlgorithmParams): Polyline[] {
  const { gw, gh, mmPerGrid } = src;
  const spacing = Math.max(0.3, params.spacingMm);
  const cellsX = Math.max(1, Math.floor(((gw - 1) * mmPerGrid) / spacing));
  const cellsY = Math.max(1, Math.floor(((gh - 1) * mmPerGrid) / spacing));
  const threshold = Math.min(1, Math.max(0, params.threshold));

  // Average the image down to the dot grid first: sampling one pixel per cell
  // would let noise decide where dots land.
  const tone = new Float32Array(cellsX * cellsY);
  for (let cy = 0; cy < cellsY; cy++) {
    for (let cx = 0; cx < cellsX; cx++) {
      const x0 = Math.floor((cx * (gw - 1)) / cellsX);
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * (gw - 1)) / cellsX));
      const y0 = Math.floor((cy * (gh - 1)) / cellsY);
      const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * (gh - 1)) / cellsY));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          sum += src.field[y * gw + x];
          n++;
        }
      // Darkness, scaled so `threshold` is the lightest tone that gets any dots.
      const darkness = 1 - sum / Math.max(1, n);
      tone[cy * cellsX + cx] = threshold > 0 ? Math.min(1, darkness / threshold) : 0;
    }
  }

  const dotLen = Math.min(0.4, spacing / 3);
  const out: Polyline[] = [];
  for (let cy = 0; cy < cellsY; cy++) {
    for (let cx = 0; cx < cellsX; cx++) {
      const i = cy * cellsX + cx;
      const v = tone[i];
      const on = v >= 0.5;
      const err = v - (on ? 1 : 0);
      // Floyd–Steinberg: push the error right, and down-left/down/down-right.
      const add = (x: number, y: number, w: number) => {
        if (x < 0 || y < 0 || x >= cellsX || y >= cellsY) return;
        tone[y * cellsX + x] += err * w;
      };
      add(cx + 1, cy, 7 / 16);
      add(cx - 1, cy + 1, 3 / 16);
      add(cx, cy + 1, 5 / 16);
      add(cx + 1, cy + 1, 1 / 16);
      if (!on) continue;
      const x = (cx + 0.5) * spacing;
      const y = (cy + 0.5) * spacing;
      out.push([
        { x: x - dotLen / 2, y },
        { x: x + dotLen / 2, y },
      ]);
    }
  }
  return out;
}

/**
 * Sobel edge magnitude, returned as a field where strong edges are *dark* — so
 * the existing contour tracer, which follows a brightness level, traces the
 * edges. Normalised by the strongest edge in the image, so the threshold means
 * the same thing on a flat photograph as on a high-contrast one.
 */
export function edgeField(src: FieldSource): FieldSource {
  const { field, gw, gh } = src;
  const out = new Float32Array(gw * gh).fill(1);
  let max = 0;
  const mag = new Float32Array(gw * gh);
  for (let y = 1; y < gh - 1; y++) {
    for (let x = 1; x < gw - 1; x++) {
      const at = (dx: number, dy: number) => field[(y + dy) * gw + (x + dx)];
      const gx = -at(-1, -1) - 2 * at(-1, 0) - at(-1, 1) + at(1, -1) + 2 * at(1, 0) + at(1, 1);
      const gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1);
      const m = Math.hypot(gx, gy);
      mag[y * gw + x] = m;
      if (m > max) max = m;
    }
  }
  if (max > 0) {
    for (let i = 0; i < mag.length; i++) out[i] = 1 - mag[i] / max;
  }
  return { field: out, gw, gh, mmPerGrid: src.mmPerGrid };
}

/** Keep a hatch run only if it is long enough to be worth a pen-down cycle. */
function pushRun(out: Polyline[], run: Polyline, spacing: number): void {
  if (run.length < 2) return;
  const a = run[0];
  const b = run[run.length - 1];
  if (Math.hypot(b.x - a.x, b.y - a.y) < spacing) return;
  // A run is straight by construction, so only its ends are needed.
  out.push([a, b]);
}

/** Normalise to the origin and report the resulting size, like an import does. */
function finish(polylines: Polyline[]): AlgorithmResult {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of polylines)
    for (const p of poly) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  if (!isFinite(minX)) return { polylines: [], widthMm: 0, heightMm: 0 };
  for (const poly of polylines)
    for (const p of poly) {
      p.x -= minX;
      p.y -= minY;
    }
  return { polylines, widthMm: maxX - minX, heightMm: maxY - minY };
}
