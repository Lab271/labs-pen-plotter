## ADDED Requirements

### Requirement: Motion that depends on the work origin is refused while it is unknown

While the position is untrusted, the system SHALL refuse to start a plot and SHALL refuse to return
to the work origin, and the refusal SHALL name the reason rather than failing silently. The refusal
SHALL be enforced by the daemon, so it applies to every connected client and not only the one that
saw the power-down. Jogging SHALL remain available — the operator needs it to reach the corner —
with the understanding that its coordinates mean nothing until the origin is set again.

#### Scenario: Plot refused

- **WHEN** a client asks to plot while the position is untrusted
- **THEN** the request is refused with a message saying the motors were powered down and home is
  lost, and nothing is streamed

#### Scenario: Go to home refused

- **WHEN** a client asks to return to the work origin while the position is untrusted
- **THEN** the request is refused with the same reason, and the machine does not move

#### Scenario: A second client is refused too

- **WHEN** another device connects after the power-down and asks to plot
- **THEN** it is refused on the same grounds, having been told the state when it attached

#### Scenario: Jogging still works

- **WHEN** the operator jogs while the position is untrusted
- **THEN** the machine moves as asked

#### Scenario: Stopping still stops

- **WHEN** the operator stops the machine while the position is untrusted
- **THEN** the motion is aborted, but the machine does not rapid to an origin that is not known

### Requirement: The operator is walked back to a work origin

The system SHALL offer a guided re-zero that opens when the position becomes untrusted and can be
reopened from the home/calibration controls. It SHALL state that the motors were powered down and
the origin is lost, warn that the gantry is free and will not resist being pushed, let the operator
reach the paper's top-left corner by hand or by jogging, and finish by setting the work origin there.
The untrusted state SHALL stay visible until it is cleared.

#### Scenario: The wizard opens on its own

- **WHEN** the position becomes untrusted
- **THEN** the guided re-zero opens, saying the motors are off and home is gone

#### Scenario: Reopened later

- **WHEN** the operator dismisses it and later chooses to re-zero
- **THEN** it opens again from the home/calibration controls, and the state was visible in between

#### Scenario: Finishing the wizard

- **WHEN** the operator positions the head at the paper's top-left corner and sets home
- **THEN** the work origin is set there, the position is trusted again, and plotting is available
