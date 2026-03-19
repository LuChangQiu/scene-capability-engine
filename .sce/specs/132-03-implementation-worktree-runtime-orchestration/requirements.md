# Requirements Document

## Introduction

Implementation agents are higher risk than investigation or documentation agents. If multiple implementation agents touch the same project, SCE needs a canonical isolated runtime model rather than letting them all write into one shared workspace.

## Requirements

### Requirement 1: Implementation Runtime Binding

**User Story:** As an adapter, I want one implementation runtime binding payload, so that I can show where an implementation agent is actually running.

#### Acceptance Criteria

1. SCE SHALL provide a canonical implementation runtime binding for implementation sessions
2. The binding SHALL include at least `workspacePath`, `worktreePath` when present, `branch`, `baseCommit`, `projectId`, `sessionId`, and bound scene/spec/task
3. The binding SHALL indicate whether the session is running in shared workspace or isolated workspace

### Requirement 2: Worktree-Oriented Runtime Policy

**User Story:** As a project supervisor, I want isolated implementation runtimes, so that concurrent code modification does not become ungoverned shared-directory editing.

#### Acceptance Criteria

1. SCE SHALL support policy semantics for isolated implementation runtime
2. The policy SHALL distinguish at least `shared-workspace`, `isolated-worktree`, and `sandboxed-runtime`
3. When implementation isolation is unavailable, SCE SHALL expose that as a canonical risk state

### Requirement 3: Merge And Close-Loop Supervision Contract

**User Story:** As an adapter, I want merge and close-loop state from the engine, so that I can supervise implementation progress without inventing merge semantics.

#### Acceptance Criteria

1. SCE SHALL publish merge supervision state for implementation runtimes
2. Merge state SHALL distinguish at least `running`, `waiting-review`, `ready-to-merge`, `conflict`, `merged`
3. SCE SHALL publish close-loop stage semantics for implementation work
4. The contract SHALL remain UI-neutral
