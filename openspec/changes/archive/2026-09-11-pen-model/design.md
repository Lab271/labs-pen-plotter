## Context

Nothing in the codebase modelled the tool. `Calibration` has a pen-down Z and a dwell — how the
machine handles *a* pen — but not which pen, nor anything about the line it lays down. The canvas
hardcoded `#475569` and a 1.4 px stroke.

Two issues are waiting on this: #3 needs an attribute to group strokes by so it can pause between
colours, and #12's hatching needs a physical line width so fills do not smear into solid ink.

## Decisions

- **Library in app settings, choice in the session.** The pens an operator owns are a property of
  the machine's shelf — one plotter, one set, shared by every client (#14). *Which* pen a drawing
  uses is part of the drawing, so it rides the session. Splitting them this way is what lets a
  phone see the same pens while the laptop's artwork keeps its own assignment.
- **Per-artwork, not one pen per job.** A single global pen would have to be re-modelled the moment
  #3 lands. Artwork carries `penId` now, so multi-pen plotting becomes a grouping problem rather
  than a data-model change.
- **Resolve ids, never trust them.** `resolvePen` falls back to the first pen in the library: a
  session can name a pen the operator has since deleted, and artwork drawn in the wrong colour is
  strictly better than artwork that does not render.
- **Normalise hard.** The library is hand-editable and comes back through JSON, so a `widthMm` of
  `"thick"`, `0`, or `NaN` has to survive: a zero or NaN stroke width renders *nothing*, which
  would look like lost artwork. Colours are restricted to a hex value or a plain name so a stored
  string cannot carry anything a CSS or canvas context would interpret.
- **Width to scale, floored at 1.2 px.** True-to-scale width is the point (it is what the tip
  lays down), but the bed fit is ~0.5 px/mm on a laptop and 0.5 mm would vanish. The floor keeps
  the drawing visible while the relative weight of a 0.3 against a 0.8 pen still reads when zoomed.
- **Selection is shown by the transform handles, not by recolouring.** Once artwork is drawn in its
  pen's colour, overriding that colour to mark selection would hide the very thing the pen is for.
- **No G-code change.** A pen's colour and width do not alter a path. Tempting adjacent work —
  offsetting by half the line width, or deriving hatch spacing — belongs to the issues that ask
  for it, on geometry that is unit-tested for it.

## Risks / Trade-offs

- A dark pen on black card previews as nearly invisible. That is what the pen would actually do,
  so it is information rather than a bug — the white gel pen in the default library is the answer.
- Deleting a pen leaves artwork pointing at it until the next resolve, which falls back to the
  first pen. The settings page keeps at least one pen in the library so there is always something
  to fall back to.
