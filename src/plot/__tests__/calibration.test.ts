import { describe, expect, it } from 'vitest';
import {
  clampPasses,
  DEFAULT_PASSES,
  generateCalibrationGcode,
  MAX_PASSES,
  MIN_PASSES,
} from '../calibration';
import { estimatePlotTime, type PenOptions } from '../gcode';

const OPTS: PenOptions = {
  penUpZ: 0,
  penDownZ: 3,
  dwellMs: 250,
  drawFeed: 1500,
  travelFeed: 5000,
};

const P = [
  { x: 15, y: 15 },
  { x: 195, y: 15 },
  { x: 15, y: 282 },
];

describe('clampPasses', () => {
  it('clamps to the supported range and rounds', () => {
    expect(clampPasses(0)).toBe(MIN_PASSES);
    expect(clampPasses(99)).toBe(MAX_PASSES);
    expect(clampPasses(2.6)).toBe(3);
  });
  it('falls back to the default for NaN', () => {
    expect(clampPasses(NaN)).toBe(DEFAULT_PASSES);
  });
});

describe('generateCalibrationGcode', () => {
  it('touches every point in order, once per pass, framed like a plot', () => {
    const gc = generateCalibrationGcode(P, 3, OPTS);
    expect(gc.slice(0, 3)).toEqual(['G21', 'G90', 'G0 Z0']);
    expect(gc[gc.length - 1]).toBe('G1 X0 Y0 F5000');

    const touch = (p: { x: number; y: number }) => [
      `G1 X${p.x} Y${p.y} F5000`,
      'G0 Z3',
      'G4 P0.25',
      'G0 Z0',
      'G4 P0.25',
    ];
    const expected = [...Array(3)].flatMap(() => P.flatMap(touch));
    expect(gc.slice(3, -1)).toEqual(expected);
    // P1 P2 P3 P1 P2 P3 P1 P2 P3 — the order the operator reads the sheet in.
    const travels = gc.filter((l) => /^G1 X\d+ Y\d+ F5000$/.test(l) && l !== 'G1 X0 Y0 F5000');
    expect(travels).toHaveLength(9);
    expect(travels[3]).toBe('G1 X15 Y15 F5000');
  });

  it('never draws: no pen-down XY moves', () => {
    const gc = generateCalibrationGcode(P, 2, OPTS);
    expect(gc.some((l) => l.startsWith('G1') && l.endsWith('F1500'))).toBe(false);
  });

  it('clamps the pass count', () => {
    expect(generateCalibrationGcode(P, 0, OPTS).filter((l) => l === 'G0 Z3')).toHaveLength(3);
    expect(generateCalibrationGcode(P, 50, OPTS).filter((l) => l === 'G0 Z3')).toHaveLength(
      3 * MAX_PASSES,
    );
  });

  it('with no points emits only the frame', () => {
    expect(generateCalibrationGcode([], 3, OPTS)).toEqual([
      'G21',
      'G90',
      'G0 Z0',
      'G1 X0 Y0 F5000',
    ]);
  });

  it('takes Z, dwell and travel feed from the pen options', () => {
    const gc = generateCalibrationGcode([P[0]], 1, {
      ...OPTS,
      penUpZ: -1,
      penDownZ: 4.5,
      dwellMs: 100,
      travelFeed: 3000,
    });
    expect(gc).toContain('G0 Z-1');
    expect(gc).toContain('G0 Z4.5');
    expect(gc).toContain('G4 P0.1');
    expect(gc).toContain('G1 X15 Y15 F3000');
  });

  it('has a finite positive time estimate so the UI can show a duration', () => {
    const t = estimatePlotTime(generateCalibrationGcode(P, 3, OPTS));
    expect(Number.isFinite(t)).toBe(true);
    expect(t).toBeGreaterThan(0);
  });
});
