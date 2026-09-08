import type { CalibrationPoint, Point } from './types';

/**
 * Rules for telling reference geometry (registration crosshairs, "do not cut"
 * layers) apart from the artwork. Pure so the rules are unit-tested; the DOM
 * walk in svg.ts only feeds them labels, ids and computed colours.
 *
 * Why three rules: Inkscape exports name layers (`inkscape:label`) and the
 * operator's cut files label the reference layer "calibration REFERENCE ONLY -
 * do not cut" and id its groups `cal-P1..`. Those are explicit and cheap to
 * match. Pure blue is only a fallback for files without labels — colour alone
 * would silently drop legitimate blue artwork, so it is consulted only when no
 * label or id matched anywhere, and the import note always reports the count.
 */

export function isReferenceLabel(label: string | null | undefined): boolean {
  return !!label && /calibration|reference/i.test(label);
}

export function isReferenceId(id: string | null | undefined): boolean {
  return !!id && /^cal-/i.test(id);
}

/** True for pure blue in any of the spellings a browser or editor emits. */
export function isPureBlue(color: string | null | undefined): boolean {
  if (!color) return false;
  const c = color.trim().toLowerCase().replace(/\s+/g, '');
  return (
    c === 'blue' ||
    c === '#0000ff' ||
    c === '#00f' ||
    c === '#0000ffff' ||
    c === '#00ff' ||
    c === 'rgb(0,0,255)' ||
    c === 'rgba(0,0,255,1)'
  );
}

/** What the DOM walk knows about one drawable element. */
export interface ReferenceCandidate {
  /** The group this element belongs to when a label or id matched (any stable key); null if none. */
  labelledGroup: unknown | null;
  /** Element is stroked pure blue, or unstroked and filled pure blue. */
  blue: boolean;
}

/**
 * Decide which candidates are reference geometry. Labels win: if anything in
 * the document is labelled, only labelled elements are reference and blue is
 * ignored. Otherwise pure-blue elements are. Returns one flag per candidate.
 */
export function selectReference(candidates: ReferenceCandidate[]): boolean[] {
  const anyLabelled = candidates.some((c) => c.labelledGroup !== null);
  return candidates.map((c) => (anyLabelled ? c.labelledGroup !== null : c.blue));
}

/** Geometry gathered for one reference group, in page mm. */
export interface ReferenceGroup {
  name: string;
  /** Centres of any <circle>s in the group (the printed dot is the true target). */
  circles: Point[];
  /** Union bounding box of everything in the group, or null if nothing measurable. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

/**
 * One calibration point per group: the first circle's centre when there is one
 * (the dot is what the pen must hit), else the centre of the group's bounding
 * box (a bare crosshair). Null when the group has nothing measurable.
 */
export function referencePoint(g: ReferenceGroup): CalibrationPoint | null {
  if (g.circles.length > 0) return { name: g.name, x: g.circles[0].x, y: g.circles[0].y };
  if (!g.bounds) return null;
  return {
    name: g.name,
    x: (g.bounds.minX + g.bounds.maxX) / 2,
    y: (g.bounds.minY + g.bounds.maxY) / 2,
  };
}
