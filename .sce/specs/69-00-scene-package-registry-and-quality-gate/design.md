# Design Document: Scene Package Registry and Quality Gate

## Overview

`scene package-registry` provides a lightweight governance layer for scene template libraries.

### Inputs
- Template root directory (default: `.sce/templates/scene-packages`)
- Optional output path (`--out`)
- Strict gate switch (`--strict`)

### Outputs
- Registry payload with:
  - template root
  - total/valid/invalid counts
  - layer counts (L1/L2/L3/Unknown)
  - template rows with coordinate, kind, layer, and issues

## Validation Model

### Template Manifest Validation
Checks:
- `apiVersion === sce.scene.template/v0.1`
- `kind === scene-package-template`
- `metadata.template_id` required
- `template.package_contract` and `template.scene_manifest` required

### Package Contract Validation
Reuses existing contract validator:
- required sections: metadata/compatibility/capabilities/parameters/artifacts/governance
- semantic checks: kind enum, semver, governance constraints

## Layer Mapping

| Package Kind | Layer |
| --- | --- |
| `scene-capability` | `l1-capability` |
| `scene-domain-profile`, `scene-policy-profile` | `l2-domain` |
| `scene-template`, `scene-instance` | `l3-instance` |
| others | `unknown` |

## CLI Surface

```bash
sce scene package-registry   --template-dir .sce/templates/scene-packages   --out .sce/reports/scene-package-registry.json   --strict   --json
```

## Test Strategy
- Validator test: `--template-dir` and `--out` guards.
- Runtime test: mixed valid/invalid templates produce correct summary and output file.
- Strict mode test: invalid templates set non-zero exit status.
