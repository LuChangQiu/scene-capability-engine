# Requirements Document

## Introduction

This spec defines only the canonical preview payload for engineering project readiness. It does not define open/import steps, scaffold setup, or ownership extension.

## Requirements

### Requirement 1: Publish One Preview Payload

**User Story:** As an adapter, I want one preview payload for engineering project readiness, so that the project panel can show state without local synthesis.

#### Acceptance Criteria

1. SCE SHALL publish one `EngineeringProjectPreview` payload
2. The payload SHALL include source metadata, workspace metadata, readiness flags, and reason codes
3. The payload SHALL distinguish `sourceKnown` and `projectionReady`

### Requirement 2: Publish Stable Reason Codes

**User Story:** As an adapter, I want stable reason codes, so that readiness problems can be rendered without guessing text.

#### Acceptance Criteria

1. SCE SHALL publish a stable reason-code set for non-ready preview states
2. Reason codes SHALL be reusable by later engineering envelopes
3. The reason-code set SHALL stay layout-neutral

### Requirement 3: Reuse The Existing Preview Path

**User Story:** As an adapter, I want the existing preview path to return the canonical payload, so that phase-1 does not create a parallel engineering path.

#### Acceptance Criteria

1. `sce app engineering preview --app <app-id> --json` SHALL return the canonical preview payload
2. Existing app identity lookup SHALL remain compatible
3. This spec SHALL stay read-only
