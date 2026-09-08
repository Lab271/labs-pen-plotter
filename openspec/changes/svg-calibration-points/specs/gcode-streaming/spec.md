## ADDED Requirements

### Requirement: One program at a time

The system SHALL refuse to start a program while another is streaming or paused, and report the refusal to the caller. A refused program SHALL NOT alter the running one.

#### Scenario: Second program refused

- **WHEN** a client requests a plot or calibration run while a program is streaming
- **THEN** the request fails with a clear error and the running program continues unaffected

#### Scenario: Program accepted when idle

- **WHEN** no program is streaming or paused and the machine is idle
- **THEN** the requested program starts as before
