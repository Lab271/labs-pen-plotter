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

### Requirement: Travel is routed around the magnets

Pen-up travel SHALL avoid the keep-out zones: where a straight leg would cross one, the toolpath
SHALL detour clear of it. This SHALL apply to every travel move — the first, those between strokes,
and the return to the work origin.

#### Scenario: A magnet on the straight line between two strokes

- **WHEN** the next stroke lies on the far side of a magnet
- **THEN** the travel move goes around it, staying outside the keep-out zone

#### Scenario: The way home

- **WHEN** the final return to the work origin would cross a magnet
- **THEN** that move is routed around it too

#### Scenario: Nothing in the way

- **WHEN** no magnet is recorded, or none is near the travel
- **THEN** the toolpath is exactly what it would have been without the feature

### Requirement: Detours are visible before the job starts

The canvas SHALL show travel that has been diverted around a zone, so the operator can check the
route before starting.

#### Scenario: Seeing the detour

- **WHEN** a magnet forces the travel to bend
- **THEN** the diverted leg is drawn on the canvas, distinct from the artwork

### Requirement: A blocked plot says which magnet

When drawn geometry crosses a magnet, the message SHALL identify the magnet and what it sits on.

#### Scenario: Naming the obstruction

- **WHEN** plotting is refused because a magnet is on the artwork
- **THEN** the message gives that magnet's position and the artwork it is on, so the operator knows
  which one to move
