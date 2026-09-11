## Why

The machine holds one pen. A drawing that uses three needs the plot to stop twice, in a place
where a hand can safely reach in, and carry on afterwards without losing or repeating a stroke.
Nothing in the stack could express that: a program was one continuous stream of lines, and the
only thing that ever stopped it was the operator pressing Pause or a watchdog aborting it.

Pens (#2) gave artwork a pen. This is what makes that mean something at the machine.

## What Changes

- `generatePenGroupGcode` emits one program for several pens, with a **pen-change marker**
  between groups. Each group ends **parked at the work origin with the pen up** — a pen must not
  be swapped over the drawing.
- The marker is a **G-code comment** (`;PENCHANGE <pen>`), not `M0`: the pause is in software, so
  it needs nothing from the firmware, and the decision to carry on belongs to the daemon rather
  than to a button on the machine. A machine fed the program directly just draws it in one pass.
- The streaming controller splits a program at its markers and **queues only one segment at a
  time**, so the machine physically cannot run past a pen change. The prompt waits for `Idle`, not
  merely for the last ack: an ack means the line reached the planner, and a pen swapped mid-move
  is a ruined sheet.
- `continueProgram` (controller → daemon command → client) releases the next segment. It is a
  no-op unless a pen change is pending, so two clients pressing Continue cannot skip a segment.
- The prompt is **daemon state**, carried in the attach snapshot: a client that reloads or attaches
  mid-job sees it and can answer it.
- The plot is grouped by pen in **pen-library order**, so the colour sequence is predictable, and
  reordering the library reorders the plot.

## Capabilities

### Added Capabilities
- `multi-pen-plotting`: a drawing using several pens plots as one job that pauses for each pen
  change and resumes exactly where it stopped.

### Modified Capabilities
- `gcode-streaming`: a program may contain pen changes; streaming holds at each one until told to
  continue, and progress spans the whole job.
- `gateway-protocol`: the snapshot carries a pending pen change, an event announces one, and a
  command continues the job.

## Impact

- **Code:** new `src/grbl/program.ts` (+ tests); `src/plot/gcode.ts`, `src/grbl/GrblController.ts`,
  `src/gateway/protocol.ts`, `gateway/server.ts`, `src/transport/GatewayClient.ts`, `src/ui/App.tsx`.
- **Behaviour:** a single-pen drawing produces byte-for-byte the program it did before. The
  self-update refusal now also covers a job held at a pen change — idle, empty-queued, and very
  much mid-job.
- **Hardware:** unverified on the machine; the pen-change pause itself is software, but the park
  position and the resume-after-swap want confirming on a real plot.
