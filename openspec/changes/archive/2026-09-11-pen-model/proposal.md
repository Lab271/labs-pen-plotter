## Why

The app has no idea what it is drawing with. Every artwork previews in the same slate line of the
same weight, so the canvas cannot show what a plot will look like — which pen, how heavy a line —
and nothing downstream can reason about it: hatching has no spacing to respect, and multi-colour
plotting (#3) has nothing to group strokes by.

## What Changes

- A pure **pen model** (`src/plot/pen.ts`): id, name, colour, width in mm, with `resolvePen` and
  normalisation for a library that round-trips through JSON and is hand-editable.
- A **pen library in app settings**, so the pens that exist belong to the machine's shelf and every
  client sees the same set. Editable on the settings page: colour, name, width, add, remove.
- **Each artwork carries a pen**, assigned from the current selection on import and changeable
  afterwards. That is the axis #3 will group and sequence by.
- The **canvas previews the pen**: its colour, and its width to scale — floored at a hairline,
  because A0 fitted to a laptop canvas is ~0.5 px/mm, where an honest 0.5 mm line is invisible.

## Capabilities

### Added Capabilities
- `pen-library`: pens are defined once with the characteristics that matter (colour, width),
  selectable per artwork, and previewed as they will draw.

### Modified Capabilities
- `app-settings`: the settings record carries the pen library.
- `artwork-layout`: the WYSIWYG preview draws each artwork in its pen's colour and width.

## Impact

- **Code:** new `src/plot/pen.ts` (+ tests); `src/gateway/appSettings.ts`, `src/ui/SettingsPage.tsx`,
  `src/ui/App.tsx`, `src/ui/PlotCanvas.tsx`, `src/ui/sessionStore.ts`.
- **Behaviour:** no change to generated G-code. A pen's width and colour are preview-only for now;
  what a pen *means* for the toolpath (hatch spacing, pen-change pauses) is #12 and #3.
