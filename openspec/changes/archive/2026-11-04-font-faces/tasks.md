## 1. Faces and metrics

- [x] 1.1 Convert Hershey Roman Simplex (`rowmans.jhf`) into `src/plot/fontHersheySimplex.ts`, with
      the conversion and the source's notice in its header; verify every glyph draws as single
      strokes in a preview sheet
- [x] 1.2 `src/plot/font.ts`: faces with their own cap height and glyphs, `resolveFont`, per-face
      `supportedCharacters` / `missingGlyphs`, optional `TextSpec.font`; verify with unit tests: 10 mm
      gives 10 mm `H` in every face, ink stays within each glyph's advance, per-face missing glyphs,
      no `font` = built-in, unknown id falls back and reports it
- [x] 1.3 Root `NOTICE` with the Hershey acknowledgement quoted verbatim; verify the built
      `dist/` JavaScript still carries it

## 2. Editor

- [x] 2.1 Font picker in `SpecEditor`, the unknown-face note, and the missing-glyph note per face;
      verify with `mise run typecheck`

## 3. Docs, gate, verification

- [x] 3.1 README, CHANGELOG, `openspec/specs/shapes-and-text/spec.md`
- [x] 3.2 `mise run ci` green, coverage not below any floor
- [x] 3.3 Verified in the browser on a local gateway: switching faces, preview at small and large
      sizes (3, 12 and 60 mm), a reload keeps the face, an unsupported character is named per face,
      text with no `font` opens as Built-in, and an unknown id shows the note and redraws in the
      built-in face on edit
