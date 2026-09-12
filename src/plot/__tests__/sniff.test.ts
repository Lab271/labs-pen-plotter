import { describe, expect, it } from 'vitest';
import { sniffKind } from '../sniff';

const bytes = (...vals: Array<number | string>): Uint8Array => {
  const out: number[] = [];
  for (const v of vals) {
    if (typeof v === 'number') out.push(v);
    else for (const ch of v) out.push(ch.charCodeAt(0));
  }
  return Uint8Array.from(out);
};
/** An ISO-BMFF header with the given brand, as HEIC and MP4 both use. */
const isoBmff = (brand: string) => bytes(0, 0, 0, 0x18, 'ftyp', brand, 0, 0, 0, 0);

describe('sniffKind', () => {
  it('identifies a PDF by its header', () => {
    expect(sniffKind(bytes('%PDF-1.7\n%âãÏÓ'))).toBe('pdf');
  });

  it('finds a PDF header a producer prepended junk to', () => {
    expect(sniffKind(bytes('\n\n   %PDF-1.4'))).toBe('pdf');
  });

  it('identifies raster formats by signature', () => {
    expect(sniffKind(bytes(0x89, 'PNG', 0x0d, 0x0a))).toBe('raster');
    expect(sniffKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('raster');
    expect(sniffKind(bytes('GIF89a'))).toBe('raster');
    expect(sniffKind(bytes('BM', 0, 0))).toBe('raster');
    expect(sniffKind(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))).toBe('raster');
  });

  it('tells HEIC apart from other ISO-BMFF files', () => {
    // Worth naming separately: most browsers cannot decode it, and "convert it
    // on your phone" is a useful message where "unreadable image" is not.
    for (const brand of ['heic', 'heix', 'mif1']) {
      expect(sniffKind(isoBmff(brand))).toBe('heic');
    }
    // An MP4 shares the container but is not an image at all.
    expect(sniffKind(isoBmff('isom'))).toBe('unknown');
  });

  it('identifies SVG however it starts', () => {
    expect(sniffKind(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBe('svg');
    expect(sniffKind(bytes('<?xml version="1.0"?><svg>'))).toBe('svg');
    expect(sniffKind(bytes('\n  <svg>'))).toBe('svg');
    expect(sniffKind(bytes('﻿<svg>'))).toBe('svg');
  });

  it('uses the MIME type only where the bytes are ambiguous', () => {
    // A long XML prologue can push the root element past the sniffed window.
    const longPrologue = bytes('<?xml version="1.0" encoding="UTF-8" standalone="no"?><!DOCTYPE');
    expect(sniffKind(longPrologue, 'image/svg+xml')).toBe('svg');
    // …but a declared MIME type never overrides a signature that disagrees.
    expect(sniffKind(bytes(0x89, 'PNG'), 'image/svg+xml')).toBe('raster');
  });

  it('falls back to the MIME type for an image it has no signature for', () => {
    expect(sniffKind(bytes(0x00, 0x01, 0x02, 0x03), 'image/avif')).toBe('raster');
  });

  it('returns unknown for an empty or unrecognisable file', () => {
    // The import must say so, rather than adding a silent empty artwork.
    expect(sniffKind(new Uint8Array(0))).toBe('unknown');
    expect(sniffKind(bytes('this is a text file'))).toBe('unknown');
    expect(sniffKind(bytes(0x50, 0x4b, 0x03, 0x04))).toBe('unknown'); // a zip
  });
});
