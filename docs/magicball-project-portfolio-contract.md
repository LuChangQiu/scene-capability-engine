# MagicBall Project Portfolio Contract

## Goal

Define the stable phase-1 SCE contract for MagicBall multi-project surfaces.

This document covers:
- project roster projection
- target-project preflight resolution
- project-scoped supervision snapshot

This document does not define UI layout.
It defines the backend payloads MagicBall should consume directly.

Use together with:
- `docs/magicball-sce-adaptation-guide.md`
- `docs/magicball-frontend-state-and-command-mapping.md`
- `docs/magicball-cli-invocation-examples.md`
- `docs/magicball-integration-issue-tracker.md`

## Phase-1 Position

Phase-1 is read-first and engine-owned:
- project visibility comes from registered workspaces plus the current unregistered `.sce` project when applicable
- project identity is deterministic and stable for registered workspaces
- target resolution is preflight-only and does not mutate active workspace selection
- supervision is a project-scoped snapshot, not a raw cross-project event stream

Phase-1 does not introduce:
- a second persistent portfolio registry
- frontend-owned project identity synthesis
- implicit workspace switching during routing
- fake streaming semantics for supervision refresh

## Command Set

```bash
sce project portfolio show --json
sce project target resolve --json
sce project supervision show --project <project-id> --json
```

Optional caller-context inputs:

```bash
sce project portfolio show --workspace <workspace-name> --json
sce project target resolve --request "<text>" --current-project <project-id> --workspace <workspace-name> --device <device-id> --tool-instance-id <tool-id> --json
```

## 1. Project Portfolio Projection

### Command

```bash
sce project portfolio show --json
```

### Contract shape

```ts
interface ProjectPortfolioProjection {
  generatedAt: string
  callerContext?: {
    workspaceId?: string
    projectId?: string
    deviceId?: string
  }
  activeProjectId?: string
  projects: ProjectPortfolioRecord[]
}

interface ProjectPortfolioRecord {
  projectId: string
  workspaceId?: string
  projectRoot: string
  projectName?: string
  provenance?: 'registered' | 'discovered'
  readiness: 'ready' | 'partial' | 'pending' | 'blocked' | 'unknown'
  status: 'active' | 'background' | 'idle' | 'inaccessible' | 'unknown'
  availability: 'accessible' | 'inaccessible' | 'degraded'
  activeSessionCount: number
  lastActivityAt?: string
  summary?: {
    sceneCount?: number
    specCount?: number
  }
  partial?: boolean
  partialReasons?: string[]
}
```

### MagicBall rules

- Use `projectId` as the stable project route token for multi-project UI state.
- Treat `workspaceId` as an optional display/debug field, not the only identity field.
- Use `activeProjectId` as the current project marker.
- Render `partial` and `availability` explicitly; do not silently drop degraded or inaccessible records.
- Do not rebuild roster truth from local UI cache when this payload is available.

### Important phase-1 semantics

- Registered workspaces use stable `projectId` values derived from workspace identity, for example `workspace:<workspace-name>`.
- An unregistered current `.sce` project may appear as one local `discovered` partial record.
- `status=active` means the project matches caller context, not merely that it has background scene activity.

## 2. Target Resolution

### Command

```bash
sce project target resolve --request "<text>" --current-project <project-id> --json
```

### Contract shape

```ts
interface ProjectTargetResolution {
  resolvedAt: string
  callerContext: {
    currentProjectId?: string
    workspaceId?: string
    deviceId?: string
    toolInstanceId?: string
  }
  status: 'current-project' | 'resolved-other-project' | 'ambiguous' | 'unresolved'
  currentProjectId?: string
  resolvedProjectId?: string
  confidence?: number
  reasonCode?: string
  candidates?: Array<{
    projectId: string
    workspaceId?: string
    projectName?: string
    appKey?: string
    confidence?: number
    reasonCode?: string
  }>
}
```

### MagicBall rules

- Call `target resolve` before cross-project assistant or orchestration flows when the user request can target another project.
- Keep caller-submitted `currentProjectId` and engine-resolved `resolvedProjectId` separately.
- If `status=ambiguous`, show candidate selection UI instead of auto-picking.
- If `status=unresolved`, preserve the exact request text and returned reason for user clarification.
- Never treat `--workspace` as permission to switch the globally active workspace in frontend state.

## 3. Project Supervision Snapshot

### Command

```bash
sce project supervision show --project <project-id> --json
```

### Contract shape

```ts
interface ProjectSupervisionProjection {
  generatedAt: string
  projectId: string
  cursor?: string
  summary: {
    blockedCount: number
    handoffCount: number
    riskCount: number
    activeSceneCount?: number
    activeSpecCount?: number
    activeTaskCount?: number
    latestEventAt?: string
  }
  items: ProjectSupervisionItem[]
  partial?: boolean
  partialReasons?: string[]
}

interface ProjectSupervisionItem {
  id: string
  kind: 'blocked' | 'handoff' | 'risk' | 'active'
  state: string
  reasonCode?: string
  sceneId?: string
  specId?: string
  taskRef?: string
  requestId?: string
  eventId?: string
  updatedAt: string
  summary: string
}
```

### MagicBall rules

- Render summary counters directly from `summary`.
- Use `items[]` for drillback cards or project health detail panels.
- Preserve `sceneId/specId/requestId/eventId` for navigation and audit views.
- Treat `cursor` as an opaque polling checkpoint only.
- Do not present `cursor` as a replayable event stream offset.

## 4. Recommended Multi-Project Frontend Flow

1. Load `sce project portfolio show --json` when entering the multi-project shell.
2. Store `activeProjectId` and render a project switcher from `projects[]`.
3. When the user enters a cross-project free-text request, preflight with `sce project target resolve --json`.
4. After project selection or successful resolution, load `sce project supervision show --project <project-id> --json`.
5. Keep per-project tabs and page layout frontend-owned, but keep project truth engine-owned.

## 5. Minimal Acceptance Criteria For MagicBall

MagicBall can treat multi-project phase-1 as integrated when:
- project switcher uses `project portfolio show`
- cross-project preflight uses `project target resolve`
- project health/drillback uses `project supervision show`
- degraded and inaccessible projects are rendered explicitly
- target resolution never mutates global active workspace state implicitly
