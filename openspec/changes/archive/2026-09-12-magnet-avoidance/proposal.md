## Why

Knowing where the magnets are is only half of it. The toolpath still drove straight through them:
`orderPolylines` picks the next stroke by nearest distance, so on an A0 bed a pen-up leg can cross
the whole sheet in one straight line — over a magnet. The carriage strikes it at travel feed, drags
the sheet, and the work origin is gone.

The advisory overlay could warn about geometry drawn *through* a magnet, which the operator can
fix by moving something. It could say nothing useful about travel, because the fix for travel is
not to move anything — it is to go around.

## What Changes

- **`src/plot/avoid.ts`** — `routeAround(a, b, zones)`: push a leg out past the edge of the first
  zone it clips, then route each half the same way, to a bounded depth. The zones are few and far
  apart, so this needs no general path planner.
- **G-code generation routes every pen-up leg**, including the first one out and the return home,
  in both the single-pen and multi-pen writers.
- **`travelLegs` is exported** and the canvas draws the detours, because a detour the operator
  cannot see is one they cannot sanity-check before starting a job.
- **The block message names the magnet and the artwork** it sits on, instead of counting.

## Capabilities

### Modified Capabilities
- `magnet-placement`: travel is routed around the zones, and the detour is visible.
- `gcode-generation`: pen-up travel may be a routed path rather than a straight line.

## Impact

- **Code:** new `src/plot/avoid.ts` (+ tests); `src/plot/gcode.ts`, `src/ui/App.tsx`,
  `src/ui/PlotCanvas.tsx`.
- **Behaviour:** with no magnets the output is byte-for-byte what it was — the routing is a no-op
  on an empty zone list, pinned by a test. The plot-time estimate costs the detours automatically,
  because it walks the emitted G-code.
- **Hardware:** unverified. A job whose travel crosses a magnet has to be run to confirm the
  carriage clears it.
