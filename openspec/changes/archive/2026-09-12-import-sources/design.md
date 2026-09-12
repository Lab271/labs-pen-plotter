## Context

`onLoadImage` branched on `file.type` and the `.svg` extension, and everything else went to
`imageToField`, which is `<img>` decoding — so whatever the browser could decode worked, and
anything else produced an error with no explanation.

## Decisions

- **Sniff the bytes.** Extensions lie, MIME types are often just the extension in disguise, and the
  cost of being wrong is a silent empty artwork rather than an error. The sniffer is pure, so each
  format's signature is pinned by a test rather than discovered on a machine with vinyl in it. The
  MIME type is kept as a tiebreak only where the bytes are genuinely ambiguous (a long XML prologue
  pushing `<svg` past the sniffed window).
- **HEIC gets its own answer.** It is an ISO-BMFF file like an MP4, distinguished by its brand.
  Naming it means the app can say what to do about it.
- **The pdf.js operator decoder is pure and the op codes are asserted at load.** Decoding runs on a
  plain operator list, so it is testable without a PDF or a DOM; the hard-coded codes are checked
  against the library's own at load time, because a renumbering in a future version would not break
  the build — it would just make every PDF import as blank.
- **A PDF page is flipped at the boundary.** PDF user space is y-up from the bottom-left. The flip
  happens in the decoder, so everything downstream keeps the single convention it already assumes.
- **Vector or scan is decided by what the page paints**, not by a setting: if there are paths, they
  are what the operator wants; if there are none, the page is rasterised and the wizard takes over.
- **Rasterising uses print intent**, although nothing is printed. pdf.js drives its display render
  loop with `requestAnimationFrame`, which does not fire in a background tab — an import started
  and then left alone would hang for ever. This is a rasterisation to trace, not something anyone
  watches.
- **The page is painted white first.** A PDF page has no background of its own; without it,
  transparent areas read as black and the whole page traces as one solid blob.
- **pdf.js is imported on demand.** It is by far the largest dependency here and most sessions
  never open a PDF, so it must not sit in the bundle every client downloads to jog the machine.
- **The camera is a separate control, mobile-only.** Putting `capture` on the main import would
  force the camera and take away the file picker. The placement controls stay on the desktop
  layout; what a phone gets is the ability to photograph a sketch and trace it.

## Risks / Trade-offs

- Vector PDFs vary enormously. This decoder handles paths, transforms and the save/restore stack;
  it ignores clipping, patterns and shading, and counts text runs rather than tracing glyph
  outlines (which would plot hollow letters). A page that is mostly text will import as very little
  and say so.
- An unknown path opcode stops that chunk rather than guessing: opcodes and coordinates share one
  stream, so reading past one turns the rest of the path into nonsense geometry.
