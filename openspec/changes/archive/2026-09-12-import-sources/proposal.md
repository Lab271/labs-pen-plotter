## Why

The import button said "+ Image" but meant "SVG, PNG, JPEG or WebP", and it decided which by looking
at the file's *name*. Half an operator's sources are neither: the print-and-cut files come as PDF,
phones produce HEIC, and a sketch on paper is a photograph that has to be taken, not found.

## What Changes

- **Files are identified by content** (`src/plot/sniff.ts`), not by extension: operators rename
  files, and a phone hands over an `image.jpg` that is really HEIC.
- **PDF** (`src/plot/pdf.ts`): a vector page becomes lines at the size the page declares — with the
  page position kept, so Place on page and the registration wizard work as they do for an SVG. A
  page that is really a scan goes to the import wizard. Multi-page files ask which page.
- **HEIC is named, not just rejected**: most browsers cannot decode it, and "convert it on your
  phone" is useful where "could not read that image" is not.
- **Take photo** on a phone, via the file input's `capture` attribute — so a sketch can be
  photographed and traced standing at the machine.
- **Anything unreadable says so**, instead of adding a silent empty artwork.

## Capabilities

### Modified Capabilities
- `image-import-wizard`: one import accepts vector, raster and PDF, identified by content.
- `responsive-control`: importing a photograph is available on a phone (the camera is the point).
- `pi-deployment`: the daemon serves `.mjs`, `.wasm` and `.map` with correct types.

## Impact

- **Code:** new `src/plot/sniff.ts` and `src/plot/pdf.ts` (+ tests); `src/ui/App.tsx`;
  `gateway/server.ts`.
- **Dependency:** `pdfjs-dist`, imported on demand. The main bundle is unchanged; the library and
  its worker are separate chunks, fetched only when a PDF is opened.
- **Fixed in passing:** the daemon's static server had no MIME type for `.mjs`, so a lazily-loaded
  module chunk would have failed in the packaged build while working perfectly in the dev server.
