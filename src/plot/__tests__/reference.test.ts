import { describe, expect, it } from 'vitest';
import {
  isPureBlue,
  isReferenceId,
  isReferenceLabel,
  referencePoint,
  selectReference,
} from '../reference';

describe('reference labels and ids', () => {
  it('matches calibration/reference layer labels case-insensitively', () => {
    expect(isReferenceLabel('calibration REFERENCE ONLY - do not cut')).toBe(true);
    expect(isReferenceLabel('Reference')).toBe(true);
    expect(isReferenceLabel('cut')).toBe(false);
    expect(isReferenceLabel(null)).toBe(false);
  });
  it('matches the cal- id prefix only', () => {
    expect(isReferenceId('cal-P1')).toBe(true);
    expect(isReferenceId('CAL-x')).toBe(true);
    expect(isReferenceId('local-P1')).toBe(false);
    expect(isReferenceId('calibrate')).toBe(false);
    expect(isReferenceId(undefined)).toBe(false);
  });
});

describe('isPureBlue', () => {
  it('accepts the spellings editors and computed styles emit', () => {
    for (const c of ['#0000FF', '#00f', 'blue', 'rgb(0, 0, 255)', 'rgb(0,0,255)', ' #0000ff '])
      expect(isPureBlue(c)).toBe(true);
  });
  it('rejects near-blues, red, none and empty', () => {
    for (const c of ['#0000fe', '#1e40af', 'rgb(0, 0, 254)', '#FF0000', 'none', '', null])
      expect(isPureBlue(c)).toBe(false);
  });
});

describe('selectReference', () => {
  const g = {}; // any stable key stands for a matched group
  it('labels win: only labelled elements are reference, blue is ignored', () => {
    const flags = selectReference([
      { labelledGroup: g, blue: false },
      { labelledGroup: null, blue: true }, // legitimate blue artwork stays
      { labelledGroup: null, blue: false },
    ]);
    expect(flags).toEqual([true, false, false]);
  });
  it('falls back to pure blue when nothing is labelled', () => {
    const flags = selectReference([
      { labelledGroup: null, blue: true },
      { labelledGroup: null, blue: false },
    ]);
    expect(flags).toEqual([true, false]);
  });
  it('selects nothing when there are no labels and no blue', () => {
    expect(selectReference([{ labelledGroup: null, blue: false }])).toEqual([false]);
    expect(selectReference([])).toEqual([]);
  });
});

describe('referencePoint', () => {
  it('prefers the first circle centre (the printed dot is the target)', () => {
    const pt = referencePoint({
      name: 'cal-P1',
      circles: [{ x: 15, y: 15 }],
      bounds: { minX: 9, minY: 9, maxX: 21, maxY: 21 },
    });
    expect(pt).toEqual({ name: 'cal-P1', x: 15, y: 15 });
  });
  it('uses the bounding-box centre for a bare crosshair', () => {
    const pt = referencePoint({
      name: 'P2',
      circles: [],
      bounds: { minX: 189, minY: 9, maxX: 201, maxY: 21 },
    });
    expect(pt).toEqual({ name: 'P2', x: 195, y: 15 });
  });
  it('drops a group with nothing measurable', () => {
    expect(referencePoint({ name: 'x', circles: [], bounds: null })).toBeNull();
  });
});
