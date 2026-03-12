# Scene Package Gate Remediation Task Bridge Notes

## Commands

```bash
node ./bin/scene-capability-engine.js scene package-gate \
  --registry .sce/specs/70-00-scene-package-gate-policy-and-evaluation/reports/package-registry-input.json \
  --policy .sce/specs/70-00-scene-package-gate-policy-and-evaluation/reports/package-gate-policy-three-layer.json \
  --out .sce/specs/73-00-scene-package-gate-remediation-task-bridge/reports/package-gate-remediation-task-bridge.json \
  --task-out .sce/specs/73-00-scene-package-gate-remediation-task-bridge/reports/package-gate-remediation-task-draft.md \
  --json
```

## Observations

- Remediation actions now include `source_check_ids` trace linkage.
- Task draft generation is remediation-first and includes action identifiers.
- Task draft payload exposes `suggested_actions` for downstream automation.
