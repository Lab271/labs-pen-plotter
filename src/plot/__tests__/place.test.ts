import { describe, expect, it } from 'vitest';
import {
  actualSizePlacement,
  anchorPlacement,
  fitPlacement,
  transformedBox,
  placeOnPage,
  placePolylines,
} from '../place';

describe('transformedBox', () => {
  it('returns the box unchanged at 0°, scale 1', () => {
    const b = transformedBox(100, 60, 1, 0);
    expect(b).toMatchObject({ minX: 0, minY: 0, width: 100, height: 60 });
  });

  it('swaps width/height at 90°', () => {
    const b = transformedBox(100, 60, 1, 90);
    expect(b.width).toBeCloseTo(60, 6);
    expect(b.height).toBeCloseTo(100, 6);
  });
});

describe('fitPlacement', () => {
  it('fits within the paper and anchors the box at the corner', () => {
    const pl = fitPlacement(200, 100, 0, 100, 100); // wide art into square paper
    expect(pl.scale).toBeCloseTo(0.5, 6); // 100/200
    const box = transformedBox(200, 100, pl.scale, pl.rotation);
    expect(pl.x + box.minX).toBeCloseTo(0, 6);
    expect(pl.y + box.minY).toBeCloseTo(0, 6);
  });

  it('respects rotation: a rotated wide artwork fits by its rotated extent', () => {
    // 200x100 rotated 90° becomes 100 wide x 200 tall; into 100x100 paper, limited by height.
    const pl = fitPlacement(200, 100, 90, 100, 100);
    const box = transformedBox(200, 100, pl.scale, 90);
    expect(box.width).toBeLessThanOrEqual(100 + 1e-6);
    expect(box.height).toBeLessThanOrEqual(100 + 1e-6);
    // Anchored at the corner.
    expect(pl.x + box.minX).toBeCloseTo(0, 6);
    expect(pl.y + box.minY).toBeCloseTo(0, 6);
  });
});

describe('anchorPlacement', () => {
  it('moves a rotated artwork so its rotated box touches the corner, keeping scale', () => {
    const pl = anchorPlacement(100, 60, { x: 999, y: 999, scale: 2, rotation: 90 });
    expect(pl.scale).toBe(2);
    expect(pl.rotation).toBe(90);
    const box = transformedBox(100, 60, 2, 90);
    expect(pl.x + box.minX).toBeCloseTo(0, 6);
    expect(pl.y + box.minY).toBeCloseTo(0, 6);
  });
});

describe('actualSizePlacement', () => {
  it('resets scale to 1 and anchors to the corner', () => {
    const pl = actualSizePlacement(210, 297, { x: 40, y: 30, scale: 3.96, rotation: 0 });
    expect(pl.scale).toBe(1);
    expect(pl.rotation).toBe(0);
    expect(pl.x).toBeCloseTo(0, 9);
    expect(pl.y).toBeCloseTo(0, 9);
  });

  it('keeps the rotation and anchors the rotated box', () => {
    const pl = actualSizePlacement(210, 297, { x: 0, y: 0, scale: 0.5, rotation: 90 });
    expect(pl.scale).toBe(1);
    expect(pl.rotation).toBe(90);
    // Rotated 90° about the local origin, the 297-tall box swings to -X; anchoring
    // shifts it back so the artwork's left edge is at x = 0.
    expect(pl.x).toBeCloseTo(297, 9);
    expect(pl.y).toBeCloseTo(0, 9);
  });
});

describe('placeOnPage', () => {
  it('puts the artwork at its page offset, 1:1, unrotated', () => {
    const pl = placeOnPage(128, 116, { x: 30, y: 45 }, { x: 0, y: 0, scale: 2.4, rotation: 90 });
    expect(pl).toEqual({ x: 30, y: 45, scale: 1, rotation: 0 });
  });

  it('degrades to actual size at the corner without a page offset (PNG, old sessions)', () => {
    const pl = placeOnPage(100, 50, undefined, { x: 7, y: 7, scale: 3, rotation: 0 });
    expect(pl).toEqual(actualSizePlacement(100, 50, { x: 7, y: 7, scale: 3, rotation: 0 }));
  });

  it('a calibration point placed with the artwork lands at its page coordinate', () => {
    // File: cut geometry bbox starts at page (30,45); crosshair dot at page (15,15)
    // → in the artwork frame it is (-15,-30).
    const pt = { x: -15, y: -30 };
    const pl = placeOnPage(128, 116, { x: 30, y: 45 }, { x: 0, y: 0, scale: 1, rotation: 0 });
    const [placed] = placePolylines([[pt]], pl);
    expect(placed[0].x).toBeCloseTo(15, 9);
    expect(placed[0].y).toBeCloseTo(15, 9);
  });

  it('points rotate with the artwork like strokes do', () => {
    const pt = { x: 10, y: 0 };
    const [placed] = placePolylines([[pt]], { x: 0, y: 0, scale: 1, rotation: 90 });
    // 90° clockwise on a Y-down page: +X turns into +Y.
    expect(placed[0].x).toBeCloseTo(0, 9);
    expect(placed[0].y).toBeCloseTo(10, 9);
  });
});
