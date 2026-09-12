# image-import-wizard Specification

## Purpose

Turning an image into lines is a decision with visible consequences. The wizard makes it one: adjust
the image, choose how it is converted, see the actual lines, then commit.

## Requirements

### Requirement: One entry for importing an image

The app SHALL offer a single import action for images, rather than one per file format. A vector
file SHALL be imported directly; a raster image SHALL open the wizard.

#### Scenario: Importing a vector file

- **WHEN** the operator imports an SVG
- **THEN** it is added at its real size with its reference layer handled as before, without the
  wizard

#### Scenario: Importing a raster image

- **WHEN** the operator imports a photograph or other raster image
- **THEN** the wizard opens on it

### Requirement: Adjusting the image before conversion

The wizard SHALL let the operator adjust the image before it is converted — at least brightness,
contrast, inversion, rotation in quarter turns, and cropping — and SHALL show the adjusted image.

#### Scenario: Adjustments are visible

- **WHEN** the operator changes an adjustment
- **THEN** the previewed image updates to show it

#### Scenario: Adjustments reach the conversion

- **WHEN** the operator crops or inverts the image and continues
- **THEN** the conversion works on the adjusted image, not the original

#### Scenario: Cropping does not rescale

- **WHEN** the operator crops the image
- **THEN** what remains keeps the real-world size it had, rather than stretching to fill the
  original extent

### Requirement: Choosing and tuning a conversion

The wizard SHALL offer a choice of conversion algorithms, each with its own parameters, and SHALL
preview the lines that choice produces.

#### Scenario: Switching algorithm

- **WHEN** the operator selects a different algorithm
- **THEN** the preview shows what that algorithm produces, with the parameters it uses

#### Scenario: The preview is the output

- **WHEN** the operator confirms
- **THEN** the geometry added to the page is exactly what the preview showed

#### Scenario: Nothing to add

- **WHEN** the current settings produce no lines
- **THEN** confirming is not offered, and the operator is told why

### Requirement: An import can be retuned

The settings that produced an imported object SHALL be stored with it, so the operator can reopen
the wizard and change the conversion instead of re-importing the file. Reopening SHALL replace that
object rather than adding another.

#### Scenario: Reopening an import

- **WHEN** the operator reopens the wizard for an imported object
- **THEN** it starts from the settings that produced it

#### Scenario: Confirming a reopened import

- **WHEN** the operator confirms after changing the settings
- **THEN** that object's geometry is replaced, keeping its placement, pen and stacking position,
  and no second object appears
