## ADDED Requirements

### Requirement: Travel may be a routed path

A pen-up move MAY be emitted as several moves forming a path, where a straight line would cross a
keep-out zone. The path SHALL begin where the tool is and end at the intended destination, and the
plot-time estimate SHALL account for the extra distance.

#### Scenario: Routed travel is still travel

- **WHEN** travel is routed around a zone
- **THEN** every move of the detour is emitted at the travel feed with the tool up, and the stroke
  that follows begins exactly where it would have

#### Scenario: The estimate follows

- **WHEN** a program contains detours
- **THEN** its estimated duration is longer than the same program without them
