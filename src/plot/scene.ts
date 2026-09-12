/**
 * The scene: the page's objects as *objects* — things with identity, a
 * transform, a stacking order, and operations that act on a selection of them.
 *
 * Everything here is pure and works on plain data, so the editing behaviours
 * that are easy to get subtly wrong (what a rubber band catches, where a paste
 * lands, what "send backward" does at the end of the list) are unit-tested
 * rather than inferred from clicking around.
 */
import { transformedBox, type Bounds } from './place';
import type { Placement } from './types';

/** The part of an object the scene reasons about: where it is and how big. */
export interface SceneObject {
  id: string;
  placement: Placement;
  /** Intrinsic (unscaled) size in mm. */
  widthMm: number;
  heightMm: number;
}

/** An axis-aligned rectangle in paper mm. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Page-mm bounds of an object, with its placement applied. */
export function objectBounds(o: SceneObject): Bounds {
  const box = transformedBox(o.widthMm, o.heightMm, o.placement.scale, o.placement.rotation);
  return {
    minX: o.placement.x + box.minX,
    minY: o.placement.y + box.minY,
    maxX: o.placement.x + box.maxX,
    maxY: o.placement.y + box.maxY,
    width: box.width,
    height: box.height,
  };
}

/** Normalise a drag (which may run right-to-left or bottom-to-top) into a rect. */
export function rectFromDrag(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/**
 * Ids of the objects a rubber band catches.
 *
 * Intersection, not containment: on an A0 bed an artwork often fills most of
 * the page, and a band that has to *enclose* it cannot be drawn without leaving
 * the sheet. Touching is enough, which is also what the drawing tools operators
 * are used to do when you drag right-to-left.
 */
export function objectsInRect(objects: readonly SceneObject[], rect: Rect): string[] {
  const x2 = rect.x + rect.width;
  const y2 = rect.y + rect.height;
  return objects
    .filter((o) => {
      const b = objectBounds(o);
      return b.minX <= x2 && b.maxX >= rect.x && b.minY <= y2 && b.maxY >= rect.y;
    })
    .map((o) => o.id);
}

/**
 * Move an object one step through the stacking order (positive = later in the
 * list = drawn on top). Clamped at both ends, and a no-op for an id that is not
 * in the list, so a repeated "bring forward" simply stops at the top.
 */
export function reorder<T extends { id: string }>(
  list: readonly T[],
  id: string,
  delta: number,
): T[] {
  const from = list.findIndex((o) => o.id === id);
  if (from < 0) return [...list];
  const to = Math.min(list.length - 1, Math.max(0, from + delta));
  if (to === from) return [...list];
  const out = [...list];
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}

/**
 * Move a whole selection one step through the stacking order.
 *
 * Only the *sign* of `delta` matters. A selected object swaps with its
 * neighbour only when that neighbour is NOT also selected, which keeps the
 * selection's internal order intact and makes a block already at the top (or
 * bottom) a no-op — rather than letting its members trade places with each
 * other, which is what a naive per-object loop does.
 */
export function reorderMany<T extends { id: string }>(
  list: readonly T[],
  ids: readonly string[],
  delta: number,
): T[] {
  const sel = new Set(ids);
  const out = [...list];
  const swap = (i: number, j: number) => {
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  };
  if (delta > 0) {
    for (let i = out.length - 2; i >= 0; i--) {
      if (sel.has(out[i].id) && !sel.has(out[i + 1].id)) swap(i, i + 1);
    }
  } else if (delta < 0) {
    for (let i = 1; i < out.length; i++) {
      if (sel.has(out[i].id) && !sel.has(out[i - 1].id)) swap(i, i - 1);
    }
  }
  return out;
}

/** How far a pasted copy is offset from its original, in paper mm. */
export const PASTE_OFFSET_MM = 10;

/**
 * Placement for a pasted copy: nudged down-right so it is visibly a second
 * object rather than hidden exactly behind the first, and clamped so the copy
 * cannot land off the paper (where it would be invisible and would fail the
 * pre-plot work-area check).
 */
export function pastePlacement(
  o: SceneObject,
  paperW: number,
  paperH: number,
  offsetMm = PASTE_OFFSET_MM,
): Placement {
  const b = objectBounds(o);
  const maxX = Math.max(0, paperW - b.width);
  const maxY = Math.max(0, paperH - b.height);
  // Clamp the *bounding box*, then express it as the placement origin again —
  // a rotated object's origin is not its top-left corner.
  const originOffsetX = o.placement.x - b.minX;
  const originOffsetY = o.placement.y - b.minY;
  const x = Math.min(maxX, b.minX + offsetMm);
  const y = Math.min(maxY, b.minY + offsetMm);
  return { ...o.placement, x: x + originOffsetX, y: y + originOffsetY };
}

/**
 * A name for a copy that stays readable after repeated pastes: `plan.svg` →
 * `plan copy.svg` → `plan copy 2.svg`, keeping the extension where the eye
 * expects it rather than producing `plan.svg copy copy`.
 */
export function copyName(name: string, existing: readonly string[]): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  const base = stem.replace(/ copy( \d+)?$/, '');
  let candidate = `${base} copy${ext}`;
  for (let n = 2; existing.includes(candidate); n++) candidate = `${base} copy ${n}${ext}`;
  return candidate;
}
