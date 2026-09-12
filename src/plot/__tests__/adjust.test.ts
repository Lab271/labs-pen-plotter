import { describe, expect, it } from 'vitest';
import { adjustField, adjustSample, DEFAULT_ADJUST, type AdjustSpec } from '../adjust';
import type { FieldSource } from '../raster';

/** A field with a distinct value per cell, so a transform's effect is readable. */
function grid(values: number[][], mmPerGrid = 1): FieldSource {
  const gh = values.length;
  const gw = values[0].length;
  return { field: Float32Array.from(values.flat()), gw, gh, mmPerGrid };
}
const read = (f: FieldSource) => {
  const rows: number[][] = [];
  for (let y = 0; y < f.gh; y++) {
    rows.push([...f.field.slice(y * f.gw, (y + 1) * f.gw)].map((v) => Math.round(v * 100) / 100));
  }
  return rows;
};
const spec = (over: Partial<AdjustSpec>): AdjustSpec => ({ ...DEFAULT_ADJUST, ...over });

describe('adjustSample', () => {
  it('is the identity by default', () => {
    for (const v of [0, 0.25, 0.5, 1]) expect(adjustSample(v, DEFAULT_ADJUST)).toBeCloseTo(v, 6);
  });

  it('inverts, then applies contrast about mid-grey, then brightness', () => {
    expect(adjustSample(0.2, spec({ invert: true }))).toBeCloseTo(0.8, 6);
    expect(adjustSample(0.75, spec({ contrast: 2 }))).toBeCloseTo(1, 6);
    expect(adjustSample(0.5, spec({ brightness: 0.25 }))).toBeCloseTo(0.75, 6);
  });

  it('clamps instead of wrapping', () => {
    expect(adjustSample(1, spec({ brightness: 0.5 }))).toBe(1);
    expect(adjustSample(0, spec({ brightness: -0.5 }))).toBe(0);
    expect(adjustSample(0.9, spec({ contrast: 10 }))).toBe(1);
  });
});

describe('adjustField', () => {
  const f = grid([
    [0, 0.1, 0.2, 0.3],
    [0.4, 0.5, 0.6, 0.7],
    [0.8, 0.9, 1, 0.95],
  ]);

  it('passes the field through untouched by default', () => {
    expect(read(adjustField(f, DEFAULT_ADJUST))).toEqual(read(f));
  });

  it('crops by fractions of each edge', () => {
    const out = adjustField(f, spec({ crop: { left: 0.25, top: 0, right: 0.25, bottom: 0 } }));
    expect(out.gw).toBe(2);
    expect(out.gh).toBe(3);
    expect(read(out)).toEqual([
      [0.1, 0.2],
      [0.5, 0.6],
      [0.9, 1],
    ]);
  });

  it('keeps a usable window when the crop is dragged past itself', () => {
    // Marching squares needs a cell; a degenerate crop must give a sliver, not
    // an empty field that reads as "the image disappeared".
    const out = adjustField(f, spec({ crop: { left: 0.9, top: 0.9, right: 0.9, bottom: 0.9 } }));
    expect(out.gw).toBeGreaterThanOrEqual(2);
    expect(out.gh).toBeGreaterThanOrEqual(2);
  });

  it('rotates clockwise a quarter turn at a time', () => {
    const small = grid([
      [0, 0.1],
      [0.2, 0.3],
    ]);
    expect(read(adjustField(small, spec({ rotateQuarters: 1 })))).toEqual([
      [0.2, 0],
      [0.3, 0.1],
    ]);
    expect(read(adjustField(small, spec({ rotateQuarters: 2 })))).toEqual([
      [0.3, 0.2],
      [0.1, 0],
    ]);
    expect(read(adjustField(small, spec({ rotateQuarters: 4 })))).toEqual(read(small));
  });

  it('swaps the field dimensions on an odd quarter turn', () => {
    const out = adjustField(f, spec({ rotateQuarters: 1 }));
    expect([out.gw, out.gh]).toEqual([f.gh, f.gw]);
  });

  it('normalises a negative or oversized rotation', () => {
    const small = grid([
      [0, 0.1],
      [0.2, 0.3],
    ]);
    expect(read(adjustField(small, spec({ rotateQuarters: -1 })))).toEqual(
      read(adjustField(small, spec({ rotateQuarters: 3 }))),
    );
  });

  it('keeps mm per cell, so cropping does not rescale the artwork', () => {
    // A crop selects fewer cells; it does not make each cell bigger on paper.
    const out = adjustField(
      grid(
        [
          [0, 1],
          [1, 0],
        ],
        0.5,
      ),
      spec({ crop: { left: 0.5, top: 0, right: 0, bottom: 0 } }),
    );
    expect(out.mmPerGrid).toBe(0.5);
  });

  it('applies the tone mapping to every cell', () => {
    const out = adjustField(grid([[0.2, 0.8]]), spec({ invert: true }));
    expect(read(out)).toEqual([[0.8, 0.2]]);
  });
});
