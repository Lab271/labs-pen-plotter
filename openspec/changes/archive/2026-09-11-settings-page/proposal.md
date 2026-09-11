## Why

The main page is a wall of settings. Pen-down/up Z, dwell, three feed rates and the PNG import
defaults sit in the right-hand column next to the panels the operator actually touches per job —
artwork, jog, home, registration, plot. All of it is configured once and then left alone, and on a
phone it was not there at all (`hidden md:block`), so the machine setup could only be changed from
a laptop.

## What Changes

- A **Settings page** (`src/ui/SettingsPage.tsx`), a full-screen overlay reached from a **gear
  button** in the header: Machine (work area), Pen (Z, dwell), Feeds (draw/travel/jog), Import
  defaults (PNG threshold/levels), Connection (plotter/firmware/app/latest version, and the update
  button when one is available), and a read-only **`$$` view** of the controller's own settings.
- The main page keeps only the job: artwork + placement, canvas, jog + pen, home/calibration,
  registration, plot/pause/resume/stop, progress, speed override.
- **Per-artwork** drawing controls stay next to the artwork — they are properties of that artwork,
  not app settings — but are now **collapsed by default** and reachable on a phone.
- Settings **apply immediately**, with no Save/Cancel: they are the shared app settings from #14,
  so an edit is on the gateway and on every other client before the page closes.
- The `$$` list is deliberately read-only: writing those values writes the machine's EEPROM.

## Capabilities

### Added Capabilities
- `settings-page`: a single place for what is configured once — reachable from one obvious control,
  applied live, and available on every screen size.

### Modified Capabilities
- `responsive-control`: pen/feed settings and the per-artwork drawing controls are no longer
  desktop-only; a phone reaches them through the Settings page and the collapsed panel. Artwork
  import and the speed override stay desktop-only.
- `drawing-controls`: the per-artwork panel is collapsed by default, on every screen size.

## Impact

- **Code:** new `src/ui/SettingsPage.tsx`; `src/ui/App.tsx` (gear button, overlay, `$$` state, the
  Pen & feeds panel removed, `Section` gains a collapsible mode).
- **Behaviour:** no setting changes meaning, is renamed, or loses its persistence — they all live
  in the app settings record and are stored on the gateway exactly as before.
