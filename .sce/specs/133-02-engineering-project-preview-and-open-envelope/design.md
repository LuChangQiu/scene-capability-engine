# Design Document

## Decision

Narrow the phase-1 onboarding contract to two read/action envelopes:

- `preview`
- `open/import` result

Do not include scaffold or ownership expansion in this spec.

## Preview Contract

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

## Open/Import Result Envelope

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

## Canonical Reason Codes

- `engineering.source_missing`
- `engineering.projection_missing`
- `engineering.workspace_unavailable`
- `engineering.hydrate_required`
- `engineering.activate_required`
- `engineering.upstream_contract_missing`

## Transport Direction

Preferred phase-1 command surfaces:

- `sce app engineering preview --app <app-id> --json`
- `sce app engineering open --app <app-id> --json`
- `sce app engineering import --app <app-id> --json`

If the command naming changes, the semantic envelope must still remain stable.

## Requirement Mapping

- Requirement 1 -> preview contract
- Requirement 2 -> open/import result envelope
- Requirement 3 -> canonical reason codes
- Requirement 4 -> wrap existing engineering command semantics
