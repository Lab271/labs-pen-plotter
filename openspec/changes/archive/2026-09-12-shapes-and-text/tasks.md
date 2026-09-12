## 1. Geometry

- [x] 1.1 `src/plot/shapes.ts`: line, rect, ellipse, polygon; closed contours; clamped sizes
- [x] 1.2 Unit tests: box filled exactly, contours closed, polygon vertex count and point-up
      orientation, sides clamped to ≥ 3, no degenerate geometry from a zero/negative size

## 2. Font

- [x] 2.1 `src/plot/font.ts`: glyph table (A–Z, a–z, 0–9, punctuation), `textPolylines`,
      `missingGlyphs`, `supportedCharacters`
- [x] 2.2 Unit tests: every glyph draws as open strokes within its metrics, cap height equals the
      requested size, origin-normalised, y runs down, letter/line spacing, unsupported characters
      skipped and reported, empty/undrawable text yields nothing

## 3. Objects

- [x] 3.1 `spec` on the object and in the session; regeneration on edit; geometry kept when an edit
      leaves nothing drawable
- [x] 3.2 Create buttons in the Artwork panel, cascaded placement at real size
- [x] 3.3 Spec editor in the drawing-controls panel, including the missing-glyph note

## 4. Docs, gate, verification

- [x] 4.1 README, CHANGELOG
- [x] 4.2 `mise run ci` green
- [x] 4.3 Verified in the browser: the full character set renders legibly at 20 and 60 mm, all four
      shapes appear at their real size and cascade, editing text regenerates the geometry live, and
      the objects join the scene (selection, toolbar, plot)
