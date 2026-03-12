# Moqui Template Core Library Playbook

This playbook defines a generic (project-agnostic) path to absorb Moqui capabilities into the sce core template library.

## Objectives

- Turn Moqui business capabilities into reusable `scene-package` templates.
- Enforce ontology quality as a default gate (no project-specific flags required).
- Keep evidence output stable for release and regression review.

## Default Gate Baseline

sce defaults already enforce the baseline below:

- `sce auto handoff run`: ontology validation is required by default.
- `sce auto handoff run`: generates Moqui baseline snapshot by default and appends it to release-evidence sessions.
- `sce auto handoff run`: requires Moqui baseline portfolio pass by default.
- `sce auto handoff run`: enforces Moqui matrix regression hard-gate by default (`max_moqui_matrix_regressions=0`).
- `sce auto handoff run`: evaluates capability coverage matrix by default when manifest `capabilities` is declared (default minimum `100%`).
- `sce auto handoff run` / `sce auto handoff capability-matrix`: enforces capability lexicon normalization by default (expected/provided unknown aliases are blocked unless explicitly bypassed).
- `sce auto handoff capability-matrix`: enforces both capability coverage and capability semantic completeness (default minimum `100%` for each).
- `sce auto governance stats` / `sce auto governance close-loop`: treats Moqui matrix regressions as first-class risk/block signals (including over-gate stop reasons).
- `sce auto governance stats` / `sce auto governance close-loop`: treats capability lexicon unknown-count signals as first-class risk/block signals.
- `sce scene package-publish-batch`:
  - ontology validation required by default
  - batch ontology gate defaults:
    - average ontology score `>= 70`
    - ontology valid-rate `>= 100%`

Emergency bypass exists but is not recommended:

- `--no-require-ontology-validation`
- `--no-require-moqui-baseline`
- `--no-require-capability-coverage`

Profile presets are available for external intake standardization:

- `--profile default`: baseline strict intake defaults.
- `--profile moqui`: explicit Moqui baseline alias (same strict defaults).
- `--profile enterprise`: stricter release control baseline (`max-risk-level=medium`, `require-release-gate-preflight=true`, `release-evidence-window=10`).

Default onboarding and safety baselines:

- Starter intake assets: `docs/starter-kit/README.md`
- Default security/governance controls: `docs/security-governance-default-baseline.md`

## Template Capability Matrix Contract

Use the baseline report as the canonical matrix contract (`.sce/reports/moqui-template-baseline.json`):

| Matrix Dimension | Meaning | Default Gate Target |
| --- | --- | --- |
| `graph_valid.rate_percent` | Ontology graph structural validity | `100%` |
| `score_passed.rate_percent` | Semantic score above baseline threshold | `100%` |
| `entity_coverage.rate_percent` | Entity model coverage | `100%` |
| `relation_coverage.rate_percent` | Entity relation coverage | `100%` |
| `business_rule_coverage.rate_percent` | Business-rule presence coverage | `100%` |
| `business_rule_closed.among_covered_rate_percent` | No unmapped rules among covered templates | `100%` |
| `decision_coverage.rate_percent` | Decision logic presence coverage | `100%` |
| `decision_closed.among_covered_rate_percent` | No undecided decisions among covered templates | `100%` |
| `baseline_passed.rate_percent` | Full matrix closure rate | `100%` |

Trend regression should stay hard-gated by default:

- `compare.coverage_matrix_regressions.length` must be `0`
- `sce auto handoff run` default `--max-moqui-matrix-regressions 0`

## External POC Handoff Requirements

When an upstream business project (e.g. a POC) feeds templates into sce, require the following by default:

- Every handoff spec contains:
  - `custom/scene.yaml` with entity/service/screen binding refs
  - `custom/scene-package.json` with explicit `capabilities.expected/provided`
  - ontology semantics for entity, relation, business-rule, and decision dimensions
- Handoff evidence includes:
  - latest `moqui-template-baseline.json|.md`
  - latest `handoff-capability-matrix` report
  - latest `moqui-lexicon-audit` report
  - ontology batch report from `scene package-publish-batch --dry-run`
- New/updated templates must provide deterministic IDs and version bumps so baseline comparisons are stable across releases.

## One-Shot Intake Flow

