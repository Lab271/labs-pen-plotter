## MODIFIED Requirements

### Requirement: Fit helpers

The system SHALL provide fit-to-corner (align the artwork to the top-left registration corner), fit-to-paper (scale the artwork to fit within the selected paper, preserving aspect ratio), actual-size (reset the scale to 1:1 so the artwork plots at the physical size its file declares) and place-on-page (put the artwork at 1:1, unrotated, at the position it occupies on its own page, so file coordinates equal paper coordinates). All SHALL account for the artwork's current rotation, anchoring/scaling its **rotated** bounding box.

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

#### Scenario: Place on page

- **WHEN** the operator chooses place-on-page for an artwork imported from a file with a page (viewBox) origin
- **THEN** the artwork is at scale 1 and 0°, and every point sits at the same millimetre coordinates on the paper as in the file — a mark drawn at page `15,15` plots at work `15,15`

#### Scenario: Place on page without page information

- **WHEN** the artwork carries no page offset (e.g. a PNG import)
- **THEN** place-on-page behaves as actual-size anchored to the corner
