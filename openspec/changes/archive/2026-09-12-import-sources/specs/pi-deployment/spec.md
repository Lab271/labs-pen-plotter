## ADDED Requirements

### Requirement: The served GUI's assets have correct content types

The daemon SHALL serve every asset type the built GUI produces with a content type browsers accept,
including JavaScript module files (`.mjs`), WebAssembly and source maps.

#### Scenario: A lazily-loaded module chunk

- **WHEN** the GUI loads a feature whose code is split into a `.mjs` chunk
- **THEN** the daemon serves it as JavaScript and the browser executes it, rather than refusing it
  for its content type
