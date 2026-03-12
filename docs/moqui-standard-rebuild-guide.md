# Moqui Standard Rebuild Guide

This guide bootstraps a standard Moqui recovery bundle using SCE templates and metadata.
It is designed to avoid direct interference with an in-progress `331-poc` repair stream.

## Goal

- Rebuild baseline business capability assets from metadata.
- Keep original Moqui technology stack unchanged.
- Add a page-level human/AI copilot dialog contract for contextual fixes.

## Recommended Workspace Strategy

1. Keep SCE in `E:/workspace/kiro-spec-engine` for reusable rebuild tooling.
2. Keep business rebuild target isolated (recommended): `E:/workspace/331-poc-rebuild`.
3. Do not write generated recovery files into live `331-poc` unless explicitly approved.

## Input Metadata (minimum)

Provide a JSON file with at least one of these arrays:

- `entities`
- `services`
- `screens`
- `forms`

Optional:

- `business_rules`
- `decisions`

## Step 1: Extract Metadata (from Moqui project)

```bash
node scripts/moqui-metadata-extract.js \
  --project-dir E:/workspace/your-moqui-project \
  --out docs/moqui/metadata-catalog.json \
  --markdown-out docs/moqui/metadata-catalog.md \
  --json
```

`moqui-metadata-extract` now performs multi-source catalog extraction by default:
- Moqui XML (`entity/service/screen/form/rule/decision`)
- `scene-package.json` contracts in `.sce/specs/**/docs/`
- `docs/handoffs/handoff-manifest.json`
- `docs/handoffs/capability-matrix.md`
- `docs/handoffs/evidence/**/*.json`
- `.sce/recovery/salvage/**/*.json` (if present)

## Step 2: Build Rebuild Bundle

```bash
node scripts/moqui-standard-rebuild.js \
  --metadata docs/moqui/metadata-catalog.json \
  --out .sce/reports/recovery/moqui-standard-rebuild.json \
  --markdown-out .sce/reports/recovery/moqui-standard-rebuild.md \
  --bundle-out .sce/reports/recovery/moqui-standard-bundle \
  --json
```

## Step 3: Run Rebuild Readiness Gate (recommended for CI/release)

```bash
node scripts/moqui-rebuild-gate.js \
  --metadata docs/moqui/metadata-catalog.json \
  --out .sce/reports/recovery/moqui-standard-rebuild.json \
  --markdown-out .sce/reports/recovery/moqui-standard-rebuild.md \
  --bundle-out .sce/reports/recovery/moqui-standard-bundle
```

Defaults: `ready>=6`, `partial<=0`, `gap<=0`.

## Generated Bundle

- `handoff/handoff-manifest.json`: seed manifest for SCE handoff gates.
- `ontology/moqui-ontology-seed.json`: initial ontology graph seed.
- `rebuild/recovery-spec-plan.json`: ordered recovery spec list.
- `rebuild/matrix-remediation.lines`: prioritized remediation queue lines derived from template readiness gaps.
- `rebuild/matrix-remediation-plan.json`: gap-to-source-file remediation plan for quick 331 execution.
- `rebuild/matrix-remediation-plan.md`: markdown view of remediation plan.
- `copilot/page-context-contract.json`: page-context contract for copilot dialog.
- `copilot/conversation-playbook.md`: operational playbook for human/AI page fixes.
- rebuild report includes template readiness scoring (`recovery.readiness_matrix`) and prioritized remediation items (`recovery.prioritized_gaps`).

## Default Moqui Template Matrix

- `sce.scene--moqui-entity-model-core--0.1.0`
- `sce.scene--moqui-service-contract-core--0.1.0`
- `sce.scene--moqui-screen-flow-core--0.1.0`
- `sce.scene--moqui-form-interaction-core--0.1.0`
- `sce.scene--moqui-rule-decision-core--0.1.0`
- `sce.scene--moqui-page-copilot-dialog--0.1.0`

## Next Step for Business Project

Use generated assets as input to a dedicated rebuild project (for example `331-poc-rebuild`) and execute normal SCE handoff + gate flows there.
