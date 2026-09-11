import { describe, expect, it } from 'vitest';
import { PEN_CHANGE_PREFIX, splitPenSegments, stripComment } from '../program';

describe('stripComment', () => {
  it('removes inline and trailing comments', () => {
    expect(stripComment('G1 X1 (rapid) Y2 ; go')).toBe('G1 X1  Y2');
    expect(stripComment('   ; only a comment  ')).toBe('');
  });
});

describe('splitPenSegments', () => {
  it('returns one segment for a program with no pen changes', () => {
    const r = splitPenSegments(['G21', 'G90', 'G1 X1 Y1 F100']);
    expect(r.segments).toHaveLength(1);
    expect(r.labels).toEqual([]);
    expect(r.total).toBe(3);
  });

  it('splits at each marker and records the label', () => {
    const r = splitPenSegments([
      'G21',
      'G1 X1 Y1 F100',
      `${PEN_CHANGE_PREFIX}Red 0.5 fineliner`,
      'G1 X2 Y2 F100',
      `${PEN_CHANGE_PREFIX}Blue 0.5`,
      'G1 X3 Y3 F100',
    ]);
    expect(r.segments.map((s) => s.length)).toEqual([2, 1, 1]);
    expect(r.labels).toEqual(['Red 0.5 fineliner', 'Blue 0.5']);
    // Progress counts the machine-ready lines only — markers are not sent.
    expect(r.total).toBe(4);
  });

  it('keeps the marker out of the machine-ready lines', () => {
    const r = splitPenSegments(['G21', `${PEN_CHANGE_PREFIX}Red`, 'G1 X2 Y2 F100']);
    expect(r.segments.flat().some((l) => l.includes('PENCHANGE'))).toBe(false);
  });

  it('drops comments and blank lines', () => {
    const r = splitPenSegments(['', '  ', '; a note', 'G21 ; frame', '(setup)']);
    expect(r.segments[0]).toEqual(['G21']);
    expect(r.total).toBe(1);
  });

  it('tolerates a marker with no label', () => {
    const r = splitPenSegments(['G21', PEN_CHANGE_PREFIX.trimEnd(), 'G90']);
    expect(r.labels).toEqual(['']);
    expect(r.segments.map((s) => s.length)).toEqual([1, 1]);
  });
});
