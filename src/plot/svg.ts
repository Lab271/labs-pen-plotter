import type { Artwork, Point, Polyline } from './types';

const DRAWABLE = 'path,line,polyline,polygon,rect,circle,ellipse';
const PX_TO_MM = 25.4 / 96; // CSS pixel → mm fallback when no real units are given

export interface ImportResult {
  artwork: Artwork;
  /** Count of elements skipped (e.g. unsupported shapes). */
  skipped: number;
}

export interface FlattenOptions {
  /** Reports progress as (subpaths processed, total subpaths). */
  onProgress?: (done: number, total: number) => void;
  /** Polled cooperatively; set `aborted` to true to cancel an in-flight import. */
  signal?: { aborted: boolean };
}

/** Thrown by flattenSvg when its abort signal fires; callers should ignore it. */
export const ABORTED = Symbol('svg-import-aborted');

/**
 * Flatten an SVG's stroke geometry into polylines in millimeters, with the
 * artwork's bounding-box top-left at (0,0). Browser-only (uses the DOM's SVG
 * engine: getCTM + getPointAtLength). Stroke-based: fills/text are ignored.
 *
 * Async + time-sliced: large files (thousands of subpaths) would otherwise block
 * the main thread for many seconds and freeze the UI. The work is yielded to the
 * event loop every ~50 ms so the page stays responsive and progress can be shown.
 */
export async function flattenSvg(
  svgText: string,
  toleranceMm: number,
  opts: FlattenOptions = {},
): Promise<ImportResult> {
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (parsed.querySelector('parsererror')) throw new Error('Invalid SVG file.');
  const rootEl = parsed.querySelector('svg');
  if (!rootEl) throw new Error('No <svg> element found.');

  const host = document.createElement('div');
  host.setAttribute(
    'style',
    'position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden',
  );
  const svg = document.importNode(rootEl, true) as SVGSVGElement;
  host.appendChild(svg);
  document.body.appendChild(host);

  try {
    const unitToMm = computeUnitToMm(svg);
    const tolUser = Math.max(toleranceMm / unitToMm, 1e-4);
    const polylines: Polyline[] = [];
    let skipped = 0;

    // Resolve each element's subpaths once (cheap) so we can report progress
    // against the total stroke count — one giant <path> dominates the work, so
    // per-element progress alone would stall at "stuck on one element".
    const els = Array.from(svg.querySelectorAll<SVGGraphicsElement>(DRAWABLE));
    const work = els.map((el) => ({ el, subDs: shapeToSubpathDs(el) }));
    const total = work.reduce((n, w) => n + w.subDs.length, 0);

    // Cooperative time-slicing: yield to the event loop (and report progress)
    // every ~50 ms so a multi-second import never freezes the UI. `tick` must be
    // called often enough that no synchronous run between two calls exceeds the
    // budget — a single huge subpath can need >100k samples, so sampleSubpaths
    // ticks inside its sample loop, not just at subpath boundaries.
    let processed = 0;
    let lastYield = performance.now();
    const tick = async () => {
      if (performance.now() - lastYield < 50) return;
      if (opts.signal?.aborted) throw ABORTED;
      opts.onProgress?.(processed, total);
      await new Promise((r) => setTimeout(r));
      lastYield = performance.now();
    };

    const scratch = document.createElementNS(SVG_NS, 'path');
    svg.appendChild(scratch);
    try {
      for (const { el, subDs } of work) {
        // A null CTM means the element is not rendered (display:none, inside
        // <defs>/<clipPath>/<symbol>, or detached) — skip cheaply, no style lookup.
        const ctm = el.getCTM();
        if (!ctm || !isVisible(el) || subDs.length === 0) {
          skipped++;
          processed += subDs.length;
          await tick();
          continue;
        }
        const sampled = await sampleSubpaths(scratch, subDs, tolUser, {
          tick,
          subpathDone: () => {
            processed++;
          },
        });
        for (let s = 0; s < sampled.length; s++) {
          const mm = sampled[s].map((p) => toMm(p, ctm, unitToMm));
          const simplified = simplifyPolyline(mm, toleranceMm);
          if (simplified.length >= 2) polylines.push(simplified);
          if ((s & 0x3f) === 0x3f) await tick(); // keep the UI live during simplify too
        }
      }
    } finally {
      svg.removeChild(scratch);
    }
    opts.onProgress?.(total, total);

    const { widthMm, heightMm } = normalizeToOrigin(polylines);
    return { artwork: { polylines, widthMm, heightMm }, skipped };
  } finally {
    document.body.removeChild(host);
  }
}

