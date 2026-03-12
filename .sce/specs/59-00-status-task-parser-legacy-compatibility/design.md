# Design Document: Status Task Parser Legacy Compatibility

## Overview

Enhance task parsing and status aggregation so historical specs can be measured accurately without
rewriting old implementation plans.

## Parser Changes

- Task line regex accepts leading indentation before `- [ ]` markers.
- Task ID extraction supports:
  - numeric IDs with optional trailing dot (`1.` / `2.1`)
  - legacy `Task N:` labels (including bold wrappers)
- Line splitting uses CRLF-safe regex (`/\r?\n/`).

## Mutation Safety

Each parsed task carries a `linePrefix` (indent + bullet prefix).
Mutation flows reuse `linePrefix` in:
- `claimTask`
- `unclaimTask`
- `updateTaskStatus`

This preserves nested structure and formatting after task state updates.

## Status Marker Mode

`TaskClaimer.parseTasks(tasksPath, { preferStatusMarkers: true })` now supports marker-mode extraction:
- Detect `## SCE Status Markers` section.
- Return only tasks in that section when markers exist.
- Fallback to full parsed task list when marker section is absent.

`status` command now opts into marker mode, allowing legacy specs to publish maintained status markers
while preserving historical task plans for traceability.

## Validation Strategy

- Add `TaskClaimer` tests for legacy parsing and nested indentation preservation.
- Re-run status command tests and scene/runtime core suites.
- Re-run lock unit/integration suites after parser signature update.
- Verify `sce status` shows 100% for all specs with marker-based completion sections.
