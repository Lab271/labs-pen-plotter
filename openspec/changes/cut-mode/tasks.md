## 1. Cut geometry

- [x] 1.1 `src/plot/cut.ts`: `isClosed` (with a flattening-aware tolerance), `applyOvercut`,
      `applyBladeOffset`, `prepareForCut`
- [x] 1.2 Unit tests: closure incl. the flattened-contour case and a real gap, overcut along the
      path and around a corner, open geometry untouched, no mutation, repeated points, corner
      overshoot, smooth curve untouched, degenerate segments, compensation-then-overcut order

## 2. Tool profile

- [x] 2.1 `src/plot/knife.ts` with normalisation; `AppSettings.knife`; tests
- [x] 2.2 Knife group on the settings page, with the blade-offset warning

## 3. Mode

- [x] 3.1 `mode` in the session, header control, Cut button label
- [x] 3.2 Cut program: knife Z/feeds, `prepareForCut`, `allowReverse: false`
- [x] 3.3 1:1 placement on import; wizard filtered to contour algorithms; pen picker hidden
- [x] 3.4 Canvas draws a cut job in red
- [x] 3.5 `allowReverse` in `generateGcode` + tests

## 4. Docs, gate, verification

- [x] 4.1 README, CHANGELOG
- [x] 4.2 `mise run ci` green
- [x] 4.3 Verified in the browser: a vector file imports at 1:1 at its page position, the canvas
      turns red, the button says Cut, and the program sent to the daemon carries the knife's Z
      (4 mm) and cut feed (800) with a 1 mm overcut past the closure point
- [ ] 4.4 ⚙ HARDWARE: cut a real sticker — confirm the overcut releases the piece, the knife depth
      cuts the vinyl without going through the backing, and a registered cut follows the print
- [ ] 4.5 ⚙ HARDWARE: measure the blade offset on the holder, set it, and confirm corners come out
      square rather than rounded
