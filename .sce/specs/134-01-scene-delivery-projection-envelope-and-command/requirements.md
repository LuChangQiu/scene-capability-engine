# Requirements Document

## Introduction

This spec defines only the delivery projection envelope and the single command that returns it. It does not add write behavior and it does not define IDE layout structure.

## Requirements

### Requirement 1: Publish One Delivery Projection Envelope

**User Story:** As an adapter, I want one delivery projection envelope, so that the `Delivery` column can read engine-owned semantics directly.

#### Acceptance Criteria

1. SCE SHALL publish one `SceneDeliveryProjection` envelope
2. The envelope SHALL expose `overview`, `documents`, `checklists`, `handoffs`, `releases`, and `acceptance`
3. The envelope SHALL stay JSON-first

### Requirement 2: Publish Stable Scope Back-Links

**User Story:** As an adapter, I want each delivery record to point back to its canonical scope, so that the column does not infer identity from file naming.

#### Acceptance Criteria

1. Delivery records SHALL expose `sceneId`
2. Delivery records SHALL expose `specId` when known
3. Delivery records SHALL expose `taskRef`, `requestId`, or `eventId` when known
4. Records without stable binding SHALL mark that state explicitly

### Requirement 3: Reuse One Scene Command

**User Story:** As an adapter, I want one command to fetch the delivery envelope, so that the same semantic payload can serve IDE and CLI inspection.

#### Acceptance Criteria

1. SCE SHALL expose `sce scene delivery show --scene <scene-id> [--spec <spec-id>] --json`
2. The command SHALL return the canonical delivery projection envelope
3. The command SHALL support scene scope and optional spec filtering

### Requirement 4: Keep Phase-1 Read-Only

**User Story:** As a release steward, I want the first delivery contract to stay read-only, so that the `Delivery` column can land without new mutation behavior.

#### Acceptance Criteria

1. Phase-1 SHALL stay read-only
2. Existing release and handoff evidence flows SHALL remain compatible
3. Write-oriented delivery management MAY remain deferred
