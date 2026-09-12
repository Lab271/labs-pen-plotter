## 1. Format

- [x] 1.1 `src/plot/project.ts`: `makeProject`, `readProject`, `sanitizeProjectName`, file names
- [x] 1.2 Unit tests: round-trip, pens carried and copied, refusal of non-projects, of newer
      versions and of empty sessions, tolerance of missing optional fields, and sanitisation of
      traversal, separators, control characters, filesystem-hostile characters and over-long names

## 2. Daemon

- [x] 2.1 Projects directory (`PLOTTER_PROJECTS`), atomic save, list, load, delete
- [x] 2.2 Listing in the snapshot and broadcast on change; load sent only to the requester
- [x] 2.3 Resolved-path check inside the projects directory

## 3. Client + UI

- [x] 3.1 `saveProject` / `loadProject` / `deleteProject`; `projects` and `projectLoaded` events
- [x] 3.2 Projects panel: name, save to plotter, save to device, open a file, list with delete
- [x] 3.3 Opening merges the project's pens into the library; one shared session builder

## 4. Docs, gate, verification

- [x] 4.1 `PLOTTER_PROJECTS` in packaging and the README env table; README and CHANGELOG
- [x] 4.2 `mise run ci` green
- [x] 4.3 Verified against the real daemon: save writes into the projects directory and broadcasts
      the listing, another client sees it on attach, load returns the stored project to the asking
      client only, `../escaped` lands *inside* the directory under a sanitised name, a nameless
      project is refused, a missing one reports it, delete removes and re-broadcasts, and the
      library survives a daemon restart
- [x] 4.4 Verified in the browser: save to the plotter, clear the page, reopen from the list and
      get the drawing back; opening a project file merges its pens; a stray JSON and a
      future-version file are both refused with the right message
