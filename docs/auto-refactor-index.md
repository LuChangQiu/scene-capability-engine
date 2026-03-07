# Auto Refactor Index

## Goal

Reduce `lib/commands/auto.js` by extracting pure helper and presenter logic into stable modules before any mainline cutover.

## Current Shadow Modules

1. `lib/auto/session-metrics.js`
- `buildStatusCounts`
- `buildQueueFormatCounts`
- `buildMasterSpecCounts`
- `buildTopCountEntries`

2. `lib/auto/program-diagnostics.js`
- `buildProgramFailureClusters`
- `buildProgramRemediationActions`
- `buildProgramDiagnostics`

3. `lib/auto/spec-protection.js`
- `collectSpecNamesFromBatchSummary`
- `collectSpecNamesFromCloseLoopSessionPayload`
- `collectSpecNamesFromBatchSummaryPayload`
- `createProtectionReasonRecord`
- `ensureProtectionReasonRecord`
- `incrementProtectionReason`
- `buildProtectionRanking`
- `buildSpecProtectionReasonPayload`

4. `lib/auto/archive-summary.js`
- `normalizeStatusToken`
- `isCompletedStatus`
- `isFailedStatus`
- `normalizeStatsWindowDays`
- `filterEntriesByStatus`
- `filterGovernanceEntriesByResumeMode`
- `calculatePercent`

5. `lib/auto/retention-policy.js`
- `normalizeKeep`
- `normalizeSpecKeep`
- `normalizeOlderThanDays`
- `normalizeSpecSessionProtectWindowDays`
- `normalizeSpecSessionMaxTotal`
- `normalizeSpecSessionMaxCreated`
- `normalizeSpecSessionMaxCreatedPerGoal`
- `normalizeSpecSessionMaxDuplicateGoals`

6. `lib/auto/session-presenter.js`
- `presentCloseLoopSessionList`
- `presentCloseLoopSessionStats`
- `presentControllerSessionList`

7. `lib/auto/governance-signals.js`
- `normalizeHandoffText`
- `parseAutoHandoffGateBoolean`
- `normalizeAutoHandoffGateRiskLevel`
- `toGovernanceReleaseGateNumber`
- `normalizeGovernanceReleaseGateSnapshot`
- `normalizeGovernanceWeeklyOpsStopDetail`

8. `lib/auto/governance-session-presenter.js`
- `presentGovernanceSessionList`

9. `lib/auto/governance-stats-presenter.js`
- `presentGovernanceSessionStats`

10. `lib/auto/governance-maintenance-presenter.js`
- `buildAutoGovernanceMaintenancePlan`
- `summarizeGovernanceMaintenanceExecution`

## Validation Coverage

Unit tests:
- `tests/unit/auto/archive-summary.test.js`
- `tests/unit/auto/program-diagnostics.test.js`
- `tests/unit/auto/spec-protection.test.js`
- `tests/unit/auto/retention-policy.test.js`
- `tests/unit/auto/session-presenter.test.js`
- `tests/unit/auto/governance-signals.test.js`
- `tests/unit/auto/governance-session-presenter.test.js`
- `tests/unit/auto/governance-stats-presenter.test.js`
- `tests/unit/auto/governance-maintenance-presenter.test.js`
- `tests/unit/auto/governance-summary.test.js`

Integration guardrails:
- `tests/integration/auto-close-loop-cli.integration.test.js`
- `tests/integration/version-cli.integration.test.js`
- `tests/integration/legacy-migration-guard-cli.integration.test.js`
- `tests/integration/takeover-baseline-cli.integration.test.js`

## Safe Mainline Cutover Order

1. `session-metrics`
- Low-level counters only.
- Must verify: `auto session`, `batch-session`, `controller-session`, `governance stats`.

2. `archive-summary`
- Shared status classification and percent calculation.
- Must verify: all session list/stats commands.

3. `retention-policy`
- Shared retention/prune argument normalization.
- Must verify: `session/spec-session/batch-session/controller-session/governance-session prune`.

4. `spec-protection`
- Shared spec protection and reason ranking.
- Must verify: `spec-session prune` and `close-loop-batch` budget guard.

5. `session-presenter`
- Shared result payload builders for session list/stats.
- Must verify: all session list/stats commands and `auto governance stats`.

6. `governance-signals`
- Shared release gate / weekly ops normalization.
- Must verify: `auto governance stats`, `maintain`, `close-loop`.

7. `program-diagnostics`
- Shared close-loop program failure clustering and remediation advice.
- Must verify: `close-loop-program`, `close-loop-recover`, KPI/audit outputs.

8. `governance-session-presenter`
- Shared governance session list payload builder.
- Must verify: `auto governance session list`.

9. `governance-stats-presenter`
- Shared governance stats payload builder.
- Must verify: `auto governance stats`.

10. `governance-maintenance-presenter`
- Shared maintenance plan/result summary.
- Must verify: `auto governance maintain` and `auto governance close-loop`.

## Current Policy

- Shadow modules may be added freely if they are pure and unit-tested.
- Mainline cutover is allowed only one cluster at a time.
- Every cutover requires:
  1. `node --check lib/commands/auto.js`
  2. `npx jest tests/integration/auto-close-loop-cli.integration.test.js --runInBand`
  3. If startup behavior is touched, also run:
     - `tests/integration/version-cli.integration.test.js`
     - `tests/integration/legacy-migration-guard-cli.integration.test.js`
     - `tests/integration/takeover-baseline-cli.integration.test.js`

## Stop Condition

Do not continue cutover if any single-cluster change causes broad `auto-close-loop` integration failures. Revert that cutover and keep only the shadow module + unit tests.
