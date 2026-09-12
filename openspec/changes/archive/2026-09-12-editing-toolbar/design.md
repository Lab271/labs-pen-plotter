## Context

`App` held `selectedId: string | null`; `PlotCanvas` attached Konva's transformer to that one node.
Artwork already had identity and a transform (`Placement`), so the missing half of the object model
was *operations on a set of objects* — and a place to put them that is not a React component.

## Decisions

- **The scene operations are pure and live in `src/plot/`.** What a rubber band catches, where a
  paste lands, what "send backward" does at the end of the list: each is a small rule that is easy
  to get subtly wrong and impossible to notice by clicking around. In `src/plot/` they are inside
  the coverage floor and are tested directly.
- **Rubber band selects by intersection, not containment.** On an A0 bed a fitted artwork covers
  most of the sheet; a band that must *enclose* an object could not select it without leaving the
  paper.
- **Dragging one object carries the selection.** Konva drags only the grabbed node, so the handler
  applies the same delta to the others. Grabbing an unselected object selects it first, so a drag
  always moves what the operator actually grabbed.
- **An in-app clipboard, not the system one.** The payload is megabytes of polylines plus an
  in-memory import source that cannot survive a serialise → paste round trip. "Copy" here means
  duplicate this drawing, not put SVG text on the system clipboard — and a system-clipboard paste
  of arbitrary text would be a different feature.
- **A copy keeps its source.** The retained SVG text / traced field is re-pointed at the new id, so
  the copy's sampling and threshold controls keep working instead of silently going read-only.
- **Paste is clamped to the paper.** An offset copy near the edge would otherwise land off the
  sheet, where it is invisible and fails the pre-plot work-area check. The clamp works on the
  bounding box and converts back to a placement, because a rotated object's origin is not its
  top-left corner.
- **`reorderMany` swaps only against unselected neighbours.** The naive loop (move each selected
  object one step) makes two adjacent selected objects trade places and a block at the top shuffle
  internally. Swapping only with unselected neighbours keeps the selection rigid and makes a block
  already at the end a no-op.
- **Shortcuts are bound on the window, and ignore fields.** The operator's attention is on a
  `<canvas>`, which takes no focus of its own. The handler bails out on `INPUT`/`TEXTAREA`/`SELECT`
  and contenteditable, so typing a feed rate never deletes artwork.
- **Stacking order has no effect on the plot.** Strokes are ordered by pen and by travel; z-order
  is a scene property (and what a project file will need). Saying so here avoids someone later
  "fixing" the plot to honour it.

## Risks / Trade-offs

- The clipboard holds full copies, so copying a large drawing doubles its memory for as long as it
  sits there. Bounded by the session size that already has to be held.
- Backspace is "go back" in some browser setups; the handler only calls `preventDefault` when
  something is selected, so an accidental press outside the editor still behaves normally.
