# MagicBall Three-Mode Alignment Plan

> Status: historical alignment plan.
> Keep this as product/architecture background, not as the primary implementation guide.
> For current integration work, prefer the documents listed in `docs/magicball-integration-doc-index.md`.

## Goal

Align MagicBall and SCE around a stable three-mode product model:

1. `Application Mode`
2. `Ontology Mode`
3. `Engineering Mode`

At the platform level, these three modes should be organized into two larger spaces:

1. `Runtime Space`
2. `R&D Space`

This document defines the recommended architecture, responsibility split, SCE data model, and phased iteration path.

## Recommended Positioning

### 1. Runtime Space

Primary purpose:
- Run and use concrete applications.
- Present applications like an operating-system level app environment.
- Let users open an app directly, similar to opening an app on a phone.

Mapped mode:
- `Application Mode`

Core characteristics:
- User-facing
- Release-oriented
- Stable runtime state
- App install / app open / app switch / app version awareness

### 2. R&D Space

Primary purpose:
- Define, evolve, and operate the application behind the runtime.
- Manage ontology assets, codebase, delivery flow, issue handling, and AI-driven change control.

Mapped modes:
- `Ontology Mode`
- `Engineering Mode`

Core characteristics:
- Developer / builder-facing
- Capability-oriented
- Project / ontology / source controlled
- Traceable and auditable

## Final Mode Mapping

### Application Mode

Use for:
- Running a specific application release
- Opening installed applications
- Switching between app releases or environments
- Viewing runtime-level app entry points

SCE meaning:
- Runtime projection of an application release
- Backed by app package metadata, runtime endpoints, environment binding, and release evidence

### Ontology Mode

Use for:
- Rapidly building applications from ontology, spec, template, and capability assets
- Managing template-derived application structures
- Editing ER / BR / DL and turning them into reusable capability definitions

SCE meaning:
- Capability and ontology authoring space
- Backed by ontology triad assets, templates, specs, capability definitions, and publishable app blueprints

### Engineering Mode

Use for:
- Controlling AI-assisted work on the current application
- Managing source, timeline, diff, delivery flow, issues, plans, changes, and runtime assurance
- Connecting application work to the real project codebase and release line

SCE meaning:
- Project engineering control plane
- Backed by source project, scene/spec/task history, PM objects, runtime assurance data, and audit streams

## Key Structural Principle

A concrete application landing in MagicBall should not be treated as a single flat thing.
It should always be represented as a three-part bundle:

1. `Runtime Projection`
2. `Ontology Projection`
3. `Engineering Projection`

That means every real application introduced into MagicBall should map to:

- one runtime app instance in `Application Mode`
- one ontology/capability workspace in `Ontology Mode`
- one source/project workspace in `Engineering Mode`

This is the correct abstraction for your current direction.

## Recommended Canonical Unit

### App Bundle

SCE should treat the primary managed object as an `app bundle`.

Suggested fields:
- `app_id`
- `app_key`
- `app_name`
- `runtime_release_id`
- `runtime_version`
- `ontology_bundle_id`
- `engineering_project_id`
- `default_scene_id`
- `environment`
- `status`
- `source_origin`
- `created_at`
- `updated_at`

Meaning:
- One app bundle binds the three MagicBall projections together.
- MagicBall should not independently guess which source project, ontology set, and runtime release belong together.
- SCE should be the source of truth for this binding.

## Recommended Identity Model

### 1. Runtime Identity

Represents the application users open.

Suggested objects:
- `runtime_app`
- `runtime_release`
- `runtime_installation`
- `runtime_environment_binding`

Key fields:
- `app_id`
- `release_id`
- `version`
- `channel`
- `entrypoint`
- `runtime_status`
- `installed_at`

### 2. Ontology Identity

Represents the app's capability and structure definition.

Suggested objects:
- `ontology_bundle`
- `ontology_er_asset`
- `ontology_br_rule`
- `ontology_dl_chain`
- `capability_definition`
- `template_binding`

Key fields:
- `ontology_bundle_id`
- `triad_status`
- `template_source`
- `capability_set`
- `publish_readiness`

### 3. Engineering Identity

Represents the actual project and engineering control line.

