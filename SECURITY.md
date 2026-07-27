# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do not open a public GitHub issue.

- Preferred: open a [private security advisory](https://github.com/Lab271/labs-pen-plotter/security/advisories/new)
  on this repository, **or**
- Email **dsiderius@schubergphilis.com** with the details.

Please include a description, reproduction steps, and the affected version. You'll get an
acknowledgement, and we'll keep you posted as we work on a fix. Please give us reasonable
time to address the issue before any public disclosure.

## Supported versions

This project moves fast and only the latest release is supported. Fixes ship in a new
release rather than being backported.

## Important: the gateway has no built-in authentication

This is a design property, not a bug, but it has real security implications you must
understand before deploying.

The gateway daemon exposes **unauthenticated** control over HTTP/WebSocket. Anyone who can
reach the daemon's address can jog the gantry and start or stop plots — a physical-safety
concern, not just a data one.

- The Debian package ships bound to `0.0.0.0` (the whole LAN) so the app works with no
  tunnel. **This is only acceptable on a fully trusted LAN.**
- On any network with untrusted devices, set `GATEWAY_HOST=127.0.0.1` (loopback only) in
  `/etc/penplotter271/penplotter271.env` and reach the app over an SSH tunnel, a VPN
  (e.g. Tailscale), or a reverse proxy that adds its own authentication.

See the **Access** section of the [README](README.md) for the full details.
