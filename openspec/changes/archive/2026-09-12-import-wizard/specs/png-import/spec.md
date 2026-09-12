## ADDED Requirements

### Requirement: The conversion is chosen, not assumed

Raster import SHALL let the operator choose how the image becomes lines, rather than applying one
fixed conversion. Where an object was imported through that choice, the app SHALL NOT also offer a
second, independent set of conversion controls for it.

#### Scenario: Choosing the conversion

- **WHEN** the operator imports a raster image
- **THEN** they choose the algorithm and its parameters, with a preview, before it is added

#### Scenario: One place to retune

- **WHEN** the operator selects an object imported through the wizard
- **THEN** it offers reopening the wizard, and not a separate set of controls that would discard
  the wizard's result
