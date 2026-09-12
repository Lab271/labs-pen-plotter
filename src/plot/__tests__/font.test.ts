import { describe, expect, it } from 'vitest';
import { DEFAULT_TEXT, missingGlyphs, supportedCharacters, textPolylines } from '../font';
import { bounds } from '../place';

const text = (over: Partial<typeof DEFAULT_TEXT> = {}) => ({ ...DEFAULT_TEXT, ...over });

describe('the built-in stroke font', () => {
  it('covers the characters a plotted label needs', () => {
    const supported = supportedCharacters().join('');
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:;!?-') {
      expect(supported).toContain(ch);
    }
  });

  it('draws every glyph as open strokes, not closed outlines', () => {
    // The point of a single-line font: a letter is a skeleton the pen follows
    // once, not a contour it traces around (which plots as a hollow letter).
    for (const ch of supportedCharacters()) {
      if (ch === ' ') continue;
      const polys = textPolylines(text({ text: ch, sizeMm: 7 }));
      expect(polys.length).toBeGreaterThan(0);
      for (const p of polys) expect(p.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps every glyph inside its own metrics', () => {
    // A glyph that overshoots its advance width collides with the next letter.
    for (const ch of supportedCharacters()) {
      if (ch === ' ') continue;
      const polys = textPolylines(text({ text: ch, sizeMm: 7, letterSpacingMm: 0 }));
      const b = bounds(polys);
      // Cap height is the requested size; descenders and the box normalisation
      // mean the drawn height can exceed it, but not wildly.
      expect(b.height).toBeLessThanOrEqual(7 * 1.35);
      expect(b.width).toBeLessThanOrEqual(7 * 1.2);
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
