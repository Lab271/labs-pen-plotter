/*!
 * Hershey Simplex — glyph data converted from the Hershey Fonts.
 *
 * Source: hershey-fonts/rowmans.jhf (Roman Simplex, Hershey glyph numbering)
 * from Kamal Mostafa's hershey-fonts distribution,
 * https://github.com/kamalmostafa/hershey-fonts at commit
 * 1356bf2f83d380fcef68c887e88675eb9d445d86 (sha256 of the file:
 * 8718fb129c0f6bce89c84fe41bc467e39534d215a6f7c3220cc5789a8a7d8618).
 * See NOTICE. The notice that accompanies the font data, verbatim:
 *
 * USE RESTRICTION:
 *     This distribution of the Hershey Fonts may be used by anyone for
 *     any purpose, commercial or otherwise, providing that:
 *         1. The following acknowledgements must be distributed with
 *             the font data:
 *             - The Hershey Fonts were originally created by Dr.
 *                 A. V. Hershey while working at the U. S.
 *                 National Bureau of Standards.
 *             - The format of the Font data in this distribution
 *                 was originally created by
 *                     James Hurt
 *                     Cognition, Inc.
 *                     900 Technology Park Drive
 *                     Billerica, MA 01821
 *                     (mit-eddie!ci-dandelion!hurt)
 *         2. The font data in this distribution may be converted into
 *             any other format *EXCEPT* the format distributed by
 *             the U.S. NTIS (which organization holds the rights
 *             to the distribution and use of the font data in that
 *             particular format). Not that anybody would really
 *             *want* to use their format... each point is described
 *             in eight bytes as "xxx yyy:", where xxx and yyy are
 *             the coordinate values as ASCII numbers.
 */
/**
 * GENERATED — do not edit by hand; redo the conversion instead.
 *
 * Conversion, from each `.jhf` line (ASCII 32–126 in order; 127 skipped):
 *
 * - Coordinates are letters offset from `R`. Hershey's y runs **down** with the
 *   baseline at +9 and cap top at −12; x is relative to the glyph's centre, with
 *   the left and right bearing given as the line's first pair. Converted to the
 *   frame `font.ts` uses: `x' = x − left`, `y' = 9 − y` — y up, baseline 0, the
 *   pen starting at the left bearing. Cap height is therefore 21 units, and the
 *   advance width is `right − left` (Hershey's widths include side bearings).
 * - ` R` (pen up) becomes `M`. Values are integers, as in the source.
 * - The ASCII table fills characters the Simplex alphabet lacks with glyphs
 *   from Hershey's 2000-series symbols, and some of those trace a stroke twice,
 *   which a pen plots as a doubled line. Fixed here, glyph by glyph:
 *   `@` (2273) drops strokes 2 and 4, which re-trace the bowl and the stem;
 *   `[` (2223) and `]` (2224) drop the inner of two parallel uprights;
 *   `~` (2246) drops the second of two parallel waves; `{` (2225) and `}` (2226)
 *   keep the two outer halves and join them through the point into one stroke,
 *   dropping the full-length inner stroke beside them. `^` (2262) is omitted: it
 *   is an up-arrow with a doubled head, not a caret, so the editor names it as
 *   missing rather than drawing something nobody typed.
 *
 * Each entry's comment is its Hershey glyph number.
 */
import type { Glyph } from './font';

/**
 * The acknowledgements the notice requires to be "distributed with the font
 * data", verbatim. A runtime string the app displays, not just the comment
 * above, because the bundler strips comments and the `.deb` ships the bundle,
 * not this file — used, so tree-shaking cannot drop it either.
 */
export const HERSHEY_ACKNOWLEDGEMENT = [
  'The Hershey Fonts were originally created by Dr. A. V. Hershey while working at the U. S. National Bureau of Standards.',
  'The format of the Font data in this distribution was originally created by James Hurt, Cognition, Inc., 900 Technology Park Drive, Billerica, MA 01821 (mit-eddie!ci-dandelion!hurt).',
].join('\n');

