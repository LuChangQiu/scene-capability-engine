# Design Document

## Decision

Publish one project-scoped supervision envelope and one command:

- `sce project supervision show --project <project-id> --json`

The envelope summarizes project state and preserves traceable links back to project-internal scene/spec/task/event semantics.

## Envelope

```ts
interface ProjectSupervisionProjection {
  generatedAt: string
  projectId: string
  cursor?: string
  summary: ProjectSupervisionSummary
  items: ProjectSupervisionItem[]
  partial?: boolean
  partialReasons?: string[]
}

interface ProjectSupervisionSummary {
  blockedCount: number
  handoffCount: number
  riskCount: number
  activeSceneCount?: number
  activeSpecCount?: number
  activeTaskCount?: number
  latestEventAt?: string
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

## Source Composition

- project identity resolves through `135-01` back to one workspace root or local project root
- phase-1 reads project-local session governance and session artifacts, including `.sce/session-governance/scene-index.json`, `.sce/sessions/*.json`, and `SessionStore.listSceneRecords()` when available
- project-internal occupancy, handoff, and event semantics reuse `132-*`
- missing collaboration artifacts result in partial projection state; they must not be replaced with guessed blocked or handoff items
- the projection is project-level and adapter-ready; it is not a raw event log
- adapters may choose compact or detailed views, but the envelope remains layout-free

## Refresh Model

- full snapshot reads stay supported
- phase-1 `cursor` is an opaque snapshot checkpoint for polling, not a guaranteed raw event-stream position
- incremental reads may use the returned `cursor` on a best-effort basis
- missing, stale, or invalid cursors should fall back to a full snapshot rather than failing silently

## Requirement Mapping

- Requirement 1 -> project-scoped supervision envelope
- Requirement 2 -> summary metrics
- Requirement 3 -> drillback fields
- Requirement 4 -> state and reason-code reuse
- Requirement 5 -> cursor-based refresh model
- Requirement 6 -> command surface
