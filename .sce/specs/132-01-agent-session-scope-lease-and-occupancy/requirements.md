# Requirements Document

## Introduction

SCE needs a canonical project-level session and scope lease model so multiple tool instances can cooperate on one project without pretending local queues are the source of truth.

## Requirements

### Requirement 1: Canonical Agent Session Registry

**User Story:** As an adapter, I want one canonical project-level session list, so that I can show all active agents without merging local guesses.

#### Acceptance Criteria

1. SCE SHALL provide a canonical agent session registry for one project
2. Each session SHALL include at least `sessionId`, `agentProfileId`, `mode`, `status`, `deviceId`, `toolInstanceId`, `workspaceId`, `heartbeatAt`
3. The session model SHALL identify the current tool instance when provided by the caller context
4. The session model SHALL support more than one tool instance on the same device

### Requirement 2: Scope Lease Contract

**User Story:** As an agent, I want to acquire semantic scope leases, so that collaboration works at scene/spec/task level before falling back to file paths.

#### Acceptance Criteria

1. SCE SHALL support scope leases at least for `sceneId`, `specId`, `taskId`, and optional `pathPrefix`
2. A lease SHALL include `mode`, `writeKind`, `exclusive`, `holderSessionId`, `grantedAt`, `expiresAt`
3. SCE SHALL support shared observation leases and exclusive implementation leases
4. SCE SHALL publish occupancy derived from active leases

### Requirement 3: Occupancy Projection

**User Story:** As an adapter, I want one occupancy projection, so that I can overlay project usage state directly on scene/spec/task hierarchies.

#### Acceptance Criteria

1. SCE SHALL publish a canonical occupancy projection
2. The projection SHALL distinguish at least `idle`, `observe`, `document`, `implement`, `blocked`
3. The projection SHALL be queryable by project and consumable without adapter-side synthesis
4. The projection SHALL preserve scene/spec/task identity in the payload
