## 1. Identification

- [x] 1.1 `src/plot/sniff.ts`: PDF, SVG, raster signatures, HEIC by ISO-BMFF brand, MIME tiebreak
- [x] 1.2 Unit tests for each signature, HEIC vs MP4, SVG after a BOM/prologue, MIME never
      overriding a signature, and unknown files staying unknown

## 2. PDF

- [x] 2.1 `src/plot/pdf.ts`: pure operator-list decoder (paths, transforms, save/restore, curves),
      page size in mm, y-flip, text/image reporting, op-code assertion
- [x] 2.2 Unit tests: page size, flip, closed contour, cubic and quadratic curves, transform
      apply/restore/nesting, text counted, images reported, degenerate subpath dropped, unknown
      opcode stops the chunk, several subpaths, missing page box
- [x] 2.3 Lazy loader: vector geometry, raster rendering with print intent and a white background,
      worker as a Vite-fingerprinted URL

## 3. Import flow

- [x] 3.1 Route by sniffed kind; multi-page picker; vector page keeps its page offset
- [x] 3.2 HEIC message; unreadable files reported rather than silently empty
- [x] 3.3 Mobile-only "Take photo" with `capture`

## 4. Daemon

- [x] 4.1 Serve `.mjs`, `.wasm` and `.map` with correct content types

## 5. Docs, gate, verification

- [x] 5.1 README, CHANGELOG
- [x] 5.2 `mise run ci` green
- [x] 5.3 Verified in the browser against the packaged build: a vector PDF imports at its real size
      (88.2 × 211.7 mm) with the right page offset; a three-page PDF asks which page and imports
      page 2; a filled path imports as its outline; a page whose only content is an image opens the
      wizard; the camera input appears only at phone width
