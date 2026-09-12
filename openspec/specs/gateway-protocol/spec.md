# gateway-protocol Specification

## Purpose

Define the WebSocket protocol between the gateway daemon and its clients: the command channel that drives the machine, the event channel that pushes live machine state, single-operator control arbitration, and the browser thin-client transport that replaces direct Web Serial use in the GUI.
## Requirements
### Requirement: WebSocket command channel

The daemon SHALL expose a WebSocket endpoint that accepts JSON commands which map to the controller's operations — at minimum: plot (send a G-code program), pause, resume, stop, jog, jog-cancel, pen up/down, set work zero, go to work zero, motors off, unlock, and write a setting. Unknown or malformed commands SHALL be rejected without affecting the connection.

#### Scenario: Command drives the machine

- **WHEN** the controlling client sends a `plot` command with a G-code program
- **THEN** the daemon streams that program to the plotter

#### Scenario: Malformed command is rejected safely

- **WHEN** a client sends an unknown or malformed command
- **THEN** the daemon ignores/rejects it with an error reply and keeps the connection and any running plot unaffected

### Requirement: WebSocket event channel

The daemon SHALL push machine events to connected clients over the WebSocket — at minimum: connected/disconnected, status (state + machine/work position), stream progress, stream complete/aborted, error, alarm, settings, and log. On attach, it SHALL send a snapshot of current state (connection, latest status, settings) so a newly connected client is immediately accurate.

#### Scenario: Live events stream to clients

- **WHEN** the machine reports status and a plot advances
- **THEN** connected clients receive status and progress events reflecting the live machine

#### Scenario: Snapshot on attach

- **WHEN** a client connects to the daemon
- **THEN** it first receives a snapshot of the current connection state, latest status, and settings before incremental events

### Requirement: Single-operator control

The daemon SHALL grant active control to one client at a time. Additional clients MAY observe (receive events) but MUST NOT issue machine commands until control is released. Control SHALL be released automatically when the controlling client disconnects.

#### Scenario: Second client is read-only

- **WHEN** a second client connects while another holds control
- **THEN** the second client receives events but its machine commands are refused until control is available

#### Scenario: Control released on disconnect

- **WHEN** the controlling client disconnects
- **THEN** control is released so another client can take control

### Requirement: Browser thin-client transport

The browser GUI SHALL talk to the plotter only through a gateway client that speaks this WebSocket protocol, exposing the same observe-events-and-send-commands surface the UI already uses, so the GUI no longer opens a serial port itself.

#### Scenario: GUI operates via the gateway

- **WHEN** the operator uses the GUI (jog, set zero, plot, pause/stop, watch the live marker and progress)
- **THEN** every action and update flows over the WebSocket gateway, with no direct Web Serial use in the browser

### Requirement: Shared editable session

The daemon SHALL store the editable session — placed artwork and page layout — and serve it to every client on attach, so any device sees the current drawing. Machine calibration is NOT part of the session: it is app settings (see the `app-settings` capability), stored separately on the gateway. A session that carries a calibration from an earlier release SHALL still be honoured — the client adopts it when the daemon serves no app settings — so upgrading loses no tuned setup.

#### Scenario: Any device sees the current drawing

- **WHEN** a client attaches to the daemon
- **THEN** the snapshot carries the stored session and the client restores the artwork and page

#### Scenario: Calibration no longer rides the session

- **WHEN** a client saves the session after this change
- **THEN** the stored session contains artwork and page layout only, and the machine setup is saved through the app-settings channel instead

#### Scenario: A session from an older release still yields its setup

- **WHEN** the stored session carries a calibration and the daemon serves no app settings
- **THEN** the client adopts that calibration and seeds it into the app settings

### Requirement: App settings channel

The attach snapshot SHALL carry the daemon's app settings, or an explicit "none stored yet" value. The daemon SHALL accept a command that persists app settings, and SHALL push a settings change as an event to every attached client except the one that saved it. Settings commands SHALL be subject to the same single-operator control rule as the other commands.

#### Scenario: Settings arrive with the snapshot

- **WHEN** a client attaches to a daemon that has stored app settings
- **THEN** the snapshot carries those settings, so the client is accurate before any event arrives

#### Scenario: Absence is distinguishable from defaults

- **WHEN** a client attaches to a daemon that has no stored app settings
- **THEN** the snapshot reports their absence rather than a default record, so the client can seed the daemon from its own settings instead of adopting defaults over them

#### Scenario: A saved change is pushed to the other clients

- **WHEN** the controlling client sends the save-settings command
- **THEN** the daemon persists the settings and sends them as an event to the other clients, and not back to the sender

### Requirement: Version reporting

The daemon's attach snapshot SHALL include the installed application version, and the daemon SHALL report the latest available released version (or that none is known) so clients can show what is running and whether an update exists. The latest-version lookup SHALL be best-effort and SHALL NOT block or break the connection when it is unavailable (e.g. offline).

#### Scenario: Snapshot carries the installed version

- **WHEN** a client attaches to the daemon
- **THEN** the snapshot includes the installed application version

#### Scenario: Latest version is reported when known

- **WHEN** the daemon has determined the latest released version
- **THEN** clients are informed of it, and when it is newer than the installed version they can present an update as available

#### Scenario: Offline lookup does not break the channel

- **WHEN** the latest-version lookup fails (e.g. no network)
- **THEN** the connection and any running plot are unaffected and the installed version is still reported

### Requirement: Update control channel

The daemon SHALL accept a command to trigger a self-update and SHALL emit update-progress/outcome so clients can reflect it. The update command SHALL be refused while a plot is running. Update status SHALL survive the daemon restart that an update causes, so a reconnecting client can observe the final outcome.

#### Scenario: Update is triggered when idle

- **WHEN** the controlling client sends the update command while the machine is idle
- **THEN** the daemon begins the update and reports progress

#### Scenario: Update is refused mid-plot

- **WHEN** a client sends the update command while a plot is running
- **THEN** the daemon rejects it without affecting the plot

#### Scenario: Outcome observable after restart

- **WHEN** an update completes (or fails) and the daemon has restarted
- **THEN** a reconnecting client can read the final update status and the now-installed version

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

### Requirement: Stored-project channel

The daemon SHALL accept commands to save, load and delete a stored project. The attach snapshot
SHALL carry the list of stored projects, and the daemon SHALL broadcast the list whenever it
changes. A loaded project SHALL be sent only to the client that asked for it.

#### Scenario: Listing on attach

- **WHEN** a client attaches
- **THEN** the snapshot carries the names of the stored projects and when each was saved

#### Scenario: The list stays current

- **WHEN** any client saves or deletes a project
- **THEN** every attached client is sent the new list

#### Scenario: A load is addressed

- **WHEN** a client asks for a project
- **THEN** only that client receives it
