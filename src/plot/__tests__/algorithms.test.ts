import { describe, expect, it } from 'vitest';
import {
  ALGORITHMS,
  contourAlgorithms,
  DEFAULT_PARAMS,
  runAlgorithm,
  type AlgorithmParams,
} from '../algorithms';
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

describe('crosshatch', () => {
  it('draws in several directions', () => {
    const r = runAlgorithm(
      'crosshatch',
      blob(40, 1),
      params({ spacingMm: 2, angleDeg: 0, passes: 3, threshold: 0.9 }),
    );
    const angles = new Set(
      r.polylines.map(([a, b]) => {
        const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        // Direction only — a line and its reverse are the same hatch direction.
        return Math.round(((deg % 180) + 180) % 180);
      }),
    );
    expect(angles.size).toBe(3);
  });

  it('spreads directions over a half turn, so passes cross rather than repeat', () => {
    // Past 180° a direction repeats one already drawn, and the extra pass would
    // land on top of an earlier one instead of crossing it.
    const r = runAlgorithm(
      'crosshatch',
      blob(40, 1),
      params({ spacingMm: 2, angleDeg: 0, passes: 2, threshold: 0.9 }),
    );
    const angles = [
      ...new Set(
        r.polylines.map(([a, b]) =>
          Math.round(((((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) % 180) + 180) % 180),
        ),
      ),
    ].sort((x, y) => x - y);
    expect(angles).toEqual([0, 90]);
  });

  it('gives the darkest tone more directions than a mid tone', () => {
    const dark = new Float32Array(40 * 40).fill(1);
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 40; x++) {
        // Left half mid-grey, right half black.
        dark[y * 40 + x] = x < 20 ? 0.5 : 0;
      }
    const r = runAlgorithm(
      'crosshatch',
      { field: dark, gw: 40, gh: 40, mmPerGrid: 1 },
      params({ spacingMm: 2, angleDeg: 0, passes: 3, threshold: 1 }),
    );
    const inkLeft = r.polylines
      .filter(([a, b]) => (a.x + b.x) / 2 < r.widthMm / 2)
      .reduce((n, [a, b]) => n + Math.hypot(b.x - a.x, b.y - a.y), 0);
    const inkRight = r.polylines
      .filter(([a, b]) => (a.x + b.x) / 2 >= r.widthMm / 2)
      .reduce((n, [a, b]) => n + Math.hypot(b.x - a.x, b.y - a.y), 0);
    expect(inkRight).toBeGreaterThan(inkLeft);
  });

  it('clamps an absurd number of directions', () => {
    expect(() => runAlgorithm('crosshatch', blob(20, 1), params({ passes: 500 }))).not.toThrow();
  });
});

describe('stipple', () => {
  it('places dots as short segments, never zero-length', () => {
    // A zero-length polyline leaves the pen down in one spot without moving,
    // which blots rather than dots.
    const r = runAlgorithm('stipple', blob(40, 1), params({ spacingMm: 2, threshold: 0.9 }));
    expect(r.polylines.length).toBeGreaterThan(5);
    for (const [a, b] of r.polylines) {
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(0);
    }
  });

  it('puts more dots in dark areas than light ones', () => {
    const r = runAlgorithm('stipple', gradient(40), params({ spacingMm: 1.5, threshold: 1 }));
    const mid = r.widthMm / 2;
    const darkDots = r.polylines.filter(([a]) => a.x < mid).length;
    const lightDots = r.polylines.filter(([a]) => a.x >= mid).length;
    expect(darkDots).toBeGreaterThan(lightDots * 2);
  });

  it('spreads tone instead of banding it', () => {
    // Error diffusion is the point: a plain per-cell threshold would leave the
    // light half of a gradient completely empty and the dark half solid.
    const r = runAlgorithm('stipple', gradient(60), params({ spacingMm: 1, threshold: 1 }));
    const quarters = [0, 0, 0, 0];
    for (const [a] of r.polylines) {
      quarters[Math.min(3, Math.floor((a.x / r.widthMm) * 4))]++;
    }
    // Every band gets some dots, and they thin out from dark to light.
    expect(quarters.every((q) => q > 0)).toBe(true);
    expect(quarters[0]).toBeGreaterThan(quarters[3]);
  });

  it('draws nothing for a blank image', () => {
    const blank: FieldSource = {
      field: new Float32Array(400).fill(1),
      gw: 20,
      gh: 20,
      mmPerGrid: 1,
    };
    expect(runAlgorithm('stipple', blank, params({ threshold: 0.5 })).polylines).toEqual([]);
  });
});

describe('edges', () => {
  it('finds the border of a shape, not its interior', () => {
    const r = runAlgorithm('edges', blob(40, 1), params({ threshold: 0.5 }));
    expect(r.polylines.length).toBeGreaterThan(0);
    // The square is 20 cells across in a 40-cell field: the edge geometry must
    // sit around it, not fill it.
    const b = bounds(r.polylines);
    expect(b.width).toBeGreaterThan(15);
    expect(b.width).toBeLessThan(30);
  });

  it('finds nothing in a flat image', () => {
    const flat: FieldSource = {
      field: new Float32Array(400).fill(0.4),
      gw: 20,
      gh: 20,
      mmPerGrid: 1,
    };
    expect(runAlgorithm('edges', flat, params()).polylines).toEqual([]);
  });

  it('is unaffected by overall brightness, unlike a plain threshold', () => {
    // Normalising by the strongest edge is what makes the threshold mean the
    // same thing on a flat photograph as on a high-contrast one.
    const dim = new Float32Array(40 * 40).fill(0.55);
    for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) dim[y * 40 + x] = 0.45;
    const r = runAlgorithm('edges', { field: dim, gw: 40, gh: 40, mmPerGrid: 1 }, params());
    expect(r.polylines.length).toBeGreaterThan(0);
  });
});

describe('contour-only conversions', () => {
  it('excludes every algorithm that fills an area', () => {
    // A fill handed to a drag knife shreds the sticker instead of cutting it
    // out, so cutting mode must never be offered one.
    const contour = contourAlgorithms();
    expect(contour.length).toBeGreaterThan(0);
    expect(contour.every((a) => !a.fills)).toBe(true);
    expect(contour.map((a) => a.id).sort()).toEqual(['edges', 'outline']);
  });

  it('marks the tonal algorithms as fills', () => {
    const fills = ALGORITHMS.filter((a) => a.fills)
      .map((a) => a.id)
      .sort();
    expect(fills).toEqual(['crosshatch', 'hatch', 'stipple']);
  });
});
