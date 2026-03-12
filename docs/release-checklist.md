# Release Checklist

> Minimal, repeatable checklist before publishing a new sce version.

---

## 1. Functional Verification

```bash
# Default release test gate (integration-only)
npm run test:release

# Optional full regression suite (unit + integration + properties)
npm run test:full

# Guardrail: fail on newly introduced .skip tests
npm run test:skip-audit

# Unit tests for value observability commands
npm test -- tests/unit/commands/value-metrics.test.js

# CLI smoke checks
node bin/scene-capability-engine.js --help
node bin/scene-capability-engine.js value metrics --help
```

---

## 2. Value Observability Smoke Flow

```bash
sce value metrics sample --out ./kpi-input.json --json
sce value metrics snapshot --input ./kpi-input.json --json
node scripts/release-ops-weekly-summary.js --json
node scripts/release-risk-remediation-bundle.js --gate-report .sce/reports/release-evidence/release-gate.json --json
```

Expected:

- `sample` writes a valid JSON scaffold.
- `snapshot` returns machine-readable result with `snapshot_path` and risk metadata.
- `release-ops-weekly-summary` emits weekly governance risk card (`json` + `markdown`) under release-evidence.
- `release-risk-remediation-bundle` outputs unified weekly/drift remediation commands (`json` + `markdown` + `lines`).

---

## 3. Security Governance Baseline

Confirm default baseline controls are still active:

- `docs/security-governance-default-baseline.md` is aligned with current release policy.
- interactive governance gate uses `--fail-on-alert` in CI/release.
- approval/execution ledgers are retained for audit (`interactive-approval-events.jsonl`, `interactive-execution-ledger.jsonl`).
- release evidence includes weekly ops summary and governance snapshot assets.

---

## 4. Packaging Hygiene

```bash
npm pack --dry-run
```

Verify:

- No transient artifacts (for example `__pycache__`, `*.pyc`) in tarball listing.
- Tarball size remains within expected range for current release.

---

## 5. Documentation Consistency

Check that key docs are aligned with current version and capabilities:

- `README.md`
- `README.zh.md`
- `docs/command-reference.md`
- `docs/quick-start.md`
- `docs/zh/quick-start.md`
- `CHANGELOG.md`

Optional sanity scan:

```bash
rg -n "yourusername|support@example.com" README.md README.zh.md docs docs/zh -S

# Canonical repository link check (should return no matches)
rg -n "github.com/scene-capability-engine/sce" README.md README.zh.md docs START_HERE.txt INSTALL_OFFLINE.txt -S -g "!docs/release-checklist.md" -g "!docs/zh/release-checklist.md"
```

---

## 6. Git Readiness

```bash
git status -sb
git log --oneline -n 15

# Mandatory managed-repo gate (default in prepublish/release preflight)
node scripts/git-managed-gate.js --fail-on-violation --json
```

Verify:

- Working tree is clean.
- Commits are logically grouped and messages are release-ready.
- If GitHub/GitLab remote exists, current branch is upstream-tracked and fully synced (ahead=0, behind=0).
- If customer has no GitHub/GitLab, gate can be bypassed by policy (`SCE_GIT_MANAGEMENT_ALLOW_NO_REMOTE=1`, default).
- In CI/tag detached-HEAD contexts, branch/upstream sync checks are relaxed by default; enforce strict mode with `SCE_GIT_MANAGEMENT_STRICT_CI=1` when needed.
- Errorbook release gate also enforces temporary mitigation governance: active fallback entries must include cleanup task + exit criteria + deadline, and must not be expired.

---

## 7. Publish Readiness

Ensure:

- Release automation is tag-driven, not commit-driven:
  - `.github/workflows/release.yml` only triggers on `push.tags: v*`
  - plain `git push` runs normal CI and does not publish npm/GitHub release
- GitHub Actions publish prerequisites are in place:
  - repository secret `NPM_TOKEN` must exist and remain valid for `npm publish --access public`
  - `GITHUB_TOKEN` is used by workflow for release asset/readback steps
- `package.json` version is correct.
- `package.json` version must be greater than the currently published npm version.
- `CHANGELOG.md` includes release-relevant entries.
- Release notes draft exists (for example `docs/releases/vX.Y.Z.md`).
- Optional: configure release evidence gate with repository variables (`Settings -> Secrets and variables -> Actions -> Variables`):
  - `SCE_RELEASE_GATE_ENFORCE`: `true|false` (default advisory, non-blocking)
  - `SCE_RELEASE_GATE_REQUIRE_EVIDENCE`: require `handoff-runs.json` summary
  - `SCE_RELEASE_GATE_REQUIRE_GATE_PASS`: require evidence gate `passed=true` (default true when evidence exists)
  - `SCE_RELEASE_GATE_MIN_SPEC_SUCCESS_RATE`: minimum allowed success rate percent
  - `SCE_RELEASE_GATE_MAX_RISK_LEVEL`: `low|medium|high|unknown` (default `unknown`)
  - `SCE_RELEASE_GATE_MAX_UNMAPPED_RULES`: maximum allowed unmapped ontology business rules
  - `SCE_RELEASE_GATE_MAX_UNDECIDED_DECISIONS`: maximum allowed undecided ontology decisions
  - `SCE_RELEASE_GATE_REQUIRE_SCENE_BATCH_PASS`: require scene package publish-batch gate passed (`true|false`, default `true`)
  - `SCE_RELEASE_GATE_MAX_SCENE_BATCH_FAILURES`: maximum allowed scene package batch failure count (default `0`)
