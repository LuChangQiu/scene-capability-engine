# Design

## Decision

Add an engine-owned onboarding contract layer for engineering projects rather than continuing to make adapters compose semantics from separate read and write commands.

The contract should stay UI-neutral and cover four connected concerns:

- project preview
- onboarding execution result
- readiness/gap semantics
- baseline scaffold result

## Why this design

Current companion tools have enough low-level commands to make progress, but not enough canonical semantics to behave consistently.

Without an upstream contract:

- IDE has to merge `app bundle show` and `app engineering show`
- CLI and IDE can reach different conclusions about why a project is not ready
- adapters must infer when to attach, hydrate, activate, or scaffold
- scaffold safety depends on local defensive logic instead of engine truth

That is the wrong ownership split. SCE should own the semantic truth; adapters should only own display and local interaction.

Current adapter pressure observed in MagicBall IDE:

- the IDE can now render canonical-looking project open/import receipts and readiness summaries
- the IDE still has to keep a local fallback scaffold implementation for `docs/project-management/**` and `.sce/templates/project-management/**`
- import preview/autofill semantics are still adapter-owned because SCE does not yet return a shared onboarding preview envelope

These are acceptable as transitional compatibility layers, but they should not become the long-term semantic source.

## Contract model

### 1. Project preview envelope

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

This envelope can back:

- open-project pickers
- CLI project status inspection
- adapter-side quick previews

### 2. Onboarding result envelope

```ts
interface EngineeringProjectOnboardingResult {
  mode: 'open' | 'import' | 'attach'
  appKey: string
  success: boolean
  preview: EngineeringProjectPreview
  steps: EngineeringProjectOnboardingStep[]
}

interface EngineeringProjectOnboardingStep {
  key: 'register' | 'attach' | 'hydrate' | 'activate' | 'scaffold'
  status: 'done' | 'skipped' | 'pending' | 'failed'
  reasonCode?: string
  detail?: string
}
```

The transport can be CLI JSON or another service interface, but the semantic shape should stay stable.

### 3. Readiness reason codes

Recommended first-iteration reason codes:

- `engineering.source_missing`
- `engineering.projection_missing`
- `engineering.workspace_unavailable`
- `engineering.hydrate_required`
- `engineering.activate_required`
- `engineering.scaffold_available`
- `engineering.upstream_contract_missing`

Adapters should display these codes in their own style, but should not redefine them.

### 4. Baseline scaffold contract

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

This contract should guarantee:

- idempotent writes
- canonical workspace targeting
- explicit overwrite behavior
- stable counts for supervision UIs

### 5. Ownership relation model

The engine should progressively expose relations such as:

- `workspaceId`
- `userId`
- `deviceId`
- `ownershipType`
- `sharedPolicy`

The first rollout does not need complete multi-user orchestration, but it should reserve the canonical place where those relations live.

## Rollout

### Phase 1

- publish preview contract
- publish onboarding result envelope
- publish readiness reason codes
- publish scaffold result contract

### Phase 2

- add canonical open/import commands that emit the shared envelope directly
- add stronger ownership relations
- align CLI human-readable output with the same underlying semantics

### Phase 3

- expand into richer project registry and device/user policies
- keep adapter-owned layout concerns out of SCE

## Non-goals

- no IDE-specific dialog or layout behavior
- no frontend-owned permanent project registry
- no requirement that SCE itself become a standalone human-facing workbench
