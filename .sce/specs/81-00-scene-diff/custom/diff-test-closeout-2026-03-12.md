# Scene Diff Test Closeout

Date: 2026-03-12

## Scope

- Completed the remaining optional test tasks for `81-00-scene-diff`.
- Closed a latent spec gap where binary file diffs were never surfaced as `binary content differs`.
- Tightened `--stat` output so modified files print only the path summary without line-detail suffixes.

## Changes

- `lib/commands/scene.js`
  - Added binary-content detection for package diff comparisons.
  - Extracted changed-line counting into a dedicated helper.
  - Suppressed per-file line detail in `--stat` output.
- `tests/unit/commands/scene-diff.test.js`
  - Added helper and command coverage for categorize/normalize/validate/print/run flows.
  - Added binary diff regression coverage.
- `tests/unit/commands/scene-diff.property.test.js`
  - Added `fast-check` properties for symmetry and completeness with 100 runs each.

## Verification

- `npx jest tests/unit/commands/scene-diff.test.js tests/unit/commands/scene-diff.property.test.js tests/unit/commands/scene.test.js --runInBand`

## Outcome

- `81-00-scene-diff` is now fully complete at the spec task level.
