# Requirements Document

## Introduction

The current `133-*` draft split moved the IDE projection line in the right direction, but each child spec still covers too much surface to qualify as an implementation-sized spec.

This program supersedes that draft with a narrower rollout plan:

- phase-1 ships only the contracts needed for the IDE `Delivery` column and engineering project open flows
- phase-2 adds scaffold and ownership extensions after phase-1 semantics are stable

## Requirements

### Requirement 1: Define One Narrow Rollout Program

**User Story:** As a program steward, I want one explicit rollout program, so that the IDE projection line advances through small, ordered specs instead of broad mixed drafts.

#### Acceptance Criteria

1. SCE SHALL define one master program spec for the IDE projection rollout
2. The program SHALL supersede the wider `133-*` planning draft without deleting it implicitly
3. The master spec SHALL list the ordered child specs and their dependency edges

### Requirement 2: Lock Phase-1 To Delivery And Engineering Envelopes

**User Story:** As a release steward, I want phase-1 limited to the minimal contracts that unblock the IDE column work, so that delivery value lands before later extension work.

#### Acceptance Criteria

1. Phase-1 SHALL contain delivery projection envelope/command work
2. Phase-1 SHALL contain engineering preview payload work
3. Phase-1 SHALL contain engineering open/import envelope work
4. Phase-1 SHALL exclude scaffold and ownership extension from the release gate

### Requirement 3: Keep Child Specs Implementation-Sized

**User Story:** As a planning steward, I want each child spec to own one bounded contract, so that SCE can treat it as direct implementation work rather than another broad portfolio.

#### Acceptance Criteria

1. Each child spec SHALL own one primary contract surface
2. Child specs SHALL avoid mixing read projection, action envelope, scaffold setup, and ownership extension in one scope
3. The program SHALL prefer dependency chaining over scope stacking

### Requirement 4: Preserve Engine-Owned Semantics

**User Story:** As an adapter author, I want the program to produce engine-owned semantics, so that the IDE does not synthesize long-lived truth.

#### Acceptance Criteria

1. The program SHALL publish semantic contracts instead of layout contracts
2. Adapter-local grouping, tabs, and pane state SHALL stay outside engine scope
3. Existing command paths SHALL be reused when possible instead of creating a parallel runtime path

### Requirement 5: Keep Clarification-First Discipline

**User Story:** As a project owner, I want the rollout plan to stay explicit about scope and deferrals, so that implementation does not restart broad mixed drafting.

#### Acceptance Criteria

1. The master spec SHALL declare which work is phase-1 and which work is phase-2
2. Every child spec SHALL name its upstream dependency when one exists
3. The rollout SHALL reject blind expansion of a child spec beyond its bounded contract
