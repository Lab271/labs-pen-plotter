# pi-deployment Specification

## Purpose

Define the deployment of the gateway as an always-on, headless service on a Raspberry Pi: boot auto-start, stable serial device access without elevated privileges, an OS that never sleeps or throttles an unattended plot, a WiFi-reachable web app gated by SSH, and a repeatable provisioning process.
## Requirements
### Requirement: Boot auto-start service

The gateway SHALL run as a host service that starts automatically when the Raspberry Pi powers on, connects to the plotter (retrying until present), and restarts automatically if it crashes — so powering on the Pi and plotter is enough to reach a ready, awaiting-plots state with no manual steps.

#### Scenario: Power-on brings up the gateway

- **WHEN** the Pi and plotter are powered on
- **THEN** the gateway service starts without anyone logging in, connects to the plotter, and serves the web app

#### Scenario: Crash recovery

- **WHEN** the gateway process exits unexpectedly
- **THEN** the service restarts it automatically and reconnects to the plotter

### Requirement: Access-gated web app

The daemon has **no built-in authentication**. The shipped package SHALL bind to the LAN (`0.0.0.0`) by default so the web app is reachable from any device on the network without an SSH tunnel. Because there is no authentication, binding to the LAN exposes unauthenticated plotter control to every device on the network, so this default is intended ONLY for a trusted LAN and SHALL be documented as such. On an untrusted network the operator SHALL be able to restrict access by setting the bind address to loopback (`127.0.0.1`) in the configuration file, in which case the app is reachable only over an SSH local port-forward, a VPN, or a reverse proxy that adds its own authentication. The development daemon (run from source) SHALL continue to default to loopback.

#### Scenario: LAN access without a tunnel (default)

- **WHEN** an operator on the trusted LAN opens the Pi's address in a browser, with the shipped defaults
- **THEN** the web app loads and its control channel connects without an SSH tunnel or a login, and the operator can run the plotter

#### Scenario: Restricting access on an untrusted network

- **WHEN** an operator sets `GATEWAY_HOST=127.0.0.1` in the configuration file and restarts the service
- **THEN** the daemon refuses direct connections from other devices on the network, and the app is reachable only through an SSH tunnel, a VPN, or an authenticating reverse proxy

#### Scenario: Unauthenticated exposure is explicit

- **WHEN** the package is installed with its default configuration
- **THEN** the shipped configuration and documentation state that plotter control is exposed unauthenticated on the LAN and that the LAN-bound default is intended only for a trusted network

### Requirement: Unattended continuation

After a plot starts, the Pi SHALL continue it to completion even if the laptop disconnects or sleeps, because the Pi (not the laptop) drives the plot.

#### Scenario: Laptop leaves mid-plot

- **WHEN** a plot is running and the operator closes the laptop or leaves the WiFi
- **THEN** the Pi continues the plot to completion, and a later reconnect shows accurate live state

### Requirement: Stable serial access

The service SHALL access the plotter's serial device without elevated privileges and regardless of USB enumeration order, by granting the service user device access and identifying the plotter by a stable means.

#### Scenario: Device access without sudo

- **WHEN** the service starts as its normal user
- **THEN** it can open the plotter serial port without `sudo`

#### Scenario: Stable identification across reboots

- **WHEN** the Pi reboots or the device re-enumerates
- **THEN** the service still finds the plotter (via a stable path/symlink or device match), not a wrong port

### Requirement: Always-on host

The Pi SHALL be configured so the OS does not sleep or throttle the link/process when idle, so an unattended plot is never stalled by power management.

#### Scenario: Idle does not stall a plot

- **WHEN** a plot runs while no one interacts with the Pi
- **THEN** the OS does not idle-sleep or power-save the link, and the plot proceeds normally

### Requirement: Repeatable provisioning

Setting up a Pi SHALL be done by installing a single versioned Debian package (`penplotter271_<version>_arm64.deb`, targeting 64-bit Raspberry Pi OS) with `apt`. The package SHALL be self-contained — bundling the Node runtime and the native serial binding so no separate Node install or build step is required on the Pi — and its maintainer scripts SHALL install the systemd service and device rules, create the dedicated service user with serial access, lay down a default configuration file, and enable the service on boot. Upgrading and removing SHALL likewise go through the package manager. A from-source path MAY remain for development, but is not the supported install path.

#### Scenario: Fresh Pi to running gateway via the package

- **WHEN** an operator runs `sudo apt install ./penplotter271_<version>_arm64.deb` on a fresh 64-bit Raspberry Pi OS install
- **THEN** the gateway ends up installed with its bundled runtime, enabled on boot, serving the web app, and connected to the plotter, without a separate Node install, `npm` build, or other manual fixes

#### Scenario: Upgrade preserves operator configuration

- **WHEN** a newer package version is installed over an existing one
- **THEN** the service is updated and restarted, and operator edits to the configuration file and the remembered machine state are preserved

#### Scenario: Clean removal

- **WHEN** the package is purged
- **THEN** the service is stopped and disabled and the package-managed files are removed

### Requirement: The served GUI's assets have correct content types

The daemon SHALL serve every asset type the built GUI produces with a content type browsers accept,
including JavaScript module files (`.mjs`), WebAssembly and source maps.

#### Scenario: A lazily-loaded module chunk

- **WHEN** the GUI loads a feature whose code is split into a `.mjs` chunk
- **THEN** the daemon serves it as JavaScript and the browser executes it, rather than refusing it
  for its content type
