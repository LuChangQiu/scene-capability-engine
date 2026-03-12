# Hybrid Scene Manifest Example v0.2

```yaml
apiVersion: sce.scene/v0.2
kind: scene
metadata:
  obj_id: scene.fulfillment.robot-pick-confirm.001
  obj_version: 0.2.0
  obj_state: draft
  owner_principal: sce.ops.fulfillment
  title: Robot Pick and ERP Confirmation
spec:
  domain: hybrid
  intent:
    goal: Pick order items with robot and confirm fulfillment in ERP
    input_slots:
      - name: orderId
        type: string
        required: true
      - name: stationId
        type: string
        required: true
  domain_profile:
    erp:
      consistency: transactional
      write_entities:
        - moqui.OrderItem.statusId
        - moqui.ShipmentItem.quantity
    robot:
      safety_class: mission
      preflight_required: true
      stop_channel_required: true
  capability_contract:
    bindings:
      - type: service
        ref: spec.erp.reserve-pick-items
      - type: adapter
        ref: spec.robot.dispatch-pick-mission
      - type: service
        ref: spec.erp.confirm-pick-result
  governance_contract:
    risk_level: high
    approval:
      required: true
      mode: single
    idempotency:
      required: true
      key: orderId
    rollback:
      required: true
      strategy: compensation
  compensation:
    steps:
      - ref: spec.erp.release-reserved-items
      - ref: spec.robot.cancel-or-return-mission
  observability:
    trace_id_required: true
    kpis:
      - name: end_to_end_success_rate
        target: ">=0.97"
      - name: robot_mission_abort_rate
        target: "<=0.02"
      - name: manual_takeover_rate
        target: "<=0.08"
```

## Notes

- Robot dispatch and cancellation are adapter operations, not direct LLM control operations.
- Hybrid scenes require explicit compensation planning before commit.
- Dry-run should validate both ERP writability and robot adapter readiness.