- Optional: tune release drift alerts in release notes:
  - Drift evaluation is executed by `scripts/release-drift-evaluate.js` in CI (history load, alert calc, gate report writeback, enforce exit code).
  - `SCE_RELEASE_DRIFT_ENFORCE`: `true|false` (default `false`), block publish when drift alerts are triggered
  - `SCE_RELEASE_DRIFT_FAIL_STREAK_MIN`: minimum consecutive failed gates to trigger alert (default `2`)
  - `SCE_RELEASE_DRIFT_HIGH_RISK_SHARE_MIN_PERCENT`: minimum high-risk share in latest 5 versions (default `60`)
  - `SCE_RELEASE_DRIFT_HIGH_RISK_SHARE_DELTA_MIN_PERCENT`: minimum short-vs-long high-risk share delta (default `25`)
  - `SCE_RELEASE_DRIFT_PREFLIGHT_BLOCK_RATE_MIN_PERCENT`: minimum release preflight blocked rate in latest 5 known runs (default `40`)
  - `SCE_RELEASE_DRIFT_HARD_GATE_BLOCK_STREAK_MIN`: minimum consecutive hard-gate preflight blocked streak (latest window, default `2`)
  - `SCE_RELEASE_DRIFT_PREFLIGHT_UNAVAILABLE_STREAK_MIN`: minimum consecutive release preflight unavailable streak (latest window, default `2`)
- Optional: tune weekly ops release gate:
  - `SCE_RELEASE_WEEKLY_OPS_ENFORCE`: `true|false` (default `true`)
  - `SCE_RELEASE_WEEKLY_OPS_REQUIRE_SUMMARY`: require weekly summary artifact (`true|false`, default `true`)
  - `SCE_RELEASE_WEEKLY_OPS_MAX_RISK_LEVEL`: `low|medium|high|unknown` (default `medium`)
  - `SCE_RELEASE_WEEKLY_OPS_MAX_GOVERNANCE_BREACHES`: optional max breach count
  - `SCE_RELEASE_WEEKLY_OPS_MAX_AUTHORIZATION_TIER_BLOCK_RATE_PERCENT`: max authorization-tier deny/review block rate percent (default `40`)
  - `SCE_RELEASE_WEEKLY_OPS_MAX_DIALOGUE_AUTHORIZATION_BLOCK_RATE_PERCENT`: max dialogue-authorization block rate percent (default `40`)
  - `SCE_RELEASE_WEEKLY_OPS_MAX_MATRIX_REGRESSION_RATE_PERCENT`: optional max regression-positive rate percent
  - Invalid numeric values are reported as gate `config_warnings` and default threshold fallback is applied.
- Optional: tune release asset integrity gate:
  - `SCE_RELEASE_ASSET_INTEGRITY_ENFORCE`: `true|false` (default `true`)
  - `SCE_RELEASE_ASSET_INTEGRITY_REQUIRE_NON_EMPTY`: `true|false` (default `true`)
  - `SCE_RELEASE_ASSET_INTEGRITY_REQUIRED_FILES`: override required asset list (comma-separated, supports `{tag}`)
- Optional release-asset 0-byte guard (enabled in workflow by default):
  - `scripts/release-asset-nonempty-normalize.js` auto-fills placeholder content for optional assets such as `.lines` and `.jsonl` before GitHub Release upload.
  - Local dry-run example:
    - `node scripts/release-asset-nonempty-normalize.js --file .sce/reports/release-evidence/matrix-remediation-vX.Y.Z.lines --kind lines --note "no matrix remediation items for this release" --dry-run --json`
  - Local normalize example:
    - `node scripts/release-asset-nonempty-normalize.js --file .sce/reports/release-evidence/interactive-matrix-signals-vX.Y.Z.jsonl --kind jsonl --event interactive-matrix-signals --note "No interactive matrix signals collected for this release." --json`
- Optional local dry-run for gate history index artifact:
  - `sce auto handoff gate-index --dir .sce/reports/release-evidence --out .sce/reports/release-evidence/release-gate-history.json --json`

Then proceed with your release workflow:

```bash
# 1. bump version + commit first
# 2. push branch changes
git push origin main

# 3. create and push release tag
git tag vX.Y.Z
git push origin vX.Y.Z
```

Expected:

- `git push origin main` only runs normal CI.
- `git push origin vX.Y.Z` triggers GitHub Actions `Release` workflow.
- workflow publishes npm package and creates GitHub Release if all release gates pass.
