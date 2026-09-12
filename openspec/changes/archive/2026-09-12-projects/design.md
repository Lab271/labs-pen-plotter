## Context

The session already round-trips through the daemon as an opaque blob, which is most of the
machinery a project needs. What it lacks is identity (a name), plurality (a library), and the pens
the artwork refers to.

## Decisions

- **A project carries its pens.** Artwork names pens by id; a project opened on another machine —
  or after the library has been edited — would otherwise render in whatever pens happen to exist.
  Opening merges the project's pens into the library rather than replacing it, so nothing the
  operator has defined disappears.
- **Versioned from the first release.** These files outlive the app that wrote them, and "we will
  add a version when we need one" means the first file that needs it cannot be read. A file from a
  *newer* version is refused with a message rather than being opened with fields silently dropped.
- **`readProject` returns a reason instead of throwing.** Every caller wants to show it: "that is
  not a project file" is the useful answer to opening the wrong JSON.
- **One session builder.** The persist effect and the project saver use the same function. Two
  copies of that field list would drift, and the field someone forgets to add to the second one is
  a field that quietly vanishes from every saved project.
- **Name sanitisation is a security boundary, and is checked twice.** The name arrives over a
  socket with no authentication and becomes a filesystem path on the Pi. It is reduced to a safe
  name by a pure, unit-tested function shared with the client, and the daemon then verifies the
  *resolved* path is inside the projects directory before writing. Either check alone would do;
  having both means a bug in one is not a way out of the directory.
- **A load goes only to the client that asked.** Opening a project replaces what is on screen —
  not something to do to another operator's session because someone else clicked a name.
- **Saves are atomic.** A project half-written by a power cut would be unopenable, and the operator
  would not find out until they came to plot it.
- **The listing is cached and broadcast.** A snapshot has to be ready the instant a client attaches,
  and listing a directory is asynchronous.

## Risks / Trade-offs

- A project stores the artwork's *geometry*, not the file it was imported from, so reopening gives
  the drawing back but not the ability to retune an import's conversion. That matches the session,
  and keeping megabytes of source per project on a Pi's SD card is not obviously better.
- There is no rename, and saving under an existing name overwrites it. Both are easy to add once
  it is clear how operators actually organise these.
