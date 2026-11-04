## Why

Issue #5 promised that the operator can set a text object's content, **font** and size. Content and
size work; there is exactly one face (the hand-drawn one in `src/plot/font.ts`) and nothing to
choose. Triage decided to add at least one more single-line face rather than amend the criterion.

## What Changes

- A second single-line face, **Hershey Simplex** (Hershey's Roman Simplex set, glyphs 501–626 plus
  the punctuation the ASCII table borrows), converted into the existing stroke format and committed
  as generated data.
- Metrics become **per face**: each face carries its own cap height, so a size of N mm gives N mm
  capitals in every face. The module-wide `CAP_UNITS` goes away.
- The glyph coverage check becomes per face: the editor names the characters *the chosen face*
  cannot draw.
- A **font picker** in the text object's panel. The choice is stored with the object's spec, so it
  persists with the session and in saved projects.
- Text saved before this has no font and keeps the built-in face. An unknown font id (a project
  from a newer build, say) keeps its saved strokes, is redrawn in the built-in face on the next
  edit, and the editor says so.
- A `NOTICE` file carrying the Hershey fonts' required acknowledgement, which is also kept in the
  built JavaScript next to the glyph data.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `shapes-and-text`: text gains a choice of single-line face; cap height holds in every face; the
  missing-character report is per face; old and unknown font ids fall back to the built-in face.

## Impact

- **Code:** `src/plot/font.ts` (faces, per-face metrics and coverage), new generated
  `src/plot/fontHersheySimplex.ts`, tests in `src/plot/__tests__/font.test.ts`; `src/ui/App.tsx`
  (`SpecEditor` picker and notice). `TextSpec` gains an optional `font`; `sessionStore.ts` and
  projects persist it unchanged, as part of the spec.
- **Compatibility:** additive. Old sessions and projects load as before. A project saved with the
  new face and opened in an older build draws in the built-in face (the old build ignores `font`).
- **Licensing:** new root `NOTICE` (Apache-2.0 convention) with the Hershey acknowledgement.
- No G-code, gateway or protocol change.
