## Context

See proposal.md for motivation. What shapes the approach:

- `src/plot/svg.ts` flattens every drawable element it can see; there is no notion of layers, colour or ids. After sampling, `normalizeToOrigin` shifts the bounding box to `(0,0)` and returns only width/height — the page position is gone by the time `Artwork` exists.
- Placement (`src/plot/place.ts`) is a Konva-style `{x, y, scale, rotation}` applied to polylines in artwork-local mm. Anything stored in that same frame (points included) is placed for free by `placePolylines`.
- `generateGcode` already encodes the pen model: pen-up/down Z, dwell, draw/travel feeds, `G21 G90`, return to origin. The orientation test (`work-coordinates` spec) set the precedent of streaming a small generated program through the normal `plot` path.
- The controller has `setWorkPosition(x, y, z)` (`G10 L20 P1`) and status reports carry `wpos`. It is not exposed over the WebSocket. `streamProgram` has no in-progress guard (called out in AGENTS.md as a hazard).
- The machine has no limit switches; work zero is set by hand at the paper corner. The whole point of this change is to measure how wrong that is and fix it without moving the gantry.

## Goals / Non-Goals

**Goals:**
- Reference geometry never reaches the pen; its points are available as data.
- File coordinates can be made equal to paper coordinates in one click.
- A repeatable marking test whose result the operator reads off the sheet.
- A translation-only correction of the work origin, applied without motion.
- All logic that can be pure lives in `src/plot/` and is unit-tested; the UI only wires it.

**Non-Goals:**
- Measuring the miss automatically (camera, probe input). The operator reads it.
- Correcting rotation or scale of a skewed sheet. Three points make skew *visible*; correcting it is a later change.
- A non-marking hover mode. Decided against for v1: the read is far less precise than a mark inside a 0.4 mm dot.
- Changing the import default (still fit-to-paper).

## Decisions

### D1. Detect reference geometry by label and id first, colour as fallback
Inkscape layers carry `inkscape:label`; the operator's files label the layer "calibration REFERENCE ONLY - do not cut" and id the groups `cal-P1..3`. Matching label text (`calibration`, `reference`) and the `cal-` id prefix is explicit and cheap. Pure blue (`#0000FF`, `blue`) is only consulted when no labels match, because colour alone would silently drop legitimate blue artwork; when the fallback fires, the import note names the count so the operator sees it. *Alternative — colour only:* simpler but wrong for any blue drawing. *Alternative — a UI layer picker:* more general, much more UI; not needed for files we control.

### D2. Points live in the artwork frame, not the page frame
Each reference group yields one point: the centre of a `<circle>` in the group if there is one (the dot is the actual target), else the group's bbox centre (crosshair without a dot). Points are transformed through the same CTM/unit pipeline as strokes and then shifted by the same normalisation offset, so they sit in artwork-local mm exactly like polylines. Consequence: `placePolylines(placement, [points])` yields their paper coordinates, and rotation/scale of the artwork rotate/scale the points correctly. The alternative — keep points in page mm and only support page-true placement — would break the moment the operator nudges the artwork.

