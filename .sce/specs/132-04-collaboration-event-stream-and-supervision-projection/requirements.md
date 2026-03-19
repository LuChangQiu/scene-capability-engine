# Requirements Document

## Introduction

The project-level collaboration model must eventually show up as a stable supervision projection rather than fragmented local logs. SCE should therefore extend scene-spec-task-event with collaboration-aware events and projections.

## Requirements

### Requirement 1: Collaboration-Aware Event Contract

**User Story:** As an adapter, I want collaboration events in the same semantic chain as task execution, so that supervision stays aligned with scene/spec/task/event rather than drifting into a separate chat log model.

#### Acceptance Criteria

1. SCE SHALL extend event semantics to cover collaboration and supervision events
2. Event kinds SHALL cover at least lease granted/released, handoff created/accepted/completed, scheduler blocked/waiting, implementation runtime bound, merge state changed
3. Collaboration events SHALL preserve scene/spec/task identity whenever available

### Requirement 2: Supervision Projection

**User Story:** As an IDE or CLI adapter, I want one collaboration supervision projection, so that I can present recent project-level collaboration state without replaying all raw events locally.

#### Acceptance Criteria

1. SCE SHALL provide a supervision projection derived from collaboration-aware events
2. The projection SHALL include recent status summaries, actor/session context, and linked scene/spec/task scope
3. The projection SHALL be consumable incrementally
4. The projection SHALL remain reusable by IDE and CLI

### Requirement 3: Adapter-Neutral Summaries

**User Story:** As an adapter maintainer, I want semantic summaries rather than layout fragments, so that different tools can render the same collaboration truth in different ways.

#### Acceptance Criteria

1. SCE SHALL publish semantic summaries instead of UI fragments
2. SCE SHALL NOT assume card layout, split panes, or tab names
3. SCE SHALL document how supervision projection relates to raw event history
