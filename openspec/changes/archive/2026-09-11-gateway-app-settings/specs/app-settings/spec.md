# app-settings Specification

## Purpose

App-level settings — the machine setup and the operator's preferences, as distinct from the
drawing — are stored on the gateway, so every client of one plotter works from one setup and
nothing depends on a particular browser's storage.

## Requirements

### Requirement: Settings are stored on the gateway

App settings SHALL be persisted on the machine running the daemon, at a configurable path, and
SHALL NOT depend on browser storage for their durability.

#### Scenario: Settings survive a browser-data clear

- **WHEN** the operator changes a setting, clears the browser's data, and reloads the app
- **THEN** the app shows the changed setting, restored from the gateway

#### Scenario: Settings survive a change of device

- **WHEN** the operator opens the app on a different device against the same gateway
- **THEN** that device shows the same settings

#### Scenario: Settings survive a daemon restart

- **WHEN** the daemon is restarted
- **THEN** the settings it serves are the ones last saved, read back from disk

### Requirement: Every client shares one setup

All clients attached to one gateway SHALL see the same settings, and a change made by one client
SHALL reach the others without a reload.

#### Scenario: A change reaches the other clients

- **WHEN** one client saves a settings change
- **THEN** every other attached client updates to the new settings

#### Scenario: The saving client is not echoed

- **WHEN** a client saves a settings change
- **THEN** it is not sent its own change back, so the control the operator is editing does not
  fight the update

### Requirement: Defaults apply cleanly, without overwriting a tuned setup

When the gateway has no settings of its own, it SHALL report their absence rather than reporting
defaults, so a client with settings seeds the gateway instead of adopting defaults over them.

#### Scenario: First run with no settings anywhere

- **WHEN** a client attaches to a gateway with no settings file and has none cached itself
- **THEN** the app runs on the documented defaults

#### Scenario: A tuned client meets a fresh gateway

- **WHEN** a client with its own settings attaches to a gateway that has none
- **THEN** the client keeps its settings and the gateway is seeded with them

#### Scenario: Upgrade from a release that kept the setup in the session

- **WHEN** a gateway with no settings file has a stored session that carries a machine calibration
- **THEN** the settings are seeded from that calibration, so the tuned setup is not lost

### Requirement: Settings are validated before use

Settings read from disk or received from a client SHALL be normalised against the defaults:
unknown fields SHALL be dropped, and a field whose value is not a finite number of the expected
kind SHALL fall back to its default.

#### Scenario: A hand-edited file with a bad value

- **WHEN** the settings file contains a non-numeric or non-finite value for a numeric setting
  (for example a feed rate)
- **THEN** that setting falls back to its default rather than reaching generated G-code

### Requirement: Settings are distinct from the artwork session

App settings SHALL be stored separately from the editable artwork session, and changing one
SHALL NOT alter the other.

#### Scenario: Replacing the artwork keeps the setup

- **WHEN** the operator removes all artwork or imports a different file
- **THEN** the machine setup is unchanged

#### Scenario: Changing the setup keeps the artwork

- **WHEN** the operator changes a setting
- **THEN** the placed artwork, its placement and its per-artwork controls are unchanged
