# Design Document: Scene Package Gate Task Draft and Sync

## Overview

Add a task-closing layer to `scene package-gate`:

1. Task Draft
   - Build markdown from failed checks.
   - Save via `--task-out`.
2. Spec Task Sync
   - Convert failed checks to actionable task lines.
   - Append to `.sce/specs/<spec>/tasks.md` with dedupe.

## Command Surface Extension

```bash
sce scene package-gate   --registry .sce/reports/scene-package-registry.json   --policy .sce/templates/scene-package-gate-policy.json   --spec 71-00-scene-package-gate-task-draft-and-sync   --task-out .sce/reports/scene-package-gate-task-draft.md   --sync-spec-tasks   --json
```

## Task Synthesis Model

- Failed check -> task title:
  - `Resolve gate check '<check_id>' (actual=<actual>, expected=<expected>)`
- Priority mapping:
  - `max-invalid-templates`, `unknown-layer-forbidden` -> `high`
  - `required-layer:*`, `min-valid-templates` -> `medium`
- Task metadata suffix:
  - `gate_source=scene-package-gate`
  - `check_id=<check_id>`
  - `policy_profile=<profile>`

## Sync Workflow

1. Load target `tasks.md`.
2. Parse existing checklist titles and max task id.
3. Skip duplicates by normalized title.
4. Append new section with generated tasks.

## Output Model

Gate payload now includes:
- `task_draft`:
  - output path
  - failed check count
- `task_sync`:
  - added count
  - duplicate skip count
  - added task list

## Test Strategy

- Validation test for `--sync-spec-tasks` requiring `--spec`.
- Runtime test for gate task draft + sync path.
- Preserve strict-mode non-zero semantics.
