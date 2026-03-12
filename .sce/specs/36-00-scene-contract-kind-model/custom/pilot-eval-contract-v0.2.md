# Pilot Eval Contract v0.2

## Eval Contract (scene.order.query)

```yaml
apiVersion: sce.eval/v0.2
kind: eval
metadata:
  obj_id: eval.erp.order-query-quality.001
  obj_version: 0.2.0
spec:
  functional_checks:
    - name: required_fields_present
      assert: response.orderId != null && response.statusId != null
    - name: evidence_present
      assert: evidence.source_entities != null && evidence.called_bindings != null
  kpis:
    - name: success_rate
      target: ">=0.98"
      window: rolling_7d
    - name: cycle_time_ms_p95
      target: "<=2500"
      window: rolling_7d
    - name: manual_takeover_rate
      target: "<=0.05"
      window: rolling_7d
    - name: policy_violation_count
      target: "==0"
      window: rolling_7d
  scoring:
    pass_threshold: 0.9
    weighting:
      functional_checks: 0.6
      kpis: 0.4
```
