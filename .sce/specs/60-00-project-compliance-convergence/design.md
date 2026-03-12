# Design Document: Project Compliance Convergence

## Overview

Convergence combines filesystem reorganization and status normalization without rewriting
historical implementation details.

## Compliance Strategy

1. Relocate root non-allowlisted markdown files into `docs/`.
2. Relocate spec-level free markdown artifacts into `reports/` subdirectories.
3. Normalize non-standard spec subdirectories into allowed paths (e.g., `custom/`).
4. Release any active spec locks so no `.lock` file remains as compliance noise.

## Status Strategy

- Use marker-based status mode from spec 59 for deterministic completion reporting.
- Keep historical task plans intact while exposing concise status markers for governance output.

## Validation Plan

- `sce doctor --docs`
- `sce status`
- Targeted tests for status/task parser
- Full test suite smoke (`npm test -- --runInBand`) for final confidence
