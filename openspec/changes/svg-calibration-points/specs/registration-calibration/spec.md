## Purpose

Verify, before a sheet is cut, that the machine's work origin lands the pen on the registration marks printed on the sheet, by touching each calibration point several times and then correcting the work origin by the observed miss.

## ADDED Requirements

### Requirement: Calibration run over the artwork's points

The system SHALL let the operator run a calibration program for the selected artwork when it carries calibration points. The program SHALL, with the pen up, travel to each point in order, lower the pen using the calibrated pen-down Z and settle dwell, raise it, and continue to the next point; it SHALL repeat this for the configured number of passes (default 3, minimum 1) and finish pen-up at the work origin. Points SHALL be targeted at their placed paper coordinates, so the run tests the same placement the cut will use. The run SHALL use the same streaming path, feeds and pen model as a plot.

#### Scenario: Three points, three passes

- **WHEN** the operator runs calibration on an artwork with points P1, P2, P3 and 3 passes
- **THEN** the machine touches P1, P2, P3, P1, P2, P3, P1, P2, P3 in that order, each touch a pen-down/dwell/pen-up at the point's paper coordinate, then returns to work zero pen-up

#### Scenario: On-target touch is invisible, a miss is visible

- **WHEN** the work origin is correct and the sheet's printed dots are 0.4 mm radius
- **THEN** the pen marks fall inside the printed dots; when the origin is off, the marks sit visibly beside the dots by the same offset

#### Scenario: Repeated passes reveal drift

- **WHEN** the machine loses steps or has backlash between passes
- **THEN** successive marks at the same point do not coincide, which a single pass could not show

#### Scenario: No calibration points

- **WHEN** the selected artwork has no calibration points
- **THEN** the calibration run is unavailable and the UI says why

### Requirement: Work-zero correction from the observed miss

After a run, the system SHALL let the operator enter the observed offset of the marks from the printed dots, in millimetres along the page axes (positive X to the right, positive Y down the page), and apply it so that the work origin moves by that amount and a subsequent run lands on the dots. The correction SHALL be applied through the work-coordinate offset (no motion), only while the machine is idle, and SHALL be reflected in the displayed work position immediately.

#### Scenario: Marks land right and below the dots

- **WHEN** every mark sits 1.0 mm to the right and 0.5 mm below its printed dot and the operator applies a correction of `+1.0, +0.5`
- **THEN** the work origin shifts so that the next run's marks fall on the dots, and the displayed work position of the unmoved pen changes by exactly that offset

#### Scenario: Correction refused while moving

- **WHEN** the operator tries to apply a correction while a program is streaming or the machine is not idle
- **THEN** the correction is refused with a message and the work origin is unchanged

### Requirement: Calibration controls respect the running machine

The calibration run and the correction SHALL be unavailable while any program is streaming, and the run SHALL be stoppable with the same stop control as a plot.

#### Scenario: Disabled during a plot

- **WHEN** a plot is running
- **THEN** the calibration Run and Apply controls are disabled

#### Scenario: Stop mid-run

- **WHEN** the operator presses Stop during a calibration run
- **THEN** the run aborts like a plot, pen up, and the machine returns to a safe idle state
