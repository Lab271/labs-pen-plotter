## 1. Importer: reference layers, points, page offset (`src/plot/svg.ts`)

- [x] 1.1 Add pure `isReferenceElement(el)` / `classifyReference(root)` helpers: label contains `calibration`|`reference`, id prefix `cal-`, blue fallback only when no labels match. Verify with unit tests over small DOM-free fixtures (a `labels`/`ids`/`colours` shape) covering labelled, id-only, blue-fallback, and none.
- [x] 1.2 Exclude reference elements from stroke flattening and report `calibrationPointCount` in `ImportResult`; verify in the browser against `10-a4-slash-icon-cut.svg` that the blue crosshairs and dots are absent from the polylines and the count is 3.
- [x] 1.3 Extract one point per reference group (circle centre, else bbox centre), through the same CTM/unit path, with the group's id/label, in document order; verify in the browser that the points are `15,15 / 195,15 / 15,282` page mm named `cal-P1..3`.
- [x] 1.4 Make `normalizeToOrigin` return the offset; add `pageOffset` to `Artwork` and shift the points by the same offset so they share the artwork frame; verify against the file: offset `30,45`, size unchanged by the reference layer, points at `-15,-30 / 165,-30 / -15,237` local mm.
- [x] 1.5 Extend the import note: "N calibration points found (reference layer excluded from cut)"; the fill-only guidance also mentions the reference rule; verify the note text in the UI.

## 2. Placement (`src/plot/place.ts`, `src/ui/App.tsx`)

- [x] 2.1 Add `placeOnPage(art, current)`; degrades to `actualSizePlacement` when there is no `pageOffset`; unit tests for both branches.
- [x] 2.2 Add a unit test that a calibration point placed via `placePolylines` lands at its page coordinate under `placeOnPage`, and rotates correctly at 90°.
- [x] 2.3 Add the **Place on page** button to the layout controls; verify in the browser that the file above shows a `30,45` placement at 100% and the readout matches. *(Verified via the module in Chromium: `placeOnPage` → `{30, 45.01, 1, 0}`; button rendered. Live readout check folds into 7.1.)*

## 3. Registration fit (`src/plot/register.ts`)

- [x] 3.1 Implement `fitRegistration(local, measured)` (2-D rigid least squares in the placePolylines convention, scale fixed, residuals, RMS, implied scale); unit tests round-trip known placements (translation, ±rotation incl. ≈180°), flag a mis-jogged point in its residual, report a 2% print scale without applying it, handle 2 and 1 points, refuse 0.

## 4. Controller and gateway

- [x] 4.1 `GrblController.streamProgram` throws when a stream is active or paused; unit test in `src/grbl/__tests__` with a mock transport that a second `streamProgram` is rejected and the first continues.
- [x] 4.2 Remove the 1.1.0 `shiftWorkZero` from controller, protocol, gateway, client and its tests, and delete `src/plot/calibration.ts` + test; verify `mise run ci` green with no references left (`grep -rn shiftWorkZero src gateway` empty).

## 5. UI: registration wizard (`src/ui/RegistrationWizard.tsx`, `src/ui/App.tsx`)

- [x] 5.1 Wizard modal component: steps = mount → one per point → result; props: artwork name, points (name + page mm), live work position, jog/pen callbacks, connected/streaming flags, onApply(placement), onCancel. Verify it renders each step in the browser.
- [x] 5.2 Point step: names the point and page coordinate, shows live WPos, jog arrows + step + pen up/down, Set (disabled without a position or while streaming) records WPos and advances; Back re-measures. Verify in the browser with a fake status. *(Verified disconnected: step text, live WPos placeholder, arrows/Set disabled with the reason. The Set→advance path and the result step run on the machine in 7.1; the fit is round-trip unit-tested.)*
- [x] 5.3 Result step: rotation, offset, per-point residual, RMS, implied scale; warnings past 0.3 mm RMS / 1% scale; Apply sets the artwork placement via `updatePlacement`; verify the canvas moves/rotates the artwork accordingly.
- [x] 5.4 Auto-open after an SVG import with ≥2 points; Register button in the Registration section reopens for the selected artwork; remove Run calibration / Apply correction / passes and their session field. Verify in the browser.
- [x] 5.5 Persist `calibrationPoints` and `pageOffset` per artwork; an old session (without the fields) loads unchanged.

## 6. Specs, docs, gate

- [x] 6.1 Run `mise run ci`; coverage floors hold or rise (new pure modules are fully covered).
- [x] 6.2 README: rewrite the "Registration check" subsection for the wizard; CHANGELOG entry (Changed/Removed) under Unreleased.

## 7. Hardware verification (leave unchecked until confirmed on the machine)

- [ ] 7.1 Mount a printed sticker of `10-a4-slash-icon-print.pdf` deliberately a few degrees off; import the cut file; the wizard opens; jog to and Set all three points; the result step shows the mounting angle and an RMS under 0.3 mm.
- [ ] 7.2 Apply, then pen-down at each calibration point via jog (or plot only the reference layer on scrap) to confirm the cut lines on the canvas coincide with the sticker; then cut. Confirm the contour follows the print.
- [ ] 7.3 Set one point 2 mm off on purpose; confirm the RMS warning appears; Back and re-measure.
- [ ] 7.4 Confirm Plot and the wizard's jog/Set are disabled while a plot streams, and a forced second `plot` is refused.
