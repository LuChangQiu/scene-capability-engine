# 84-00 Scene Deprecate Test Closeout

Date: 2026-03-12

## Coverage added

- Added unit coverage in `tests/unit/commands/scene-deprecate.test.js`.
- Added property coverage in `tests/unit/commands/scene-deprecate.property.test.js`.

## Behaviors verified

- `runSceneDeprecateCommand` covers single-version and all-version deprecate flows.
- Undo flows remove `deprecated` markers for single-version and all-version targets.
- Missing package, missing version, and validation failures return `null`, set `process.exitCode = 1`, and avoid registry writes.
- `runSceneInstallCommand` prints a deprecation warning and still returns a dry-run install payload.
- `runSceneInfoCommand` and `printSceneInfoSummary` preserve and render deprecation metadata.

## Property evidence

- Targeted versions receive the requested deprecation marker and untargeted versions remain unchanged.
- Deprecate followed by undo restores the original version map for valid targets.
- Invalid package/version targets leave the registry index unchanged.
- Full-package deprecations report an affected version count equal to the registry version count.
- Info payloads include `deprecated` only for versions carrying a deprecation marker.

## Verification

```powershell
npx jest tests/unit/commands/scene-deprecate.test.js tests/unit/commands/scene-deprecate.property.test.js --runInBand
```

Result: 18 tests passed.
