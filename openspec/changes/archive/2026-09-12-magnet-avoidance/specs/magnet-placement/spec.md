## ADDED Requirements

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
