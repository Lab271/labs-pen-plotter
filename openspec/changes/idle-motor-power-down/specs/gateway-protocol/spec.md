## ADDED Requirements

### Requirement: Motor power and position trust are part of the shared state

The gateway SHALL include the motor power state, whether the position is trusted, and the reason it
is not, in the snapshot sent to a client on attach, and SHALL push the same record as an event
whenever it changes. One machine has one answer to "is home still known", and every client SHALL see
it — including a client that attaches long after the power-down.

#### Scenario: Attaching after a power-down

- **WHEN** a client attaches to a daemon whose motors were powered down
- **THEN** its snapshot says the motors are off and the position is untrusted, with the reason

#### Scenario: State change is pushed

- **WHEN** the motors are powered down, or the operator re-zeroes
- **THEN** every connected client is sent the new state without having to ask
