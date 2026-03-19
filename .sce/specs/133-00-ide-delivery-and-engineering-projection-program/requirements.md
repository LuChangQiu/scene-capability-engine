# Requirements Document

## Introduction

Current IDE integration already consumes SCE task and app projection surfaces, but it still lacks one stable, engine-owned path for:

- a new `Delivery` column/view driven by delivery-governance truth
- engineering project preview/open flows without frontend-owned field synthesis

The immediate goal is not to solve all companion-tool needs at once. The goal is to create one phase-1 program that can deliver a stable IDE-facing projection baseline in small, verified steps.

This program absorbs the useful direction from the broad draft specs around delivery projection and project onboarding, while removing over-wide coupling so implementation can proceed without blind decomposition.

## Requirements

### Requirement 1: Define One Phase-1 Program Boundary

**User Story:** As an engine maintainer, I want one explicit program boundary for the IDE-facing projection work, so that delivery projection and engineering onboarding can evolve together without becoming one oversized implementation spec.

#### Acceptance Criteria

1. SCE SHALL define one master program spec for IDE-facing delivery and engineering projection work
2. The program SHALL split into smaller child specs with explicit responsibilities
3. The program SHALL keep multi-agent collaboration runtime work out of phase-1 unless it is required as a direct dependency

### Requirement 2: Prioritize Delivery Projection For The New IDE Column

**User Story:** As a frontend IDE integrator, I want the first phase to focus on a delivery projection read model, so that the new IDE column can land on stable engine semantics instead of frontend-owned inference.

#### Acceptance Criteria

1. Phase-1 SHALL prioritize a read-oriented delivery projection surface first
2. The first IDE-facing scope SHALL support a `Delivery` column/view backed by engine-owned semantics
3. The program SHALL avoid coupling phase-1 delivery projection to unrelated write orchestration work

### Requirement 3: Split Engineering Onboarding Into Smaller Contracts

**User Story:** As a maintainer, I want project onboarding concerns split into smaller contracts, so that preview/open semantics do not stay mixed with scaffold and ownership evolution.

#### Acceptance Criteria

1. Engineering preview/open envelope semantics SHALL be handled by a dedicated child spec
2. Scaffold and ownership extension semantics SHALL be handled by a separate child spec
3. The split SHALL reduce the breadth of the current onboarding draft into implementation-sized work packages

### Requirement 4: Keep The Program Cross-Tool And UI-Neutral

**User Story:** As an ecosystem maintainer, I want the new program to stay engine-neutral, so that IDE support does not turn SCE into a UI-specific product.

#### Acceptance Criteria

1. SCE SHALL define semantic contracts, not layout contracts
2. The program SHALL remain reusable by IDE and CLI
3. Adapter-owned concerns such as tabs, panes, cards, and local review state SHALL remain outside engine semantics

### Requirement 5: Preserve Clarification-First And No-Blind-Change Discipline

**User Story:** As a project owner, I want the new spec group to make phase ordering explicit, so that implementation does not begin from ambiguous scope or mixed responsibilities.

#### Acceptance Criteria

1. Each child spec SHALL declare its phase-1 boundary clearly
2. The master program SHALL record what is intentionally deferred
3. The program SHALL require incremental rollout and compatibility with existing SCE command surfaces
