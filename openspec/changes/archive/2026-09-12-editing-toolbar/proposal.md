## Why

The page could hold several artworks, but only ever treat one at a time: one selection, no way to
duplicate anything, no stacking order, and the only way to remove something was a ✕ in a list.
Everything the epic's later features need — shapes and text (#5), image imports that drop paths
into the scene (#11), a project file that serialises it (#8) — assumes objects that can be
selected together, copied, moved and ordered.

## What Changes

- **`src/plot/scene.ts`**: the pure object-model operations — page-mm bounds of a placed object,
  rubber-band hit testing, stacking order for a whole selection, paste placement, copy naming.
- **Multi-selection**: click, Shift/Cmd-click to toggle, drag a rubber band on empty space, Select
  all. The transformer acts on the whole selection, and dragging one object carries the rest.
- **Copy / paste / duplicate / delete**, on an in-app clipboard, with the retained import source
  carried across so a copy can still be re-tuned.
- **Stacking order**: bring forward / send backward for the selection.
- **An editing toolbar** above the canvas, and the shortcuts it documents: ⌘C, ⌘V, ⌘D, ⌘A,
  Delete/Backspace, Escape.

## Capabilities

### Added Capabilities
- `scene-editing`: the page is a scene of objects that can be selected (singly, together, or by
  rubber band), moved, copied, ordered and deleted.

### Modified Capabilities
- `artwork-layout`: selection is a set rather than a single object.

## Impact

- **Code:** new `src/plot/scene.ts` (+ tests); `src/ui/PlotCanvas.tsx`, `src/ui/App.tsx`,
  `src/ui/sessionStore.ts`.
- **Behaviour:** the session records the whole selection (`selectedIds`), keeping `selectedId` so
  an older build still restores something sensible. Nothing about G-code generation changes;
  stacking order is a scene property, and the plot orders strokes by pen and travel as before.
- **Fixed in passing:** the canvas measured itself only through a `ResizeObserver`, whose delivery
  is throttled in a hidden tab — a backgrounded tab could come back to an empty page. It now
  measures once on mount as well.
