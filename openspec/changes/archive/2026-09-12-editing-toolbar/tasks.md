## 1. Scene model

- [x] 1.1 `src/plot/scene.ts`: `objectBounds`, `rectFromDrag`, `objectsInRect`, `reorder`,
      `reorderMany`, `pastePlacement`, `copyName`
- [x] 1.2 Unit tests: rotated bounds, band by intersection incl. an edge graze, reorder clamping
      and no-op for an unknown id, a selection block that must not shuffle internally, paste offset
      + clamp + rotation, copy naming across repeated pastes

## 2. Canvas

- [x] 2.1 Multi-node transformer; Shift/Cmd-click toggles; click on empty space clears
- [x] 2.2 Rubber band drawn in paper mm and hit-tested with the pure helper
- [x] 2.3 Dragging one object carries the rest of the selection

## 3. App

- [x] 3.1 `selectedIds` state (with `selectedId` derived) and session persistence
- [x] 3.2 Clipboard: copy, paste, duplicate, delete — sources carried to the copy
- [x] 3.3 Stacking order for the selection
- [x] 3.4 Editing toolbar and keyboard shortcuts (⌘C/⌘V/⌘D/⌘A, Delete, Escape)
- [x] 3.5 Artwork list highlights every selected object and supports Shift-click

## 4. Docs, gate, verification

- [x] 4.1 README, CHANGELOG
- [x] 4.2 `mise run ci` green
- [x] 4.3 Verified in the browser: Select all → Duplicate names and selects the copies, ⌘C/⌘V
      pastes offset and clamped, ⌘A + Delete clears the page, a rubber band from empty bed selects
      all three objects, and dragging one moves the whole selection by the same delta
