/**
 * Image adjustments applied before an image is converted to lines.
 *
 * All of it operates on the decoded grayscale field rather than on pixels in a
 * canvas, so the adjust step and the conversion step see exactly the same data
 * and the preview cannot drift from what gets plotted. Pure, so it is testable
 * without a DOM.
 */
import type { FieldSource } from './raster';

export interface AdjustSpec {
  /**
   * Crop as fractions of each edge (0..1). `left: 0.1` throws away the left
   * tenth. Fractions rather than pixels so a crop survives a change of working
   * resolution.
   */
  crop: { left: number; top: number; right: number; bottom: number };
  /** Quarter turns clockwise, 0–3. */
  rotateQuarters: number;
  /** Added to every sample, -1..1 (positive = lighter). */
  brightness: number;
  /** Multiplier around mid-grey (1 = unchanged). */
  contrast: number;
  /** Swap dark and light — for pale line art on a dark ground, or a white pen. */
  invert: boolean;
}

export const DEFAULT_ADJUST: AdjustSpec = {
  crop: { left: 0, top: 0, right: 0, bottom: 0 },
  rotateQuarters: 0,
  brightness: 0,
  contrast: 1,
  invert: false,
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Tone mapping for one sample: invert, then contrast about mid-grey, then brightness. */
export function adjustSample(v: number, spec: AdjustSpec): number {
  const g = spec.invert ? 1 - v : v;
  return clamp01((g - 0.5) * spec.contrast + 0.5 + spec.brightness);
}

/**
 * Apply a crop, quarter-turn rotation and tone mapping, returning a new field.
 *
 * `mmPerGrid` is unchanged: cropping and rotating move which cells are kept, not
 * how big a cell is on paper — so a cropped import keeps the real-world scale of
 * the original rather than stretching to fill the old size.
 */
export function adjustField(src: FieldSource, spec: AdjustSpec): FieldSource {
  const left = clamp01(spec.crop.left);
  const top = clamp01(spec.crop.top);
  const right = clamp01(spec.crop.right);
  const bottom = clamp01(spec.crop.bottom);

  // Keep at least a 2×2 window: marching squares needs a cell, and a crop
  // dragged past itself should degrade to a sliver rather than to nothing.
  const x0 = Math.max(0, Math.min(src.gw - 2, Math.floor(left * src.gw)));
  const y0 = Math.max(0, Math.min(src.gh - 2, Math.floor(top * src.gh)));
  const x1 = Math.max(x0 + 2, Math.ceil((1 - right) * src.gw));
  const y1 = Math.max(y0 + 2, Math.ceil((1 - bottom) * src.gh));
  const cw = Math.min(src.gw, x1) - x0;
  const ch = Math.min(src.gh, y1) - y0;

  const cropped = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      cropped[y * cw + x] = adjustSample(src.field[(y + y0) * src.gw + (x + x0)], spec);
    }
  }

  const turns = ((Math.round(spec.rotateQuarters) % 4) + 4) % 4;
  if (turns === 0) return { field: cropped, gw: cw, gh: ch, mmPerGrid: src.mmPerGrid };

  const swapped = turns % 2 === 1;
  const gw = swapped ? ch : cw;
  const gh = swapped ? cw : ch;
  const out = new Float32Array(gw * gh);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const v = cropped[y * cw + x];
      // Clockwise: (x,y) → (h-1-y, x) per quarter turn.
      let nx = x;
      let ny = y;
      let w = cw;
      let h = ch;
      for (let t = 0; t < turns; t++) {
        const px = h - 1 - ny;
        const py = nx;
        nx = px;
        ny = py;
        const tmp = w;
        w = h;
        h = tmp;
      }
      out[ny * gw + nx] = v;
    }
  }
  return { field: out, gw, gh, mmPerGrid: src.mmPerGrid };
}
