# MagicBall App Bundle SQLite And Command Draft

## Goal

Define the first executable SCE backbone for MagicBall three-mode alignment:

- `Application Mode`
- `Ontology Mode`
- `Engineering Mode`

The backbone object is `app_bundle`.
This document provides:

1. SQLite table draft
2. naming rules
3. command draft
4. mode projection draft
5. phased implementation guidance

This draft is aligned with current SCE sqlite style in `lib/state/sce-state-store.js`:
- one shared sqlite file: `.sce/state/sce-state.sqlite`
- registry-style table names
- ISO timestamp fields
- `*_json` for extensible structured payloads
- explicit indexes for list/show hot paths

## Design Principles

1. `app_bundle` is the single truth source for mode binding.
2. Runtime / ontology / engineering identities are separated, but linked by stable IDs.
3. MagicBall should query SCE projections, not reconstruct relationships in frontend state.
4. Release version, ontology version, and code version are all first-class.
5. New tables should follow existing SCE registry naming conventions.

## Canonical Object Graph

- `app_bundle_registry`
- `runtime_release_registry`
- `runtime_installation_registry`
- `ontology_bundle_registry`
- `engineering_project_registry`
- `app_bundle_scene_binding_registry`
- `app_bundle_projection_cache_registry`

Relationship:
- one `app_bundle_registry` row binds one runtime release line, one ontology bundle, one engineering project
- one bundle can optionally expose a default scene and additional scene bindings
- one engineering project can later link into scene/spec/task governance already present in sqlite

## Recommended Table Set

### 1. app_bundle_registry

Purpose:
- top-level app identity and three-mode binding source of truth

```sql
CREATE TABLE IF NOT EXISTS app_bundle_registry (
  app_id TEXT PRIMARY KEY,
  app_key TEXT NOT NULL UNIQUE,
  app_name TEXT NOT NULL,
  app_slug TEXT,
  workspace_id TEXT,
  runtime_release_id TEXT,
  ontology_bundle_id TEXT,
  engineering_project_id TEXT,
  default_scene_id TEXT,
  environment TEXT,
  status TEXT NOT NULL,
  source_origin TEXT,
  tags_json TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_bundle_registry_status_updated
  ON app_bundle_registry(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_bundle_registry_workspace
  ON app_bundle_registry(workspace_id, updated_at DESC);
```

Suggested enums:
- `status`: `draft`, `active`, `archived`, `disabled`
- `environment`: `dev`, `test`, `staging`, `prod`

### 2. runtime_release_registry

Purpose:
- release-oriented identity shown in Application Mode

```sql
CREATE TABLE IF NOT EXISTS runtime_release_registry (
  release_id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  runtime_version TEXT NOT NULL,
  release_channel TEXT,
  release_status TEXT NOT NULL,
  entrypoint TEXT,
  runtime_status TEXT,
  release_notes_file TEXT,
  release_evidence_file TEXT,
  published_at TEXT,
  source_updated_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (app_id) REFERENCES app_bundle_registry(app_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_runtime_release_registry_app_published
  ON runtime_release_registry(app_id, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_release_registry_status
  ON runtime_release_registry(release_status, updated_at DESC);
```

Suggested enums:
- `release_status`: `draft`, `published`, `rollback`, `deprecated`
- `release_channel`: `local`, `dev`, `beta`, `prod`
- `runtime_status`: `ready`, `running`, `degraded`, `stopped`

### 3. runtime_installation_registry

Purpose:
- local/target installation state for app packages shown in Application Mode

```sql
CREATE TABLE IF NOT EXISTS runtime_installation_registry (
  installation_id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  release_id TEXT,
  machine_id TEXT,
  install_root TEXT,
  install_status TEXT NOT NULL,
  installed_at TEXT,
  last_opened_at TEXT,
  current_environment TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (app_id) REFERENCES app_bundle_registry(app_id) ON DELETE CASCADE,
  FOREIGN KEY (release_id) REFERENCES runtime_release_registry(release_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_installation_registry_app_updated
  ON runtime_installation_registry(app_id, updated_at DESC);
```

Suggested enums:
- `install_status`: `not-installed`, `installed`, `broken`, `updating`

### 4. ontology_bundle_registry

Purpose:
- ontology/capability package identity shown in Ontology Mode

```sql
CREATE TABLE IF NOT EXISTS ontology_bundle_registry (
  ontology_bundle_id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  ontology_version TEXT,
  template_version TEXT,
  capability_catalog_version TEXT,
  triad_revision TEXT,
  triad_status TEXT,
  publish_readiness TEXT,
  template_source TEXT,
  capability_set_json TEXT,
  summary_json TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (app_id) REFERENCES app_bundle_registry(app_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ontology_bundle_registry_app_updated
  ON ontology_bundle_registry(app_id, updated_at DESC);
```

