/** A point in paper millimeters, with the TOP-LEFT corner as origin (Y down). */
export interface Point {
  x: number;
  y: number;
}

/** A connected pen-down stroke (a sequence of straight segments). */
export type Polyline = Point[];

/**
 * A registration mark from the file's reference layer, in the artwork frame
 * (same origin as `polylines`), so placing the artwork places the mark.
 */
export interface CalibrationPoint extends Point {
  /** The group's id or label in the file (e.g. `cal-P1`), for display. */
  name: string;
}

/** Imported, flattened artwork in paper millimeters. */
export interface Artwork {
  polylines: Polyline[];
  /** Intrinsic size in mm (from the SVG viewBox/dimensions). */
  widthMm: number;
  heightMm: number;
  /**
   * Where the artwork sits on its own page: page mm from the page (viewBox)
   * origin to the bounding-box top-left that normalisation moved to (0,0).
   * Undefined when the source has no page (PNG) or for sessions saved before
   * this existed. Lets a cut be placed exactly where a matching print put it.
   */
  pageOffset?: Point;
  /** Registration marks found on a reference layer, if any (never plotted). */
  calibrationPoints?: CalibrationPoint[];
}

/** Placement of artwork on the page: local origin at (x,y) mm, scaled, rotated. */
export interface Placement {
  x: number;
  y: number;
  scale: number;
  rotation: number; // degrees
}
