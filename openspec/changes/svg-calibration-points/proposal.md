## Why

Cut jobs are registered against a pre-printed sheet: the print carries small blue crosshairs at known page coordinates (e.g. `P1 15,15  P2 195,15  P3 15,282` mm) and the cut file shares the same canvas. Today the app cannot use them: the blue reference layer is cut along with the artwork, the page position is discarded at import, and there is no way to check whether the machine's work zero actually lands the pen on those marks before committing a sheet. Registration is verified by wasting a sheet.

## What Changes

- **Reference layers are recognised and kept out of the cut.** An SVG layer labelled as calibration (or elements with a `cal-` id, with pure-blue geometry as a fallback) is excluded from the plotted geometry and its points are extracted as calibration points in page millimetres. The operator is told how many were found.
- **Page-true placement.** Import remembers where the artwork sits on its page (the offset the bounding-box normalisation removes). A new **Place on page** action puts the artwork at exactly its file coordinates at 1:1, so a cut registered to a printed sheet lands where the print says it does.
- **Calibration run.** From the calibration points of the selected artwork, the app generates and streams a short program: pen up, travel to each point, touch the pen down (a mark), lift, next point; repeated for a configurable number of passes (default 3); return to work zero. The printed dots are 0.4 mm radius, so an on-target touch disappears inside the dot and a miss is visible as an offset mark. Several passes expose lost steps and backlash.
- **Work-zero correction.** After the run the operator enters the observed offset of the marks from the printed dots and the app shifts the work origin by that amount, so the next run (and the cut) lands on the dots.
- **Busy guard on program streaming.** The gateway refuses to start a program while one is streaming. Today nothing stops a second program interleaving into a running one; adding a second button that streams makes closing that hole a prerequisite.

## Capabilities

### New Capabilities
- `registration-calibration`: Extracting calibration points from an artwork's reference layer, the marking-touch calibration run over those points with a repeat count, the operator-entered work-zero correction, and the guards around both.

### Modified Capabilities
- `svg-import`: Reference/calibration layers are excluded from the cut geometry and reported; the artwork's position on its page is preserved alongside its size.
- `artwork-layout`: The fit helpers gain **Place on page** (page-true 1:1 placement).
- `gateway-protocol`: A new command shifts the work origin by a relative offset.
- `gcode-streaming`: Starting a program while another is streaming is refused.

## Impact

- **`src/plot/`** (pure, unit-tested): reference-layer detection and point extraction in the SVG importer; `pageOffset` on `Artwork`; a `placeOnPage` placement helper; a `generateCalibrationGcode` generator reusing `PenOptions`.
- **`src/grbl/GrblController.ts`**: a `shiftWorkZero(dx, dy)` built on the existing `G10 L20` path; the streaming entry point gains an in-progress refusal.
- **`src/gateway/protocol.ts` / `gateway/server.ts` / `src/transport/GatewayClient.ts`**: the `shiftWorkZero` command; `plot` returns a `cmdError` when busy.
- **`src/ui/`**: a Calibration section (points found, passes, Run, observed-offset entry, Apply correction), the Place on page button, and the import note. Disabled while anything streams.
- **Session**: calibration points and page offset persist with each artwork (optional fields; old sessions load unchanged).
- **Hardware**: the correction's sign convention and the touch depth must be confirmed on the machine before the change is complete.
- No new dependencies.
