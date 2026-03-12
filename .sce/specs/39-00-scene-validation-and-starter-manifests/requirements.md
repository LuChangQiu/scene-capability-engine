# Requirements Document: Scene Validation and Starter Manifests

## Introduction

After adding `sce scene run`, operators still need a safe preflight entry and reusable starter manifests.
This spec adds a dedicated validate command and starter scene templates for ERP-only and ERP+robot hybrid planning.

## Requirements

### Requirement 1: Scene Manifest Validation Entry
- Provide `sce scene validate` as a first-class CLI command.
- Support `--spec` and `--manifest` source modes.
- Return non-zero exit semantics for invalid source options or invalid manifests.

### Requirement 2: Validation Summary Output
- Produce concise validation summary for scene identity, domain, governance risk, and binding profile.
- Support machine-readable output via `--json`.

### Requirement 3: Starter Manifest Assets
- Provide at least one valid ERP starter scene manifest.
- Provide at least one valid hybrid starter scene manifest (dry-run planning oriented).
- Keep starter manifests aligned with scene contract v0.2 core fields.

### Requirement 4: Regression Coverage
- Add/extend unit tests for `scene validate` option handling and failure behavior.
- Keep runtime command tests green after integration.
