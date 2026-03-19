# Requirements Document

## Introduction

IDE and CLI already have low-level engineering commands, but they still lack one canonical preview and open/import result contract. This spec focuses only on that narrower concern and excludes scaffold and ownership extension work.

## Requirements

### Requirement 1: Provide Canonical Engineering Project Preview

**User Story:** As an IDE or CLI adapter, I want one canonical engineering project preview payload, so that I can show project readiness without client-side field synthesis.

#### Acceptance Criteria

1. SCE SHALL define one canonical engineering project preview payload
2. The preview SHALL include source metadata, workspace metadata, readiness flags, and reason codes
3. The preview SHALL distinguish `sourceKnown` and `projectionReady`

### Requirement 2: Provide Canonical Open/Import Result Envelope

**User Story:** As an adapter, I want one canonical result envelope for open/import flows, so that I can show what happened without inferring meaning from command order.

#### Acceptance Criteria

1. SCE SHALL define one canonical result envelope for engineering `open` and `import` flows
2. The envelope SHALL include ordered step results for `register`, `attach`, `hydrate`, and `activate` when applicable
3. Each step SHALL expose a stable status enum and reason code

### Requirement 3: Publish Readiness Reason Codes

**User Story:** As a supervising user, I want canonical readiness reason codes, so that tools stop guessing why a project is not ready.

#### Acceptance Criteria

1. SCE SHALL publish canonical readiness reason codes for non-ready engineering states
2. Reason codes SHALL be reusable in both preview and result envelopes
3. The reason-code set SHALL remain UI-neutral

### Requirement 4: Preserve Existing Command Compatibility

**User Story:** As a maintainer, I want the new contract to wrap existing engineering behaviors, so that phase-1 does not require a full rewrite of underlying engineering commands.

#### Acceptance Criteria

1. Phase-1 SHALL build on existing `app engineering` semantics where possible
2. Existing attach/hydrate/activate flows SHALL remain compatible
3. The new envelope SHALL reduce adapter inference without forcing a parallel runtime path
