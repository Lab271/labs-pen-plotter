# drawing-controls Specification

## Purpose
TBD - created by archiving change live-drawing-controls. Update Purpose after archive.
## Requirements
### Requirement: Live preview of drawing controls

The system SHALL let the operator adjust how an imported artwork looks and update the on-canvas preview to reflect the change, without re-importing the file. The change SHALL apply to the artwork already placed on the page.

#### Scenario: Adjusting a control updates the preview

- **WHEN** the operator changes a drawing control for a placed artwork
- **THEN** the canvas preview updates to show the result (after at most a brief processing delay for controls that re-derive geometry from the source)

#### Scenario: Applies to both PNG and SVG

- **WHEN** the placed artwork is a traced PNG or a flattened SVG
- **THEN** the relevant controls retune that artwork in place and the preview updates for either format

### Requirement: Preview matches the plotted output

The geometry shown in the live preview SHALL be the same geometry that is plotted, so adjusting controls changes both identically.

#### Scenario: What you see is what plots

- **WHEN** the operator tunes an artwork's controls and then plots it
- **THEN** the plotted result corresponds to the previewed geometry, with no separate re-processing that could diverge

### Requirement: Sliders with typeable, configurable values

Drawing-look controls SHALL be presented as sliders, and each SHALL also expose its current numeric value such that the operator can enter an exact value. Each control SHALL have a defined range, and the numeric entry SHALL allow setting a precise value within (and where appropriate beyond) the slider's nominal range.

#### Scenario: Drag or type

- **WHEN** the operator drags a control's slider or types a value into its numeric field
- **THEN** both reflect the same value and the artwork updates accordingly

### Requirement: Controls lock while a plot is running

Once a plot has started, the artwork's placement and all of its drawing controls SHALL be locked (read-only) until the plot ends, so the geometry being plotted cannot change while it is being drawn. The controls SHALL re-enable when the plot completes, is stopped, or is aborted.

#### Scenario: Locked during a plot

- **WHEN** the operator starts a plot
- **THEN** the drawing controls and placement for the plotted artwork become read-only and cannot be changed for the duration of the plot

#### Scenario: Unlocked after the plot ends

- **WHEN** the plot completes, is stopped, or is aborted
- **THEN** the drawing controls and placement become editable again

### Requirement: Per-artwork control values

Each placed artwork SHALL carry its own drawing-control values, so multiple artworks on one page can be tuned independently, and those values SHALL persist with the session.

#### Scenario: Independent tuning

- **WHEN** two artworks are on the page and the operator tunes one
- **THEN** the other is unaffected, and each artwork's control values are restored when the session reloads

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
