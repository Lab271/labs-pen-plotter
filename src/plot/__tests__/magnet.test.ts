import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAGNET_RADIUS_MM,
  distanceToSegment,
  magnetsHitBy,
  normalizeMagnets,
  polylineHitsMagnet,
  recommendMagnets,
  type Magnet,
} from '../magnet';
import type { Polyline } from '../types';

const magnet = (x: number, y: number, radiusMm = 10): Magnet => ({ id: 'm', x, y, radiusMm });

describe('distanceToSegment', () => {
  it('measures perpendicular distance when the foot is on the segment', () => {
    expect(distanceToSegment({ x: 5, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(4, 6);
  });

  it('measures to the nearer end when the foot is past it', () => {
    // The nearest point of a segment is often an endpoint — a check that only
    // looked at the infinite line would report a magnet as clear when the
    // travel stops short of it.
    expect(distanceToSegment({ x: 20, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(10, 6);
  });

  it('handles a zero-length segment', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(5, 6);
  });
});

describe('polylineHitsMagnet', () => {
  const across: Polyline = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];

  it('catches a line passing through the keep-out circle', () => {
    expect(polylineHitsMagnet(across, magnet(50, 5))).toBe(true);
  });

  it('leaves a line that clears it alone', () => {
    expect(polylineHitsMagnet(across, magnet(50, 15))).toBe(false);
  });

  it('counts a grazing pass as a hit', () => {
    // Exactly on the boundary is a hit: the margin exists to be respected, not
    // to be spent.
    expect(polylineHitsMagnet(across, magnet(50, 10))).toBe(true);
  });

  it('catches a magnet between two points of a long travel leg', () => {
    // The danger case: an A0 travel leg crossing the sheet with nothing but its
    // two endpoints to test.
    const leg: Polyline = [
      { x: 0, y: 0 },
      { x: 1000, y: 800 },
    ];
    expect(polylineHitsMagnet(leg, magnet(500, 400))).toBe(true);
  });

  it('handles a single-point polyline', () => {
    expect(polylineHitsMagnet([{ x: 5, y: 5 }], magnet(0, 0))).toBe(true);
    expect(polylineHitsMagnet([{ x: 50, y: 50 }], magnet(0, 0))).toBe(false);
  });
});

describe('magnetsHitBy', () => {
  it('reports only the magnets the geometry actually runs into', () => {
    const polylines: Polyline[] = [
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    ];
    const magnets: Magnet[] = [
      { id: 'a', x: 50, y: 5, radiusMm: 10 },
      { id: 'b', x: 50, y: 60, radiusMm: 10 },
    ];
    expect(magnetsHitBy(magnets, polylines).map((m) => m.id)).toEqual(['a']);
  });

  it('reports nothing for an empty page', () => {
    expect(magnetsHitBy([magnet(0, 0)], [])).toEqual([]);
  });
});

describe('recommendMagnets', () => {
  it('puts the whole keep-out circle on the paper', () => {
    const magnets = recommendMagnets(400, 300, [], 12);
    expect(magnets.length).toBeGreaterThan(0);
    for (const m of magnets) {
      expect(m.x - m.radiusMm).toBeGreaterThanOrEqual(0);
      expect(m.y - m.radiusMm).toBeGreaterThanOrEqual(0);
      expect(m.x + m.radiusMm).toBeLessThanOrEqual(400);
      expect(m.y + m.radiusMm).toBeLessThanOrEqual(300);
    }
  });

  it('suggests the corners first', () => {
    const [first] = recommendMagnets(400, 300, [], 12);
    expect(first.x).toBeLessThan(100);
    expect(first.y).toBeLessThan(100);
  });

  it('drops positions that would sit on the drawing', () => {
    // A suggestion on top of the artwork is a suggestion to ruin it.
    const wide: Polyline[] = [
      [
        { x: 0, y: 120 },
        { x: 400, y: 120 },
      ],
    ];
    const magnets = recommendMagnets(400, 300, wide, 12);
    for (const m of magnets) {
      expect(magnetsHitBy([m], wide)).toEqual([]);
    }
  });

  it('returns nothing for a sheet too small to hold a magnet clear of the edge', () => {
    expect(recommendMagnets(20, 20, [], 12)).toEqual([]);
  });

  it('gives every suggestion a distinct id', () => {
    const ids = recommendMagnets(600, 400, [], 12).map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('normalizeMagnets', () => {
  it('returns an empty list for anything that is not a list', () => {
    for (const junk of [undefined, null, 'magnets', {}]) expect(normalizeMagnets(junk)).toEqual([]);
  });

  it('repairs a magnet with no usable radius', () => {
    // A zero or negative keep-out radius silently disables every check that
    // exists to keep the carriage off the magnet.
    for (const radiusMm of [0, -5, NaN, 'big', undefined]) {
      expect(normalizeMagnets([{ id: 'm', x: 1, y: 2, radiusMm }])[0].radiusMm).toBe(
        DEFAULT_MAGNET_RADIUS_MM,
      );
    }
  });

  it('keeps a well-formed magnet and fills in a missing id', () => {
    expect(normalizeMagnets([{ x: 10, y: 20, radiusMm: 8 }])).toEqual([
      { id: 'mag1', x: 10, y: 20, radiusMm: 8 },
    ]);
  });

  it('skips entries that are not objects', () => {
    expect(normalizeMagnets([null, 3, { x: 1, y: 1, radiusMm: 5 }])).toHaveLength(1);
  });
});
