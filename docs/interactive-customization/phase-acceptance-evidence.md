# Interactive Phase Acceptance Evidence

This document provides stage-level acceptance evidence for the Moqui interactive customization experiment.

## Stage A (Read-only Dialogue)

Scope:

- Page context ingestion and masking.
- Change_Intent generation.
- Read-only explain output and audit trace.

Evidence:

- `scripts/interactive-context-bridge.js`
- `scripts/interactive-intent-build.js`
- `scripts/interactive-flow.js`
- `docs/interactive-customization/page-context.schema.json`
- `docs/interactive-customization/moqui-copilot-context-contract.json`
- `docs/interactive-customization/moqui-context-provider.sample.json`
- `docs/interactive-customization/moqui-copilot-integration-guide.md`
- `tests/unit/scripts/interactive-context-bridge.test.js`
- `tests/unit/scripts/interactive-intent-build.test.js`
- `tests/unit/scripts/interactive-flow.test.js`

Verification:

```bash
npx jest tests/unit/scripts/interactive-intent-build.test.js --runInBand
npx jest tests/unit/scripts/interactive-context-bridge.test.js --runInBand
npx jest tests/unit/scripts/interactive-flow.test.js --runInBand
npm run report:interactive-context-bridge
npm run report:interactive-intent
```

## Stage B (Suggestion + Approval)

Scope:

- Change_Plan generation.
- Guardrail gate decision (`allow/review-required/deny`).
- Approval workflow state machine.

Evidence:

- `scripts/interactive-plan-build.js`
- `scripts/interactive-change-plan-gate.js`
- `scripts/interactive-approval-workflow.js`
- `tests/unit/scripts/interactive-plan-build.test.js`
- `tests/unit/scripts/interactive-change-plan-gate.test.js`
- `tests/unit/scripts/interactive-approval-workflow.test.js`

Verification:

```bash
npx jest tests/unit/scripts/interactive-plan-build.test.js tests/unit/scripts/interactive-change-plan-gate.test.js tests/unit/scripts/interactive-approval-workflow.test.js --runInBand
npm run report:interactive-plan
npm run gate:interactive-plan
```

## Stage C (Controlled Execute + Rollback)

Scope:

- Adapter minimal interface (`capabilities/plan/validate/apply/rollback`).
- Low-risk one-click apply path.
- Execution/rollback audit records.

Evidence:

- `lib/interactive-customization/moqui-interactive-adapter.js`
- `scripts/interactive-moqui-adapter.js`
- `docs/interactive-customization/moqui-adapter-interface.md`
- `tests/unit/scripts/interactive-moqui-adapter.test.js`

Verification:

```bash
npx jest tests/unit/scripts/interactive-moqui-adapter.test.js --runInBand
npm run report:interactive-adapter-capabilities
```

## Stage D (Template Sedimentation + Extension)

Scope:

- Moqui interactive loop template package.
- Adapter extension contract.
- Domain_Pack extension flow.

Evidence:

- `.sce/templates/scene-packages/sce.scene--moqui-interactive-customization-loop--0.1.0/scene-package.json`
- `.sce/templates/scene-packages/sce.scene--moqui-interactive-customization-loop--0.1.0/scene.template.yaml`
- `docs/interactive-customization/moqui-interactive-template-playbook.md`
- `docs/interactive-customization/adapter-extension-contract.schema.json`
- `docs/interactive-customization/domain-pack-extension-flow.md`

Verification:

```bash
node scripts/moqui-template-baseline-report.js --json
npm run report:interactive-governance
```

## Acceptance Conclusion

- Stage A/B/C/D evidence artifacts are present.
- Associated unit tests and report commands are executable.
- Governance and ontology baseline remain default-on without bypass flags.
