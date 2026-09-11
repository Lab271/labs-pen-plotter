## ADDED Requirements

### Requirement: Pen-change channel

The daemon SHALL announce a pen change as an event, SHALL include a pending pen change in the
attach snapshot, and SHALL accept a command that continues the held program. A pen change SHALL
count as a running plot for the purposes of refusing an in-app update.

#### Scenario: A pen change reaches the clients

- **WHEN** a streaming program reaches a pen change
- **THEN** every attached client is told which pen to load

#### Scenario: A client attaching mid-hold

- **WHEN** a client attaches while a program waits for a pen change
- **THEN** the snapshot tells it which pen is being waited for, so it can show and answer the prompt

#### Scenario: Update refused while waiting for a pen

- **WHEN** a client requests an in-app update while a program is held at a pen change
- **THEN** the daemon refuses it, as it does during a running plot
