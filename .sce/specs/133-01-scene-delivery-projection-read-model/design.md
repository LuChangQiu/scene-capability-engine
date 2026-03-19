# Design Document

## Decision

Ship phase-1 as one JSON-first read model plus one adapter-neutral command surface:

- command proposal: `sce scene delivery show --scene <scene-id> [--spec <spec-id>] --json`

This keeps the contract aligned with scene semantics and avoids inventing a frontend-only transport.

## Projection Envelope

```ts
interface SceneDeliveryProjection {
  sceneId: string
  specId?: string
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

## Record Base

```ts
interface DeliveryProjectionRecordBase {
  id: string
  objectType: 'overview' | 'document' | 'checklist' | 'handoff' | 'release' | 'acceptance'
  provenance: 'engine' | 'linked-evidence' | 'derived'
  provisional: boolean
  scope: {
    bound: boolean
    sceneId?: string
    specId?: string
    taskRef?: string
    requestId?: string
    eventId?: string
  }
}
```

## Phase-1 Source Mapping

### Overview

- source: scene/spec/task state and summary views already owned by SCE

### Documents

- source: triad files and explicitly linked delivery documents
- provenance: `engine` for canonical spec docs, `linked-evidence` for external release/handoff docs

### Checklists

- source: task state, acceptance/review checklist artifacts when present

### Handoffs

- source: handoff run summaries and handoff evidence references when available
- ids may be provisional in phase-1

### Releases

- source: release evidence summaries and release gate history when available
- release ids may be canonical if existing tags or session identifiers already provide stable identity

### Acceptance

- source: acceptance review summaries or explicitly linked acceptance artifacts

## Why this design

- It gives IDE one directly consumable `Delivery` payload
- It avoids making frontend infer cross-file identity
- It preserves the current engine truth boundary
- It does not require phase-1 write orchestration

## Non-goals

- no IDE card schema
- no adapter-specific grouping instructions
- no write mutation flow in phase-1

## Requirement Mapping

- Requirement 1 -> projection envelope
- Requirement 2 -> scope linkage model
- Requirement 3 -> source mapping and provisional id rules
- Requirement 4 -> `sce scene delivery show`
- Requirement 5 -> phase-1 read-heavy rollout
