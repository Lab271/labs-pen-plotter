## Context

`src/plot/font.ts` holds one hand-drawn face: a glyph table in a human-editable string format
(`x,y` points, `M` starts a stroke, y up, baseline 0) and one module-wide `CAP_UNITS = 7`. The
object's `TextSpec` is persisted verbatim as `spec` in the session and in projects, so anything
added to it is persisted without touching either store.

## Goals / Non-Goals

**Goals:** a second face in the same stroke format; metrics and coverage owned by the face; a
picker; old data unchanged.

**Non-Goals:** outline or system fonts; kerning; non-ASCII Hershey sets (Greek, Cyrillic,
Gothic); a per-session "default face" for new text (new text starts in the built-in face).

## Decisions

- **Hershey Roman *Simplex* only.** `rowmans.jhf` (Kamal Mostafa's `hershey-fonts` distribution,
  Hershey glyph numbering, ASCII order). Duplex and triplex trace each stem two or three times,
  which is the doubled line `font.ts` exists to avoid. `futural.jhf` is the same glyphs with the
  glyph numbers stripped; `rowmans` keeps them, so each generated glyph can cite its source number.
- **The ASCII table borrows a few non-simplex glyphs, and those are fixed at conversion.** The
  Hershey Simplex alphabet has no braces, tilde, at-sign or caret, so the ASCII map fills them
  from the 2000-series symbols, several of which are drawn with doubled strokes. The converter
  drops the doubling strokes from `@`, `[`, `]` and `~`, joins the two halves of each brace into a
  single stroke through its point, and omits `^` (an arrow with a doubled head, not a caret), which
  the editor then names as missing. Alternative: drop every borrowed glyph — loses `@`, which turns
  up in labels, and the built-in face has it.
- **Converted once, committed as data.** The `.jhf` is not read at runtime and the converter is not
  in the repo; the generated file's header says exactly what it did, so it can be redone. Glyphs stay
  in the same string format as the built-in face: one parser, one renderer.
- **Coordinates converted into the built-in face's frame.** Hershey's y runs down with the baseline
  at +9 and its x is relative to the glyph centre; converted to y up, baseline 0, x from the left
  bearing. Its cap height is 21 units. That number lives on the face, and `textPolylines` scales by
  `sizeMm / face.capHeight` — so "10 mm" means 10 mm caps in either face, checked by a test that
  measures `H` in every face.
- **Hershey advance widths include side bearings;** the built-in face's do not. Each face keeps its
  own widths. The final origin normalisation already strips the first glyph's leading bearing.
- **`font` is an optional field on `TextSpec`.** Absent means built-in, so no migration. Unknown ids
  resolve to the built-in face, and `resolveFont` reports that it fell back; the editor shows that
  as a note and keeps the unknown id in the picker (marked unavailable) until the operator picks a
  face. The object's saved strokes are kept (objects load their stored geometry; nothing is
  regenerated on load), so the note says what is actually true: the drawing is as saved, and the
  next edit redraws it in the built-in face. Not rewriting the stored id means a project from a
  newer build renders in its intended face again once opened in a build that has it. Alternative: rewrite the id to `builtin` on load —
  silent, and loses the operator's choice.
- **Attribution travels with the data.** A root `NOTICE` (the Apache-2.0 place for third-party
  notices) quotes the source's notice verbatim, and so does the generated file's header. But the
  notice requires its acknowledgements to be distributed *with the font data*, the `.deb` ships the
  bundle rather than the repository, and the bundler strips comments (even `/*! */` ones, by
  default). So the acknowledgements are also a runtime string on the face, shown as a one-line
  credit under the picker with the full text on hover — used, so it is in the bundle.
  Alternative: turn on legal-comment preservation in the build — a build-wide change for every
  dependency, to keep one comment.

## Risks / Trade-offs

- [Hershey glyphs are polygonal at large sizes] → they are the original digitisation; at plotter
  sizes up to ~60 mm they read cleanly, and the built-in face stays the default.
- [A project saved in the new face, opened on an older build, draws in the built-in face without a
  note] → older builds ignore the field; that is the only option short of a format version bump,
  and the geometry is regenerated, not lost.
- [The generated table counts toward the coverage floor] → it is one object literal executed on
  import, so it adds covered lines rather than diluting them.
