import { describe, expect, it } from 'vitest';
import {
  assertOpCodes,
  decodePdfPage,
  DRAW_OPS,
  multiply,
  PDF_OPS,
  type Matrix,
  type OperatorList,
} from '../pdf';
import { bounds } from '../place';

const A4 = [0, 0, 595.276, 841.89]; // 210 × 297 mm in PDF points

/** Build an operator list the way pdf.js hands one over. */
function ops(entries: Array<[number, unknown[]]>): OperatorList {
  return { fnArray: entries.map((e) => e[0]), argsArray: entries.map((e) => e[1]) };
}
const path = (data: number[], paintOp = 20): [number, unknown[]] => [
  PDF_OPS.constructPath,
  [paintOp, [Float32Array.from(data)], Float32Array.from([0, 0, 0, 0])],
];

describe('multiply', () => {
  it('composes two affine matrices in PDF order', () => {
    const scale: Matrix = [2, 0, 0, 2, 0, 0];
    const move: Matrix = [1, 0, 0, 1, 10, 5];
    // Applying `move` inside `scale` scales the translation too.
    expect(multiply(scale, move)).toEqual([2, 0, 0, 2, 20, 10]);
  });
});

describe('decodePdfPage', () => {
  it('reports the page size in millimetres', () => {
    const g = decodePdfPage(ops([]), A4);
    expect(g.widthMm).toBeCloseTo(210, 1);
    expect(g.heightMm).toBeCloseTo(297, 1);
  });

  it('converts a path to mm and flips it into the app frame', () => {
    // A line along the bottom of the page in PDF space (y up) must come out at
    // the *bottom* in the app's y-down frame — everything downstream assumes
    // one convention, and this is the boundary where the other one stops.
    const g = decodePdfPage(ops([path([DRAW_OPS.moveTo, 0, 0, DRAW_OPS.lineTo, 283.46, 0])]), A4);
    expect(g.polylines).toHaveLength(1);
    const b = bounds(g.polylines);
    expect(b.minX).toBeCloseTo(0, 1);
    expect(b.maxX).toBeCloseTo(100, 1); // 283.46 pt = 100 mm
    expect(b.minY).toBeCloseTo(297, 1); // bottom of the page
  });

  it('decodes a closed triangle back to its start point', () => {
    const g = decodePdfPage(
      ops([
        path([
          DRAW_OPS.moveTo,
          100,
          100,
          DRAW_OPS.lineTo,
          300,
          100,
          DRAW_OPS.lineTo,
          200,
          300,
          DRAW_OPS.closePath,
        ]),
      ]),
      A4,
    );
    const [poly] = g.polylines;
    expect(poly).toHaveLength(4);
    expect(poly[0].x).toBeCloseTo(poly[3].x, 6);
    expect(poly[0].y).toBeCloseTo(poly[3].y, 6);
  });

  it('flattens a cubic curve into points that follow it', () => {
    const g = decodePdfPage(
      ops([path([DRAW_OPS.moveTo, 0, 0, DRAW_OPS.curveTo, 100, 200, 200, 200, 300, 0])]),
      A4,
    );
    const [poly] = g.polylines;
    expect(poly.length).toBeGreaterThan(4);
    // The curve bulges away from the chord, so it must not be a straight line.
    const b = bounds(g.polylines);
    expect(b.height).toBeGreaterThan(1);
  });

  it('treats a quadratic curve as a curve, not a corner', () => {
    const g = decodePdfPage(
      ops([path([DRAW_OPS.moveTo, 0, 0, DRAW_OPS.quadraticCurveTo, 150, 200, 300, 0])]),
      A4,
    );
    expect(g.polylines[0].length).toBeGreaterThan(4);
  });

  it('applies the current transform, and unwinds it on restore', () => {
    const g = decodePdfPage(
      ops([
        [PDF_OPS.save, []],
        [PDF_OPS.transform, [1, 0, 0, 1, 283.46, 0]], // shift right by 100 mm
        path([DRAW_OPS.moveTo, 0, 0, DRAW_OPS.lineTo, 0, 283.46]),
        [PDF_OPS.restore, []],
        path([DRAW_OPS.moveTo, 0, 0, DRAW_OPS.lineTo, 0, 283.46]),
      ]),
      A4,
    );
    expect(g.polylines).toHaveLength(2);
    expect(g.polylines[0][0].x).toBeCloseTo(100, 1);
    expect(g.polylines[1][0].x).toBeCloseTo(0, 1);
  });

  it('composes nested transforms', () => {
    const g = decodePdfPage(
      ops([
        [PDF_OPS.transform, [2, 0, 0, 2, 0, 0]],
        [PDF_OPS.transform, [1, 0, 0, 1, 100, 0]],
        path([DRAW_OPS.moveTo, 0, 0, DRAW_OPS.lineTo, 10, 0]),
      ]),
      A4,
    );
    // Translation applied inside a 2× scale lands at 200 pt, not 100.
    expect(g.polylines[0][0].x).toBeCloseTo(200 * (25.4 / 72), 2);
  });

  it('counts text runs instead of drawing them', () => {
    // A PDF's text is glyph outlines; tracing them would plot hollow letters.
    const g = decodePdfPage(
      ops([
        [PDF_OPS.showText, []],
        [PDF_OPS.showText, []],
      ]),
      A4,
    );
    expect(g.skippedText).toBe(2);
    expect(g.polylines).toEqual([]);
  });

  it('reports that a page paints images', () => {
    // The signal that a "PDF" is really a scan, and belongs in the raster wizard.
    expect(decodePdfPage(ops([[PDF_OPS.paintImageXObject, ['img']]]), A4).hasImages).toBe(true);
    expect(decodePdfPage(ops([]), A4).hasImages).toBe(false);
  });

  it('drops a single-point subpath rather than emitting it', () => {
    const g = decodePdfPage(ops([path([DRAW_OPS.moveTo, 10, 10])]), A4);
    expect(g.polylines).toEqual([]);
  });

  it('stops reading a chunk it cannot interpret, instead of misreading coordinates', () => {
    // Opcodes and coordinates share one stream: guessing past an unknown opcode
    // would turn the rest of the path into nonsense geometry.
    const g = decodePdfPage(
      ops([path([DRAW_OPS.moveTo, 0, 0, DRAW_OPS.lineTo, 100, 0, 99, 12345, 6789])]),
      A4,
    );
    expect(g.polylines).toHaveLength(1);
    expect(g.polylines[0]).toHaveLength(2);
  });

  it('handles several subpaths in one constructPath', () => {
    const g = decodePdfPage(
      ops([
        path([
          DRAW_OPS.moveTo,
          0,
          0,
          DRAW_OPS.lineTo,
          100,
          0,
          DRAW_OPS.moveTo,
          0,
          100,
          DRAW_OPS.lineTo,
          100,
          100,
        ]),
      ]),
      A4,
    );
    expect(g.polylines).toHaveLength(2);
  });

  it('falls back to A4 for a missing page box', () => {
    const g = decodePdfPage(ops([]), []);
    expect(g.widthMm).toBeCloseTo(210, 0);
  });
});

describe('assertOpCodes', () => {
  it('accepts the codes it was written against', () => {
    expect(() => assertOpCodes({ ...PDF_OPS })).not.toThrow();
  });

  it('refuses a build that numbers its operators differently', () => {
    // Silent renumbering would not break the build — it would just make every
    // PDF import as blank.
    expect(() => assertOpCodes({ ...PDF_OPS, constructPath: 999 })).toThrow(/pdf\.js/);
  });
});
