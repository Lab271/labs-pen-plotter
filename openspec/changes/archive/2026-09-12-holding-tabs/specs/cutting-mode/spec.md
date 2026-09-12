## ADDED Requirements

### Requirement: Holding tabs keep a cut piece attached

Cutting SHALL be able to leave short uncut bridges in a closed contour, so the piece stays attached
to the sheet until it is snapped out by hand. The number of bridges, their width, and the contour
length below which none are placed SHALL be configurable, and bridges SHALL be off by default.

#### Scenario: Cutting with tabs

- **WHEN** a closed contour is cut with tabs enabled
- **THEN** the contour is cut as several strokes separated by uncut bridges of the configured width

#### Scenario: Off by default

- **WHEN** the operator has not enabled tabs
- **THEN** contours are cut exactly as they were before the feature existed

#### Scenario: Small detail is not bridged

- **WHEN** a contour is shorter than the configured minimum
- **THEN** it is cut without tabs, because a bridge as long as the shape destroys it

#### Scenario: More tabs than the contour can hold

- **WHEN** more bridges are asked for than the contour can carry with cut between them
- **THEN** the number is reduced, rather than the contour being cut as a dotted line

### Requirement: Bridges are placed where they will hold

Bridges SHALL be distributed around the contour, SHALL avoid sharp corners, and SHALL NOT be placed
where an overcut would cut through them.

#### Scenario: Away from corners

- **WHEN** a contour has sharp corners
- **THEN** no bridge is placed on one, because a bridge on a corner tears instead of snapping

#### Scenario: Clear of the overcut

- **WHEN** both an overcut and tabs are enabled
- **THEN** no bridge lies in the stretch the overcut re-traces, so the overcut cannot cut through it

#### Scenario: Every piece is drawable

- **WHEN** any combination of tab count and width is used
- **THEN** every resulting stroke is one the machine can cut, with no degenerate fragments

### Requirement: The preview shows what the blade will follow

In cutting mode the canvas SHALL show the prepared cutting path — including the overcut and the
gaps left by holding tabs — distinctly from the artwork it came from.

#### Scenario: Seeing where the piece stays attached

- **WHEN** tabs are enabled
- **THEN** the gaps are visible on the canvas before the job is started
