## Context

`prepareForCut` was two transforms in a fixed order (compensate, then overcut) on one polyline,
returning one polyline. Tabs break that shape: one contour becomes several strokes.

## Decisions

- **Tabs are a split, not a new concept.** The writer already puts the tool up between strokes, so
  a tabbed contour is just several strokes and the bridges come out for free. Nothing downstream —
  ordering, framing, the estimate — needs to know tabs exist.
- **Order: compensate → overcut → tabs, and `closed` decided once up front.** Tabs have to come
  last, because after them there is no closed contour left for the overcut to recognise and it
  would silently do nothing. For the same reason "was this closed?" is answered before any
  transform runs and carried through: it is a property of the artwork, not of the intermediate path.
- **Tabs stay out of the stretch the overcut re-traces.** Otherwise the overcut cuts through the
  first bridge — the interaction the issue flagged, and the one that would make both features look
  broken at once.
- **Bridges are nudged off corners.** Even distribution by arc length is the v1 rule, but a bridge
  landing on a corner tears rather than snapping, so a tab within a millimetre of a sharp turn
  shuffles along the contour (bounded, so it cannot walk into its neighbour).
- **The count is reduced, not honoured blindly.** Each bridge needs cut on both sides of it; asking
  for fifty on a short contour would produce a dotted line, so the number is capped by what the
  contour can afford.
- **No degenerate fragments.** `orderPolylines` drops anything shorter than two points, so a
  zero-length slice would vanish silently and leave an unexplained gap in the cut. Slices that
  collapse are discarded explicitly instead.
- **Stroke reversal is already off when cutting** (#58), which resolves the issue's other worry:
  tab positions are relative to the contour's start, and a reversed contour would move them.
- **The cut preview draws the prepared path over faded artwork.** Grey is the drawing, red is what
  the knife does. Fading rather than hiding keeps the object selectable and draggable.

## Risks / Trade-offs

- Tab width is a length along the path, not a chord: on a tight curve the bridge is very slightly
  longer than the straight-line gap. At 0.5 mm the difference is far below the kerf.
- A tab is placed by arc length from the contour's start, which is wherever the importer began the
  path. Two visually identical contours can therefore have bridges in different places. Consistent
  placement would need a canonical start point, which is a bigger idea than this needs.
