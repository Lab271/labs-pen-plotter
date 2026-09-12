## ADDED Requirements

### Requirement: Photographing a sketch from a phone

On a phone the app SHALL offer taking a photograph and importing an image, so a drawing on paper
can be photographed and traced without leaving the app. The placement controls remain on the
desktop layout.

#### Scenario: Taking a photo

- **WHEN** the operator uses the take-photo control on a phone
- **THEN** the camera opens, and the picture taken goes into the conversion wizard

#### Scenario: Not on the desktop layout

- **WHEN** the app is used on a wide screen
- **THEN** the camera control is not shown, because there is nothing to photograph with
