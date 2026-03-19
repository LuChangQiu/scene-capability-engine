# Requirements Document

## Introduction

This spec defines only the ownership relation extension for engineering project projection. It does not create a parallel ownership registry and it does not block phase-1.

## Requirements

### Requirement 1: Publish One Ownership Relation Shape

**User Story:** As an adapter, I want one ownership relation shape, so that app, workspace, device, and share state can be projected consistently.

#### Acceptance Criteria

1. SCE SHALL define one `EngineeringOwnershipRelation` shape
2. The shape SHALL support app, workspace, user, and device linkage when known
3. The shape SHALL distinguish `local`, `shared`, and `unresolved`

### Requirement 2: Avoid Parallel Ownership Truth

**User Story:** As an adapter, I want ownership semantics to stay engine-owned, so that local tools do not create a second ownership registry.

#### Acceptance Criteria

1. This spec SHALL not require an adapter-owned ownership store
2. Unknown ownership links SHALL remain explicit instead of guessed
3. The shape SHALL stay compatible with later state-tier evolution

### Requirement 3: Stay Deferred From Phase-1

**User Story:** As a release steward, I want ownership extension deferred from phase-1, so that the first IDE release is not blocked by later relation modeling.

#### Acceptance Criteria

1. This spec SHALL remain phase-2 work
2. This spec SHALL depend on stable engineering identity from the earlier preview/open specs
3. This spec SHALL not widen delivery projection scope
