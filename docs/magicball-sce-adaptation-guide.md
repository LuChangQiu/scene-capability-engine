# MagicBall SCE Adaptation Guide

## Goal

Provide the primary overview for MagicBall to integrate the current SCE capability set.

This document is intentionally concise.
It defines the stable integration shape, command families, and response contracts.
Implementation detail should live in the specialized documents listed below.

## Primary Companion Docs

Use these documents together:
- `docs/magicball-integration-doc-index.md`
- `docs/magicball-app-collection-phase-1.md`
- `docs/app-intent-apply-contract.md`
- `docs/magicball-ui-surface-checklist.md`
- `docs/magicball-engineering-projection-contract.md`
- `docs/magicball-project-portfolio-contract.md`
- `docs/magicball-mode-home-and-ontology-empty-state-playbook.md`
- `docs/magicball-frontend-state-and-command-mapping.md`
- `docs/magicball-cli-invocation-examples.md`
- `docs/magicball-write-auth-adaptation-guide.md`
- `docs/magicball-task-feedback-timeline-guide.md`
- `docs/magicball-integration-issue-tracker.md`

## Current Scope

SCE currently provides MagicBall-facing support for:
1. `device current` identity read model
2. `device override show/upsert` local overlay governance
3. `app bundle registry`
4. `app collection list/show/apply` with plan-first diff and guarded explicit execution
5. `scene workspace list/show/apply` with plan-first diff and guarded explicit execution
6. `app install-state` local device projection
7. `application / ontology / engineering home projections`
8. `app runtime install / activate / uninstall`
9. `app engineering attach / hydrate / scaffold / activate`
10. `pm` delivery data plane
11. `ontology` triad data plane
12. `assurance` data plane
13. `write authorization`
14. `task feedback + timeline`
15. `project portfolio / target resolve / supervision`

## Planned Next Scope

The next planned SCE capability line for MagicBall is lightweight cross-device sync and richer collection resolution above the current shipped local-device-first baseline.

Planned model split:
- `app_collection` and `scene_profile` as shared intent
- `device_installation` as local device fact
- `device_override` as local device overlay

Planned phase-1 position:
- local device-first
- file-backed shared intent
- SQLite only for local facts and rebuildable projections
- `apply` must be plan-first, not blind mutation
- local device override is file-backed and applied during collection/workspace resolution
- local device override mutation now uses explicit CLI upsert rather than manual-only file editing

Reference:
- `docs/magicball-app-collection-phase-1.md`
- `docs/app-intent-apply-contract.md`

## Core Integration Positioning

### 1. App identity

MagicBall should keep both:
- `app_id`
- `app_key`

Recommended rule:
- use `app_key` as the stable frontend route token
- keep `app_id` as the bound SCE identity once resolved
- prefer `app_name` for user-facing display

### 2. Three-mode entry

MagicBall should enter every app through SCE projections, not through frontend-reconstructed relationships.

Top-level entry commands:
- `sce mode application home --app <app-id|app-key> --json`
- `sce mode ontology home --app <app-id|app-key> --json`
- `sce mode engineering home --app <app-id|app-key> --json`

Current default during `Issue 001` verification:
- load `mode * home` sequentially, not in parallel
- recommended order:
  1. `mode application home`
  2. `mode ontology home`
  3. `mode engineering home`
  4. `scene delivery show`
  5. `app engineering preview`
  6. `app engineering ownership`

### 3. Fresh ontology behavior

Current default during `Issue 003` verification:
- treat empty ontology as a valid fresh/local project state
- use `fallback + optional seed apply`
- do not auto-apply starter seed silently
- keep seed apply explicit and user-triggered

## Remote Registry Sources

### Bundle Registry
- repository: `https://github.com/heguangyong/magicball-app-bundle-registry`
- example app key: `customer-order-demo`

### Service Catalog
- repository: `https://github.com/heguangyong/magicball-app-service-catalog`
- example app key: `customer-order-demo`

## Demo Application

Current first integration target:
- `app_id`: `app.customer-order-demo`
- `app_key`: `customer-order-demo`

## Command Families

This guide does not repeat full invocation examples.
Use `docs/magicball-cli-invocation-examples.md` for copy-ready commands.

### Mode entry
- `sce app bundle show`
- `sce mode application home`
- `sce mode ontology home`
- `sce mode engineering home`
- `sce scene delivery show`
- `sce app engineering preview`
- `sce app engineering ownership`

### Runtime and engineering control
- `sce device override show/upsert`
- `sce app runtime show/releases/install/activate/uninstall`
- `sce app engineering preview/ownership/open/import/show/attach/hydrate/scaffold/activate`
- `sce app registry status/configure/sync*`

### Multi-project control
- `sce project portfolio show`
- `sce project target resolve`
- `sce project supervision show`

### Engineering data plane
- `sce pm requirement list/show/upsert`
- `sce pm tracking board/show/upsert`
- `sce pm planning board/show/upsert`
- `sce pm change list/show/upsert`
- `sce pm issue board/show/upsert`

### Ontology data plane
- `sce ontology triad summary`
- `sce ontology er list/show/upsert`
- `sce ontology br list/show/upsert`
- `sce ontology dl list/show/upsert`
- `sce ontology seed list/show/apply`

### Assurance and governance
- `sce assurance resource status`
- `sce assurance logs views`
- `sce assurance backup list`
- `sce assurance config switches`
- `sce auth status/grant/revoke`

### Task and timeline
- `sce studio events`
- `sce timeline list/show`

## Stable Response Contracts

### 1. Mode-home payloads

MagicBall should treat the three `mode * home` commands as stable page-shell sources.

Common top-level fields:
- `mode`
- `query`
- `summary`
- `view_model`
- `mb_status`

Important additional fields vary by mode:
- `application home`: release/runtime state
- `ontology home`: `ontology_core_ui`, triad readiness, `starter_seed`
- `engineering home`: delivery summary, assurance summary, project metadata

### 2. Table payloads

The following command groups follow a stable table-style output:
- `sce pm * list/board`
- `sce ontology * list`
- `sce assurance *`

Expected fields:
- `mode`
- `query`
- `summary`
- `items`
- `filters`
- `sort`
- `view_model`
- `mb_status`

Current stable `view_model` shape:

```json
{
  "type": "table",
  "columns": []
}
```

MagicBall should use `view_model.columns` as the preferred visible-column contract.

## Recommended Division Of Responsibility

### This guide owns
- overall integration shape
- command family boundaries
- top-level response contracts
- current default product decisions

### Specialized docs own
- page-level done criteria: `docs/magicball-ui-surface-checklist.md`
- multi-project contracts: `docs/magicball-project-portfolio-contract.md`
- frontend state + command mapping: `docs/magicball-frontend-state-and-command-mapping.md`
- mode-home + ontology empty-state behavior: `docs/magicball-mode-home-and-ontology-empty-state-playbook.md`
- copy-ready commands: `docs/magicball-cli-invocation-examples.md`
- write auth behavior: `docs/magicball-write-auth-adaptation-guide.md`
- task/timeline behavior: `docs/magicball-task-feedback-timeline-guide.md`
- live cross-project truth: `docs/magicball-integration-issue-tracker.md`

## Practical Conclusion

MagicBall should now integrate SCE in this order:
1. use `app_key` as the frontend app token
2. bootstrap the workspace through serialized `mode * home`
3. render page surfaces from SCE payloads directly
4. keep ontology empty-state explicit and seed apply optional
5. keep write flows lease-aware
6. use task/timeline view contracts instead of raw event-first rendering
7. use `project portfolio / target resolve / supervision` for multi-project shells instead of frontend-rebuilt workspace truth
