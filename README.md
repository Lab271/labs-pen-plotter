# PenPlotter271

[![CI](https://github.com/Lab271/labs-pen-plotter/actions/workflows/ci.yml/badge.svg)](https://github.com/Lab271/labs-pen-plotter/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Lab271/labs-pen-plotter?sort=semver)](https://github.com/Lab271/labs-pen-plotter/releases)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

A browser-based control app for a GRBL-style pen plotter (built for a **UUNA TEK 3.0**
with an A0 bed). Import an SVG or PNG, lay it out and scale it on the page, preview the
exact pen path the machine will draw, and stream the generated G-code to the plotter.

The machine is driven by a long-running **gateway daemon** that owns the serial port and
streams plots autonomously. The browser is a thin client that talks to the daemon over a
WebSocket — there is **no browser Web Serial path**. This design fixes the macOS CH340
reopen-wedge, lets a plot survive a browser or laptop disconnect, and is exactly what an
unattended **Raspberry Pi** setup needs.

> ⚠️ **Re-check work zero after any power-off — this machine has no limit switches.**
> The daemon tries to remember the work origin across power cycles, but a power-off/on
> (of the Pi, the plotter, or both) can leave the restored origin noticeably offset.
> **Before plotting after a power cycle, verify — and if needed re-set — work zero by
> jogging to the paper's top-left corner.** If the origin is wrong, nothing stops the
> machine and it **will drive the gantry into the frame.** When in doubt, jog slowly and
> keep a hand near the power switch (or cut the motors and move the gantry to the corner
> by hand).

## What it does

- **One import for every source.** What a file *is* is read from its contents, not its name:
  **SVG** and **vector PDF** go straight onto the page at the real size they declare (keeping
  their page position, so registration works); a **PDF that is really a scan**, a photo, or
  any raster the browser can decode opens the conversion wizard; a **multi-page PDF** asks
  which page; **HEIC** says what to do about it rather than failing silently; and on a phone
  there is a **Take photo** button, so a sketch on paper can be photographed and traced at
  the machine. SVGs are flattened to polylines in the browser DOM (`getPointAtLength` /
  `getCTM`, no dependencies). A raster image opens the **import wizard**: adjust it (brightness,
  contrast, invert, rotate, crop), then choose how it becomes lines — **Outline**
  (marching-squares iso-contours), **Hatching** (parallel lines, denser where the image is
  darker), **Crosshatch** (more directions the darker the tone), **Stippling** (dots placed
  by error diffusion) or **Edge detect** (Sobel) — with a live preview of the actual strokes
  before you commit. An import
  remembers its settings, so you can reopen the wizard and retune it instead of starting
  again. Fill-heavy SVGs plot best exported as a raster and run through the wizard.
- **Lay out on a paper canvas (Konva).** Place, scale, and rotate (including 90° steps)
  one or more artworks on a sheet anchored at the bed's top-left corner. "Fit to corner"
  and "fit to paper" helpers, paper presets A4–A0 (plus an A0 SBP variant) or a custom
  size, in landscape or portrait.
- **Pens.** Define the pens you own (name, colour, line width in mm) once on the settings
  page, then assign one per artwork. The canvas previews each artwork in its pen's colour
  and weight, so the page shows what the plot will look like — not uniform grey. The
  library is shared with every device; the assignment is saved with the drawing.
- **Multi-pen plots.** A drawing using several pens plots as one job: everything for one
  pen, then the machine parks at the work origin with the pen up and asks for the next one.
  Confirm and it carries on exactly where it stopped. The pause is a G-code comment the
  streamer holds on — not `M0` — so the hold belongs to the daemon: reload the page, or
  walk up with a phone, and the prompt is still there to answer.
- **Save and open projects.** A project is the whole job — objects, placements, pens, paper,
  mode and magnets, plus the pens it refers to. Keep it as a file on your own machine, or
  store it on the plotter, where it joins a library every connected device can see and open.
- **Magnets.** The bed has no vacuum, so tell the app where the hold-down magnets are:
  they're drawn as keep-out circles you can drag, **Suggest** offers clear positions at the
  sheet's edges, and **pen-up travel is routed around them** — the detour is drawn on the
  canvas so you can check it before starting. A magnet sitting on a *stroke* turns red and
  blocks the plot, naming which magnet and which artwork: routing can bend a travel move,
  but it cannot move a line that has to be drawn there.
- **Draw or Cut.** A job is one or the other, and the mode drives everything: cutting uses
  the **knife profile** (its own Z, dwell and cut feed), places imports **1:1** at the
  position the file gives them, offers only outline conversions (a fill would shred a
  sticker), previews in cut red, and prepares the toolpath for a drag knife — an
  **overcut** past the closing point so the piece releases, optional **blade-offset
  compensation** at corners (off until you've measured your holder), and **holding tabs** —
  short uncut bridges that keep each piece attached until you snap it out, placed away from
  corners and clear of the overcut. The canvas shows the path the blade will follow, gaps
  and all.
- **Paper type.** Preview the drawing on the stock you are about to use — plain, cream,
  dotted, grid, lined, kraft, or black card (which previews the artwork light, for a white
  or metallic pen). Appearance only: it never touches the generated paths.
- **Draw shapes and text.** Line, rectangle, ellipse and polygon at the size you ask for,
  plus text in a built-in **single-line** font — the skeleton of each letter, not an
  outline traced as a hollow double line. Text stays editable (content, size, letter and
  line spacing) after a reload, and characters the face can't draw are named rather than
  silently dropped.
- **Edit the page as objects.** Select one, several (Shift-click), or drag a band over
  them; move the whole selection at once; copy, paste, duplicate and delete, with the
  usual ⌘C/⌘V/⌘D/⌘A/⌫ shortcuts; and reorder the stack. Editing locks while a plot runs.
- **WYSIWYG preview.** The canvas renders the actual flattened pen path, plus a **live
  pen marker** that tracks the machine's reported work position while it draws.
- **Detail slider.** Thins strokes live for both the preview and the plot — fewer strokes
  draw faster — without re-importing the artwork.
- **Plot-time estimate.** The G-code is costed against the calibrated feed rates and pen
  dwell to show an estimated duration before you start.
- **Streaming with live feedback.** Progress bar, live machine state and position,
  pause/resume, and stop-and-return-home. A stall watchdog and a dead-link watchdog abort
  a plot that hangs, and a diagnostic log panel keeps the last events.
- **Manual control.** Jog, pen up/down, set work zero, go to work zero, motors off, and a
  live feed-rate override.
- **Settings page.** The gear in the header opens everything that is configured once: work
  area, pen-down/up Z, dwell, the draw/travel/jog feeds, image-import defaults, the
  connection and version info, and a read-only view of the controller's raw `$$` settings.
  Changes apply immediately — there is no save step.
- **Everything is shared with every device.** Your artwork and page layout are stored on
  the daemon, so any device that connects gets the current drawing back — and so is the
  machine setup, so a plot started from a phone uses the feeds tuned on the laptop.
  Clearing browser data or switching device loses neither.

## How it works

```
Browser (React + Konva)                Gateway daemon (Node + tsx)            Plotter
┌───────────────────────┐  WebSocket   ┌──────────────────────────┐  serial  ┌────────┐
│ import → layout →      │ ───────────▶ │ GrblController over       │ ───────▶ │ GRBL   │
│ preview → "plot"       │   :8717      │ NodeSerialTransport       │  USB     │ board  │
│ (thin client)          │ ◀─────────── │ owns the port, streams,   │ ◀─────── │        │
└───────────────────────┘  status/log  │ serves the built GUI      │          └────────┘
                                        └──────────────────────────┘
```

1. The browser turns an SVG/PNG into polylines, lets you place them on the page, and
   generates a full G-code program for the layout.
2. It sends that program to the daemon as a single `plot` command over the WebSocket.
3. The daemon streams the G-code to the GRBL board to completion — **even if every client
   disconnects** — and forwards machine status, progress, and errors back to any
   connected clients.
4. The first client to connect holds control; others observe read-only until control is
   released (released automatically on disconnect).

The G-code generator bakes in this specific machine's setup:

- **Inverted Z (pen lift):** `Z+` moves the pen **down**. Pen-down Z is positive
  (default `3`), pen-up is `0`.
- **No homing / no limit switches** (`$22=0`). The operator manually sets work zero at
  the paper corner each session; there is no `$H`.
- **Origin = paper's top-left corner.** SVG→G-code uses an identity mapping (no Y flip):
  machine `+Y` runs physically *down* the page, matching the artwork's Y-down axis. The
  drawing fills the `+X`/`+Y` quadrant.
- After a power cycle the daemon restores the last saved position so you needn't
  re-calibrate, but without homing this is approximate (~1 cm). Stop the plot before
  powering off for the closest restore, and re-run **Set Work Zero** if it drifts.

## Architecture

The GRBL engine depends only on a `Transport` interface — never on Web Serial, the DOM,
or React — so the exact same engine runs on the Pi behind a Node serial adapter,
unchanged.

```
src/grbl/       Portable GRBL protocol engine: streaming, status, alarms (no UI deps)
src/transport/  The seam — Transport interface + the browser's WebSocket client
src/gateway/    Shared WebSocket protocol (commands, snapshot, forwarded events)
src/plot/       Pure pipeline: SVG/PNG → polylines → placement → G-code
src/ui/         React app (the only DOM-aware layer)
gateway/        Raspberry Pi / dev daemon: owns the port, streams autonomously, serves the GUI
openspec/       Design docs and the full change history for each feature
3D_print/       Printable paper-holder parts (STL)
```

## Quick start (local / macOS dev)

```bash
npm install        # installs deps and builds the native serialport binding
npm run build      # typecheck + build the GUI into dist/ (the daemon serves it)
npm run gateway    # opens the port once, serves GUI + WebSocket on http://localhost:8717
```

Then open **http://localhost:8717** and click **Connect**.

For UI work you can also run the Vite dev server — it connects to the same daemon over the
WebSocket, so the gateway still needs to be running for live hardware:

```bash
npm run dev        # Vite dev server on http://localhost:5173
```

On macOS the daemon automatically runs `caffeinate -dimsu` for its lifetime so idle sleep
/ App Nap can't stall a running plot — `npm run gateway` is enough.

### Daemon configuration (env vars)

| Variable | Default | Purpose |
| --- | --- | --- |
| `GATEWAY_PORT` | `8717` | HTTP + WebSocket port |
| `GATEWAY_HOST` | `127.0.0.1` | Bind address. This is the **code default** (e.g. `npm run gateway` on a dev laptop); the **`.deb` ships `0.0.0.0`** (LAN — see the deployment section). The daemon has **no built-in auth**, so `0.0.0.0` exposes unauthenticated control to the whole LAN — use loopback + an SSH tunnel/VPN/reverse proxy on untrusted networks |
| `PLOTTER_PATH` | _(auto)_ | Pin the serial device; otherwise auto-detect a `usbserial`/`wchusbserial`/`ttyUSB`/`ttyACM` port |
| `PLOTTER_STATE` | `gateway/.plotter-state.json` | Where the remembered position is persisted |
| `PLOTTER_SESSION` | `gateway/.session.json` | Where the shared editable session (artwork + page) is persisted |
| `PLOTTER_APP_SETTINGS` | _(beside `PLOTTER_STATE`)_ | Where app settings (machine setup, preferences) are persisted — shared by every client |
| `PLOTTER_PROJECTS` | _(`projects/` beside `PLOTTER_STATE`)_ | Where saved projects are stored, one file per project |
| `GATEWAY_ALLOWED_ORIGINS` | _(none)_ | Extra browser origins allowed to open the WebSocket, comma-separated. Same-origin always passes; add `http://localhost:5173` when driving a live daemon from the Vite dev server |

## Registration (cut to a printed sticker)

Cut jobs are registered against a pre-printed sheet. Put the registration
crosshairs on a layer named **calibration** (Inkscape label) or in groups with ids
`cal-P1`, `cal-P2`, … — as a fallback, pure-blue (`#0000FF`) geometry counts when
no such labels exist. That layer is never cut; import reports how many points it
found. A `<circle>` in the group marks the exact target, otherwise the group's
centre is used.

Importing such a file opens the **registration wizard** (also: **Register…** in
the Registration panel):

1. Mount the sticker on the bed. It does not have to be square.
2. For each point in turn, jog the pen tip onto the printed crosshair — arrow keys
   or the on-screen arrows, with a step size; pen down/up to sight the tip — and
   press **Set** to record the machine's work position.
3. The software fits rotation and position (scale stays 1:1) of the file's points
   onto your measurements and shows the angle, offset, per-point residual and the
   scale the print implies. **Apply** moves and rotates the cut lines onto the
   sticker. A residual over 0.3 mm or a print scale off by more than 1% is flagged;
   go **Back** to re-measure.

**Place on page** is the 1:1 placement at the file's own coordinates, for a sheet
that is mounted exactly at work zero.

## Raspberry Pi deployment (Debian package)

The supported way to run on a Pi is the **`.deb` package** (`penplotter271_<version>_arm64.deb`,
64-bit Raspberry Pi OS Lite). It bundles its own Node runtime and the native `serialport`
binding — no NodeSource setup and no build step on the Pi.

Download the latest `.deb` from the [Releases](https://github.com/LAB271/labs-pen-plotter/releases)
page and install it:

```bash
sudo apt install ./penplotter271_<version>_arm64.deb
```

The package installs the app under `/opt/penplotter271` (bundled Node, gateway, built GUI),
creates a dedicated `penplotter` system user (added to `dialout` for serial access),
installs the udev rule for a stable device path and the `plotter-gateway` systemd service
(enabled + started), keeps writable state under `/var/lib/penplotter271/` (remembered
position, session), and guards against upgrading mid-plot. Confirm it's running:

```bash
systemctl status plotter-gateway
journalctl -u plotter-gateway -f
```

### Configuration

Operator config lives in **`/etc/penplotter271/penplotter271.env`** — a dpkg conffile, so
your edits survive package upgrades. After changing it, restart the service with
`sudo systemctl restart plotter-gateway`. Key settings (the file documents the rest):

| Variable | Default | Purpose |
| --- | --- | --- |
| `GATEWAY_HOST` | `0.0.0.0` | Bind address. Ships LAN-exposed so the app opens with no tunnel. **No built-in auth** — `0.0.0.0` exposes unauthenticated control to the whole LAN (see Access); set `127.0.0.1` for loopback-only |
| `GATEWAY_PORT` | `8717` | HTTP + WebSocket port |
| `PLOTTER_PATH` | _(auto)_ | Pin the serial device; otherwise auto-detect |
| `GITHUB_REPO` | `LAB271/labs-pen-plotter` | Repo whose latest Release supplies the in-app update `.deb` |
| `GATEWAY_ALLOWED_ORIGINS` | _(none)_ | Extra browser origins allowed to open the WebSocket, comma-separated. Same-origin always passes, so a reverse proxy that forwards the host needs no entry here |

### Access (LAN — no tunnel, no web login)

The package ships bound to `0.0.0.0`, so anyone on the LAN just opens the app — no SSH
tunnel needed:

```
http://penplotter.local:8717
# (or the Pi's IP if .local/mDNS doesn't resolve on the device)
```

There is **no built-in authentication**: anyone who can reach that address can jog the
gantry and start or stop plots. This is acceptable only on a **fully trusted LAN**. If the
network has untrusted devices, set `GATEWAY_HOST=127.0.0.1` in the conffile (loopback only)
and reach the app over an SSH tunnel (`ssh -L 8717:localhost:8717 penplotter@penplotter.local`),
a VPN (e.g. Tailscale), or a reverse proxy that adds its own authentication.

The WebSocket does reject **cross-origin** handshakes (same-origin and
`GATEWAY_ALLOWED_ORIGINS` only). That is not authentication — it stops a different
class of attack. Browsers do not apply the same-origin policy to WebSocket
connections, so without the check any web page someone on the network happened to
open could connect from their browser and drive the machine, with no network access
of the attacker's own. Reaching the daemon directly still requires nothing but
network access.

Closing the browser or dropping the connection does **not** stop a running plot — the Pi
streams autonomously; reconnect to monitor. See [`gateway/README.md`](gateway/README.md)
for the full daemon behavior and access notes.

### Updating

When a newer version is released, the app shows an **"update available (vX → vY)"** banner
in the browser header; click **Update now** (disabled while a plot is running) and the Pi
downloads and installs the latest release `.deb` itself, then restarts — no SSH needed. The
app reconnects and shows the new version. To upgrade or **roll back** by hand, install a
specific `.deb` (config and state are preserved):

```bash
# Grab any version's .deb from the Releases page, then on the Pi:
sudo apt install --allow-downgrades ./penplotter271_<version>_arm64.deb
sudo systemctl restart plotter-gateway
```

`--allow-downgrades` is what lets apt go backwards to an older version; it is
harmless when upgrading. Never do this while a plot is running — restarting the
daemon aborts it, with no way to resume.

### Building the package

Releases are built by CI: pushing a `v*` tag (matching `package.json`) builds the arm64
`.deb` and attaches it to the GitHub Release — see
[`.github/workflows/release.yml`](.github/workflows/release.yml). To build one by hand on
an arm64 host (e.g. the Pi itself), run `bash packaging/assemble.sh` (needs
[`nfpm`](https://nfpm.goreleaser.com)); the `.deb` lands in `dist-deb/`.

### From source (development only)

`gateway/install.sh` (an idempotent from-source installer) and the `rsync` / `deploy.sh`
laptop-push workflow are **development helpers**, superseded by the package for normal use:
they build from a repo checkout on the Pi instead of installing a versioned artifact.

## Scripts

[mise](https://mise.jdx.dev/) pins the toolchain — including the exact Node version the
`.deb` bundles — and CI runs the same tasks, so local and CI can't drift:

```bash
mise install       # install the pinned toolchain (Node, zizmor, actionlint)
mise run install   # npm ci
mise run ci        # the full gate: format-check, both typechecks, test, build
```

| Command | npm equivalent | What it does |
| --- | --- | --- |
| `mise run dev` | `npm run dev` | Vite dev server (UI work) |
| `mise run build` | `npm run build` | Typecheck + build the GUI into `dist/` |
| `mise run gateway` | `npm run gateway` | Run the plotter gateway daemon |
| — | `npm run gateway:smoke` | Hardware smoke test (moves the machine — set work zero first) |
| `mise run test` | `npm test` | Run the unit test suite with coverage (Vitest) |
| `mise run typecheck` | `npm run typecheck` | Type-check the browser sources |
| `mise run typecheck-node` | `npm run typecheck:node` | Type-check the gateway sources |
| `mise run format` | `npm run format` | Format with Prettier |
| `mise run format-check` | `npm run format:check` | Check formatting without rewriting |
| `mise run audit` | — | Security-audit the workflows (zizmor) |
| `mise run lint-actions` | — | Lint the workflows (actionlint) |
| `mise run ci-watch` | — | Watch the CI run for the current branch |

## Testing

```bash
npm test           # or: mise run test
```

Unit tests cover the pure, testable core — GRBL line parsing and streaming, SVG/PNG
flattening and iso-contour tracing, placement and fit math, the detail thinner, and
G-code generation (including the plot-time estimate).

Coverage is measured over `src/plot` and `src/grbl` only — the framework-free core.
`src/ui` and `src/transport` need a DOM and a live socket, so including them would
only produce a floor low enough to be meaningless. The per-metric floors live in
`vite.config.ts`; raise them as coverage improves, and never lower one to make CI
pass.

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS · Konva (canvas) · `serialport` + `ws` + `tsx`
(gateway) · Vitest

## Hardware

`3D_print/` contains printable STL parts for a paper holder. Design docs and the full
change history for each feature live under `openspec/`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).
AI agents: see [AGENTS.md](AGENTS.md) — it carries the machine-safety rules that
matter before you touch anything that moves the gantry.

## Security

Please report vulnerabilities privately, not as a GitHub issue. See
[SECURITY.md](SECURITY.md).

## License

Copyright 2026 Schuberg Philis B.V.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
these files except in compliance with the License. You may obtain a copy of the
License in [LICENSE](LICENSE) or at <https://www.apache.org/licenses/LICENSE-2.0>.

Unless required by applicable law or agreed to in writing, software distributed
under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. See the License for the specific
language governing permissions and limitations under the License.
