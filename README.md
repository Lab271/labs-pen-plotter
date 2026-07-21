# PenPlotter271

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

- **Import SVG or PNG/JPEG.** SVGs are flattened to polylines in the browser DOM
  (`getPointAtLength` / `getCTM`, no dependencies). Raster images are traced with
  marching-squares iso-contours — adjust a darkness threshold and the number of
  brightness levels (1 = outline only, more = tonal layers). Fill-heavy SVGs plot best
  if you import them as PNG.
- **Lay out on a paper canvas (Konva).** Place, scale, and rotate (including 90° steps)
  one or more artworks on a sheet anchored at the bed's top-left corner. "Fit to corner"
  and "fit to paper" helpers, paper presets A4–A0 (plus an A0 SBP variant) or a custom
  size, in landscape or portrait.
- **WYSIWYG preview.** The canvas renders the actual flattened pen path, plus a **live
  pen marker** that tracks the machine's reported work position while it draws.
- **Detail slider.** Thins strokes live for both the preview and the plot — fewer strokes
  draw faster — without re-importing the artwork.
- **Plot-time estimate.** The G-code is costed against the calibrated feed rates and pen
  dwell to show an estimated duration before you start.
- **Streaming with live feedback.** Progress bar, live machine state and position,
  pause/resume, and stop-and-return-home. A stall watchdog and a dead-link watchdog abort
  a plot that hangs, and a diagnostic log panel keeps the last events.
- **Manual control.** Jog, pen up/down, set work zero, go to work zero, motors off, view
  the raw `$$` settings, a live feed-rate override, and per-axis calibration (pen Z,
  dwell, feed rates).
- **Session persistence.** Your artwork and page layout are stored on the daemon, so any
  device that connects gets the current drawing back. Calibration is stored per browser.

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

Closing the browser or dropping the connection does **not** stop a running plot — the Pi
streams autonomously; reconnect to monitor. See [`gateway/README.md`](gateway/README.md)
for the full daemon behavior and access notes.

### Updating

When a newer version is released, the app shows an **"update available (vX → vY)"** banner
in the browser header; click **Update now** (disabled while a plot is running) and the Pi
downloads and installs the latest release `.deb` itself, then restarts — no SSH needed. The
app reconnects and shows the new version. To upgrade or **roll back** by hand, install a
specific `.deb` (config and state are preserved):



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

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (UI work) |
| `npm run build` | Typecheck + build the GUI into `dist/` |
| `npm run gateway` | Run the plotter gateway daemon |
| `npm run gateway:smoke` | Hardware smoke test (moves the machine — set work zero first) |
| `npm test` | Run the unit test suite (Vitest) |
| `npm run typecheck` | Type-check the browser sources |
| `npm run typecheck:node` | Type-check the gateway sources |
| `npm run format` | Format with Prettier |

## Testing

```bash
npm test
```

Unit tests cover the pure, testable core — GRBL line parsing and streaming, SVG/PNG
flattening and iso-contour tracing, placement and fit math, the detail thinner, and
G-code generation (including the plot-time estimate).

## Tech stack

React 18 · TypeScript · Vite · Tailwind CSS · Konva (canvas) · `serialport` + `ws` + `tsx`
(gateway) · Vitest

## Hardware

`3D_print/` contains printable STL parts for a paper holder. Design docs and the full
change history for each feature live under `openspec/`.

## License

MIT © Diederik Siderius — see [`LICENSE`](LICENSE).
