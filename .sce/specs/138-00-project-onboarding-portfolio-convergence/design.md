# Design Document

## Decision

Add one explicit convergence contract between root-based onboarding and the canonical project portfolio.

The engine should stay portfolio-first. Adapters may still keep a short-lived optimistic UI state, but they should not need to invent their own durable imported-project registry.

Phase-1 should implement Option A if technically feasible within the current engine boundary. Option B is fallback semantics, not the default product target.

## Observed Gap

Current observed behavior in local integration:

1. `sce project onboarding import --root <path> --json` returns `success: true`
2. the result already includes canonical preview identity such as `projectId`, `workspaceId`, and `rootDir`
3. the current engine path already registers the imported root into the canonical workspace-backed portfolio
4. but the onboarding contract does not expose an explicit `publish` step or `publication` state

That gap makes adapters unable to answer a simple post-import question canonically: "did import success already publish this project into the portfolio, or do I still need to wait?"

## Contract Direction

### Option A: Immediate Portfolio Publication

Preferred direction:

- successful import publishes the imported project into the caller-visible portfolio before returning success
- adapters can refresh `sce project portfolio show --json` immediately and trust the result

This is the cleanest contract because it preserves a single read model and avoids any extra polling semantics.

### Option B: Explicit Publication-Pending Semantics

If publication cannot be immediate, the onboarding result should include explicit convergence metadata, for example:

```ts
interface ProjectOnboardingImportResult {
  success: boolean
  preview: {
    projectId: string
    workspaceId: string
    rootDir: string
  }
  publication: {
    status: 'published' | 'pending'
    visibleInPortfolio: boolean
    retryAfterMs?: number
    cursor?: string
  }
  steps: Array<{
    key: 'register' | 'attach' | 'hydrate' | 'activate' | 'publish'
    status: 'done' | 'skipped' | 'pending' | 'failed'
    reasonCode?: string
    detail?: string
  }>
}
```

Adapters would then know whether a missing portfolio record is expected and temporary.

## Preferred Step Semantics

The canonical onboarding steps should distinguish:

- `register`
- `attach`
- `hydrate`
- `publish`
- `activate`

`activate` may remain skipped for import flows that preserve the current active workspace.

`publish` is the missing semantic today. Without it, adapters cannot tell whether import success should already imply portfolio visibility.

## Adapter Boundary

Adapter-owned:

- short-lived optimistic rendering if desired
- choosing whether to switch current workspace immediately after successful import
- refreshing local explorer trees and project selectors

Engine-owned:

- deciding when imported projects become canonical portfolio members
- publishing the authoritative visibility state
- exposing canonical identity and convergence status

## Phase-1 Recommendation

- First preference: import success implies `publish=done` before success returns
- Fallback only when unavoidable: `publish=pending` plus explicit machine-readable visibility metadata
- Reject adapter-owned durable shadow registry as a long-term solution

## Compatibility Notes

- This spec extends `136-00` rather than replacing it
- It must remain compatible with `135-01` as the canonical project portfolio read model
- It should reuse the onboarding envelope from `131-00` and add convergence semantics rather than inventing a new adapter-only contract
- IDEs such as MagicBall may temporarily shadow imported projects for UX continuity, but that must remain a compatibility shim, not the long-term contract

## Requirement Mapping

- Requirement 1 -> onboarding/portfolio convergence semantics
- Requirement 2 -> canonical identity reuse between import result and portfolio
- Requirement 3 -> explicit publication state and step semantics
- Requirement 4 -> preserve portfolio as canonical read model
- Requirement 5 -> cross-tool post-import consistency
