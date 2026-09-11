import { describe, expect, it } from 'vitest';
import { DEFAULT_PENS, normalizePen, normalizePens, resolvePen } from '../pen';

describe('resolvePen', () => {
  it('finds a pen by id', () => {
    expect(resolvePen(DEFAULT_PENS, 'red-05').color).toBe('#dc2626');
  });

  it('falls back to the first pen for an unknown or missing id', () => {
    // A session can name a pen the operator has since deleted; drawing the
    // artwork in the wrong colour beats not drawing it.
    for (const id of [undefined, null, '', 'gone']) {
      expect(resolvePen(DEFAULT_PENS, id)).toBe(DEFAULT_PENS[0]);
    }
  });

  it('falls back to the built-in library when given an empty one', () => {
    expect(resolvePen([], 'anything')).toEqual(DEFAULT_PENS[0]);
  });
});

describe('normalizePen', () => {
  it('keeps a well-formed pen', () => {
    const p = normalizePen({ id: 'p1', name: 'Sepia 0.3', color: '#8b5a2b', widthMm: 0.3 }, 'x');
    expect(p).toEqual({ id: 'p1', name: 'Sepia 0.3', color: '#8b5a2b', widthMm: 0.3 });
  });

  it('substitutes the fallback id and uses it as the name when both are missing', () => {
    expect(normalizePen({ color: '#000', widthMm: 1 }, 'pen3')).toMatchObject({
      id: 'pen3',
      name: 'pen3',
    });
  });

  it('replaces a width that would break the preview', () => {
    // A NaN or zero stroke width renders nothing at all — the artwork would
    // simply vanish from the canvas.
    for (const widthMm of [NaN, 0, -1, Infinity, 'thick', undefined, 1e6]) {
      expect(normalizePen({ id: 'p', widthMm }, 'x')?.widthMm).toBe(0.5);
    }
  });

  it('rejects a colour that is not a hex value or a plain name', () => {
    for (const color of ['url(evil.png)', 'rgb(1,2,3); x', '', 42]) {
      expect(normalizePen({ id: 'p', color, widthMm: 1 }, 'x')?.color).toBe('#1e293b');
    }
    expect(normalizePen({ id: 'p', color: 'rebeccapurple', widthMm: 1 }, 'x')?.color).toBe(
      'rebeccapurple',
    );
  });

  it('returns null for something that is not an object', () => {
    for (const junk of [null, undefined, 'pen', 7, []]) {
      // An array is object-like but has no pen fields; only a record can be one.
      if (Array.isArray(junk)) expect(normalizePen(junk, 'x')).toMatchObject({ id: 'x' });
      else expect(normalizePen(junk, 'x')).toBeNull();
    }
  });
});

describe('normalizePens', () => {
  it('falls back to the defaults for junk or an empty library', () => {
    for (const junk of [undefined, null, 'pens', {}, [], [null, 3]]) {
      expect(normalizePens(junk)).toEqual(DEFAULT_PENS);
    }
  });

  it('does not alias the defaults', () => {
    const pens = normalizePens(undefined);
    pens[0].widthMm = 9;
    expect(DEFAULT_PENS[0].widthMm).toBe(0.5);
  });

  it('keeps the first of a duplicated id, since artwork points at ids', () => {
    const pens = normalizePens([
      { id: 'a', name: 'first', color: '#111', widthMm: 0.4 },
      { id: 'a', name: 'second', color: '#222', widthMm: 0.6 },
      { id: 'b', name: 'other', color: '#333', widthMm: 0.6 },
    ]);
    expect(pens.map((p) => p.id)).toEqual(['a', 'b']);
    expect(pens[0].name).toBe('first');
  });

  it('gives entries without an id a stable positional one', () => {
    const pens = normalizePens([
      { name: 'no id', color: '#111', widthMm: 0.4 },
      { name: 'also none', color: '#222', widthMm: 0.4 },
    ]);
    expect(pens.map((p) => p.id)).toEqual(['pen1', 'pen2']);
  });
});
