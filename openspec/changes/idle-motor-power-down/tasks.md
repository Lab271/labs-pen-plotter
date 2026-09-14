## 1. The rules, as pure functions

- [x] 1.1 `src/grbl/motorPower.ts`: `MotorPower` (`powered` / `posTrusted` / `reason`),
      `shouldDropMotors` (now, last activity, period, connected, busy, already-off) and
      `reduceMotorPower` over `idleTimeout | manualOff | staleRestore | motion | setWorkZero`
- [x] 1.2 Unit tests: the timer against the busy predicate (streaming, queued, paused, `Run`,
      `Hold`, **pen-change hold**), period of zero, negative and non-finite periods, not connected,
      already off, exactly-at-the-boundary, and the trust state machine idle → untrusted →
      jogged (still untrusted) → re-zeroed → trusted
- [x] 1.3 `motorIdleMin` in `Calibration` (default 60, `0 = never`), picked up by the existing
      generic normalisation

## 2. The daemon owns the state

- [x] 2.1 `gateway/server.ts`: activity clock bumped by motion commands and by `Run`/`Jog` status,
      not by session/project/settings housekeeping
- [x] 2.2 30 s ticker calling `shouldDropMotors`; on a drop, `$MD` first and state only after it
      resolves
- [x] 2.3 A drop clears `posReady`, invalidates the saved position (`trusted: false`, written
      synchronously) and broadcasts; `motorsOff` from a client takes the same path
- [x] 2.4 `restoreSavedPosition` refuses a file marked untrusted and comes up untrusted instead;
      a file with no flag is still trusted
- [x] 2.5 `setWorkZero` restores trust, resumes persistence and broadcasts
- [x] 2.6 Refuse `plot` and `goToWorkZero` with the reason while untrusted; `stop` aborts without
      the return-home; jog untouched

## 3. The protocol, and the clients

- [x] 3.1 `src/gateway/protocol.ts`: `motors` in `Snapshot` and in `ForwardedEvents`
- [x] 3.2 `src/transport/GatewayClient.ts`: emit `motors` from the snapshot and forward the event

## 4. The wizard

- [x] 4.1 `src/ui/RezeroWizard.tsx`: explain → position (jog, pen up/down, live readout marked
      meaningless) → set home → confirm
- [x] 4.2 `src/ui/App.tsx`: open it on the transition to untrusted and from the Home/calibration
      panel, a banner while untrusted, Plot and Go to home disabled with the reason
- [x] 4.3 `src/ui/SettingsPage.tsx`: the idle period, with `0 = never` spelled out

## 5. Docs, gate, verification

- [x] 5.1 README, CHANGELOG
- [x] 5.2 `mise run ci` green
- [x] 5.3 Verified in the browser: the wizard opens when the position goes untrusted, the banner
      shows the reason, Plot and Go to home are blocked, and setting home clears all of it
- [ ] 5.4 ⚙ HARDWARE: after the configured period the drivers audibly drop out and the gantry can
      be pushed by hand
- [ ] 5.5 ⚙ HARDWARE: the motors re-energize on the first move after a power-down (no `$ME` is
      sent — FluidNC documents no such command)
- [ ] 5.6 ⚙ HARDWARE: a plot started after completing the wizard lands on the paper, and a plot is
      genuinely refused before it
- [ ] 5.7 ⚙ HARDWARE: a pen-change hold longer than the idle period does not drop the motors, and
      the rest of the drawing lands in register
