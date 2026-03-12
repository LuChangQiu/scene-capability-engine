# Dual Ecosystem Architecture v0.2 (ERP + Robot)

## Goal

Extend Scene/Kind model so one control plane can orchestrate both:

- ERP ecosystem (Moqui-centric transactional services)
- Robot ecosystem (device, mission, and operation workflows)

without mixing safety-critical real-time control into LLM execution.

## Positioning

- SCE remains the control plane and governance plane.
- Scene runtime handles planning, policy, and orchestration.
- Domain adapters execute domain-native operations.
- Robot low-level control remains deterministic and external to LLM loop.

## Domain Model Extension

Scene adds domain profile:

- `domain: erp | robot | hybrid`
- `domain_profile.erp`: transaction consistency and data constraints
- `domain_profile.robot`: mission safety and execution constraints
- `domain_profile.hybrid`: cross-domain orchestration and compensation

## Layered Responsibility

1. Logical layer (Kind/Semantics)
   - user intent normalization
   - scene selection and contract resolution
   - policy and eval binding

2. Physical layer (Artifacts/Adapters)
   - SCE specs and templates
   - ERP adapter (Moqui service/query/event)
   - Robot adapter (mission API/device gateway/PLC/ROS-like bridge)

3. Execution layer (Runtime)
   - plan compilation (Plan IR)
   - dry-run policy checks
   - commit dispatch with approval gates
   - evidence + eval output

## Control Boundary Rules

Hard boundary:

- LLM must not issue direct servo/path/safety-IO control commands.
- All real-time robot actions pass through certified deterministic adapter.

Soft boundary:

- LLM can propose mission-level plans and sequence decisions.
- Runtime enforces policy before adapter dispatch.

## Consistency Strategy (Cross-Domain)

Use Saga style orchestration for `hybrid` scenes:

- step-level forward actions in ERP/Robot domains
- compensation actions for each irreversible step
- outbox/event-log for replay and idempotent recovery

Do not depend on global distributed transactions.

## Safety and Risk Profiles

- ERP read/query scene: low risk, auto execution
- ERP write scene: medium/high risk, approval based on policy
- Robot mission dispatch: high risk, explicit human approval + preflight checks
- Robot emergency/power/safety scenes: critical, dual-approval and strict allowlist

## Observability Requirements

Every hybrid execution emits:

- unified trace id
- scene/spec/policy/eval versions
- ERP operations and result evidence
- robot mission id/state timeline
- compensation and rollback records

## Recommended Adapter Contract Shape

- `adapter_id`
- `domain`
- `capabilities`
- `safety_class`
- `timeout/retry`
- `idempotency_key_rule`
- `evidence_schema`

## Incremental Rollout Path

Phase A (safe start)

- `erp` and `robot` read-only scenes
- dry-run only for hybrid scenes

Phase B (controlled execution)

- hybrid commit with high-risk approval gates
- compensation workflow enabled

Phase C (scale)

- template library for domain/hybrid scenes
- eval-driven optimization and dataset extraction

## Key Decision

Use one Scene/Kind system with domain profiles, not two separate orchestration frameworks.
This preserves unified governance while respecting domain-specific safety constraints.