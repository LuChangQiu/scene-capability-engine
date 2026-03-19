# MagicBall Engineering Projection Contract

## Goal

Provide one narrow contract document for the current engineering-facing SCE payloads that MagicBall should consume directly.

This document is intentionally limited to:
- delivery projection
- engineering readiness preview
- engineering ownership relation
- canonical open/import result envelopes
- scaffold result contract

It does not redefine:
- mode-home payloads
- PM / ontology / assurance tables
- write authorization flow

## Current Read Models

### 1. Delivery projection

Command:

```bash
sce scene delivery show --scene <scene-id> --json
```

Frontend should rely on:
- `summary`
- `delivery`
- `records`
- `scene`
- `spec`

Use it for:
- engineering delivery column
- phase / status / evidence rendering
- showing spec-bound delivery progress without frontend-side synthesis

### 2. Engineering readiness preview

Command:

```bash
sce app engineering preview --app <app-key> --json
```

Stable fields:
- `summary.attached`
- `summary.hydrated`
- `summary.active`
- `summary.sourceKnown`
- `summary.projectionReady`
- `summary.readinessReasonCodes[]`
- `summary.nextActions[]`
- `summary.workspacePath`
- `summary.repoUrl`
- `summary.branch`
- `summary.codeVersion`

Rule:
- frontend should use `readinessReasonCodes` and `nextActions` directly
- frontend should not infer readiness by reverse-engineering `repoUrl/workspacePath/metadata`

### 3. Engineering ownership relation

Command:

```bash
sce app engineering ownership --app <app-key> --json
```

Stable fields:
- `summary.appKey`
- `summary.workspaceId`
- `summary.userId`
- `summary.deviceId`
- `summary.ownershipType`
- `summary.sharedPolicy`

Ownership type meanings:
- `local`: SCE has evidence this engineering workspace is local to the current device context
- `shared`: SCE has explicit shared ownership evidence or policy
- `unresolved`: SCE does not have enough evidence and will not guess

Rule:
- treat `null` link fields as intentionally unknown
- do not create a frontend-owned fallback ownership registry

## Current Action Envelopes

### 4. Canonical open/import result

Commands:

```bash
sce app engineering open --app <app-key> --json
sce app engineering import --app <app-key> --json
```

Stable fields:
- `mode`
- `success`
- `summary`
- `preview`
- `steps[]`

Stable step keys:
- `register`
- `attach`
- `hydrate`
- `activate`

Stable step status values:
- `done`
- `pending`
- `skipped`
- `failed`

Rule:
- all four step keys remain ordered
- non-applicable work reports `skipped`
- frontend should render the step list directly instead of inferring flow order from command history

### 5. Scaffold result

Command:

```bash
sce app engineering scaffold --app <app-key> --overwrite-policy missing-only --json
```

Stable fields:
- `summary.workspacePath`
- `summary.createdDirectoryCount`
- `summary.skippedDirectoryCount`
- `summary.failedDirectoryCount`
- `summary.createdFileCount`
- `summary.skippedFileCount`
- `summary.failedFileCount`
- `summary.overwritePolicy`

Overwrite policy values:
- `never`
- `missing-only`
- `explicit`

Rule:
- scaffold only initializes the SCE baseline under the engineering workspace
- scaffold does not authorize frontend to invent or rewrite business code layout
- repeated runs should be rendered as explicit skipped work, not as silent success

## Recommended Frontend Consumption Order

For engineering-mode shell bootstrap, prefer:

1. `sce mode engineering home --app <app-key> --json`
2. `sce scene delivery show --scene <scene-id> --json`
3. `sce app engineering preview --app <app-key> --json`
4. `sce app engineering ownership --app <app-key> --json`

For user-triggered engineering actions, prefer:

1. preview first
2. then `open` or `import` if the UI wants one canonical action-progress envelope
3. then explicit write actions: `attach`, `hydrate`, `scaffold`, `activate`
4. refresh `preview` and `ownership` after successful mutation

## Guardrails

- Do not treat `show` as the primary contract surface; it remains a compatibility alias.
- Do not derive ownership from missing fields by guesswork.
- Do not treat scaffold as permission to generate arbitrary business code.
- Do not replace backend readiness/step semantics with frontend-invented labels.