Suggested enums:
- `triad_status`: `missing`, `partial`, `complete`
- `publish_readiness`: `blocked`, `draft`, `ready`, `published`

### 5. engineering_project_registry

Purpose:
- source/project control plane identity shown in Engineering Mode

```sql
CREATE TABLE IF NOT EXISTS engineering_project_registry (
  engineering_project_id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  project_key TEXT,
  project_name TEXT,
  repo_url TEXT,
  repo_provider TEXT,
  default_branch TEXT,
  current_branch TEXT,
  commit_sha TEXT,
  workspace_path TEXT,
  code_version TEXT,
  synced_runtime_release_id TEXT,
  dirty_state INTEGER NOT NULL DEFAULT 0,
  auth_policy_json TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (app_id) REFERENCES app_bundle_registry(app_id) ON DELETE CASCADE,
  FOREIGN KEY (synced_runtime_release_id) REFERENCES runtime_release_registry(release_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_engineering_project_registry_app_updated
  ON engineering_project_registry(app_id, updated_at DESC);
```

Suggested enums:
- `repo_provider`: `gitlab`, `github`, `local`, `other`
- `dirty_state`: `0|1`

### 6. app_bundle_scene_binding_registry

Purpose:
- explicit scene binding between app bundle and engineering/runtime workflows
- bridge into the existing scene/spec/task governance model

```sql
CREATE TABLE IF NOT EXISTS app_bundle_scene_binding_registry (
  app_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  binding_role TEXT NOT NULL,
  source TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (app_id, scene_id, binding_role),
  FOREIGN KEY (app_id) REFERENCES app_bundle_registry(app_id) ON DELETE CASCADE,
  FOREIGN KEY (scene_id) REFERENCES scene_registry(scene_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_app_bundle_scene_binding_registry_scene
  ON app_bundle_scene_binding_registry(scene_id, updated_at DESC);
```

Suggested enums:
- `binding_role`: `default`, `runtime-home`, `ontology-home`, `engineering-home`, `delivery-root`

### 7. app_bundle_projection_cache_registry

Purpose:
- optional cached home projection snapshots for MagicBall shells
- cache only, not source of truth

```sql
CREATE TABLE IF NOT EXISTS app_bundle_projection_cache_registry (
  app_id TEXT NOT NULL,
  projection_mode TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  source_updated_at TEXT,
  PRIMARY KEY (app_id, projection_mode),
  FOREIGN KEY (app_id) REFERENCES app_bundle_registry(app_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_app_bundle_projection_cache_registry_generated
  ON app_bundle_projection_cache_registry(generated_at DESC);
```

Suggested enums:
- `projection_mode`: `application`, `ontology`, `engineering`

## Optional Phase-2 Tables

These should not block phase-1 backbone delivery.

### app_service_catalog_registry
- remote app library entries
- downloadable app package metadata

### app_template_binding_registry
- template lineage for ontology mode
- can later connect template registry and capability build pipeline

### engineering_project_attach_registry
- attach/hydrate/activate operation history
- useful for audit and retry workflows

## Recommended ID Rules

### app bundle IDs
- `app.<slug>`
- example: `app.customer-order-demo`

### runtime release IDs
- `rel.<app-slug>.<yyyymmddhhmmss>`
- example: `rel.customer-order-demo.20260308123015`

### ontology bundle IDs
- `onto.<app-slug>.<rev>`
- example: `onto.customer-order-demo.r12`

### engineering project IDs
- `eng.<app-slug>`
- example: `eng.customer-order-demo`

Rules:
- stable IDs, never reused
- display names can change, IDs should not
- `app_key` is the frontend-stable lookup key

## Recommended Command Draft

### Bundle Registry

```bash
sce app bundle list --json
sce app bundle show --app <app-id|app-key> --json
sce app bundle register --input bundle.json --json
sce app bundle sync --app <app-id|app-key> --json
sce app bundle archive --app <app-id|app-key> --auth-lease <lease-id> --json
```

### Runtime Projection

```bash
sce app runtime show --app <app-id|app-key> --json
sce app runtime releases --app <app-id|app-key> --json
sce app runtime install --app <app-id|app-key> --source <catalog-or-bundle> --auth-lease <lease-id> --json
sce app runtime activate --app <app-id|app-key> --release <release-id> --auth-lease <lease-id> --json
```

### Ontology Projection

```bash
sce app ontology show --app <app-id|app-key> --json
sce app ontology triad --app <app-id|app-key> --json
sce app ontology bind-template --app <app-id|app-key> --template <template-id> --auth-lease <lease-id> --json
```

### Engineering Projection

```bash
sce app engineering show --app <app-id|app-key> --json
sce app engineering attach --app <app-id|app-key> --repo <repo-url> --branch <branch> --auth-lease <lease-id> --json
sce app engineering hydrate --app <app-id|app-key> --auth-lease <lease-id> --json
sce app engineering activate --app <app-id|app-key> --auth-lease <lease-id> --json
```

