# MagicBall CLI Invocation Examples

## Goal

Provide copy-ready invocation examples for the most common MagicBall -> SCE integration flows.

This document is optimized for frontend integration, local debugging, and CLI smoke verification.
It is not the main source of architecture or product policy.

Use this together with:
- `docs/magicball-ui-surface-checklist.md`
- `docs/magicball-frontend-state-and-command-mapping.md`
- `docs/magicball-write-auth-adaptation-guide.md`

## Conventions

Assume:
- `app_key = customer-order-demo`
- current workspace already uses the intended project root
- all commands request machine-readable JSON via `--json`

## 1. Workspace Bootstrap

### 1.0 Read multi-project portfolio baseline
```bash
sce project portfolio show --json
sce project target resolve --request "continue customer-order-demo" --json
sce project supervision show --project workspace:customer-order-demo --json
```

Expected use:
- build project switcher from engine-owned roster
- preflight cross-project free-text routing before assistant/orchestration actions
- render one project-scoped health summary without replaying raw event streams

### 1.1 Read current device baseline
```bash
sce device current --json
sce device override show --json
sce app collection list --json
sce app collection show --collection sales-workbench --json
sce app collection apply --collection sales-workbench --json
sce scene workspace list --json
sce scene workspace show --workspace sales --json
sce scene workspace apply --workspace sales --json
sce app install-state list --json
```

Expected use:
- cache current device id / tags
- load file-backed shared app collection intent
- load file-backed shared scene workspace intent
- render cross-app local install baseline before scene-oriented collection flows arrive

Optional local override input:
- `.sce/state/device/device-override.json`
- use this for per-device add/remove exceptions instead of mutating shared collection/workspace definitions
- update it explicitly via `sce device override upsert --input <json> --json`
- copy-ready collection/workspace examples live under `docs/examples/app-intent-phase1/.sce/app/...`

Example local override patch:
```json
{
  "removed_apps": ["crm"],
  "added_apps": [
    {
      "app_key": "notes",
      "required": false
    }
  ],
  "metadata": {
    "reason": "tablet kiosk profile"
  }
}
```

### 1.2 App bundle identity
```bash
sce app bundle show --app customer-order-demo --json
```

Expected use:
- cache `app_id`
- cache `app_key`
- cache app-level bundle bindings

### 1.3 Serialized mode-home bootstrap
Run in this order only:

```bash
sce mode application home --app customer-order-demo --json
sce mode ontology home --app customer-order-demo --json
sce mode engineering home --app customer-order-demo --json
sce scene delivery show --scene scene.customer-order-demo --json
sce app engineering preview --app customer-order-demo --json
sce app engineering ownership --app customer-order-demo --json
```

Recommended frontend rule:
- do not parallelize these six calls during current verification window

## 2. Application Mode Examples

### 2.1 Read application home
```bash
sce mode application home --app customer-order-demo --json
```

Typical fields MagicBall cares about:
- `summary.app_name`
- `summary.runtime_version`
- `summary.install_status`
- `summary.installed_release_id`
- `summary.active_release_id`
- `summary.release_count`
- `view_model.current_release`

### 2.2 Read runtime releases
```bash
sce app runtime releases --app customer-order-demo --json
```

### 2.3 Install a release
```bash
sce app runtime install --app customer-order-demo --release rel-2026-03 --json
```

### 2.4 Activate a release
```bash
sce app runtime activate --app customer-order-demo --release rel-2026-03 --json
```

### 2.5 Uninstall a non-active installed release
```bash
sce app runtime uninstall --app customer-order-demo --release rel-2026-03 --json
```

## 3. Ontology Mode Examples

### 3.1 Read ontology home
```bash
sce mode ontology home --app customer-order-demo --json
```

### 3.2 Read triad summary
```bash
sce ontology triad summary --json
```

### 3.3 Read ER / BR / DL tables
```bash
sce ontology er list --json
sce ontology br list --json
sce ontology dl list --json
```

### 3.4 Read starter-seed preview
```bash
sce ontology seed show --profile customer-order-demo --json
```

### 3.5 Apply starter seed
```bash
sce ontology seed apply --profile customer-order-demo --json
```

### 3.6 Refresh chain after successful seed apply
Run in this order:

```bash
sce mode ontology home --app customer-order-demo --json
sce ontology triad summary --json
sce ontology er list --json
sce ontology br list --json
sce ontology dl list --json
```

## 4. Engineering Mode Examples

### 4.1 Read engineering home
```bash
sce mode engineering home --app customer-order-demo --json
```

### 4.2 Read PM tabs
```bash
sce pm requirement list --json
sce pm tracking board --json
sce pm planning board --json
sce pm change list --json
sce pm issue board --json
```

### 4.3 Read assurance tabs
```bash
sce assurance resource status --json
sce assurance logs views --json
sce assurance backup list --json
sce assurance config switches --json
```

### 4.4 Read engineering delivery projection
```bash
sce scene delivery show --scene scene.customer-order-demo --json
```

### 4.5 Read engineering project readiness preview
```bash
sce app engineering preview --app customer-order-demo --json
```

### 4.6 Read engineering ownership relation
```bash
sce app engineering ownership --app customer-order-demo --json
```

### 4.7 Read canonical open/import envelopes
```bash
sce app engineering open --app customer-order-demo --json
sce app engineering import --app customer-order-demo --json
```

