## 1. Algorithms

- [x] 1.1 Crosshatch: passes over a half turn, threshold raised per pass, clamped pass count
- [x] 1.2 Stippling: averaged dot grid, Floyd–Steinberg diffusion, dots as short segments
- [x] 1.3 Edge detect: Sobel magnitude, normalised, traced by the existing contour tracer
- [x] 1.4 `passes` parameter and its control in the wizard

## 2. Tests

- [x] 2.1 Crosshatch: several directions, spread over a half turn (not repeated), darker tone gets
      more ink, absurd pass counts clamped
- [x] 2.2 Stippling: no zero-length dots, density follows tone, tone spread rather than banded,
      blank image yields nothing
- [x] 2.3 Edges: border found and not the interior, flat image yields nothing, result independent
      of overall brightness

## 3. Docs, gate, verification

- [x] 3.1 README, CHANGELOG
- [x] 3.2 `mise run ci` green
- [x] 3.3 Verified in the browser on a tonal test image: crosshatch builds density toward the dark
      centre, stippling diffuses dots across the gradient, and edge detect finds the two hard edges
      and ignores the soft gradient
