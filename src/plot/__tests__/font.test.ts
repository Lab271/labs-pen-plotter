import { describe, expect, it } from 'vitest';
import {
  BUILTIN_FONT_ID,
  DEFAULT_TEXT,
  FONT_FACES,
  glyphStrokes,
  missingGlyphs,
  resolveFont,
  supportedCharacters,
  textPolylines,
} from '../font';
import { bounds } from '../place';
import type { Point } from '../types';

/**
 * The first stroke of a glyph that runs alongside its other strokes for most of
 * its length — four in five points sampled along it lie within a fourteenth of
 * the cap height (1.5 Hershey units, half a built-in unit) of another stroke —
 * or null. Sampled along the segments, not just at vertices, so two parallel
 * two-point uprights are caught; measured against all other strokes together,
 * so a doubling stroke that shadows two halves (Hershey's braces) is too.
 */
function retracedStroke(strokes: Point[][], capHeight: number): string | null {
  const near = capHeight / 14;
  const segDist = (p: Point, a: Point, b: Point) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  const samples = (s: Point[]) =>
    s.slice(1).flatMap((b, i) => {
      const a = s[i];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (capHeight / 40)));
      return Array.from({ length: n + 1 }, (_, k) => ({
        x: a.x + ((b.x - a.x) * k) / n,
        y: a.y + ((b.y - a.y) * k) / n,
      }));
    });
  for (const [i, s] of strokes.entries()) {
    const others = strokes.filter((_, j) => j !== i);
    const onOther = (p: Point) =>
      others.some((o) => o.slice(1).some((b, k) => segDist(p, o[k], b) <= near));
    const pts = samples(s);
    if (pts.filter(onOther).length >= pts.length * 0.8) return `stroke ${i} runs alongside another`;
  }
  return null;
}

const text = (over: Partial<typeof DEFAULT_TEXT> = {}) => ({ ...DEFAULT_TEXT, ...over });

