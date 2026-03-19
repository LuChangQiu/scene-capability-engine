# Requirements Document

## Introduction

This spec defines only the scaffold result contract for engineering project bootstrap work. It stays outside phase-1 so that setup behavior does not widen the first IDE-facing release.

## Requirements

### Requirement 1: Publish One Scaffold Result

**User Story:** As an adapter, I want one scaffold result contract, so that setup feedback is stable and idempotent.

#### Acceptance Criteria

1. SCE SHALL publish one `EngineeringProjectScaffoldResult` contract
2. The result SHALL include `workspacePath`
3. The result SHALL include created, skipped, and failed counts
4. The overwrite policy SHALL be explicit

### Requirement 2: Keep Scaffold Idempotent

**User Story:** As an adapter, I want scaffold behavior to report idempotent outcomes, so that repeated setup does not look like silent drift.

#### Acceptance Criteria

1. Running scaffold again SHALL report skipped work explicitly when nothing new is created
2. Failed work SHALL remain explicit
3. This spec SHALL not redefine preview or open/import semantics

### Requirement 3: Stay Deferred From Phase-1

**User Story:** As a release steward, I want scaffold work deferred from phase-1, so that setup behavior does not block the first projection release.

#### Acceptance Criteria

1. This spec SHALL depend on stable engineering open/import semantics
2. Scaffold work SHALL remain phase-2
3. No adapter-owned scaffold registry SHALL be introduced