### Mode Home Projection

```bash
sce mode application home --app <app-id|app-key> --json
sce mode ontology home --app <app-id|app-key> --json
sce mode engineering home --app <app-id|app-key> --json
```

These are the most important frontend-facing commands.
MagicBall should use them as mode entrypoints instead of stitching data from multiple raw endpoints.

## Recommended Response Shape

All `show/home` commands should return:

- `query`
- `summary`
- `items`
- `relations`
- `view_model`
- `mb_status`

### Example: `sce mode engineering home --app app.customer-order-demo --json`

```json
{
  "mode": "engineering-home",
  "query": {
    "app_id": "app.customer-order-demo"
  },
  "summary": {
    "app_name": "Customer Order Demo",
    "runtime_version": "v0.4.2",
    "code_version": "main@7e12a8f",
    "scene_count": 4,
    "open_issues": 3
  },
  "relations": {
    "engineering_project_id": "eng.customer-order-demo",
    "ontology_bundle_id": "onto.customer-order-demo.r12",
    "runtime_release_id": "rel.customer-order-demo.20260308123015"
  },
  "view_model": {
    "primary_sections": [
      "source",
      "timeline",
      "diff",
      "delivery",
      "capability",
      "assurance"
    ],
    "default_scene_id": "scene.customer-order"
  },
  "mb_status": "active"
}
```

## Recommended Minimal Write Payload

### `bundle.json`

```json
{
  "app_id": "app.customer-order-demo",
  "app_key": "customer-order-demo",
  "app_name": "Customer Order Demo",
  "environment": "dev",
  "status": "active",
  "runtime": {
    "release_id": "rel.customer-order-demo.20260308123015",
    "runtime_version": "v0.4.2",
    "release_channel": "dev",
    "release_status": "published"
  },
  "ontology": {
    "ontology_bundle_id": "onto.customer-order-demo.r12",
    "ontology_version": "0.4.2",
    "template_version": "tpl.20260308.1",
    "triad_status": "complete",
    "publish_readiness": "ready"
  },
  "engineering": {
    "engineering_project_id": "eng.customer-order-demo",
    "repo_url": "https://git.example.com/customer-order-demo.git",
    "repo_provider": "gitlab",
    "default_branch": "main",
    "current_branch": "main",
    "commit_sha": "7e12a8f",
    "workspace_path": "E:/workspace/customer-order-demo",
    "dirty_state": false
  },
  "default_scene_id": "scene.customer-order",
  "scene_bindings": [
    {
      "scene_id": "scene.customer-order",
      "binding_role": "default"
    }
  ]
}
```

## Recommended Projection Rules

### Application Mode Projection

Should include:
- app identity
- installed release
- runtime status
- environment/channel
- entrypoint
- install/open actions

### Ontology Mode Projection

Should include:
- ontology bundle id/version
- triad completeness
- template source/version
- capability publish readiness
- ER/BR/DL summary cards

### Engineering Mode Projection

Should include:
- engineering project identity
- repo/branch/commit
- dirty state
- active scene/default scene
- links to PM objects and assurance sections

## Recommended Implementation Order

### Phase 1
- add sqlite tables:
  - `app_bundle_registry`
  - `runtime_release_registry`
  - `ontology_bundle_registry`
  - `engineering_project_registry`
  - `app_bundle_scene_binding_registry`
- add commands:
  - `sce app bundle list/show/register`
  - `sce mode application home`
  - `sce mode ontology home`
  - `sce mode engineering home`

### Phase 2
- add:
  - `runtime_installation_registry`
  - `app_bundle_projection_cache_registry`
- add commands:
  - `sce app runtime install/activate`
  - `sce app engineering attach/hydrate/activate`
  - `sce app bundle sync`

### Phase 3
- connect PM / ontology / assurance objects into mode projections
- add service library and app download path
- add capability feedback loop from scene/spec/task into ontology mode

## Minimum Acceptance Criteria

### Schema acceptance
- sqlite opens cleanly and creates all phase-1 tables in `.sce/state/sce-state.sqlite`
- foreign keys work under existing `PRAGMA foreign_keys = ON`
- `app_id` can resolve runtime/ontology/engineering rows without frontend joins

### Command acceptance
- `sce app bundle list/show/register --json` works
- all three `sce mode * home --json` commands return `view_model`
- MagicBall can open a managed app and resolve the same `app_id` into all three modes

### Governance acceptance
- all write commands support `--auth-lease`
- IDs are stable and non-reusable
- code version and runtime version can diverge and still be shown clearly

## Practical Conclusion

The next SCE implementation step should be:

1. extend `lib/state/sce-state-store.js` with the phase-1 app bundle tables
2. add `app bundle` list/show/register command handlers
3. add `mode application|ontology|engineering home` projections

That is the shortest path to make MagicBall's three-mode architecture real rather than frontend-assembled.
