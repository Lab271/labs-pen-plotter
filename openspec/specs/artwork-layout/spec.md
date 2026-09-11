# artwork-layout

## Purpose

Provide a visualized page (bed, paper, artwork) where operators place, scale, rotate, and fit one or more artworks in real-world millimeters, adjust level of detail with a live preview, and guard against placements that exceed the machine work area. The canvas renders the actual pen-path (WYSIWYG) so the preview matches the plot.

## Requirements

### Requirement: Visualized page with selectable paper size

The system SHALL display the bed, the paper on it, and the artwork on the paper. The operator SHALL choose a paper size (A4 through A0); the paper is anchored at the top-left corner (the registration corner / work origin).

#### Scenario: Change paper size

- **WHEN** the operator selects a different paper size
- **THEN** the visualized paper resizes accordingly, anchored at the top-left corner, and the bed/work-area bounds remain shown for reference

### Requirement: Place, scale, and rotate artwork

The system SHALL let the operator move (drag), scale, and rotate the artwork on the page, with the on-canvas position/size/rotation reflecting real millimeters on the paper.

#### Scenario: Transform the artwork

- **WHEN** the operator drags, scales, or rotates the artwork
- **THEN** the artwork updates live on the canvas and its real-world placement (mm, degrees) updates accordingly

### Requirement: Multiple artworks on the page

The system SHALL allow more than one artwork (SVG or traced image) to be placed on the same paper. The operator SHALL be able to add artworks, select one to edit, and remove one or more. Plotting SHALL produce G-code for all placed artworks together.

#### Scenario: Add, select, and remove artworks

- **WHEN** the operator adds several artworks and removes one
- **THEN** each can be placed/transformed independently, the selected one shows transform handles, and the removed one disappears from the page and from the plot

#### Scenario: Plot includes every placed artwork

- **WHEN** the operator plots with multiple artworks on the page
- **THEN** the generated G-code draws all of them at their on-paper placements

### Requirement: Fit helpers

The system SHALL provide fit-to-corner (align the artwork to the top-left registration corner), fit-to-paper (scale the artwork to fit within the selected paper, preserving aspect ratio) and actual-size (reset the scale to 1:1 so the artwork plots at the physical size its file declares). All SHALL account for the artwork's current rotation, anchoring/scaling its **rotated** bounding box.

#### Scenario: Fit to paper

- **WHEN** the operator chooses fit-to-paper
- **THEN** the artwork is scaled to fit within the paper bounds with its aspect ratio preserved

#### Scenario: Fit to corner

- **WHEN** the operator chooses fit-to-corner
- **THEN** the artwork's top-left aligns to the registration corner (work origin)

#### Scenario: Actual size

- **WHEN** the operator chooses actual-size on an artwork that import (or a drag) has rescaled
- **THEN** the artwork's scale returns to exactly 100%, its rotation is kept, and its rotated box is anchored to the registration corner — an SVG declared as 210×297 mm plots as 210×297 mm

#### Scenario: Fit after rotation

- **WHEN** the artwork is rotated and the operator chooses fit-to-paper
- **THEN** the rotated artwork is scaled to fit within the paper and anchored to the corner by its rotated extent (not its unrotated box)

### Requirement: Adjustable level of detail with live preview

The system SHALL provide a detail slider that trades fidelity for plot time, applied live to already-placed artwork without re-importing. Lowering detail SHALL both simplify strokes and drop whole strokes below a size threshold (removing fine detail and the pen lifts that make a plot slow). The canvas preview SHALL reflect the current detail so the operator sees what will plot.

#### Scenario: Slider previews and reduces the drawing live

- **WHEN** the operator drags the detail slider lower
- **THEN** the canvas immediately shows fewer/simpler strokes, and the same reduced geometry is what gets plotted, shortening plot time

#### Scenario: Detail can be raised again without re-importing

- **WHEN** the operator raises the detail slider after lowering it
- **THEN** previously removed detail reappears (up to the full detail captured at import), because reduction is derived from the stored full-detail master

### Requirement: Rotate in 90° steps

The system SHALL provide a control that rotates the selected artwork by 90°, keeping it on the page so the operator can then fit it to the paper at the new orientation.

#### Scenario: Rotate 90°

- **WHEN** the operator clicks rotate 90°
- **THEN** the selected artwork's rotation advances by 90° and it remains anchored on the page, ready to fit-to-paper at the new orientation

### Requirement: Work-area clamping

The system SHALL detect when the placed artwork extends beyond the machine work area and warn the operator, preventing a plot that would exceed travel.

#### Scenario: Oversized placement is flagged

- **WHEN** the artwork (at its current size/position) exceeds the work area
- **THEN** the app visibly warns and blocks/guards plotting until it fits

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

### Requirement: Selectable paper type

The operator SHALL be able to choose the type of paper shown behind the artwork — its colour and
whether it is plain, dotted, gridded or lined — from a set of presets. The canvas preview SHALL
reflect the choice, and the choice SHALL persist with the session. The paper's appearance SHALL
be preview-only: it SHALL NOT affect the generated plot paths in any way.

#### Scenario: Choosing a paper type

- **WHEN** the operator picks a paper type
- **THEN** the sheet behind the artwork is redrawn in that stock's colour and pattern

#### Scenario: The choice is remembered

- **WHEN** the operator picks a paper type and reloads, or opens the app on another device
- **THEN** the same paper type is shown, restored with the session

#### Scenario: Artwork stays legible on dark stock

- **WHEN** the chosen stock is dark (for a white or metallic pen)
- **THEN** the artwork is previewed in a light colour rather than the dark one used on white paper

#### Scenario: Nothing about the plot changes

- **WHEN** the operator plots with any paper type selected
- **THEN** the generated G-code is identical to the same artwork on plain white paper

#### Scenario: A paper type the build no longer has

- **WHEN** a session names a paper type that is not in the current set
- **THEN** the sheet is shown as plain white rather than failing to render
