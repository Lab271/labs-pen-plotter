import { describe, expect, it } from 'vitest';
import {
  estimatePlotTime,
  formatDuration,
  generateGcode,
  generatePenGroupGcode,
  PenOptions,
} from '../gcode';
import { PEN_CHANGE_PREFIX } from '../../grbl/program';
import type { Polyline } from '../types';

const OPTS: PenOptions = {
  penUpZ: 0,
  penDownZ: 3,
  dwellMs: 250,
  drawFeed: 1500,
  travelFeed: 5000,
};

describe('generateGcode', () => {
  it('maps artwork mm directly to work coords (identity — no flip)', () => {
    const stroke: Polyline = [
      { x: 10, y: 20 },
      { x: 10, y: 60 },
    ];
    const gc = generateGcode([stroke], OPTS);
    expect(gc).toContain('G1 X10 Y20 F5000'); // travel to start (pen up)
    expect(gc).toContain('G1 X10 Y60 F1500'); // draw move (pen down)
    // Neither axis is negated (machine +Y is physically down the page).
    expect(gc.some((l) => /[XY]-\d/.test(l))).toBe(false);
  });

  it('frames the program safely (mm/absolute, pen up start, origin end)', () => {
    const gc = generateGcode(
      [
        [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
        ],
      ],
      OPTS,
    );
    expect(gc[0]).toBe('G21');
    expect(gc[1]).toBe('G90');
    expect(gc[2]).toBe('G0 Z0'); // pen up at start
    expect(gc[gc.length - 1]).toBe('G1 X0 Y0 F5000'); // return to origin
  });

  it('sequences each stroke: travel → pen down + dwell → draw → pen up + dwell', () => {
    const gc = generateGcode(
      [
        [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
      ],
      OPTS,
    );
    const iDown = gc.indexOf('G0 Z3');
    const iDwellAfterDown = gc.indexOf('G4 P0.25', iDown);
    const iDraw = gc.indexOf('G1 X2 Y2 F1500');
    const iUp = gc.indexOf('G0 Z0', iDown); // pen-up after drawing
    expect(iDown).toBeGreaterThan(2);
    expect(iDwellAfterDown).toBe(iDown + 1);
    expect(iDraw).toBeGreaterThan(iDown);
    expect(iUp).toBeGreaterThan(iDraw);
  });

  it('uses draw feed for pen-down moves and travel feed for pen-up moves', () => {
    const gc = generateGcode(
      [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      ],
      OPTS,
    );
    const drawMoves = gc.filter((l) => l.includes('F1500'));
    const travelMoves = gc.filter((l) => l.includes('F5000'));
    expect(drawMoves.length).toBeGreaterThan(0);
    expect(travelMoves.length).toBeGreaterThan(0);
  });

  it('orders strokes by nearest pen-up travel from the current position', () => {
    const gc = generateGcode(
      [
        [
          { x: 100, y: 0 },
          { x: 101, y: 0 },
        ],
        [
          { x: 5, y: 0 },
          { x: 6, y: 0 },
        ],
        [
          { x: 10, y: 0 },
          { x: 11, y: 0 },
        ],
      ],
      OPTS,
    );
    const travels = gc.filter((l) => l.endsWith('F5000'));
    expect(travels.slice(0, 3)).toEqual(['G1 X5 Y0 F5000', 'G1 X10 Y0 F5000', 'G1 X100 Y0 F5000']);
  });

  it('reverses a stroke when its end is closest to the current position', () => {
    const gc = generateGcode(
      [
        [
          { x: 100, y: 0 },
          { x: 1, y: 0 },
        ],
      ],
      OPTS,
    );
    expect(gc).toContain('G1 X1 Y0 F5000');
    expect(gc).toContain('G1 X100 Y0 F1500');
    expect(gc.indexOf('G1 X1 Y0 F5000')).toBeLessThan(gc.indexOf('G1 X100 Y0 F1500'));
  });

  it('skips polylines with fewer than two points', () => {
    const gc = generateGcode([[{ x: 5, y: 5 }]], OPTS);
    // No travel/draw moves emitted except the final return to origin.
    const moves = gc.filter((l) => l.startsWith('G1 X') && l !== 'G1 X0 Y0 F5000');
    expect(moves.length).toBe(0);
  });
});

describe('estimatePlotTime', () => {
  const MOTION = { accel: 500, jdev: 0.01 };

  it('models trapezoidal acceleration for a straight stroke', () => {
    // Single stroke (0,0)->(10,0): start travel dist 0; pen-down dwell 0.25s;
    // draw 10mm @25mm/s, a=500 → 0.45s; pen-up dwell 0.25s; return 10mm @83.3mm/s
    // (triangle, never reaches cruise) → 2·√(5000)/500 = 0.2828s.
    const gc = generateGcode(
      [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      ],
      OPTS,
    );
    expect(estimatePlotTime(gc, MOTION)).toBeCloseTo(0.45 + 0.5 + 0.2828427, 4);
  });

  it('returns 0 for a program with no drawable strokes', () => {
    const gc = generateGcode([[{ x: 5, y: 5 }]], OPTS);
    expect(estimatePlotTime(gc, MOTION)).toBe(0);
  });

  it('is at least the constant-feed lower bound (accel only adds time)', () => {
    const stroke: Polyline = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ];
    const gc = generateGcode([stroke], OPTS);
    // Constant-feed: draw 50/25 + return 50/83.3 + two 0.25 dwells.
    const naive = 50 / 25 + 50 / (5000 / 60) + 0.5;
    expect(estimatePlotTime(gc, MOTION)).toBeGreaterThanOrEqual(naive);
  });

  it('a faster draw feed lowers the estimate', () => {
    const stroke: Polyline = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ];
    const slow = estimatePlotTime(generateGcode([stroke], OPTS), MOTION);
    const fast = estimatePlotTime(generateGcode([stroke], { ...OPTS, drawFeed: 3000 }), MOTION);
    expect(fast).toBeLessThan(slow);
  });

  it('higher acceleration lowers the estimate', () => {
    const gc = generateGcode(
      [
        [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
        ],
      ],
      OPTS,
    );
    expect(estimatePlotTime(gc, { accel: 1500, jdev: 0.01 })).toBeLessThan(
      estimatePlotTime(gc, { accel: 200, jdev: 0.01 }),
    );
  });

  it('sharper cornering (smaller junction deviation) raises the estimate', () => {
    // A right-angle stroke: same gcode, only the cornering limit differs, so the
    // travel/dwell terms cancel and only the corner crawl changes the total.
    const gc = generateGcode(
      [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
      ],
      OPTS,
    );
    const loose = estimatePlotTime(gc, { accel: 500, jdev: 0.2 });
    const tight = estimatePlotTime(gc, { accel: 500, jdev: 0.001 });
    expect(tight).toBeGreaterThan(loose);
  });
});

