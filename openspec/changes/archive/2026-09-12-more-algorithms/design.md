## Context

The wizard's catalogue is a list of `{ id, name, description, params }`, and `runAlgorithm`
dispatches on the id. Adding an algorithm is adding an entry and a pure function, which is what
made this a small change rather than a redesign.

## Decisions

- **Crosshatch is built from the existing hatch, not a new scanline engine.** Each pass is a hatch
  at its own angle with a raised threshold, so the tone→density behaviour stays in one place.
- **Directions spread over a half turn.** Past 180° a direction repeats one already drawn, so the
  extra pass would land on top of an earlier one instead of crossing it — a pinned test, because it
  is the kind of off-by-one that quietly halves the algorithm's usefulness.
- **Stippling uses error diffusion, not a per-cell threshold.** A threshold produces flat bands
  where a gradient should be smooth; carrying the error into neighbouring cells is what turns a
  binary decision into continuous tone. The tone is averaged down to the dot grid first, so noise
  does not decide where dots land.
- **A dot is a short segment.** The generator draws polylines; a zero-length one leaves the pen
  down in one spot without moving, which on an inked tip blots rather than dots.
- **Edge detection reuses the contour tracer.** Sobel produces a magnitude field; inverting and
  normalising it turns "strong edge" into "dark", which the existing marching-squares tracer
  already follows. Normalising by the strongest edge in the image is what makes the threshold mean
  the same thing on a flat photograph as on a high-contrast one.

## Risks / Trade-offs

- Stippling at a fine spacing emits thousands of two-point strokes. That is inherent to stippling
  (each dot is a pen-down/up cycle) and the wizard shows the stroke count, so the cost is visible
  before it is committed to. The plot-time estimate accounts for it, since it walks the real
  G-code.
- Edge detection finds nothing in a smoothly graded image — correctly, since there is no edge to
  find. The preview shows that immediately, and the empty-result guard stops it being added.
