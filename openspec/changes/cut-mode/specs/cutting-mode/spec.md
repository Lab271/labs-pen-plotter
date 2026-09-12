# cutting-mode Specification

## Purpose

The machine draws with a pen and cuts with a drag knife, and the two want opposite things. The job's
mode says which it is, and everything downstream follows from it.

## Requirements

### Requirement: The job has a mode

The operator SHALL be able to set a job to drawing or cutting, the choice SHALL be visible, and it
SHALL persist with the session.

#### Scenario: Switching mode

- **WHEN** the operator switches the job to cutting
- **THEN** the app shows that it is a cut job, and the plot control says so

#### Scenario: The mode is remembered

- **WHEN** the operator reloads, or opens the job on another device
- **THEN** the same mode is in effect

### Requirement: Each mode uses its own tool profile

Drawing SHALL use the pen's Z, dwell and feeds; cutting SHALL use the knife's own Z, dwell, cut
feed and travel feed. Changing one SHALL NOT change the other.

#### Scenario: Cutting uses the knife settings

- **WHEN** the operator starts a job in cutting mode
- **THEN** the program uses the knife's depth and cut feed, not the pen's

#### Scenario: The profiles are independent

- **WHEN** the operator edits the knife profile
- **THEN** the pen's settings are unchanged, and vice versa

### Requirement: Cutting never fills

In cutting mode the app SHALL NOT offer conversions that fill an area — hatching, crosshatching or
stippling — because a fill handed to a drag knife destroys the piece instead of cutting it out.

#### Scenario: Importing an image to cut

- **WHEN** the operator imports a raster image in cutting mode
- **THEN** only outline conversions are offered, and the app says why

### Requirement: A cut is placed at its real size

In cutting mode an import SHALL be placed at 1:1 — at the position the file gives it where there is
one — and SHALL NOT be scaled to fit the paper.

#### Scenario: Importing a cut file

- **WHEN** the operator imports a vector file in cutting mode
- **THEN** it is placed at 100% at the page position the file specifies, ready to register against
  the printed sheet

### Requirement: Closed contours are cut so that they release

Cut contours SHALL continue past their closing point by a configurable overcut, so the piece is
severed rather than left attached where the blade started. Open geometry SHALL NOT be extended.

#### Scenario: Cutting a closed shape

- **WHEN** a closed contour is cut with an overcut configured
- **THEN** the toolpath continues past the start point by that distance, re-cutting the beginning
  of the contour

#### Scenario: A contour from a flattened file

- **WHEN** the contour comes from a file whose curves were flattened, so its last point is a
  fraction of a millimetre from its first
- **THEN** it is still treated as closed and still overcut

#### Scenario: An open path

- **WHEN** the geometry is an open line
- **THEN** it is cut as given, with no extension into material the operator did not ask to cut

### Requirement: Blade offset can be compensated, and is off until measured

The app SHALL be able to compensate for the distance the blade trails the holder's pivot, by
overshooting sharp corners, and this SHALL default to disabled.

#### Scenario: Compensation at a corner

- **WHEN** compensation is enabled and the path turns a sharp corner
- **THEN** the toolpath overshoots the corner by the offset before resuming, so the blade has
  swivelled by the time it cuts again

#### Scenario: Smooth curves are not spiked

- **WHEN** compensation is enabled and the path is a flattened curve
- **THEN** its many shallow vertices are left alone

#### Scenario: Disabled by default

- **WHEN** the operator has not measured their blade
- **THEN** no compensation is applied, because a wrong offset cuts into the piece

### Requirement: A cut job looks like a cut job

The canvas SHALL draw a cutting job's geometry as cut lines rather than in a pen's colour.

#### Scenario: Previewing a cut

- **WHEN** the job is in cutting mode
- **THEN** the artwork is drawn in the cut colour, and pen selection is not offered
