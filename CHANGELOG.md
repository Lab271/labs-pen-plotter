# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Holding tabs for cutting.** Short uncut bridges that keep each piece attached to the
  sheet until it is snapped out by hand — the opposite of the overcut, and wanted just as
  often. Count, width and a minimum contour length are set in the knife profile; bridges are
  distributed by arc length, nudged off sharp corners (where a bridge tears instead of
  snapping), kept clear of the stretch the overcut re-traces, and never produce a fragment
  too small to cut. Off by default. The canvas now draws the prepared cutting path — overcut
  tail and tab gaps — over the faded artwork, so where a piece stays attached can be checked
  before a sheet of vinyl is committed.
- **Travel routes around the magnets.** Pen-up moves that would cross a keep-out zone now
  detour clear of it — every leg, including the first one out and the return home — and the
  detours are drawn on the canvas so the route can be checked before starting. The plot-time
  estimate picks up the extra distance for free, since it walks the emitted G-code. With no
  magnets recorded the output is byte-for-byte what it was.
- **Magnet keep-out zones.** The hold-down magnets can be recorded on the canvas, drawn to
  scale as the area the tool must avoid, dragged to move, and sized individually. **Suggest**
  offers positions at the sheet's edges that are fully on the paper and clear of the drawing.
  A magnet that a *stroke* passes through turns red and blocks the plot: the carriage hitting
  one at travel speed drags the sheet, and with no limit switches nothing recovers the work
  origin. Travel legs that cross a magnet are not blocked — routing around them is the next
  step, not a warning to learn to ignore.
- **Cutting mode.** A job is now Draw or Cut. Cutting uses its own knife profile (Z, dwell,
  cut feed, travel feed), places imports at 1:1 where the file puts them rather than fitting
  them to the page, offers only outline conversions in the import wizard, draws the preview
  in cut red, and prepares the toolpath for a drag knife: an **overcut** that carries the
  blade past the closing point so the piece releases, and optional **blade-offset
  compensation** that overshoots sharp corners (off by default until the offset has been
  measured on the actual holder). Stroke reversal is disabled while cutting — compensation
  overshoots along the direction of travel, so a reversed contour would point every
  overshoot into the piece. Draw mode is unchanged.
- **Three more conversion algorithms**, bringing the import wizard to five: **Crosshatch**
  (the darker the tone, the more directions it is hatched from), **Stippling** (dots placed
  by Floyd–Steinberg error diffusion, so density follows tone instead of banding), and
  **Edge detect** (Sobel, normalised by the strongest edge — it finds where the image
  *changes* rather than where it is dark).
- **Image import wizard.** The separate **+ SVG** / **+ PNG** buttons are now one
  **+ Image**: vector files go straight in, raster images open a wizard — adjust
  (brightness, contrast, invert, rotate, crop), then pick a conversion and tune it with a
  live preview of the real strokes. Two algorithms to start: Outline (the iso-contour
  tracing imports used to do silently) and Hatching (parallel lines whose density carries
  tone). An import keeps its settings, so it can be reopened and retuned in place rather
  than re-imported.
- **Shapes and text on the canvas.** Line, rectangle, ellipse and polygon, plus text in a
  built-in single-line stroke font (an outline font would plot letters as hollow double
  lines). Size means cap height in mm, so a ruler on the finished sheet agrees with the
  number. Drawn objects keep the parameters they were generated from, saved with the
  session, so a label can still be retyped after a reload.
- **Editing toolbar and a real scene model.** Multi-selection (click, Shift-click, or a
  rubber band across the page), moving a whole selection at once, copy/paste/duplicate/
  delete, stacking order, and the keyboard shortcuts for all of it. The operations that
  are easy to get subtly wrong — what a band catches, where a paste lands, how a block of
  selected objects reorders — are pure functions in `src/plot/scene.ts` with tests.
- **Multi-pen plotting with pen-change pauses.** Artwork is grouped by pen (in pen-library
  order, so the sequence is predictable and reorderable) and plotted as one job that stops
  between pens. The machine parks at the work origin with the pen up, the app names the pen
  to load, and confirming continues from the next stroke — nothing lost, nothing drawn
  twice. The hold lives on the daemon: reloading the page or attaching another device still
  shows the prompt, a second plot is refused while it waits, and so is an in-app update.
- **Pens.** A pen library — name, colour, line width in mm — defined on the settings
  page and shared with every client, plus a pen per artwork (assigned on import,
  changeable after). The canvas previews each artwork in its pen's colour and weight,
  floored at a hairline so a 0.5 mm line is still visible with A0 fitted to the screen.
  Generated G-code is unchanged: what a pen *means* for the toolpath comes with
  multi-colour plotting and hatching.
- **Selectable paper type.** The canvas can show the sheet you are actually using —
  plain, cream, dotted, grid, lined, kraft or black card — so a drawing can be judged
  against the stock before it is spent. On dark stock the artwork previews light, which
  is what a white or metallic pen does. Appearance only: the style is never passed to the
  G-code generator, so nothing about the plot changes. Saved with the session.
- **A Settings page** behind the gear in the header: work area, pen-down/up Z, dwell,
  the draw/travel/jog feeds, image-import defaults, connection/version info, and a
  read-only view of the controller's `$$` settings. The main page is now the job —
  artwork, canvas, jog, home, registration, plot — and the machine setup, which a
  phone could not reach at all before (`hidden md:block`), is reachable from any
  screen size. Changes apply immediately; there is no save step.

- **App settings live on the gateway.** The machine setup (work area, pen Z, dwell,
  feeds, PNG import defaults) is stored on the Pi rather than in one browser's
  local storage, so every client of a plotter shares one setup, a change made on
  the laptop reaches the phone without a reload, and clearing browser data or
  switching device loses nothing. A gateway with no settings yet is seeded from
  the first client that attaches — a tuned setup is never overwritten with
  defaults — and one upgraded from an earlier release is seeded from the
  calibration its stored session carried. New env var `PLOTTER_APP_SETTINGS`
  (default `gateway/.app-settings.json`).

### Fixed

- The canvas measured itself only through a `ResizeObserver`, whose delivery is throttled
  in a hidden tab — a backgrounded tab (a phone left watching a plot) could come back to an
  empty page. It now measures once on mount as well.

### Changed

- Per-artwork **drawing controls** are collapsed by default and available on a phone.
  They stay beside the artwork rather than moving to Settings: their values belong to
  one artwork and are saved with the session.
- Machine calibration is no longer written into the shared artwork session. It is
  still read from there, so an old session — or a new client talking to an old
  daemon — keeps its tuned setup.

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