```bash
# 0) Generate template baseline scoreboard (Moqui + scene orchestration templates by default)
sce scene moqui-baseline --json

# 0.1) CI/release mode: compare against previous baseline and enforce portfolio gate
sce scene moqui-baseline \
  --compare-with .sce/reports/release-evidence/moqui-template-baseline-prev.json \
  --fail-on-portfolio-fail \
  --json

# 0.2) Fast capability matrix gate (recommended before full handoff run)
sce auto handoff capability-matrix \
  --manifest docs/handoffs/handoff-manifest.json \
  --format markdown \
  --out .sce/reports/handoff-capability-matrix.md \
  --fail-on-gap \
  --json

# 0.3) Capability lexicon audit (expected/provided canonical alignment)
node scripts/moqui-lexicon-audit.js \
  --manifest docs/handoffs/handoff-manifest.json \
  --template-dir .sce/templates/scene-packages \
  --fail-on-gap \
  --json

# 0.4) Consolidated release gate summary (single-file pass/fail/incomplete verdict)
node scripts/moqui-release-summary.js \
  --fail-on-gate-fail \
  --json

# 0.5) Weekly ops closed-loop card (handoff + gate history + governance + matrix)
node scripts/release-ops-weekly-summary.js --json

# 1) Handoff close-loop
sce auto handoff run --manifest docs/handoffs/handoff-manifest.json --json

# 1.1) Explicitly keep strict matrix hard-gate (same as default, recommended in CI)
sce auto handoff run \
  --manifest docs/handoffs/handoff-manifest.json \
  --max-moqui-matrix-regressions 0 \
  --json

# 2) Publish templates from scene packages (with default ontology gates)
sce scene package-publish-batch \
  --manifest docs/handoffs/handoff-manifest.json \
  --json

# 3) Persist ontology publish evidence for governance/review
sce scene package-publish-batch \
  --manifest docs/handoffs/handoff-manifest.json \
  --dry-run \
  --ontology-report-out .sce/reports/scene-package-ontology-batch.json \
  --json

# 4) Validate registry + package gate
sce scene package-registry --template-dir .sce/templates/scene-packages --strict --json
sce scene package-gate-template --out .sce/templates/scene-package-gate-policy.json --profile three-layer --force --json
sce scene package-gate --registry .sce/templates/scene-packages/registry.json --policy .sce/templates/scene-package-gate-policy.json --strict --json
```

## Evidence Contract

Required artifacts for each intake batch:

- `.sce/reports/moqui-template-baseline.json`
- `.sce/reports/moqui-template-baseline.md`
- `.sce/reports/release-evidence/moqui-template-baseline.json`
- `.sce/reports/release-evidence/moqui-template-baseline.md`
- `.sce/reports/release-evidence/moqui-capability-coverage.json`
- `.sce/reports/release-evidence/moqui-capability-coverage.md`
- `.sce/reports/release-evidence/moqui-lexicon-audit.json`
- `.sce/reports/release-evidence/moqui-lexicon-audit.md`
- `.sce/reports/release-evidence/moqui-release-summary.json`
- `.sce/reports/release-evidence/moqui-release-summary.md`
- `.sce/reports/release-evidence/weekly-ops-summary.json`
- `.sce/reports/release-evidence/weekly-ops-summary.md`
- `.sce/reports/handoff-capability-matrix.md` (or JSON equivalent from `sce auto handoff capability-matrix`)
- `.sce/reports/handoff-runs/<session>.json`
- `.sce/reports/scene-package-ontology-batch.json`
- `.sce/auto/moqui-remediation.lines` (when baseline/coverage gaps exist)
- `.sce/templates/scene-packages/registry.json`
- gate output/evidence linked from release notes or handoff summary

`moqui-template-baseline.json` summary should be consumed as a matrix gate:
- `scope_breakdown` (moqui_erp / scene_orchestration / other)
- `coverage_matrix` (entity/relation/business-rule/decision coverage and closure rates)
- `gap_frequency` (top recurring ontology gaps for remediation prioritization)
- `compare.coverage_matrix_deltas` (trend deltas used to detect matrix regression/plateau between runs)
- `compare.coverage_matrix_regressions` (negative-delta signals consumed by auto remediation/recommendation flows)
- default handoff hard-gate enforces `max_moqui_matrix_regressions=0` unless explicitly relaxed
- governance close-loop block reasons include:
  - `handoff-moqui-matrix-regressions-positive:<n>`
  - `handoff-moqui-matrix-regressions-over-gate:<n>/<max>`

## Minimum Semantic Coverage

Each accepted template should include ontology semantics for:

- entity model
- relation graph
- business rules
- decision logic

If any area is weak, export remediation queue lines and feed back to close-loop:

```bash
sce scene package-publish-batch \
  --manifest docs/handoffs/handoff-manifest.json \
  --dry-run \
  --ontology-task-queue-out .sce/auto/ontology-remediation.lines \
  --json

sce auto close-loop-batch .sce/auto/ontology-remediation.lines --format lines --json
```

## Interactive Customization Template Baseline

Stage-D baseline package for the interactive business customization loop:

- `sce.scene--moqui-interactive-customization-loop--0.1.0`

This package captures:

- intent -> plan -> gate -> approval -> low-risk apply -> rollback flow
- ontology entities/relations for plan/decision/execution trace
- governance rules and decision strategy for approval and rollback constraints
