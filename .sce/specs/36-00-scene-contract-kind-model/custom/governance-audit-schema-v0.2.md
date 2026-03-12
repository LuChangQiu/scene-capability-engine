# Governance and Audit Event Schema v0.2

## Audit Objectives

- full traceability of intent -> plan -> execution -> outcome
- tamper-evident evidence bundle
- replay-ready event stream for diagnostics and learning

## Event Types

- scene_run_requested
- scene_run_authorized
- scene_plan_compiled
- scene_node_executed
- scene_node_failed
- scene_compensation_started
- scene_compensation_completed
- scene_run_completed

## Event Envelope

```json
{
  "event_id": "uuid",
  "event_type": "scene_node_executed",
  "timestamp": "ISO-8601",
  "trace_id": "trace-...",
  "scene_ref": "scene.order.query",
  "scene_version": "0.2.0",
  "run_mode": "commit",
  "actor": "sce.runtime",
  "checksum": "sha256"
}
```

## Node Evidence Schema

```json
{
  "node_id": "n-03",
  "binding_ref": "spec.erp.order-query-service",
  "status": "success",
  "latency_ms": 142,
  "input_hash": "sha256",
  "output_hash": "sha256",
  "source_entities": ["OrderHeader", "OrderPart"]
}
```

## Governance Checks

- approval record required for high/critical scenes before commit
- policy evaluation result must be persisted
- checksum must be computed before write
- failed side-effect node must produce compensation decision event
