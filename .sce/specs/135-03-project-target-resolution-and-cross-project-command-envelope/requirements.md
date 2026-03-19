# Requirements Document

## Introduction

SCE needs one canonical target-project resolution contract so assistant-style and orchestration-style requests can bind to the correct project without adapters silently switching project context or guessing from local UI state.

## Requirements

### Requirement 1: Publish One Target-Project Resolution Result

**User Story:** As an adapter, I want one canonical project target resolution result, so that I can submit cross-project requests without guessing which project the engine selected.

#### Acceptance Criteria

1. SCE SHALL publish one canonical `ProjectTargetResolution` result
2. The result SHALL distinguish at least `current-project`, `resolved-other-project`, `ambiguous`, and `unresolved`
3. The result SHALL identify the resolved `projectId` when one project is matched
4. The result SHALL remain layout-free and JSON-first

### Requirement 2: Echo Caller Context Explicitly

**User Story:** As an adapter author, I want the engine to echo the caller context it used, so that cross-project behavior is auditable.

#### Acceptance Criteria

1. The resolution result SHALL echo caller context fields that influenced routing
2. Caller context SHALL support at least `currentProjectId`, `workspaceId`, `deviceId`, and `toolInstanceId` when known
3. Adapters SHALL not need to infer whether the engine honored the submitted current project
4. Caller context semantics SHALL reuse `16-00` workspace selection rules and `135-01` project identity rules where applicable

### Requirement 3: Return Alternatives And Confidence For Non-Exact Matches

**User Story:** As a supervising user, I want ambiguous routing to be visible, so that the wrong project is not selected silently.

#### Acceptance Criteria

1. Ambiguous results SHALL expose alternative project candidates
2. The resolution result SHALL expose confidence or an equivalent explicit match-strength field
3. Unresolved results SHALL provide a machine-readable reason when possible

### Requirement 4: Reuse Resolution In Command Receipts

**User Story:** As an adapter, I want downstream command receipts to echo the actual project target, so that project-bound assistant and orchestration work remains auditable after submission.

#### Acceptance Criteria

1. Command-side receipts for cross-project-capable flows SHALL expose the actual `projectId` used
2. The receipt SHALL distinguish caller-submitted current project from engine-resolved target project when they differ
3. The command contract SHALL NOT mutate the caller's active workspace selection implicitly
4. Phase-1 MAY define receipt fields before any new cross-project mutating command is introduced

### Requirement 5: Reuse One Resolution Command

**User Story:** As an adapter author, I want one resolution command, so that IDE and CLI can preflight cross-project routing against the same contract surface.

#### Acceptance Criteria

1. SCE SHALL expose `sce project target resolve --json`
2. The command SHALL accept request text or equivalent routing hints together with caller context
3. The command SHALL accept explicit caller context inputs for `currentProjectId` and workspace selection
4. The command MAY accept opaque caller identity inputs such as `deviceId` and `toolInstanceId`
5. The command SHALL return the canonical `ProjectTargetResolution` result
