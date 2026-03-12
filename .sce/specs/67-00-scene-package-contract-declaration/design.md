# Design Document: Scene Package Contract Declaration

## Overview

Introduce a package contract layer for scene/spec assets so a mature scene can be promoted to reusable template
artifact. The layer includes two CLI commands: one for contract generation and one for strict validation.

## Command Surface

- `sce scene package-template`
  - `--spec <spec-name>`
  - `--out <path>`
  - `--kind <kind>`
  - `--group <group>`
  - `--name <name>`
  - `--version <version>`
  - `--force`
  - `--json`

- `sce scene package-validate`
  - `--spec <spec-name>` or `--package <path>`
  - `--spec-package <relative-path>`
  - `--json`

## Contract Model

```json
{
  "apiVersion": "sce.scene.package/v0.1",
  "kind": "scene-template",
  "metadata": {
    "group": "sce.scene",
    "name": "erp-order-query",
    "version": "0.1.0"
  },
  "compatibility": {
    "min_sce_version": ">=1.24.0",
    "scene_api_version": "sce.scene/v0.2"
  },
  "capabilities": {
    "provides": ["scene.erp.query.readonly"],
    "requires": ["binding:http"]
  },
  "parameters": [],
  "artifacts": {
    "entry_scene": "custom/scene.yaml",
    "generates": ["requirements.md", "design.md", "tasks.md", "custom/scene.yaml"]
  },
  "governance": {
    "risk_level": "low",
    "approval_required": false,
    "rollback_supported": true
  }
}
```

## Validation Strategy

- Structural checks: required objects/arrays/fields.
- Semantic checks: semver format, kind enum, risk level enum, boolean fields.
- Summary extraction: coordinate, kind, parameter count, capability counts.

## Test Strategy

- Option validation tests for package-template/package-validate.
- Command tests for package generation and invalid contract detection.
- Run focused scene suite + full regression suite.
