# Design Document: Scene Doctor Task Draft Output

## Overview

Enhance doctor workflow in `lib/commands/scene.js` by adding task draft generation and output handling.

## Command Changes

- New doctor option: `--task-out <path>`
- Normalized via `normalizeDoctorOptions`.

## Core Additions

- `buildDoctorTaskDraft(report, suggestions)`
  - Renders markdown in SCE-friendly checklist format.
  - Sorts suggestions by priority (`critical`, `high`, `medium`, `low`).
- `writeDoctorTaskDraft(options, report, projectRoot, fileSystem)`
  - Resolves output path.
  - Writes task draft file when option provided.

## Flow Integration

In `runSceneDoctorCommand`:
1. Build doctor report and suggestions.
2. Write optional remediation checklist.
3. Write optional task draft.
4. Attach `task_output` path into report.

## Output Example

- [ ] 1 [high] Collect approval before commit
  - After approval workflow completes, rerun with `--approved`.
