## MODIFIED Requirements

### Requirement: WYSIWYG pen-path rendering

The canvas SHALL render the actual flattened pen path that will be plotted — not a thumbnail or an
approximation — so what the operator sees is what the machine draws. Each artwork SHALL be drawn in
the colour and line width of the pen assigned to it, so the preview also shows *what it will be
drawn with*.

#### Scenario: Preview equals the plot

- **WHEN** artwork is placed on the page
- **THEN** the canvas shows the same polylines the G-code generator will emit, under the same
  placement

#### Scenario: The pen is visible in the preview

- **WHEN** artworks on the page are assigned different pens
- **THEN** each is drawn in its own pen's colour and weight
