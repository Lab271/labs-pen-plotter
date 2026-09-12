import { describe, expect, it } from 'vitest';
import { applyTabs, DEFAULT_TABS, type ApplyTabsOptions } from '../tabs';
import { DEFAULT_CUT_OPTIONS, polylineLength, prepareForCut } from '../cut';
import type { Polyline } from '../types';

/** A closed 100 mm square: 400 mm of contour, four sharp corners. */
const square: Polyline = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
  { x: 0, y: 0 },
];

/** A closed circle, flattened — no corners anywhere. */
const circle: Polyline = (() => {
  const pts: Polyline = [];
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * Math.PI * 2;
    pts.push({ x: 50 * Math.cos(t), y: 50 * Math.sin(t) });
  }
  return pts;
})();

const opts = (over: Partial<ApplyTabsOptions> = {}): ApplyTabsOptions => ({
  ...DEFAULT_TABS,
  tabCount: 4,
  closed: true,
  ...over,
});

const totalLength = (polys: Polyline[]) => polys.reduce((n, p) => n + polylineLength(p), 0);

describe('applyTabs', () => {
  it('is off by default — a cut with no tabs is what the machine did before', () => {
    expect(DEFAULT_TABS.tabCount).toBe(0);
    expect(applyTabs(square, opts({ tabCount: 0 }))).toEqual([square]);
  });

  it('splits a contour into one stroke per gap', () => {
    const pieces = applyTabs(square, opts({ tabCount: 4, tabWidthMm: 2 }));
    // Four bridges in a closed loop leave four cut spans (the first and last
    // are separated by the seam, which the path already starts and ends at).
    expect(pieces.length).toBe(5);
    for (const p of pieces) expect(p.length).toBeGreaterThanOrEqual(2);
  });

  it('leaves exactly the configured width uncut', () => {
    const width = 2;
    const pieces = applyTabs(square, opts({ tabCount: 4, tabWidthMm: width }));
    const removed = polylineLength(square) - totalLength(pieces);
    expect(removed).toBeCloseTo(4 * width, 3);
  });

  it('spaces the bridges evenly around the contour', () => {
    const pieces = applyTabs(circle, opts({ tabCount: 4, tabWidthMm: 1 }));
    const lengths = pieces.map(polylineLength);
    // The seam splits one span into two, so compare the whole spans only.
    const middle = lengths.slice(1, -1);
    for (const l of middle) expect(l).toBeCloseTo(middle[0], 1);
  });

  it('leaves an open path alone', () => {
    // There is nothing to hold on: an open cut is already attached at both ends.
    const open: Polyline = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(applyTabs(open, opts({ closed: false }))).toEqual([open]);
  });

  it('leaves a contour shorter than the minimum alone', () => {
    // A bridge as long as the shape destroys the detail rather than holding it.
    const small: Polyline = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 0 },
    ];
    expect(applyTabs(small, opts({ minContourMm: 30 }))).toEqual([small]);
  });

  it('cuts the tab count down rather than producing a dotted line', () => {
    // Each bridge needs cut on both sides of it; asking for 50 on a 400 mm
    // contour with 10 mm tabs cannot be honoured.
    const pieces = applyTabs(square, opts({ tabCount: 50, tabWidthMm: 10 }));
    expect(pieces.length).toBeLessThan(50);
    for (const p of pieces) expect(polylineLength(p)).toBeGreaterThan(0);
  });

  it('never emits a degenerate fragment', () => {
    // `orderPolylines` drops anything shorter than two points, so a degenerate
    // fragment would vanish silently and leave an unexplained gap in the cut.
    for (const count of [1, 2, 3, 7, 11]) {
      for (const width of [0.2, 0.5, 3]) {
        const pieces = applyTabs(square, opts({ tabCount: count, tabWidthMm: width }));
        for (const p of pieces) {
          expect(p.length).toBeGreaterThanOrEqual(2);
          expect(polylineLength(p)).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps bridges off sharp corners', () => {
    // A bridge on a corner tears instead of snapping.
    const pieces = applyTabs(square, opts({ tabCount: 4, tabWidthMm: 2 }));
    const corners = [
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    // Each gap is between the end of one piece and the start of the next.
    for (let i = 1; i < pieces.length; i++) {
      const gapStart = pieces[i - 1][pieces[i - 1].length - 1];
      const gapEnd = pieces[i][0];
      const mid = { x: (gapStart.x + gapEnd.x) / 2, y: (gapStart.y + gapEnd.y) / 2 };
      for (const c of corners) {
        expect(Math.hypot(mid.x - c.x, mid.y - c.y)).toBeGreaterThan(1);
      }
    }
  });

  it('keeps bridges out of the stretch an overcut re-traces', () => {
    // Otherwise the overcut cuts straight through the first bridge, and both
    // features look broken at once.
    const pieces = applyTabs(square, opts({ tabCount: 4, tabWidthMm: 2, protectStartMm: 20 }));
    const firstGapStart = polylineLength(pieces[0]);
    expect(firstGapStart).toBeGreaterThanOrEqual(20);
  });
});

describe('prepareForCut with tabs', () => {
  it('applies compensation, then overcut, then tabs', () => {
    const pieces = prepareForCut([square], {
      ...DEFAULT_CUT_OPTIONS,
      overcutMm: 5,
      tabCount: 3,
      tabWidthMm: 1,
    });
    expect(pieces.length).toBeGreaterThan(1);
    // The overcut still happened: the total cut length exceeds the contour,
    // minus what the bridges removed.
    expect(totalLength(pieces)).toBeCloseTo(polylineLength(square) + 5 - 3 * 1, 2);
  });

  it('is unchanged from before when tabs are off', () => {
    const withTabs = prepareForCut([square], { ...DEFAULT_CUT_OPTIONS, tabCount: 0 });
    expect(withTabs).toHaveLength(1);
    expect(polylineLength(withTabs[0])).toBeCloseTo(
      polylineLength(square) + DEFAULT_CUT_OPTIONS.overcutMm,
      6,
    );
  });

  it('leaves open geometry as one stroke even with tabs on', () => {
    const open: Polyline = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ];
    expect(prepareForCut([open], { ...DEFAULT_CUT_OPTIONS, tabCount: 4 })).toEqual([open]);
  });
});
