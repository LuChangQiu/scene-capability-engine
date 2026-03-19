# Design Document

## Decision

Normalize the current action paths around one result envelope:

- `sce app engineering open --app <app-id> --json`
- `sce app engineering import --app <app-id> --json`

## Envelope

```ts
interface EngineeringProjectOpenResult {
  mode: 'open' | 'import'
  appKey: string
  success: boolean
  preview: EngineeringProjectPreview
  steps: Array<{
    key: 'register' | 'attach' | 'hydrate' | 'activate'
    status: 'done' | 'skipped' | 'pending' | 'failed'
    reasonCode?: string
    detail?: string
  }>
}
```

## Phase-1 Rules

- the preview payload comes from `134-02`
- each step keeps order
- non-applicable work reports `skipped`

## Requirement Mapping

- Requirement 1 -> result envelope
- Requirement 2 -> step status rules
- Requirement 3 -> current action path reuse
