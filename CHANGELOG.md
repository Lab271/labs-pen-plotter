# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Licensed the project under Apache License 2.0 (previously MIT).
- Added open-source project hygiene: `CHANGELOG.md`, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, README status badges, and Dependabot
  update configuration.

## [1.0.4] - 2026-06-25

### Fixed

- The in-app "update available" banner now clears after a successful self-update.

## [1.0.3] - 2026-06-24

### Fixed

- Importing a large SVG no longer freezes the UI.

## [1.0.2] - 2026-06-24

### Changed

- The Debian package installs self-updates non-interactively.

## [1.0.1] - 2026-06-24

### Changed

- The gateway daemon binds to `0.0.0.0` by default in the `.deb` so the app is
  reachable on the LAN with no tunnel. **Note:** the daemon has no built-in
  authentication — see [`SECURITY.md`](SECURITY.md) before exposing it.

## [1.0.0] - 2026-06-23

First feature-complete release.

### Added

- **Plotter control core** — GRBL streaming engine, machine status/alarms, and
  manual control (jog, pen up/down, set/go-to work zero, motors off).
- **Machine origin handling** — work-coordinate origin at the paper's top-left
  corner with position restore across power cycles (no homing / no limit switches).
- **SVG & PNG plotting** — SVG flattening to polylines, raster iso-contour tracing,
  page layout (place/scale/rotate), and G-code generation.
- **Gateway daemon** — a long-running Node daemon that owns the serial port,
  streams plots autonomously (survives client disconnects), and serves the GUI
  over a WebSocket.
- **Plot-time estimate** — estimated plot duration costed from calibrated feed
  rates and pen dwell.
- **Live drawing controls** — progress, pause/resume, stop-and-return-home, feed
  override, and a live pen-position marker.
- **Mobile remote control** — connect and monitor from any device on the network.
- **Shared calibration & session persistence** — layout/session stored on the
  daemon; calibration stored per browser.
- **Raspberry Pi deployment** — an arm64 `.deb` package with a bundled Node
  runtime, systemd service, udev rule, and dedicated system user.
- **In-app self-update** — install newer releases from the latest GitHub Release
  directly from the browser.

[Unreleased]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.4...HEAD
[1.0.4]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Lab271/labs-pen-plotter/releases/tag/v1.0.0
