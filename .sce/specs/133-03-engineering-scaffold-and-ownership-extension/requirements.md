# Requirements Document

## Introduction

After preview/open semantics stabilize, SCE still needs a canonical scaffold result and a stable ownership extension point. These concerns are valuable, but they should not block the first IDE-facing projection rollout.

## Requirements

### Requirement 1: Provide Canonical Scaffold Contract

**User Story:** As an adapter, I want one canonical scaffold contract, so that project-management baseline content can be initialized without local long-lived rules.

#### Acceptance Criteria

1. SCE SHALL define one canonical scaffold result contract
2. The scaffold result SHALL be idempotent
3. The scaffold result SHALL include canonical `workspacePath`
4. The scaffold result SHALL include created/skipped/failed counts
5. The overwrite policy SHALL be explicit

### Requirement 2: Provide Ownership Relation Extension Point

**User Story:** As an ecosystem integrator, I want a canonical place for app/workspace/user/device ownership relations, so that adapters do not maintain their own parallel ownership registry.

#### Acceptance Criteria

1. SCE SHALL define an ownership relation extension point for app, workspace, user, and device
2. The contract SHALL distinguish local, shared, and unresolved ownership states when known
3. The contract SHALL remain compatible with later SQLite-backed evolution

### Requirement 3: Do Not Block Phase-1 Delivery Rollout

**User Story:** As a release owner, I want scaffold and ownership work to remain incremental, so that phase-1 preview and delivery projection can ship first.

#### Acceptance Criteria

1. This spec SHALL depend on stable preview/open semantics rather than block them
2. The contract SHALL stay UI-neutral and adapter-neutral
3. The design SHALL avoid introducing a frontend-owned ownership truth store
