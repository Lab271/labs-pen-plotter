## ADDED Requirements

### Requirement: Stroke direction can be preserved

G-code generation SHALL be able to keep every stroke in the direction it was given, for tools where
direction matters, while continuing to reverse strokes for travel efficiency by default.

#### Scenario: Direction preserved

- **WHEN** a program is generated with reversal disallowed
- **THEN** every stroke is emitted from its first point to its last, whatever the travel cost

#### Scenario: Default unchanged

- **WHEN** a program is generated normally
- **THEN** strokes may still be reversed to shorten travel, as before
