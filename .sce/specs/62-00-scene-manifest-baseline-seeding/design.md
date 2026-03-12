# Design Document: Scene Manifest Baseline Seeding

## Overview

Enable discovery/routing readiness by seeding starter scene manifests across current scene-focused specs.
The seeding process reuses `scene scaffold` and keeps outputs under each spec's `custom/scene.yaml`.

## Scope

Seed target specs:
- `36-00` through `58-00` scene lineage specs
- `61-00` scene catalog spec
- `37-00` uses hybrid template; others use erp template

## Naming Conventions

- `obj_id`: `scene.<domain>.<spec-slug>`
  - ERP: `scene.erp.<spec-slug>`
  - Hybrid: `scene.hybrid.<spec-slug>`
- `title`: derived from spec slug words in Title Case
- `obj_version`: scaffold default `0.2.0`

## Flow

1. Enumerate target specs.
2. Scaffold `custom/scene.yaml` into each spec with deterministic metadata.
3. Run `scene catalog` to confirm valid, non-zero discovery.
4. Record output evidence and compliance checks.

## Validation

- `sce scene catalog`
- `sce status`
- `sce doctor --docs`
