## Context

Nothing in the pipeline was obstacle-aware, and nothing in the UI could express "there is a thing
on the bed". The registration wizard already proves the shape of the answer for a different
problem — the operator tells the app something about the physical world, and the app uses it.

## Decisions

- **A magnet is a keep-out circle, not a magnet.** What matters is how close the tool may come, so
  the stored radius is the magnet's own radius *plus* clearance. Drawing it to scale means the
  operator sees the zone rather than a marker whose meaning they have to remember.
- **Hit testing is against the strokes, not the bounding box.** A ring-shaped drawing has a large
  empty middle: a magnet there is genuinely safe for drawing, and a bbox test would refuse to plot
  a perfectly good job. Point-to-segment distance also catches the case that matters most — a long
  travel leg with a magnet somewhere in the middle and nothing but its two endpoints to test.
- **Blocking is limited to drawn geometry.** Travel *can* be routed around a magnet (#64); a stroke
  cannot. Blocking what routing will later fix would be a warning the operator learns to ignore.
- **Suggestions are dropped, not nudged.** A candidate that overlaps the drawing is simply not
  offered: a suggestion quietly shifted somewhere arbitrary is worse than a visible gap the
  operator fills by hand.
- **The whole circle has to be on the paper.** A magnet half off the sheet holds nothing down.
- **Session, not settings.** Magnets belong to the sheet on the bed right now, like the artwork —
  not to the machine's configuration.

## Risks / Trade-offs

- The default radius (12 mm) is a guess at "20 mm magnet plus clearance". It is editable per
  magnet, and a shared default belongs with the settings work that #64 needs anyway.
- Positions are entered on the canvas, in paper coordinates. Jogging the carriage over each magnet
  and pressing Set — the registration wizard's trick — would record them where the machine can
  actually reach, and is the better flow; it is left to #64, which is where routing makes the
  precision matter.
