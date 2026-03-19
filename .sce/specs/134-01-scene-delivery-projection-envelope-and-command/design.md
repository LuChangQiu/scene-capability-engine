# Design Document

## Decision

Publish one scene-scoped payload and one scene command:

- `sce scene delivery show --scene <scene-id> [--spec <spec-id>] --json`

## Envelope

```ts
interface SceneDeliveryProjection {
  sceneId: string
  specId?: string
  generatedAt: string
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
  provisional: boolean
  bound: boolean
  sceneId: string
  specId?: string
  taskRef?: string
  requestId?: string
  eventId?: string
}
```

## Phase-1 Rules

- scene and optional spec are the only selectors
- the payload is read-only
- fields without a stable source stay provisional or absent

## Requirement Mapping

- Requirement 1 -> envelope
- Requirement 2 -> record base
- Requirement 3 -> command surface
- Requirement 4 -> read-only rules
