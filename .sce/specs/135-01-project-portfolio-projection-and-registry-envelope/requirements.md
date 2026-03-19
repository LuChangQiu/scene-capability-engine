# Requirements Document

## Introduction

SCE needs one canonical multi-project portfolio envelope so IDE, CLI, and other adapters can inspect all visible projects without stitching together local workspace registries, cached active project markers, or tool-specific state.

## Requirements

### Requirement 1: Publish One Project Portfolio Projection

**User Story:** As an adapter, I want one portfolio projection across visible projects, so that I can show a project roster without merging multiple local sources of truth.

#### Acceptance Criteria

1. SCE SHALL publish one canonical `ProjectPortfolioProjection` envelope
2. The envelope SHALL represent all projects visible to the current caller context
3. The envelope SHALL include the current active project when one is known
4. The envelope SHALL stay JSON-first
5. Caller context resolution SHALL reuse `16-00` priority semantics instead of introducing a second visibility resolver

### Requirement 2: Publish Stable Project Identity Fields

**User Story:** As an adapter, I want stable identity fields for each project, so that project switching and routing do not depend on labels or path heuristics.

#### Acceptance Criteria

1. Each project record SHALL include `projectId`
2. Each project record SHALL include `workspaceId` when the project is workspace-backed
3. Each project record SHALL include `projectRoot`
4. Each project record SHALL include at least one human-readable label such as `projectName` or `appKey`
5. Project identity SHALL remain stable across adapter sessions for the same registered project
6. For workspace-backed projects in phase-1, `workspaceId` SHALL reuse the registered workspace name from `16-00`
7. For workspace-backed projects in phase-1, `projectId` SHALL be deterministically derived from `workspaceId` and SHALL NOT require a separate persistent project registry

### Requirement 3: Publish Project Summary Fields

**User Story:** As a supervising user, I want each portfolio entry to expose summary state, so that I can decide where to focus without opening every project individually.

#### Acceptance Criteria

1. Each project record SHALL include `readiness`
2. Each project record SHALL include `status`
3. Each project record SHALL include `activeSessionCount`
4. Each project record SHALL include `lastActivityAt` when known
5. Each project record SHALL indicate visibility or registry provenance, such as `registered`, `adopted`, or `imported`, when that distinction is known

### Requirement 4: Surface Inaccessible And Partial States Explicitly

**User Story:** As an adapter, I want inaccessible or partially known projects marked explicitly, so that I do not fake complete visibility when the engine cannot fully inspect a project.

#### Acceptance Criteria

1. Project records SHALL support explicit `availability` or equivalent state for accessible vs inaccessible projects
2. Records with incomplete metadata SHALL mark that state explicitly instead of omitting it silently
3. The projection SHALL allow partial success when some projects are inaccessible
4. The projection SHALL preserve visible projects even if one project fails inspection

### Requirement 5: Reuse One Read Command

**User Story:** As an adapter author, I want one read command for portfolio inspection, so that IDE and CLI can consume the same contract surface.

#### Acceptance Criteria

1. SCE SHALL expose `sce project portfolio show --json`
2. The command SHALL return the canonical `ProjectPortfolioProjection`
3. The command SHALL respect caller context when determining visible projects and active project identity
4. In single-project mode, the command MAY surface the current unregistered `.sce` project as a partial local record rather than failing or inventing registration state
