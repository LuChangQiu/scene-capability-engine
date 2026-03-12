# Pilot DataContract and Policy v0.2

## DataContract (scene.order.query)

```yaml
apiVersion: sce.datacontract/v0.2
kind: datacontract
metadata:
  obj_id: datacontract.erp.order-query.001
  obj_version: 0.2.0
spec:
  model_scope:
    read:
      - moqui.OrderHeader.orderId
      - moqui.OrderHeader.statusId
      - moqui.OrderHeader.orderDate
      - moqui.OrderPart.shipmentMethodTypeId
      - moqui.OrderPart.statusId
    write: []
  invariants:
    - name: order_id_required
      expr: input.orderId != null && input.orderId != ""
    - name: read_only_scene
      expr: size(model_scope.write) == 0
  guards:
    - name: canonical_field_reference
      expr: all_fields_use_moqui_entity_dot_field
```

## Policy (scene.order.query)

```yaml
apiVersion: sce.policy/v0.2
kind: policy
metadata:
  obj_id: policy.erp.read-low-risk.001
  obj_version: 0.2.0
spec:
  risk_level: low
  approval:
    required: false
  run_mode:
    default: commit
    allow_dry_run: true
  idempotency:
    required: true
    key: orderId
  rollback:
    required: false
  timeout:
    scene_timeout_ms: 4000
  retry:
    max_attempts: 1
```