describe('formatDuration', () => {
  it('formats sub-minute, sub-hour, and hour-plus durations', () => {
    expect(formatDuration(45)).toBe('~45s');
    expect(formatDuration(59)).toBe('~59s');
    expect(formatDuration(60)).toBe('~1m 00s');
    expect(formatDuration(90)).toBe('~1m 30s');
    expect(formatDuration(750)).toBe('~12m 30s');
    expect(formatDuration(3600)).toBe('~1h 00m');
    expect(formatDuration(3840)).toBe('~1h 04m');
  });
});

describe('generatePenGroupGcode', () => {
  const opts = { penUpZ: 0, penDownZ: 3, dwellMs: 250, drawFeed: 1500, travelFeed: 5000 };
  const square = (x: number): Polyline => [
    { x, y: 0 },
    { x: x + 5, y: 0 },
  ];

  it('emits one marker between consecutive groups, labelled with the pen to load', () => {
    const gc = generatePenGroupGcode(
      [
        { label: 'Black 0.5', polylines: [square(0)] },
        { label: 'Red 0.5', polylines: [square(10)] },
        { label: 'Blue 0.5', polylines: [square(20)] },
      ],
      opts,
    );
    const markers = gc.filter((l) => l.startsWith(PEN_CHANGE_PREFIX));
    // Two changes for three pens — the first pen is already in the holder.
    expect(markers).toEqual([`${PEN_CHANGE_PREFIX}Red 0.5`, `${PEN_CHANGE_PREFIX}Blue 0.5`]);
  });

  it('parks at the work origin with the pen up before every pen change', () => {
    const gc = generatePenGroupGcode(
      [
        { label: 'Black', polylines: [square(0)] },
        { label: 'Red', polylines: [square(10)] },
      ],
      opts,
    );
    const at = gc.findIndex((l) => l.startsWith(PEN_CHANGE_PREFIX));
    // Swapping a pen over the drawing would foul it; the machine goes home first.
    expect(gc[at - 1]).toBe('G1 X0 Y0 F5000');
    const zMoves = gc.slice(0, at).filter((l) => l.startsWith('G0 Z'));
    expect(zMoves[zMoves.length - 1]).toBe('G0 Z0');
  });

  it('matches the single-pen program exactly when only one group draws', () => {
    const polylines = [square(0), square(10)];
    const single = generateGcode(polylines, opts);
    expect(generatePenGroupGcode([{ label: 'Black', polylines }], opts)).toEqual(single);
    // An empty group must not introduce a pen change for a pen that draws nothing.
    expect(
      generatePenGroupGcode(
        [
          { label: 'Black', polylines },
          { label: 'Red', polylines: [] },
          { label: 'Blue', polylines: [[{ x: 1, y: 1 }]] },
        ],
        opts,
      ),
    ).toEqual(single);
  });

  it('produces a valid empty program when nothing is drawable', () => {
    expect(generatePenGroupGcode([], opts)).toEqual(generateGcode([], opts));
  });

  it('draws every group, and only its own strokes, between the markers', () => {
    const gc = generatePenGroupGcode(
      [
        { label: 'Black', polylines: [square(0)] },
        { label: 'Red', polylines: [square(100)] },
      ],
      opts,
    );
    const at = gc.findIndex((l) => l.startsWith(PEN_CHANGE_PREFIX));
    expect(gc.slice(0, at).some((l) => l.includes('X5'))).toBe(true);
    expect(gc.slice(0, at).some((l) => l.includes('X105'))).toBe(false);
    expect(gc.slice(at).some((l) => l.includes('X105'))).toBe(true);
  });

  it('is costed by the time estimate like any other program', () => {
    const gc = generatePenGroupGcode(
      [
        { label: 'Black', polylines: [square(0)] },
        { label: 'Red', polylines: [square(100)] },
      ],
      opts,
    );
    // The marker is a comment: it carries no motion, so it must not break the
    // estimator's parse or add time of its own.
    expect(estimatePlotTime(gc)).toBeGreaterThan(0);
    expect(estimatePlotTime(gc)).toBeCloseTo(
      estimatePlotTime(gc.filter((l) => !l.startsWith(PEN_CHANGE_PREFIX))),
      6,
    );
  });
});
