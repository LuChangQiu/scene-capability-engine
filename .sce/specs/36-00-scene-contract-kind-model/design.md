# Design Document: Scene Contract and Kind Model

## Overview

This design introduces a unified object model for intelligent execution across ERP and robot ecosystems.
Instead of treating all artifacts as generic specs, we define explicit kinds with clear runtime semantics.

Core idea:
- Scene is the business outcome orchestrator.
- Spec is the capability implementation unit.
- DataContract binds execution to Moqui data model truth.
- Policy and Eval enforce controllability and quality.

## Design Goals

1. Keep execution unified while allowing multiple object types.
2. Preserve Moqui data model as the single business truth.
3. Prevent naming collisions between control-plane metadata and business fields.
4. Support gradual adoption without breaking existing SCE specs.
5. Support ERP-only, robot-only, and hybrid scenes under one governance model.

## Object Model

### Kind Set (v1)

- Scene: Composite business flow spanning multiple specs.
- Spec: Implementable capability unit.
- Template: Parameterized blueprint to generate/reuse specs.
- DataContract: Entity/field/state constraints.
- Policy: Risk, approval, permission, idempotency, rollback constraints.
- Eval: KPI and correctness validation rules.

### Shared Object Envelope

All objects share:
- obj_id
- obj_kind
- obj_version
- obj_state
- owner_principal
- title
- description
- tags
- relations
- lifecycle
- audit

## Namespace Strategy

- Control-plane metadata uses sce.* semantics.
- Business bindings use canonical moqui.Entity.field references.
- Collision-prone generic keys are disallowed in common envelope.

## Scene Contract Structure

Proposed scene.yaml sections:
- identity
- intent
- model_scope
- state_contract
- capability_contract
- governance_contract
- output_contract
- observability

## Execution Model

### Plan Compilation

All kinds compile into a unified Plan IR.

Plan node types:
- query
- service
- script
- human_approval
- verify
- respond

Each node carries:
- preconditions
- timeout/retry
- compensation
- evidence capture strategy

### Run Modes

- dry_run: evaluate plan and expected impact without side effects.
- commit: execute with policy gates and audit trail.

## Dual Ecosystem Extension (v0.2)

To support both ERP and robot ecosystems under one control plane, scene semantics are extended with domain profiles.

### Domain Profile

Scene adds domain identity:
- domain: erp | robot | hybrid
- domain_profile.erp for data/transaction constraints
- domain_profile.robot for safety/mission constraints
- domain_profile.hybrid for orchestration/compensation rules

### Adapter Boundary

- SCE/runtime: intent resolution, plan compilation, policy gate, audit, eval
- ERP adapter: Moqui service/query/event execution
- Robot adapter: deterministic mission dispatch and state callbacks

Hard safety rule:
- LLM orchestration cannot directly issue real-time robot control commands.

### Cross-Domain Consistency

Hybrid scenes use saga-style consistency:
- forward actions in domain sequence
- compensation actions per side-effect step
- idempotent replay based on scene execution key

## Migration Strategy

### Phase 0: Inventory
- Map current active specs to candidate scene domains.
- Identify naming conflicts and overlapping business fields.

### Phase 1: Envelope Adoption
- Add shared object envelope to new objects only.
- Keep legacy spec files unchanged.

### Phase 2: Scene Pilot
- Pick 1-2 high-value scenes.
- Implement Scene + DataContract + Policy + Eval minimal set.

### Phase 3: Scale
- Expand scene library by domain.
- Add automated compatibility checks and linting.

## Compatibility

- Existing requirements.md/design.md/tasks.md remain valid.
- New machine-readable manifests are additive.
- SCE workflows continue operating during transition.

## Discussion Deliverables

- custom/scene-contract-v0.1.md
- custom/moqui-binding-rules-v0.1.md
- custom/pilot-priority-and-template-gate-v0.1.md
- custom/dual-ecosystem-architecture-v0.2.md
- custom/domain-policy-matrix-v0.2.md
- custom/hybrid-scene-example-v0.2.md
- custom/pilot-scene-spec-mapping-v0.2.md
- custom/pilot-datacontract-policy-v0.2.md
- custom/pilot-eval-contract-v0.2.md
- custom/plan-ir-interface-v0.2.md
- custom/governance-audit-schema-v0.2.md
- custom/migration-compatibility-guide-v0.2.md
- custom/robot-adapter-interface-contract-v0.2.md
- custom/hybrid-pilot-and-safety-drill-v0.2.md
