# MagicBall UI Surface Checklist

## Goal

Give MagicBall frontend a page-by-page completion checklist for the current SCE integration scope.

This document is intentionally short.
Use it to decide whether a page is done.
Do not use it as the source of truth for state ownership, command mapping, or detailed error handling.

Use together with:
- `docs/magicball-frontend-state-and-command-mapping.md`
- `docs/magicball-mode-home-and-ontology-empty-state-playbook.md`
- `docs/magicball-cli-invocation-examples.md`
- `docs/magicball-write-auth-adaptation-guide.md`
- `docs/magicball-task-feedback-timeline-guide.md`

## 1. App Workspace Shell

### Must render
- app header from SCE app identity
- application summary shell
- ontology summary shell
- engineering summary shell
- engineering workspace detail

### Must behave correctly
- workspace boot is serialized
- shell appears before all boot steps complete
- each failed boot step can be retried in isolation

### Done when
- workspace opens without frontend-side relationship reconstruction
- later boot-step failure does not collapse earlier loaded sections

## 2. Application Mode

### Must render
- app hero
- release list
- current release marker
- install status

### Done when
- release data comes from SCE payloads directly
- release refresh updates the visible current state

## 3. Ontology Mode

### Must render
- ontology summary card
- triad summary card
- ER / BR / DL tables
- empty-state card only when ontology is truly empty
- starter-seed guidance when SCE provides it

### Done when
- empty ontology is explained as a valid fresh/local project state
- non-empty ontology hides the empty-state card
- summary and table areas can fail independently

## 4. Starter Seed Flow

### Must render
- explicit `Initialize starter ontology` entry
- optional preview/confirmation before apply
- success and failure feedback

### Done when
- seed apply is user-triggered only
- post-seed refresh updates both summary cards and ER/BR/DL tables
- failed seed apply preserves retry + copy-error actions

## 5. Engineering Mode

### Must render
- delivery summary
- requirement / tracking / planning / change / issue tabs
- assurance tabs
- engineering workspace detail

### Done when
- engineering tables use SCE table payloads directly
- empty engineering tables render as empty states, not legacy markdown fallbacks by default

## 6. Write Authorization

### Must render
- lease-aware write actions
- blocked write guidance
- authorization prompt / lease reuse behavior

### Done when
- mutating flows do not guess policy internals
- blocked writes explain why they are blocked

## 7. Task Feedback And Timeline

### Must render
- task cards from `feedback_model`
- advanced/audit access to raw `event[]`
- timeline list from `view_model.entries[]`
- timeline detail from `view_model.snapshot + files_preview`

### Done when
- main task panel is human-readable
- timeline remains recoverable and traceable

## 8. Baseline Error UX

Every page should support:
- inline section error states
- retry failed action only
- copy command error
- preserved stderr / exit code for AI-assisted diagnosis

Detailed state ownership and error boundary rules live in:
- `docs/magicball-frontend-state-and-command-mapping.md`

## 9. Final Acceptance Snapshot

MagicBall can treat the current SCE integration as baseline-ready when:
- workspace shell is serialized and stable
- ontology empty-state is explicit and usable
- write authorization is shared capability, not page-by-page improvisation
- task/timeline surfaces use SCE view contracts instead of raw event-first rendering
