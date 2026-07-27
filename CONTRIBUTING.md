# Contributing

Thanks for your interest in improving PenPlotter271! This is a small project for a
specific machine (a GRBL-style **UUNA TEK 3.0** with an A0 bed), so please open an
issue to discuss anything non-trivial before you start — it saves everyone time.

## Ground rules

- Be respectful. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- Found a security issue? Do **not** open a public issue — see [SECURITY.md](SECURITY.md).

## Development setup

```bash
npm install        # installs deps and builds the native serialport binding
npm run build      # typecheck + build the GUI
npm test           # run the unit test suite (Vitest)
```

See the [README](README.md) for how to run the gateway daemon and the dev server.

## Making a change

1. Fork and create a branch off `main`.
2. Make your change. Keep it focused — one logical change per PR.
3. Add or update tests for anything in the pure core (`src/grbl`, `src/plot`).
4. Run the full local check set before pushing — the same checks CI runs:

   ```bash
   npm run typecheck        # browser sources
   npm run typecheck:node   # gateway sources
   npm test                 # unit tests
   npm run format           # Prettier (or `npx prettier --check ...` to verify)
   ```

5. Update [`CHANGELOG.md`](CHANGELOG.md) under `## [Unreleased]`.
6. Open a pull request. CI must pass before a PR can be merged.

## Coding conventions

- **TypeScript**, formatted with **Prettier** (config in `.prettierrc.json`).
- Keep the GRBL engine and the plot pipeline **UI-free** — they depend only on the
  `Transport` interface, never on the DOM, React, or Web Serial. This is what lets the
  same engine run in the browser and on the Pi. Please preserve that boundary.
- Match the style of the surrounding code.

## Releases

Releases follow [Semantic Versioning](https://semver.org). Maintainers cut a release by
bumping `version` in `package.json` and pushing a matching `v*` tag; CI builds the arm64
`.deb` and attaches it to the GitHub Release (see `.github/workflows/release.yml`).
