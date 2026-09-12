## Why

Drawings were transient. The session persists — on the Pi, shared with every client — but there is
exactly one of it: importing the next job overwrites the last one, and there is no way to put a
plot aside and come back to it. A headless machine in a workshop should hold a library of plots,
not the most recent one.

## What Changes

- **A versioned project file** (`src/plot/project.ts`): the whole job — objects, placements, pens
  per object, paper, mode, magnets — plus the pen library it refers to, because artwork names pens
  by id and a project opened elsewhere would otherwise come out in the wrong colours.
- **Save to this device**: a file the operator keeps, and can open again.
- **Save to the plotter**: the daemon stores projects in a directory of their own, lists them to
  every client, serves one to the client that asks, and deletes on request.
- **Names are sanitised, twice.** The name arrives over the WebSocket and becomes a path on the Pi;
  it is reduced to something safe (shared pure function, unit-tested) and the resolved path is then
  checked to be inside the projects directory anyway.

## Capabilities

### Added Capabilities
- `projects`: a job can be saved and reopened, on the operator's machine or on the plotter.

### Modified Capabilities
- `gateway-protocol`: commands to save, load and delete stored projects, with the listing in the
  snapshot and an event when it changes.

## Impact

- **Code:** new `src/plot/project.ts` (+ tests); `src/gateway/protocol.ts`, `gateway/server.ts`,
  `src/transport/GatewayClient.ts`, `src/ui/App.tsx`.
- **Packaging:** `PLOTTER_PROJECTS` (default `gateway/projects/`).
- **Behaviour:** the live session is unchanged — projects are a separate thing you *keep*, not a
  replacement for the session that is always there.
