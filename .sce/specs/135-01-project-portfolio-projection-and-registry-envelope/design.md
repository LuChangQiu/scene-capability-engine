# Design Document

## Decision

Publish one read-only portfolio envelope and one command:

- `sce project portfolio show --json`

The command returns the caller-visible project roster and a stable active-project marker when available.

## Envelope

```ts
interface ProjectPortfolioProjection {
  generatedAt: string
  callerContext?: ProjectPortfolioCallerContext
  activeProjectId?: string
  projects: ProjectPortfolioRecord[]
}

interface ProjectPortfolioCallerContext {
  workspaceId?: string
  projectId?: string
  deviceId?: string
  toolInstanceId?: string
}

interface ProjectPortfolioRecord {
  projectId: string
  workspaceId?: string
  projectRoot: string
  projectName?: string
  appKey?: string
  provenance?: 'registered' | 'adopted' | 'imported' | 'discovered'
  readiness: 'ready' | 'partial' | 'pending' | 'blocked' | 'unknown'
  status: 'active' | 'background' | 'idle' | 'inaccessible' | 'unknown'
  availability: 'accessible' | 'inaccessible' | 'degraded'
  activeSessionCount: number
  lastActivityAt?: string
  summary?: {
    sceneCount?: number
    specCount?: number
    openIssueCount?: number
  }
  partial?: boolean
  partialReasons?: string[]
}
```

## Identity Rules

- phase-1 workspace-backed visibility reuses the registered workspace catalog from `16-00`
- `workspaceId` is the registered workspace name
- `projectId` for workspace-backed projects is a deterministic alias derived from `workspaceId`, such as `workspace:<workspaceId>`
- the command does not create or persist a second project registry just to mint IDs
- when the caller is inside a valid unregistered `.sce` project, SCE may emit one local partial record with a deterministic local-only identifier derived from `projectRoot`; that record must be marked partial and must not be presented as a registered workspace-backed project

## Caller Context Rules

- caller context resolution reuses `16-00` priority order: explicit `--workspace`, current directory match, then active workspace
- `callerContext.workspaceId` and `callerContext.projectId` echo the resolved current project when one is known
- `deviceId` and `toolInstanceId` remain opaque caller-supplied context fields in phase-1

## Source Composition

- phase-1 visible projects come from the registered workspace catalog from `16-00`
- the current working directory may contribute one additional local partial record when it is a valid unregistered `.sce` project
- repo topology remains compatible with `24-00`
- project activity fields should be derived from project-local session governance state, including `SessionStore.listSceneRecords()` and related session metadata where available
- unreadable or partially inspectable projects stay in the roster and are marked via `availability`, `partial`, and `partialReasons`

The portfolio projection is a read model. It does not replace the underlying workspace registry and does not introduce a parallel persistent portfolio registry.

## Requirement Mapping

- Requirement 1 -> projection envelope and active-project marker
- Requirement 2 -> stable identity fields
- Requirement 3 -> summary fields
- Requirement 4 -> explicit partial and inaccessible states
- Requirement 5 -> command surface
