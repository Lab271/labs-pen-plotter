## 1. Program model

- [x] 1.1 `src/grbl/program.ts`: `PEN_CHANGE_PREFIX`, lax marker matching, `stripComment`,
      `splitPenSegments`
- [x] 1.2 Unit tests: no markers, several markers, label capture, markers excluded from machine
      lines, comments/blank lines dropped, unlabelled marker

## 2. Generation

- [x] 2.1 `generatePenGroupGcode` in `src/plot/gcode.ts` — park-then-marker between groups
- [x] 2.2 Unit tests: marker count and labels, park before each change, single-group output equals
      `generateGcode`, empty groups dropped, group strokes stay in their own segment, the time
      estimate is unaffected by markers

## 3. Streaming

- [x] 3.1 Controller splits at markers, queues one segment, holds, and exposes `penChange`
- [x] 3.2 `continueProgram`, ignored unless a change is pending; `pump` refuses to feed while held
- [x] 3.3 Unit tests: no lines sent past the marker, prompt waits for Idle, continue sends the next
      segment, stray continue ignored, Resume cannot bypass the hold, progress spans the job,
      completion after the last segment, a second plot is refused while held, empty segment skipped

## 4. Protocol, daemon, UI

- [x] 4.1 `continueProgram` command, `penChange` event, pending change in the snapshot
- [x] 4.2 Daemon forwards it and counts a held job as plotting (so a self-update is refused)
- [x] 4.3 Modal prompt naming the pen and its colour; Continue releases the job; the stall watchdog
      is suppressed while held
- [x] 4.4 Plot groups artwork by pen in library order

## 5. Docs, gate, verification

- [x] 5.1 README, CHANGELOG
- [x] 5.2 `mise run ci` green
- [x] 5.3 Verified in the browser against a simulated gateway: two pens → one prompt naming the
      second pen with its colour, Continue completes the job, and a reload mid-hold restores the
      prompt from the snapshot
- [ ] 5.4 ⚙ HARDWARE: plot a two-pen drawing on the machine — confirm it parks at the origin with
      the pen up, waits, and resumes on Continue with no lost or repeated stroke