export const HERSHEY_SIMPLEX_GLYPHS: Record<string, Glyph> = {
  ' ': { width: 16, d: '' }, // 699
  '!': { width: 10, d: '5,21 5,7 M 5,2 4,1 5,0 6,1 5,2' }, // 714
  '"': { width: 16, d: '4,21 4,14 M 12,21 12,14' }, // 717
  '#': { width: 21, d: '11,25 4,-7 M 17,25 10,-7 M 4,12 18,12 M 3,6 17,6' }, // 733
  $: {
    width: 20,
    d: '8,25 8,-4 M 12,25 12,-4 M 17,18 15,20 12,21 8,21 5,20 3,18 3,16 4,14 5,13 7,12 13,10 15,9 16,8 17,6 17,3 15,1 12,0 8,0 5,1 3,3',
  }, // 719
  '%': {
    width: 24,
    d: '21,21 3,0 M 8,21 10,19 10,17 9,15 7,14 5,14 3,16 3,18 4,20 6,21 8,21 10,20 13,19 16,19 19,20 21,21 M 17,7 15,6 14,4 14,2 16,0 18,0 20,1 21,3 21,5 19,7 17,7',
  }, // 2271
  '&': {
    width: 26,
    d: '23,12 23,13 22,14 21,14 20,13 19,11 17,6 15,3 13,1 11,0 7,0 5,1 4,2 3,4 3,6 4,8 5,9 12,13 13,14 14,16 14,18 13,20 11,21 9,20 8,18 8,16 9,13 11,10 16,3 18,1 20,0 22,0 23,1 23,2',
  }, // 734
  "'": { width: 10, d: '5,19 4,20 5,21 6,20 6,18 5,16 4,15' }, // 731
  '(': { width: 14, d: '11,25 9,23 7,20 5,16 4,11 4,7 5,2 7,-2 9,-5 11,-7' }, // 721
  ')': { width: 14, d: '3,25 5,23 7,20 9,16 10,11 10,7 9,2 7,-2 5,-5 3,-7' }, // 722
  '*': { width: 16, d: '8,21 8,9 M 3,18 13,12 M 13,18 3,12' }, // 2219
  '+': { width: 26, d: '13,18 13,0 M 4,9 22,9' }, // 725
  ',': { width: 10, d: '6,1 5,0 4,1 5,2 6,1 6,-1 5,-3 4,-4' }, // 711
  '-': { width: 26, d: '4,9 22,9' }, // 724
  '.': { width: 10, d: '5,2 4,1 5,0 6,1 5,2' }, // 710
  '/': { width: 22, d: '20,25 2,-7' }, // 720
  '0': {
    width: 20,
    d: '9,21 6,20 4,17 3,12 3,9 4,4 6,1 9,0 11,0 14,1 16,4 17,9 17,12 16,17 14,20 11,21 9,21',
  }, // 700
  '1': { width: 20, d: '6,17 8,18 11,21 11,0' }, // 701
  '2': {
    width: 20,
    d: '4,16 4,17 5,19 6,20 8,21 12,21 14,20 15,19 16,17 16,15 15,13 13,10 3,0 17,0',
  }, // 702
  '3': {
    width: 20,
    d: '5,21 16,21 10,13 13,13 15,12 16,11 17,8 17,6 16,3 14,1 11,0 8,0 5,1 4,2 3,4',
  }, // 703
  '4': { width: 20, d: '13,21 3,7 18,7 M 13,21 13,0' }, // 704
  '5': {
    width: 20,
    d: '15,21 5,21 4,12 5,13 8,14 11,14 14,13 16,11 17,8 17,6 16,3 14,1 11,0 8,0 5,1 4,2 3,4',
  }, // 705
  '6': {
    width: 20,
    d: '16,18 15,20 12,21 10,21 7,20 5,17 4,12 4,7 5,3 7,1 10,0 11,0 14,1 16,3 17,6 17,7 16,10 14,12 11,13 10,13 7,12 5,10 4,7',
  }, // 706
  '7': { width: 20, d: '17,21 7,0 M 3,21 17,21' }, // 707
  '8': {
    width: 20,
    d: '8,21 5,20 4,18 4,16 5,14 7,13 11,12 14,11 16,9 17,7 17,4 16,2 15,1 12,0 8,0 5,1 4,2 3,4 3,7 4,9 6,11 9,12 13,13 15,14 16,16 16,18 15,20 12,21 8,21',
  }, // 708
  '9': {
    width: 20,
    d: '16,14 15,11 13,9 10,8 9,8 6,9 4,11 3,14 3,15 4,18 6,20 9,21 10,21 13,20 15,18 16,14 16,9 15,4 13,1 10,0 8,0 5,1 4,3',
  }, // 709
  ':': { width: 10, d: '5,14 4,13 5,12 6,13 5,14 M 5,2 4,1 5,0 6,1 5,2' }, // 712
  ';': { width: 10, d: '5,14 4,13 5,12 6,13 5,14 M 6,1 5,0 4,1 5,2 6,1 6,-1 5,-3 4,-4' }, // 713
  '<': { width: 24, d: '20,18 4,9 20,0' }, // 2241
  '=': { width: 26, d: '4,12 22,12 M 4,6 22,6' }, // 726
  '>': { width: 24, d: '4,18 20,9 4,0' }, // 2242
  '?': {
    width: 18,
    d: '3,16 3,17 4,19 5,20 7,21 11,21 13,20 14,19 15,17 15,15 14,13 13,12 9,10 9,7 M 9,2 8,1 9,0 10,1 9,2',
  }, // 715
  '@': {
    width: 27,
    d: '18,13 17,15 15,16 12,16 10,15 9,14 8,11 8,8 9,6 11,5 14,5 16,6 17,8 M 18,16 17,8 17,6 19,5 21,5 23,7 24,10 24,12 23,15 22,17 20,19 18,20 15,21 12,21 9,20 7,19 5,17 4,15 3,12 3,9 4,6 5,4 7,2 9,1 12,0 15,0 18,1 20,2 21,3',
  }, // 2273
  A: { width: 18, d: '9,21 1,0 M 9,21 17,0 M 4,7 14,7' }, // 501
  B: {
    width: 21,
    d: '4,21 4,0 M 4,21 13,21 16,20 17,19 18,17 18,15 17,13 16,12 13,11 M 4,11 13,11 16,10 17,9 18,7 18,4 17,2 16,1 13,0 4,0',
  }, // 502
  C: {
    width: 21,
    d: '18,16 17,18 15,20 13,21 9,21 7,20 5,18 4,16 3,13 3,8 4,5 5,3 7,1 9,0 13,0 15,1 17,3 18,5',
  }, // 503
  D: { width: 21, d: '4,21 4,0 M 4,21 11,21 14,20 16,18 17,16 18,13 18,8 17,5 16,3 14,1 11,0 4,0' }, // 504
  E: { width: 19, d: '4,21 4,0 M 4,21 17,21 M 4,11 12,11 M 4,0 17,0' }, // 505
  F: { width: 18, d: '4,21 4,0 M 4,21 17,21 M 4,11 12,11' }, // 506
  G: {
    width: 21,
    d: '18,16 17,18 15,20 13,21 9,21 7,20 5,18 4,16 3,13 3,8 4,5 5,3 7,1 9,0 13,0 15,1 17,3 18,5 18,8 M 13,8 18,8',
  }, // 507
  H: { width: 22, d: '4,21 4,0 M 18,21 18,0 M 4,11 18,11' }, // 508
  I: { width: 8, d: '4,21 4,0' }, // 509
  J: { width: 16, d: '12,21 12,5 11,2 10,1 8,0 6,0 4,1 3,2 2,5 2,7' }, // 510
  K: { width: 21, d: '4,21 4,0 M 18,21 4,7 M 9,12 18,0' }, // 511
  L: { width: 17, d: '4,21 4,0 M 4,0 16,0' }, // 512
  M: { width: 24, d: '4,21 4,0 M 4,21 12,0 M 20,21 12,0 M 20,21 20,0' }, // 513
  N: { width: 22, d: '4,21 4,0 M 4,21 18,0 M 18,21 18,0' }, // 514
  O: {
    width: 22,
    d: '9,21 7,20 5,18 4,16 3,13 3,8 4,5 5,3 7,1 9,0 13,0 15,1 17,3 18,5 19,8 19,13 18,16 17,18 15,20 13,21 9,21',
  }, // 515
  P: { width: 21, d: '4,21 4,0 M 4,21 13,21 16,20 17,19 18,17 18,14 17,12 16,11 13,10 4,10' }, // 516
  Q: {
    width: 22,
    d: '9,21 7,20 5,18 4,16 3,13 3,8 4,5 5,3 7,1 9,0 13,0 15,1 17,3 18,5 19,8 19,13 18,16 17,18 15,20 13,21 9,21 M 12,4 18,-2',
  }, // 517
  R: {
    width: 21,
    d: '4,21 4,0 M 4,21 13,21 16,20 17,19 18,17 18,15 17,13 16,12 13,11 4,11 M 11,11 18,0',
  }, // 518
  S: {
    width: 20,
    d: '17,18 15,20 12,21 8,21 5,20 3,18 3,16 4,14 5,13 7,12 13,10 15,9 16,8 17,6 17,3 15,1 12,0 8,0 5,1 3,3',
  }, // 519
  T: { width: 16, d: '8,21 8,0 M 1,21 15,21' }, // 520
  U: { width: 22, d: '4,21 4,6 5,3 7,1 10,0 12,0 15,1 17,3 18,6 18,21' }, // 521
  V: { width: 18, d: '1,21 9,0 M 17,21 9,0' }, // 522
  W: { width: 24, d: '2,21 7,0 M 12,21 7,0 M 12,21 17,0 M 22,21 17,0' }, // 523
  X: { width: 20, d: '3,21 17,0 M 17,21 3,0' }, // 524
  Y: { width: 18, d: '1,21 9,11 9,0 M 17,21 9,11' }, // 525
  Z: { width: 20, d: '17,21 3,0 M 3,21 17,21 M 3,0 17,0' }, // 526
  '[': { width: 14, d: '4,25 4,-7 M 4,25 11,25 M 4,-7 11,-7' }, // 2223
  '\\': { width: 14, d: '0,21 14,-3' }, // 804
  ']': { width: 14, d: '10,25 10,-7 M 3,25 10,25 M 3,-7 10,-7' }, // 2224
  _: { width: 16, d: '0,-2 16,-2' }, // 999
  '`': { width: 10, d: '6,21 5,20 4,18 4,16 5,15 6,16 5,17' }, // 730
  a: {
    width: 19,
    d: '15,14 15,0 M 15,11 13,13 11,14 8,14 6,13 4,11 3,8 3,6 4,3 6,1 8,0 11,0 13,1 15,3',
  }, // 601
  b: {
    width: 19,
    d: '4,21 4,0 M 4,11 6,13 8,14 11,14 13,13 15,11 16,8 16,6 15,3 13,1 11,0 8,0 6,1 4,3',
  }, // 602
  c: { width: 18, d: '15,11 13,13 11,14 8,14 6,13 4,11 3,8 3,6 4,3 6,1 8,0 11,0 13,1 15,3' }, // 603
  d: {
    width: 19,
    d: '15,21 15,0 M 15,11 13,13 11,14 8,14 6,13 4,11 3,8 3,6 4,3 6,1 8,0 11,0 13,1 15,3',
  }, // 604
  e: {
    width: 18,
    d: '3,8 15,8 15,10 14,12 13,13 11,14 8,14 6,13 4,11 3,8 3,6 4,3 6,1 8,0 11,0 13,1 15,3',
  }, // 605
  f: { width: 12, d: '10,21 8,21 6,20 5,17 5,0 M 2,14 9,14' }, // 606
  g: {
    width: 19,
    d: '15,14 15,-2 14,-5 13,-6 11,-7 8,-7 6,-6 M 15,11 13,13 11,14 8,14 6,13 4,11 3,8 3,6 4,3 6,1 8,0 11,0 13,1 15,3',
  }, // 607
  h: { width: 19, d: '4,21 4,0 M 4,10 7,13 9,14 12,14 14,13 15,10 15,0' }, // 608
  i: { width: 8, d: '3,21 4,20 5,21 4,22 3,21 M 4,14 4,0' }, // 609
  j: { width: 10, d: '5,21 6,20 7,21 6,22 5,21 M 6,14 6,-3 5,-6 3,-7 1,-7' }, // 610
  k: { width: 17, d: '4,21 4,0 M 14,14 4,4 M 8,8 15,0' }, // 611
  l: { width: 8, d: '4,21 4,0' }, // 612
  m: {
    width: 30,
    d: '4,14 4,0 M 4,10 7,13 9,14 12,14 14,13 15,10 15,0 M 15,10 18,13 20,14 23,14 25,13 26,10 26,0',
  }, // 613
  n: { width: 19, d: '4,14 4,0 M 4,10 7,13 9,14 12,14 14,13 15,10 15,0' }, // 614
  o: {
    width: 19,
    d: '8,14 6,13 4,11 3,8 3,6 4,3 6,1 8,0 11,0 13,1 15,3 16,6 16,8 15,11 13,13 11,14 8,14',
  }, // 615
  p: {
    width: 19,
    d: '4,14 4,-7 M 4,11 6,13 8,14 11,14 13,13 15,11 16,8 16,6 15,3 13,1 11,0 8,0 6,1 4,3',
  }, // 616
  q: {
    width: 19,
    d: '15,14 15,-7 M 15,11 13,13 11,14 8,14 6,13 4,11 3,8 3,6 4,3 6,1 8,0 11,0 13,1 15,3',
  }, // 617
  r: { width: 13, d: '4,14 4,0 M 4,8 5,11 7,13 9,14 12,14' }, // 618
  s: {
    width: 17,
    d: '14,11 13,13 10,14 7,14 4,13 3,11 4,9 6,8 11,7 13,6 14,4 14,3 13,1 10,0 7,0 4,1 3,3',
  }, // 619
  t: { width: 12, d: '5,21 5,4 6,1 8,0 10,0 M 2,14 9,14' }, // 620
  u: { width: 19, d: '4,14 4,4 5,1 7,0 10,0 12,1 15,4 M 15,14 15,0' }, // 621
  v: { width: 16, d: '2,14 8,0 M 14,14 8,0' }, // 622
  w: { width: 22, d: '3,14 7,0 M 11,14 7,0 M 11,14 15,0 M 19,14 15,0' }, // 623
  x: { width: 17, d: '3,14 14,0 M 14,14 3,0' }, // 624
  y: { width: 16, d: '2,14 8,0 M 14,14 8,0 6,-4 4,-6 2,-7 1,-7' }, // 625
  z: { width: 17, d: '14,14 3,0 M 3,14 14,14 M 3,0 14,0' }, // 626
  '{': {
    width: 14,
    d: '9,25 7,24 6,23 5,21 5,19 6,17 7,16 8,14 8,12 6,10 4,9 6,8 8,6 8,4 7,2 6,1 5,-1 5,-3 6,-5 7,-6 9,-7',
  }, // 2225
  '|': { width: 8, d: '4,25 4,-7' }, // 723
  '}': {
    width: 14,
    d: '5,25 7,24 8,23 9,21 9,19 8,17 7,16 6,14 6,12 8,10 10,9 8,8 6,6 6,4 7,2 8,1 9,-1 9,-3 8,-5 7,-6 5,-7',
  }, // 2226
  '~': { width: 24, d: '3,6 3,8 4,11 6,12 8,12 10,11 14,8 16,7 18,7 20,8 21,10' }, // 2246
};
