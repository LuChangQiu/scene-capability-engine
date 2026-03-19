# Requirements Document

## Introduction

SCE already has foundations for multi-workspace management, multi-repo management, project-level multi-agent collaboration, and IDE projection rollout. What is still missing is the engine-owned contract that lets adapters supervise and route work across more than one project at the same time without inventing local portfolio truth.

This program defines that next layer:

- SCE owns project portfolio truth across visible projects
- SCE owns project-level supervision truth for each visible project
- SCE owns target-project resolution and caller-context echo for cross-project requests
- IDE / CLI / other tools remain adapters that organize and present those payloads

## Requirements

### Requirement 1: Establish One Master Program For Multi-Project Support

**User Story:** As an ecosystem steward, I want one master program for multi-project support, so that engine and adapters can converge on one ordered contract line instead of scattered local experiments.

#### Acceptance Criteria

1. SCE SHALL define one master program spec for project portfolio and multi-project supervision
2. The master program SHALL split into explicit child specs for portfolio projection, project supervision, and target-project resolution
3. The master program SHALL state clearly which semantics are engine-owned and which remain adapter-owned
4. The master program SHALL state phase-1 source boundaries explicitly instead of implying a new persistent cross-project registry or event store

### Requirement 2: Keep Multi-Project Truth Engine-Owned

**User Story:** As an adapter author, I want project portfolio and supervision truth to come from the engine, so that IDE and CLI do not persist or synthesize long-lived cross-project state.

#### Acceptance Criteria

1. SCE SHALL own the canonical project portfolio projection
2. SCE SHALL own the canonical project-level supervision projection
3. SCE SHALL own the canonical target-project resolution result and caller-context echo
4. Adapters SHALL NOT be required to infer project identity, readiness, or routing from local caches
5. Phase-1 SHALL reuse existing engine truth sources before introducing any new long-lived portfolio persistence

### Requirement 3: Reuse Existing Workspace And Collaboration Foundations

**User Story:** As an engine maintainer, I want this program to reuse established workspace and collaboration semantics, so that multi-project support extends the current model instead of forking it.

#### Acceptance Criteria

1. The program SHALL build on `16-00-multi-workspace-management` for workspace visibility and registration semantics
2. The program SHALL remain compatible with `24-00-multi-repo-management` for project repository topology
3. The program SHALL remain compatible with `132-*` for project-internal sessions, occupancy, handoff, and supervision semantics
4. The program SHALL remain compatible with `134-*` and later IDE projection work without leaking layout contracts into engine payloads
5. Phase-1 SHALL reuse workspace registry identity and project-local session governance artifacts rather than inventing parallel truth

### Requirement 4: Keep Child Specs Implementation-Sized

**User Story:** As a planning steward, I want each child spec to own one bounded contract surface, so that the program can move through direct implementation work instead of broad redrafting.

#### Acceptance Criteria

1. Each child spec SHALL own one primary contract surface
2. Portfolio registry concerns SHALL NOT be mixed with project-level supervision event details in one child spec
3. Target-project resolution SHALL remain separate from project portfolio read-model definition
4. The master program SHALL publish an ordered implementation sequence

### Requirement 5: Preserve Scene/Spec/Task/Event Traceability Across Projects

**User Story:** As a supervising user, I want cross-project supervision to stay traceable back to scene/spec/task/event semantics, so that multi-project support does not collapse into flat project badges.

#### Acceptance Criteria

1. Project-level supervision SHALL preserve traceable links back to scene/spec/task identities when known
2. Project portfolio summaries SHALL not replace project-internal scene/spec/task/event semantics
3. Cross-project routing and supervision payloads SHALL stay compatible with scene/spec/task/event-driven tools
