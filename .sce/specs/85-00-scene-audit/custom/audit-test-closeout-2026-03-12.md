# 85-00 Scene Audit Test Closeout

Date: 2026-03-12

## Coverage added

- Added unit coverage in `tests/unit/commands/scene-audit.test.js`.
- Added property coverage in `tests/unit/commands/scene-audit.property.test.js`.

## Behaviors verified

- `normalizeSceneAuditOptions`, `validateSceneAuditOptions`, `collectTgzFiles`, and `computeFileIntegrity` cover the helper surface.
- `runSceneAuditCommand` covers empty-registry, healthy-registry, missing tarball, integrity mismatch, orphan detection, deprecated reporting, and `--fix` cleanup paths.
- `printSceneAuditSummary` preserves JSON payload structure in `--json` mode.

## Property evidence

- Summary counts stay aligned with package/version totals and issue bucket sizes.
- Missing tarball detection matches the exact set of missing version tarballs.
- Integrity mismatches match the exact set of present-but-hash-mismatched tarballs.
- Orphaned tarball detection matches the exact set of disk tarballs not referenced by the index.
- Deprecated reporting matches the exact set of version entries carrying `deprecated`.
- Fix mode removes orphaned tarballs and deletes missing-tarball version entries from the saved index.

## Verification

```powershell
npx jest tests/unit/commands/scene-audit.test.js tests/unit/commands/scene-audit.property.test.js --runInBand
```

Result: 15 tests passed.
