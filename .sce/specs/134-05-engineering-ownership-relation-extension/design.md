# Design Document

## Decision

Define one ownership relation shape for later projection use.

## Shape

```ts
interface EngineeringOwnershipRelation {
  appKey: string
  workspaceId?: string
  userId?: string
  deviceId?: string
  ownershipType: 'local' | 'shared' | 'unresolved'
  sharedPolicy?: string
}
```

## Phase Rules

- ownership stays phase-2
- unknown links remain explicit
- later state-tier work may extend storage without changing this shape

## Requirement Mapping

- Requirement 1 -> ownership relation shape
- Requirement 2 -> engine-owned ownership semantics
- Requirement 3 -> phase-2 deferral
