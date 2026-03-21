# Requirements Document

## Introduction

`136-00` established canonical root-based candidate inspection and onboarding entry. During IDE integration, one consistency gap remains:

- `sce project onboarding import --root <path> --json` can return `success: true`
- and although the current phase-1 engine path already registers the workspace into the canonical portfolio, the onboarding result does not state publication status explicitly

That leaves adapters guessing whether import success already implies canonical portfolio visibility, which pressures them to invent temporary shadow-state reconciliation just to make newly imported projects visible in project switchers and workspace trees.

SCE should make onboarding success converge to portfolio visibility through a canonical contract, so adapters can remain thin and portfolio-driven.

## Requirements

### Requirement 1: Imported Project Must Converge To Portfolio Visibility

**User Story:** As an IDE or CLI adapter, I want a successful onboarding import to become visible through the canonical project portfolio immediately or with explicit convergence semantics, so that I do not need to invent adapter-side shadow registries.

#### Acceptance Criteria

1. When `sce project onboarding import --root <path> --json` returns `success: true`, SCE SHALL provide a canonical path for the imported project to appear in `sce project portfolio show --json`
2. SCE SHALL NOT leave adapters guessing whether import success is durable while portfolio visibility is still absent
3. If portfolio visibility is not immediate, SCE SHALL expose explicit convergence state or cursor semantics that let adapters determine when the imported project is still pending publication
4. The canonical contract SHALL remain CLI- and IDE-neutral
5. Phase-1 SHOULD prefer immediate portfolio publication before returning success; pending semantics are only acceptable when the engine can explain them canonically

### Requirement 2: Publish Import Result Identity That Matches Portfolio Identity

**User Story:** As an adapter author, I want the onboarding import result to expose the same project identity that will later appear in the portfolio, so that current-workspace switching and project selection can remain stable.

#### Acceptance Criteria

1. A successful onboarding result SHALL expose canonical identity fields compatible with the portfolio projection, including `projectId`, `workspaceId`, and canonical root path
2. The identity exposed by onboarding SHALL match the identity later returned by `sce project portfolio show --json`
3. SCE SHALL NOT require adapters to synthesize a second identifier while waiting for portfolio refresh

### Requirement 3: Distinguish Import Success From Portfolio Publication State

**User Story:** As a supervising user, I want to know whether a project was imported, published to the caller-visible portfolio, and activated, so that project lifecycle remains auditable.

#### Acceptance Criteria

1. SCE SHALL distinguish at least:
   - onboarding succeeded
   - portfolio publication pending
   - portfolio publication completed
   - active workspace unchanged
2. These states SHALL be represented through canonical step keys, status values, or result fields rather than adapter-specific interpretation
3. Import flows that intentionally keep active workspace unchanged SHALL state that explicitly without implying portfolio invisibility

### Requirement 4: Preserve Portfolio As The Canonical Multi-Project Read Model

**User Story:** As an SCE maintainer, I want adapters to keep reading the project portfolio as the canonical multi-project projection, so that the engine remains the single source of truth.

#### Acceptance Criteria

1. SCE SHALL keep `sce project portfolio show --json` as the canonical adapter-facing multi-project read model
2. SCE SHALL NOT require adapters to persist imported-project shadow records as the primary source of truth
3. Temporary convergence metadata, if needed, SHALL still roll up into the canonical portfolio model instead of creating a parallel registry
4. Adapter-local optimistic rendering MAY exist temporarily, but SHALL NOT become the durable truth model

### Requirement 5: Support Cross-Tool Consistency For Import Follow-Up Actions

**User Story:** As an adapter author, I want follow-up actions such as workspace switching, explorer refresh, and project picker refresh to rely on canonical SCE state, so that CLI, IDE, and future tools behave the same way after import.

#### Acceptance Criteria

1. After import success, adapters SHALL be able to:
   - refresh project selectors
   - switch to the imported workspace
   - refresh project-scoped explorer trees
   using canonical SCE identity without guessing
2. The import/portfolio convergence contract SHALL work the same for IDE and CLI consumers
3. The contract SHALL not assume a specific UI layout, polling loop, or local cache strategy
