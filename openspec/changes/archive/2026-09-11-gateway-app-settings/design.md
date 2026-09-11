## Context

Two kinds of state already sync through the daemon: the remembered *position*
(`.plotter-state.json`, written by the daemon, atomic) and the editable *session*
(`.session.json`, an opaque blob the browser owns and the daemon just stores and serves). The
`shared-calibration` change put the machine setup into the session blob because that channel
already existed — the daemon needed no code. That was the right small step and the wrong home:
the artwork is replaced every job, the machine setup almost never, and the settings still to come
(pens #2, paper defaults #7, tool profiles #58) are not properties of a drawing.

## Decisions

- **A separate file, not a section of the session.** `PLOTTER_APP_SETTINGS`, default
  `gateway/.app-settings.json`, beside the other runtime files. Replacing the artwork can then
  never touch the machine setup, and the operator can read (or hand-edit) one small file.
- **Typed and normalised, unlike the session.** The session is deliberately opaque to the daemon;
  settings are not. This file holds the pen-down Z and the feeds, which go straight into a plot's
  G-code, so everything read from disk or the wire passes `normalizeAppSettings`: unknown keys are
  dropped, and a non-number (`"fast"`, `NaN`, `Infinity`) falls back to its default rather than
  reaching the machine.
- **`null` means "the daemon has none yet".** Sending defaults instead would let a fresh daemon
  overwrite the laptop's tuned setup the moment it attaches. `null` makes the client keep its own
  and seed the daemon — the same "seed, don't overwrite" rule the shared session uses, and the
  reason the snapshot field is nullable rather than defaulted server-side.
- **Push to the other clients, not the sender.** Echoing a save back to its author would fight the
  input the operator is typing into (and loop through the persist effect). Every other client
  adopts it, which is what "all clients see the same settings" means in practice.
- **Atomic, serialized writes.** Temp file + rename, chained behind the previous write. A
  half-written settings file reads back as defaults, which would silently plot with the wrong pen
  Z — the same failure mode the position file's atomic write exists to prevent.
- **Client keeps a `localStorage` cache.** Not a second source of truth: it decides the first
  paint before the WebSocket snapshot arrives, and it is what seeds a daemon with no settings. It
  also reads the pre-1.3 `penplotter271.calibration` key once, so an existing browser does not
  start from defaults.
- **Settings writes stay behind the in-control gate**, like `saveSession` and `setCalibration`
  before them. A read-only client changing the machine setup mid-plot is not wanted, and this
  needs no new rule to achieve.

## Risks / Trade-offs

- Adopting the daemon's settings on connect overrides local tweaks made while detached. That is
  the intent (one shared machine setup) and matches how artwork already syncs — but it does mean
  the last device to save wins.
- The record is versioned (`version: 1`) though nothing migrates yet. Adding a field needs no
  bump; normalisation fills missing ones from the defaults. The version is there for the case a
  field's *meaning* changes.
