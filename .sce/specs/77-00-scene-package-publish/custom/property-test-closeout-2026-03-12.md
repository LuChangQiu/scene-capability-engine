# Scene Package Publish Property-Test Closeout

Date: 2026-03-12

## Scope

- Completed the remaining optional test work for `77-00-scene-package-publish`.
- Added property coverage for tarball, semver, registry index, duplicate protection, dry-run, and unpublish not-found behavior.
- Added a focused unit test for `normalizeScenePackagePublishOptions`.
- Tightened `normalizeRelativePath()` so publish-related relative paths trim surrounding whitespace before normalization.

## Changes

- `lib/commands/scene.js`
  - `normalizeRelativePath()` now trims surrounding whitespace before slash normalization.
- `tests/unit/commands/scene-package-publish.test.js`
  - Covers `normalizeScenePackagePublishOptions` defaults and trimmed input handling.
- `tests/unit/commands/scene-package-publish.property.test.js`
  - Property: tarball round-trip integrity
  - Property: SHA-256 determinism for identical bundle input
  - Property: tarball naming and registry path construction
  - Property: publish semver acceptance consistency
  - Property: file existence verification
  - Property: latest pointer equals highest semver
  - Property: index entry completeness after publish
  - Property: unpublish updates latest and removes target version
  - Property: duplicate rejection / force overwrite behavior
  - Property: registry index JSON round-trip
  - Property: dry-run publish produces no filesystem side effects
  - Property: unpublish not-found leaves registry unchanged

## Verification

- `npx jest tests/unit/commands/scene-package-publish.property.test.js tests/unit/commands/scene-package-publish.test.js tests/unit/commands/scene.test.js --runInBand`

## Outcome

- `77-00-scene-package-publish` optional test backlog is now fully closed.
