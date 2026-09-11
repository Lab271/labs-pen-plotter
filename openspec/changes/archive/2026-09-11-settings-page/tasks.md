## 1. Settings page

- [x] 1.1 `src/ui/SettingsPage.tsx`: overlay with Machine (work area), Pen (Z, dwell), Feeds
      (draw/travel/jog), Import defaults (PNG threshold/levels), Connection (versions + update
      button when available), read-only `$$` view with labels for the settings worth naming
- [x] 1.2 Full-screen on a phone, centred panel on desktop; two columns from `md`

## 2. Main page

- [x] 2.1 Gear button in the header opens it; the Pen & feeds panel is removed
- [x] 2.2 `Section` gains a `collapsible` mode; Drawing controls use it and lose `hidden md:block`
- [x] 2.3 Track the controller's `$$` settings in App (snapshot + `settings` event) for the view

## 3. Docs, gate, verification

- [x] 3.1 README: the settings page, and how the machine setup is reached
- [x] 3.2 CHANGELOG entry
- [x] 3.3 `mise run ci` green
- [x] 3.4 Verified in the browser at desktop and phone widths: every moved setting is present and
      editable, an edit persists (reopen + storage), the main page is job-only, and the controls
      that were `hidden md:block` are reachable on a phone