### D3. `Artwork.pageOffset` is the normalisation offset, computed from cut geometry only
`normalizeToOrigin` already computes `minX, minY`; it now returns them as `pageOffset` (page mm from the viewBox origin to the artwork's bbox top-left). Reference geometry is excluded before this step so a crosshair at the page edge does not widen the bbox. `placeOnPage(art) = { x: pageOffset.x, y: pageOffset.y, scale: 1, rotation: 0 }`; for artwork without an offset (PNG, old sessions) it degrades to `actualSizePlacement`. A viewBox with a non-zero `min-x/min-y` is handled by the CTM already (the browser bakes it in), so the offset is relative to the visible page corner, which is what the print uses.

### D4. The run is a generated program streamed via `plot`
`generateCalibrationGcode(points, passes, penOpts)` in `src/plot/calibration.ts`: `G21 G90`, `G0 Z<up>`, then per pass and per point `G1 X Y F<travel>`, `G0 Z<down>`, `G4 P<dwell>`, `G0 Z<up>`, `G4 P<dwell>`; finally `G1 X0 Y0 F<travel>`. Same tokens as `generateGcode`, so pen depth, dwell and feeds come from the shared calibration model and the time estimate works unchanged. Streaming through the existing `plot` command means Pause/Stop/progress all apply with no new protocol for the run itself. *Alternative — sequence individual `jog`/`penDown` commands from the browser:* fragile on disconnect and bypasses flow control. Rejected.

### D5. Guard streaming in the controller, surface it in the gateway
`GrblController.streamProgram` throws when a stream is active or paused; the gateway catches it and answers `cmdError`. Putting the check in the controller (not just the gateway handler) protects every caller, including future ones. The UI additionally disables Run/Plot while streaming, so the error is a backstop, not the normal path.

### D6. Correction is a relative `G10 L20` on the current position, sign = "where the mark landed"
New controller method `shiftWorkZero(dx, dy)`: read the last status `wpos`, send `G10 L20 P1 X<wpos.x+dx> Y<wpos.y+dy>` (Z omitted, so it stays). Reasoning: if the commanded `X=15` mark landed `dx` to the right of the printed dot, the physical spot the machine calls `15` is truly `15+dx`, so declaring the current position to be `wpos+dx` moves the origin left by `dx`, and the next `X=15` lands on the dot. The operator enters exactly what they see — "the mark is 1 mm right and 0.5 mm below the dot" → `+1.0, +0.5` in page axes (Y down, matching the identity mapping). Requires Idle; the gateway refuses otherwise. Exposed as the `shiftWorkZero` command. *Alternative — jog by the offset and press Set work zero:* moves the pen, and the arithmetic is on the operator. Rejected. **The sign convention is the single thing most likely to be wrong; it is a hardware verification task, and the correction UI shows a one-line reminder of the convention.**

### D7. Points persist with the artwork
`PersistedArt` gains optional `calibrationPoints` and `pageOffset`. Re-flattening (sampling change) recomputes both from the same source, so they cannot drift from the strokes. Old sessions load with neither and simply have no calibration available.

### D8. Passes is a session-level number input, default 3
Small, bounded (1..10), remembered in the session like the paper choice. Not per artwork: it describes the test, not the drawing.

## Risks / Trade-offs

- **[Wrong correction sign doubles the error]** → the first hardware task applies a known offset on a scrap sheet and confirms the mark moves the intended way; the UI shows the convention next to the inputs; a second run is the check.
- **[Colour fallback drops legitimate blue strokes]** → only when no labels match, and always reported in the import note with the count; an artwork drawn entirely in blue would import empty and trigger the existing "no drawable geometry" message, which now also mentions the reference-layer rule.
- **[Touch depth marks or dents the sheet more than wanted]** → it uses the calibrated pen-down Z, which the operator already tunes for the pen in use; the run is meant to mark. A lighter Z would be a per-run option later if needed.
- **[Points transform incorrectly after rotation]** → they use `placePolylines`, the same code as strokes; a unit test rotates an artwork with a point by 90° and checks the point's paper position.
- **[Stream guard breaks an existing flow that relied on re-streaming]** → nothing in the UI streams while streaming today (Plot is disabled); the guard only ever fires on the hazard AGENTS.md documents.
- **[Skewed sheet]** → three points make it visible (marks miss by different vectors); the operator averages or re-registers the sheet. Correcting rotation is out of scope.

## Migration Plan

Pure additions; no data migration. Old sessions lack the new optional fields and behave as before. Deploy through the normal release path; the daemon change (new command + stream guard) and the UI ship together in one `.deb`. Rollback is installing the previous package.

## Open Questions

- Whether the per-point miss should be entered per point (to show skew numerically) rather than one shared offset. Does not change the specs' contract for v1 (one offset); can be added without touching the generator or protocol.
