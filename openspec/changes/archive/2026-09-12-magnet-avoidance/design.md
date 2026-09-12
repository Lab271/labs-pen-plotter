## Context

`generateGcode` emitted travel as a single `G1` from the end of one stroke to the start of the
next. Nothing in the pipeline was obstacle-aware; the magnet work added the obstacles.

## Decisions

- **Iterative push-out, not a path planner.** Find the first zone the leg clips, move the leg's
  closest approach out past that zone's edge, and route the two halves the same way. With a handful
  of well-separated circles this converges in a couple of levels and the result hugs the zone. A
  visibility graph would be the general answer to a problem this does not have.
- **Bounded depth.** Each level takes a smaller bite, so four is already far below a tenth of a
  millimetre — but the cap is there for the degenerate input, where an unbounded recursion would
  build G-code until the tab died.
- **An endpoint inside a zone means give up, not fail.** There is no detour to a destination that
  is itself in the keep-out, and that case is geometry the operator has to move — it is blocked
  before plotting. Routing should not paper over it.
- **One emitter for every travel leg.** The first leg from the origin, every leg between strokes,
  the leg before each pen change, and the return home all go through the same function. The return
  home is as long as any and just as capable of hitting a magnet.
- **`travelLegs` is the same code the writer uses**, exported rather than reimplemented — a preview
  that disagreed with the G-code would be reassuring about a detour that is not happening. A test
  pins the two against each other.
- **Only bent legs are drawn.** Rendering every pen-up move would bury the artwork in dashes; the
  detours are what the operator needs to check.
- **The warning names the magnet and the artwork.** "2 magnets are in the way" is not actionable;
  "the magnet at 245, 155 mm on Rect" sends the operator to the right place on the bed.

## Risks / Trade-offs

- The detour is not the shortest path around the circle — it is a few short segments that clear it.
  On a machine where travel is already the cheap part of a plot, simple and obviously-correct beats
  optimal.
- Stroke *ordering* is still zone-blind: the nearest next stroke may be one that needs a detour
  where a slightly further one would not. The issue lists that as a nice-to-have, and correct
  routing is the part that keeps the carriage off the magnet.
