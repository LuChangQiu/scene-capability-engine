# Moqui Interactive Template Playbook

This playbook defines how to turn validated Moqui interactive customization flows into reusable SCE template assets.

## Scope

- Stage A/B/C artifacts:
  - `Change_Intent`
  - `Change_Plan`
  - guardrail gate decision
  - approval workflow state
  - execution/rollback records
- Stage D target:
  - scene package template
  - ontology model
  - governance contract
  - operational playbook

## Standard Template Asset

Primary package for the interactive loop:

- `.sce/templates/scene-packages/sce.scene--moqui-interactive-customization-loop--0.1.0/scene-package.json`
- `.sce/templates/scene-packages/sce.scene--moqui-interactive-customization-loop--0.1.0/scene.template.yaml`
- `.sce/templates/scene-packages/sce.scene--moqui-interactive-customization-loop--0.1.0/custom/scene.yaml`
- `.sce/templates/scene-packages/sce.scene--moqui-interactive-customization-loop--0.1.0/template.manifest.json`

## Capability Matrix Mapping

The template captures one full business-safe loop:

1. `spec.moqui.interactive.intent.build`
2. `spec.moqui.interactive.plan.generate`
3. `spec.moqui.interactive.plan.gate`
4. `spec.moqui.interactive.approval.workflow`
5. `spec.moqui.interactive.low-risk.apply`
6. `spec.moqui.interactive.rollback.record`

## Ontology Baseline

Minimum ontology entities:

- `change_intent`
- `change_plan`
- `gate_decision`
- `approval_state`
- `execution_record`
- `rollback_record`

Minimum relations:

- `change_intent -> change_plan (produces)`
- `change_plan -> gate_decision (produces)`
- `gate_decision -> approval_state (produces)`
- `approval_state -> execution_record (produces)`
- `execution_record -> rollback_record (produces)`

## Governance Baseline

Mandatory rule and decision coverage:

- Business rules:
  - intent phase must remain read-only
  - high-risk plans require approval
  - one-click apply restricted to low-risk + allow
  - rollback trace linkage is mandatory
- Decision logic:
  - gate routing (`allow | review-required | deny`)
  - execution routing (`low-risk apply` only)
  - rollback routing (execution-ledger based)

## Publish/Gate Workflow

```bash
# baseline score and ontology quality
sce scene moqui-baseline --json

# strict intake gate
sce scene package-publish-batch \
  --manifest docs/handoffs/handoff-manifest.json \
  --dry-run \
  --ontology-min-score 70 \
  --ontology-min-average-score 70 \
  --ontology-min-valid-rate 100 \
  --json
```

## Acceptance Checklist

- Template has full `capability_contract` chain (intent -> rollback).
- `ontology_model.entities` and `ontology_model.relations` are non-empty.
- `governance_contract.business_rules` and `decision_logic` are non-empty and closed.
- Execution behavior remains guardrail-first (no direct high-risk auto-apply).
- Template passes baseline and ontology gates without bypass flags.
