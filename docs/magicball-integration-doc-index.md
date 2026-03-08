# MagicBall Integration Doc Index

## Goal

Provide one short entry document for MagicBall engineers to know:
- which SCE-facing document to read first
- which document to use for a specific frontend concern
- which document is contract, checklist, tracker, or product policy

This file should stay short.
It is a navigation layer, not a new source of truth.

## Recommended Reading Order

1. `docs/magicball-sce-adaptation-guide.md`
   - primary integration overview
   - command surfaces and three-mode entry model

2. `docs/magicball-adaptation-task-checklist-v1.md`
   - implementation checklist
   - milestone-oriented execution order

3. `docs/magicball-mode-home-and-ontology-empty-state-playbook.md`
   - two active frontend-sensitive defaults
   - serialized mode-home loading
   - ontology empty-state and starter-seed behavior

4. `docs/magicball-frontend-state-and-command-mapping.md`
   - page state ownership
   - command-to-action mapping
   - error and retry boundaries

5. `docs/magicball-write-auth-adaptation-guide.md`
   - write authorization and lease handling

6. `docs/magicball-task-feedback-timeline-guide.md`
   - task feedback cards
   - timeline view integration

7. `docs/magicball-integration-issue-tracker.md`
   - current cross-project truth
   - only open issues, active decisions, and verified resolutions

## Use By Topic

### I need to bootstrap the three-mode app shell
Use:
- `docs/magicball-sce-adaptation-guide.md`
- `docs/magicball-mode-home-and-ontology-empty-state-playbook.md`
- `docs/magicball-frontend-state-and-command-mapping.md`

### I need to implement ontology empty-state and starter seed
Use:
- `docs/magicball-mode-home-and-ontology-empty-state-playbook.md`
- `docs/magicball-frontend-state-and-command-mapping.md`
- `docs/magicball-integration-issue-tracker.md`

### I need to implement write actions safely
Use:
- `docs/magicball-write-auth-adaptation-guide.md`
- `docs/magicball-frontend-state-and-command-mapping.md`

### I need to build task cards and timeline panels
Use:
- `docs/magicball-task-feedback-timeline-guide.md`
- `docs/agent-runtime/magicball-contract-index.md`

### I need to know what is still open between MagicBall and SCE
Use:
- `docs/magicball-integration-issue-tracker.md`

## Document Roles

| Document | Role | Should change often? |
| --- | --- | --- |
| `magicball-sce-adaptation-guide.md` | main overview | low |
| `magicball-adaptation-task-checklist-v1.md` | execution checklist | medium |
| `magicball-mode-home-and-ontology-empty-state-playbook.md` | frontend behavior policy | medium |
| `magicball-frontend-state-and-command-mapping.md` | frontend implementation mapping | medium |
| `magicball-write-auth-adaptation-guide.md` | auth/write behavior | low |
| `magicball-task-feedback-timeline-guide.md` | task/timeline integration | low |
| `magicball-integration-issue-tracker.md` | live cross-project tracker | high |

## Current High-Priority Defaults

As of the current tracker state:
- `mode * home` stays serialized during `Issue 001` verification
- fresh ontology pages use `fallback + optional seed apply`
- seed apply stays explicit and user-triggered
- command failures should be preserved in copyable form for AI-assisted diagnosis

## Maintenance Rule

When a new MagicBall-facing SCE document is added:
- add it here only if it changes implementation behavior or cross-project coordination
- do not add deep design drafts unless they are still active implementation inputs
