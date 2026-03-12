# Requirements Document: Scene Doctor Spec Task Sync

## Introduction

`scene doctor` now outputs suggestions and optional markdown artifacts.
To complete the diagnose-to-execute loop, teams need a direct path to inject actionable suggestions into spec task backlog.
This spec adds doctor-driven task sync into target spec `tasks.md`.

## Requirements

### Requirement 1: Task Sync Option
- Add `--sync-spec-tasks` option to `sce scene doctor`.
- Option must work only when doctor source uses `--spec`.

### Requirement 2: Actionable Suggestion Filtering
- Sync only actionable suggestions (exclude informational `ready-to-run`).
- Preserve suggestion priority labels in generated task lines.

### Requirement 3: tasks.md Append Strategy
- Read target `tasks.md` from current spec.
- Append generated tasks under a timestamped section header.
- Continue task numbering from existing max top-level task id.
- Skip duplicate task titles already present in file.

### Requirement 4: Report and UX Integration
- Include task sync result payload in doctor JSON report.
- Show task sync summary in non-JSON doctor output.
- Keep behavior non-destructive when no actionable suggestions are available.

### Requirement 5: Regression Coverage
- Extend tests for validation (`--sync-spec-tasks` without `--spec`) and successful sync append flow.
- Keep scene runtime and command suites green.
