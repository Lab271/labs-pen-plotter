## Why

Cut jobs are registered against a pre-printed sheet: the print carries small blue crosshairs at known page coordinates (e.g. `P1 15,15  P2 195,15  P3 15,282` mm) and the cut file shares the same canvas. Today the app cannot use them: the blue reference layer is cut along with the artwork, the page position is discarded at import, and there is no way to check whether the machine's work zero actually lands the pen on those marks before committing a sheet. Registration is verified by wasting a sheet, and a sticker mounted slightly rotated cannot be cut at all.

## What Changes

- **Reference layers are recognised and kept out of the cut.** An SVG layer labelled as calibration (or elements with a `cal-` id, with pure-blue geometry as a fallback) is excluded from the plotted geometry and its points are extracted as calibration points in page millimetres. The operator is told how many were found.
- **Page-true placement.** Import remembers where the artwork sits on its page (the offset the bounding-box normalisation removes). A new **Place on page** action puts the artwork at exactly its file coordinates at 1:1, so a cut registered to a printed sheet lands where the print says it does.
- **Registration wizard.** Importing an SVG with calibration points opens a wizard: mount the sticker; then, for each point in turn, jog the pen onto the printed crosshair and press Set to record the machine's work position; finally the software fits a rigid transform (rotation + translation, scale fixed at 1:1) of the file's points onto the measurements and applies it as the artwork's placement, so the cut lines follow the sticker exactly as it sits on the bed. Residuals and the implied print scale are shown, with a warning when the fit is poor. **Supersedes** the marking run and manual offset correction shipped in 1.1.0, which are removed.
- **Busy guard on program streaming.** The gateway refuses to start a program while one is streaming. Today nothing stops a second program interleaving into a running one; adding a second button that streams makes closing that hole a prerequisite.

## Capabilities

### New Capabilities
- `registration-calibration`: Extracting calibration points from an artwork's reference layer and the registration wizard that jogs to each point, records its work position, and fits the artwork's placement (rotation + translation) to the measurements.

### Modified Capabilities
- `svg-import`: Reference/calibration layers are excluded from the cut geometry and reported; the artwork's position on its page is preserved alongside its size.
- `artwork-layout`: The fit helpers gain **Place on page** (page-true 1:1 placement).
- `gcode-streaming`: Starting a program while another is streaming is refused.

## Impact

- **`src/plot/`** (pure, unit-tested): reference-layer detection and point extraction in the SVG importer; `pageOffset` on `Artwork`; a `placeOnPage` placement helper; `fitRegistration` (2-D rigid least-squares fit in the placement convention).
- **`src/grbl/GrblController.ts`**: the streaming entry point gains an in-progress refusal. (The 1.1.0 `shiftWorkZero` command is removed from controller, protocol, gateway and client — the wizard adjusts the artwork, not the work origin.)
- **`src/ui/`**: a registration wizard (modal, step per point, reusing the jog controls and live work position), a Register… button to reopen it, the Place on page button, and the import note. The 1.1.0 Run calibration / Apply correction controls are removed.
- **Session**: calibration points and page offset persist with each artwork (optional fields; old sessions load unchanged).
- **Hardware**: the fitted placement must be confirmed by a real cut on a mounted sticker before the change is complete.
- No new dependencies.
