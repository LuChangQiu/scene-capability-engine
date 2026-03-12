# Requirements Document: Scene Catalog Discovery and Routing

## Introduction

SCE already supports scene validate/doctor/run/eval workflows, but users still lack one command to discover
which scene manifests exist across specs and route to the right scene entrypoint quickly.

## Requirements

### Requirement 1: Catalog Command Coverage
- Add a `scene catalog` command under the existing `scene` command group.
- Command should scan `.sce/specs` and discover scene manifests per spec.
- Command should support single-spec scan via `--spec`.

### Requirement 2: Structured Catalog Payload
- Output should include machine-readable summary metadata and scene entry list.
- Each entry should include spec name, manifest path, kind, scene reference/version, domain, and validity.
- Payload should include counts for scanned specs, discovered manifests, valid entries, and invalid entries.

### Requirement 3: Filter and Export Controls
- Command should support domain and kind filtering.
- Command should support JSON output mode and optional `--out` JSON file export.
- Human-readable summary should remain available when `--json` is not used.

### Requirement 4: Invalid Manifest Visibility
- By default, invalid manifests should be excluded from returned entries.
- `--include-invalid` should include invalid/missing manifests with error details.
- Missing manifest specs should be reflected in catalog summary counters.

### Requirement 5: Regression Safety
- Add/extend unit tests for option validation and catalog command behavior.
- Existing scene command test suite should remain green.
- Validate CLI exposure for `scene catalog` help output.
