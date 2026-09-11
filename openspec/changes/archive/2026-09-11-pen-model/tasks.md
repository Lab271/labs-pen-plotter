## 1. Model

- [x] 1.1 `src/plot/pen.ts`: `Pen`, `DEFAULT_PENS`, `resolvePen`, `normalizePen`, `normalizePens`
- [x] 1.2 Unit tests: id fallback, empty library, unusable width/colour, duplicate ids, positional
      ids, no aliasing of the defaults

## 2. Settings

- [x] 2.1 `AppSettings.pens`, normalised with the rest of the record; tests
- [x] 2.2 Pen library editor on the settings page (colour, name, width, add, remove; never empty)

## 3. Artwork + preview

- [x] 3.1 `penId` per artwork and a session-level current pen, both persisted
- [x] 3.2 Pen picker in the Artwork panel — the selected artwork's pen, or the next import's
- [x] 3.3 Canvas draws each artwork in its pen's colour at its width, floored at a hairline

## 4. Docs, gate, verification

- [x] 4.1 README bullet, CHANGELOG entry
- [x] 4.2 `mise run ci` green
- [x] 4.3 Verified in the browser: an imported SVG previews in the chosen pen, the assignment is
      written to the session, recolouring a pen in settings repaints the artwork, and the library
      edit is persisted
