# Design Document

## Decision

Publish one target-resolution contract and one preflight command:

- `sce project target resolve --json`

The same resolution model should also be reusable inside assistant and orchestration command receipts.

## Envelope

```ts
interface ProjectTargetResolution {
  resolvedAt: string
  callerContext: ProjectTargetCallerContext
  status: 'current-project' | 'resolved-other-project' | 'ambiguous' | 'unresolved'
  currentProjectId?: string
  resolvedProjectId?: string
  confidence?: number
  reasonCode?: string
  candidates?: ProjectTargetCandidate[]
}

interface ProjectTargetCallerContext {
  currentProjectId?: string
  workspaceId?: string
  deviceId?: string
  toolInstanceId?: string
}

interface ProjectTargetCandidate {
  projectId: string
  workspaceId?: string
  projectName?: string
  appKey?: string
  confidence?: number
  reasonCode?: string
}
```

## Command Rules

- resolution consumes caller context plus request text or equivalent hints
- the command should support explicit inputs equivalent to `--request`, `--current-project`, `--workspace`, `--device`, and `--tool-instance-id`
- `--workspace` reuses `16-00` resolution semantics and only influences the returned caller context; it does not switch the globally active workspace
- `--current-project` is the caller's asserted current project identity using the `135-01` projectId contract
- when `--request` is omitted, phase-1 resolution should fall back to caller context and known current project rather than guessing from unrelated labels
- `--device` and `--tool-instance-id` remain opaque echoed caller identity fields in phase-1
- ambiguous and unresolved outcomes are first-class results, not exceptions
- command-side receipts for assistant and orchestration flows should echo `resolvedProjectId` once those flows adopt the contract
- this spec defines the reusable receipt payload shape first; it does not require introducing a new cross-project mutating command in the same change set
- the contract does not change the caller's active workspace as a side effect

## Relationship To Other Specs

- `135-01` provides stable project identities used by candidates and results
- `132-*` remains the source for project-internal execution semantics after routing lands on a project
- adapters may preflight with this command or consume the same resolution result inline in command receipts

## Requirement Mapping

- Requirement 1 -> resolution status model
- Requirement 2 -> caller-context echo
- Requirement 3 -> alternatives and confidence
- Requirement 4 -> receipt reuse rules
- Requirement 5 -> resolution command