describe.each(FONT_FACES.map((f) => [f.name, f] as const))('the %s face', (_name, face) => {
  const inFace = (over: Partial<typeof DEFAULT_TEXT> = {}) => text({ font: face.id, ...over });

  it('covers the characters a plotted label needs', () => {
    const supported = supportedCharacters(face.id).join('');
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:;!?-') {
      expect(supported).toContain(ch);
    }
  });

  it('gives a 10 mm capital at a size of 10 mm', () => {
    // The promise the size field makes, in every face: a ruler on the sheet
    // measures the number typed. 'H' is a plain cap — baseline to cap line.
    const b = bounds(textPolylines(inFace({ text: 'H', sizeMm: 10 })));
    expect(b.height).toBeCloseTo(10, 6);
  });

  it('draws every glyph as open strokes, not closed outlines', () => {
    // The point of a single-line font: a letter is a skeleton the pen follows
    // once, not a contour it traces around (which plots as a hollow letter).
    for (const ch of supportedCharacters(face.id)) {
      if (ch === ' ') continue;
      const polys = textPolylines(inFace({ text: ch, sizeMm: 7 }));
      expect(polys.length, ch).toBeGreaterThan(0);
      for (const p of polys) expect(p.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('never traces the same stroke twice', () => {
    // Duplex/triplex faces draw a stem as two or three parallel strokes, which
    // plots as the doubled line a single-line face exists to avoid.
    for (const ch of supportedCharacters(face.id)) {
      expect(retracedStroke(glyphStrokes(face, ch), face.capHeight), ch).toBeNull();
    }
  });

  it('keeps every glyph inside its own advance and a sane height', () => {
    // A glyph that overshoots its advance width collides with the next letter.
    for (const ch of supportedCharacters(face.id)) {
      const glyph = face.glyphs[ch];
      expect(glyph.width, ch).toBeGreaterThan(0);
      expect(glyph.width, ch).toBeLessThanOrEqual(face.capHeight * 1.5);
      for (const stroke of glyphStrokes(face, ch))
        for (const p of stroke) {
          expect(p.x, ch).toBeGreaterThanOrEqual(0);
          expect(p.x, ch).toBeLessThanOrEqual(glyph.width);
          // Descenders and brackets reach below the baseline and above the
          // caps, but not wildly.
          expect(p.y, ch).toBeGreaterThanOrEqual(-face.capHeight * 0.4);
          expect(p.y, ch).toBeLessThanOrEqual(face.capHeight * 1.25);
        }
    }
  });

  it('is in the same frame as every other face: y up, baseline 0', () => {
    // 'H' sits on the baseline and reaches the cap line in font units.
    const ys = glyphStrokes(face, 'H').flatMap((s) => s.map((p) => p.y));
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(face.capHeight);
  });
});

describe('choosing a face', () => {
  it('gives text with no font the built-in face, exactly as before faces existed', () => {
    // Sessions and projects written before the picker have no `font` field.
    const { font: _omit, ...old } = DEFAULT_TEXT;
    expect(old).not.toHaveProperty('font');
    expect(resolveFont(undefined)).toEqual({ face: FONT_FACES[0] });
    expect(FONT_FACES[0].id).toBe(BUILTIN_FONT_ID);
    expect(textPolylines({ ...old, text: 'Hi' })).toEqual(
      textPolylines(text({ text: 'Hi', font: BUILTIN_FONT_ID })),
    );
  });

  it('falls back to the built-in face for an unknown font, and says so', () => {
    expect(resolveFont('comic-sans')).toEqual({ face: FONT_FACES[0], unknownId: 'comic-sans' });
    expect(textPolylines(text({ text: 'Hi', font: 'comic-sans' }))).toEqual(
      textPolylines(text({ text: 'Hi', font: BUILTIN_FONT_ID })),
    );
    // Coverage follows the face actually drawn, not the one asked for.
    expect(missingGlyphs('$', 'comic-sans')).toEqual(['$']);
    expect(supportedCharacters('comic-sans')).toEqual(supportedCharacters(BUILTIN_FONT_ID));
  });

  it('does not resolve a font id to something on Object.prototype', () => {
    expect(resolveFont('constructor').unknownId).toBe('constructor');
    expect(resolveFont('__proto__').face).toBe(FONT_FACES[0]);
  });

  it('reports missing characters per face', () => {
    // The Hershey set draws '$', '~' and '{'; the built-in face does not.
    expect(missingGlyphs('$5 {x}~', BUILTIN_FONT_ID)).toEqual(['$', '{', '}', '~']);
    expect(missingGlyphs('$5 {x}~', 'hershey-simplex')).toEqual([]);
    // '^' is left out of the Hershey face (its ASCII slot is a doubled arrow),
    // so it must be named, not quietly drawn as something else.
    expect(missingGlyphs('x^2', 'hershey-simplex')).toEqual(['^']);
    const skipped = bounds(textPolylines(text({ text: 'H^H', font: 'hershey-simplex' })));
    const without = bounds(textPolylines(text({ text: 'HH', font: 'hershey-simplex' })));
    expect(skipped.width).toBeCloseTo(without.width, 6);
  });

  it('carries the Hershey acknowledgement with the Hershey face', () => {
    // The notice requires it to be distributed with the font data; the app
    // shows it, which is what keeps it in the shipped bundle.
    const hershey = resolveFont('hershey-simplex').face;
    expect(hershey.credit?.full).toContain(
      'The Hershey Fonts were originally created by Dr. A. V. Hershey while working at the U. S. National Bureau of Standards.',
    );
    expect(hershey.credit?.full).toContain('originally created by James Hurt, Cognition, Inc.');
  });

  it('never looks a character up on Object.prototype', () => {
    expect(missingGlyphs('constructor')).toEqual([]);
    expect(glyphStrokes(FONT_FACES[0], 'toString')).toEqual([]);
  });

  it('draws the same text differently in each face, at the same cap height', () => {
    const builtin = textPolylines(text({ text: 'Hello', sizeMm: 10, font: BUILTIN_FONT_ID }));
    const hershey = textPolylines(text({ text: 'Hello', sizeMm: 10, font: 'hershey-simplex' }));
    expect(hershey).not.toEqual(builtin);
    // 'H' and 'l' set the height of 'Hello' (no descenders): within a
    // millimetre of the caps either way, since 'l' rises slightly above them.
    expect(bounds(builtin).height).toBeCloseTo(10, 0);
    expect(Math.abs(bounds(hershey).height - 10)).toBeLessThan(1.5);
  });

  it('keeps line spacing a multiple of the cap height in every face', () => {
    for (const face of FONT_FACES) {
      const b = bounds(textPolylines(text({ text: 'H\nH', sizeMm: 10, font: face.id })));
      expect(b.height, face.id).toBeCloseTo(26, 6);
    }
  });
});

describe('textPolylines', () => {
  it('scales cap height to the requested size in mm', () => {
    // 'H' is a plain cap: its height is the cap height, exactly.
    const b = bounds(textPolylines(text({ text: 'H', sizeMm: 20 })));
    expect(b.height).toBeCloseTo(20, 6);
  });

  it('starts at the origin, like an imported artwork', () => {
    const b = bounds(textPolylines(text({ text: 'Hello', sizeMm: 12 })));
    expect(b.minX).toBeCloseTo(0, 6);
    expect(b.minY).toBeCloseTo(0, 6);
  });

  it('runs y downward, so the first line is above the second', () => {
    const two = textPolylines(text({ text: 'H\nH', sizeMm: 10 }));
    const b = bounds(two);
    // Two lines at 1.6 line spacing: 10 mm of caps + 16 mm of baseline step.
    expect(b.height).toBeCloseTo(26, 6);
  });

  it('advances letters left to right without overlap', () => {
    const one = bounds(textPolylines(text({ text: 'H', sizeMm: 10 })));
    const two = bounds(textPolylines(text({ text: 'HH', sizeMm: 10 })));
    expect(two.width).toBeGreaterThan(one.width * 1.8);
  });

  it('applies letter spacing', () => {
    const tight = bounds(textPolylines(text({ text: 'HH', sizeMm: 10, letterSpacingMm: 0 })));
    const loose = bounds(textPolylines(text({ text: 'HH', sizeMm: 10, letterSpacingMm: 5 })));
    expect(loose.width - tight.width).toBeCloseTo(5, 6);
  });

  it('skips characters it has no glyph for rather than drawing a placeholder', () => {
    // A placeholder box would put marks on the paper the operator never asked
    // for and cannot undo once drawn.
    expect(missingGlyphs('Héllo ☃')).toEqual(['é', '☃']);
    const skipped = bounds(textPolylines(text({ text: 'H☃H', sizeMm: 10 })));
    const without = bounds(textPolylines(text({ text: 'HH', sizeMm: 10 })));
    expect(skipped.width).toBeCloseTo(without.width, 6);
  });

  it('returns nothing for text with nothing drawable in it', () => {
    expect(textPolylines(text({ text: '' }))).toEqual([]);
    expect(textPolylines(text({ text: '   ' }))).toEqual([]);
    expect(textPolylines(text({ text: '☃☃' }))).toEqual([]);
  });

  it('falls back to a sane line spacing if given a useless one', () => {
    const a = bounds(textPolylines(text({ text: 'H\nH', sizeMm: 10, lineSpacing: 0 })));
    const b = bounds(textPolylines(text({ text: 'H\nH', sizeMm: 10, lineSpacing: 1.6 })));
    expect(a.height).toBeCloseTo(b.height, 6);
  });

  it('reports no missing glyphs for a newline', () => {
    expect(missingGlyphs('a\nb')).toEqual([]);
  });
});
