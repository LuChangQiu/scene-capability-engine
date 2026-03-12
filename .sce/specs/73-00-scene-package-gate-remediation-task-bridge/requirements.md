# Requirements Document: Scene Package Gate Remediation Task Bridge

## Introduction

Spec 72 adds remediation actions in gate payload. To close the execution loop, SCE now needs a stable bridge
that converts remediation actions into task draft entries and spec task sync lines with traceable metadata.

## Requirements

### Requirement 1: Remediation-first Task Candidate Selection
- Gate task draft generation should prefer remediation actions when available.
- Gate spec-task sync should prefer remediation actions when available.
- Fallback to failed-check task generation must remain available when remediation is absent.

### Requirement 2: Traceable Action Metadata in Task Outputs
- Task draft entries should include remediation action identifiers when action-backed.
- Spec task sync lines should include `action_id` metadata in suffix fields.
- Action-backed sync payload should expose `action_id` and `source_check_ids` per added task.

### Requirement 3: Priority and Title Determinism
- Action-backed tasks should use remediation `priority` as source priority.
- Action-backed tasks should use deterministic action task titles.
- Check-backed fallback tasks should preserve legacy title and priority behavior.

### Requirement 4: Sync Result Source Mode Visibility
- Sync result payload should include `source_mode` indicating `remediation` or `check`.
- Duplicate skipping behavior should continue to operate on normalized task titles.
- Existing section header and append behavior in `tasks.md` should remain unchanged.

### Requirement 5: Regression and Traceability
- Extend scene command tests to assert action-backed task bridge behavior.
- Keep scene unit tests and full regression checks passing.
- Capture smoke outputs under spec reports for replay and audit.
