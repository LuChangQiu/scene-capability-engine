# 80-00 Scene Version Bump Test Closeout

Date: 2026-03-13

## Coverage added

- Added unit coverage in `tests/unit/commands/scene-version.test.js`.
- Added property coverage in `tests/unit/commands/scene-version.property.test.js`.

## Behaviors verified

- Normalize, validate, and print helpers cover defaults, trimming, invalid bump rejection, JSON output, and dry-run labeling.
- `runSceneVersionCommand` covers patch/minor/major increments, explicit version bumps, dry-run mode, file read failures, invalid current versions, non-increasing explicit versions, and write failures.
- Property tests verify `semver.inc` parity, explicit ordering enforcement, write round-trip correctness, validation rejection for unsupported bump values, and JSON payload field completeness.

## Verification

```powershell
npx jest tests/unit/commands/scene-version.test.js tests/unit/commands/scene-version.property.test.js --runInBand
```

Result: all targeted tests passed.
