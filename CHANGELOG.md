# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.1] - 2026-09-08

### Changed

- Jog step is chosen with 0.1 / 1 / 5 / 10 mm buttons (the 3D-printer convention)
  instead of a typed number, in the Jog panel and in the registration wizard.
  Sighting a pen tip onto a crosshair goes 10 → 1 → 0.1 in turn; a button per
  size beats retyping while watching the tip.

## [1.2.0] - 2026-09-08

### Changed

- **Registration is now a wizard.** Importing an SVG with calibration points opens
  it: mount the sticker, jog the pen onto each printed point and Set, and the cut
  lines are fitted — rotation and position, scale fixed at 1:1 — to where the
  sticker really is. Residuals and the implied print scale are shown and flagged.
  A sticker mounted a few degrees off can now be cut; before, only a translation
  could be corrected, and only by moving the work origin.

### Removed

- The 1.1.0 **Run calibration** marking run and **Apply correction** work-origin
  shift (and the `shiftWorkZero` daemon command). Superseded by the wizard: the
  artwork moves, the work origin stays where the operator set it.

## [1.1.0] - 2026-09-08

### Added

- **Registration check.** SVG layers labelled "calibration"/"reference", groups
  with `cal-` ids, or (as a fallback) pure-blue geometry are recognised as
  registration marks: excluded from the cut, reported on import, and reduced to
  one calibration point each. A **Run calibration** program touches the pen down
  on every point for a configurable number of passes, so a miss shows as a mark
  beside the printed dot and drift shows as scatter. **Apply correction** shifts
  the work origin by the miss the operator reads off the sheet, without moving.
- **Place on page** placement: 1:1 at the position the file gives the artwork, so
  file millimetres equal paper millimetres for cuts registered against a print.
  Import now remembers the artwork's page offset for this.

### Fixed

- The daemon refuses to start a program while one is streaming or held. Before,
  a second `plot` interleaved line by line into the running one.

## [1.0.9] - 2026-09-08

### Fixed

- SVGs with a real-world size (`width="…mm"` + `viewBox`) imported 3.78× too
  large. `getCTM()` maps geometry into the root viewport's *pixels*, which
  includes the viewBox→viewport scaling; a 183 mm wide root is laid out at
  96 dpi, so every coordinate arrived pre-multiplied by 96/25.4 before the
  correct mm factor was applied. Pixel-sized exports have a scaling of 1, which
  is why it went unnoticed. The root viewport is now made to coincide with the
  viewBox before measuring. Present since SVG import shipped.
- A root without a `viewBox` now reads its user units as CSS pixels, as the SVG
  spec defines; 1.0.8 wrongly took them to be the declared width unit.

## [1.0.8] - 2026-09-08

### Added

- **Actual size 1:1** placement button next to Fit corner / Fit paper. Import
  still fits the artwork to the paper, which silently rescales a drawing that
  declares its real size — an A4 file on the A0 bed plotted ~4× too large, and the
  only way back was dragging the transform handles until the readout happened to
  say 100%. The button resets the scale to exactly 1, keeps the rotation, and
  anchors the rotated box to the registration corner.

### Fixed

- SVG import honours every CSS absolute length unit on the root `width`/`height`
  (`mm`, `cm`, `Q`, `in`, `pt`, `pc`, `px`), not just `mm`. Illustrator's `pt`
  exports, and `cm`/`in` files, previously fell back to the CSS-pixel assumption
  and imported at the wrong physical size. A relative (`%`) or missing width now
  falls back to an absolute height, and a root without a `viewBox` reads its user
  units as the declared unit, per the SVG default viewBox.

## [1.0.7] - 2026-08-13

### Security

- Reject cross-origin WebSocket handshakes. Browsers do not apply the same-origin
  policy to WebSocket connections — they send an `Origin` header and leave the
  decision to the server, and this one accepted every caller. Because the daemon
  has no authentication, any web page opened by anyone on the same network could
  connect from their browser and take control: `jog`, `plot`, `setSetting` (writes
  GRBL EEPROM) and `update` (installs a `.deb` and restarts) were all reachable,
  with no network access of the attacker's own.

  Same-origin handshakes pass, including through a reverse proxy that forwards the
  original host. Requests without an `Origin` header (curl, the smoke test, native
  clients) still pass — those already require network access to the daemon. Extra
  origins can be allowed with `GATEWAY_ALLOWED_ORIGINS`.

  This is not authentication: anything that can reach the port can still drive the
  machine. Keep it on a trusted network, or bind to loopback.

## [1.0.6] - 2026-08-13

### Fixed

- Behind a reverse proxy on the default HTTPS port, the WebSocket URL appended
  `:8717` to the proxied host, so the GUI loaded but every control was dead —
  the socket pointed at a port the proxy does not listen on. `location.host`
  already carries the port when the URL has one, so it is now used as-is. Direct
  access on `:8717` is unaffected.

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

[Unreleased]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.7...HEAD
[1.0.7]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Lab271/labs-pen-plotter/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Lab271/labs-pen-plotter/releases/tag/v1.0.0
