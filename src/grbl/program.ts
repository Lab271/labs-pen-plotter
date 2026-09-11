/**
 * Program text handling for the streamer: comments, and the pen-change marker
 * that turns one program into a multi-pen job.
 *
 * The marker is a G-code **comment**, so a machine fed the program directly
 * simply ignores it and draws everything in one pass. The streaming controller
 * intercepts it instead and holds there. Keeping the pause in software rather
 * than using `M0` means it needs nothing from the firmware, and the decision to
 * carry on belongs to the daemon (where control and state already live) rather
 * than to a button on the machine.
 *
 * This lives in `src/grbl/` because it is a streaming concern: the generator in
 * `src/plot/` emits the marker, but what it *means* is "stop feeding lines here".
 */
export const PEN_CHANGE_PREFIX = ';PENCHANGE ';

/**
 * What counts as the marker when reading a program back. Deliberately laxer
 * than what is emitted: a hand-edited or round-tripped file may lose the label
 * or change case, and a missed marker means the machine runs the next pen's
 * strokes with the pen still in the holder — worse than an unlabelled prompt.
 */
const PEN_CHANGE_RE = /^;\s*PENCHANGE\b\s*(.*)$/i;

/** Strip G-code comments — `(inline)` and `;trailing` — and surrounding space. */
export function stripComment(line: string): string {
  return line
    .replace(/\(.*?\)/g, '')
    .replace(/;.*$/, '')
    .trim();
}

export interface PenSegments {
  /** Machine-ready lines, split at the pen changes. Always at least one entry. */
  segments: string[][];
  /**
   * Pen label for each boundary: `labels[i]` is what to load after segment `i`
   * finishes, before segment `i + 1` starts.
   */
  labels: string[];
  /** Total machine-ready lines across all segments (what progress counts). */
  total: number;
}

/**
 * Split a program at its pen-change markers, dropping comments and blank lines
 * from the rest. A program with no markers comes back as a single segment, so
 * the single-pen path is the same code path it always was.
 */
export function splitPenSegments(rawLines: string[]): PenSegments {
  const segments: string[][] = [[]];
  const labels: string[] = [];
  for (const raw of rawLines) {
    const marker = PEN_CHANGE_RE.exec(raw.trim());
    if (marker) {
      labels.push(marker[1].trim());
      segments.push([]);
      continue;
    }
    const line = stripComment(raw);
    if (line.length > 0) segments[segments.length - 1].push(line);
  }
  return { segments, labels, total: segments.reduce((n, seg) => n + seg.length, 0) };
}
