# magnet-placement Specification

## Purpose

The sheet is held down by magnets. The app knows where they are, shows them, suggests places for
them, and refuses to draw through one.

## Requirements

### Requirement: The operator can record where the magnets are

The app SHALL let the operator add, move, resize and remove magnet markers, and SHALL persist them
with the session.

#### Scenario: Placing and moving a magnet

- **WHEN** the operator adds a magnet and drags it on the canvas
- **THEN** it is shown at that position, and is still there after a reload

#### Scenario: Sizing the keep-out

- **WHEN** the operator changes a magnet's radius
- **THEN** the zone drawn on the canvas changes with it, because the radius is the clearance the
  tool must keep, not the magnet's own size

### Requirement: Magnets are visible as zones

The canvas SHALL draw each magnet as its keep-out circle, to scale, distinctly from the artwork.

#### Scenario: Seeing what a magnet covers

- **WHEN** magnets are placed
- **THEN** each is drawn as a circle covering the area the tool must avoid

### Requirement: Suggested positions are clear of the drawing and on the sheet

The app SHALL be able to suggest magnet positions. Every suggestion SHALL lie entirely on the
paper, and SHALL NOT overlap the drawing.

#### Scenario: Suggesting positions

- **WHEN** the operator asks for suggestions
- **THEN** positions are offered at the edges of the sheet, each with its whole keep-out circle on
  the paper

#### Scenario: A corner occupied by the artwork

- **WHEN** the drawing reaches into a corner
- **THEN** that corner is not suggested

#### Scenario: Nowhere to suggest

- **WHEN** the drawing reaches every edge, or the sheet is smaller than a magnet plus its clearance
- **THEN** no position is suggested and the operator is told why

### Requirement: The app refuses to draw through a magnet

When drawn geometry passes within a magnet's keep-out zone, the app SHALL warn and SHALL NOT start
the job.

#### Scenario: A magnet on a stroke

- **WHEN** a stroke passes within a magnet's zone and the operator starts the job
- **THEN** it is refused, with a message naming how many magnets are in the way

#### Scenario: A magnet in an empty space

- **WHEN** a magnet sits inside a shape's empty middle, where nothing is drawn
- **THEN** the job is allowed — the test is against what is drawn, not against the artwork's
  bounding box
