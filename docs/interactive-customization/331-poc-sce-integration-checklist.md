# 331-poc SCE Integration Checklist

This checklist defines the minimum production-ready integration for embedding SCE interactive customization in `331-poc` (Moqui-focused solution).

## 1. Runtime Preconditions

- Node runtime: `>=16` (recommended `20.x`).
- SCE installed and available as `sce`.
- `docs/interactive-customization/moqui-copilot-context-contract.json` exists and is aligned with current UI payload fields.
- Interactive policy assets are present:
  - `docs/interactive-customization/guardrail-policy-baseline.json`
  - `docs/interactive-customization/high-risk-action-catalog.json`

## 2. Moqui UI Context Contract

Provider payload sent from UI must include:

- `product`, `workspace.module`, `workspace.page`
- `workspace.scene` (id/name/type)
- `workspace.ontology`:
  - `entities`
  - `relations`
  - `business_rules`
  - `decision_policies`
- `current_state` (masked/sanitized)
- `assistant.sessionId`

Hard rules:

- No plaintext secrets.
- No forbidden keys from context contract (for example `private_key`).
- Payload size must stay within contract limits.

## 3. Default One-Command Execution

Use this command as the default integration path:

```bash
sce scene interactive-flow \
  --input <provider-payload.json> \
  --goal "<business goal>" \
  --context-contract docs/interactive-customization/moqui-copilot-context-contract.json \
  --execution-mode apply \
  --auto-execute-low-risk \
  --feedback-score 5 \
  --json
```

Notes:

- Matrix stage is enabled by default.
- Keep `--no-matrix` only for diagnostics.

## 4. Governance and Gate Defaults

Run governance gate on schedule and pre-release:

```bash
node scripts/interactive-governance-report.js --period weekly --fail-on-alert --json
```

Run matrix regression gate in release pipeline (configurable):

```bash
node scripts/matrix-regression-gate.js \
  --baseline .sce/reports/release-evidence/moqui-template-baseline.json \
  --max-regressions 0 \
  --enforce \
  --json
```

Recommended GitHub Variables:

- `SCE_MATRIX_REGRESSION_GATE_ENFORCE=true`
- `SCE_MATRIX_REGRESSION_GATE_MAX=0`
- `SCE_MOQUI_RELEASE_SUMMARY_ENFORCE=true` (optional hard gate for release summary `failed` state)

Security baseline:

- Apply default controls in `docs/security-governance-default-baseline.md`.
- Keep context contract strict mode enabled in production integration.

## 5. Evidence Artifacts (Must Keep)

- `.sce/reports/interactive-governance-report.json`
- `.sce/reports/interactive-governance-report.md`
- `.sce/reports/interactive-matrix-signals.jsonl`
- `.sce/reports/release-evidence/moqui-template-baseline.json`
- `.sce/reports/release-evidence/matrix-regression-gate-<tag>.json`
- `.sce/reports/release-evidence/matrix-remediation-plan-<tag>.json`
- `.sce/reports/release-evidence/matrix-remediation-<tag>.lines`
- `.sce/reports/release-evidence/matrix-remediation-high-<tag>.lines`
- `.sce/reports/release-evidence/matrix-remediation-medium-<tag>.lines`
- `.sce/reports/release-evidence/matrix-remediation-goals-high-<tag>.json`
- `.sce/reports/release-evidence/matrix-remediation-goals-medium-<tag>.json`
- `.sce/reports/release-evidence/matrix-remediation-phased-plan-<tag>.json`
- `.sce/reports/release-evidence/weekly-ops-summary-<tag>.json`
- `.sce/reports/release-evidence/weekly-ops-summary-<tag>.md`

## 6. Pass Criteria

- `interactive-flow.summary.status` is `completed` or `ready-for-apply` by policy.
- Governance summary status is `ok` (no medium/high breach).
- Matrix regression gate status is `passed` (or enforced policy satisfied).
- Release summary status is `passed` or explicitly approved when `incomplete`.

## 7. Remediation Loop

When matrix regressions are detected:

```bash
node scripts/moqui-matrix-remediation-queue.js \
  --baseline .sce/reports/release-evidence/moqui-template-baseline.json \
  --lines-out .sce/auto/matrix-remediation.lines \
  --batch-json-out .sce/auto/matrix-remediation.goals.json \
  --commands-out .sce/reports/release-evidence/matrix-remediation-commands.md \
  --json

# anti-429 phased mode (recommended default)
sce auto close-loop-batch .sce/auto/matrix-remediation.goals.high.json \
  --format json \
  --batch-parallel 1 \
  --batch-agent-budget 2 \
  --batch-retry-until-complete \
  --batch-retry-max-rounds 3 \
  --json
sleep 30
sce auto close-loop-batch .sce/auto/matrix-remediation.goals.medium.json \
  --format json \
  --batch-parallel 1 \
  --batch-agent-budget 2 \
  --batch-retry-until-complete \
  --batch-retry-max-rounds 2 \
  --json

# one-shot equivalent
npm run run:matrix-remediation-phased -- --json

# zero-prep one-shot (prepare from baseline + run phased)
node scripts/moqui-matrix-remediation-phased-runner.js \
  --baseline .sce/reports/release-evidence/moqui-template-baseline.json \
  --json
npm run run:matrix-remediation-from-baseline -- --json

# fallback
sce auto close-loop-batch .sce/auto/matrix-remediation.lines --json
sce auto close-loop-batch .sce/auto/matrix-remediation.goals.json --format json --json
```
