# Requirements Document

## Introduction

This Spec fixes npm package runtime asset omissions that make published SCE tarballs non-executable after installation. The immediate failure observed in `3.6.44` and `3.6.45` is a missing `scripts/git-managed-gate.js`, but the underlying problem is broader: runtime CLI code and release flows rely on the root `scripts/` directory while the published package does not include it.

## Glossary

- **Runtime Asset**: A file required by the installed npm package at runtime
- **Pack Dry Run**: `npm pack --json --dry-run`, used to inspect the publish payload before release
- **Package Runtime Asset Gate**: A validation step that checks whether runtime assets are present in the pack output

## Requirements

### Requirement 1: Publish Required Runtime Scripts

**User Story:** As an installed SCE user, I want the npm package to contain every runtime script that the CLI invokes or requires, so that the package works after installation.

#### Acceptance Criteria

1. THE published npm package SHALL include the root `scripts/` directory
2. WHEN CLI/runtime code depends on `scripts/*.js`, THEN those files SHALL be present in the published package
3. THE published package SHALL remain installable without relying on repository-only files outside the tarball

### Requirement 2: Prevent Future Runtime Asset Drift

**User Story:** As a maintainer, I want release automation to detect missing runtime assets before publish, so that broken npm versions are blocked.

#### Acceptance Criteria

1. THE repository SHALL provide a runtime asset validation script based on `npm pack --json --dry-run`
2. THE validation SHALL report missing runtime scripts as violations
3. THE validation SHALL exit non-zero in blocking mode when runtime assets are missing
4. THE release/publish path SHALL execute this validation before publish

### Requirement 3: Regression Coverage

**User Story:** As a maintainer, I want automated coverage for this packaging defect, so that it does not silently regress.

#### Acceptance Criteria

1. THE capability SHALL include unit tests for the runtime asset validation logic
2. THE capability SHALL verify that script discovery and pack payload comparison behave correctly
3. THE capability SHALL be documented via spec artifacts and release notes
