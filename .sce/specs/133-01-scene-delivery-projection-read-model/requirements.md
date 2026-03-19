# Requirements Document

## Introduction

The first concrete IDE-facing payoff in this program is a new `Delivery` column/view. That view should not be built by frontend heuristics over mixed files, handoff evidence, and release reports. SCE needs one engine-owned read model that projects delivery-governance truth from existing scene/spec/task/release evidence sources.

## Requirements

### Requirement 1: Provide A Canonical Scene Delivery Projection Envelope

**User Story:** As a frontend IDE adapter, I want one canonical delivery projection envelope, so that the `Delivery` column can render stable engine semantics without reconstructing them locally.

#### Acceptance Criteria

1. SCE SHALL provide a canonical delivery projection envelope scoped by scene and optional spec
2. The envelope SHALL expose at least `overview`, `documents`, `checklists`, `handoffs`, `releases`, and `acceptance`
3. The envelope SHALL be JSON-first and UI-neutral

### Requirement 2: Preserve Stable Back-Links To Canonical Scope

**User Story:** As a supervising user, I want every delivery object to point back to canonical execution scope, so that delivery review stays anchored to `scene/spec/task/event` truth.

#### Acceptance Criteria

1. Every delivery record SHALL expose `sceneId` and `specId` when known
2. Delivery records SHOULD expose `taskRef`, `requestId`, or `eventId` when known
3. Unbound records SHALL be marked explicitly instead of being inferred from file path conventions

### Requirement 3: Define Phase-1 Source Mapping Rules

**User Story:** As a maintainer, I want explicit source mapping rules, so that phase-1 projection does not fabricate engine truth or hide provisional fields.

#### Acceptance Criteria

1. The phase-1 design SHALL define which data comes from canonical engine state and which comes from linked evidence
2. Phase-1 SHALL mark provisional ids explicitly when canonical ids are not yet available
3. The projection SHALL not require frontend-maintained identity synthesis

### Requirement 4: Expose A Consumer-Facing Command Surface

**User Story:** As an IDE or CLI adapter, I want one stable command surface for the delivery projection, so that I can request projection data directly from SCE.

#### Acceptance Criteria

1. SCE SHALL define a phase-1 command surface for scene delivery projection
2. The command SHALL support machine-readable JSON output
3. The command SHALL support scene scope and optional spec filtering

### Requirement 5: Stay Read-Heavy In Phase-1

**User Story:** As a release owner, I want phase-1 delivery projection to stay read-heavy, so that IDE support can land without over-coupling to new governance write flows.

#### Acceptance Criteria

1. Phase-1 SHALL focus on read projection rather than write orchestration
2. Existing scene/spec/task and release evidence flows SHALL remain backward compatible
3. Future write-managed delivery flows MAY be deferred explicitly
