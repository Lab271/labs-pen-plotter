## Why

The import flow asked the operator to know the answer before seeing the question. Two buttons —
**+ SVG** and **+ PNG** — exposed the file format as if it were the decision, while the decision
that actually matters (how a photograph becomes lines) was made silently: every raster import was
traced as iso-contours, and the only way to see the result was to add it to the page and squint at
the canvas.

## What Changes

- **One "+ Image" entry.** A vector file is already lines and goes straight in, keeping its real
  size and its reference layer; anything raster opens the wizard, because it has to be *converted*
  and which conversion is the operator's call.
- **A two-step wizard**: adjust the image (brightness, contrast, invert, rotate, crop) → choose an
  algorithm and tune it, with a live preview of the actual lines → add to the page.
- **Two algorithms** (`src/plot/algorithms.ts`): **Outline** (iso-contour tracing, what imports did
  before) and **Hatching** (parallel lines whose density carries tone).
- **Adjustments are pure** (`src/plot/adjust.ts`) and operate on the decoded grayscale field, so the
  picture in the adjust step is exactly the data the algorithm reads.
- The object remembers its wizard settings, so the import can be **reopened and retuned** rather
  than re-imported from the file.

## Capabilities

### Added Capabilities
- `image-import-wizard`: importing an image is a guided conversion with a live preview of the lines
  that will be plotted.

### Modified Capabilities
- `png-import`: raster import is now the wizard's job; the algorithm is chosen rather than assumed.

## Impact

- **Code:** new `src/plot/adjust.ts`, `src/plot/algorithms.ts`, `src/ui/ImportWizard.tsx` (+ tests);
  `src/ui/App.tsx`, `src/ui/sessionStore.ts`.
- **Behaviour:** the separate PNG/SVG buttons are gone. Sessions imported before this keep their
  inline threshold/levels controls; wizard imports are retuned in the wizard instead, so there are
  never two controls for one thing.
- **Follow-on:** #12 adds the remaining algorithms to the same picker.
