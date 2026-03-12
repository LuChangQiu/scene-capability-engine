# Requirements Document: Scene Package Contract Declaration

## Introduction

SCE scene runtime now supports route tuning and rollout closure. To make scene assets reusable across projects, each
scene/spec needs a package-level contract declaration with compatibility, capability, parameter, and governance
metadata.

## Requirements

### Requirement 1: Scene Package Contract Template Command
- Add `scene package-template` command to generate package contract JSON.
- Command should support spec-scoped output and global template output.
- Command should support package kind/group/name/version declarations with overwrite guard.

### Requirement 2: Scene Package Contract Validation Command
- Add `scene package-validate` command to validate package contract JSON from spec or file path.
- Validation should return actionable errors for required fields and type constraints.
- Validation payload should include package coordinate and summary counters.

### Requirement 3: Contract Schema Coverage
- Contract schema should include apiVersion, kind, metadata, compatibility, capabilities, parameters, artifacts, and governance.
- Schema should enforce semantic version format and risk level constraints.
- Schema should support scene-template and scene-kind variants for future asset cataloging.

### Requirement 4: CLI Observability and Interop
- Template and validate commands should support JSON output for automation.
- Human-readable summary should include package coordinate and validation status.
- Output paths should be explicit to preserve traceability in spec reports.

### Requirement 5: Regression Safety
- Extend scene command unit tests for package template/validate options and execution behavior.
- Keep scene command suite and full project tests passing.
- Keep document compliance and project status healthy.
