# MagicBall SCE Adaptation Guide

## Goal

Provide a stable adaptation guide for MagicBall to integrate the current SCE capability set.

This guide only covers implemented or ready-to-consume capabilities.
It is intended for MagicBall frontend / integration work.

## Current Scope

SCE now provides:

1. `app bundle registry`
2. `application / ontology / engineering home projections`
3. `app engineering attach / hydrate / activate`
4. `app registry configure / sync`
5. `app runtime show / releases / install / activate`
6. `pm` delivery data plane
7. `ontology` triad data plane
8. `assurance` data plane

## Recommended MagicBall Integration Strategy

### 1. Use `app_id` / `app_key` as the primary application identity

MagicBall should keep both:
- `app_id`
- `app_key`

Recommendation:
- internal routing and state can use either
- user-facing app selection should prefer `app_name`
- cross-mode switching should use `app_key` or `app_id` consistently

### 2. Always enter a mode through SCE projection APIs

Do not let MagicBall reconstruct runtime / ontology / engineering relationships itself.
Use:
- `sce mode application home --app <app-id|app-key> --json`
- `sce mode ontology home --app <app-id|app-key> --json`
- `sce mode engineering home --app <app-id|app-key> --json`

These should be treated as the top-level source for each mode page.

## Remote Registry Sources

### Bundle Registry
- repository: `https://github.com/heguangyong/magicball-app-bundle-registry`
- example app key: `customer-order-demo`

### Service Catalog
- repository: `https://github.com/heguangyong/magicball-app-service-catalog`
- example app key: `customer-order-demo`

## Demo Application

MagicBall can use this demo as the first full-chain integration target:
- `app_id`: `app.customer-order-demo`
- `app_key`: `customer-order-demo`

## Phase 1 Commands To Consume

### A. App Bundle And Mode Entry

#### Show app bundle
```bash
sce app bundle show --app customer-order-demo --json
```

#### Application home
```bash
sce mode application home --app customer-order-demo --json
```

#### Ontology home
```bash
sce mode ontology home --app customer-order-demo --json
```

#### Engineering home
```bash
sce mode engineering home --app customer-order-demo --json
```

### B. Registry Sync

#### Show registry config
```bash
sce app registry status --json
```

#### Configure local registry pointers
```bash
sce app registry configure \
  --bundle-index-url <path-or-url> \
  --service-index-url <path-or-url> \
  --json
```

#### Sync bundle registry
```bash
sce app registry sync-bundles --json
```

#### Sync service catalog
```bash
sce app registry sync-catalog --json
```

#### Sync both
```bash
sce app registry sync --json
```

### C. Runtime Flow

#### Show runtime projection
```bash
sce app runtime show --app customer-order-demo --json
```

#### List runtime releases
```bash
sce app runtime releases --app customer-order-demo --json
```

#### Install a release
```bash
sce app runtime install --app customer-order-demo --release <release-id> --json
```

#### Activate a release
```bash
sce app runtime activate --app customer-order-demo --release <release-id> --json
```

### D. Engineering Flow

#### Show engineering projection
```bash
sce app engineering show --app customer-order-demo --json
```

#### Attach engineering metadata
```bash
sce app engineering attach \
  --app customer-order-demo \
  --repo <repo-url> \
  --branch main \
  --json
```

#### Hydrate engineering workspace
```bash
sce app engineering hydrate --app customer-order-demo --json
```

#### Activate engineering workspace
```bash
sce app engineering activate --app customer-order-demo --json
```

### E. PM Delivery Data Plane

#### Requirements
```bash
sce pm requirement list --json
sce pm requirement show --id REQ-001 --json
sce pm requirement upsert --input requirement.json --json
```

#### Tracking
```bash
sce pm tracking board --json
sce pm tracking show --id TRK-001 --json
sce pm tracking upsert --input tracking.json --json
```

#### Planning
```bash
sce pm planning board --json
sce pm planning show --id PLN-001 --json
sce pm planning upsert --input plan.json --json
```

#### Change Requests
```bash
sce pm change list --json
sce pm change show --id CR-001 --json
sce pm change upsert --input change.json --json
```

#### Issues
```bash
sce pm issue board --json
sce pm issue show --id BUG-001 --json
sce pm issue upsert --input issue.json --json
```

### F. Ontology Data Plane

#### ER
```bash
sce ontology er list --json
sce ontology er show --id Requirement --json
sce ontology er upsert --input er.json --json
```

#### BR
```bash
sce ontology br list --json
sce ontology br show --id BR-001 --json
sce ontology br upsert --input br.json --json
```

#### DL
```bash
sce ontology dl list --json
sce ontology dl show --id DL-001 --json
sce ontology dl upsert --input dl.json --json
```

#### Triad Summary
```bash
sce ontology triad summary --json
```

### G. Assurance Data Plane

```bash
sce assurance resource status --json
sce assurance logs views --json
sce assurance backup list --json
sce assurance config switches --json
```

## Stable Response Patterns

## 1. Mode Home Payload

