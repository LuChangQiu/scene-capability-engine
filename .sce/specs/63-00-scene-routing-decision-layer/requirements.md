# Requirements Document: Scene Routing Decision Layer

## Introduction

After introducing `scene catalog`, SCE can discover available scene manifests. The next layer is routing:
translate user intent selectors into the most appropriate scene target and provide actionable execution commands.

## Requirements

### Requirement 1: Route Command Surface
- Add `scene route` command under the existing `scene` command group.
- Route command should accept selector inputs (scene_ref/domain/kind/spec/query).
- Route command should allow recommended run mode preference (`dry_run|commit`).

### Requirement 2: Deterministic Candidate Resolution
- Route command should build candidate set from scene catalog with existing discovery rules.
- Candidate scoring should be deterministic for same input selectors.
- Route response should include selected candidate and scored alternatives.

### Requirement 3: Operational Command Handoff
- Selected candidate should provide next-step command suggestions (`validate`, `doctor`, `run`).
- Suggestions should include resolved spec and manifest path.
- JSON output should carry the same suggestions for automation clients.

### Requirement 4: Ambiguity and Safety Handling
- Support strict uniqueness mode that fails when top candidates tie (`--require-unique`).
- Keep missing-selection route result explicit and machine-readable.
- Route option validation should enforce minimal selector requirements.

### Requirement 5: Regression Safety
- Add unit tests for route option validation and routing behaviors.
- Keep scene command unit suite passing.
- Validate CLI help exposure for route command.
