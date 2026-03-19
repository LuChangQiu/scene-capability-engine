# Requirements Document

## Introduction

MagicBall IDE and CLI now rely on SCE to open projects, import projects, inspect engineering readiness, and initialize project-management baseline content. The engine boundary must stay clear:

- SCE owns canonical project/onboarding semantics
- IDE and CLI are adapters that consume those semantics
- adapters may optimize display, but must not invent parallel long-lived project truth

Today the IDE still has to infer too much from a mix of `app bundle show`, `app engineering show`, local fallback metadata, and individual attach / hydrate / activate commands. This Spec defines the missing upstream contract so project onboarding can become engine-owned and cross-tool stable.

## Requirements

### Requirement 1: Provide Canonical Engineering Project Preview Contract

**User Story:** As an IDE or CLI adapter, I want one canonical project preview payload, so that I can show openable projects and readiness without reconstructing state from multiple partial sources.

#### Acceptance Criteria

1. SCE SHALL provide a canonical engineering project preview contract for an app
2. The preview SHALL include at least `appKey`, `appName`, `projectName`, `projectKey`, `repoUrl`, `provider`, `branch`, `codeVersion`, `workspacePath`
3. The preview SHALL include canonical readiness flags for `attached`, `hydrated`, and `active`
4. The preview SHALL distinguish `sourceKnown` from `projectionReady`
5. The preview SHALL be consumable by IDE and CLI without requiring client-side field synthesis

### Requirement 2: Provide Canonical Onboarding Result Envelope

**User Story:** As an adapter, I want open/import operations to return one structured result envelope, so that I can report exactly what happened without inferring semantics from command ordering.

#### Acceptance Criteria

1. SCE SHALL define a canonical result envelope for engineering project open/import flows
2. The result envelope SHALL expose ordered steps such as `register`, `attach`, `hydrate`, `activate`, `scaffold` when applicable
3. Each step SHALL expose a stable status enum covering at least `done`, `skipped`, `pending`, `failed`
4. Each step SHALL expose a machine-readable reason code or cause category
5. The envelope SHALL be UI-neutral and reusable by CLI, IDE, or future adapters

### Requirement 3: Publish Readiness And Gap Reason Codes

**User Story:** As a supervising user, I want the engine to explain why a project is not fully ready, so that tools stop guessing whether the gap is operational, data-related, or simply not yet supported upstream.

#### Acceptance Criteria

1. SCE SHALL publish canonical reason codes for non-ready engineering states
2. Reason codes SHALL distinguish at least:
   - source metadata missing
   - projection missing
   - workspace not hydrated
   - activation not complete
   - workspace path unavailable
   - upstream capability not yet implemented
3. Readiness reason codes SHALL be available in both preview payloads and action result envelopes where relevant

### Requirement 4: Provide Canonical Scaffold Contract

**User Story:** As an adapter, I want one canonical scaffold contract for project-management baseline content, so that I can initialize new workspaces without maintaining long-lived local rules.

#### Acceptance Criteria

1. SCE SHALL provide a canonical scaffold command or equivalent service contract for engineering project baseline initialization
2. The scaffold contract SHALL be idempotent
3. The scaffold result SHALL include canonical `workspacePath`
4. The scaffold result SHALL include created / skipped / failed counts for directories and files
5. The contract SHALL define overwrite policy explicitly

### Requirement 5: Publish Workspace Ownership And Scope Relations

**User Story:** As an ecosystem integrator, I want workspace ownership relationships to be engine-owned, so that app/workspace/user/device behavior can stay consistent across IDE and CLI.

#### Acceptance Criteria

1. SCE SHALL define canonical relations between app, engineering workspace, user, and device where available
2. The contract SHALL allow adapters to know whether a workspace is local to the current device, shared, or unresolved
3. The contract SHALL avoid pushing adapters into maintaining their own parallel ownership registry
4. The contract SHALL be compatible with future SQLite-backed registry evolution

### Requirement 6: Preserve Cross-Tool Neutrality

**User Story:** As an SCE maintainer, I want the onboarding contract to remain cross-tool and UI-neutral, so that the engine does not drift into IDE-specific behavior.

#### Acceptance Criteria

1. SCE SHALL define semantic payloads rather than layout-oriented payloads
2. SCE SHALL NOT encode IDE-specific split panes, tabs, cards, or dialog assumptions
3. SCE SHALL NOT encode CLI-only formatting as canonical semantics
4. Documentation SHALL explicitly separate engine-owned semantics from adapter-owned presentation