### `application home`
Expected top-level fields:
- `mode`
- `query`
- `summary`
- `relations`
- `items`
- `view_model`
- `mb_status`

Important `summary` fields:
- `app_name`
- `runtime_version`
- `environment`
- `release_status`
- `runtime_status`
- `install_status`
- `release_count`

Important `view_model` fields:
- `projection`
- `entrypoint`
- `current_release`
- `current_environment`
- `install_root`
- `scene_binding_count`
- `release_count`

### `ontology home`
Important `summary` fields:
- `app_name`
- `ontology_version`
- `template_version`
- `triad_status`
- `publish_readiness`
- `triad_ready`
- `triad_coverage_percent`

Additional top-level fields:
- `ontology_core`
- `ontology_core_ui`

Important `view_model` fields:
- `projection`
- `ontology_bundle_id`
- `triad_summary`
- `ontology_counts`
- `capability_count`

### `engineering home`
Important `summary` fields:
- `app_name`
- `runtime_version`
- `code_version`
- `current_branch`
- `dirty_state`
- `scene_count`
- `requirement_count`
- `issue_count`
- `plan_count`
- `assurance_resource_count`

Important `view_model` fields:
- `projection`
- `primary_sections`
- `project_name`
- `repo_url`
- `workspace_path`
- `default_scene_id`
- `delivery_summary`
- `assurance_summary`

## 2. Table Payload Pattern

The following command groups now follow a stable table-style output:
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

### `view_model`
Current stable shape:
```json
{
  "type": "table",
  "columns": []
}
```

MagicBall should use `view_model.columns` as the preferred visible-column contract.

## Suggested MagicBall UI Mapping

### Application Mode

Use these SCE sources:
- home shell: `mode application home`
- runtime details: `app runtime show`
- release list: `app runtime releases`

Recommended UI blocks:
1. app hero summary
2. active runtime release card
3. release list panel
4. install / activate actions

### Ontology Mode

Use these SCE sources:
- home shell: `mode ontology home`
- ER list: `ontology er list`
- BR list: `ontology br list`
- DL list: `ontology dl list`
- triad summary: `ontology triad summary`

Recommended UI blocks:
1. ontology hero summary
2. triad summary card
3. ER table
4. BR table
5. DL table

### Engineering Mode

Use these SCE sources:
- home shell: `mode engineering home`
- requirements: `pm requirement list`
- tracking: `pm tracking board`
- planning: `pm planning board`
- changes: `pm change list`
- issues: `pm issue board`
- resource: `assurance resource status`
- logs: `assurance logs views`
- backup: `assurance backup list`
- config: `assurance config switches`

Recommended UI blocks:
1. engineering hero summary
2. delivery summary cards
3. assurance summary cards
4. existing source / timeline / diff pages
5. delivery and assurance tables

## Recommended MagicBall Execution Flow

### App Selection
When the user selects an app:
1. call `sce mode application home --app <key> --json`
2. cache `app_id`, `app_key`, `relations`, `summary`
3. use that same app identity for mode switching

### Mode Switching
When switching modes:
1. `Application Mode` -> call `mode application home`
2. `Ontology Mode` -> call `mode ontology home`
3. `Engineering Mode` -> call `mode engineering home`

Do not infer the bundle relationship locally.

### Engineering Control Flow
When entering Engineering Mode for an app:
1. `sce app engineering show`
2. if not attached -> `sce app engineering attach`
3. if no workspace path -> `sce app engineering hydrate`
4. then `sce app engineering activate`
5. then open engineering pages using `mode engineering home`

### Runtime Control Flow
When entering Application Mode for an app:
1. `sce app runtime show`
2. if needed, `sce app runtime releases`
3. if not installed -> `sce app runtime install`
4. if release switch needed -> `sce app runtime activate`
5. then open app via `view_model.entrypoint`

## What MagicBall Should Do Next

The following work can start now.

### Priority 1
- switch mode entry pages to use `sce mode * home`
- use `app_key` as the stable app selection token
- wire demo app `customer-order-demo`

### Priority 2
- replace Engineering Mode table tabs with real `sce pm` and `sce assurance` payloads
- replace Ontology Mode table tabs with real `sce ontology` payloads

### Priority 3
- wire install / activate actions in Application Mode
- wire attach / hydrate / activate actions in Engineering Mode

## Actions MagicBall Needs To Coordinate With SCE

MagicBall should coordinate on these points:

1. confirm final top-level route keys for the three modes
2. confirm whether frontend stores `app_id` or `app_key` as primary route param
3. confirm whether write actions should be hidden when no `auth lease` is present
4. confirm how install / activate progress should be surfaced in UI
5. confirm whether empty-state fallback should still read `.sce/pm/*/index.md` after real data loads

## Practical Conclusion

MagicBall can now begin real integration against SCE instead of waiting on more foundation work.

The most useful immediate adaptation is:
1. consume `mode * home`
2. consume `pm / ontology / assurance` table payloads
3. use `customer-order-demo` as the first full-chain demo app
