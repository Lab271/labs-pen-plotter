# shapes-and-text Specification

## Purpose

Drawings can start in the app: primitive shapes and text, generated as plottable strokes at the
size the operator asks for, and editable afterwards.

## Requirements

### Requirement: Drawing primitive shapes

The operator SHALL be able to add a line, a rectangle, an ellipse and a regular polygon to the
page, and SHALL be able to change each one's size (and a polygon's number of sides) after adding
it. A shape SHALL be created at its real size rather than fitted to the page.

#### Scenario: Adding a shape

- **WHEN** the operator adds a shape
- **THEN** it appears on the page at the size the app reports for it, selected, and can be moved,
  scaled, rotated, assigned a pen and plotted like any other object

#### Scenario: Resizing a shape

- **WHEN** the operator changes a shape's width, height or side count
- **THEN** its geometry is regenerated and the preview updates

#### Scenario: Closed shapes are closed

- **WHEN** a rectangle, ellipse or polygon is plotted
- **THEN** its contour ends where it began, leaving no gap at the starting point

#### Scenario: A size of zero does not destroy the object

- **WHEN** a size is set to zero or a negative value
- **THEN** the shape keeps a minimum extent rather than becoming un-drawable

### Requirement: Text is drawn with a single-line font

Text SHALL be rendered as single-line strokes — the skeleton of each letter — not as the outline of
a filled glyph. The requested size SHALL be the cap height in millimetres.

#### Scenario: Text plots as strokes

- **WHEN** the operator adds text and plots it
- **THEN** each letter is drawn as one or more single strokes, not as a traced contour

#### Scenario: Size is measurable on the sheet

- **WHEN** the operator sets a text size of N mm
- **THEN** a capital letter measures N mm tall on the paper

#### Scenario: Multiple lines

- **WHEN** the text contains line breaks
- **THEN** each line is drawn below the previous one at the configured line spacing

### Requirement: Text stays editable

The parameters text was generated from SHALL be stored with the object and persist with the
session, so the content, size and spacing can be changed at any time, including after a reload.

#### Scenario: Editing after a reload

- **WHEN** the operator reloads the app and selects a text object
- **THEN** its content and settings are shown and can be changed, and the geometry regenerates

#### Scenario: An empty edit does not lose the object

- **WHEN** the operator clears the text box while typing
- **THEN** the object stays on the page with its previous geometry and placement

### Requirement: Characters the font cannot draw are reported

Characters with no glyph in the face SHALL be skipped rather than drawn as a placeholder, and the
operator SHALL be told which ones were skipped.

#### Scenario: An unsupported character

- **WHEN** the text contains a character the font has no glyph for
- **THEN** nothing is drawn for it, the rest of the text is unaffected, and the editor names it
