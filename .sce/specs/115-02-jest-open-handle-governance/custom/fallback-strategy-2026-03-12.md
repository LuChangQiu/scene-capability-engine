# Jest Open Handle Transitional Fallback Strategy

Date: 2026-03-12

## Context

`forceExit` has already been removed from the default Jest paths:

- `jest.config.js`
- `jest.config.ci.js`

The remaining residual risk is narrower:

- `npm run test:smoke` is the stable gated path
- `npm run test:handles` is the diagnostic path
- `npm run test:full` may still surface worker-shutdown warnings under parallel execution

## Transitional Rules

1. Do not reintroduce `forceExit` into default Jest config.
2. Keep release and CI gates on the trusted command path:
   - `npm run test:smoke`
   - `npm run test:ci`
3. Use `npm run test:handles` as the first-line diagnosis command when resource leaks are suspected.
4. Treat `npm run test:full` worker shutdown warnings as a remediation signal, not as justification for restoring forced exit behavior.

## Operator Workflow

When full-suite worker warnings reappear:

1. Run `npm run test:handles`
2. Run the suspect suite or command in-band
3. Inspect watcher, timer, child-process, and teardown cleanup paths
4. Only close the issue after warning-free rerun, not by masking it with forced exit

## Exit Criteria

This fallback note can be removed when all of the following are true:

- `npm run test:full` completes without worker forced-exit warnings
- no diagnostic open-handle traces remain under `npm run test:handles`
- watch/integration cleanup behavior is stable in regression runs
