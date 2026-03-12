# Requirements Document: Scene Scaffold Command

## Introduction

After introducing scene runtime and validation commands, teams still need a fast way to bootstrap scene manifests
inside a target spec. This spec adds a scaffold command to create or preview starter manifests with safe defaults.

## Requirements

### Requirement 1: Scene Scaffold CLI
- Provide `sce scene scaffold` command.
- Require target spec via `--spec`.
- Support starter type selection via `--type erp|hybrid`.
- Support custom template override via `--template`.

### Requirement 2: Safe Output Control
- Write manifest into target spec path using `--output` (default `custom/scene.yaml`).
- Refuse overwriting existing output unless `--force` is explicitly provided.
- Support `--dry-run` preview mode without writing files.

### Requirement 3: Metadata Override
- Allow metadata overrides for `metadata.obj_id` and `metadata.title`.
- Keep generated manifest schema-valid with scene contract rules.

### Requirement 4: Built-In Starter Templates
- Provide built-in starter templates for ERP and hybrid domains under runtime library assets.
- Ensure templates are directly reusable by scaffold command.

### Requirement 5: Test and CLI Verification
- Add command unit tests for scaffold success/failure paths.
- Verify command help and dry-run execution from CLI.
