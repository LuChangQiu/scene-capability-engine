# Design Document

## Decision

Define one scaffold result without widening preview or action semantics.

## Result

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

## Phase Rules

- scaffold stays phase-2
- repeated runs report skipped work explicitly
- preview and open/import remain upstream dependencies

## Requirement Mapping

- Requirement 1 -> scaffold result
- Requirement 2 -> idempotent reporting
- Requirement 3 -> phase-2 deferral
