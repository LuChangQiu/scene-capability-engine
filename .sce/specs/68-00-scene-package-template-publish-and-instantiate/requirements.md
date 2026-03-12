# Requirements Document: Scene Package Template Publish and Instantiate

## Introduction

Spec 67 established package contract declaration and validation. The next closure step is a reusable package lifecycle:
publish a proven scene/spec into a template library, then instantiate that template into a new target spec with parameter
resolution and traceable output artifacts.

## Requirements

### Requirement 1: Scene Package Publish Command
- Add `scene package-publish` command to publish template assets from a source spec.
- Publish should read and validate `custom/scene-package.json` and `custom/scene.yaml` by default.
- Publish should output a deterministic template directory with overwrite guard and JSON summary mode.

### Requirement 2: Scene Package Template Manifest
- Publish should generate `template.manifest.json` using `sce.scene.template/v0.1`.
- Template manifest should declare template id, source spec, package coordinate, parameter schema, and artifact pointers.
- Template manifest should preserve compatibility and entry scene metadata for downstream instantiate flows.

### Requirement 3: Scene Package Instantiate Command
- Add `scene package-instantiate` command to instantiate target spec from template manifest.
- Instantiate should resolve parameter values with required/default semantics.
- Instantiate should render scene manifest placeholders and emit package contract into target spec.

### Requirement 4: CLI Observability and Failure Safety
- Publish/instantiate should support JSON outputs for automation.
- Human-readable mode should print template id, source/target paths, and overwrite status.
- Invalid contract, invalid template manifest, and missing required parameters should fail with non-zero exit code.

### Requirement 5: Regression and Traceability
- Extend scene unit tests for publish/instantiate option guards and runtime behavior.
- Keep scene command suite and full project regression suite green.
- Store smoke run samples in spec report artifacts for audit and reuse.
