import { describe, expect, it } from 'vitest';
import { parseSvgLengthMm, simplifyPolyline, svgUnitToMm } from '../svg';

describe('simplifyPolyline', () => {
  it('collapses collinear points within tolerance', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 1, y: 0.01 },
      { x: 2, y: 0 },
      { x: 3, y: 0.01 },
      { x: 4, y: 0 },
    ];
    const out = simplifyPolyline(line, 0.1);
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ]);
  });

  it('keeps points that deviate beyond tolerance (a real corner)', () => {
    const corner = [
      { x: 0, y: 0 },
      { x: 5, y: 5 }, // significant deviation from the 0,0→10,0 chord
      { x: 10, y: 0 },
    ];
    const out = simplifyPolyline(corner, 0.1);
    expect(out).toHaveLength(3);
  });

  it('leaves short polylines untouched', () => {
    const seg = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(simplifyPolyline(seg, 0.5)).toEqual(seg);
  });
});

describe('svgUnitToMm', () => {
  const PX = 25.4 / 96;
  const a4 = { width: 210, height: 297 };

  it('uses mm width / viewBox width (Inkscape export)', () => {
    expect(svgUnitToMm('210mm', '297mm', a4)).toBeCloseTo(1, 9);
    expect(svgUnitToMm('420mm', '594mm', a4)).toBeCloseTo(2, 9);
  });

  it('accepts every CSS absolute unit', () => {
    const vb = { width: 100, height: 100 };
    expect(svgUnitToMm('10cm', null, vb)).toBeCloseTo(1, 9);
    expect(svgUnitToMm('4in', null, vb)).toBeCloseTo(1.016, 9);
    expect(svgUnitToMm('72pt', null, vb)).toBeCloseTo(0.254, 9);
    expect(svgUnitToMm('6pc', null, vb)).toBeCloseTo(0.254, 9);
    expect(svgUnitToMm('400Q', null, vb)).toBeCloseTo(1, 9);
    expect(svgUnitToMm('96px', null, vb)).toBeCloseTo(0.254, 9);
  });

  it('falls back to the height when only the height is sized', () => {
    expect(svgUnitToMm(null, '297mm', a4)).toBeCloseTo(1, 9);
    expect(svgUnitToMm('100%', '29.7cm', a4)).toBeCloseTo(1, 9);
  });

  it('treats unitless and px widths with a viewBox as CSS pixels', () => {
    expect(svgUnitToMm('800', '600', { width: 800, height: 600 })).toBeCloseTo(PX, 9);
    expect(svgUnitToMm('1600px', null, { width: 800, height: 600 })).toBeCloseTo(2 * PX, 9);
  });

  it('assumes CSS pixels when no absolute size is declared', () => {
    expect(svgUnitToMm(null, null, a4)).toBeCloseTo(PX, 9);
    expect(svgUnitToMm('100%', '100%', a4)).toBeCloseTo(PX, 9);
    expect(svgUnitToMm('50em', null, a4)).toBeCloseTo(PX, 9);
    expect(svgUnitToMm(null, null, null)).toBeCloseTo(PX, 9);
  });

  it('without a viewBox the user unit is a CSS pixel whatever the width says', () => {
    // SVG 1.1 §7.2: no viewBox → initial user unit = 1 px. The mm width only
    // sizes the viewport; the geometry inside is still in pixels.
    expect(svgUnitToMm('210mm', '297mm', null)).toBeCloseTo(PX, 9);
    expect(svgUnitToMm('21cm', null, null)).toBeCloseTo(PX, 9);
    expect(svgUnitToMm(null, '11in', null)).toBeCloseTo(PX, 9);
    expect(svgUnitToMm('800', '600', null)).toBeCloseTo(PX, 9);
  });

  it('ignores garbage, zero and negative sizes', () => {
    expect(svgUnitToMm('auto', null, a4)).toBeCloseTo(PX, 9);
    expect(svgUnitToMm('0mm', null, a4)).toBeCloseTo(PX, 9);
    expect(svgUnitToMm('-5mm', null, a4)).toBeCloseTo(PX, 9);
    expect(svgUnitToMm(' 210 mm ', null, a4)).toBeCloseTo(1, 9);
  });
});

describe('parseSvgLengthMm', () => {
  it('converts absolute lengths to mm', () => {
    expect(parseSvgLengthMm('1in')).toBeCloseTo(25.4, 9);
    expect(parseSvgLengthMm('2.5cm')).toBeCloseTo(25, 9);
    expect(parseSvgLengthMm('1e1mm')).toBeCloseTo(10, 9);
  });
  it('returns null for relative or missing lengths', () => {
    expect(parseSvgLengthMm('100%')).toBeNull();
    expect(parseSvgLengthMm('2em')).toBeNull();
    expect(parseSvgLengthMm(null)).toBeNull();
    expect(parseSvgLengthMm('')).toBeNull();
  });
});
