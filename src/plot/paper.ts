export interface PaperSize {
  name: string;
  /** Short edge (mm) and long edge (mm); orientation is applied in the UI. */
  shortMm: number;
  longMm: number;
}

/** ISO A series. The machine bed is 1189×841 mm (X is the long axis). */
export const PAPER_SIZES: PaperSize[] = [
  { name: 'A4', shortMm: 210, longMm: 297 },
  { name: 'A3', shortMm: 297, longMm: 420 },
  { name: 'A2', shortMm: 420, longMm: 594 },
  { name: 'A1', shortMm: 594, longMm: 841 },
  { name: 'A0', shortMm: 841, longMm: 1189 },
  { name: 'A0 (SBP)', shortMm: 841, longMm: 1181 },
];

/** Paper dimensions (mm) placed on the bed for a given orientation. */
export function paperDims(
  size: PaperSize,
  orientation: 'landscape' | 'portrait',
): { widthMm: number; heightMm: number } {
  return orientation === 'landscape'
    ? { widthMm: size.longMm, heightMm: size.shortMm }
    : { widthMm: size.shortMm, heightMm: size.longMm };
}

/**
 * How a sheet looks, for the canvas preview only. The plotter draws on whatever
 * is actually clamped to the bed; this is so the preview matches it — a dotted
 * pad, a cream sheet, black card for a white pen — and so the operator can see
 * whether a drawing will read on that stock before spending it.
 *
 * Never reaches the G-code: no pattern is plotted, and the sheet colour changes
 * nothing but the preview.
 */
export type PaperPattern = 'none' | 'dots' | 'grid' | 'lines';

export interface PaperStyle {
  /** Stable key, persisted with the session. */
  id: string;
  name: string;
  /** Sheet colour (CSS). */
  color: string;
  pattern: PaperPattern;
  /** Pattern pitch in mm. Ignored when `pattern` is `none`. */
  spacingMm: number;
  /** Pattern ink colour (CSS). */
  patternColor: string;
  /**
   * True when the sheet is dark enough that the preview must draw the artwork
   * in a light colour to stay legible — the pen on such stock is white or
   * metallic, so this is also closer to the real result.
   */
  dark?: boolean;
}

export const PAPER_STYLES: PaperStyle[] = [
  {
    id: 'plain',
    name: 'Plain white',
    color: '#ffffff',
    pattern: 'none',
    spacingMm: 0,
    patternColor: 'transparent',
  },
  {
    id: 'cream',
    name: 'Cream',
    color: '#f7f1e3',
    pattern: 'none',
    spacingMm: 0,
    patternColor: 'transparent',
  },
  {
    id: 'dotted',
    name: 'Dotted',
    color: '#ffffff',
    pattern: 'dots',
    spacingMm: 5,
    patternColor: '#b6c2d1',
  },
  {
    id: 'grid',
    name: 'Grid',
    color: '#ffffff',
    pattern: 'grid',
    spacingMm: 5,
    patternColor: '#d8e0ea',
  },
  {
    id: 'lined',
    name: 'Lined',
    color: '#fffdf7',
    pattern: 'lines',
    spacingMm: 8,
    patternColor: '#d6dfe9',
  },
  {
    id: 'kraft',
    name: 'Kraft',
    color: '#c8a87c',
    pattern: 'none',
    spacingMm: 0,
    patternColor: 'transparent',
  },
  {
    id: 'black',
    name: 'Black card',
    color: '#1f2430',
    pattern: 'none',
    spacingMm: 0,
    patternColor: 'transparent',
    dark: true,
  },
];

export const DEFAULT_PAPER_STYLE_ID = 'plain';

/** Look up a style by id, falling back to plain white for an unknown or missing one. */
export function paperStyle(id: string | undefined | null): PaperStyle {
  return (
    PAPER_STYLES.find((s) => s.id === id) ??
    PAPER_STYLES.find((s) => s.id === DEFAULT_PAPER_STYLE_ID)!
  );
}
