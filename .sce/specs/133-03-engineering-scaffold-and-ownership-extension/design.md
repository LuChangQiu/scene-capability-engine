# Design Document

## Decision

Handle scaffold and ownership as one later child spec because both extend engineering projection semantics, but neither is required to land the first IDE `Delivery` column or the first preview/open envelope.

## Scaffold Result Contract

```ts
interface EngineeringProjectScaffoldResult {
  workspacePath: string
  createdDirectoryCount: number
  skippedDirectoryCount: number
  failedDirectoryCount?: number
  createdFileCount: number
  skippedFileCount: number
  failedFileCount?: number
  overwritePolicy: 'never' | 'missing-only' | 'explicit'
}
```

## Ownership Extension Point

```ts
interface EngineeringOwnershipRelation {
  appKey: string
  workspaceId?: string
  userId?: string
  deviceId?: string
  ownershipType?: 'local' | 'shared' | 'unresolved'
  sharedPolicy?: string
}
```

## Why keep this separate

- scaffold is operational and write-oriented
- ownership evolves with later registry/device work
- neither concern should widen the first preview/open implementation

## Requirement Mapping

- Requirement 1 -> scaffold result contract
- Requirement 2 -> ownership relation extension point
- Requirement 3 -> phase ordering and non-blocking rollout
