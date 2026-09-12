## Why

The wizard shipped with two conversions. Two is enough to prove the shell and not enough to be
useful: outline tracing and one direction of hatching cover line art and flat shading, and nothing
else. A photograph with a busy background, a soft gradient, or anything that wants real tonal depth
has no algorithm that suits it.

## What Changes

Three more algorithms in `src/plot/algorithms.ts`, bringing the wizard to five:

- **Crosshatch** — hatching from several directions, where the *number* of directions carries the
  tone. Darker areas get more passes, which is how hatching is built up by hand and gives darker
  darks than one direction can without the lines merging into solid ink.
- **Stippling** — dots placed by Floyd–Steinberg error diffusion, so their local density follows
  the tone. Each dot is a short segment, not a point: a zero-length polyline leaves the pen down in
  one spot without moving, which blots rather than dots.
- **Edge detect** — Sobel gradient magnitude, normalised by the strongest edge in the image and fed
  to the existing contour tracer. Finds where the image *changes* rather than where it is dark,
  which is the difference between outlining a subject and outlining every shadow behind it.

## Capabilities

### Modified Capabilities
- `image-import-wizard`: the algorithm catalogue covers outlines, hatching, crosshatching,
  stippling and edge detection.

## Impact

- **Code:** `src/plot/algorithms.ts` (+ tests); one new parameter (`passes`) and its control in
  `src/ui/ImportWizard.tsx`.
- **Behaviour:** existing imports are unaffected — their algorithm and parameters are stored with
  the object, and the two original algorithms are unchanged.
