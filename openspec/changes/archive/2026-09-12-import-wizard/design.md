## Context

`raster.ts` already decoded an image once into a reusable grayscale field and re-traced it live as
the controls changed — the expensive half of a wizard was in place. What was missing was the step
where the operator sees what the conversion will produce *before* committing to it, and any choice
of conversion at all.

## Decisions

- **The preview is the algorithm.** Both previews run the same pure functions the plot uses: the
  adjust step draws the adjusted field itself, and the convert step draws the polylines that will
  be added. A preview rendered any other way is a picture of something the machine is not going to
  draw, and tuning it would be tuning the wrong thing.
- **Adjustments work on the field, not on a canvas.** Filtering pixels in a canvas and re-reading
  them would introduce a second code path (and canvas colour management) between what is shown and
  what is traced.
- **Crop is fractional, and preserves mm per cell.** Fractions survive a change of working
  resolution; keeping `mmPerGrid` means cropping selects fewer cells rather than stretching the
  remainder, so a cropped import keeps the original's real-world scale.
- **SVG skips the wizard.** A vector file is already the thing the wizard exists to produce, and
  its registration/reference-layer handling is not something to re-decide per import.
- **The wizard is two steps, not five.** The issue lists upload → adjust → choose → tune → confirm;
  choosing and tuning are one screen because they are one decision, and the choice is only
  meaningful with the preview of its parameters in front of you.
- **Convert is debounced; adjust is not.** Adjusting a field is a per-pixel pass over a downsampled
  image (fast); converting traces or hatches it (not). Dragging a slider must not queue a trace per
  pixel moved.
- **The object keeps its wizard settings, not its pixels.** Re-opening reuses the decoded field
  from the session's memory when it is there; the settings themselves persist, so a reopened
  import starts where the operator left it. The decoded image is not persisted: it is large, and
  the session already carries the traced result.
- **Reopening replaces, it does not add.** The operator is retuning a drawing that is already
  placed — its placement, pen and stacking position stay.
- **Wizard imports hide the old inline sliders.** Two controls for one conversion, where moving one
  silently discards the other's result, is worse than either alone.

## Risks / Trade-offs

- Hatching is a line-density algorithm, not an error-diffusion one: it reads tone in bands rather
  than continuously. That is what a pen with one ink and one width can do, and the band count is
  the `levels` control.
- Reopening needs the decoded image, which lives in memory for the session. After a reload the
  button is not offered; the geometry and the settings are still there, and re-importing the file
  restores the ability to retune.
