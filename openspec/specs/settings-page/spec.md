# settings-page Specification

## Purpose

Everything configured once — the machine setup, the pen, the feeds, import defaults — has one
home, off the main page, so the main page is only the job in front of the operator.

## Requirements

### Requirement: One place for what is configured once

The app SHALL present a settings page containing the settings that are configured once and rarely
touched, reachable from a single obvious control in the header.

#### Scenario: Reaching the settings

- **WHEN** the operator activates the settings control in the header
- **THEN** the settings page opens over the app, and closing it returns to the job with nothing lost

#### Scenario: What the settings page holds

- **WHEN** the settings page is open
- **THEN** it offers the machine work area, pen-down/up Z, dwell, the draw/travel/jog feeds, the
  image import defaults, and the connection/version information

### Requirement: The main page is the job

The main page SHALL show only what belongs to the job in progress: artwork and its placement, the
canvas, jog and pen controls, work zero, registration, and the plot transport with its progress.
Settings that apply to the machine rather than the job SHALL NOT be duplicated there.

#### Scenario: No machine settings on the main page

- **WHEN** the operator looks at the main page
- **THEN** the pen Z, dwell and feed fields are not there; they are on the settings page

#### Scenario: Per-artwork controls stay with the artwork

- **WHEN** an artwork is selected on the main page
- **THEN** its own drawing controls are available beside it, collapsed by default, and are not
  moved to the settings page — they belong to that artwork and are saved with the session

### Requirement: Settings apply immediately

A change made on the settings page SHALL take effect at once, with no separate save step, and
SHALL persist as app settings do.

#### Scenario: A feed change is live

- **WHEN** the operator changes a feed rate or a pen Z and closes the settings page
- **THEN** the new value is in effect for the next plot and for manual pen moves, with no reload

#### Scenario: A change survives a reload

- **WHEN** the operator changes a setting and reloads the app
- **THEN** the changed value is shown, restored through the app-settings store

### Requirement: Available on every screen size

The settings page SHALL be usable on a phone as well as on a desktop screen, without horizontal
scrolling or overlapping controls.

#### Scenario: Machine setup from a phone

- **WHEN** the operator opens the settings page on a phone-width screen
- **THEN** it fills the screen, scrolls vertically, and every setting is readable and editable

### Requirement: Controller settings are visible but not editable

The settings page SHALL show the controller's own reported settings (`$$`) read-only, so the
operator can see what the machine believes, and SHALL NOT offer to write them.

#### Scenario: Reading the controller's settings

- **WHEN** the plotter is connected and has reported its settings
- **THEN** the settings page lists them by number with their values, and the well-known ones are
  labelled

#### Scenario: No accidental EEPROM write

- **WHEN** the operator views the controller settings
- **THEN** there is no control that writes them, because that writes the machine's EEPROM

#### Scenario: Not connected

- **WHEN** the plotter is not connected, or has not reported settings yet
- **THEN** the page says so rather than showing an empty list
