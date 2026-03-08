# MagicBall Frontend State And Command Mapping

## Goal

Turn the current SCE integration defaults into a concrete frontend mapping table for MagicBall.

This document focuses on:
- page-level state ownership
- command-to-action mapping
- success / empty / error rendering rules
- retry and refresh behavior

Use this together with:
- `docs/magicball-sce-adaptation-guide.md`
- `docs/magicball-mode-home-and-ontology-empty-state-playbook.md`
- `docs/magicball-write-auth-adaptation-guide.md`

## 1. Integration Surfaces

The current frontend-sensitive surfaces are:
1. app bootstrap and mode-home loading
2. ontology empty-state and starter-seed initialization
3. write-error presentation and retry boundaries
4. timeline / task feedback handoff points

## 2. Page State Ownership

### 2.1 App Workspace Shell

This state belongs to the top-level app workspace shell.

Recommended shape:

```ts
interface AppWorkspaceState {
  appKey: string
  appBundle: Record<string, unknown> | null
  applicationHome: Record<string, unknown> | null
  ontologyHome: Record<string, unknown> | null
  engineeringHome: Record<string, unknown> | null
  engineeringDetail: Record<string, unknown> | null
  boot: ModeBootState
}
```

Owned commands:
- `sce app bundle show --app <app-key> --json`
- `sce mode application home --app <app-key> --json`
- `sce mode ontology home --app <app-key> --json`
- `sce mode engineering home --app <app-key> --json`
- `sce app engineering show --app <app-key> --json`

Rule:
- this shell owns mode bootstrap and should not delegate command ordering to nested tabs

### 2.2 Ontology Page State

Recommended shape:

```ts
interface OntologyPageState {
  ontologyHome: Record<string, unknown> | null
  triadSummary: Record<string, unknown> | null
  erList: Record<string, unknown> | null
  brList: Record<string, unknown> | null
  dlList: Record<string, unknown> | null
  starterSeed: {
    suggested: boolean
    profile: string | null
    guidance: string | null
  }
  emptyState: {
    visible: boolean
    reason: string | null
  }
  seedFlow: {
    loading: boolean
    confirming: boolean
    lastError: string | null
  }
}
```

Owned commands:
- `sce mode ontology home --app <app-key> --json`
- `sce ontology triad summary --json`
- `sce ontology er list --json`
- `sce ontology br list --json`
- `sce ontology dl list --json`
- `sce ontology seed show --profile customer-order-demo --json`
- `sce ontology seed apply --profile customer-order-demo --json`

Rule:
- ontology page owns empty-state detection and post-seed refresh chain

### 2.3 Command Failure State

Recommended shared shape:

```ts
interface CommandFailureState {
  command: string
  scope: 'read' | 'write'
  page: string
  stderr: string
  stdout: string | null
  exitCode: number | null
  occurredAt: string
  retryable: boolean
}
```

Rule:
- preserve exact command failure data for copy, retry, and AI-assisted diagnosis
- do not collapse all failures into a single generic message

## 3. Bootstrap Command Mapping

| UI event | SCE command | State target | Success behavior | Failure behavior |
| --- | --- | --- | --- | --- |
| Open app workspace | `sce app bundle show --app <app-key> --json` | `appBundle` | cache app identity and bundle bindings | stop boot and show workspace-level error |
| Bootstrap step 1 | `sce mode application home --app <app-key> --json` | `applicationHome` | render app hero / release status | stop boot, allow step retry |
| Bootstrap step 2 | `sce mode ontology home --app <app-key> --json` | `ontologyHome` | render ontology summary shell | keep app section visible, allow step retry |
| Bootstrap step 3 | `sce mode engineering home --app <app-key> --json` | `engineeringHome` | render engineering summary shell | keep prior sections visible, allow step retry |
| Bootstrap step 4 | `sce app engineering show --app <app-key> --json` | `engineeringDetail` | render repo/workspace detail | keep engineering summary visible, allow step retry |

Implementation rule:
- all four steps execute sequentially
- each step updates `boot.activeStep`
- each success appends to `boot.completedSteps`
- each failure writes a `CommandFailureState`

