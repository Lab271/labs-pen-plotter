## ADDED Requirements

### Requirement: Reference layers are not cut

The system SHALL recognise reference geometry in an SVG and exclude it from the plotted artwork. Geometry is reference geometry when it sits in a layer whose label contains "calibration" or "reference" (case-insensitive), or when its element or an ancestor has an id beginning with `cal-`. As a fallback when no such labels exist, geometry stroked or filled in pure blue (`#0000FF` / `blue`) is treated as reference geometry. The operator SHALL be told how many calibration points were found and that they were excluded.

#### Scenario: Labelled calibration layer is excluded

- **WHEN** an SVG has a layer labelled `calibration REFERENCE ONLY - do not cut` containing crosshairs and dots
- **THEN** none of that geometry appears in the imported artwork's strokes, and the import note reports the number of calibration points found

#### Scenario: Blue fallback

- **WHEN** an SVG has no labelled reference layer but contains pure-blue crosshairs alongside red cut contours
- **THEN** the blue geometry is excluded and reported as calibration points; the red contours import normally

#### Scenario: No reference geometry

- **WHEN** an SVG has neither labelled reference layers nor pure-blue geometry
- **THEN** the artwork imports exactly as before, with no calibration points and no note

### Requirement: Calibration points are extracted in page millimetres

For each reference group, the system SHALL derive one calibration point: the centre of a circle in the group when present, otherwise the centre of the group's bounding box. Points SHALL be expressed in the same frame as the artwork's strokes so that placing the artwork places its points, and SHALL carry the group's id or label for display, in document order.

#### Scenario: Crosshair with a dot

- **WHEN** a reference group holds two 12 mm lines crossing at `15,15` and a 0.4 mm-radius circle centred there
- **THEN** the calibration point is `15,15` page mm, named by the group's id (e.g. `cal-P1`)

#### Scenario: Points follow the artwork

- **WHEN** the artwork is placed at scale 1, unrotated, at its page position
- **THEN** each calibration point's paper coordinate equals its page coordinate in the file

### Requirement: Page position is preserved

Alongside its size, the system SHALL record where the imported artwork sits on its page: the offset from the page (viewBox) origin to the artwork's bounding-box top-left, in millimetres, so that page-true placement is possible after normalisation. Reference geometry SHALL NOT influence this bounding box.

#### Scenario: Offset recorded

- **WHEN** an A4 file's cut geometry spans `30..158 mm` in X and `45..161 mm` in Y
- **THEN** the artwork reports a page offset of `30,45` and a size of `128×116 mm`, and the crosshair at `9..21 mm` on the reference layer does not widen either
