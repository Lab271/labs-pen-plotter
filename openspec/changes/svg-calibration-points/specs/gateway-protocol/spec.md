## ADDED Requirements

### Requirement: Relative work-origin shift command

The command channel SHALL accept a command that shifts the work origin by a relative offset in millimetres along X and Y, applied through the work-coordinate offset without moving the machine. The daemon SHALL refuse it with an error when the machine is not idle or a program is streaming.

#### Scenario: Shift applied when idle

- **WHEN** the controlling client sends a shift of `dx, dy` while the machine is idle
- **THEN** the daemon redefines the work origin so the current position's work coordinate changes by `+dx, +dy`, acknowledges the command, and the next status report shows the new work position

#### Scenario: Shift refused when busy

- **WHEN** a client sends a shift while a program is streaming
- **THEN** the daemon replies with a command error and does not change the origin