/**
 * Cheap visibility check (one computed-style lookup). display:none and
 * defs/clip content are already excluded by a null getCTM(); this catches
 * visibility:hidden and opacity:0. visibility inherits, so the element's own
 * computed value reflects a hidden ancestor.
 */
function isVisible(el: Element): boolean {
  const cs = getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
  if (parseFloat(cs.opacity || '1') === 0) return false;
  return true;
}

function computeUnitToMm(svg: SVGSVGElement): number {
  const vb = svg.viewBox?.baseVal;
  return svgUnitToMm(
    svg.getAttribute('width'),
    svg.getAttribute('height'),
    vb && vb.width > 0 && vb.height > 0 ? { width: vb.width, height: vb.height } : null,
  );
}

/** CSS absolute length units → millimetres (CSS Values 4 §6.2). */
const UNIT_TO_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  q: 0.25,
  in: 25.4,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
  px: PX_TO_MM,
  '': PX_TO_MM, // unitless <length> on the root element means CSS pixels
};

/** An SVG root `width`/`height` attribute split into its number and its unit's mm factor. */
function parseSvgLength(attr: string | null | undefined): { value: number; factor: number } | null {
  if (!attr) return null;
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(attr);
  if (!m) return null;
  const factor = UNIT_TO_MM[m[2].toLowerCase()];
  if (factor === undefined) return null; // %, em, ex, vw… have no fixed physical size
  const value = parseFloat(m[1]);
  return value > 0 && isFinite(value) ? { value, factor } : null;
}

/** Parse an SVG root `width`/`height` attribute into millimetres, or null if it has no absolute size. */
export function parseSvgLengthMm(attr: string | null | undefined): number | null {
  const len = parseSvgLength(attr);
  return len ? len.value * len.factor : null;
}

/**
 * Scale factor from SVG user units to millimetres.
 *
 * A pen plotter draws at physical scale, so an SVG that declares its real size
 * (`width="210mm"` + `viewBox`) has to import at exactly that size. The user
 * unit is `width / viewBox.width`; `height / viewBox.height` is used when only
 * the height is sized. Any CSS absolute unit counts — Inkscape exports mm,
 * Illustrator pt, and many tools cm or in.
 *
 * Without a viewBox the user unit *is* the declared unit (the spec's default
 * viewBox is `0 0 width height`), so the factor is just that unit in mm.
 * Without any absolute size the only defensible reading is CSS pixels.
 */
export function svgUnitToMm(
  widthAttr: string | null | undefined,
  heightAttr: string | null | undefined,
  viewBox: { width: number; height: number } | null,
): number {
  const w = parseSvgLength(widthAttr);
  const h = parseSvgLength(heightAttr);
  if (viewBox) {
    if (w) return (w.value * w.factor) / viewBox.width;
    if (h) return (h.value * h.factor) / viewBox.height;
    return PX_TO_MM;
  }
  return (w ?? h)?.factor ?? PX_TO_MM;
}

