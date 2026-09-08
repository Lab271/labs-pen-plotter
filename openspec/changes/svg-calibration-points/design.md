## Context

See proposal.md for motivation. What shapes the approach:

- `src/plot/svg.ts` flattens every drawable element it can see; there is no notion of layers, colour or ids. After sampling, `normalizeToOrigin` shifts the bounding box to `(0,0)` and returns only width/height — the page position is gone by the time `Artwork` exists.
- Placement (`src/plot/place.ts`) is a Konva-style `{x, y, scale, rotation}` applied to polylines in artwork-local mm. Anything stored in that same frame (points included) is placed for free by `placePolylines`.
- The UI already derives the live work position (`mpos − wco`) for the footer readout and has press-and-hold jog buttons with a step size. Nothing new is needed from the daemon to know where the pen is.
- `streamProgram` has no in-progress guard (called out in AGENTS.md as a hazard).
- The machine has no limit switches; work zero is set by hand. A sticker is mounted by hand too, so it sits somewhere on the bed at some small angle. The cut has to follow the sticker, not the other way round.

## Goals / Non-Goals

**Goals:**
- Reference geometry never reaches the pen; its points are available as data.
- File coordinates can be made equal to paper coordinates in one click.
- A guided measurement of each printed point by jogging, with the fit applied to the artwork's placement — position *and* rotation.
- All logic that can be pure lives in `src/plot/` and is unit-tested; the UI only wires it.

**Non-Goals:**
- Measuring the points automatically (camera, probe input). The operator sights the pen tip.
- Correcting scale. A sticker is cut 1:1; a scale mismatch is reported as a warning, not applied.
- Moving the work origin. The origin stays where the operator set it; the artwork moves.
- Changing the import default (still fit-to-paper).

## Decisions

### D1. Detect reference geometry by label and id first, colour as fallback
Inkscape layers carry `inkscape:label`; the operator's files label the layer "calibration REFERENCE ONLY - do not cut" and id the groups `cal-P1..3`. Matching label text (`calibration`, `reference`) and the `cal-` id prefix is explicit and cheap. Pure blue (`#0000FF`, `blue`) is only consulted when no labels match, because colour alone would silently drop legitimate blue artwork; when the fallback fires, the import note names the count so the operator sees it. *Alternative — colour only:* simpler but wrong for any blue drawing. *Alternative — a UI layer picker:* more general, much more UI; not needed for files we control.

### D2. Points live in the artwork frame, not the page frame
Each reference group yields one point: the centre of a `<circle>` in the group if there is one (the dot is the actual target), else the group's bbox centre (crosshair without a dot). Points are transformed through the same CTM/unit pipeline as strokes and then shifted by the same normalisation offset, so they sit in artwork-local mm exactly like polylines. Consequence: `placePolylines(placement, [points])` yields their paper coordinates, and rotation/scale of the artwork rotate/scale the points correctly. The alternative — keep points in page mm and only support page-true placement — would break the moment the operator nudges the artwork.

### D3. `Artwork.pageOffset` is the normalisation offset, computed from cut geometry only
`normalizeToOrigin` already computes `minX, minY`; it now returns them as `pageOffset` (page mm from the viewBox origin to the artwork's bbox top-left). Reference geometry is excluded before this step so a crosshair at the page edge does not widen the bbox. `placeOnPage(art) = { x: pageOffset.x, y: pageOffset.y, scale: 1, rotation: 0 }`; for artwork without an offset (PNG, old sessions) it degrades to `actualSizePlacement`. A viewBox with a non-zero `min-x/min-y` is handled by the CTM already (the browser bakes it in), so the offset is relative to the visible page corner, which is what the print uses.

### D4. A modal wizard, one step per point, driven by the existing jog and status
The wizard is UI state in `src/ui/` (step index, measurements so far) over the controls the app already has: `jogBy` with `jogStep`, pen up/down, and the derived work position. Set records that position for the current point. Nothing new crosses the WebSocket. *Alternative — a probe or camera:* the machine has neither; sighting the pen tip on a printed crosshair is how the operator already sets work zero.

### D5. Guard streaming in the controller, surface it in the gateway
`GrblController.streamProgram` throws when a stream is active or paused; the gateway catches it and answers `cmdError`. Putting the check in the controller protects every caller. The UI additionally disables Plot while streaming and the wizard's jog/Set, so the error is a backstop.

### D6. Rigid least-squares fit in the placement convention, scale fixed
`fitRegistration(local, measured)` in `src/plot/register.ts` is the 2-D Kabsch/Procrustes solution: centre both point sets, θ = atan2(Σ cross, Σ dot), t from the centroids; expressed as `paper = t + R(θ)·local` with the same rotation matrix `placePolylines` uses, so the result *is* a `Placement` (`scale: 1`). Three points over-determine it; the third is the check and appears in the residuals. Scale is not solved: the sticker is printed 1:1 and the cut must match its physical size, so the implied scale (√(Σ|b|²/Σ|a|²)) is only reported, with a warning past 1%. *Alternative — similarity transform (with scale):* would silently stretch the cut to a mis-jogged point. *Alternative — two points only:* no check. Rejected.

### D7. Points persist with the artwork
`PersistedArt` gains optional `calibrationPoints` and `pageOffset`. Re-flattening (sampling change) recomputes both from the same source, so they cannot drift from the strokes. Old sessions load with neither and simply have no calibration available.

### D8. Auto-open on import, reopen on demand
An SVG with ≥2 calibration points opens the wizard right after import; the operator can cancel and reopen with a Register button. Auto-open because the reference layer's whole purpose is registration; making the operator find a button defeats the point.

## Risks / Trade-offs

- **[Operator sets a point off the crosshair]** → the third point makes it visible: the RMS crosses 0.3 mm and the wizard warns (least squares shares the error out, so the flag is on the RMS, not one residual); Back re-measures. A two-point sticker cannot detect this and the wizard says so.
- **[Rotation sign convention wrong]** → `fitRegistration` is round-trip tested against `placePolylines` (place with a known rotation, fit, recover it), so the fit and the renderer cannot disagree; the hardware task confirms the *machine* follows the canvas (identity mapping, already verified by the orientation test).
- **[Colour fallback drops legitimate blue strokes]** → only when no labels match, and always reported in the import note; an artwork entirely in blue triggers the "no drawable geometry" message, which mentions the rule.
- **[Points transform incorrectly after rotation]** → they use `placePolylines`, the same code as strokes; unit-tested at 90°.
- **[Stream guard breaks an existing flow]** → nothing in the UI streams while streaming today; the guard only fires on the documented hazard.
- **[Sticker printed off-scale]** → reported as implied scale with a warning; not corrected, by design.

## Migration Plan

Old sessions lack the new optional fields and behave as before. 1.1.0's `shiftWorkZero` command and its UI are removed in the same release that adds the wizard; nothing else speaks that command. Deploy through the normal release path. Rollback is installing the previous package.

## Open Questions

- Whether to also offer applying the implied scale when the operator confirms the print itself is off. Does not change the fit or the wizard steps; can be a checkbox on the result step later.
