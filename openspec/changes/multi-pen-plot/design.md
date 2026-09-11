## Context

`streamProgram` enqueued the whole program at once and let the character-counting pump feed it.
Completion already had the subtle part right — it waits for the queue to empty *and* the machine to
report `Idle`, because an `ok` only means the line reached the planner. A pen change needs exactly
the same care, one segment earlier.

## Decisions

- **A comment marker, not `M0`.** `M0` would put the decision in the firmware and the machine's
  buttons, and its behaviour varies (FluidNC vs. GRBL, and what "cycle start" resumes). A comment
  is inert to the machine — a program exported and run elsewhere simply draws in one pass — and
  lets the daemon own the hold, which is where control arbitration and client state already live.
- **Queue one segment at a time.** The alternative (queue everything, pause the pump at the right
  line) leaves the next pen's strokes sitting in the RX buffer, one bug away from being drawn with
  the wrong pen in the holder. Not enqueueing them makes that failure impossible rather than
  unlikely. `pump()` also refuses to feed while a change is pending, so Resume cannot release it.
- **Prompt on `Idle`, not on the last ack.** Same reason completion does: the machine is still
  travelling back to the origin when the final `ok` arrives. Prompting then would invite a hand in
  while the gantry is moving.
- **Park at the work origin before every change.** Predictable, out of the drawing, and already
  the program's end position — the operator swaps a pen in the same place every time.
- **`continueProgram` is idempotent-ish.** It does nothing unless a change is pending. With
  several clients attached, two Continues must not advance two segments.
- **Order by the pen library.** Import order is arbitrary and changes as artwork is added; the
  library is a list the operator controls, so it is both predictable and the reorder mechanism.
- **Single-pen output is unchanged.** `generatePenGroupGcode` delegates to `generateGcode` when one
  group draws, and drops groups with nothing in them — an empty group would otherwise ask the
  operator to load a pen that draws nothing.
- **The stall watchdog has to know.** The UI aborts a plot that sits `Idle` without progress for
  20 s. A pen change is exactly that, deliberately, so the watchdog is suppressed while a change is
  pending and its window restarts on Continue.

## Risks / Trade-offs

- A job held at a pen change depends on someone pressing Continue; the machine waits indefinitely.
  That is the intended behaviour (it is parked and idle, with the pen up), and any attached client
  can answer it — including one that attaches afterwards.
- Feed override resets to 100% only at the start of a program, so a speed set mid-job survives a
  pen change. That matches Pause/Resume and seems right: the change is not a new job.
- Progress is line-based across the whole program, so the bar does not stop at a group boundary;
  the prompt says how much is drawn instead.