### 4.8 Mutate engineering workspace bindings
```bash
sce app engineering attach --app customer-order-demo --repo <repo-url> --branch main --json
sce app engineering hydrate --app customer-order-demo --json
sce app engineering scaffold --app customer-order-demo --overwrite-policy missing-only --json
sce app engineering activate --app customer-order-demo --json
```

## 5. Write Authorization Examples

### 5.1 Inspect current authorization status
```bash
sce auth status --json
```

### 5.2 Grant lease for PM editing
```bash
sce auth grant --scope pm:requirement:upsert --reason "edit requirement from MagicBall" --json
```

### 5.3 Grant lease for ontology editing
```bash
sce auth grant --scope ontology:er:upsert,ontology:br:upsert,ontology:dl:upsert --reason "edit ontology from MagicBall" --json
```

### 5.4 Use returned lease on a write command
```bash
sce pm requirement upsert --input requirement.json --auth-lease <lease-id> --json
```

### 5.5 Re-check a lease
```bash
sce auth status --lease <lease-id> --json
```

### 5.6 Revoke a lease
```bash
sce auth revoke --lease <lease-id> --json
```

## 6. PM Write Examples

### 6.1 Requirement upsert
```bash
sce pm requirement upsert --input requirement.json --json
```

Example `requirement.json`:
```json
{
  "requirement_id": "REQ-UI-001",
  "title": "Render requirement list in engineering mode",
  "source_request": "MagicBall engineering tab integration",
  "status": "draft",
  "priority": "P1"
}
```

### 6.2 Tracking upsert
```bash
sce pm tracking upsert --input tracking.json --json
```

Example `tracking.json`:
```json
{
  "tracking_id": "TRK-UI-001",
  "requirement_id": "REQ-UI-001",
  "current_stage": "clarifying",
  "status": "normal",
  "next_action": "Wire engineering tracking tab"
}
```

### 6.3 Issue upsert
```bash
sce pm issue upsert --input issue.json --json
```

Example `issue.json`:
```json
{
  "issue_id": "BUG-UI-001",
  "title": "Engineering issue tab does not refresh",
  "source": "review",
  "severity": "medium",
  "status": "new"
}
```

## 7. Task Feedback And Timeline Examples

### 7.1 Read task feedback for a job
```bash
sce studio events --job <job-id> --json
```

MagicBall should prefer:
- `task.feedback_model`
- `task.mb_status`
- raw `event[]` only in advanced/audit mode

### 7.2 Read timeline list
```bash
sce timeline list --limit 20 --json
```

### 7.3 Read timeline detail
```bash
sce timeline show <snapshot-id> --json
```

## 8. Suggested Frontend Wrapper Pattern

### 8.1 Node/Electron shell wrapper
```ts
async function runSceJson(args: string[]) {
  const result = await invokeShell(['sce', ...args]);
  if (result.exitCode !== 0) {
    throw {
      command: ['sce', ...args].join(' '),
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      retryable: true
    };
  }
  return JSON.parse(result.stdout);
}
```

### 8.2 Serialized workspace bootstrap wrapper
```ts
async function loadWorkspace(appKey: string) {
  const projectPortfolio = await runSceJson(['project', 'portfolio', 'show', '--json']);
  const appBundle = await runSceJson(['app', 'bundle', 'show', '--app', appKey, '--json']);
  const applicationHome = await runSceJson(['mode', 'application', 'home', '--app', appKey, '--json']);
  const ontologyHome = await runSceJson(['mode', 'ontology', 'home', '--app', appKey, '--json']);
  const engineeringHome = await runSceJson(['mode', 'engineering', 'home', '--app', appKey, '--json']);
  const engineeringDetail = await runSceJson(['app', 'engineering', 'show', '--app', appKey, '--json']);

  return {
    projectPortfolio,
    appBundle,
    applicationHome,
    ontologyHome,
    engineeringHome,
    engineeringDetail
  };
}
```

## 9. Failure Logging Pattern

When a command fails, MagicBall should preserve:
- command string
- exit code
- stderr
- stdout if any
- page/section where failure happened
- retry action name

Suggested error bundle:

```json
{
  "command": "sce mode ontology home --app customer-order-demo --json",
  "page": "ontology",
  "section": "summary",
  "exit_code": 1,
  "stderr": "database is locked",
  "retryable": true
}
```

## 10. Recommended Smoke Flow For Local Integration

Run this full sequence when verifying MagicBall local integration:

```bash
sce project portfolio show --json
sce project target resolve --request "continue customer-order-demo" --json
sce project supervision show --project workspace:customer-order-demo --json
sce app bundle show --app customer-order-demo --json
sce mode application home --app customer-order-demo --json
sce mode ontology home --app customer-order-demo --json
sce mode engineering home --app customer-order-demo --json
sce scene delivery show --scene scene.customer-order-demo --json
sce app engineering preview --app customer-order-demo --json
sce app engineering ownership --app customer-order-demo --json
sce ontology triad summary --json
sce pm requirement list --json
sce assurance resource status --json
sce auth status --json
```

If ontology is empty and product wants starter data:

```bash
sce ontology seed show --profile customer-order-demo --json
sce ontology seed apply --profile customer-order-demo --json
sce mode ontology home --app customer-order-demo --json
sce ontology triad summary --json
sce ontology er list --json
sce ontology br list --json
sce ontology dl list --json
```
