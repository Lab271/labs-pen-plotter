## 1. Routing

- [x] 1.1 `src/plot/avoid.ts`: `routeAround` with bounded recursion, `pathIsClear`
- [x] 1.2 Unit tests: clear leg untouched, leg through a zone, leg clipping a zone, several zones
      on one leg, overlapping zones, detour stays near the straight line, endpoint inside a zone,
      leg straight through a centre, degenerate leg

## 2. Generation

- [x] 2.1 Every pen-up leg routed, in both writers, including the return home
- [x] 2.2 `travelLegs` exported for the preview, pinned against the emitted G-code by a test
- [x] 2.3 No-op with no zones (byte-for-byte identical output); detours costed by the estimate

## 3. UI

- [x] 3.1 Canvas draws the detoured travel legs
- [x] 3.2 Zones fed into both the drawing and cutting programs
- [x] 3.3 Block message names the magnet and the artwork it sits on

## 4. Docs, gate, verification

- [x] 4.1 README, CHANGELOG
- [x] 4.2 `mise run ci` green
- [x] 4.3 Verified in the browser: with a magnet on the straight line between two shapes, the
      emitted travel bends via a waypoint and its closest approach to the magnet is 12.47 mm
      against a 12 mm keep-out; the detour is drawn on the canvas; the block message names the
      magnet and the artwork
- [ ] 4.4 ⚙ HARDWARE: run a job whose travel crosses a magnet and confirm the carriage clears it
