## MODIFIED Requirements

### Requirement: Text is drawn with a single-line font

Text SHALL be rendered as single-line strokes — the skeleton of each letter — not as the outline of
a filled glyph. The requested size SHALL be the cap height in millimetres.

#### Scenario: Text plots as strokes

- **WHEN** the operator adds text and plots it
- **THEN** each letter is drawn as one or more single strokes, not as a traced contour

#### Scenario: Size is measurable on the sheet

- **WHEN** the operator sets a text size of N mm
- **THEN** a capital letter measures N mm tall on the paper, whichever face is chosen

#### Scenario: Multiple lines

- **WHEN** the text contains line breaks
- **THEN** each line is drawn below the previous one at the configured line spacing

### Requirement: Characters the font cannot draw are reported

Characters with no glyph in the chosen face SHALL be skipped rather than drawn as a placeholder,
and the operator SHALL be told which ones were skipped.

#### Scenario: An unsupported character

- **WHEN** the text contains a character the font has no glyph for
- **THEN** nothing is drawn for it, the rest of the text is unaffected, and the editor names it

#### Scenario: Coverage differs between faces

- **WHEN** the operator switches to a face that lacks a character the previous face had
- **THEN** the editor names that character for the new face, and it is no longer drawn

## ADDED Requirements

### Requirement: Text has a choice of single-line face

The text editor SHALL offer a choice of single-line faces: at least the built-in face and a Hershey
Simplex face. Every face offered SHALL draw each glyph as single strokes, never as doubled or
outlined strokes. The chosen face SHALL be stored with the text object and persist with the session
and in saved projects.

#### Scenario: Switching faces

- **WHEN** the operator picks another face for a text object
- **THEN** its geometry is regenerated in that face at the same size, and the preview updates

#### Scenario: The face survives a reload

- **WHEN** the operator reloads the app or reopens a saved project
- **THEN** each text object is drawn in the face it was given, and the editor shows that face

### Requirement: Text without a known face falls back to the built-in face

Text saved before faces could be chosen SHALL be drawn in the built-in face. A text object naming
a face this build does not have SHALL keep its saved strokes, SHALL be regenerated in the built-in
face when it is edited, and the editor SHALL say so rather than switch silently.

#### Scenario: Text saved before faces existed

- **WHEN** a session or project saved without a face is loaded
- **THEN** its text is drawn exactly as before, in the built-in face

#### Scenario: An unknown face

- **WHEN** a text object names a face this build does not have
- **THEN** the editor names the missing face and says that an edit redraws the text in the
  built-in face, and an edit does exactly that
