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

## 3. Calibration program (`src/plot/calibration.ts`)

- [x] 3.1 Implement `generateCalibrationGcode(points, passes, penOpts)`; unit tests: exact token sequence for 3 points × 3 passes, `passes` clamped to `1..10`, empty points yields only the frame, feeds/Z/dwell come from `PenOptions`.
- [x] 3.2 Confirm `estimatePlotTime` works on the generated program (a unit test asserting a positive finite estimate) so the UI can show a duration.

## 4. Controller and gateway

- [x] 4.1 `GrblController.streamProgram` throws when a stream is active or paused; unit test in `src/grbl/__tests__` with a mock transport that a second `streamProgram` is rejected and the first continues.
- [x] 4.2 `GrblController.shiftWorkZero(dx, dy)`: requires a last status with `wpos` and `Idle`, sends `G10 L20 P1 X<wpos.x+dx> Y<wpos.y+dy>`; unit test the emitted line and the refusal when not idle.
- [x] 4.3 Protocol: add `{ cmd: 'shiftWorkZero'; dx; dy }` to `ClientCommand`; gateway handler forwards it and maps controller refusals (busy, not idle) to `cmdError`; `plot` maps the stream guard to `cmdError`. Verify with `mise run typecheck-node` and a gateway smoke run that a busy `plot` returns `cmdError`. *(Typecheck green; the controller throws and the gateway's existing catch maps thrown errors to `cmdError` — no separate gateway smoke run was done without hardware; covered by 7.4.)*
- [x] 4.4 `GatewayClient`: expose `shiftWorkZero(dx, dy)`; verify typecheck.

## 5. UI: Calibration section (`src/ui/App.tsx` and a new component)

- [x] 5.1 Show, for the selected artwork, the calibration points found (name and page mm) or "No calibration points in this artwork".
- [x] 5.2 Passes number input (default 3, 1..10) stored in the session; **Run calibration** streams the generated program via the existing plot path and shows the time estimate; disabled while anything streams or when there are no points.
- [x] 5.3 Observed-offset inputs (`ΔX`, `ΔY` mm, page axes, one-line convention text) and **Apply correction**, disabled unless idle; on success the WPos readout changes by the entered offset; errors show via the existing alert.
- [x] 5.4 Persist `calibrationPoints` and `pageOffset` per artwork and `calibrationPasses` in the session; verify an old session (without the fields) loads unchanged.

## 6. Specs, docs, gate

- [x] 6.1 Run `mise run ci`; coverage floors hold or rise (new pure modules are fully covered).
- [x] 6.2 README: a short "Registration calibration" subsection (how to prepare the SVG, run, read the marks, apply the correction); CHANGELOG entry under Unreleased.

## 7. Hardware verification (leave unchecked until confirmed on the machine)

- [ ] 7.1 On a scrap print of `10-a4-slash-icon-print.pdf`: import the cut file, Place on page, run 1 pass; confirm three marks land near the printed dots and nothing on the blue layer was drawn.
- [ ] 7.2 Deliberately apply a `+2.0, 0` correction, re-run 1 pass; confirm the marks move 2 mm **left** on the sheet (origin moved, marks now land where a 2 mm-right miss would be corrected). If they move right, invert the sign in `shiftWorkZero` and update the convention text.
- [ ] 7.3 Apply the real observed offset, run 3 passes; confirm all nine marks fall inside the dots and successive passes coincide.
- [ ] 7.4 Press Stop mid-run; confirm the pen lifts and the machine idles safely; confirm Plot/Run are disabled while a plot streams and a forced second `plot` is refused.
