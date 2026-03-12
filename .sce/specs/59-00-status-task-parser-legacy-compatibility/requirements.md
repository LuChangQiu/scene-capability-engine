# Requirements Document: Status Task Parser Legacy Compatibility

## Introduction

`sce status` previously relied on strict task parsing and direct counting over historical task plans.
Legacy task formats and oversized historical plans caused inaccurate or low-signal completion views.
Status now needs two capabilities: robust legacy parsing and marker-based completion views for archived specs.

## Requirements

### Requirement 1: Legacy Task Line Parsing
- Support task lines with leading indentation.
- Support IDs with trailing dot (e.g., `1.`).
- Support legacy labels like `**Task 3: ...**`.

### Requirement 2: Cross-Platform Line Handling
- Parser must handle CRLF files without dropping all matches.
- Claim/update/unclaim operations must work consistently for CRLF task files.

### Requirement 3: Structural Preservation
- Task claim/status updates should preserve original bullet indentation.
- Existing optional marker and claim metadata behavior should remain compatible.

### Requirement 4: Status Marker Mode
- `sce status` should support an explicit `## SCE Status Markers` section in `tasks.md`.
- When present, status progress should use marker tasks under that section for completion calculation.
- If marker section is absent, status must keep existing full-task counting behavior.

### Requirement 5: Regression Safety
- Add unit coverage for parser compatibility and indentation preservation.
- Keep status/scene/runtime and lock-related suites passing.
- Validate that all specs can be represented in consistent completion state via marker sections.
