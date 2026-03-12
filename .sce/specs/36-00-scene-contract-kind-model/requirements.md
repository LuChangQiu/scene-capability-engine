# Requirements Document: Scene Contract and Kind Model

## Introduction

This spec defines a unified object model for scenario-driven execution in SCE-based intelligent systems spanning ERP and robot ecosystems.
The purpose is to bridge user intent, executable services, and constrained data models without fragmenting data truth.

Design target:
- Scene as business outcome orchestration
- Spec as capability implementation unit
- Shared data truth from Moqui entity model
- Unified governance for risk, permission, and audit

## Problem Statement

Current spec-driven development provides strong delivery structure but lacks a first-class scenario execution layer.
In intelligent operations systems, users communicate goals, not technical steps. We need a contract layer that maps goal -> capability -> data-safe execution.

## Requirements

### Requirement 1: Unified Object Kinds

The system MUST support multiple object kinds with clear runtime semantics.

#### Acceptance Criteria
- Define baseline kinds: Scene, Spec, Template, DataContract, Policy, Eval.
- Each kind has explicit scope, lifecycle, and validation semantics.
- New kinds can be added without changing execution engine core.

### Requirement 2: Scene-to-Spec Composition

Scene MUST represent a composite business flow built from multiple specs.

#### Acceptance Criteria
- A scene can reference multiple specs (1:N).
- A spec can be reused by multiple scenes (N:M).
- Scene-level success criteria are defined independently from spec-level task completion.

### Requirement 3: Data Model Alignment

Contracts MUST align with Moqui entity model and field dictionary.

#### Acceptance Criteria
- Scene contracts declare read/write sets by canonical entity.field identifiers.
- Field names in contract MUST not redefine Moqui business fields.
- Type usage follows Moqui field type dictionary semantics.

### Requirement 4: Namespace Separation

Control-plane metadata and business-plane fields MUST be separated.

#### Acceptance Criteria
- Control metadata uses dedicated namespace (for example sce.*).
- Business bindings use dedicated namespace (for example moqui.*).
- Collision-prone names (id/status/user/party/fromDate/thruDate) are mapped explicitly, not overloaded.

### Requirement 5: Executable Contract Model

Every scene MUST be compilable into a unified execution plan.

#### Acceptance Criteria
- Define a machine-readable contract format (scene manifest).
- Contract includes inputs, service bindings, state transitions, risk policy, rollback, and evidence output.
- Execution plan supports dry-run and commit phases for risky operations.

### Requirement 6: Governance and Traceability

Execution MUST be controlled and auditable.

#### Acceptance Criteria
- Risk levels and approval rules are required for write operations.
- Idempotency and rollback policy are required for side-effect actions.
- Evidence bundle includes source entities, called services, and result summary.

### Requirement 7: Quality and Learning Loop

Scene execution output MUST be evaluable for continuous improvement.

#### Acceptance Criteria
- Define KPI contract: success rate, manual takeover rate, error action rate, cycle time.
- Eval rules can validate both functional correctness and policy compliance.
- Execution logs are structured for future model fine-tuning datasets.

### Requirement 8: Multi-Ecosystem Domain Compatibility

The scene model MUST support multiple ecosystems, including ERP and robot domains, under one control plane.

#### Acceptance Criteria
- Scene declares domain type: erp, robot, or hybrid.
- Domain-specific constraints can be attached without changing shared envelope.
- Hybrid scenes can compose capabilities across ERP and robot ecosystems.

### Requirement 9: Real-Time Safety Boundary

The system MUST enforce a strict boundary between LLM orchestration and safety-critical robot control.

#### Acceptance Criteria
- LLM execution cannot directly issue real-time motion/safety IO commands.
- Robot actions are dispatched only through deterministic adapters.
- High/critical robot-related scenes require explicit safety gates before commit.

### Requirement 10: Cross-Domain Consistency and Compensation

Hybrid scenes MUST support consistency through orchestrated compensation.

#### Acceptance Criteria
- Commit flow supports saga-style compensation for irreversible steps.
- Each side-effect step defines idempotency and compensation metadata.
- Evidence captures both ERP transaction effects and robot mission outcomes.

## Non-Functional Requirements

- Backward compatibility with existing spec directory conventions.
- Incremental adoption: existing specs remain valid during migration.
- Low operational overhead for teams currently using standard SCE workflows.

## Out of Scope

- Full implementation of runtime executor in this spec.
- UI redesign decisions (form-first vs chat-first experience).
- Tenant-specific business ontology customization.
