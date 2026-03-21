# Requirements Document

## Introduction

Once the external runtime can read canonical tool and session semantics, the next bounded contract is write safety.

This spec defines how write-capable runtime actions must respect lease, scope, and project routing.

## Requirements

### Requirement 1: Enforce Lease-Aware Write Guard

**User Story:** As SCE, I want all external runtime writes to pass the same lease checks, so that external runtime support does not weaken governance.

#### Acceptance Criteria

1. Write-capable tools SHALL require auth lease validation
2. Write-capable tools SHALL require scope-aware validation
3. Rejections SHALL return canonical blocked semantics

### Requirement 2: Require Canonical Project Routing

**User Story:** As a runtime, I want canonical project routing, so that I do not write into the wrong project in multi-project mode.

#### Acceptance Criteria

1. Runtime write flows SHALL support caller context and target resolution
2. Responses SHALL echo resolved, ambiguous, or unresolved project status
3. Project routing SHALL remain engine-owned rather than adapter-guessed
