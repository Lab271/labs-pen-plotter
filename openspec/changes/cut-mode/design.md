## Context

Cutting already half-existed: the registration wizard, the reference layer and Place on page were
all built for cut jobs. What was missing was the other half — the tool. Everything about depth,
speed and toolpath still assumed a pen.

## Decisions

- **Mode lives in the session, the tool profile in app settings.** What is on the bed is a property
  of the job; how the knife is set up is a property of the machine. That split means switching a
  job to Cut does not disturb the pen's settings, and the knife profile follows the machine to
  every client.
- **Cutting is different geometry, not a different generator.** `prepareForCut` transforms
  polylines; the same writer emits them. A second generator would have to re-derive stroke
  ordering, framing and the work-origin return, and would drift from the one that is tested.
- **Compensation before overcut.** Compensation inserts corner overshoots, which change the path's
  start neighbourhood; overcutting afterwards re-traces the *compensated* path, which is the one
  the blade actually follows.
- **No stroke reversal when cutting.** The nearest-stroke ordering may reverse a stroke to save
  travel. For a pen that is invisible; for a compensated contour it points every corner overshoot
  into the piece. `allowReverse: false` is the narrow fix, and it keeps the pen's behaviour intact.
- **Closure is judged at 0.25 mm, not at machine epsilon.** A closed SVG path arrives as sampled
  points, and the last sample lands wherever the sampling step put it — tenths of a millimetre from
  the first. This was found by cutting a flattened rectangle and getting no overcut at all: at
  machine epsilon *every real contour* reads as open, and the feature silently does nothing.
  0.25 mm is narrower than the blade's kerf.
- **Fills are not offered when cutting.** Hatching a sticker shreds it. The algorithm catalogue
  carries a `fills` flag and cutting mode filters on it, rather than relying on the operator to
  know which entries are safe.
- **1:1 placement on import.** A cut has to match the print it was designed against. Where the file
  says which part of the page it occupies, that position is used; otherwise it is placed at actual
  size. Never fitted to the paper.
- **Blade offset defaults to 0.** Compensation is only correct when the number matches the physical
  blade; a wrong one cuts corners *out* of the piece. Off until measured.

## Risks / Trade-offs

- The corner test (20°) is a heuristic: too low and a flattened curve grows spikes, too high and a
  genuine corner is missed. The circle test pins the "smooth curve is left alone" end.
- Cut mode ignores pens, including multi-pen grouping — there is one blade. A job that mixes drawn
  and cut geometry is not expressible yet; that wants a per-object tool, which is a bigger change
  than a mode switch.