Suggested objects:
- `engineering_project`
- `engineering_codebase`
- `pm_requirement`
- `pm_tracking`
- `pm_plan`
- `pm_change_request`
- `pm_issue`
- `timeline_snapshot`
- `auth_lease`

Key fields:
- `engineering_project_id`
- `repo_url`
- `branch`
- `commit`
- `workspace_path`
- `active_release_version`
- `active_code_version`

## Recommended Version Model

You explicitly need both:
- current application release version
- corresponding code version

This is correct and should be made first-class.

Suggested version structure:

### Runtime Version
- what users are currently using
- release-oriented
- shown in `Application Mode`

Fields:
- `runtime_version`
- `release_id`
- `release_channel`
- `release_status`
- `published_at`

### Code Version
- what engineering is currently modifying
- source-oriented
- shown in `Engineering Mode`

Fields:
- `repo`
- `branch`
- `commit_sha`
- `workspace_revision`
- `dirty_state`
- `synced_to_release`

### Ontology Version
- what ontology/capability set the app currently maps to
- shown in `Ontology Mode`

Fields:
- `ontology_version`
- `template_version`
- `capability_catalog_version`
- `triad_revision`

## Recommended Top-Level SCE Object Graph

SCE should evolve toward this graph:

- `workspace`
- `app_bundle`
- `runtime_release`
- `ontology_bundle`
- `engineering_project`
- `scene`
- `spec`
- `task`
- `event`

Relationship:
- one `workspace` contains many `app_bundle`
- one `app_bundle` binds one runtime release line, one ontology bundle, one engineering project
- one engineering project contains many scenes
- one scene contains many specs
- one spec contains many tasks
- one task contains many events

This aligns with your current session/scene/spec/task governance direction.

## How MagicBall Should Open a Managed App

When the user selects an app in MagicBall, the system should not just "open a page".
It should resolve the app bundle and then expose three coordinated projections:

1. `Application Mode`
- open runtime app
- show installed release and runtime environment

2. `Ontology Mode`
- open ontology/capability workspace for this app
- show template base, ER/BR/DL, capability triad, ontology completeness

3. `Engineering Mode`
- open source/project workspace for this app
- show source, timeline, diff, delivery, issues, plans, assurance

This should be resolved by SCE, not assembled ad hoc in the frontend.

## Engineering Mode Alignment

Based on the existing MagicBall documents, the current Engineering Mode shape is already usable.
It should remain the primary engineering control plane.

### Stable menu tree

1. `Source`
2. `Timeline`
3. `Diff`
4. `Delivery`
5. `Capability Definition`
6. `Assurance`

### Delivery
- `Requirements`
- `Tracking`
- `Planning`
- `Change Requests`
- `Issues`

### Capability Definition
- `ER`
- `BR`
- `DL`

### Assurance
- `Resource Status`
- `Log Management`
- `Backup & Restore`
- `Config & Switch`

### SCE role for Engineering Mode

SCE should provide:
- SQLite-backed source of truth
- list/show/upsert APIs or commands
- stable `view_model`
- object linking through `scene_ref`, `spec_ref`, `task_ref`, `app_id`, `engineering_project_id`
- auth lease enforcement for mutations

## Ontology Mode Alignment

Ontology Mode should not just mean "template library page".
It should become the app-building workspace.

Recommended ontology-mode pillars:

1. `Template Base`
- current available template assets
- template source and version
- upgrade compatibility

2. `App Blueprint`
- app-level ontology bundle
- current bundle readiness
- publishable blueprint summary

3. `Ontology Triad`
- `ER`
- `BR`
- `DL`
- completeness, blockers, publish readiness

4. `Capability Build`
- ability to promote scene/spec/task learnings into capability definitions
- map triad assets into reusable capability entries

### SCE role for Ontology Mode

SCE should provide:
- ontology bundle registry
- triad asset CRUD
- template bindings
- capability definition lifecycle
- publish readiness and triad completeness summaries

## Application Mode Alignment

Application Mode should behave like an operating-system application launcher.

Recommended application-mode pillars:

1. `Installed Apps`
- apps available locally or for the current workspace/user

2. `Open App`
- open a concrete app release directly

3. `Release Awareness`
- show current release version
- show environment/channel
- support switching release or environment if allowed

4. `App Service Library`
- download/install app packages from a service/app library

