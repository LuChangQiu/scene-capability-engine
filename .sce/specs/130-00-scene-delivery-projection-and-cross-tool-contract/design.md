# Design

## Decision

Deliver this capability as an engine-owned semantic contract rather than as a client-specific feature surface.

The first implementation should define a stable projection model for delivery-governance objects that is:

- grounded in canonical `scene/spec/task/event` truth
- consumable by IDE and CLI through the same schema
- neutral about presentation
- explicit about stable ids versus provisional fields

## Why this design

Companion tools now need more than raw execution events:

- IDE needs delivery-governance views for supervision, handoff, release, and acceptance
- CLI needs equivalent structured output for review, inspection, and routing
- neither side should reverse-engineer this from mixed files, status text, and event streams

If SCE does not own the semantic layer:

- each adapter will derive a different object model
- delivery identity will drift
- scope back-links will become inconsistent
- engine truth will fragment into client-maintained projections

If SCE tries to own the UI layer:

- the engine will become coupled to one client
- IDE-specific structure will leak into CLI or other future integrations
- cross-tool compatibility will degrade

## Canonical ownership

### Engine-owned

SCE should own:

- delivery projection schema
- canonical ids for delivery-governance objects
- scope back-link schema
- lineage/back-reference semantics
- distinction between execution events, evidence, and delivery-governance objects

### Adapter-owned

IDE/CLI adapters should own:

- layout and visual hierarchy
- local navigation patterns
- presentation grouping, panels, tabs, split panes, tables, cards, terminal formatting
- interaction affordances such as search boxes, expand/collapse state, and local review annotations

## First-iteration projection model

### Shared envelope

```ts
interface DeliveryProjectionEnvelope {
  scope: DeliveryProjectionScope
  generatedAt: string
  sourceVersion?: string
  overview: DeliveryOverviewRecord[]
  documents: DeliveryDocumentRecord[]
  checklists: DeliveryChecklistRecord[]
  handoffs: DeliveryHandoffRecord[]
  releases: DeliveryReleaseRecord[]
  acceptance: DeliveryAcceptanceRecord[]
}
```

### Scope schema

```ts
interface DeliveryProjectionScope {
  sceneId?: string
  specId?: string
  taskRef?: string
  requestId?: string
  eventId?: string
  bound: boolean
}
```

### Identity contract

Every delivery object should expose:

- stable id
- object type
- stable linkage fields
- provenance marker
- provisional marker when canonical engine id is not yet available

```ts
interface DeliveryProjectionRecordBase {
  id: string
  objectType: 'overview' | 'document' | 'checklist' | 'handoff' | 'release' | 'acceptance'
  provenance: 'engine' | 'linked-evidence' | 'derived'
  provisional?: boolean
  scope: DeliveryProjectionScope
}
```

### Delivery object set

#### Documents / artifacts

```ts
interface DeliveryDocumentRecord extends DeliveryProjectionRecordBase {
  objectType: 'document'
  title: string
  docType: 'triad-requirement' | 'triad-design' | 'triad-task' | 'delivery-note' | 'artifact'
  sourcePath?: string
  summary?: string
}
```

#### Checklists / tables

```ts
interface DeliveryChecklistRecord extends DeliveryProjectionRecordBase {
  objectType: 'checklist'
  title: string
  checklistType: 'planning' | 'issue' | 'review' | 'acceptance'
  status?: string
  owner?: string
  summary?: string
}
```

#### Handoffs

```ts
interface DeliveryHandoffRecord extends DeliveryProjectionRecordBase {
  objectType: 'handoff'
  handoffId?: string
  title: string
  sender?: string
  receiver?: string
  currentOwner?: string
  status?: string
  openItems?: string[]
  risks?: string[]
  blockers?: string[]
}
```

#### Releases

```ts
interface DeliveryReleaseRecord extends DeliveryProjectionRecordBase {
  objectType: 'release'
  releaseId?: string
  title: string
  versionTag?: string
  releaseBatch?: string
  status?: string
  changeSummary?: string
  rollbackSummary?: string
}
```

#### Acceptance

```ts
interface DeliveryAcceptanceRecord extends DeliveryProjectionRecordBase {
  objectType: 'acceptance'
  acceptanceId?: string
  title: string
  reviewer?: string
  conclusion?: string
  exceptionSummary?: string
  evidenceRefs?: string[]
}
```

## Back-link model

Delivery records should point back to canonical scene truth using explicit linkage instead of path inference.

Recommended first-iteration linkage rules:

1. `specId` is the minimum anchor for spec-scoped records
2. `sceneId` should be present when SCE can resolve official scene membership
3. `taskRef`, `requestId`, and `eventId` should be present when the delivery object derives from a concrete execution path
4. unbound records must be marked `bound: false`

## Rollout phases

### Phase 1

- define schemas
- expose read projection
- mark provisional ids where canonical ids are not yet available
- document engine/adapter boundary

### Phase 2

- replace provisional ids with canonical ids
- enrich lineage and cross-object linkage
- expose stronger query and filtering surfaces

### Phase 3

- add write-managed governance flows only where engine ownership is justified
- keep UI-neutral contract discipline intact

## Integration surfaces

The first implementation may appear through existing SCE surfaces such as:

- structured CLI output
- JSON projection files or commands
- engine-readable service interfaces used by IDE companions

The chosen transport is less important than keeping the semantic contract stable across all transports.

## Non-goals

- no IDE-specific page layout definitions
- no CLI-only text formatting contract as the canonical model
- no frontend-owned permanent delivery truth as a substitute for engine schema
- no requirement that SCE itself become a standalone workbench product
