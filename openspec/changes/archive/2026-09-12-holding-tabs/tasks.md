## 1. Transform

- [x] 1.1 `src/plot/tabs.ts`: `applyTabs`, arc-length distribution, corner avoidance, count capping
- [x] 1.2 Unit tests: off by default, span count, exact width removed, even spacing, open path
      untouched, short contour untouched, absurd count capped, no degenerate fragments across many
      count/width combinations, bridges off corners, bridges clear of the overcut

## 2. Integration

- [x] 2.1 `CutOptions` extends `TabOptions`; `prepareForCut` applies compensate → overcut → tabs
      with `closed` decided up front
- [x] 2.2 Tests: order preserved, unchanged output with tabs off, open geometry still one stroke

## 3. UI

- [x] 3.1 Tab count, width and minimum contour in the knife profile on the settings page
- [x] 3.2 Canvas draws the prepared cut path (overcut + gaps) over faded artwork

## 4. Docs, gate, verification

- [x] 4.1 README, CHANGELOG
- [x] 4.2 `mise run ci` green
- [x] 4.3 Verified in the browser: 4 tabs of 2 mm on a rectangle produce 5 cut spans in the emitted
      G-code, with gaps measuring exactly 2.00 mm, evenly spread, each ≥130 mm from a corner
- [ ] 4.4 ⚙ HARDWARE: cut a real sticker with tabs on — confirm the piece stays attached during the
      job and snaps out cleanly by hand
