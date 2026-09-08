import { describe, expect, it } from 'vitest';
import { fitRegistration } from '../register';
import { placePolylines } from '../place';
import type { Point } from '../types';

// The A4 cut file's points in the artwork frame (page 15,15 / 195,15 / 15,282 minus offset 30,45).
const LOCAL: Point[] = [
  { x: -15, y: -30 },
  { x: 165, y: -30 },
  { x: -15, y: 237 },
];

const placed = (pl: { x: number; y: number; rotation: number }) =>
  placePolylines([LOCAL], { ...pl, scale: 1 })[0];

describe('fitRegistration', () => {
  it('recovers a pure translation exactly', () => {
    const fit = fitRegistration(LOCAL, placed({ x: 130, y: 245, rotation: 0 }));
    expect(fit.placement.x).toBeCloseTo(130, 6);
    expect(fit.placement.y).toBeCloseTo(245, 6);
    expect(fit.placement.rotation).toBeCloseTo(0, 6);
    expect(fit.placement.scale).toBe(1);
    expect(fit.rms).toBeCloseTo(0, 9);
    expect(fit.impliedScale).toBeCloseTo(1, 9);
  });

  it('recovers rotation + translation in the placePolylines convention (round trip)', () => {
    const truth = { x: 400, y: 120, rotation: 7.5 };
    const fit = fitRegistration(LOCAL, placed(truth));
    expect(fit.placement.x).toBeCloseTo(truth.x, 6);
    expect(fit.placement.y).toBeCloseTo(truth.y, 6);
    expect(fit.placement.rotation).toBeCloseTo(truth.rotation, 6);
    // Re-placing with the fit lands on the measurements.
    const again = placePolylines([LOCAL], fit.placement)[0];
    const meas = placed(truth);
    again.forEach((p, i) => {
      expect(p.x).toBeCloseTo(meas[i].x, 6);
      expect(p.y).toBeCloseTo(meas[i].y, 6);
    });
  });

  it('handles a sticker mounted upside down (≈180°) and negative angles', () => {
    for (const rot of [-30, 179, -179.5, 90]) {
      const fit = fitRegistration(LOCAL, placed({ x: 50, y: 60, rotation: rot }));
      expect(fit.placement.rotation).toBeCloseTo(rot, 6);
      expect(fit.rms).toBeCloseTo(0, 9);
    }
  });

  it('keeps scale at 1 but reports the implied scale and residuals when the print is off', () => {
    // Measurements from a sticker printed 2% too large.
    const meas = placePolylines([LOCAL], { x: 100, y: 100, scale: 1.02, rotation: 0 })[0];
    const fit = fitRegistration(LOCAL, meas);
    expect(fit.placement.scale).toBe(1);
    expect(fit.impliedScale).toBeCloseTo(1.02, 6);
    expect(fit.rms).toBeGreaterThan(0.5);
    expect(fit.residuals).toHaveLength(3);
  });

  it('a mis-jogged third point shows up in its residual, not silently in the placement', () => {
    const meas = placed({ x: 200, y: 200, rotation: 0 });
    meas[2] = { x: meas[2].x + 1.5, y: meas[2].y }; // operator stopped 1.5 mm short on P3
    const fit = fitRegistration(LOCAL, meas);
    // Least squares spreads the 1.5 mm over translation + rotation, so the
    // mis-set point is NOT reliably the largest residual (here the rotation
    // absorbs most of P3's x-error and pushes it onto P1/P2). What is
    // guaranteed: every residual is non-zero and the RMS crosses the wizard's
    // 0.3 mm warning — which is why the wizard warns on RMS, not on one point.
    expect(fit.residuals.every((r) => r > 0.1)).toBe(true);
    expect(fit.rms).toBeGreaterThan(0.3);
  });

  it('two points give an exact fit; one point gives translation only', () => {
    const two = fitRegistration(
      LOCAL.slice(0, 2),
      placed({ x: 10, y: 20, rotation: 12 }).slice(0, 2),
    );
    expect(two.placement.rotation).toBeCloseTo(12, 6);
    expect(two.rms).toBeCloseTo(0, 9);
    const one = fitRegistration([LOCAL[0]], [{ x: 5, y: 5 }]);
    expect(one.placement.rotation).toBe(0);
    expect(one.placement.x).toBeCloseTo(20, 9); // 5 − (−15)
    expect(one.placement.y).toBeCloseTo(35, 9);
  });

  it('refuses an empty fit', () => {
    expect(() => fitRegistration([], [])).toThrow();
  });
});
