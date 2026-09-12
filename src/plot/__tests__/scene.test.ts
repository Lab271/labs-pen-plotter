import { describe, expect, it } from 'vitest';
import {
  copyName,
  objectBounds,
  objectsInRect,
  pastePlacement,
  rectFromDrag,
  reorder,
  reorderMany,
  type SceneObject,
} from '../scene';

const obj = (id: string, x: number, y: number, w = 20, h = 10, rotation = 0): SceneObject => ({
  id,
  placement: { x, y, scale: 1, rotation },
  widthMm: w,
  heightMm: h,
});

describe('objectBounds', () => {
  it('offsets the local box by the placement', () => {
    expect(objectBounds(obj('a', 5, 7))).toMatchObject({ minX: 5, minY: 7, maxX: 25, maxY: 17 });
  });

  it('accounts for scale and rotation', () => {
    const b = objectBounds(obj('a', 0, 0, 20, 10, 90));
    // Rotating 90° puts the box's own extent on the other axis, and the
    // rotated corners fall to the LEFT of the origin — which is why bounds
    // cannot be read off placement.x/y directly.
    expect(b.width).toBeCloseTo(10, 6);
    expect(b.height).toBeCloseTo(20, 6);
    expect(b.minX).toBeCloseTo(-10, 6);
  });
});

describe('rectFromDrag', () => {
  it('normalises a drag in any direction', () => {
    expect(rectFromDrag({ x: 30, y: 40 }, { x: 10, y: 10 })).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 30,
    });
  });
});

describe('objectsInRect', () => {
  const objects = [obj('a', 0, 0), obj('b', 100, 0), obj('c', 0, 100)];

  it('catches what the band touches, not only what it encloses', () => {
    // A band clipping the right edge of 'a' selects it: on an A0 sheet an
    // artwork often fills the page, so requiring containment would make it
    // unselectable by rubber band.
    expect(objectsInRect(objects, { x: 15, y: 5, width: 10, height: 10 })).toEqual(['a']);
  });

  it('returns every object the band spans, in list order', () => {
    expect(objectsInRect(objects, { x: -5, y: -5, width: 200, height: 200 })).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('returns nothing for a band over empty paper', () => {
    expect(objectsInRect(objects, { x: 40, y: 40, width: 10, height: 10 })).toEqual([]);
  });

  it('counts an edge-grazing band as a hit', () => {
    expect(objectsInRect([obj('a', 0, 0)], { x: 20, y: 10, width: 0, height: 0 })).toEqual(['a']);
  });
});

describe('reorder', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('moves an object one step in either direction', () => {
    expect(reorder(list, 'a', 1).map((o) => o.id)).toEqual(['b', 'a', 'c']);
    expect(reorder(list, 'c', -1).map((o) => o.id)).toEqual(['a', 'c', 'b']);
  });

  it('clamps at both ends instead of wrapping', () => {
    expect(reorder(list, 'a', -1).map((o) => o.id)).toEqual(['a', 'b', 'c']);
    expect(reorder(list, 'c', 1).map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('ignores an id that is not in the list', () => {
    expect(reorder(list, 'zz', 1).map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input', () => {
    reorder(list, 'a', 1);
    expect(list.map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('reorderMany', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('shifts a whole selection without letting it trade places with itself', () => {
    // Moving 'a' then 'b' naively would swap them past each other; both must
    // simply move one step and keep their relative order.
    expect(reorderMany(list, ['a', 'b'], 1).map((o) => o.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(reorderMany(list, ['c', 'd'], -1).map((o) => o.id)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('is a no-op when the selection is already at the end it is moving toward', () => {
    expect(reorderMany(list, ['c', 'd'], 1).map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('pastePlacement', () => {
  it('nudges the copy down-right so it is not hidden behind the original', () => {
    expect(pastePlacement(obj('a', 5, 5), 400, 300)).toMatchObject({ x: 15, y: 15 });
  });

  it('keeps the copy on the paper', () => {
    // Without the clamp a paste near the edge lands off the sheet, where it is
    // invisible and fails the pre-plot work-area check.
    const p = pastePlacement(obj('a', 395, 295, 20, 10), 400, 300);
    expect(p.x).toBeLessThanOrEqual(400 - 20);
    expect(p.y).toBeLessThanOrEqual(300 - 10);
  });

  it('offsets a rotated object by its bounding box, not its origin', () => {
    const rotated = obj('a', 50, 50, 20, 10, 90);
    const before = objectBounds(rotated);
    const after = objectBounds({ ...rotated, placement: pastePlacement(rotated, 400, 300) });
    expect(after.minX - before.minX).toBeCloseTo(10, 6);
    expect(after.minY - before.minY).toBeCloseTo(10, 6);
  });

  it('keeps scale and rotation', () => {
    const o = obj('a', 10, 10, 20, 10, 33);
    const p = pastePlacement({ ...o, placement: { ...o.placement, scale: 2 } }, 400, 300);
    expect(p.scale).toBe(2);
    expect(p.rotation).toBe(33);
  });
});

describe('copyName', () => {
  it('keeps the extension where the eye expects it', () => {
    expect(copyName('plan.svg', [])).toBe('plan copy.svg');
    expect(copyName('no-extension', [])).toBe('no-extension copy');
  });

  it('numbers repeated copies instead of stacking the word', () => {
    expect(copyName('plan.svg', ['plan copy.svg'])).toBe('plan copy 2.svg');
    expect(copyName('plan copy.svg', ['plan copy.svg'])).toBe('plan copy 2.svg');
    expect(copyName('plan copy 2.svg', ['plan copy.svg', 'plan copy 2.svg'])).toBe(
      'plan copy 3.svg',
    );
  });

  it('leaves a dotfile-style name alone', () => {
    expect(copyName('.hidden', [])).toBe('.hidden copy');
  });
});
