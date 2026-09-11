## Why

There is no defined home for app-level settings. The machine setup (work area, pen-up/down Z,
dwell, feeds, PNG import defaults) lives in each browser's `localStorage`, and is shared between
devices only as a passenger on the editable *session* blob — the artwork. Clearing browser data
or opening the app on another device therefore starts from defaults, and the settings that will
arrive next (a pen library, paper defaults, tool profiles) have nowhere to go but the drawing.

One plotter has one setup. It belongs on the machine that owns the plotter: the daemon.

## What Changes

- A typed **app settings** record (`src/gateway/appSettings.ts`), separate from the session,
  with defaults and a `normalizeAppSettings` that every read (disk or wire) passes through.
- The daemon **persists it to disk** (`PLOTTER_APP_SETTINGS`, default
  `gateway/.app-settings.json`), atomically, serves it in the attach snapshot, and pushes changes
  to the other clients so every device shows one setup.
- A daemon with **no settings file yet** reports `null` rather than defaults: the first client
  then seeds it from its own settings, so a tuned setup is never overwritten with defaults. A
  daemon upgraded from <1.3 seeds itself from the calibration the session blob carried.
- The browser keeps a `localStorage` **cache** (first paint before the socket opens, and the
  seed for a fresh daemon); the daemon is authoritative.
- Machine calibration is no longer *written* into the session blob. It is still read there, so an
  old session, or a new client talking to an old daemon, keeps a tuned setup.

## Capabilities

### Added Capabilities
- `app-settings`: app-level settings are stored on the gateway, shared by every client of one
  plotter, and survive a browser-data clear or a change of device.

### Modified Capabilities
- `gateway-protocol`: the attach snapshot carries app settings (or `null`), a `saveAppSettings`
  command persists them, and an `appSettings` event pushes a change to the other clients.

## Impact

- **Code:** new `src/gateway/appSettings.ts` (+ tests) and `src/ui/settingsStore.ts` (replaces
  `src/ui/calibrationStore.ts`); `src/gateway/protocol.ts`, `gateway/server.ts`,
  `src/transport/GatewayClient.ts`, `src/ui/App.tsx`, `src/ui/sessionStore.ts`.
- **Packaging/docs:** `PLOTTER_APP_SETTINGS` in `packaging/penplotter271.env`, the README env
  table, `.gitignore`.
- **Behaviour:** settings follow the machine, not the browser. No change to the artwork session,
  and none to project save/load (#8), which stays a separate concern.
