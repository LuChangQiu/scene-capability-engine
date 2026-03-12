# Requirements Document: Scene Package Registry and Quality Gate

## Introduction

With publish/instantiate lifecycle in place, SCE needs a template library control plane to make template assets discoverable,
auditable, and layer-aware. This spec adds a registry command that indexes published scene packages and enforces baseline
quality visibility before reuse.

## Requirements

### Requirement 1: Template Registry Command
- Add `scene package-registry` command to scan template library directories.
- Command should detect template folders by `template.manifest.json` and `scene-package.json` presence.
- Command should support JSON output and optional output file persistence.

### Requirement 2: Registry Validation and Diagnostics
- Registry generation should validate template manifest schema (`sce.scene.template/v0.1`).
- Registry generation should validate package contract schema (`sce.scene.package/v0.1`).
- Registry payload should include per-template `valid` status and actionable issue list.

### Requirement 3: Three-Layer Classification
- Registry should classify template kind into layer dimensions:
  - L1 capability
  - L2 domain
  - L3 instance
- Registry summary should include layer counts for governance analytics.
- Unknown kind should be preserved with explicit `unknown` layer.

### Requirement 4: Strict Gate Option
- Add `--strict` option to mark command failure when invalid templates exist.
- Strict mode should still emit registry payload for diagnostics.
- Strict mode should support CI usage via non-zero exit code contract.

### Requirement 5: Regression and Traceability
- Extend scene command tests for registry option validation and runtime behavior.
- Keep scene suite and full regression tests passing.
- Store registry smoke outputs under spec reports for reusable evidence.