### SCE role for Application Mode

SCE should provide:
- app bundle registry
- runtime release metadata
- installation metadata
- environment binding
- release evidence summary

## Recommended SCE Work Priorities

### Priority A: App Bundle Backbone

This is now the highest-value missing backbone.

SCE should add:
- `app_bundle` registry
- runtime/ontology/engineering binding model
- `list/show/register/sync` interfaces

Suggested commands:
- `sce app bundle list --json`
- `sce app bundle show --app <id> --json`
- `sce app bundle register --input bundle.json --json`
- `sce app bundle sync --app <id> --json`

### Priority B: Engineering Mode Data Plane

Continue the path already aligned with MagicBall docs.

SCE should add or complete:
- PM domain commands
- ontology triad commands
- assurance commands
- stable `view_model`
- Markdown export fallback

Suggested commands:
- `sce pm requirement list/show/upsert --json`
- `sce pm tracking board/show --json`
- `sce pm planning board/show --json`
- `sce pm change list/show/upsert --json`
- `sce pm issue board/show/upsert --json`
- `sce ontology er|br|dl list/show/upsert --json`
- `sce ontology triad summary --json`
- `sce assurance resource status --json`
- `sce assurance logs views --json`
- `sce assurance backup list --json`
- `sce assurance config switches --json`

### Priority C: Mode-Aware Projection APIs

SCE should explicitly expose data by mode instead of forcing MagicBall to infer mode semantics.

Suggested commands:
- `sce mode application home --app <id> --json`
- `sce mode ontology home --app <id> --json`
- `sce mode engineering home --app <id> --json`

This gives MagicBall a stable projection entry for each mode.

### Priority D: Project Intake / Download / Attach Flow

You explicitly need this behavior:
- when managing an app, download the corresponding project from the server
- map runtime, ontology, and engineering parts into their respective modes

SCE should therefore support:
- app/project attachment
- project download / hydrate
- local workspace activation

Suggested commands:
- `sce project attach --app <id> --source <repo-or-bundle> --json`
- `sce project hydrate --app <id> --json`
- `sce project activate --app <id> --json`

## Recommended Responsibility Split

### MagicBall should own
- mode shell and navigation
- app switching UX
- runtime/ontology/engineering top-level experience
- rendering `view_model`
- local tab/state UX cache

### SCE should own
- app bundle registry
- runtime/ontology/engineering binding truth
- SQLite state
- PM/ontology/assurance data
- scene/spec/task/task-stream governance
- release/code/ontology version truth
- auth lease enforcement

## Recommended Iteration Sequence

### Phase 1: Lock vocabulary and object model

Define and freeze:
- `Runtime Space`
- `R&D Space`
- `Application Mode`
- `Ontology Mode`
- `Engineering Mode`
- `app_bundle`
- `runtime_release`
- `ontology_bundle`
- `engineering_project`

### Phase 2: Build SCE app bundle registry

Deliver:
- app bundle SQLite tables
- list/show/register commands
- project/runtime/ontology binding model

### Phase 3: Complete Engineering Mode data plane

Deliver:
- PM objects
- ontology triad objects
- assurance objects
- common `view_model`
- auth lease on writes

### Phase 4: Add mode-aware projection APIs

Deliver:
- application home projection
- ontology home projection
- engineering home projection

### Phase 5: Add project hydrate/attach flow

Deliver:
- app-to-project attach
- workspace hydrate/download
- activate current engineering project for app

### Phase 6: Capability feedback loop

Deliver:
- convert historical scene/spec/task value into capability definitions
- push qualified capability assets into ontology/template/capability library

## What Should Be Treated As The Main Next Work

The single highest-value next work is:

`Build the app bundle backbone and make the three MagicBall modes projectable from SCE.`

Reason:
- without this, MagicBall can render pages but still lacks a single truth source for which runtime app, ontology bundle, and engineering project belong together
- without this, mode switching will drift into frontend-side assembly logic
- without this, every app landing remains a manual loose coupling exercise

## Short Practical Conclusion

From the SCE side, the next focus should be:

1. `app bundle registry`
2. `engineering-mode data plane`
3. `mode-aware projections`
4. `project hydrate / attach`
5. `capability feedback loop`

That is the right path from the current state toward your target MagicBall architecture.
