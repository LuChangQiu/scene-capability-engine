# Requirements Document

## Introduction

SCE has matured into a scene capability engine that now drives richer companion surfaces such as MagicBall IDE and CLI workflows. Those companion tools are no longer asking only for raw `scene/spec/task/event` execution streams. They also need a stable, engine-owned delivery projection layer for human supervision, handoff, release, and acceptance review.

The critical boundary must remain clear:

- SCE is the engine and canonical semantic source
- IDE and CLI are consumers/adapters
- SCE must not become a bundled UI product
- IDE and CLI must not invent parallel long-lived delivery truth

This Spec adds the engine-side contract needed for cross-tool delivery progression support without pushing IDE-specific layout or interaction semantics into SCE itself.

## Glossary

- **Delivery Projection**: An engine-owned structured view that projects delivery-governance objects from canonical scene truth for consumption by IDE, CLI, or other tools
- **Cross-Tool Contract**: A stable schema and identity model that can be consumed by multiple clients without embedding any one client's UI assumptions
- **Delivery Object**: A human-review-oriented governance object such as artifact, handoff, release, or acceptance
- **Scope Back-Link**: Stable linkage from a delivery object back to canonical `scene/spec/task/event` truth

## Requirements

### Requirement 1: Provide Engine-Owned Delivery Projection Contract

**User Story:** As an IDE or CLI consumer, I want SCE to expose a stable delivery projection contract, so that I can render delivery-governance views without reconstructing backend semantics from raw files and events.

#### Acceptance Criteria

1. SCE SHALL define a first-class delivery projection contract for cross-tool consumption
2. THE contract SHALL include at least `overview`, `documents`, `checklists`, `handoffs`, `releases`, and `acceptance` categories
3. THE contract SHALL be machine-readable and stable enough for IDE and CLI consumers to rely on
4. THE contract SHALL be defined as engine semantics, not as a UI-specific payload for one workbench

### Requirement 2: Provide Stable Canonical Identifiers For Delivery Objects

**User Story:** As a companion tool, I want stable object identifiers for delivery-governance entities, so that I can persist navigation, filtering, and review state without guessing object identity.

#### Acceptance Criteria

1. SCE SHALL define canonical identifiers for delivery artifacts where appropriate
2. SCE SHALL define canonical `handoffId`
3. SCE SHALL define canonical `releaseId`
4. SCE SHALL define canonical `acceptanceId`
5. WHEN canonical identifiers are not yet available for some object class, THEN SCE SHALL explicitly mark that contract as provisional rather than leaving identity implicit

### Requirement 3: Provide Stable Scope Back-Links To Scene Truth

**User Story:** As a review surface, I want every delivery object to point back to canonical execution truth, so that human supervision remains anchored to the same `scene/spec/task/event` model.

#### Acceptance Criteria

1. Every delivery object SHALL be able to reference its related `sceneId` and `specId` when known
2. Delivery objects SHOULD reference `taskRef`, `requestId`, and `eventId` when such linkage exists
3. SCE SHALL define a stable back-link schema instead of requiring every client to infer scope from file paths
4. WHEN linkage is incomplete, THEN the projection SHALL indicate missing scope explicitly rather than fabricating associations

### Requirement 4: Separate Governance Projection From Raw Execution Streams

**User Story:** As a maintainer, I want SCE to distinguish delivery-governance projection from runtime event streams, so that clients can consume human-review summaries without confusing them with raw execution logs.

#### Acceptance Criteria

1. SCE SHALL preserve `scene/spec/task/event` execution truth as the runtime source of truth
2. Delivery projection SHALL represent governance-oriented objects and summaries, not a second raw event stream
3. Triad documents and other shared evidence MAY participate in the projection as linked evidence, but SHALL NOT be treated as a replacement for delivery-governance objects
4. SCE SHALL document the semantic difference between execution events, evidence links, and delivery-governance projection records

### Requirement 5: Remain Cross-Tool And UI-Neutral

**User Story:** As an engine maintainer, I want SCE to support IDE and CLI equally, so that the engine does not drift into a single-client implementation.

#### Acceptance Criteria

1. SCE SHALL NOT encode IDE-specific layout semantics such as tabs, panels, left-right split, or card arrangement into the delivery projection contract
2. SCE SHALL NOT encode CLI-only formatting assumptions into the contract
3. THE contract SHALL be consumable by IDE, CLI, and future adapters through the same semantic schema
4. Documentation SHALL explicitly state which responsibilities belong to SCE and which belong to consuming tools

### Requirement 6: Publish A First Upstream Delivery Object Set

**User Story:** As a product integrator, I want a clear first iteration of engine-supported delivery object types, so that downstream tools can implement against a concrete contract instead of an open-ended wishlist.

#### Acceptance Criteria

1. SCE SHALL publish a first-iteration delivery object set covering:
   - delivery documents/artifacts
   - delivery checklists/tables
   - handoff governance objects
   - release governance objects
   - acceptance governance objects
2. For each object type, SCE SHALL define required fields, optional fields, identity fields, and linkage fields
3. SCE SHALL distinguish stable engine-backed fields from provisional or adapter-derived fields

### Requirement 7: Expose A Consumer-Facing Capability Boundary

**User Story:** As an IDE or CLI integrator, I want a documented capability boundary, so that I know what must be requested from SCE and what should remain in the adapter layer.

#### Acceptance Criteria

1. SCE SHALL document which delivery capabilities are engine-owned
2. SCE SHALL document which responsibilities remain adapter-owned, including layout, visual organization, and local interaction patterns
3. THE boundary SHALL make clear that SCE is not intended for standalone human use without an adapter surface
4. THE boundary SHALL explicitly discourage frontend-owned parallel delivery truth stores

### Requirement 8: Support Incremental Rollout

**User Story:** As a release owner, I want this capability to roll out incrementally, so that SCE can stabilize core delivery semantics before expanding into richer projections.

#### Acceptance Criteria

1. The first implementation MAY ship as read-heavy projection support before full write orchestration exists
2. SCE SHALL define which object classes are phase-1 read projection only and which can later become write-managed
3. SCE SHALL preserve backward compatibility for existing scene execution flows while adding delivery projection support
