# 91-00 Moqui Scene Template Extractor Test Closeout

Date: 2026-03-12

## Coverage added

- Added property coverage in `tests/unit/scene-runtime/moqui-extractor.property.test.js`.
- Added focused CLI unit coverage in `tests/unit/commands/scene-extract.test.js`.
- Added CLI validation property coverage in `tests/unit/commands/scene-extract.property.test.js`.

## Behaviors verified

- YAML serializer/parser round-trip supported manifest-shaped objects.
- Entity grouping preserves all generated entities and keeps composite header/item pairs together.
- Pattern analysis emits valid pattern classes and honors `--pattern` filtering.
- Manifest and package contract generation preserve required versions, kinds, governance defaults, and binding counts.
- Extraction results remain JSON round-trippable for script and snapshot use.
- Bundle writing creates the expected `scene.yaml` and `scene-package.json` structure.
- Dry-run extraction avoids filesystem writes.
- Partial write failures are isolated to failed bundles while successful bundles still persist.
- `scene extract` option validation rejects unsupported `--type` and `--pattern` values.
- `runSceneExtractCommand` covers both injected-client success and config-driven failure payloads.

## Verification

```powershell
npx jest tests/unit/scene-runtime/moqui-extractor.property.test.js tests/unit/commands/scene-extract.test.js tests/unit/commands/scene-extract.property.test.js --runInBand
```

Result: 17 tests passed.
