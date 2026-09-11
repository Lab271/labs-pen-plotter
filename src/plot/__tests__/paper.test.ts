import { describe, expect, it } from 'vitest';
import { DEFAULT_PAPER_STYLE_ID, PAPER_SIZES, PAPER_STYLES, paperDims, paperStyle } from '../paper';

describe('paperDims', () => {
  it('puts the long edge on X in landscape and on Y in portrait', () => {
    const a4 = PAPER_SIZES[0];
    expect(paperDims(a4, 'landscape')).toEqual({ widthMm: 297, heightMm: 210 });
    expect(paperDims(a4, 'portrait')).toEqual({ widthMm: 210, heightMm: 297 });
  });
});

describe('paperStyle', () => {
  it('falls back to plain white for an unknown or missing id', () => {
    // A session saved with a style that a later build dropped must still open.
    for (const id of [undefined, null, '', 'no-such-paper']) {
      expect(paperStyle(id).id).toBe(DEFAULT_PAPER_STYLE_ID);
    }
  });

  it('returns the named style', () => {
    expect(paperStyle('dotted').pattern).toBe('dots');
    expect(paperStyle('black').dark).toBe(true);
  });

  it('has unique ids, so a persisted id resolves to one style', () => {
    const ids = PAPER_STYLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every patterned style a positive pitch', () => {
    // A zero or negative pitch would make the preview's pattern tile degenerate.
    for (const s of PAPER_STYLES) {
      if (s.pattern !== 'none') expect(s.spacingMm).toBeGreaterThan(0);
    }
  });
});
