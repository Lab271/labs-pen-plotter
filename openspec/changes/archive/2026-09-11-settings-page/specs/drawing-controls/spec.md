## ADDED Requirements

### Requirement: Per-artwork controls are collapsed by default

The per-artwork drawing controls SHALL be presented next to the artwork, collapsed by default and
expandable in place, on every screen size. They SHALL NOT move to the settings page: their values
belong to one artwork and are saved with the session, not with the app settings.

#### Scenario: Out of the way until wanted

- **WHEN** the operator opens the app
- **THEN** the drawing-controls panel is collapsed, and expanding it shows the selected artwork's
  controls with their current values

#### Scenario: Reachable on a phone

- **WHEN** the operator expands the panel on a phone-width screen
- **THEN** the selected artwork's controls are usable there
