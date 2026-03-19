# Requirements Document

## Introduction

Multiple agents on the same project do not just run in parallel. They also wait, review, hand off, and resume. SCE needs one scheduler and handoff contract that can drive those relationships across tools.

## Requirements

### Requirement 1: Project-Level Scheduler Contract

**User Story:** As an adapter, I want one project-level scheduler result, so that I can show who is running, queued, blocked, or waiting without using tool-local queue logic as truth.

#### Acceptance Criteria

1. SCE SHALL provide a project-level scheduler projection
2. The scheduler SHALL expose active, queued, blocked, and waiting items
3. The scheduler SHALL preserve relationships to scene/spec/task identities
4. The scheduler SHALL expose dependency or wait reason semantics

### Requirement 2: Handoff Contract

**User Story:** As collaborating agents, we want one handoff contract, so that review, transfer, and dependency handoff are machine-readable and traceable.

#### Acceptance Criteria

1. SCE SHALL provide a canonical handoff contract
2. A handoff SHALL include at least source session, target session or target scope, source scope, target scope, status, summary, required action
3. Handoff status SHALL cover at least `pending`, `accepted`, `blocked`, `completed`, `rejected`
4. Handoff payloads SHALL be tool-neutral and reusable in IDE and CLI

### Requirement 3: Collaboration Reason Codes

**User Story:** As a supervising user, I want stable reason codes for waiting or blocked collaboration, so that tools stop guessing why one agent depends on another.

#### Acceptance Criteria

1. SCE SHALL publish stable reason codes for scheduler waiting and blocking states
2. Reason codes SHALL distinguish dependency wait, lease conflict, review required, merge pending, runtime unavailable, and upstream capability missing
3. Reason codes SHALL be present in scheduler and handoff payloads where relevant
