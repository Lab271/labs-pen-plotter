## 1. Adjustments

- [x] 1.1 `src/plot/adjust.ts`: crop (fractional), quarter turns, brightness/contrast/invert
- [x] 1.2 Unit tests: identity default, tone order, clamping, crop fractions, degenerate crop,
      rotation in all four positions incl. dimension swap and normalisation, mm-per-cell preserved

## 2. Algorithms

- [x] 2.1 `src/plot/algorithms.ts`: catalogue with per-algorithm parameter lists; `outline`
      (iso-contours) and `hatch` (tonal line density)
- [x] 2.2 Unit tests: catalogue integrity, outline in mm and origin-normalised, blank image,
      levels, hatch fills dark areas, ignores light ones, density follows tone, spacing respected,
      short runs dropped, every angle covered, degenerate spacing survived

## 3. Wizard

- [x] 3.1 `src/ui/ImportWizard.tsx`: adjust step and convert step, both previewing the real thing
- [x] 3.2 Debounced conversion, stroke count and size readout, disabled confirm when empty

## 4. App

- [x] 4.1 One "+ Image" entry; SVG bypasses the wizard
- [x] 4.2 Confirm adds an object; reopening replaces one in place
- [x] 4.3 `importSpec` persisted; wizard imports show the reopen button instead of the old sliders

## 5. Docs, gate, verification

- [x] 5.1 README, CHANGELOG
- [x] 5.2 `mise run ci` green
- [x] 5.3 Verified in the browser: a generated test image imports through both algorithms with the
      preview matching the parameters, crop and contrast carry into the conversion, confirming adds
      one object, and reopening restores the settings and replaces the object rather than adding a
      second
