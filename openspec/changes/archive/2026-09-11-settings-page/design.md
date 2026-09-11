## Context

The right-hand column carried five panels: Home/calibration and Registration (per job), and Pen &
feeds plus Drawing controls (setup). Two of them were `hidden md:block`, which is the clearest
signal that the main page had too much on it: the answer to "no room on a phone" had been "don't
show it", and the machine setup became laptop-only.

App settings now live on the gateway (see the `app-settings` capability), which changes what a
settings page has to be: not an editor with a Save button over local state, but a view onto shared
state that is already synced.

## Decisions

- **An overlay, not a route.** No router dependency, and the machine keeps running behind it: the
  operator can open settings mid-plot, and the plot's transport controls and the update banner stay
  where they are. A hash route would add history entries to something opened for ten seconds.
- **No Save/Cancel — edits apply live.** The values are pushed to the gateway as they change, the
  same as before this change. A staged "apply" would mean the pen Z shown is not the pen Z a plot
  would use, which is worse than immediate for a machine setup. The header says so, rather than
  leaving the operator to guess.
- **Full-screen on a phone, a centred panel on desktop.** Same component; the settings that were
  invisible on a phone are now the *only* thing on screen when opened there.
- **`$$` is read-only.** The daemon already has a `setSetting` command, so making the list editable
  would be easy and wrong: those writes go to the controller's EEPROM, are per-axis footguns on a
  machine with no limit switches (`$22=0`, soft limits off per axis), and are not what an operator
  needs mid-job. Showing them answers "what does the controller think?", which is the actual need
  when a plot behaves oddly.
- **Per-artwork controls stay on the main page.** Sampling/detail/threshold belong to an artwork,
  not to the app: two artworks on one page have different values, and they are saved with the
  session, not the settings. Collapsed by default keeps them out of the way while leaving them
  beside the thing they act on — and is what makes them fit on a phone.
- **Work area becomes editable** here. It was in the calibration record but had no control, so the
  A0 default could only be changed by editing storage. It bounds the pre-plot fit check, so it
  belongs with the machine settings.

## Risks / Trade-offs

- Live-applied settings mean a mistyped feed is live immediately. It is bounded by the same
  normalisation the settings channel already does, and by the plot-time check that the artwork fits
  the work area — but a wrong pen-down Z is still a wrong pen-down Z, exactly as it was when the
  field sat on the main page.
- A phone can now change the machine setup mid-job. That is the point (the operator is at the
  machine, not at the laptop), and the in-control gate still applies to the write.
