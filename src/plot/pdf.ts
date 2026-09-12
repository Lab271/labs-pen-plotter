/**
 * PDF import: vector pages become lines, everything else becomes an image.
 *
 * The print-and-cut files an operator is handed are PDFs, and a PDF is either
 * already the thing we want (paths, at a real size the page declares) or a
 * picture of it (a scan). Those want opposite treatment, so this module answers
 * "which is it?" and produces the right thing.
 *
 * The decoding of pdf.js's operator list is a pure function, testable without a
 * PDF or a DOM; loading and rasterising need the library and a canvas, and are
 * kept to the edges.
 */
import type { FieldSource } from './raster';
import { simplifyPolyline } from './svg';
import type { Point, Polyline } from './types';

/** PDF user space is 1/72 inch. */
const PT_TO_MM = 25.4 / 72;

/**
 * pdf.js operator codes, as of v6. Only the ones that matter here.
 *
 * Hard-coded so the decoder can be tested without loading the library — and
 * checked against the real `OPS` at load time (`assertOpCodes`), because a
 * silent renumbering in a future version would not break the build, it would
 * just quietly stop finding any paths.
 */
export const PDF_OPS = {
  save: 10,
  restore: 11,
  transform: 12,
  showText: 44,
  paintImageXObject: 85,
  paintInlineImageXObject: 86,
  constructPath: 91,
} as const;

/** Path-data opcodes inside a `constructPath`, with their argument counts. */
export const DRAW_OPS = {
  moveTo: 0,
  lineTo: 1,
  curveTo: 2,
  quadraticCurveTo: 3,
  closePath: 4,
} as const;

/** A 2-D affine matrix in PDF order: [a, b, c, d, e, f]. */
export type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m: Matrix, x: number, y: number): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/**
 * Flatten a cubic Bézier into points, excluding its start (the caller already
 * has it). Segment count follows the control polygon, so a gentle curve costs a
 * few points and a tight one gets what it needs.
 */
function cubic(p0: Point, p1: Point, p2: Point, p3: Point, toleranceMm: number): Point[] {
  const rough =
    Math.hypot(p1.x - p0.x, p1.y - p0.y) +
    Math.hypot(p2.x - p1.x, p2.y - p1.y) +
    Math.hypot(p3.x - p2.x, p3.y - p2.y);
  const steps = Math.max(2, Math.min(64, Math.ceil(rough / Math.max(0.05, toleranceMm))));
  const out: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}

export interface PdfPageGeometry {
  polylines: Polyline[];
  /** The page's own size, in mm — a cut file's real size comes from here. */
  widthMm: number;
  heightMm: number;
  /** Text runs skipped: a PDF's text is glyph outlines, not strokes. */
  skippedText: number;
  /** True if the page paints images — the signal that it may be a scan. */
  hasImages: boolean;
}

export interface OperatorList {
  fnArray: ArrayLike<number>;
  argsArray: ArrayLike<unknown>;
}

/**
 * Turn a page's operator list into polylines in millimetres, in the app's frame
 * (origin at the page's top-left, y down).
 *
 * PDF user space has its origin at the bottom-left with y up, so the whole page
 * is flipped here rather than anywhere later: everything downstream — placement,
 * registration, G-code — assumes one convention, and this is the boundary where
 * the other one stops.
 */
export function decodePdfPage(
  ops: OperatorList,
  view: number[],
  toleranceMm = 0.2,
): PdfPageGeometry {
  const [x0, y0, x1, y1] = view.length === 4 ? view : [0, 0, 595, 842];
  const pageW = Math.abs(x1 - x0);
  const pageH = Math.abs(y1 - y0);

  const polylines: Polyline[] = [];
  let skippedText = 0;
  let hasImages = false;

  let ctm: Matrix = IDENTITY;
  const stack: Matrix[] = [];

  // PDF points → mm, with the page flipped into a y-down frame.
  const toMm = (p: Point): Point => ({
    x: (p.x - Math.min(x0, x1)) * PT_TO_MM,
    y: (pageH - (p.y - Math.min(y0, y1))) * PT_TO_MM,
  });

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[];
    switch (fn) {
      case PDF_OPS.save:
        stack.push(ctm);
        break;
      case PDF_OPS.restore:
        ctm = stack.pop() ?? IDENTITY;
        break;
      case PDF_OPS.transform:
        ctm = multiply(ctm, (args as unknown as number[]).slice(0, 6) as Matrix);
        break;
      case PDF_OPS.showText:
        skippedText++;
        break;
      case PDF_OPS.paintImageXObject:
      case PDF_OPS.paintInlineImageXObject:
        hasImages = true;
        break;
      case PDF_OPS.constructPath: {
        // args: [paintOp, [pathData…], minMax]. The path data is a flat run of
        // opcode-then-coordinates, in the user space of the current transform.
        const data = args?.[1];
        const chunks = Array.isArray(data) ? data : [data];
        for (const chunk of chunks) {
          if (!chunk || typeof (chunk as ArrayLike<number>).length !== 'number') continue;
          polylines.push(...decodePathData(chunk as ArrayLike<number>, ctm, toMm, toleranceMm));
        }
        break;
      }
    }
  }

  return {
    polylines: polylines.map((p) => simplifyPolyline(p, toleranceMm)).filter((p) => p.length >= 2),
    widthMm: pageW * PT_TO_MM,
    heightMm: pageH * PT_TO_MM,
    skippedText,
    hasImages,
  };
}