## 4. Ontology Empty-State Mapping

| Detection input | Frontend interpretation | UI action |
| --- | --- | --- |
| `mode ontology home` returns `starter_seed` guidance | project is seed-capable | show helper text + initialize button |
| `ontology triad summary` shows zero/missing triads | ontology coverage is not initialized | keep summary visible, do not treat as backend failure |
| `er/br/dl list` all empty | ontology asset space is empty | show empty-state card |
| one or more lists contain items | ontology is initialized | hide empty-state card |

Empty-state visibility rule:
- show empty-state only when the table/list surfaces are empty and summary also indicates zero/missing coverage
- do not show empty-state if one of ER/BR/DL already has real items

## 5. Starter Seed Command Mapping

| UI event | SCE command | State target | Success behavior | Failure behavior |
| --- | --- | --- | --- | --- |
| Open seed confirmation | `sce ontology seed show --profile customer-order-demo --json` | `seedFlow.confirming` | show preview of starter content | allow direct apply fallback if preview fails but command is optional |
| Confirm initialize | `sce ontology seed apply --profile customer-order-demo --json` | `seedFlow.loading` | run post-seed refresh chain | keep empty-state card visible and preserve exact error |
| Refresh after seed | `sce mode ontology home --app <app-key> --json` | `ontologyHome` | update summary/seed hint | show section-level error |
| Refresh after seed | `sce ontology triad summary --json` | `triadSummary` | update triad readiness | show section-level error |
| Refresh after seed | `sce ontology er list --json` | `erList` | populate ER table | show table-level error |
| Refresh after seed | `sce ontology br list --json` | `brList` | populate BR table | show table-level error |
| Refresh after seed | `sce ontology dl list --json` | `dlList` | populate DL table | show table-level error |

Important rule:
- seed apply is user-triggered only
- refresh chain is automatic once seed apply succeeds

## 6. Error Rendering Contract

### 6.1 Read Errors

Read errors should be rendered inline at the section that failed.

Examples:
- ontology summary failed -> show summary card error, not full page crash
- ER list failed -> show ER table error, keep BR/DL areas usable
- engineering detail failed -> keep engineering summary visible

### 6.2 Write Errors

Write errors should expose:
- exact command
- exit code
- stderr
- retry action
- copy error action

Recommended write-error card fields:
- title
- short reason
- command snippet
- copy button
- retry button
- `Ask AI to help fix` action if MagicBall already supports it

### 6.3 Retry Boundary Rule

Retry only the failed operation.
Do not blindly rerun the entire page bootstrap or seed workflow unless the state model requires it.

## 7. Suggested UI Actions

### 7.1 Workspace Shell

Buttons:
- `Retry current step`
- `Reload app workspace`
- `Copy command error`

### 7.2 Ontology Empty-State Card

Buttons:
- `Initialize starter ontology`
- `Continue with empty ontology`
- `Retry summary`

### 7.3 Seed Failure Card

Buttons:
- `Retry initialization`
- `Copy command error`
- `Continue with empty ontology`

## 8. Timeline And Task Handoff

This document does not redefine task/timeline contracts.
Use existing SCE view contracts for those surfaces:
- `docs/magicball-task-feedback-timeline-guide.md`
- `docs/agent-runtime/magicball-contract-index.md`

Recommended connection point:
- when a write or seed command fails, store the exact command failure bundle so MagicBall can pass it into its AI assistant or timeline/task views later

## 9. Minimal Acceptance Checklist

MagicBall can consider this mapping implemented when:
- one app workspace shell owns mode bootstrap ordering
- one ontology page state owns empty-state detection and seed flow
- each failing command renders at the correct section boundary
- every retry button retries only one failed command
- every write error can be copied directly for AI-assisted diagnosis

## 10. Suggested Implementation Order

1. workspace shell boot state
2. serialized bootstrap commands
3. ontology empty-state card
4. seed confirmation + apply flow
5. section-level error cards
6. error copy / retry actions
