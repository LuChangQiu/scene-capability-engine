# Scene Package Gate Remediation Runbook Notes

## Commands

```bash
node ./bin/scene-capability-engine.js scene package-gate \
  --registry .sce/specs/70-00-scene-package-gate-policy-and-evaluation/reports/package-registry-input.json \
  --policy .sce/specs/70-00-scene-package-gate-policy-and-evaluation/reports/package-gate-policy-three-layer.json \
  --out .sce/specs/74-00-scene-package-gate-remediation-runbook-output/reports/package-gate-runbook-output.json \
  --task-out .sce/specs/74-00-scene-package-gate-remediation-runbook-output/reports/package-gate-runbook-task-draft.md \
  --runbook-out .sce/specs/74-00-scene-package-gate-remediation-runbook-output/reports/package-gate-remediation-runbook.md \
  --json
```

## Observations

- Gate payload now includes `runbook` metadata with output path and action count.
- Runbook steps are ordered by priority (high before medium/low).
- Each runbook step preserves `source_checks` linkage for audit traceability.
