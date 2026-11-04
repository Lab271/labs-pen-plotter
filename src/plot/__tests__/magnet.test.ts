import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAGNET_RADIUS_MM,
  distanceToSegment,
  magnetCentreFromCarriage,
  magnetsHitBy,
  normalizeMagnets,
  normalizeSuggestionFingerprint,
  polylineHitsMagnet,
  recommendMagnets,
  suggestionFingerprint,
  suggestionStaleness,
  type CarriageReading,
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

describe('suggestionStaleness', () => {
  const art: Polyline[] = [
    [
      { x: 100, y: 100 },
      { x: 300, y: 200 },
    ],
  ];
  const shifted: Polyline[] = art.map((p) => p.map((pt) => ({ x: pt.x + 20, y: pt.y })));
  const at = (polylines: readonly Polyline[], w = 600, h = 400) =>
    suggestionFingerprint(w, h, polylines);

  it('is not stale when nothing was ever suggested', () => {
    // No suggestion, nothing to go out of date — a hint here would be noise.
    expect(suggestionStaleness(null, at(art))).toBeNull();
  });

  it('is not stale when the sheet is as it was', () => {
    expect(suggestionStaleness(at(art), at(art))).toBeNull();
  });

  it('reports moved artwork', () => {
    expect(suggestionStaleness(at(art), at(shifted))).toBe('artwork');
  });

  it('reports artwork added to, or cleared from, an empty sheet', () => {
    expect(suggestionStaleness(at([]), at(art))).toBe('artwork');
    expect(suggestionStaleness(at(art), at([]))).toBe('artwork');
  });

  it('reports a new paper size ahead of moved artwork', () => {
    // A different sheet invalidates every edge position at once, which is
    // the more useful thing to say.
    expect(suggestionStaleness(at(art), at(shifted, 841, 594))).toBe('paper');
    expect(suggestionStaleness(at(art), at(art, 400, 600))).toBe('paper');
  });

  it('ignores a change inside the drawing that leaves its extent alone', () => {
    // Suggestions only read the drawing's box, so a stroke added in the
    // middle cannot change what Suggest would offer.
    const inner: Polyline[] = [
      ...art,
      [
        { x: 150, y: 150 },
        { x: 200, y: 160 },
      ],
    ];
    expect(suggestionStaleness(at(art), at(inner))).toBeNull();
  });

  it('ignores sub-tenth-millimetre wobble', () => {
    const wobble: Polyline[] = art.map((p) => p.map((pt) => ({ x: pt.x + 0.01, y: pt.y - 0.01 })));
    expect(suggestionStaleness(at(art), at(wobble))).toBeNull();
  });

  it('treats empty polylines as no drawing', () => {
    expect(suggestionFingerprint(600, 400, [[]]).drawn).toBeNull();
  });
});

describe('normalizeSuggestionFingerprint', () => {
  it('round-trips a fingerprint through JSON', () => {
    const fp = suggestionFingerprint(600, 400, [
      [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
    ]);
    expect(normalizeSuggestionFingerprint(JSON.parse(JSON.stringify(fp)))).toEqual(fp);
    const empty = suggestionFingerprint(600, 400, []);
    expect(normalizeSuggestionFingerprint(JSON.parse(JSON.stringify(empty)))).toEqual(empty);
  });

  it('drops anything malformed rather than guessing', () => {
    for (const junk of [
      undefined,
      null,
      'fp',
      { paperW: 600 },
      { paperW: 600, paperH: 400 },
      { paperW: 600, paperH: 400, drawn: 'box' },
      { paperW: 600, paperH: 400, drawn: { minX: 0, minY: 0, maxX: 1 } },
      { paperW: NaN, paperH: 400, drawn: null },
    ]) {
      expect(normalizeSuggestionFingerprint(junk)).toBeNull();
    }
  });
});

describe('magnetCentreFromCarriage', () => {
  const ready: CarriageReading = {
    position: { x: 412.5, y: 287.25 },
    machineState: 'Idle',
    posTrusted: true,
    untrustedReason: null,
    plotting: false,
  };

  it('takes the work position as the magnet centre, unchanged', () => {
    // Work coordinates are paper mm with machine +Y running down the page —
    // identity, so a "corrected" Y here would put the magnet in the wrong place.
    expect(magnetCentreFromCarriage(ready)).toEqual({ ok: true, x: 412.5, y: 287.25 });
  });

  it('refuses while the position is untrusted, and says why', () => {
    // After a motor power-down the gantry can be pushed; jog still works but
    // its numbers mean nothing, and an unmeasured magnet becomes a keep-out
    // zone the router trusts.
    const reason = 'The motors were switched off, so the gantry can be moved by hand.';
    const result = magnetCentreFromCarriage({
      ...ready,
      posTrusted: false,
      untrustedReason: reason,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(reason);
      expect(result.reason).toMatch(/re-zero/i);
    }
  });

  it('still refuses an untrusted position when no reason was given', () => {
    const result = magnetCentreFromCarriage({ ...ready, posTrusted: false, untrustedReason: null });
    expect(result.ok).toBe(false);
  });

  it('refuses with no reading from the machine', () => {
    expect(magnetCentreFromCarriage({ ...ready, position: null }).ok).toBe(false);
    expect(magnetCentreFromCarriage({ ...ready, machineState: null }).ok).toBe(false);
  });

  it('refuses during a plot', () => {
    expect(magnetCentreFromCarriage({ ...ready, plotting: true }).ok).toBe(false);
  });

  it('refuses while the carriage is still moving', () => {
    // Mid-jog the report is a point along the move, not where the pen stops.
    for (const machineState of ['Jog', 'Run', 'Hold', 'Unknown']) {
      expect(magnetCentreFromCarriage({ ...ready, machineState }).ok).toBe(false);
    }
  });

  it('refuses in alarm, and says to unlock', () => {
    const result = magnetCentreFromCarriage({ ...ready, machineState: 'Alarm' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unlock/i);
  });

  it('refuses a position that is not a number', () => {
    expect(magnetCentreFromCarriage({ ...ready, position: { x: NaN, y: 3 } }).ok).toBe(false);
  });

  it('allows a centre off the sheet', () => {
    // Recording a real magnet is always safer than refusing to: a keep-out
    // zone the paper does not reach costs nothing.
    expect(magnetCentreFromCarriage({ ...ready, position: { x: -5, y: 10 } })).toEqual({
      ok: true,
      x: -5,
      y: 10,
    });
  });
});
