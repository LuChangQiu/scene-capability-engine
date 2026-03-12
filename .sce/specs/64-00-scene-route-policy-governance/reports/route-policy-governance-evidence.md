# Route Policy Governance Evidence

## Validation Commands

- `node .\bin\kiro-spec-engine.js scene --help`
- `node .\bin\kiro-spec-engine.js scene route-policy-template --help`
- `npx jest tests/unit/commands/scene.test.js --runInBand`

## Runtime Checks

- `sce scene route --query hybrid --mode dry_run`
- `sce scene route --query routing --require-unique`
- `sce scene route-policy-template --profile hybrid --out .sce/specs/64-00-scene-route-policy-governance/reports/route-policy-hybrid.json --json`
- `sce scene route --query hybrid --mode commit --route-policy .sce/specs/64-00-scene-route-policy-governance/reports/route-policy-hybrid.json --json --out .sce/specs/64-00-scene-route-policy-governance/reports/route-with-policy-sample.json`

## Notes

- Route output now includes `route_policy_source` and `route_policy`.
- Route summary now displays policy source for human operators.
- Profile template artifact: `reports/route-policy-hybrid.json`.
- Policy-applied route sample: `reports/route-with-policy-sample.json`.
