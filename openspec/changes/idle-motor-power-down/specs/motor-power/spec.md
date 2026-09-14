## Purpose

The steppers hold the gantry, and on a machine with no limit switches and no encoder feedback they
are the only thing that does. Keeping them energized around the clock costs power, heat and wear;
dropping them costs the work origin. This capability is both halves: when they may be dropped, and
what the software knows the moment they are.

## ADDED Requirements

### Requirement: The motors power down after an idle period

The system SHALL de-energize the stepper motors after a configurable period with no commanded
motion. The period SHALL default to 1 hour and SHALL be settable, with a value of zero meaning the
motors are never powered down automatically. The setting SHALL be shared by every client of one
plotter.

#### Scenario: Idle long enough

- **WHEN** the machine has been connected and idle for the configured period
- **THEN** the daemon disables the steppers and tells every connected client

#### Scenario: Auto-off disabled

- **WHEN** the period is set to zero
- **THEN** the motors are never powered down on a timer, however long the machine sits

#### Scenario: Not connected

- **WHEN** there is no plotter connected
- **THEN** no power-down is attempted

### Requirement: Auto-off never fires mid-job

The system SHALL NOT power the motors down while a program is streaming, queued, paused, while the
machine reports `Run` or `Hold`, **or while the program is held at a pen change**. A pen-change hold
is deliberately idle with an empty queue and no motion; it is mid-job, and dropping the motors there
would shift the gantry and land the rest of the drawing offset on a sheet that cannot be restarted.

#### Scenario: Held at a pen change

- **WHEN** a plot is waiting for the operator to change the pen, for longer than the idle period
- **THEN** the motors stay energized, and the job resumes on the same origin it started on

#### Scenario: Paused mid-plot

- **WHEN** a plot is paused for longer than the idle period
- **THEN** the motors stay energized

#### Scenario: The clock starts when the job ends

- **WHEN** a long plot finishes
- **THEN** the idle period is measured from the end of the job, not from the last command before it

### Requirement: A motor power-down makes the position untrusted

When the motors are de-energized — automatically or by the operator's **Motors off** — the system
SHALL mark the reported position as no longer trustworthy, stop persisting it, and record the reason
in words. Manual and automatic power-down SHALL be treated identically: both free the gantry.

#### Scenario: Automatic power-down

- **WHEN** the idle timer disables the motors
- **THEN** the position is marked untrusted, with a reason naming the idle period, and the daemon
  stops writing the position to disk

#### Scenario: The operator switches the motors off

- **WHEN** the operator presses Motors off
- **THEN** the position is marked untrusted exactly as it would be on the timer

#### Scenario: The power-down fails

- **WHEN** the disable command does not reach the controller
- **THEN** the position stays trusted, because the motors are still holding the gantry

### Requirement: A position recorded across a power-down is never restored as the origin

The system SHALL record, with the persisted position, whether it was trustworthy when written, and
SHALL refuse to reinstate a position marked untrustworthy as the work origin. A persisted position
written before this was recorded SHALL continue to be treated as trustworthy.

#### Scenario: Daemon restarts after a power-down

- **WHEN** the motors were powered down and the daemon is restarted hours later
- **THEN** the saved position is not applied as the work origin, and the machine comes up asking to
  be re-zeroed

#### Scenario: Normal restart

- **WHEN** the daemon restarts while the position was trustworthy
- **THEN** the position is restored as the work origin, as before

### Requirement: Trust is restored only by setting work zero

The system SHALL treat the position as trustworthy again only when the operator sets the work origin.
Movement alone SHALL NOT restore trust, however much of it there is.

#### Scenario: Re-zeroed

- **WHEN** the operator sets work zero after a power-down
- **THEN** the position is trusted again, persistence resumes, and the refusals lift

#### Scenario: Jogging is not re-zeroing

- **WHEN** the operator jogs the machine after a power-down without setting work zero
- **THEN** the position is still untrusted
