# PenPlotter271 Gateway

A long-running daemon that **owns the plotter's serial port and opens it exactly once**, then exposes the machine over a WebSocket. This fixes the macOS CH340 reopen-wedge (errno 22 — the cause of the "Failed to open" / replug saga) and is the architecture for unattended Raspberry Pi plotting.

The daemon runs the existing framework-free `GrblController` (in `src/grbl`) via `NodeSerialTransport`, streams G-code autonomously (plots survive a browser/laptop disconnect), and serves the built GUI. The browser is a thin client (`src/transport/GatewayClient.ts`) — **no Web Serial in the browser anymore**.

## Run it (macOS dev)

```bash
npm install                 # serialport, ws, tsx (native binding builds on install)
npm run build               # build the GUI into dist/ (the daemon serves it)
npm run gateway             # daemon: opens the port once, serves GUI+WS on :8717
```

Then open **http://localhost:8717** and click Connect. (During UI work you can also run `npm run dev` on :5173; the `GatewayClient` connects to `ws://<host>:8717` regardless.)

Config via env: `GATEWAY_PORT` (default 8717), `PLOTTER_PATH` (pin the device, else auto-detect a `usbserial`/`wchusbserial`/`ttyUSB`/`ttyACM` port).

**Idle sleep (macOS):** when the laptop is left idle, macOS throttles/suspends the daemon (App Nap) and dims the display, which stalls a running plot. The daemon **automatically runs `caffeinate -dimsu`** for its lifetime to prevent this, so `npm run gateway` is enough — no manual step. (If `caffeinate` is somehow unavailable, run `caffeinate -dimsu npm run gateway`.) On the Pi this is a non-issue; disable sleep at the OS level instead.

Hardware smoke test (moves the machine — set work zero first):
```bash
npm run gateway:smoke
```

## Raspberry Pi (auto-connect on power-up)

**Prerequisites:** 64-bit Raspberry Pi OS (Lite is fine — headless), the Pi on your WiFi, SSH enabled, plotter on USB.

**Install the package** — download the latest `penplotter271_<version>_arm64.deb` from [Releases](https://github.com/LAB271/labs-pen-plotter/releases), then:

```bash
sudo apt install ./penplotter271_<version>_arm64.deb
```

It bundles its own Node runtime, installs the app under `/opt/penplotter271`, keeps state under `/var/lib/penplotter271/`, reads config from `/etc/penplotter271/penplotter271.env`, sets up serial access (a `penplotter` user in `dialout` + a udev rule), and enables + starts the `plotter-gateway` boot service. See the [main README](../README.md#raspberry-pi-deployment-debian-package) for config, browser updates, and rollback.

(`gateway/install.sh` — a from-source installer that builds on the Pi — is a development helper, superseded by the package.)

Power-cycle to confirm it auto-starts and auto-connects. Logs: `journalctl -u plotter-gateway -f`.

### Access (LAN — no tunnel, no web login)

The `.deb` ships bound to `0.0.0.0`, so anyone on the LAN opens `http://<pi-hostname>.local:8717` directly — no tunnel. There is **no built-in auth**, so this exposes plotter control to every device on the network and is intended **only for a trusted LAN**.

On an untrusted network, set `GATEWAY_HOST=127.0.0.1` in the conffile (loopback only) and reach it over an SSH tunnel — SSH key auth *is* the access control:

```bash
ssh -L 8717:localhost:8717 pi@<pi-hostname>.local
# then open http://localhost:8717 in your browser
```

Closing the laptop / dropping the connection does **not** stop a running plot (the Pi streams autonomously); reconnect to monitor.

**Team access via 1Password (tunnel mode):** put each member's SSH **public** key in the Pi's `~/.ssh/authorized_keys`; share the **private** keys through a 1Password shared vault for your group (enable the 1Password SSH agent). Prefer one key per person so you can revoke by removing their vault access + their `authorized_keys` line. (Off-site access later: SSH over Tailscale — deferred.)

> Position note: after a power cycle the daemon restores the last position so you needn't re-calibrate, but with no homing/limit switches this is approximate (~1 cm) and assumes the gantry didn't move while off. **Stop the plot before powering off** for the closest restore; **Set Work Zero** to re-calibrate if it drifted. Precise repeatability requires adding limit switches + homing.

## Behavior

- **Open-once:** the serial port is opened once for the daemon's life and never reopened on a client action. A genuine device drop triggers a debounced reconnect (the device re-enumerates).
- **Autonomous streaming:** `plot` sends a full G-code program; the daemon streams it to completion even if every client disconnects.
- **Single operator:** the first connected client holds control; others observe read-only until control is released (auto-released on disconnect).
