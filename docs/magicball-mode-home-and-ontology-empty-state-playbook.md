# MagicBall Mode Home And Ontology Empty-State Playbook

## Goal

Provide a small, implementation-ready playbook for MagicBall frontend integration around the two remaining active cross-project items:
1. serialized mode-home loading during `Issue 001` verification
2. fresh-project ontology empty-state handling for `Issue 003`

This document is intentionally narrower than the main adaptation guide.
It should be used by frontend engineers who are wiring the actual page behavior.

## When To Use This Playbook

Use this playbook when MagicBall is:
- opening an app workspace
- switching between `application`, `ontology`, and `engineering` mode
- rendering a fresh project that has no ontology assets yet
- deciding whether and when to show starter seed initialization

## Default Product Decisions

Current recommended defaults are:
- `mode * home` reads stay serialized
- fresh ontology pages use `fallback + optional seed apply`
- seed is never auto-applied silently on first load

These defaults should remain in place until `docs/magicball-integration-issue-tracker.md` explicitly closes the relevant open item.

## Part 1: Serialized Mode-Home Loading

### Why

SCE already includes sqlite read-retry and a short-lived projection cache.
That reduces transient lock failures, but it is not yet a signal that MagicBall should fan out home projections in parallel.

During current verification:
- frontend stability is more valuable than a small reduction in page bootstrap latency
- the safest contract is one request at a time

### Required Load Order

When opening an app page, MagicBall should call these commands in order:

1. `sce mode application home --app <app-key> --json`
2. `sce mode ontology home --app <app-key> --json`
3. `sce mode engineering home --app <app-key> --json`
4. `sce app engineering show --app <app-key> --json`

### Frontend State Rule

Treat each call as one step in a small boot pipeline.
Do not issue step 2 before step 1 resolves.
Do not issue step 3 before step 2 resolves.
Do not issue step 4 before step 3 resolves.

Recommended local state shape:

```ts
interface ModeBootState {
  appKey: string
  bootStatus: 'idle' | 'loading' | 'partial' | 'ready' | 'failed'
  activeStep: 'application-home' | 'ontology-home' | 'engineering-home' | 'engineering-show' | null
  completedSteps: string[]
  lastError: string | null
}
```

### Recommended UX

During boot:
- show top-level shell immediately
- reveal each mode card/section as its payload arrives
- if step 3 or step 4 fails, keep already-loaded earlier sections visible
- avoid a full-screen hard failure unless step 1 fails

Recommended status copy:
- step 1 loading: `Loading application view...`
- step 2 loading: `Loading ontology view...`
- step 3 loading: `Loading engineering view...`
- step 4 loading: `Loading engineering workspace details...`

### Failure Handling

If a step fails:
- preserve all previously loaded payloads
- store the exact failing command and stderr text
- show a retry action for the failed step only
- do not automatically restart the full four-step sequence unless the app context changed

Recommended retry behavior:
- retry the failed step once on explicit user action
- if the step still fails, keep the shell usable and surface the exact command failure

### What Not To Do

Do not:
- switch back to `Promise.all(...)` style mode-home loading
- merge multiple raw payloads and pretend they are one synthetic source
- hide the exact failed step from the user

## Part 2: Fresh Ontology Empty-State Policy

### Why

A fresh/local project can legitimately have:
- zero ER assets
- zero BR rules
- zero DL chains
- zero triad coverage

That is not a backend failure.
It is an expected empty workspace state.

### Product Rule

MagicBall should use:
- explanatory empty state first
- optional starter seed second

That means:
- the first ontology page render explains why the page is empty
- the page reads `starter_seed` guidance from SCE payloads
- the user can explicitly choose to initialize starter data
- the page never seeds ontology data automatically without user intent

### Inputs MagicBall Should Read

Primary inputs:
- `sce mode ontology home --app <app-key> --json`
- `sce ontology triad summary --json`
- `sce ontology er list --json`
- `sce ontology br list --json`
- `sce ontology dl list --json`

Optional seed inputs:
- `sce ontology seed list --json`
- `sce ontology seed show --profile customer-order-demo --json`

Mutation:
- `sce ontology seed apply --profile customer-order-demo --json`

### Empty-State Trigger

Treat ontology as empty when both conditions hold:
- ER/BR/DL lists have no items
- ontology summary or triad summary indicates missing / zero coverage state

The frontend should not require a single exact boolean from one endpoint if the table/list payloads already prove the workspace is empty.

### Recommended UI Layout

Top section:
- keep ontology summary / triad summary visible
- if available, surface `starter_seed` guidance text from SCE

Main empty-state card:
- title: `Ontology is not initialized yet`
- description: `This is expected for a fresh or local project. You can start from an empty model or initialize starter ontology data.`
- primary action: `Initialize starter ontology`
- secondary action: `Continue with empty ontology`

Below the card:
- ER table shell
- BR table shell
- DL table shell
- each table may remain empty but should not look broken

### Seed Confirmation Flow

When the user clicks `Initialize starter ontology`:

1. optionally call `sce ontology seed show --profile customer-order-demo --json`
2. show what will be initialized
3. require explicit confirmation
4. call `sce ontology seed apply --profile customer-order-demo --json`
5. show progress state until command completes

Recommended confirmation copy:
- `Initialize starter ontology data for this app?`
- `This will create starter ER, BR, and DL assets for the current project.`

### Refresh Chain After Seed Apply

After a successful seed apply, refresh in this order:

1. `sce mode ontology home --app <app-key> --json`
2. `sce ontology triad summary --json`
3. `sce ontology er list --json`
4. `sce ontology br list --json`
5. `sce ontology dl list --json`

Rationale:
- summary first so the page-level status updates immediately
- tables second so the user can see concrete assets appear

### Seed Failure Handling

If seed apply fails:
- keep the empty-state card visible
- preserve the exact command error for copy/retry
- do not hide the ontology page or replace it with a generic crash screen
- let the user retry the seed action or continue with empty ontology

Recommended failure copy:
- `Starter ontology initialization failed.`
- `You can retry, inspect the command error, or continue with an empty ontology.`

## Part 3: Suggested Frontend Call Graph

```text
App Selected
  -> app bundle show
  -> application home
  -> ontology home
  -> engineering home
  -> engineering show

Ontology Tab Opened
  -> ontology home
  -> triad summary
  -> er list
  -> br list
  -> dl list
  -> if empty: show starter seed guidance

User Clicks Initialize Starter Ontology
  -> seed show (optional)
  -> seed apply
  -> ontology home
  -> triad summary
  -> er list
  -> br list
  -> dl list
```

## Part 4: Minimal Acceptance Checks

MagicBall can consider this playbook implemented when:
- mode-home calls are serialized by default
- each boot step has visible progress and isolated retry
- ontology empty pages no longer look like backend failure states
- starter seed is explicit and user-triggered
- post-seed refresh updates both summary cards and ER/BR/DL tables

## Related Docs

- `docs/magicball-sce-adaptation-guide.md`
- `docs/magicball-adaptation-task-checklist-v1.md`
- `docs/magicball-integration-issue-tracker.md`
