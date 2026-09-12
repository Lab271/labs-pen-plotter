## ADDED Requirements

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
