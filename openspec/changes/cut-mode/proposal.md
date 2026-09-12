## Why

The machine does two jobs with opposite rules, and the app could not tell them apart. A pen wants
fit-to-page, hatching, one Z and a fast feed; a drag knife wants 1:1 placement, contours only, a
deeper Z, a slower feed, and two things a pen has never needed — an **overcut** so the loop
releases, and **blade-offset compensation** so corners are not rounded off. Every cut job meant
re-typing the pen's settings and remembering which of the app's helpers not to press.

## What Changes

- A **Mode** control (Draw / Cut) in the header, saved with the session — it belongs to the job on
  the bed, since the sheet of vinyl is what makes it a cut.
- A **knife tool profile** in app settings (`src/plot/knife.ts`): Z, dwell, cut feed, travel feed,
  overcut, blade offset. Separate from the pen's calibration, so switching mode does not mean
  re-typing either tool.
- **`src/plot/cut.ts`** — pure geometry: `isClosed`, `applyOvercut`, `applyBladeOffset`,
  `prepareForCut`. Cutting needs different *geometry*, not a different G-code writer.
- **Cut mode changes the job end to end**: imports are placed 1:1 (at the file's page position
  where it has one), the wizard offers only outline conversions, the canvas draws in cut red, the
  button says Cut, and the program uses the knife's Z and feeds.
- `generateGcode` gains `allowReverse`, off for cutting: compensation overshoots each corner along
  the direction of travel, so a reversed contour points every overshoot into the piece.

## Capabilities

### Added Capabilities
- `cutting-mode`: a job is drawing or cutting, and that choice drives placement, conversion,
  preview and the toolpath.

### Modified Capabilities
- `gcode-generation`: stroke direction can be preserved, for tools where direction matters.

## Impact

- **Code:** new `src/plot/cut.ts` and `src/plot/knife.ts` (+ tests); `src/plot/gcode.ts`,
  `src/plot/algorithms.ts` (a `fills` flag), `src/gateway/appSettings.ts`, `src/ui/App.tsx`,
  `src/ui/PlotCanvas.tsx`, `src/ui/ImportWizard.tsx`, `src/ui/SettingsPage.tsx`,
  `src/ui/sessionStore.ts`.
- **Behaviour:** Draw mode is unchanged and is the default. Blade-offset compensation ships **off**
  — a wrong offset is worse than none, and the right value has to be measured on the actual holder.
- **Hardware:** unverified on the machine. The overcut and the knife profile want a real sticker.
