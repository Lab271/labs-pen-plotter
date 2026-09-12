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

### Requirement: A catalogue of conversions

The wizard SHALL offer at least five conversion algorithms, covering outline tracing, hatching,
crosshatching, stippling and edge detection. Each SHALL expose the parameters it actually uses, and
SHALL preview its own result.

#### Scenario: Choosing among them

- **WHEN** the operator opens the conversion step
- **THEN** at least five algorithms are offered, each with a description of what it suits

#### Scenario: Only relevant parameters

- **WHEN** an algorithm is selected
- **THEN** the controls shown are the ones that algorithm reads, and each of them changes its
  result

### Requirement: Tone is carried by density

Algorithms that render tone SHALL do so by varying how much line or how many dots are placed, not
by varying line weight — a pen has one ink and one width.

#### Scenario: Crosshatching a gradient

- **WHEN** an image with dark and mid tones is crosshatched
- **THEN** the darker area is covered from more directions than the lighter one

#### Scenario: Stippling a gradient

- **WHEN** an image with a smooth gradient is stippled
- **THEN** dots thin out from dark to light across the gradient rather than stopping abruptly at a
  band edge

#### Scenario: Dots are drawable

- **WHEN** an image is stippled
- **THEN** every dot is a stroke the machine can draw, with a non-zero length

### Requirement: Edge detection responds to change, not to darkness

The edge-detection algorithm SHALL find where the image changes sharply, independently of the
image's overall brightness.

#### Scenario: A hard edge in a dim image

- **WHEN** a low-contrast image contains a sharp boundary
- **THEN** that boundary is found

#### Scenario: A smooth gradient

- **WHEN** the image has no sharp boundary
- **THEN** no lines are produced, and the wizard says there is nothing to add

### Requirement: Sources are identified by content

The import SHALL decide what a file is from its contents rather than its name or declared type, and
SHALL accept vector files, PDFs and any raster image the browser can decode.

#### Scenario: A renamed file

- **WHEN** a file's extension does not match its contents
- **THEN** it is imported according to what it actually is

#### Scenario: Something that is not an image at all

- **WHEN** the file cannot be identified
- **THEN** the operator is told, and no empty artwork is added

#### Scenario: An image the browser cannot decode

- **WHEN** the file is HEIC and the browser has no decoder for it
- **THEN** the message says so and what to do about it, rather than reporting a generic failure

### Requirement: PDF pages import as lines or as an image

A PDF page that contains vector paths SHALL be imported as lines at the size the page declares,
keeping its position on the page. A page without paths SHALL be treated as a picture and sent to
the conversion wizard. A file with several pages SHALL ask which page to import.

#### Scenario: A cut file

- **WHEN** the operator imports a vector PDF
- **THEN** its paths are added at the page's real size, positioned as the page positions them, so
  registration against a matching print works as it does for an SVG

#### Scenario: A scan

- **WHEN** the page contains no paths
- **THEN** it is rendered and the conversion wizard opens on it

#### Scenario: Several pages

- **WHEN** the PDF has more than one page
- **THEN** the operator chooses which one, and the imported artwork says which page it came from

#### Scenario: Text in a PDF

- **WHEN** a page contains text
- **THEN** it is not traced — a PDF's text is glyph outlines, which plot as hollow letters — and the
  operator is told how much was skipped
