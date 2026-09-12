# responsive-control Specification

## Purpose
TBD - created by archiving change mobile-remote-control. Update Purpose after archive.
## Requirements
### Requirement: Phone control view

On phone-sized screens the web app SHALL present a clean, touch-friendly layout focused on running
a plot, without the desktop three-column editor. The live plotter canvas (paper, artwork, and the
live pen marker) SHALL be the centrepiece, sized so the controls below it remain visible, and SHALL
show machine state, position, and plot progress. The phone view SHALL offer the
operate-the-machine controls — Pause/Resume/Stop, jog, pen up/down, and home/calibration (set work
zero, motors off, go to home, unlock) — laid out compactly (e.g. jog and home/calibration side by
side). The machine setup (pen Z, dwell, feeds, import defaults) SHALL be reachable on a phone
through the settings page, and the per-artwork drawing controls through their collapsed panel —
neither is desktop-only, because the operator standing at the machine is the one holding the phone.
Artwork import and the speed override remain desktop-only. The layout SHALL NOT overlap panels or
require horizontal scrolling.

#### Scenario: Phone shows the live plotter and controls

- **WHEN** the app is opened on a phone-width screen during a plot
- **THEN** the live canvas (with the moving pen marker), machine state, position, and progress are
  visible and update in real time, with Pause/Resume/Stop, jog, pen, and home/calibration controls
  reachable and touch-sized

#### Scenario: Machine setup is reachable from a phone

- **WHEN** the operator opens the settings page on a phone
- **THEN** the pen Z, dwell, feeds and import defaults are shown and editable

#### Scenario: Import stays desktop-only

- **WHEN** the operator uses the phone view
- **THEN** artwork import and the speed override are not shown; those remain on the desktop layout

#### Scenario: Desktop layout unchanged on wide screens

- **WHEN** the app is opened on a wide screen
- **THEN** the existing three-column editor layout is presented unchanged, with the machine setup on
  the settings page rather than in the right-hand column

### Requirement: Run plot controls from the phone

From the phone view the operator SHALL be able to control a plot running on the daemon — Pause, Resume, Stop — and jog/home the machine, with live status reflecting the result.

#### Scenario: Halting a plot from a phone

- **WHEN** a plot is running and the operator uses the phone view to pause, resume, or stop it
- **THEN** the command takes effect on the daemon-driven plot and the view's live state and progress update accordingly

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
