# Design Document

## Decision

Normalize the existing preview path around one payload:

- `sce app engineering preview --app <app-id> --json`

## Payload

```ts
interface EngineeringProjectPreview {
  appKey: string
  appName: string
  projectName?: string
  projectKey?: string
  repoUrl?: string
  provider?: string
  branch?: string
  codeVersion?: string
  workspacePath?: string
  attached: boolean
  hydrated: boolean
  active: boolean
  sourceKnown: boolean
  projectionReady: boolean
  readinessReasonCodes: string[]
  nextActions: string[]
}
```

## Reason Codes

- `engineering.source_missing`
- `engineering.projection_missing`
- `engineering.workspace_unavailable`
- `engineering.hydrate_required`
- `engineering.activate_required`

## Phase-1 Rules

- preview is read-only
- preview reuses the current app identity path
- later envelopes may embed this payload instead of redefining readiness state

## Requirement Mapping

- Requirement 1 -> preview payload
- Requirement 2 -> reason-code set
- Requirement 3 -> existing preview path reuse