/** Split a shape into subpath `d` strings (one per pen-down stroke). */
function shapeToSubpathDs(el: SVGGraphicsElement): string[] {
  const tag = el.tagName.toLowerCase();
  let d: string | null = null;
  switch (tag) {
    case 'path':
      d = el.getAttribute('d');
      break;
    case 'line': {
      const x1 = num(el, 'x1'),
        y1 = num(el, 'y1'),
        x2 = num(el, 'x2'),
        y2 = num(el, 'y2');
      d = `M${x1},${y1} L${x2},${y2}`;
      break;
    }
    case 'polyline':
    case 'polygon': {
      const pts = (el.getAttribute('points') ?? '').trim();
      if (!pts) return [];
      d = `M${pts}` + (tag === 'polygon' ? ' Z' : '');
      break;
    }
    case 'rect': {
      const x = num(el, 'x'),
        y = num(el, 'y'),
        w = num(el, 'width'),
        h = num(el, 'height');
      d = `M${x},${y} H${x + w} V${y + h} H${x} Z`;
      break;
    }
    case 'circle': {
      const cx = num(el, 'cx'),
        cy = num(el, 'cy'),
        r = num(el, 'r');
      d = `M${cx - r},${cy} A${r},${r} 0 1 0 ${cx + r},${cy} A${r},${r} 0 1 0 ${cx - r},${cy} Z`;
      break;
    }
    case 'ellipse': {
      const cx = num(el, 'cx'),
        cy = num(el, 'cy'),
        rx = num(el, 'rx'),
        ry = num(el, 'ry');
      d = `M${cx - rx},${cy} A${rx},${ry} 0 1 0 ${cx + rx},${cy} A${rx},${ry} 0 1 0 ${cx - rx},${cy} Z`;
      break;
    }
  }
  if (!d) return [];
  // Split into subpaths at each moveto so the pen lifts between them.
  return d
    .split(/(?=[Mm])/)
    .map((s) => s.trim())
    .filter((s) => /[0-9]/.test(s));
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Sample a path's subpaths into point arrays (one per pen-down stroke), in the
 * path's local coordinates, on a single reused scratch <path>.
 *
 * Each subpath is measured and sampled on its OWN small path — O(total length),
 * not O(subpaths × length). (The old approach joined all subpaths into one path
 * and re-measured a growing prefix string per subpath, which is O(subpaths²) and
 * hangs on files with thousands of subpaths in one element.)
 *
 * A relative subpath (leading lowercase `m`) is positioned relative to the pen
 * point left by the previous subpath; sampled standalone, a fresh path treats its
 * leading moveto as absolute, so we translate those samples back by the running
 * point `cur`. This reproduces the joined-path geometry (verified within ~0.001 mm)
 * without its quadratic cost.
 *
 * `hooks.tick` is awaited periodically (inside the sample loop, not just at subpath
 * boundaries) so the caller can yield to the event loop / report progress even
 * within a single very long subpath. `hooks.subpathDone` is called once per subpath.
 */
interface SampleHooks {
  tick: () => void | Promise<void>;
  subpathDone: () => void;
}

async function sampleSubpaths(
  scratch: SVGPathElement,
  subDs: string[],
  stepUser: number,
  hooks: SampleHooks,
): Promise<Point[][]> {
  const out: Point[][] = [];
  let cur: Point = { x: 0, y: 0 }; // running pen point, in the path's local frame
  for (const d of subDs) {
    scratch.setAttribute('d', d);
    const len = scratch.getTotalLength();
    const rel = /^\s*m/.test(d);
    const tx = rel ? cur.x : 0;
    const ty = rel ? cur.y : 0;
    if (!isFinite(len) || len <= 1e-6) {
      // moveto-only / empty subpath: no stroke, but it still advances the pen.
      const p0 = scratch.getPointAtLength(0);
      cur = { x: p0.x + tx, y: p0.y + ty };
      hooks.subpathDone();
      await hooks.tick();
      continue;
    }
    const n = Math.max(1, Math.ceil(len / stepUser));
    // Sample strictly INSIDE the subpath so a sample never lands exactly on an
    // endpoint (where getPointAtLength can be ambiguous on closed paths).
    const eps = 1e-4;
    const pts: Point[] = [];
    for (let i = 0; i <= n; i++) {
      const off = (eps + (i / n) * (1 - 2 * eps)) * len;
      const p = scratch.getPointAtLength(off);
      pts.push({ x: p.x + tx, y: p.y + ty });
      // Yield within long subpaths so the UI never blocks for more than a slice.
      if ((i & 0xff) === 0xff) await hooks.tick();
    }
    out.push(pts);
    cur = pts[pts.length - 1];
    hooks.subpathDone();
    await hooks.tick();
  }
  return out;
}

function toMm(p: Point, ctm: DOMMatrix | null, unitToMm: number): Point {
  const x = ctm ? ctm.a * p.x + ctm.c * p.y + ctm.e : p.x;
  const y = ctm ? ctm.b * p.x + ctm.d * p.y + ctm.f : p.y;
  return { x: x * unitToMm, y: y * unitToMm };
}

/** Shift all polylines so the bounding-box top-left is (0,0); return size in mm. */
function normalizeToOrigin(polylines: Polyline[]): { widthMm: number; heightMm: number } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const poly of polylines)
    for (const p of poly) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  if (!isFinite(minX)) return { widthMm: 0, heightMm: 0 };
  for (const poly of polylines)
    for (const p of poly) {
      p.x -= minX;
      p.y -= minY;
    }
  return { widthMm: maxX - minX, heightMm: maxY - minY };
}

function num(el: Element, attr: string): number {
  return parseFloat(el.getAttribute(attr) ?? '0') || 0;
}

/**
 * Douglas–Peucker polyline simplification (pure; mm units). Removes points that
 * deviate from the line by less than epsilon — trims oversampled straight runs.
 */
export function simplifyPolyline(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points.slice();
  let maxDist = 0;
  let index = 0;
  const a = points[0];
  const b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], a, b);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }
  if (maxDist <= epsilon) return [a, b];
  const left = simplifyPolyline(points.slice(0, index + 1), epsilon);
  const right = simplifyPolyline(points.slice(index), epsilon);
  return left.slice(0, -1).concat(right);
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}
