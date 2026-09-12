import { describe, expect, it } from 'vitest';
import { pathIsClear, routeAround } from '../avoid';
import type { Magnet } from '../magnet';
import type { Point } from '../types';

const zone = (x: number, y: number, radiusMm = 10): Magnet => ({
  id: `z${x}-${y}`,
  x,
  y,
  radiusMm,
});
const pathLength = (path: Point[]) => {
  let total = 0;
  for (let i = 1; i < path.length; i++)
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return total;
};

const a: Point = { x: 0, y: 0 };
const b: Point = { x: 100, y: 0 };

describe('routeAround', () => {
  it('leaves a clear leg alone', () => {
    expect(routeAround(a, b, [zone(50, 40)])).toEqual([a, b]);
    expect(routeAround(a, b, [])).toEqual([a, b]);
  });

  it('detours around a zone on the leg', () => {
    const path = routeAround(a, b, [zone(50, 0)]);
    expect(path.length).toBeGreaterThan(2);
    expect(path[0]).toEqual(a);
    expect(path[path.length - 1]).toEqual(b);
    expect(pathIsClear(path, [zone(50, 0)])).toBe(true);
  });

  it('clears a zone the leg only clips', () => {
    const zones = [zone(50, 8)];
    const path = routeAround(a, b, zones);
    expect(pathIsClear(path, zones)).toBe(true);
  });

  it('clears several zones along one leg', () => {
    // The case this exists for: an A0-width travel leg crossing the sheet.
    const zones = [zone(200, 0), zone(500, 20), zone(800, -15)];
    const far: Point = { x: 1000, y: 0 };
    const path = routeAround(a, far, zones);
    expect(pathIsClear(path, zones)).toBe(true);
    expect(path[path.length - 1]).toEqual(far);
  });

  it('clears overlapping zones', () => {
    const zones = [zone(50, 0), zone(62, 4)];
    const path = routeAround(a, b, zones);
    expect(pathIsClear(path, zones)).toBe(true);
  });

  it('does not wander: the detour stays close to the straight line', () => {
    // A detour is a nuisance, not a licence to cross the sheet. Around a 10 mm
    // zone the extra travel should be a few tens of millimetres, not hundreds.
    const zones = [zone(50, 0)];
    const path = routeAround(a, b, zones);
    expect(pathLength(path)).toBeLessThan(pathLength([a, b]) + 60);
  });

  it('gives up gracefully when an endpoint is inside a zone', () => {
    // Nothing to route around when the destination is in the keep-out — that is
    // geometry the operator has to move, and it is blocked before plotting.
    const zones = [zone(100, 0)];
    expect(routeAround(a, b, zones)).toEqual([a, b]);
    expect(routeAround(b, a, zones)).toEqual([b, a]);
  });

  it('handles a leg straight through a zone centre', () => {
    // No outward direction exists at the centre; it has to step off sideways.
    const zones = [zone(50, 0)];
    const path = routeAround({ x: 50, y: -60 }, { x: 50, y: 60 }, zones);
    expect(pathIsClear(path, zones)).toBe(true);
  });

  it('terminates on a degenerate leg', () => {
    const zones = [zone(0, 0)];
    expect(() => routeAround(a, a, zones)).not.toThrow();
    expect(routeAround(a, a, zones)).toEqual([a, a]);
  });
});

describe('pathIsClear', () => {
  it('spots a segment cutting through a zone', () => {
    expect(pathIsClear([a, b], [zone(50, 0)])).toBe(false);
  });

  it('accepts a path that only touches the boundary', () => {
    expect(
      pathIsClear(
        [
          { x: 0, y: 10 },
          { x: 100, y: 10 },
        ],
        [zone(50, 0)],
      ),
    ).toBe(true);
  });
});
