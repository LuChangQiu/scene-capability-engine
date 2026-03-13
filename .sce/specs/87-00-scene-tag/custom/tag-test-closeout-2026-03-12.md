# 87-00 Scene Tag Test Closeout

Date: 2026-03-12

## Coverage added

- Added unit coverage in `tests/unit/commands/scene-tag.test.js`.
- Added property coverage in `tests/unit/commands/scene-tag.property.test.js`.

## Behaviors verified

- Tag add persists and overwrites mappings for valid versions.
- Tag remove deletes mappings and rejects missing tags.
- Tag list returns explicit tags plus `latest`, or an empty map when unset.
- Protected `latest` validation remains enforced.
- Missing package and missing version failures are exact across command actions.

## Verification

```powershell
npx jest tests/unit/commands/scene-tag.test.js tests/unit/commands/scene-tag.property.test.js --runInBand
```

Result: covered by the combined owner/tag/lock run with all tests passing.
