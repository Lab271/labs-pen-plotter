## ADDED Requirements

### Requirement: The pen library is app settings

The app settings record SHALL carry the pen library, so the pens that exist are shared by every
client of one plotter and survive a browser-data clear. It SHALL be normalised with the rest of the
record, and SHALL fall back to a built-in set when what is stored holds no usable pen.

#### Scenario: Pens follow the machine

- **WHEN** the operator defines a pen on one device
- **THEN** every other client of that plotter offers the same pen

#### Scenario: An unusable stored library

- **WHEN** the stored pen library is missing, is not a list, or contains no usable entry
- **THEN** the built-in pens are used instead of an empty library
