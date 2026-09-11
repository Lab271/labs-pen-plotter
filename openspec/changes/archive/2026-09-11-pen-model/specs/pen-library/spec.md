# pen-library Specification

## Purpose

The pens an operator owns are defined once, with the characteristics that change what a plot looks
like — colour and the width of the line the tip lays down — so the preview shows what will be
drawn and later features (multi-pen plots, hatching) have something to reason about.

## Requirements

### Requirement: A library of defined pens

The app SHALL hold a library of pens, each with at least a name, a colour and a line width in mm,
and SHALL let the operator add, edit and remove them. The library SHALL be shared by every client
of one plotter, and SHALL never be empty.

#### Scenario: Editing a pen

- **WHEN** the operator changes a pen's name, colour or width
- **THEN** the change is saved and every client of that plotter sees it

#### Scenario: The last pen cannot be removed

- **WHEN** the library contains one pen
- **THEN** removing it is refused, because artwork must always have a pen to be drawn with

#### Scenario: An unusable stored pen

- **WHEN** a stored pen has a missing id, or a width that is not a positive number
- **THEN** it is repaired from defaults rather than dropped silently or rendered as nothing

### Requirement: A pen is selected per artwork

Each artwork SHALL carry the pen it is drawn with, chosen from the library, and the choice SHALL
persist with the session. The pen chosen while nothing is selected SHALL be the one newly imported
artwork receives.

#### Scenario: Assigning a pen

- **WHEN** the operator selects an artwork and picks a pen
- **THEN** that artwork is drawn with that pen, and the assignment survives a reload

#### Scenario: A pen for the next import

- **WHEN** no artwork is selected and the operator picks a pen, then imports a file
- **THEN** the imported artwork is assigned that pen

#### Scenario: A pen that no longer exists

- **WHEN** an artwork names a pen that has been removed from the library
- **THEN** it is drawn with a pen from the library rather than failing to render

### Requirement: The preview draws the pen

The canvas SHALL render each artwork's strokes in its pen's colour, and at its pen's width to
scale, subject to a minimum so that a fine pen on a zoomed-out bed remains visible.

#### Scenario: Colour in the preview

- **WHEN** an artwork is assigned a coloured pen
- **THEN** its strokes are previewed in that colour, and selecting the artwork does not recolour it

#### Scenario: Width in the preview

- **WHEN** two artworks are assigned pens of different widths
- **THEN** the heavier pen previews as the heavier line

#### Scenario: A fine pen on a zoomed-out bed

- **WHEN** the whole bed is fitted into the canvas, where a 0.5 mm line is a fraction of a pixel
- **THEN** the artwork is still drawn as a visible hairline
