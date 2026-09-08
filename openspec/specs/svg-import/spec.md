# svg-import

## Purpose

Load SVG files in the browser and flatten their stroke geometry into polylines sized in real-world millimeters, ready for placement and plotting. Fill-based geometry is out of scope and operators are guided toward PNG import for those cases.
## Requirements
### Requirement: Load an SVG file

The system SHALL let the operator load an SVG file from disk and parse it in the browser without uploading it to any server.

#### Scenario: Load a valid SVG

- **WHEN** the operator selects an `.svg` file
- **THEN** the app parses it and makes its geometry available for placement on the page

#### Scenario: Invalid or empty file

- **WHEN** the selected file is not valid SVG or contains no drawable geometry
- **THEN** the app reports a clear message and does not crash or leave a partial artwork

### Requirement: Flatten geometry to polylines

The system SHALL convert the SVG's stroke geometry into polylines (sequences of straight segments), flattening curves and arcs at a tolerance expressed in millimeters. This tolerance SHALL be an **operator-controlled, live, per-artwork** setting (a sampling/smoothness control) rather than a fixed import-time constant: changing it re-flattens the placed SVG in place and updates the preview without re-importing, and each placed SVG carries and persists its own value. It MUST bake in element transforms so nested/grouped geometry is positioned correctly.

#### Scenario: Curves are flattened within tolerance

- **WHEN** an SVG contains Bézier/arc paths
- **THEN** they are sampled into polylines whose deviation from the true curve is within the configured tolerance

#### Scenario: Adjusting sampling re-flattens live

- **WHEN** the operator changes the sampling tolerance of a placed SVG artwork
- **THEN** the SVG re-flattens at the new tolerance (finer or coarser) and the preview updates without re-importing the file

#### Scenario: Nested transforms are applied

- **WHEN** geometry sits inside transformed groups
- **THEN** the resulting polylines reflect the cumulative transform (position/scale/rotation) of each element

#### Scenario: Hidden geometry is not plotted

- **WHEN** the SVG contains hidden geometry — elements (or ancestor groups) with `display:none`, `visibility:hidden`, or `opacity:0`, or geometry inside definition containers (`defs`, `clipPath`, `symbol`, `mask`, `marker`, `pattern`)
- **THEN** that geometry is skipped and does not appear in the imported artwork or the plot, matching what a browser actually renders

### Requirement: Real-world sizing from the SVG

The system SHALL determine the artwork's real-world size in millimeters using the SVG's `viewBox` and width/height, so a known-size SVG imports at a sensible default scale.

#### Scenario: Sized SVG imports at correct mm

- **WHEN** an SVG declares its dimensions (e.g. via `viewBox` + mm width/height)
- **THEN** the imported artwork's default size in millimeters matches those dimensions

#### Scenario: Any CSS absolute unit is honored

- **WHEN** the root `width`/`height` is given in `mm`, `cm`, `Q`, `in`, `pt`, `pc` or `px`
- **THEN** the artwork imports at that physical size — a `21cm`, `8.27in` or `595pt` A4 file all measure 210 mm wide

#### Scenario: Only the height is sized

- **WHEN** the root has a `viewBox` and an absolute `height` but a missing or relative (`%`) `width`
- **THEN** the height is used to derive the physical scale

#### Scenario: No absolute size is declared

- **WHEN** the root has no `viewBox` or its width/height are missing, unitless, or relative
- **THEN** user units are treated as CSS pixels (96 per inch), the browser's own default

### Requirement: Stroke-based scope

The system SHALL treat strokes/outlines as the drawable geometry for this change. Fills (hatching), `<text>` outlining, and clipping are explicitly NOT converted and SHALL be ignored without error; the app SHOULD indicate when content was skipped.

#### Scenario: Fills and text are skipped, not fatal

- **WHEN** an SVG contains filled regions or `<text>` elements
- **THEN** the app imports the stroke geometry it can plot, skips the rest, and surfaces a note that some content was not converted

#### Scenario: A fully fill-based SVG is guided to PNG import

- **WHEN** an SVG has no usable stroke geometry (e.g. a potrace-style fill-only trace)
- **THEN** the app reports that the SVG is fill-based and suggests exporting/importing it as a PNG (which is traced into outlines), rather than failing silently

