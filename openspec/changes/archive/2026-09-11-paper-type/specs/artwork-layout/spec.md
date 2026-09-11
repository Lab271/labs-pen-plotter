## ADDED Requirements

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
