## 1. Geometry

- [x] 1.1 `src/plot/magnet.ts`: `Magnet`, `distanceToSegment`, `polylineHitsMagnet`,
      `magnetsHitBy`, `recommendMagnets`, `normalizeMagnets`
- [x] 1.2 Unit tests: perpendicular vs endpoint distance, zero-length segment, grazing pass,
      a magnet mid-way along a long leg, single-point polyline, suggestions fully on the paper,
      corners first, positions on the drawing dropped, sheet too small, unique ids, unusable
      stored radius repaired

## 2. UI

- [x] 2.1 Magnets in the session, restored on connect
- [x] 2.2 Canvas draws keep-out circles to scale, red on collision, draggable to move
- [x] 2.3 Magnets panel: Suggest, Add one, per-magnet radius, remove, collision warning

## 3. Safety

- [x] 3.1 Plotting is blocked when drawn geometry crosses a magnet, with a message naming how many

## 4. Docs, gate, verification

- [x] 4.1 README, CHANGELOG
- [x] 4.2 `mise run ci` green
- [x] 4.3 Verified in the browser: Suggest fills the clear corners and skips the one under the
      artwork; dragging a magnet onto the drawn stroke turns it red in both the canvas and the list
      and blocks the plot; a magnet inside a ring's empty middle correctly does not block
