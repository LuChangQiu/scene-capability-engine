# Requirements Document

## Introduction

SCE already has multi-agent and orchestration foundations, but the current semantics are still not enough for one project on one device to be opened by multiple tool instances where agents split into investigation, documentation, and implementation roles and then collaborate through shared scene/spec/task/event flows.

This spec defines the next engine-owned contract:

- SCE owns project-level multi-agent truth
- IDE / CLI / other tools are only adapters
- collaboration must be expressed in scene/spec/task/event semantics rather than tool-local chat state

## Requirements

### Requirement 1: Establish One Master Contract

**User Story:** As an ecosystem maintainer, I want one master contract for project-level multi-agent collaboration, so that IDE and CLI can integrate against stable engine semantics rather than local heuristics.

#### Acceptance Criteria

1. SCE SHALL define one master contract for project-level multi-agent collaboration
2. The master contract SHALL split into explicit sub-specs for session/lease, scheduler/handoff, implementation runtime, and event projection
3. The master contract SHALL state clearly which semantics are engine-owned and which are adapter-owned

### Requirement 2: Keep Scene/Spec/Task/Event As The Core Semantic Chain

**User Story:** As an adapter implementer, I want collaboration semantics to stay aligned with `scene-spec-task-event`, so that tools do not regress into flat request queues or ad hoc chat models.

#### Acceptance Criteria

1. SCE SHALL express collaboration around scene/spec/task/event semantics
2. SCE SHALL NOT make file-path-only locking the primary outward-facing collaboration contract
3. SCE SHALL allow adapters to present occupancy and collaboration using scene/spec/task identities first

### Requirement 3: Separate Agent Modes

**User Story:** As a supervising user, I want the engine to distinguish investigation, documentation, and implementation agents, so that risk and coordination policies can differ by mode.

#### Acceptance Criteria

1. SCE SHALL model at least three agent modes: `observe`, `document`, `implement`
2. The mode SHALL influence lease policy, workspace policy, and scheduler behavior
3. Adapters SHALL be able to consume mode semantics without inferring them from prompts
