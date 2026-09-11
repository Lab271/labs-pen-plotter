## ADDED Requirements

### Requirement: App settings channel

The attach snapshot SHALL carry the daemon's app settings, or an explicit "none stored yet"
value. The daemon SHALL accept a command that persists app settings, and SHALL push a settings
change as an event to every attached client except the one that saved it. Settings commands SHALL
be subject to the same single-operator control rule as the other commands.

#### Scenario: Settings arrive with the snapshot

- **WHEN** a client attaches to a daemon that has stored app settings
- **THEN** the snapshot carries those settings, so the client is accurate before any event arrives

#### Scenario: Absence is distinguishable from defaults

- **WHEN** a client attaches to a daemon that has no stored app settings
- **THEN** the snapshot reports their absence rather than a default record, so the client can seed
  the daemon from its own settings instead of adopting defaults over them

#### Scenario: A saved change is pushed to the other clients

- **WHEN** the controlling client sends the save-settings command
- **THEN** the daemon persists the settings and sends them as an event to the other clients, and
  not back to the sender

## MODIFIED Requirements

### Requirement: Shared editable session

The daemon SHALL store the editable session — placed artwork and page layout — and serve it to
every client on attach, so any device sees the current drawing. Machine calibration is NOT part
of the session: it is app settings (see the `app-settings` capability), stored separately on the
gateway. A session that carries a calibration from an earlier release SHALL still be honoured —
the client adopts it when the daemon serves no app settings — so upgrading loses no tuned setup.

#### Scenario: Any device sees the current drawing

- **WHEN** a client attaches to the daemon
- **THEN** the snapshot carries the stored session and the client restores the artwork and page

#### Scenario: Calibration no longer rides the session

- **WHEN** a client saves the session after this change
- **THEN** the stored session contains artwork and page layout only, and the machine setup is
  saved through the app-settings channel instead

#### Scenario: A session from an older release still yields its setup

- **WHEN** the stored session carries a calibration and the daemon serves no app settings
- **THEN** the client adopts that calibration and seeds it into the app settings
