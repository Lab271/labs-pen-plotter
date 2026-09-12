/**
 * Primitive shapes as plottable polylines.
 *
 * Everything here produces the same thing an import does — polylines in paper
 * mm, y down, normalised so the top-left of the bounding box is the origin — so
 * a drawn shape is an object like any other: placed, scaled, rotated, assigned
 * a pen and plotted by the code that already exists.
 */
import type { Polyline } from './types';

export type ShapeKind = 'line' | 'rect' | 'ellipse' | 'polygon';

export interface ShapeSpec {
  kind: 'shape';
  shape: ShapeKind;
  /** Bounding-box size in mm. A line runs corner to corner of this box. */
  widthMm: number;
  heightMm: number;
  /** Corner count for `polygon`; ignored otherwise. */
  sides: number;
}

export const DEFAULT_SHAPE: ShapeSpec = {
  kind: 'shape',
  shape: 'rect',
  widthMm: 80,
  heightMm: 50,
  sides: 6,
};

/**
 * Segments used for a full ellipse. 72 (one every 5°) keeps the flattening
 * error under ~0.1 mm on a 200 mm circle — finer than the pen — while staying
 * cheap enough to re-derive on every drag of a size field.
 */
const ELLIPSE_SEGMENTS = 72;

/** Smallest dimension a shape may have, so a degenerate drag can't erase it. */
const MIN_MM = 0.1;

export function shapePolylines(spec: ShapeSpec): Polyline[] {
  const w = Math.max(MIN_MM, spec.widthMm);
  const h = Math.max(MIN_MM, spec.heightMm);

  switch (spec.shape) {
    case 'line':
      return [
        [
          { x: 0, y: 0 },
          { x: w, y: h },
        ],
      ];

    case 'rect':
      // Closed: the last point repeats the first, so the pen returns to the
      // corner it started from instead of leaving a gap the width of the tip.
      return [
        [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
          { x: 0, y: 0 },
        ],
      ];

    case 'ellipse': {
      const rx = w / 2;
      const ry = h / 2;
      const pts = [];
      for (let i = 0; i <= ELLIPSE_SEGMENTS; i++) {
        const t = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
        pts.push({ x: rx + rx * Math.cos(t), y: ry + ry * Math.sin(t) });
      }
      return [pts];
    }

    case 'polygon': {
      const n = Math.max(3, Math.round(spec.sides));
      const rx = w / 2;
      const ry = h / 2;
      const pts = [];
      for (let i = 0; i <= n; i++) {
        // Start at the top so an odd-sided polygon sits point-up, which is how
        // one is drawn by hand and therefore what the operator expects.
        const t = -Math.PI / 2 + (i / n) * Math.PI * 2;
        pts.push({ x: rx + rx * Math.cos(t), y: ry + ry * Math.sin(t) });
      }
      return [pts];
    }
  }
}

/** Bounding size of a shape in mm, before any placement scale is applied. */
export function shapeSize(spec: ShapeSpec): { widthMm: number; heightMm: number } {
  return { widthMm: Math.max(MIN_MM, spec.widthMm), heightMm: Math.max(MIN_MM, spec.heightMm) };
}
