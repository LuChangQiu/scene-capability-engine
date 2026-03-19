# Requirements Document

## Introduction

This spec defines only the result envelope for engineering `open` and `import`. It builds on the preview payload from `134-02` and does not redefine preview readiness.

## Requirements

### Requirement 1: Publish One Open/Import Result Envelope

**User Story:** As an adapter, I want one result envelope for `open` and `import`, so that action feedback is stable and ordered.

#### Acceptance Criteria

1. SCE SHALL publish one `EngineeringProjectOpenResult` envelope for `open` and `import`
2. The envelope SHALL include the embedded preview payload
3. The envelope SHALL include ordered step results for `register`, `attach`, `hydrate`, and `activate` when applicable

### Requirement 2: Publish Stable Step Status

**User Story:** As an adapter, I want stable step status and reason codes, so that the action result can be rendered without guessing meaning.

#### Acceptance Criteria

1. Each step SHALL expose a stable status enum
2. Each step MAY expose a stable reason code
3. Steps that do not apply SHALL report `skipped` instead of disappearing silently

### Requirement 3: Reuse Current Open/Import Paths

**User Story:** As an adapter, I want current `open` and `import` paths to return the canonical envelope, so that phase-1 stays compatible with the current engineering path.

#### Acceptance Criteria

1. `sce app engineering open --app <app-id> --json` SHALL return the canonical result envelope
2. `sce app engineering import --app <app-id> --json` SHALL return the canonical result envelope
3. This spec SHALL depend on the preview payload defined by `134-02`
