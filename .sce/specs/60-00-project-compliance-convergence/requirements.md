# Requirements Document: Project Compliance Convergence

## Introduction

After runtime and lock capability expansion, project artifacts drifted from governance rules.
We need a final convergence pass so status, spec progress, and document lifecycle compliance
all remain green under `sce status` and `sce doctor --docs`.

## Requirements

### Requirement 1: Root Document Compliance
- Root markdown files must match governance allowlist.
- Non-allowlisted root documents must be relocated to compliant documentation paths.

### Requirement 2: Spec Artifact Placement Compliance
- Spec markdown artifacts outside required files (`requirements.md`, `design.md`, `tasks.md`) must be
  moved under allowed subdirectories (`reports`, `scripts`, `custom`).
- Non-standard spec subdirectories must be normalized into allowed subdirectories.

### Requirement 3: Lock Hygiene
- Active lock artifacts should not remain as stale compliance violations after completion.
- Lock status should be clear and report no unexpected lock leftovers.

### Requirement 4: Status Convergence
- All specs must report complete task progress in `sce status`.
- Status output and document compliance output must both be green.

### Requirement 5: Verification
- Run document governance diagnostics and status verification.
- Run test validation for status/task parser changes introduced during convergence.
