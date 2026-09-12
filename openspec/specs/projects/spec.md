# projects Specification

## Purpose

A job can be put aside and picked up again: saved as a file on the operator's machine, or stored on
the plotter so the machine holds a library of plots that any client can open.

## Requirements

### Requirement: A project is the whole job

A saved project SHALL contain everything needed to reproduce the plot — the objects and their
placements, which pen draws each of them, the paper, the job's mode, and the magnets — together
with the pens it refers to.

#### Scenario: Reopening a project

- **WHEN** the operator opens a project they saved
- **THEN** the page is restored: the same objects, in the same places, with the same pens, paper
  and mode

#### Scenario: A project opened where its pens are not defined

- **WHEN** a project is opened on a machine whose pen library does not contain its pens
- **THEN** those pens are added to the library, so the drawing renders as it was saved, and the
  pens already defined there are kept

### Requirement: Projects can be kept on either machine

The operator SHALL be able to save a project as a file on their own device and open it again, and
to store a project on the plotter, list what is stored, open one, and delete one.

#### Scenario: Saving to the operator's machine

- **WHEN** the operator saves the job to their device
- **THEN** a project file is downloaded, and opening that file restores the job

#### Scenario: Saving to the plotter

- **WHEN** the operator saves the job to the plotter
- **THEN** it is stored there, appears in the list, and is still there after the daemon restarts

#### Scenario: Every client sees the library

- **WHEN** one client saves or deletes a project
- **THEN** the other clients' lists reflect it

#### Scenario: Opening does not disturb other operators

- **WHEN** one client opens a stored project
- **THEN** only that client's page changes

### Requirement: A project file is versioned and validated

The file SHALL identify itself and carry a format version. Opening something that is not a project,
or a project from a newer version, SHALL be refused with a message that says which.

#### Scenario: The wrong file

- **WHEN** the operator opens a JSON file that is not a project
- **THEN** they are told it is not a project file, and the page is unchanged

#### Scenario: A file from a newer version

- **WHEN** the file's format version is newer than this app understands
- **THEN** it is refused, rather than opened with whatever that version added silently dropped

### Requirement: Project names cannot escape the projects directory

A project name arriving from a client SHALL NOT be usable to read or write outside the directory
projects are stored in. A name with nothing usable left in it SHALL be refused.

#### Scenario: A name that tries to traverse

- **WHEN** a project is saved with a name containing path separators or parent references
- **THEN** the file is written inside the projects directory under a sanitised name, and nothing
  outside it is touched

#### Scenario: An empty name

- **WHEN** a project is saved with a blank name, or one made entirely of characters that are
  stripped
- **THEN** the save is refused and the operator is told
