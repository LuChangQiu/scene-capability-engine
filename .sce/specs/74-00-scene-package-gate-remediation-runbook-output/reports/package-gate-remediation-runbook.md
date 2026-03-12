# Scene Package Gate Remediation Runbook

- generated_at: 2026-02-09T11:36:34.504Z
- policy_profile: three-layer
- gate_status: failed
- remediation_actions: 3

## Execution Plan

### 1. [high] increase-valid-templates
- title: Increase valid template count by at least 2
- recommendation: Promote additional template packages via package-publish until gate threshold is met.
- command: `sce scene package-registry --template-dir .sce/templates/scene-packages --json`
- source_checks: min-valid-templates

### 2. [medium] cover-l1-capability
- title: Add at least one l1-capability template package
- recommendation: Create and publish a scene-capability package to satisfy l1-capability coverage.
- command: `sce scene package-template --kind scene-capability --spec <spec-name> && sce scene package-publish --spec <spec-name>`
- source_checks: required-layer:l1-capability

### 3. [medium] cover-l3-instance
- title: Add at least one l3-instance template package
- recommendation: Create and publish a scene-template package to satisfy l3-instance coverage.
- command: `sce scene package-template --kind scene-template --spec <spec-name> && sce scene package-publish --spec <spec-name>`
- source_checks: required-layer:l3-instance
