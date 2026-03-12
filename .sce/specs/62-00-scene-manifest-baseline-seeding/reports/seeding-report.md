# Scene Manifest Seeding Report

## Scope

- Seeded specs: `36-00` to `58-00`, and `61-00`
- Manifest path: `custom/scene.yaml`
- Template strategy:
  - `37-00`: `hybrid`
  - others: `erp`

## Naming Convention

- `obj_id`: `scene.<domain>.<spec-slug>`
- `title`: title-cased words from spec slug
- `obj_version`: `0.2.0`

## Verification Commands

- `sce scene catalog`
- `sce status`
- `sce doctor --docs`

## Result Snapshot

- `scene catalog` discovered 24 manifests with 24 valid entries and 0 invalid entries.
