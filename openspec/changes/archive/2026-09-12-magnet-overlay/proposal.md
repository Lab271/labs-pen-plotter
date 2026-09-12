## Why

The bed has no vacuum. Paper and vinyl are held down by magnets dropped on the sheet, and the app
had no idea they existed. A magnet under the carriage's path is not cosmetic: at travel feed the
holder strikes it, drags the sheet, and the work origin is gone — and with no limit switches
(`$22=0`, no `$H`), nothing recovers it. The operator's only defence was remembering.

## What Changes

- **`src/plot/magnet.ts`** — the geometry: a magnet is a centre plus a *keep-out radius* (its own
  size plus clearance for the holder), with segment-accurate hit testing, a recommender, and
  normalisation for stored data.
- **Magnets live in the session**: they belong to the sheet currently on the bed, and they outlive
  a browser tab because the machine is still holding that sheet down.
- **On the canvas** they are drawn to scale as keep-out circles, draggable to move, and turn red
  when the artwork runs into one.
- **Suggest** puts them at the corners and edge midpoints, with the whole circle on the paper, and
  drops any position that would sit on the drawing.
- **Plotting is blocked** when drawn geometry crosses a magnet, naming how many.

## Capabilities

### Added Capabilities
- `magnet-placement`: the operator tells the app where the hold-down magnets are; it shows them,
  suggests clear positions, and refuses to plot through one.

## Impact

- **Code:** new `src/plot/magnet.ts` (+ tests); `src/ui/App.tsx`, `src/ui/PlotCanvas.tsx`,
  `src/ui/sessionStore.ts`.
- **Behaviour:** advisory for *travel* — a plot whose pen-up legs cross a magnet is still allowed,
  because the fix for that is to route around it, which is #64. What is blocked here is the case
  routing cannot fix: geometry that has to be drawn where the magnet is.
