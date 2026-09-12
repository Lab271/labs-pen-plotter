import { describe, expect, it } from 'vitest';
import { ALGORITHMS, DEFAULT_PARAMS, runAlgorithm, type AlgorithmParams } from '../algorithms';
import { bounds } from '../place';
import type { FieldSource } from '../raster';

/** A field with a dark square in the middle of a light ground. */
function blob(size = 20, mmPerGrid = 1): FieldSource {
  const field = new Float32Array(size * size).fill(1);
  for (let y = size / 4; y < (size * 3) / 4; y++) {
    for (let x = size / 4; x < (size * 3) / 4; x++) field[y * size + x] = 0;
  }
  return { field, gw: size, gh: size, mmPerGrid };
}

/** A left-to-right gradient, for checking that tone drives density. */
function gradient(size = 40): FieldSource {
  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) field[y * size + x] = x / (size - 1);
  }
  return { field, gw: size, gh: size, mmPerGrid: 1 };
}

const params = (over: Partial<AlgorithmParams> = {}): AlgorithmParams => ({
  ...DEFAULT_PARAMS,
  ...over,
});

describe('the algorithm catalogue', () => {
  it('names a parameter set for each algorithm, all of them real parameters', () => {
    // The tuning panel renders exactly these, so a typo here means a control
    // that silently does nothing.
    for (const a of ALGORITHMS) {
      expect(a.params.length).toBeGreaterThan(0);
      for (const p of a.params) expect(DEFAULT_PARAMS).toHaveProperty(p);
    }
  });

  it('has unique ids', () => {
    const ids = ALGORITHMS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('outline', () => {
  it('traces the edge of a shape, in mm', () => {
    const r = runAlgorithm('outline', blob(20, 0.5), params({ threshold: 0.5, levels: 1 }));
    expect(r.polylines.length).toBeGreaterThan(0);
    // The square spans half the 20-cell field at 0.5 mm per cell → ~5 mm.
    expect(r.widthMm).toBeGreaterThan(4);
    expect(r.widthMm).toBeLessThan(6);
  });

  it('normalises to the origin', () => {
    const r = runAlgorithm('outline', blob(), params());
    const b = bounds(r.polylines);
    expect(b.minX).toBeCloseTo(0, 6);
    expect(b.minY).toBeCloseTo(0, 6);
  });

  it('produces nothing from a blank image rather than failing', () => {
    const blank: FieldSource = { field: new Float32Array(16).fill(1), gw: 4, gh: 4, mmPerGrid: 1 };
    const r = runAlgorithm('outline', blank, params());
    expect(r.polylines).toEqual([]);
    expect(r.widthMm).toBe(0);
  });

  it('draws more with more levels on a gradient', () => {
    const one = runAlgorithm('outline', gradient(), params({ levels: 1 }));
    const four = runAlgorithm('outline', gradient(), params({ levels: 4 }));
    expect(four.polylines.length).toBeGreaterThan(one.polylines.length);
  });
});

describe('hatch', () => {
  it('fills a dark area with parallel lines', () => {
    const r = runAlgorithm('hatch', blob(40, 1), params({ spacingMm: 2, angleDeg: 0, levels: 1 }));
    expect(r.polylines.length).toBeGreaterThan(3);
    for (const p of r.polylines) expect(p).toHaveLength(2); // straight runs
  });

  it('draws nothing where the image is lighter than the threshold', () => {
    const light: FieldSource = {
      field: new Float32Array(400).fill(0.9),
      gw: 20,
      gh: 20,
      mmPerGrid: 1,
    };
    expect(runAlgorithm('hatch', light, params({ threshold: 0.3 })).polylines).toEqual([]);
  });

  it('puts more line into darker tone than lighter tone', () => {
    // Density carries tone: the dark half of a gradient must receive more ink
    // than the light half, or the algorithm is not shading at all.
    const r = runAlgorithm(
      'hatch',
      gradient(40),
      params({ spacingMm: 1, angleDeg: 90, levels: 4, threshold: 1 }),
    );
    const mid = bounds(r.polylines).width / 2;
    let darkLen = 0;
    let lightLen = 0;
    for (const [a, b] of r.polylines) {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if ((a.x + b.x) / 2 < mid) darkLen += len;
      else lightLen += len;
    }
    expect(darkLen).toBeGreaterThan(lightLen * 1.5);
  });

  it('respects the line spacing', () => {
    const wide = runAlgorithm('hatch', blob(40, 1), params({ spacingMm: 4, angleDeg: 0 }));
    const tight = runAlgorithm('hatch', blob(40, 1), params({ spacingMm: 1, angleDeg: 0 }));
    expect(tight.polylines.length).toBeGreaterThan(wide.polylines.length * 2);
  });

  it('drops runs too short to be worth a pen-down cycle', () => {
    // Below the line spacing the pen spends longer lifting and dropping than
    // drawing, and the result reads as noise rather than tone.
    const r = runAlgorithm('hatch', blob(40, 1), params({ spacingMm: 3, angleDeg: 0 }));
    for (const [a, b] of r.polylines) {
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(3);
    }
  });

  it('covers the image at any angle', () => {
    for (const angleDeg of [0, 30, 45, 90, 135, -45]) {
      const r = runAlgorithm('hatch', blob(40, 1), params({ spacingMm: 2, angleDeg }));
      expect(r.polylines.length).toBeGreaterThan(2);
    }
  });

  it('survives a nonsensical spacing instead of hanging', () => {
    // A spacing of zero would otherwise mean an infinite number of lines.
    const r = runAlgorithm('hatch', blob(20, 1), params({ spacingMm: 0 }));
    expect(r.polylines.length).toBeGreaterThan(0);
  });
});
