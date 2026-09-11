## ADDED Requirements

### Requirement: Programs may hold at a pen change

A program MAY contain pen-change markers. The streamer SHALL treat a marker as a hold point: it
SHALL NOT send any line beyond it until told to continue, SHALL report the hold only once the
machine is idle, and SHALL count progress across the whole program rather than restarting per
segment. A marker SHALL NOT be sent to the machine.

#### Scenario: Nothing is sent past the marker

- **WHEN** a program containing a pen-change marker is streamed
- **THEN** only the lines before the marker are sent, and the rest wait

#### Scenario: The hold is reported when the machine is idle

- **WHEN** the last line before a marker has been acknowledged but the machine is still moving
- **THEN** the hold is reported only once the machine reports idle

#### Scenario: Continuing sends the next part

- **WHEN** the streamer is told to continue
- **THEN** the lines after the marker are sent, and the program completes normally at its end

#### Scenario: A hold is not a finished program

- **WHEN** a program is held at a marker
- **THEN** it still counts as streaming, so another program cannot be started over it
