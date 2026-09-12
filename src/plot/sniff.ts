/**
 * What kind of file is this, really?
 *
 * By content, not by extension: operators rename files, phones hand over
 * `image.jpg` that is actually HEIC, and a cut file exported from Illustrator
 * may arrive with no extension at all. Getting this wrong is not a crash — it
 * is a silent empty artwork, which is worse.
 *
 * Pure, so every format's signature is pinned by a test rather than discovered
 * on a machine with a sheet of vinyl in it.
 */

export type FileKind =
  /** Vector: paths at a real size. Imported directly. */
  | 'svg'
  /** Vector or scan; decided per page after loading. */
  | 'pdf'
  /** Anything the browser can decode as an image. Goes to the import wizard. */
  | 'raster'
  /**
   * HEIC/HEIF. Raster in principle, but most browsers cannot decode it, so it
   * is worth naming: "convert it on your phone" is a useful message, and
   * "could not read that image" is not.
   */
  | 'heic'
  | 'unknown';

/** How many leading bytes `sniffKind` needs. */
export const SNIFF_BYTES = 64;

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0): boolean =>
  sig.every((b, i) => bytes[offset + i] === b);

const ascii = (bytes: Uint8Array, from: number, to: number): string =>
  String.fromCharCode(...Array.from(bytes.slice(from, to)));

/**
 * Identify a file from its first bytes. `mimeType` is a hint used only where
 * the bytes are ambiguous — the browser's guess is often just the extension in
 * disguise.
 */
export function sniffKind(bytes: Uint8Array, mimeType = ''): FileKind {
  if (bytes.length === 0) return 'unknown';

  // PDF: "%PDF-", occasionally after a few junk bytes some producers prepend.
  const head = ascii(bytes, 0, Math.min(bytes.length, SNIFF_BYTES));
  if (head.includes('%PDF-')) return 'pdf';

  // ISO-BMFF family: the box type at offset 4 says which. HEIC and friends
  // share the container with MP4, so the brand is what distinguishes them.
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = ascii(bytes, 8, 12).toLowerCase();
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'mif1', 'msf1'].includes(brand)) {
      return 'heic';
    }
  }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'raster'; // PNG
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'raster'; // JPEG
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'raster'; // GIF
  if (startsWith(bytes, [0x42, 0x4d])) return 'raster'; // BMP
  // WebP is a RIFF container whose form type is "WEBP".
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && ascii(bytes, 8, 12) === 'WEBP') {
    return 'raster';
  }

  // SVG is text, and its root element may follow a BOM, an XML declaration, a
  // doctype or comments — so look for the tag anywhere in the head.
  const text = head.replace(/^﻿/, '').trimStart();
  if (/<svg[\s>]/i.test(text) || (/^<\?xml/i.test(text) && /svg/i.test(text))) return 'svg';
  // A long XML prologue can push `<svg` past the sniffed window; the MIME type
  // is a reasonable tiebreak once the bytes say "this is XML".
  if (/^<\?xml/i.test(text) && /svg/i.test(mimeType)) return 'svg';

  if (/^image\//i.test(mimeType)) return 'raster';
  return 'unknown';
}

/** Read just enough of a file to identify it. */
export async function sniffFile(file: Blob & { type?: string }): Promise<FileKind> {
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  return sniffKind(head, file.type ?? '');
}
