# scene-editing Specification

## Purpose

The page is a scene of objects. The operator can select them — one, several, or by dragging a band
over them — and then move, copy, order or delete what is selected.

## Requirements

### Requirement: Selecting objects

The operator SHALL be able to select a single object by clicking it, add or remove objects from the
selection with a modifier-click, select every object at once, and clear the selection. Dragging on
empty space SHALL draw a band that selects the objects it covers.

#### Scenario: Click selects one

- **WHEN** the operator clicks an object
- **THEN** it becomes the selection, replacing whatever was selected before

#### Scenario: Modifier-click toggles

- **WHEN** the operator Shift- or Cmd-clicks an object
- **THEN** it is added to the selection, or removed from it if it was already selected

#### Scenario: Band selects what it touches

- **WHEN** the operator drags a band across part of the page
- **THEN** every object the band touches is selected, whether or not the band encloses it

#### Scenario: Clicking empty space clears

- **WHEN** the operator clicks empty space without a modifier
- **THEN** nothing is selected

### Requirement: Moving a selection

Dragging any selected object SHALL move the whole selection by the same amount, keeping the
objects' relative positions. Dragging an unselected object SHALL select it first, so the drag moves
what was grabbed.

#### Scenario: The selection moves as one

- **WHEN** several objects are selected and the operator drags one of them
- **THEN** all of them move by the same offset and their relative layout is unchanged

### Requirement: Copy, paste, duplicate and delete

The operator SHALL be able to copy the selection, paste it as new objects, duplicate it in one
step, and delete it — from toolbar controls and from the standard keyboard shortcuts.

#### Scenario: Paste creates new objects

- **WHEN** the operator copies a selection and pastes
- **THEN** new objects appear, offset from the originals so both are visible, with names that show
  they are copies, and the pasted objects become the selection

#### Scenario: A pasted copy stays on the paper

- **WHEN** the copied object sits at the edge of the sheet
- **THEN** the pasted copy is placed so that it still fits on the paper

#### Scenario: A copy can still be retuned

- **WHEN** the operator pastes an imported artwork and adjusts its import controls
- **THEN** the copy re-derives from the same source as the original

#### Scenario: Delete removes the selection

- **WHEN** the operator deletes with objects selected
- **THEN** those objects are removed and nothing is selected

### Requirement: Stacking order

The operator SHALL be able to move the selection forward and backward through the stacking order.
The order SHALL be part of the scene and SHALL NOT change what is plotted.

#### Scenario: Moving a selection forward

- **WHEN** the operator brings a selection forward
- **THEN** each selected object moves one step later in the order, keeping the selection's internal
  order intact

#### Scenario: Already at the end

- **WHEN** the selection is already at the front and the operator brings it forward again
- **THEN** nothing changes

#### Scenario: Order does not reach the machine

- **WHEN** the stacking order changes
- **THEN** the generated G-code is unchanged — strokes are ordered by pen and by travel

### Requirement: Editing is locked while plotting

While a plot is running, the editing operations that change the scene SHALL be unavailable, and the
toolbar SHALL say why.

#### Scenario: No edits mid-plot

- **WHEN** a plot is running
- **THEN** paste, duplicate, delete and reordering are disabled
