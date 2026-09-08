## Purpose

Register a cut to a sticker as it actually sits on the bed: the operator jogs the pen onto each printed calibration point, and the software fits the artwork's position and rotation to those measurements so the cut lines follow the print.

## ADDED Requirements

### Requirement: Registration wizard opens for artwork with calibration points

The system SHALL open a step-by-step registration wizard automatically when an SVG with two or more calibration points is imported, and SHALL let the operator reopen it for the selected artwork at any time. The wizard SHALL require a connected, idle machine to record points, and SHALL be cancellable at any step without changing the artwork.

#### Scenario: Import opens the wizard

- **WHEN** the operator imports an SVG whose reference layer yields three calibration points
- **THEN** the wizard opens on its first step, naming the artwork and the number of points

#### Scenario: Reopen later

- **WHEN** the operator selects an artwork with calibration points and chooses Register
- **THEN** the wizard opens for that artwork, starting from the first step

#### Scenario: Cancel

- **WHEN** the operator cancels at any step
- **THEN** the wizard closes and the artwork's placement is unchanged

### Requirement: Guided measurement of each point

The wizard SHALL first instruct the operator to mount the sticker, then for each calibration point in file order SHALL name the point and its page coordinate, show the live work position, provide jog controls (arrows with a step size, pen up/down to sight the tip), and a Set action that records the current work position for that point. The operator SHALL be able to go back to re-measure a point.

#### Scenario: Jog and set

- **WHEN** the wizard shows "Jog to cal-P1 (page 15, 15)" and the operator jogs the pen onto the printed crosshair and presses Set
- **THEN** the current work position is recorded for cal-P1 and the wizard advances to cal-P2

#### Scenario: Re-measure

- **WHEN** the operator goes back from cal-P3 to cal-P2
- **THEN** cal-P2's previous measurement is discarded when Set is pressed again

#### Scenario: Set refused without a position

- **WHEN** the machine is disconnected or has not reported a position
- **THEN** Set is unavailable and the wizard says why

### Requirement: Fit and apply the placement

After the last point, the system SHALL fit a rigid transform — rotation and translation, scale fixed at 1:1 — of the artwork's calibration points onto the recorded work positions by least squares, show the resulting rotation and offset, the per-point residual, and the scale the measurements imply, and on Apply SHALL set the artwork's placement to the fit so the cut lines coincide with the sticker. The wizard SHALL warn when the root-mean-square residual exceeds 0.3 mm or the implied scale deviates from 1 by more than 1%, but SHALL still allow applying. Because least squares shares a single point's error across all points, the warning is on the RMS, not on any one residual.

#### Scenario: Rotated sticker

- **WHEN** the sticker is mounted 3° clockwise and 20 mm from the corner and the three points are measured accurately
- **THEN** the fitted placement has rotation ≈ 3° and puts every calibration point within 0.2 mm of its measurement, and after Apply the cut lines on the canvas overlay the sticker's true position

#### Scenario: Poor fit is flagged

- **WHEN** one point was set 1.5 mm off the crosshair
- **THEN** every residual is non-zero, the RMS warning appears, and the operator can go back to re-measure or apply anyway

#### Scenario: Scale is not corrected

- **WHEN** the measurements imply the sticker was printed 2% large
- **THEN** the placement keeps scale 1 and the wizard warns about the implied scale rather than stretching the cut

### Requirement: Wizard respects the running machine

The wizard's jog and Set actions SHALL be unavailable while a program is streaming.

#### Scenario: Opened during a plot

- **WHEN** a plot is running and the wizard is opened
- **THEN** its jog and Set controls are disabled until the plot finishes
