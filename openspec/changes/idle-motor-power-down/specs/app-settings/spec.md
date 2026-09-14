## ADDED Requirements

### Requirement: The idle power-down period is part of the shared machine setup

The idle period after which the motors are powered down SHALL be stored with the app settings the
daemon owns, so every client of one plotter uses the same value, and SHALL be editable from the
settings page. A missing or non-numeric value SHALL fall back to the default rather than disabling
or shortening the timer by accident.

#### Scenario: Changed on one device

- **WHEN** the operator changes the idle period on one device
- **THEN** the daemon stores it and the other devices show the new value

#### Scenario: A settings file without the field

- **WHEN** the daemon reads a settings file written before this setting existed
- **THEN** the default period is used
