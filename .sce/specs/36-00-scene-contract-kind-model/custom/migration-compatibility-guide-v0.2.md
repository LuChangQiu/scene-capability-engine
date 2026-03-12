# Migration and Compatibility Guide v0.2

## Principles

- keep legacy SCE spec workflow intact
- add Scene/Kind artifacts without breaking existing docs
- migrate domain by domain with pilot-first strategy

## Migration Path

### Step 1: Additive Artifacts
- keep requirements.md/design.md/tasks.md unchanged
- add scene/datacontract/policy/eval manifests under custom/

### Step 2: Shadow Runtime
- compile plan in dry_run only
- compare output against current manual workflow

### Step 3: Controlled Commit
- enable commit for low-risk ERP scenes first
- keep approval gates for medium/high risk scenes

### Step 4: Hybrid Expansion
- add robot adapter integration in dry_run first
- enable commit only after safety drill pass

## Compatibility Matrix

| Existing SCE Capability | Compatibility | Notes |
| --- | --- | --- |
| spec directory structure | full | unchanged |
| docs governance | full | new artifacts placed in custom/ |
| templates | full | can package scene artifacts incrementally |
| collab metadata | partial | extend with kind/domain tags later |
| auto/ops modules | partial | use as control references, not runtime executor |

## Rollback Strategy

- disable commit mode per scene
- keep dry_run available
- replay using audit events and evidence bundle
