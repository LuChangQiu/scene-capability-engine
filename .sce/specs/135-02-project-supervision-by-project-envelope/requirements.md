# Requirements Document

## Introduction

SCE needs one project-level supervision envelope so adapters can monitor blocked work, handoff demand, risk, and recent activity across multiple projects without replaying every event stream locally.

## Requirements

### Requirement 1: Publish One Project-Level Supervision Envelope

**User Story:** As an adapter, I want one supervision envelope per project, so that I can display project health and drill back into the right scope without rebuilding supervision state locally.

#### Acceptance Criteria

1. SCE SHALL publish one canonical `ProjectSupervisionProjection` envelope
2. The envelope SHALL be queryable by `projectId`
3. The envelope SHALL stay JSON-first
4. The envelope SHALL support both summary inspection and traceable drillback references
5. Phase-1 SHALL reuse project-local supervision and session-governance sources rather than inventing a separate cross-project event log

### Requirement 2: Publish Project Summary Metrics

**User Story:** As a supervising user, I want a concise summary for each project, so that I can quickly identify blocked or risky work.

#### Acceptance Criteria

1. The supervision summary SHALL include `blockedCount`
2. The supervision summary SHALL include `handoffCount`
3. The supervision summary SHALL include `riskCount`
4. The supervision summary SHALL include `activeSceneCount`, `activeSpecCount`, and `activeTaskCount` when known
5. The supervision summary SHALL include `latestEventAt` when known

### Requirement 3: Preserve Scene/Spec/Task/Event Drillback

**User Story:** As an adapter, I want supervision items to link back to scene/spec/task/event identities, so that project-level oversight stays traceable.

#### Acceptance Criteria

1. Supervision items SHALL expose `sceneId` when known
2. Supervision items SHALL expose `specId` when known
3. Supervision items SHALL expose `taskRef`, `requestId`, or `eventId` when known
4. Supervision items SHALL classify at least `blocked`, `handoff`, `risk`, and `active`

### Requirement 4: Reuse Canonical Reason Codes And States

**User Story:** As an adapter implementer, I want the engine to publish stable reason codes and states, so that tools do not guess why a project is blocked or waiting on handoff.

#### Acceptance Criteria

1. Project supervision SHALL reuse canonical reason-code semantics from project-internal collaboration specs where available
2. Supervision items SHALL expose stable state fields rather than adapter-derived labels
3. Adapters SHALL be able to render project supervision without replaying the raw event stream
4. When project-local supervision evidence is incomplete, the projection SHALL surface partial state instead of synthesizing blocked or handoff conclusions

### Requirement 5: Support Incremental Refresh

**User Story:** As an adapter author, I want incremental supervision refresh, so that background project monitoring does not require full event history reload on every update.

#### Acceptance Criteria

1. The projection SHALL support best-effort incremental refresh semantics through a cursor, checkpoint, or equivalent mechanism
2. The projection SHALL expose enough metadata for adapters to poll after a known point without requiring raw event replay
3. Full snapshot reads SHALL remain available

### Requirement 6: Reuse One Read Command

**User Story:** As an adapter author, I want one command to fetch project supervision, so that IDE and CLI use the same contract surface.

#### Acceptance Criteria

1. SCE SHALL expose `sce project supervision show --project <project-id> --json`
2. The command SHALL return the canonical `ProjectSupervisionProjection`
3. The command MAY support incremental parameters without changing the base envelope
