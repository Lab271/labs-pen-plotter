## ADDED Requirements

### Requirement: Stored-project channel

The daemon SHALL accept commands to save, load and delete a stored project. The attach snapshot
SHALL carry the list of stored projects, and the daemon SHALL broadcast the list whenever it
changes. A loaded project SHALL be sent only to the client that asked for it.

#### Scenario: Listing on attach

- **WHEN** a client attaches
- **THEN** the snapshot carries the names of the stored projects and when each was saved

#### Scenario: The list stays current

- **WHEN** any client saves or deletes a project
- **THEN** every attached client is sent the new list

#### Scenario: A load is addressed

- **WHEN** a client asks for a project
- **THEN** only that client receives it
