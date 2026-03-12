# Scene Contract v0.1

## Purpose

Define the minimum executable contract for Scene-driven capability orchestration while keeping compatibility with current SCE Spec workflows.

## Scope

- Scene is a composite orchestration object.
- Spec remains the implementation container.
- DataContract, Policy, and Eval provide execution constraints.
- Template provides repeatable capability packaging.

## Shared Envelope (All Kinds)

Required common fields:

- `obj_id`: stable object id
- `obj_kind`: one of `scene|spec|template|datacontract|policy|eval`
- `obj_version`: semantic version
- `obj_state`: draft|active|deprecated|archived
- `owner_principal`: owner identity in control plane
- `title`: human-readable title
- `relations`: explicit typed edges to other objects
- `audit`: created/updated timestamps and actor ids

## Kind Extensions (v0.1)

- `scene`: intent, scope, orchestration graph, success criteria
- `spec`: requirement/design/task references and delivery status
- `template`: parameter schema, generation rules, compatibility tags
- `datacontract`: entity.field read/write sets, invariants, transition guards
- `policy`: risk level, approval rules, idempotency, rollback strategy
- `eval`: KPI definitions, acceptance tests, scoring rules

## Machine-Readable Scene Manifest

```yaml
apiVersion: sce.scene/v0.1
kind: scene
metadata:
  obj_id: scene.sales-order-query.001
  obj_version: 0.1.0
  obj_state: draft
  owner_principal: sce.ops.platform
  title: Sales Order Query
spec:
  intent:
    goal: Query order status and key fulfillment signals
    input_slots:
      - name: orderId
        type: string
        required: true
  model_scope:
    read:
      - moqui.OrderHeader.orderId
      - moqui.OrderHeader.statusId
      - moqui.OrderPart.shipmentMethodTypeId
    write: []
  state_contract:
    allowed_transitions: []
    guards: []
  capability_contract:
    bindings:
      - type: service
        ref: spec.order.query-service
        timeout_ms: 3000
        retry: 1
      - type: query
        ref: spec.order.fulfillment-snapshot
        timeout_ms: 3000
        retry: 0
    fallback:
      strategy: return-partial
      required_bindings:
        - spec.order.query-service
  governance_contract:
    risk_level: low
    approval:
      required: false
    idempotency:
      required: true
      key: orderId
    rollback:
      required: false
  output_contract:
    response_schema:
      required:
        - orderId
        - statusId
    evidence_bundle:
      include:
        - source_entities
        - called_bindings
        - timing
  observability:
    kpis:
      - name: success_rate
        target: ">=0.98"
      - name: cycle_time_ms_p95
        target: "<=2500"
      - name: manual_takeover_rate
        target: "<=0.05"
```

## Namespace Rules

- Control-plane metadata must use `sce.*` semantics.
- Business bindings must use canonical `moqui.EntityName.fieldName` references.
- Top-level ambiguous keys are banned: `id`, `status`, `userId`, `partyId`, `fromDate`, `thruDate`.

## Execution Semantics

Compile Scene manifest to Plan IR nodes:

- `query`
- `service`
- `script`
- `human_approval`
- `verify`
- `respond`

Each node must include:

- `preconditions`
- `timeout/retry`
- `compensation`
- `evidence_capture`

Run modes:

- `dry_run`: compute expected impact and policy checks without side effects
- `commit`: execute with policy gate and audit trail

## Object Relations

v0.1 required relation types:

- `scene -> uses -> spec`
- `scene -> constrained_by -> policy`
- `scene -> constrained_by -> datacontract`
- `scene -> evaluated_by -> eval`
- `template -> generates -> spec`

## Compatibility Notes

- Existing SCE Spec directories remain unchanged.
- Scene manifest is additive and can live under Spec subdirectory `custom/`.
- SCE governance stays in control plane; runtime executor can evolve independently.