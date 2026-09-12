import { describe, expect, it } from 'vitest';
import { bounds } from '../place';
import { DEFAULT_SHAPE, shapePolylines, shapeSize, type ShapeSpec } from '../shapes';

const spec = (over: Partial<ShapeSpec>): ShapeSpec => ({ ...DEFAULT_SHAPE, ...over });

describe('shapePolylines', () => {
  it('draws a line across the box', () => {
    expect(shapePolylines(spec({ shape: 'line', widthMm: 40, heightMm: 20 }))).toEqual([
      [
        { x: 0, y: 0 },
        { x: 40, y: 20 },
      ],
    ]);
  });

  it('closes a rectangle back onto its first corner', () => {
    // An open contour leaves a gap the width of the pen tip at the start corner.
    const [rect] = shapePolylines(spec({ shape: 'rect', widthMm: 30, heightMm: 10 }));
    expect(rect[0]).toEqual(rect[rect.length - 1]);
    expect(bounds([rect])).toMatchObject({ minX: 0, minY: 0, maxX: 30, maxY: 10 });
  });

  it('fills the box with an ellipse and closes it', () => {
    const [ellipse] = shapePolylines(spec({ shape: 'ellipse', widthMm: 40, heightMm: 20 }));
    const b = bounds([ellipse]);
    expect(b.minX).toBeCloseTo(0, 6);
    expect(b.minY).toBeCloseTo(0, 6);
    expect(b.maxX).toBeCloseTo(40, 6);
    expect(b.maxY).toBeCloseTo(20, 6);
    expect(ellipse[0].x).toBeCloseTo(ellipse[ellipse.length - 1].x, 6);
    expect(ellipse[0].y).toBeCloseTo(ellipse[ellipse.length - 1].y, 6);
  });

  it('draws a polygon with one vertex per side, point-up', () => {
    const [poly] = shapePolylines(spec({ shape: 'polygon', sides: 5, widthMm: 20, heightMm: 20 }));
    // n + 1 points: the closing point repeats the first.
    expect(poly).toHaveLength(6);
    // Point-up: the first vertex is at the top-centre of the box.
    expect(poly[0].x).toBeCloseTo(10, 6);
    expect(poly[0].y).toBeCloseTo(0, 6);
  });

  it('clamps a polygon to at least three sides', () => {
    for (const sides of [0, 1, 2, -5]) {
      const [poly] = shapePolylines(spec({ shape: 'polygon', sides }));
      expect(poly.length).toBe(4); // triangle + closing point
    }
  });

  it('never produces a degenerate shape from a zero or negative size', () => {
    // A slider dragged to zero must not delete the object's geometry.
    for (const shape of ['line', 'rect', 'ellipse', 'polygon'] as const) {
      const polys = shapePolylines(spec({ shape, widthMm: 0, heightMm: -3 }));
      expect(polys[0].length).toBeGreaterThanOrEqual(2);
      const b = bounds(polys);
      expect(b.width).toBeGreaterThan(0);
      expect(b.height).toBeGreaterThan(0);
    }
  });
});

describe('shapeSize', () => {
  it('reports the clamped box', () => {
    expect(shapeSize(spec({ widthMm: 0, heightMm: 50 }))).toEqual({
      widthMm: 0.1,
      heightMm: 50,
    });
  });
});
