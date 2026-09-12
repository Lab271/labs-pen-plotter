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

export type AlgorithmId = 'outline' | 'hatch';

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
}

export const DEFAULT_PARAMS: AlgorithmParams = {
  threshold: 0.5,
  levels: 1,
  spacingMm: 1.5,
  angleDeg: 45,
  toleranceMm: 0.2,
};

export interface AlgorithmInfo {
  id: AlgorithmId;
  name: string;
  /** One line the operator reads while choosing. */
  description: string;
  /** Which parameters this algorithm actually uses, for the tuning panel. */
  params: (keyof AlgorithmParams)[];
}

export const ALGORITHMS: AlgorithmInfo[] = [
  {
    id: 'outline',
    name: 'Outline',
    description: 'Traces the edges between light and dark. Line art, logos, high-contrast photos.',
    params: ['threshold', 'levels', 'toleranceMm'],
  },
  {
    id: 'hatch',
    name: 'Hatching',
    description: 'Fills dark areas with parallel lines, denser where the image is darker.',
    params: ['threshold', 'levels', 'spacingMm', 'angleDeg'],
  },
];

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
  const polylines = id === 'hatch' ? hatch(src, params) : outline(src, params);
  return finish(polylines);
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
