# Watch Cleanup Closeout

Date: 2026-03-12

## Scope

- Closed the remaining `115-02` work items around watch/integration cleanup and timer/process lifecycle control.
- Kept `forceExit` out of the default Jest path; fixes stay in runtime and test cleanup layers.

## Changes

- `lib/watch/file-watcher.js`
  - Track initialization and recovery timers explicitly.
  - `unref()` long-lived timers so they do not pin the event loop.
  - Dispose chokidar watcher on failed startup, not only on normal stop.
- `lib/watch/watch-manager.js`
  - Convert restart delay to an unref'ed sleep.
- `lib/watch/event-debouncer.js`
  - `unref()` debounce timers.
- `lib/watch/action-executor.js`
  - Convert retry backoff waits to an unref'ed sleep.
- `lib/commands/watch.js`
  - Convert follow-loop polling wait to an unref'ed sleep.
- `tests/helpers/command-test-helper.js`
  - `unref()` command timeout and polling intervals used by integration helpers.
- `tests/helpers/async-wait-helpers.js`
  - Centralize polling/retry waits on unref'ed timers.
- `tests/integration/cli-runner.js`
  - `unref()` per-run timeout guarding spawned CLI processes.

## Verification

- `npx jest tests/unit/file-watcher.test.js tests/unit/watch-manager.test.js tests/unit/watch-commands.test.js tests/unit/watch-preset-commands.test.js tests/integration/watch-mode-integration.test.js --runInBand`
- `npx jest tests/unit/file-watcher.test.js tests/unit/watch-manager.test.js tests/unit/watch-commands.test.js tests/unit/watch-preset-commands.test.js tests/integration/watch-mode-integration.test.js --runInBand --detectOpenHandles`

## Outcome

- Watch-focused suites pass both normally and under Jest open-handle detection.
- Remaining `115-02` implementation tasks 2.1 and 2.2 are now satisfied.
