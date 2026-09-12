## Context

`src/plot/` could turn an SVG or a raster image into polylines; nothing could produce polylines
from parameters. The scene model (#6) made adding one straightforward: an object is geometry plus a
placement, and where the geometry came from is the object's own business.

## Decisions

- **A built-in stroke font, not a font library.** An outline font (via opentype.js or the browser)
  yields contours, which plot as hollow letters — the thing the epic explicitly says not to do.
  The alternatives were a Hershey data blob or a hand-authored face; this is the latter, kept in a
  format a human can edit: each glyph is `x,y` points with `M` starting a new stroke.
- **Font units with y up, output with y down.** Glyphs are written the way one draws them (baseline
  0, cap height 7, descenders negative). `textPolylines` flips and scales, so the rest of the
  pipeline sees exactly what an import produces and nothing else has to know about font space.
- **Size means cap height.** "20 mm text" is a capital 20 mm tall, which is what a ruler on the
  finished sheet measures. Em-based sizing would make the same number mean something smaller.
- **Unsupported characters are skipped, and reported.** Drawing a placeholder box would put marks
  on the paper that the operator never asked for and cannot undo once the pen has moved. The editor
  names what was dropped instead.
- **The spec is persisted; an import's source is not.** Regenerating text costs microseconds, so
  there is no reason to keep only the geometry — and a label that cannot be retyped after a reload
  is a bug waiting to be filed. Imported artwork keeps its in-memory source because re-tracing a
  bitmap is expensive and the source is large.
- **An edit that leaves nothing drawable keeps the old geometry.** Clearing the text box mid-typing
  would otherwise make the object vanish from the page, taking its placement with it.
- **A shape's box is the size asked for**, even where the outline does not reach the corners (an
  ellipse). Dragging a 50 mm circle should report 50 mm. Text measures its own box from the strokes,
  because a descender or a wide glyph is what actually decides it.
- **Closed contours close explicitly.** A rectangle's last point repeats its first; the ellipse and
  polygon do the same. Leaving them open leaves a gap the width of the pen tip at the start corner.
- **New objects cascade.** Three shapes added in a row at the same corner look like one.

## Risks / Trade-offs

- One face, hand-drawn: legible, and honest about being a plotter font, but not a typographic
  family. Adding faces is a matter of adding another glyph table, which is why the format is a
  string per glyph rather than generated data.
- The detail/smoothing slider also applies to drawn objects. At its default (full detail) that is a
  no-op; thinned hard it will distort letterforms, which is visible in the preview.
