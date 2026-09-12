## MODIFIED Requirements

### Requirement: Multiple artworks on the page

The page SHALL hold several artworks at once, each with its own placement, and the operator SHALL
be able to select any number of them. The panels that act on a single object (registration, the
per-artwork drawing controls) SHALL act on the most recently selected one.

#### Scenario: Several artworks, independently placed

- **WHEN** more than one artwork is imported
- **THEN** each can be placed, scaled and rotated on the page independently, and all of them are
  plotted

#### Scenario: A selection of several

- **WHEN** the operator selects several artworks
- **THEN** the editing operations act on all of them, while the single-object panels follow the
  last one selected
