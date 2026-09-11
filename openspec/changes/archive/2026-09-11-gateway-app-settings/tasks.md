## 1. Shared settings model

- [x] 1.1 `src/gateway/appSettings.ts`: `AppSettings` (version + calibration), defaults,
      `normalizeAppSettings` (drops unknown keys, rejects non-finite numbers, never aliases the
      defaults), `appSettingsFromLegacySession`
- [x] 1.2 Unit tests in `src/gateway/__tests__/appSettings.test.ts` — junk input, partial input,
      non-numeric/non-finite values, unknown keys, no aliasing, legacy-session migration

## 2. Protocol + daemon

- [x] 2.1 `src/gateway/protocol.ts`: `saveAppSettings` command, nullable `appSettings` on the
      snapshot, `appSettings` forwarded event
- [x] 2.2 `gateway/server.ts`: `PLOTTER_APP_SETTINGS` path, load-and-normalise on boot with the
      legacy-session seed, atomic serialized write, snapshot field, command handler that pushes to
      every client except the sender

## 3. Client + UI

- [x] 3.1 `GatewayClient`: `appSettings` event (emitted after `session` so the typed record wins),
      `saveAppSettings`
- [x] 3.2 `src/ui/settingsStore.ts` replaces `calibrationStore.ts`, reading the pre-1.3
      calibration key once
- [x] 3.3 `App.tsx`: settings state with a `settingsSynced` gate, adopt on connect, seed when the
      daemon has none, stop writing calibration into the session blob

## 4. Packaging, docs, gate

- [x] 4.1 `PLOTTER_APP_SETTINGS` in `packaging/penplotter271.env`, README env table, `.gitignore`
- [x] 4.2 CHANGELOG entry
- [x] 4.3 `mise run ci` green; coverage floors hold
