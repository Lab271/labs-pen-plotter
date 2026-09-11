## Why

The canvas draws one sheet: white, plain, always. Real jobs are not on one stock — a dotted or
gridded pad, cream or kraft, black card for a white gel pen. The preview is the only thing that
tells the operator whether a drawing will read on the sheet they are about to spend, and on dark
stock it actively lies: the artwork is drawn in dark slate, which is the opposite of what the pen
will do.

## What Changes

- A **paper type** selector in the header, beside the size and orientation: plain white, cream,
  dotted, grid, lined, kraft, black card.
- `src/plot/paper.ts` gains a pure `PaperStyle` model (colour, pattern, pitch, pattern colour, and
  a `dark` flag) plus `paperStyle(id)`, which falls back to plain white for an id a later build
  no longer has.
- The canvas fills the sheet with the style's colour and, for patterned stock, one tiled fill —
  not thousands of nodes: a 5 mm dot grid on A0 would be ~40 000 circles redrawn on every drag.
- On dark stock the preview draws the artwork **light**, since a white or metallic pen is what
  such sheets are for.
- The choice is saved with the session, so it follows the drawing across devices.

## Capabilities

### Modified Capabilities
- `artwork-layout`: the page's paper has a selectable appearance (type/colour/pattern), which is
  preview-only and never reaches the generated paths.

## Impact

- **Code:** `src/plot/paper.ts` (+ tests), `src/ui/PlotCanvas.tsx`, `src/ui/App.tsx`,
  `src/ui/sessionStore.ts`.
- **Behaviour:** nothing about the plot changes — the style is never passed to `generateGcode`,
  which takes polylines and pen options only.
