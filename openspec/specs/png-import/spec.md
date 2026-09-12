# png-import

## Purpose

Load raster images (PNG/JPEG) in the browser and trace grayscale brightness iso-contours into plottable polylines, feeding the same placement and G-code pipeline as imported SVGs. Threshold and levels controls govern how the image is traced.
## Requirements
### Requirement: Load a raster image

The system SHALL let the operator load a raster image (PNG/JPEG) from disk and process it in the browser without uploading it to any server.

#### Scenario: Load an image

- **WHEN** the operator selects a PNG/JPEG file
- **THEN** the app rasterizes it and makes its traced geometry available for placement on the page

#### Scenario: Unreadable image

- **WHEN** the file cannot be decoded as an image
- **THEN** the app reports a clear message and does not crash or leave a partial artwork

### Requirement: Trace the image into plottable polylines

The system SHALL convert a raster image into polylines a pen plotter can draw, by reading its grayscale and tracing brightness iso-contours (marching squares) into closed/open polylines. The result is the outline of the dark regions — a line drawing — not a filled image.

#### Scenario: Image becomes a line drawing

- **WHEN** an image is traced
- **THEN** the produced artwork is a set of polylines outlining the dark regions, suitable for pen plotting, and feeds the same placement/G-code pipeline as imported SVGs

#### Scenario: Blank or no-contrast image

- **WHEN** an image yields no contours at the chosen threshold
- **THEN** the app reports that no contours were found and suggests adjusting the threshold or using a higher-contrast image

### Requirement: Tracing controls

The system SHALL expose a darkness **threshold** (0–1) and a number of brightness **levels** (1 = a single outline; more = nested contours that read as tonal shading), plus **invert** and **contrast** pre-processing of the image's grayscale. These controls SHALL apply **live to the artwork already on the page** — changing a control re-traces that placed artwork in place and updates the preview, without re-importing the file — and SHALL be **per-artwork** (each traced image carries and persists its own values). Re-tracing on a control change SHALL reuse the already-decoded image rather than re-reading the file.

#### Scenario: Threshold and levels affect the trace live

- **WHEN** the operator changes the threshold or levels of a placed PNG artwork
- **THEN** a higher threshold inks more of the image and more levels add nested tonal contours, and the on-page artwork re-traces and the preview updates without re-importing

#### Scenario: Invert and contrast shape the trace

- **WHEN** the operator inverts or adjusts the contrast of a placed PNG artwork
- **THEN** the grayscale used for tracing is transformed accordingly (inverted, or contrast-adjusted) and the trace updates, letting high-key or inverted images yield usable ink

#### Scenario: Controls are per-artwork and persisted

- **WHEN** two PNG artworks are placed and one is retuned, and the session is reloaded
- **THEN** each artwork retains its own threshold/levels/invert/contrast values

### Requirement: The conversion is chosen, not assumed

Raster import SHALL let the operator choose how the image becomes lines, rather than applying one
fixed conversion. Where an object was imported through that choice, the app SHALL NOT also offer a
second, independent set of conversion controls for it.

#### Scenario: Choosing the conversion

- **WHEN** the operator imports a raster image
- **THEN** they choose the algorithm and its parameters, with a preview, before it is added

#### Scenario: One place to retune

- **WHEN** the operator selects an object imported through the wizard
- **THEN** it offers reopening the wizard, and not a separate set of controls that would discard
  the wizard's result
