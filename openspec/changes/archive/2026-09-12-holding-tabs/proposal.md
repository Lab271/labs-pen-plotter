## Why

A closed contour is severed the moment its loop closes — and the overcut added in #58 exists to
make sure of it. That is right for the last piece and wrong for every piece before it:

- a freed piece can shift or lift under the drag knife while later contours are still being cut;
- pieces come loose during the job rather than at weeding time, so the sheet cannot be handled as
  one until it is finished;
- there is no way to cut a part that should stay put — a hinged flap, or something to be snapped
  out by hand later.

Overcut and tabs are opposite controls, and both are wanted, per job.

## What Changes

- **`src/plot/tabs.ts`** — a pure transform: a closed cut path in, the strokes that should actually
  be cut out, with the bridge spans omitted. No new idea is needed downstream, because the G-code
  writer already lifts the tool between strokes.
- **Tab settings in the knife profile**: count, width (default 0.5 mm), and a minimum contour
  length below which a contour gets none. **Off by default** — a cut with no tabs is what the
  machine did before, and a piece that unexpectedly stays attached is as surprising as one that
  does not.
- **Bridges avoid sharp corners**, where a bridge tears instead of snapping, by nudging along the
  contour until they sit on a straight span.
- **Bridges keep clear of the overcut**, which re-traces the start of the path — a tab there would
  be cut straight through, making both features look broken at once.
- **The canvas shows the prepared cut path**: the overcut tail and the tab gaps, drawn over faded
  artwork, because where a piece stays attached is exactly what has to be checked before a sheet of
  vinyl is committed.

## Capabilities

### Modified Capabilities
- `cutting-mode`: cut contours can be interrupted by holding tabs, and the preview shows them.

## Impact

- **Code:** new `src/plot/tabs.ts` (+ tests); `src/plot/cut.ts`, `src/plot/knife.ts` (via
  `CutOptions`), `src/ui/SettingsPage.tsx`, `src/ui/PlotCanvas.tsx`, `src/ui/App.tsx`.
- **Behaviour:** with tabs off, `prepareForCut` produces exactly what it did before, pinned by a
  test. Drawing mode is untouched.
- **Hardware:** unverified — a real sticker has to confirm the piece stays put during the job and
  snaps out cleanly afterwards.
