/**
 * Project files: a drawing saved so it can be opened again.
 *
 * A project is the *whole* job — the objects, where they sit, which pen draws
 * each of them, the paper, the mode, the magnets — plus the pen library it
 * refers to, because a drawing whose pens have been renamed on another machine
 * would otherwise open in the wrong colours.
 *
 * Versioned from the start: these files outlive the app that wrote them, and
 * "we will add a version when we need one" means the first file that needs it
 * cannot be read.
 */
import type { Pen } from './pen';

/** Marks a file as ours. Checked on load, so a stray JSON is refused clearly. */
export const PROJECT_FORMAT = 'penplotter271.project';
export const PROJECT_VERSION = 1;

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: number;
  /** ISO timestamp, for the listing. */
  savedAt: string;
  name: string;
  /** The editable session: artwork, placements, paper, mode, magnets. */
  session: unknown;
  /** The pens the session's artwork refers to. */
  pens: Pen[];
}

export function makeProject(name: string, session: unknown, pens: readonly Pen[]): ProjectFile {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    name: name.trim() || 'Untitled',
    session,
    pens: pens.map((p) => ({ ...p })),
  };
}

export type ReadResult = { ok: true; project: ProjectFile } | { ok: false; error: string };

/**
 * Validate anything claiming to be a project file. Returns a message rather
 * than throwing, because every caller here wants to *show* the reason: "that is
 * not a project file" is the useful answer to opening the wrong JSON.
 */
export function readProject(raw: unknown): ReadResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'That file is not a PenPlotter271 project.' };
  }
  const r = raw as Record<string, unknown>;
  if (r.format !== PROJECT_FORMAT) {
    return { ok: false, error: 'That file is not a PenPlotter271 project.' };
  }
  if (typeof r.version !== 'number' || r.version > PROJECT_VERSION) {
    return {
      ok: false,
      error: `That project was saved by a newer version of the app (format ${String(r.version)}).`,
    };
  }
  if (typeof r.session !== 'object' || r.session === null) {
    return { ok: false, error: 'That project file has no drawing in it.' };
  }
  return {
    ok: true,
    project: {
      format: PROJECT_FORMAT,
      version: r.version,
      savedAt: typeof r.savedAt === 'string' ? r.savedAt : '',
      name: typeof r.name === 'string' && r.name.trim() ? r.name : 'Untitled',
      session: r.session,
      pens: Array.isArray(r.pens) ? (r.pens as Pen[]) : [],
    },
  };
}

/** Longest project name accepted, so a name cannot become an unwieldy filename. */
const MAX_NAME = 64;

/**
 * Reduce a project name to something safe to use as a filename on the daemon.
 *
 * This is a security boundary, not a tidiness rule: the name arrives over the
 * WebSocket and becomes a path on the Pi, so anything that could climb out of
 * the projects directory — separators, `..`, NUL, leading dots — has to be gone
 * before it gets near the filesystem. Returns an empty string when nothing
 * usable is left, and callers refuse the save.
 */
export function sanitizeProjectName(name: string): string {
  return (
    name
      .normalize('NFC')
      // Control characters are not names, and a NUL truncates a path in some
      // syscalls — so they go first, before anything looks at the shape.
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[/\\]/g, ' ')
      // Characters that filesystems (or Windows, over a share) refuse outright.
      .replace(/[:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      // Drop any word that is only dots: with the separators already gone, a
      // leftover ".." is harmless, but it is also not part of anyone's name.
      .split(' ')
      .filter((word) => !/^\.+$/.test(word))
      .join(' ')
      // A leading dot hides the file and invites surprises; a trailing one is
      // meaningless on some filesystems.
      .replace(/^\.+/, '')
      .replace(/\.+$/, '')
      .slice(0, MAX_NAME)
      .trim()
  );
}

/** The filename a project is stored under. */
export function projectFileName(name: string): string {
  return `${sanitizeProjectName(name)}.plot.json`;
}

/** The filename offered when downloading to the operator's own machine. */
export function downloadFileName(name: string): string {
  const safe = sanitizeProjectName(name) || 'project';
  return `${safe}.plot.json`;
}
