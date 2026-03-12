# Requirements Document: Scene Eval Spec Task Sync

## Introduction

`scene eval` can now compute recommendations from runtime results and feedback templates.
To make that output actionable in the SCE workflow, evaluation recommendations should be
synchronized into spec `tasks.md` directly, with trace metadata and duplicate protection.

## Requirements

### Requirement 1: Eval Task Sync Command Options
- Add eval options for target spec selection and sync toggle.
- `--sync-spec-tasks` must require `--spec`.
- Keep eval behavior unchanged when sync is not enabled.

### Requirement 2: Recommendation-to-Task Mapping
- Convert `overall.recommendations` into top-level task entries.
- Include metadata tags for provenance (`eval_source`, `trace_id`, `scene_ref`).
- Keep deterministic task numbering based on existing max task id.

### Requirement 3: Duplicate and Empty Handling
- Skip recommendations already present in tasks.
- Return `added_count=0` with explicit skip reason when no recommendations are available
  or all recommendations are duplicates.

### Requirement 4: Reporting
- Include `task_sync` block in eval report when sync is enabled.
- Show task sync summary in non-JSON eval output.

### Requirement 5: Regression Coverage
- Extend unit tests for eval validation and task sync behavior.
- Keep existing scene command and runtime pilot test suites green.
- Verify `scene eval --help` reflects new options.
