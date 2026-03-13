# 89-00 Scene Lock Test Closeout

Date: 2026-03-12

## Coverage added

- Added unit coverage in `tests/unit/commands/scene-lock.test.js`.
- Added property coverage in `tests/unit/commands/scene-lock.property.test.js`.

## Behaviors verified

- Lock set persists `locked: true` on target versions.
- Lock remove deletes the `locked` property.
- Already-locked and unlocked-version error paths are covered.
- Missing package and missing version failures are exact across actions.
- `ls` returns exactly the locked versions for a package.

## Verification

```powershell
npx jest tests/unit/commands/scene-lock.test.js tests/unit/commands/scene-lock.property.test.js --runInBand
```

Result: covered by the combined owner/tag/lock run with all tests passing.
