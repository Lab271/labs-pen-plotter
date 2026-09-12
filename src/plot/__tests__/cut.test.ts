import { describe, expect, it } from 'vitest';
import {
  applyBladeOffset,
  applyOvercut,
  DEFAULT_CUT_OPTIONS,
  isClosed,
  polylineLength,
  prepareForCut,
} from '../cut';
import type { Polyline } from '../types';

/** A closed 10 mm square, corners in clockwise order. */
const square: Polyline = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
  { x: 0, y: 0 },
];

const openLine: Polyline = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
];

describe('isClosed', () => {
  it('recognises a contour that returns to its start', () => {
    expect(isClosed(square)).toBe(true);
  });

  it('rejects an open polyline', () => {
    expect(isClosed(openLine)).toBe(false);
  });

  it('needs three points, so a there-and-back line is not a contour', () => {
    expect(
      isClosed([
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ]),
    ).toBe(false);
  });

  it('treats a flattened contour as closed even though its ends do not meet', () => {
    // A closed SVG path arrives as sampled points: the last sample lands where
    // the sampling step put it, a couple of tenths of a millimetre from the
    // first. Judging closure at machine epsilon calls every real contour open,
    // which silently disables the overcut — the bug this test exists for.
    const flattened: Polyline = [
      { x: 0.026, y: 0 },
      { x: 80, y: 0.01 },
      { x: 80, y: 50 },
      { x: 0.016, y: 50 },
      { x: 0, y: 0.026 },
    ];
    expect(isClosed(flattened)).toBe(true);
    expect(applyOvercut(flattened, 2).length).toBeGreaterThan(flattened.length);
  });

  it('still rejects a contour with a gap wide enough to matter', () => {
    const gapped: Polyline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 2, y: 0 },
    ];
    expect(isClosed(gapped)).toBe(false);
  });
});

describe('applyOvercut', () => {
  it('continues past the closure point along the path already cut', () => {
    const out = applyOvercut(square, 3);
    const last = out[out.length - 1];
    // The square starts by running along y = 0 toward +x, so 3 mm of overcut
    // lands at (3, 0) — the blade re-cuts the beginning of the contour.
    expect(last).toEqual({ x: 3, y: 0 });
    expect(polylineLength(out)).toBeCloseTo(polylineLength(square) + 3, 6);
  });

  it('carries on around a corner when the overcut is longer than the first segment', () => {
    const out = applyOvercut(square, 12);
    const last = out[out.length - 1];
    expect(last.x).toBeCloseTo(10, 6);
    expect(last.y).toBeCloseTo(2, 6);
  });

  it('leaves an open polyline alone', () => {
    // There is no closure to secure, and extending it would cut material the
    // operator did not ask to cut.
    expect(applyOvercut(openLine, 5)).toEqual(openLine);
  });

  it('is a no-op at zero or a negative distance', () => {
    expect(applyOvercut(square, 0)).toEqual(square);
    expect(applyOvercut(square, -2)).toEqual(square);
  });

  it('does not mutate its input', () => {
    const copy = square.map((p) => ({ ...p }));
    applyOvercut(square, 3);
    expect(square).toEqual(copy);
  });

  it('survives a contour with repeated points', () => {
    const dupes: Polyline = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 0 },
    ];
    const out = applyOvercut(dupes, 2);
    expect(out[out.length - 1]).toEqual({ x: 2, y: 0 });
  });
});

describe('applyBladeOffset', () => {
  it('overshoots a sharp corner and returns to it', () => {
    const out = applyBladeOffset(square, 0.5);
    // At the first corner (10,0) the blade was travelling +x, so the overshoot
    // is at (10.5, 0) and the cut resumes from the corner itself.
    const idx = out.findIndex((p) => Math.abs(p.x - 10.5) < 1e-9 && Math.abs(p.y) < 1e-9);
    expect(idx).toBeGreaterThan(0);
    expect(out[idx - 1]).toEqual({ x: 10, y: 0 });
    expect(out[idx + 1]).toEqual({ x: 10, y: 0 });
  });

  it('compensates every sharp corner of a square', () => {
    const out = applyBladeOffset(square, 0.5);
    // Three interior corners in the point list (the fourth is the closure).
    expect(out.length).toBe(square.length + 3 * 2);
  });

  it('leaves a smooth curve alone', () => {
    // Every vertex of a flattened circle is technically a corner; compensating
    // each one would turn the circle into a ring of spikes.
    const circle: Polyline = [];
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      circle.push({ x: 10 * Math.cos(t), y: 10 * Math.sin(t) });
    }
    expect(applyBladeOffset(circle, 0.5)).toEqual(circle);
  });

  it('is a no-op when the offset is zero (the default)', () => {
    expect(applyBladeOffset(square, 0)).toEqual(square);
    expect(DEFAULT_CUT_OPTIONS.bladeOffsetMm).toBe(0);
  });

  it('ignores degenerate segments rather than producing NaN', () => {
    const dupes: Polyline = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
    ];
    const out = applyBladeOffset(dupes, 0.5);
    for (const p of out) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});

describe('prepareForCut', () => {
  it('compensates first, then overcuts the compensated path', () => {
    // Order matters: the overcut has to re-trace the path the blade actually
    // follows, which is the compensated one.
    const [out] = prepareForCut([square], { overcutMm: 2, bladeOffsetMm: 0.5 });
    const compensated = applyBladeOffset(square, 0.5);
    expect(out.slice(0, compensated.length)).toEqual(compensated);
    expect(polylineLength(out)).toBeCloseTo(polylineLength(compensated) + 2, 6);
  });

  it('passes open geometry through with corner compensation only', () => {
    const [out] = prepareForCut([openLine], { overcutMm: 2, bladeOffsetMm: 0 });
    expect(out).toEqual(openLine);
  });

  it('leaves everything alone with both features off', () => {
    const polys = [square, openLine];
    expect(prepareForCut(polys, { overcutMm: 0, bladeOffsetMm: 0 })).toEqual(polys);
  });
});
