## Why

The steppers are energized 24/7. `motorsOff()` (FluidNC `$MD`) exists only behind a manual button,
and nothing — no timer, no keep-alive, no controller-side idle disable — ever de-energizes them. An
unattended plotter therefore sits at full holding current indefinitely: wasted power, heat in the
drivers, coil whine in the room, and wear for no work done. The machine is idle far more than it
plots.

Turning them off is the easy half. This machine has **no limit switches and no homing** (`$22=0`),
so the work origin exists only because the operator put it there by hand, and the energized
steppers are the only thing holding the gantry. Once they drop out the gantry can be pushed or sag
on the long axis, and FluidNC has no encoder feedback — it keeps reporting the pre-shutdown
coordinates whatever the gantry actually did. The reported position becomes a *claim*, not a
measurement.

The daemon has no way to say that today. `posReady` is cleared on **disconnect** and re-set by a
restore or by Calibrate, but nothing clears it while the daemon stays connected — which is exactly
the case a motor power-down creates. Worse, `persistState` keeps writing the position to disk and
`restoreSavedPosition` feeds it back through `G10 L20` on the next connect, reinstating an origin
recorded after the gantry was free to move. With soft limits disabled per-axis, nothing then stops
a plot from driving into the frame. **Auto-off without the trust handling is worse than leaving the
motors on**, so the two halves ship together.

## What Changes

- **Idle auto-off.** The daemon tracks time since the last commanded motion and sends `$MD` after a
  configurable period (default 1 h; 0 = never, which is also the "keep the motors on" override).
  It never fires while `isPlotting()` — which already encodes streaming, queued, paused, `Run`,
  `Hold` **and a pen-change hold**, the case that looks idle and is not.
- **Position trust becomes explicit state.** Dropping the motors — on the timer *or* on the manual
  **Motors off** button — marks the position untrusted, stops persistence, and rewrites the saved
  state file with `trusted: false` so a restore after a daemon restart refuses it instead of
  reinstating a dead origin.
- **The gateway gates motion that depends on the origin.** Plot and Go to home are refused with the
  reason, for every connected client, enforced next to the command handlers rather than in the
  browser. Stop still stops — it just does not rapid to an origin nobody believes. Jog stays
  allowed: the operator needs it to reach the corner, and its numbers are simply meaningless until
  re-zeroed.
- **A re-zero wizard** (`src/ui/RezeroWizard.tsx`, modelled on the registration wizard) explains
  that the motors were powered down and home is gone, says plainly that the gantry will not fight
  back, walks the operator to the paper's top-left corner by hand or by jog, and ends on Set —
  `setWorkZero()`, the same call Calibrate makes. It opens by itself when the position goes
  untrusted and from the Home/calibration panel, and a banner keeps the state visible until it is
  cleared.
- **`src/grbl/motorPower.ts`** holds the two pure rules — when the motors may be dropped, and what
  each event does to trust — so the part that decides is unit-tested rather than living in a timer.

## Capabilities

### Added Capabilities
- `motor-power`: the steppers are energized only while they are needed, and the software knows the
  moment the reported position stopped being a measurement.

### Modified Capabilities
- `work-coordinates`: the work origin can be *lost* as well as set, and motion that depends on it is
  refused while it is.
- `gateway-protocol`: motor power and position trust are in the snapshot and pushed as an event, so
  every client agrees.
- `app-settings`: the idle period is part of the shared machine setup.

## Impact

- **Code:** new `src/grbl/motorPower.ts` (+ tests) and `src/ui/RezeroWizard.tsx`;
  `gateway/server.ts`, `src/gateway/protocol.ts`, `src/grbl/settings.ts`,
  `src/transport/GatewayClient.ts`, `src/ui/App.tsx`, `src/ui/SettingsPage.tsx`.
- **Behaviour:** an operator who walks away for an hour comes back to a machine that has forgotten
  where the paper is and says so. That is the point — it forgot the moment the motors dropped; the
  change is that it now admits it instead of plotting from a guess.
- **Hardware:** unverified on the machine. Whether the drivers audibly drop out, whether the gantry
  is genuinely free, and whether the motors re-energize on the next move all want the real UUNA TEK.
