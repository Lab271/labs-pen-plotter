## Why

Every drawing had to start somewhere else. A rectangle, a circle or a label meant opening Inkscape,
exporting an SVG and importing it — for geometry the app can generate exactly, at exactly the size
asked for.

Text is the harder half: an outline font is the wrong tool for a plotter. It gives the *contour* of
a letter, which the pen traces as a hollow double line. A plotter needs a **single-line** face —
one stroke down the skeleton of each letter.

## What Changes

- **`src/plot/shapes.ts`**: line, rectangle, ellipse and regular polygon as polylines, in the same
  frame an import arrives in, so a drawn shape is an object like any other.
- **`src/plot/font.ts`**: a built-in single-line stroke font (upper and lower case, digits,
  punctuation) and `textPolylines`, which scales cap height to millimetres, lays out multiple
  lines, and reports characters it cannot draw.
- Objects carry the **spec** they were generated from, persisted with the session, so text stays
  editable after a reload — a label you cannot retype is barely a label.
- Create from the Artwork panel (Line / Rect / Ellipse / Polygon / + Text); edit in the drawing
  controls panel (size, sides; text content, size, letter and line spacing).

## Capabilities

### Added Capabilities
- `shapes-and-text`: primitives and single-line text can be drawn on the page as plottable objects
  and edited after the fact.

## Impact

- **Code:** new `src/plot/shapes.ts` and `src/plot/font.ts` (+ tests); `src/ui/App.tsx`,
  `src/ui/sessionStore.ts`.
- **Behaviour:** drawn objects are ordinary scene objects — selected, moved, copied, assigned a
  pen and plotted by the existing pipeline. No G-code generation change.
