## ADDED Requirements

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