/** Decode one `constructPath` payload into polylines, in mm. */
function decodePathData(
  data: ArrayLike<number>,
  ctm: Matrix,
  toMm: (p: Point) => Point,
  toleranceMm: number,
): Polyline[] {
  const out: Polyline[] = [];
  let current: Polyline = [];
  let start: Point | null = null;
  const push = () => {
    if (current.length >= 2) out.push(current);
    current = [];
  };
  const at = (x: number, y: number) => toMm(apply(ctm, x, y));

  let i = 0;
  while (i < data.length) {
    const op = data[i++];
    switch (op) {
      case DRAW_OPS.moveTo: {
        push();
        const p = at(data[i++], data[i++]);
        current = [p];
        start = p;
        break;
      }
      case DRAW_OPS.lineTo:
        current.push(at(data[i++], data[i++]));
        break;
      case DRAW_OPS.curveTo: {
        const p0 = current[current.length - 1] ?? at(data[i], data[i + 1]);
        const c1 = at(data[i++], data[i++]);
        const c2 = at(data[i++], data[i++]);
        const p3 = at(data[i++], data[i++]);
        current.push(...cubic(p0, c1, c2, p3, toleranceMm));
        break;
      }
      case DRAW_OPS.quadraticCurveTo: {
        const p0 = current[current.length - 1] ?? at(data[i], data[i + 1]);
        const c = at(data[i++], data[i++]);
        const p2 = at(data[i++], data[i++]);
        // A quadratic is a cubic whose controls sit two-thirds of the way out.
        const c1 = { x: p0.x + (2 / 3) * (c.x - p0.x), y: p0.y + (2 / 3) * (c.y - p0.y) };
        const c2 = { x: p2.x + (2 / 3) * (c.x - p2.x), y: p2.y + (2 / 3) * (c.y - p2.y) };
        current.push(...cubic(p0, c1, c2, p2, toleranceMm));
        break;
      }
      case DRAW_OPS.closePath:
        if (start && current.length > 0) current.push(start);
        break;
      default:
        // An opcode this decoder does not know: the rest of this chunk cannot be
        // read safely, since opcodes and coordinates share one stream.
        i = data.length;
        break;
    }
  }
  push();
  return out;
}

/**
 * Check the hard-coded operator codes against the library's own. A renumbering
 * would otherwise be invisible: no error, just a PDF that imports as blank.
 */
export function assertOpCodes(OPS: Record<string, number>): void {
  for (const [name, code] of Object.entries(PDF_OPS)) {
    if (OPS[name] !== code) {
      throw new Error(
        `This build of pdf.js numbers its operators differently (${name} is ${OPS[name]}, expected ${code}). PDF import needs updating.`,
      );
    }
  }
}

// ---- loading (browser only: needs the library and, for scans, a canvas) ----

/** A PDF opened for import. `destroy` releases the worker. */
export interface LoadedPdf {
  numPages: number;
  /** Vector geometry of a page. Empty polylines mean "this page is a picture". */
  geometry(pageNumber: number, toleranceMm?: number): Promise<PdfPageGeometry>;
  /** Render a page as a grayscale field, for the raster import wizard. */
  field(pageNumber: number, maxDim: number): Promise<FieldSource>;
  destroy(): Promise<void>;
}

/**
 * Open a PDF. The library is imported on demand — it is by far the largest
 * dependency here, and most sessions never open a PDF at all, so it must not
 * sit in the bundle every client downloads to jog the machine.
 */
export async function loadPdf(file: Blob): Promise<LoadedPdf> {
  const pdfjs = await import('pdfjs-dist');
  // The worker has to be addressed as a URL Vite can fingerprint and serve.
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  assertOpCodes(pdfjs.OPS as unknown as Record<string, number>);

  const data = new Uint8Array(await file.arrayBuffer());
  // Keep the loading task: destroying *that* is what shuts the worker down.
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;

  return {
    numPages: doc.numPages,

    async geometry(pageNumber, toleranceMm = 0.2) {
      const page = await doc.getPage(pageNumber);
      const ops = await page.getOperatorList();
      return decodePdfPage(ops, page.view, toleranceMm);
    },

    async field(pageNumber, maxDim) {
      const page = await doc.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(4, Math.max(0.2, maxDim / Math.max(base.width, base.height)));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(2, Math.round(viewport.width));
      canvas.height = Math.max(2, Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not render that PDF page (no 2D canvas).');
      // A PDF page has no background of its own; without this, transparent
      // areas read as black and the whole page traces as one solid blob.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Print intent, although nothing is being printed: the display path
      // drives its render loop with requestAnimationFrame, which does not fire
      // in a background tab — so an import started and then left alone would
      // hang for ever. This is a rasterisation to trace, not something anyone
      // looks at, so there is no reason to be on the animation clock.
      await page.render({ canvas, canvasContext: ctx, viewport, intent: 'print' }).promise;

      const { data: px } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const field = new Float32Array(canvas.width * canvas.height);
      for (let i = 0; i < field.length; i++) {
        field[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
      }
      // The page's real size divided by the pixels we rendered it into: a scan
      // of an A4 sheet imports as A4, whatever resolution it was rendered at.
      const mmPerGrid = (base.width * PT_TO_MM) / canvas.width;
      return { field, gw: canvas.width, gh: canvas.height, mmPerGrid };
    },

    async destroy() {
      await task.destroy();
    },
  };
}
