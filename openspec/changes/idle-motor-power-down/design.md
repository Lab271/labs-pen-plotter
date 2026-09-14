## Context

`posReady` already exists and already means "the position is trustworthy" — it is cleared on
disconnect and re-set by a restore or by Calibrate. What it does not have is the third case: the
position going bad **while the daemon stays connected**, which is precisely what de-energizing the
steppers creates on a machine with no limit switches and no encoder feedback.

So this is not a new concept bolted on. It is the missing transition in a state machine that was
already there, plus the auto-off that makes it happen.

## Decisions

- **Daemon-driven `$MD`, not FluidNC's own idle disable.** FluidNC can disable idle steppers itself
  (per-motor `idle_ms`), and that would survive a daemon restart — but the daemon would then have to
  *detect* the dropout to invalidate the origin, and FluidNC does not report motor-enable state:
  `$MD` (`$Motor/Disable`) is documented, there is no documented `$ME`, and the status report
  (`<Idle|MPos:…>`) carries no enable field. A dropout the daemon cannot see is a lost origin the
  daemon cannot flag, which is the dangerous half. Daemon-driven means the daemon knows exactly
  when it happened, and it is the one writing the file that outlives it.

- **`isPlotting()` is the busy predicate — the only one.** It already encodes `inflight`, `queued`,
  `isPaused`, `penChange !== null`, `Run` and `Hold`. The pen-change hold is the case that matters:
  it is deliberately `Idle` with an empty queue and no motion, and it is exempt from the UI's 20 s
  stall watchdog for exactly that reason. Dropping the motors there would shift the gantry mid-plot
  and land the rest of the drawing offset on a half-finished sheet — there is no resume and no
  second sheet. A second predicate would be a second chance to forget that case.

- **The gate lives in the gateway, next to the command handlers.** The browser is a thin client and
  there can be several of them; a second tab must not be able to believe the origin is fine. The
  refusal names the reason. The UI disables the same controls, but that is a courtesy, not the
  enforcement.

- **The saved state file carries `trusted`, rather than being deleted.** Deleting it loses the last
  position entirely, which is the one thing worth keeping for diagnostics ("where did it think it
  was when it dropped?"). `trusted: false` is written **synchronously**, the same fsync+rename path
  a power-off flush uses, and `restoreSavedPosition` refuses a file that carries it. A file written
  by an older daemon has no `trusted` field and is read as trusted — that is the existing behaviour,
  unchanged, and it is correct: those files were only ever written while the motors were on.

- **A stale file makes the *daemon* start untrusted.** That is what gives the feature a restart
  story without controller-side support: power down at 02:00, daemon restarts at 09:00, the file
  says `trusted: false`, so no `G10 L20` goes out and the wizard is waiting.

- **Jog stays allowed; Stop stops but does not go home.** The operator needs jog to reach the corner
  — the motion is fine, it is the *coordinates* that mean nothing. `stopAndReturnHome` is two
  actions welded together, and only the second one is dangerous while untrusted, so while untrusted
  Stop runs the abort alone. Refusing Stop outright would take away a brake.

- **`powered` and `posTrusted` are independent axes.** The motors come back on with the next
  commanded motion (FluidNC re-energizes on a move); trust comes back only when a human sets work
  zero. Collapsing them into one flag would either claim the gantry is held when it is free, or
  claim home is known because something moved.

- **The idle period rides in `Calibration`.** That record is already the shared "machine setup and
  import defaults" grab-bag (it carries `pngThreshold` and `detail`), it already normalises every
  numeric key generically, and it already has a settings-page control pattern. `0 = never` doubles
  as the "keep the motors on" override without a second mechanism to reason about.

- **Nothing new is sent to re-energize.** There is no documented `$ME`; inventing one is how a
  position-restore bug passes review and fails on the Pi. The motors come back with the first move,
  the wizard says so, and confirming that on the machine is a hardware task.

- **The rules are pure functions in `src/grbl/motorPower.ts`.** `shouldDropMotors` and
  `reduceMotorPower` are where the branches are, and that directory is inside the coverage floor.
  A timer that calls a tested function is a timer with nothing left to test.

## Risks / Trade-offs

- **A 30 s tick against an hour-long timeout** means the drop lands up to 30 s late. That is the
  right trade: the alternative is waking the Pi 120× more often to be punctual about something
  nobody is watching.
- **The activity clock counts motion commands, not every command.** A client that autosaves its
  session must not hold the motors on forever, so housekeeping traffic is deliberately excluded —
  at the cost that an operator who is only *looking* at the app gets no reprieve. The plot itself is
  covered by `isPlotting()` and by bumping the clock on every `Run`/`Jog` status.
- **An operator who never opens Settings gets the 1 h default.** For someone mid-setup who steps
  away, the machine will have forgotten the corner when they get back. That is the honest outcome
  of a machine with no homing; the escape hatch is `0 = never`.
- **If `$MD` itself fails, nothing is marked.** The state only changes after the command resolves,
  so a failed drop leaves the motors on and the origin trusted — which is the truth.
