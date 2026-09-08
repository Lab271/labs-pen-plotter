import type { Placement, Polyline } from './types';

/**
 * Apply a placement (translate → rotate → scale) to artwork polylines, matching
 * a Konva Group with the same x/y/scale/rotation. Returns polylines in paper-mm.
 */
export function placePolylines(polylines: Polyline[], pl: Placement): Polyline[] {
  const r = (pl.rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const s = pl.scale;
  return polylines.map((poly) =>
    poly.map((p) => {
      const sx = p.x * s;
      const sy = p.y * s;
      return { x: pl.x + sx * cos - sy * sin, y: pl.y + sx * sin + sy * cos };
    }),
  );
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/**
 * Axis-aligned bounds of a W×H artwork box after scale + rotation, before
 * translation (local origin at 0,0). Lets fit/anchor account for rotation.
 */
export function transformedBox(W: number, H: number, scale: number, rotationDeg: number): Bounds {
  const r = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [lx, ly] of [
    [0, 0],
    [W, 0],
    [W, H],
    [0, H],
  ]) {
    const sx = lx * scale;
    const sy = ly * scale;
    const x = sx * cos - sy * sin;
    const y = sx * sin + sy * cos;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Placement that fits a W×H artwork inside the paper at its current rotation,
 * preserving aspect ratio and anchoring the rotated box to the top-left corner.
 */
export function fitPlacement(
  W: number,
  H: number,
  rotationDeg: number,
  paperW: number,
  paperH: number,
): Placement {
  if (W <= 0 || H <= 0) return { x: 0, y: 0, scale: 1, rotation: rotationDeg };
  const unit = transformedBox(W, H, 1, rotationDeg);
  const scale = Math.min(paperW / unit.width, paperH / unit.height);
  const box = transformedBox(W, H, scale, rotationDeg);
  return { x: -box.minX, y: -box.minY, scale, rotation: rotationDeg };
}

/** Placement that anchors the rotated artwork box to the top-left corner, keeping scale. */
export function anchorPlacement(W: number, H: number, pl: Placement): Placement {
  const box = transformedBox(W, H, pl.scale, pl.rotation);
  return { ...pl, x: -box.minX, y: -box.minY };
}

/**
 * Placement that draws the artwork at its real-world size (scale 1) — the
 * dimensions the SVG declared, or the PNG's resolution-derived size — keeping the
 * current rotation and anchoring the rotated box to the top-left corner.
 *
 * Import defaults to fit-to-paper, which silently rescales a sized drawing; on
 * an A0 bed an A4 file comes out ~4× too large. This is the operator's way back
 * to 1:1 without dragging the transform handles to exactly 100%.
 */
export function actualSizePlacement(W: number, H: number, pl: Placement): Placement {
  return anchorPlacement(W, H, { ...pl, scale: 1 });
}

export function bounds(polylines: Polyline[]): Bounds {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const poly of polylines)
    for (const p of poly) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
