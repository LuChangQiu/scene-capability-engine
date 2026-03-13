# 92-00 Scene Template Contribute Test Closeout

Date: 2026-03-13

## Coverage added

- Added shared package fixture support in `tests/unit/utils/scene-package-fixture.js`.
- Added linter and score unit coverage in `tests/unit/scene-runtime/scene-template-linter-core.test.js`.
- Added linter and score property coverage in `tests/unit/scene-runtime/scene-template-linter-core.property.test.js`.
- Added `scene lint` command coverage in `tests/unit/commands/scene-lint.test.js`.
- Added `scene score` command coverage in `tests/unit/commands/scene-score.test.js`.
- Added `scene contribute` unit coverage in `tests/unit/commands/scene-contribute.test.js`.
- Added `scene contribute` property coverage in `tests/unit/commands/scene-contribute.property.test.js`.

## Behaviors verified

- Lint helpers now have direct coverage for required fields, binding refs, governance checks, package consistency, template variables, documentation, and end-to-end package linting.
- Score helpers now have direct coverage for dimension formulas, threshold behavior, and total-score invariants.
- `scene lint` covers default package resolution, strict-mode warning promotion, JSON output, and missing-manifest failures.
- `scene score` covers threshold validation, pass/fail scoring paths, and JSON output.
- `scene contribute` covers successful publish, dry-run, skip-lint, strict failures, validation stop, lint stop, JSON output, and unexpected publish errors.
- JSON printer round-trip behavior is property-tested across lint, score, and contribute summaries.
- Current publish behavior preserves duplicate `scene.yaml` entries when both `artifacts.entry_scene` and `artifacts.generates` reference the same path.

## Verification

```powershell
npx jest tests/unit/scene-runtime/scene-template-linter-core.test.js tests/unit/scene-runtime/scene-template-linter-core.property.test.js tests/unit/commands/scene-lint.test.js tests/unit/commands/scene-score.test.js tests/unit/commands/scene-contribute.test.js tests/unit/commands/scene-contribute.property.test.js --runInBand
```

Result: all targeted tests passed.
