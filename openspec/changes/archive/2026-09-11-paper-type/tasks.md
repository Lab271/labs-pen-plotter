## 1. Model

- [x] 1.1 `PaperStyle` + `PAPER_STYLES` + `paperStyle(id)` in `src/plot/paper.ts`
- [x] 1.2 Unit tests: unknown/missing id falls back, ids are unique, patterned styles have a
      positive pitch, and the existing `paperDims` behaviour is covered

## 2. Canvas

- [x] 2.1 Sheet fill from the style; patterned stock as one tiled fill (`makePatternTile`)
- [x] 2.2 Light artwork strokes and a readable size label on dark stock

## 3. UI + persistence

- [x] 3.1 Paper-type select in the header, beside size and orientation
- [x] 3.2 `paperStyleId` in the session (optional, for older sessions), restored on connect

## 4. Docs, gate, verification

- [x] 4.1 README bullet, CHANGELOG entry
- [x] 4.2 `mise run ci` green
- [x] 4.3 Verified in the browser: dotted, grid and black card render; an imported SVG stays
      legible on black card; the choice survives a reload and is written to the session
