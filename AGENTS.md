# AGENTS.md

This file (`AGENTS.md`) is the canonical agent configuration. `CLAUDE.md` is a symlink to this file.

Browser-based control app for a GRBL-style pen plotter (a UUNA TEK 3.0 with an A0
bed). A long-running gateway daemon owns the serial port and streams plots
autonomously; the browser is a thin WebSocket client. See [README.md](README.md)
for what it does and how to run it.

## Safety — this code drives a physical machine

These are not style preferences. Getting them wrong wastes a sheet of paper, or
drives the gantry into the frame.

**Never interrupt a running plot.** A plot is a one-shot physical job and there is
**no resume** — a client cannot re-attach to a plot it did not start. While the
machine is moving (the state file's mtime is within ~3 s), do not:

- `systemctl restart plotter-gateway`, run `deploy.sh`, or install an update — restarting the daemon aborts the plot.
- Open a WebSocket to the gateway. When no client holds control, the next client to connect inherits it.
- Suggest pressing **Plot**. `streamProgram` has no in-progress guard, so a second program interleaves into the running queue.

To check progress without touching the plot, read
`/var/lib/penplotter271/.plotter-state.json` over SSH: `wpos` is the live work
position, `z: 0` is pen-down (drawing), `z: 2` is pen-up (travel). That connects
no client and transfers no control. Defer every fix and restart until the plot
finishes.

**No limit switches** (`$22=0`, homing disabled). There is no `$H`. The operator
sets work zero by hand at the paper's top-left corner each session. After any
power cycle the restored origin can be ~1 cm off — and if it is wrong, nothing
stops the machine.

**Machine conventions**, baked into the G-code generator:

- **Inverted Z:** `Z+` moves the pen **down**. Pen-down Z is positive (default `3`), pen-up is `0`.
- **Origin = the paper's top-left corner**, and the SVG→G-code mapping is **identity — no Y flip**. Machine `+Y` runs physically *down* the page. Drawing fills the `+X`/`+Y` quadrant.
- **The daemon opens the serial port exactly once.** Repeated reopen wedges the macOS CH340 driver (errno 22) and only a physical replug recovers it. Never add a reopen path.

## Architecture

The GRBL engine depends only on a `Transport` interface — never on Web Serial, the
DOM, or React — so the same engine runs on the Pi behind a Node serial adapter.
Keep that seam intact.

```
src/grbl/       Portable GRBL protocol engine: streaming, status, alarms (no UI deps)
src/transport/  The seam — Transport interface + the browser's WebSocket client
src/gateway/    Shared WebSocket protocol (commands, snapshot, forwarded events)
src/plot/       Pure pipeline: SVG/PNG → polylines → placement → G-code
src/ui/         React app (the only DOM-aware layer)
gateway/        Raspberry Pi / dev daemon
```

`src/plot/` and `src/grbl/` are the pure, unit-tested core and the only code the
coverage floor measures. New logic belongs there rather than in `src/ui/` wherever
that is a real choice.

## Development commands

Use `mise`. It pins the toolchain — including Node `22.20.0`, the same version
`packaging/assemble.sh` bundles into the `.deb` — and CI runs the same tasks, so
local and CI cannot drift.

```bash
mise install          # install the pinned toolchain
mise run install      # npm ci
mise run ci           # the full gate: format-check, both typechecks, test, build
```

| Task | What it does |
| --- | --- |
| `mise run dev` | Vite dev server for UI work on :5173 |
| `mise run gateway` | Run the plotter gateway daemon on :8717 |
| `mise run build` | Typecheck + build the GUI into `dist/` |
| `mise run test` | Unit tests, enforcing the coverage floor |
| `mise run typecheck` | Type-check the browser sources |
| `mise run typecheck-node` | Type-check the gateway sources |
| `mise run format` / `format-check` | Prettier write / check |
| `mise run audit` | Security-audit the workflows + dependabot config (zizmor) |
| `mise run lint-actions` | Lint the workflows (actionlint) |
| `mise run ci-watch` | Watch the GitHub Actions run for the current branch |

Coverage is measured over `src/plot` and `src/grbl` only, with per-metric floors in
`vite.config.ts`. Raise them as coverage improves; never lower one to make CI pass.

## Spec-driven changes

Non-trivial work goes through OpenSpec: proposals and tasks under
`openspec/changes/`, capability specs under `openspec/specs/`, completed changes in
`openspec/changes/archive/`. Use the `/opsx:*` skills (`propose`, `apply`, `archive`,
`sync`, `explore`). There are currently no active changes.

Hardware-dependent tasks are **not** done when the code typechecks. Several
position-restore bugs passed review and failed on the actual Pi. Leave hardware
verification tasks unchecked until the operator confirms them on the machine.

## Agent skills

### Git remote

GitHub, via the `gh` CLI. The repo is `LAB271/labs-pen-plotter`.

**The maintainer handles all git operations themselves.** Do not commit, push, or
open PRs unless explicitly asked in that instance.

### Issue tracker

GitHub Issues, via `gh`. See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See
[`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Commits

[Conventional Commits](https://conventionalcommits.org/) — see
[CONTRIBUTING.md](CONTRIBUTING.md). Explain *why*, not *what*: this codebase carries
unusually detailed inline rationale and that is deliberate.
