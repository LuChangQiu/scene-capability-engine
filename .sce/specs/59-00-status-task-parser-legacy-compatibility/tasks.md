# Implementation Plan: Status Task Parser Legacy Compatibility

## Tasks

- [x] 1 Expand task line parser for legacy and nested formats
  - Added indentation-friendly task bullet parsing.
  - Added support for trailing-dot IDs and `Task N:` labels.

- [x] 2 Fix CRLF handling in task parsing/mutation flows
  - Switched task file line splitting to CRLF-safe strategy.

- [x] 3 Preserve indentation during claim/status mutations
  - Added `linePrefix` capture in parse result.
  - Reused prefix during claim, unclaim, and status update rewrites.

- [x] 4 Introduce marker-based status completion mode
  - Added optional marker section extraction in `parseTasks`.
  - Updated `status` command to prefer marker section progress when present.

- [x] 5 Normalize legacy spec completion markers and validate
  - Appended `## SCE Status Markers` sections for remaining legacy/incomplete specs.
  - Added/updated tests (`task-claimer`, `status`, `scene/runtime`, `lock`, integration) and validated all pass.
