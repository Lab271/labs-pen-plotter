# multi-pen-plotting Specification

## Purpose

A drawing that uses more than one pen plots as a single job: the machine draws everything for one
pen, stops somewhere safe for the operator to swap, and carries on without losing or repeating a
stroke.

## Requirements

### Requirement: Strokes are grouped and sequenced by pen

A plot SHALL draw all strokes assigned to one pen before any stroke assigned to the next, and the
order of pens SHALL be predictable and under the operator's control.

#### Scenario: One pass per pen

- **WHEN** the page holds artwork assigned to three different pens
- **THEN** the plot draws each pen's strokes as one contiguous pass, in the order the pen library
  defines

#### Scenario: Reordering the pens reorders the plot

- **WHEN** the operator changes the order of the pen library
- **THEN** the next plot follows the new order

#### Scenario: A pen that draws nothing is skipped

- **WHEN** a pen in the library has no artwork assigned to it
- **THEN** the plot does not stop for it

### Requirement: The plot pauses for each pen change

Between pen groups the machine SHALL stop and wait, in a position where a pen can be swapped
safely, and the app SHALL name the pen to load. Plotting SHALL NOT continue until the operator
confirms.

#### Scenario: Prompted to load the next pen

- **WHEN** the last stroke of a pen group has been drawn
- **THEN** the machine parks at the work origin with the pen up and the operator is shown which pen
  to load

#### Scenario: Nothing is drawn while waiting

- **WHEN** the job is waiting for a pen change
- **THEN** no further line of the program is sent to the machine, whatever else the operator does
  short of confirming or stopping

#### Scenario: The pen is swapped only when the machine has stopped

- **WHEN** the final moves of a pen group are still executing
- **THEN** the prompt appears only once the machine reports it is idle, not when the last line was
  merely accepted

### Requirement: Continuing resumes exactly where it stopped

Confirming a pen change SHALL continue the job from the first stroke of the next pen, with no
stroke lost or drawn twice, and the plot's progress SHALL account for the whole job.

#### Scenario: No lost or duplicated strokes

- **WHEN** the operator confirms the pen change
- **THEN** the plot continues with the next pen's first stroke and completes the job

#### Scenario: Confirming twice does not skip a pen

- **WHEN** the pen change is confirmed twice (for example from two clients)
- **THEN** only one group is released

### Requirement: A held job belongs to the machine, not to a tab

A job waiting for a pen change SHALL be part of the daemon's state: a client that reloads or
attaches while it waits SHALL see the prompt and be able to answer it, and the job SHALL still
count as running.

#### Scenario: Reload while waiting

- **WHEN** the operator reloads the app while the job waits for a pen
- **THEN** the prompt is shown again and confirming it continues the job

#### Scenario: Not idle, mid-job

- **WHEN** a job is held at a pen change
- **THEN** a second plot is refused, and an in-app update is refused, exactly as during a running
  plot

### Requirement: A single-pen drawing is unaffected

A drawing that uses one pen SHALL produce the same program, and the same behaviour, as before
multi-pen plotting existed.

#### Scenario: One pen, no pauses

- **WHEN** every artwork on the page uses the same pen
- **THEN** the plot runs start to finish with no pen-change prompt
