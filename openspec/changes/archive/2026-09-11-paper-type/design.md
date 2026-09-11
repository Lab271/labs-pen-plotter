## Context

`paper.ts` held sizes and nothing about appearance; `PlotCanvas` hardcoded `fill="#ffffff"` for the
sheet and `#475569`/`#1d4ed8` for strokes. Paper size already lives in the session, so the natural
home for its appearance is the same place.

## Decisions

- **Preview-only, by construction.** The style is not threaded into the plot path at all:
  `generateGcode` takes polylines and pen options, and neither gains a paper argument. There is
  therefore no way for a pattern to end up plotted — the guarantee is structural, not a rule
  someone has to remember.
- **A tiled fill, not pattern geometry.** One `Rect` with a repeating canvas tile, scaled from a
  fixed pixel pitch to the style's mm pitch. Drawing a 5 mm dot grid as real nodes on an A0 sheet
  is ~40 000 circles that Konva would reconcile on every drag; the tile is one node and stays
  crisp at any zoom the bed fit produces. The tile is drawn at the cell's edge so neighbouring
  tiles join into continuous rules.
- **A `dark` flag rather than computed luminance.** Only the style author knows whether a sheet is
  "white pen territory"; a luminance threshold would flip kraft or a mid grey unpredictably. Two
  stroke colours (normal and selected) switch on it.
- **Fall back to plain white for an unknown id.** Sessions outlive the style list; an id that no
  longer exists must open as ordinary white paper, not as a crash or a blank sheet.
- **Session, not app settings.** Which stock is on the bed is a property of the job in front of
  the operator, like the size and orientation next to it — not a machine setting. A default paper
  type in app settings is left to the issue that asks for one.

## Risks / Trade-offs

- The tile is regenerated whenever the style changes (a memo on the style object). That is one
  small offscreen canvas per change — negligible next to the artwork nodes.
- Only the artwork stroke colour adapts to dark stock; the pen marker and the bed stay as they
  are. They read fine against every style here, and a pen colour model is coming with pens.
