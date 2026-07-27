# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Dev-tooling maintenance: TypeScript 7, Vite 8.1, Vitest 4.1.10, Prettier 3.9,
  `@vitejs/plugin-react` 6.0.4, and Tailwind 4.3.3. Added `src/vite-env.d.ts`
  (`vite/client` types) so TypeScript 7 resolves the side-effect CSS import.

## [1.0.5] - 2026-07-27

### Changed

- Upgraded the frontend to **React 19** (`react`/`react-dom` 19.2, `react-konva`
  19.2, and the matching `@types`).
- Relicensed the project under **Apache License 2.0** (previously MIT).
- Derive the WebSocket URL from the page's scheme/host so the app works behind an
  HTTPS reverse proxy (`wss://`).
- Dependency maintenance: `ws` 8.21.1, `tsx` 4.23.1, and the CI actions
  (`actions/checkout` 7, `actions/setup-node` 7, `docker/setup-qemu-action` 4.2).

### Added

- Project docs and automation: `CHANGELOG.md`, README status badges, and a
  Dependabot configuration for weekly dependency and GitHub Actions updates.

### Security

- Bumped `postcss` to resolve [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849)
  (dev-only transitive dependency).

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
  authentication — see the **Access** section of the [README](README.md) before
  exposing it.

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

[Unreleased]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.5...HEAD
[1.0.5]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Lab271/labs-pen-plotter/releases/tag/v1.0.0
