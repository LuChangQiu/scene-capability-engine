# Auto Refactor Index

## Goal

Reduce `lib/commands/auto.js` by extracting helper, presenter, policy, service, and storage logic into stable modules before final command-layer slimming.

## Extracted Modules

1. `lib/auto/session-metrics.js`
- `buildStatusCounts`
- `buildQueueFormatCounts`
- `buildMasterSpecCounts`

2. `lib/auto/archive-summary.js`
- `normalizeStatusToken`
- `isCompletedStatus`
- `isFailedStatus`
- `normalizeStatsWindowDays`
- `filterEntriesByStatus`
- `filterGovernanceEntriesByResumeMode`
- `calculatePercent`

3. `lib/auto/retention-policy.js`
- `normalizeKeep`
- `normalizeSpecKeep`
- `normalizeOlderThanDays`
- `normalizeSpecSessionProtectWindowDays`
- `normalizeSpecSessionMaxTotal`
- `normalizeSpecSessionMaxCreated`
- `normalizeSpecSessionMaxCreatedPerGoal`
- `normalizeSpecSessionMaxDuplicateGoals`

4. `lib/auto/spec-protection.js`
- `collectSpecNamesFromBatchSummary`
- `collectSpecNamesFromCloseLoopSessionPayload`
- `collectSpecNamesFromBatchSummaryPayload`
- `createProtectionReasonRecord`
- `ensureProtectionReasonRecord`
- `incrementProtectionReason`
- `buildProtectionRanking`
- `buildSpecProtectionReasonPayload`

5. `lib/auto/session-presenter.js`
- `presentCloseLoopSessionList`
- `presentCloseLoopSessionStats`
- `presentControllerSessionList`

6. `lib/auto/governance-signals.js`
- `normalizeHandoffText`
- `parseAutoHandoffGateBoolean`
- `normalizeAutoHandoffGateRiskLevel`
- `toGovernanceReleaseGateNumber`
- `normalizeGovernanceReleaseGateSnapshot`
- `normalizeGovernanceWeeklyOpsStopDetail`

7. `lib/auto/governance-session-presenter.js`
- `presentGovernanceSessionList`

8. `lib/auto/governance-stats-presenter.js`
- `presentGovernanceSessionStats`

9. `lib/auto/governance-maintenance-presenter.js`
- `buildAutoGovernanceMaintenancePlan`
- `summarizeGovernanceMaintenanceExecution`

10. `lib/auto/governance-summary.js`
- `deriveGovernanceRiskLevel`
- `buildGovernanceConcerns`
- `buildGovernanceRecommendations`

11. `lib/auto/program-diagnostics.js`
- `buildProgramFailureClusters`
- `buildProgramRemediationActions`
- `buildProgramDiagnostics`

12. `lib/auto/governance-maintenance-service.js`
- `runAutoGovernanceMaintenance`

13. `lib/auto/governance-close-loop-service.js`
- `runAutoGovernanceCloseLoop`

14. `lib/auto/governance-stats-service.js`
- `buildAutoGovernanceStats`

15. `lib/auto/governance-advisory-service.js`
- `executeGovernanceAdvisoryRecover`
- `executeGovernanceAdvisoryControllerResume`

16. `lib/auto/recovery-selection-service.js`
- `resolveLatestRecoverableBatchSummary`
- `resolveLatestPendingControllerSession`

17. `lib/auto/close-loop-recovery-service.js`
- `executeCloseLoopRecoveryCycle`

18. `lib/auto/session-query-service.js`
- `listCloseLoopSessions`
- `statsCloseLoopSessions`
- `listGovernanceCloseLoopSessions`
- `statsGovernanceCloseLoopSessions`
- `listCloseLoopControllerSessions`
- `statsCloseLoopControllerSessions`

19. `lib/auto/session-prune-service.js`
- `pruneCloseLoopBatchSummarySessions`
- `pruneCloseLoopControllerSessions`
- `pruneCloseLoopSessions`
- `pruneCloseLoopBatchSummarySessionsCli`
- `pruneCloseLoopControllerSessionsCli`

20. `lib/auto/session-persistence-service.js`
- `maybePersistCloseLoopControllerSummary`
- `maybePersistCloseLoopBatchSummary`

21. `lib/auto/governance-session-storage-service.js`
- `readGovernanceCloseLoopSessionEntries`
- `loadGovernanceCloseLoopSessionPayload`
- `persistGovernanceCloseLoopSession`

22. `lib/auto/controller-session-storage-service.js`
- `readCloseLoopControllerSessionEntries`
- `loadCloseLoopControllerSessionPayload`

23. `lib/auto/batch-summary-storage-service.js`
- `getCloseLoopBatchSummaryDir`
- `readCloseLoopBatchSummaryEntries`
- `loadCloseLoopBatchSummaryPayload`

24. `lib/auto/close-loop-session-storage-service.js`
- `getCloseLoopSessionDir`
- `readCloseLoopSessionEntries`

25. `lib/auto/archive-schema-service.js`
- `normalizeSchemaScope`
- `normalizeTargetSchemaVersion`
- `getAutoArchiveSchemaTargets`
- `classifyArchiveSchemaCompatibility`
- `checkAutoArchiveSchema`
- `migrateAutoArchiveSchema`

26. `lib/auto/controller-queue-service.js`
- `resolveControllerQueueFile`
- `resolveControllerQueueFormat`
- `dedupeControllerGoals`
- `loadControllerGoalQueue`
- `writeControllerGoalQueue`
- `appendControllerGoalArchive`

27. `lib/auto/controller-lock-service.js`
- `buildControllerLockPayload`
- `resolveControllerLockFile`
- `readControllerLockPayload`
- `writeControllerLockPayload`
- `isControllerLockStale`

28. `lib/auto/controller-output.js`
- `printCloseLoopControllerSummary`

29. `lib/auto/close-loop-controller-service.js`
- `runCloseLoopController`

30. `lib/auto/close-loop-batch-service.js`
- `executeCloseLoopBatch`

31. `lib/auto/observability-service.js`
- `buildAutoObservabilitySnapshot`

32. `lib/auto/close-loop-program-service.js`
- `executeCloseLoopProgramGoal`

33. `lib/auto/program-summary.js`
- `resolveResultSourceIndex`
- `getBatchFailureStatusSet`
- `buildProgramCoordinationSnapshot`
- `mergeProgramRecoveryIntoProgramSummary`
- `buildProgramKpiSnapshot`

34. `lib/auto/program-output.js`
- `maybeWriteProgramKpi`
- `maybeWriteProgramAudit`

35. `lib/auto/batch-output.js`
- `printCloseLoopBatchSummary`

36. `lib/auto/program-governance-helpers.js`
- `normalizeProgramGateFallbackProfile`
- `normalizeProgramGateFallbackChain`
- `resolveProgramGateFallbackChain`
- `resolveProgramGatePolicy`
- `evaluateProgramConvergenceGate`
- `buildProgramAnomalyGovernancePatch`
- `normalizeFailureSignatureFromError`

37. `lib/auto/program-governance-loop-service.js`
- `hasRecoverableProgramGoals`
- `applyProgramGovernancePatch`
- `buildProgramGovernanceReplayGoalsResult`
- `runProgramGovernanceLoop`

38. `lib/auto/program-auto-remediation-service.js`
- `applyProgramGateAutoRemediation`

39. `lib/auto/output-writer.js`
- `maybeWriteOutput`
- `maybeWriteTextOutput`

40. `lib/auto/handoff-capability-matrix-service.js`
- `buildAutoHandoffCapabilityMatrixPolicy`
- `buildAutoHandoffCapabilityMatrixRecommendations`
- `buildAutoHandoffCapabilityMatrix`

41. `lib/auto/handoff-release-evidence-service.js`
- `loadAutoHandoffReleaseEvidence`
- `mergeAutoHandoffRunIntoReleaseEvidence`
- `writeAutoHandoffRunReport`

## Validation Coverage

Unit tests:
- `tests/unit/auto/archive-schema-service.test.js`
- `tests/unit/auto/archive-summary.test.js`
- `tests/unit/auto/batch-summary-storage-service.test.js`
- `tests/unit/auto/close-loop-batch-service.test.js`
- `tests/unit/auto/observability-service.test.js`
- `tests/unit/auto/close-loop-program-service.test.js`
- `tests/unit/auto/program-summary.test.js`
- `tests/unit/auto/program-output.test.js`
- `tests/unit/auto/batch-output.test.js`
- `tests/unit/auto/program-governance-helpers.test.js`
- `tests/unit/auto/program-governance-loop-service.test.js`
- `tests/unit/auto/program-auto-remediation-service.test.js`
- `tests/unit/auto/output-writer.test.js`
- `tests/unit/auto/handoff-capability-matrix-service.test.js`
- `tests/unit/auto/handoff-release-evidence-service.test.js`
- `tests/unit/auto/close-loop-controller-service.test.js`
- `tests/unit/auto/close-loop-recovery-service.test.js`
- `tests/unit/auto/controller-lock-service.test.js`
- `tests/unit/auto/controller-output.test.js`
- `tests/unit/auto/controller-queue-service.test.js`
- `tests/unit/auto/controller-session-storage-service.test.js`
- `tests/unit/auto/governance-advisory-service.test.js`
- `tests/unit/auto/governance-close-loop-service.test.js`
- `tests/unit/auto/governance-maintenance-presenter.test.js`
- `tests/unit/auto/governance-maintenance-service.test.js`
- `tests/unit/auto/governance-session-presenter.test.js`
- `tests/unit/auto/governance-session-storage-service.test.js`
- `tests/unit/auto/governance-signals.test.js`
- `tests/unit/auto/governance-stats-presenter.test.js`
- `tests/unit/auto/governance-stats-service.test.js`
- `tests/unit/auto/governance-summary.test.js`
- `tests/unit/auto/program-diagnostics.test.js`
- `tests/unit/auto/recovery-selection-service.test.js`
- `tests/unit/auto/retention-policy.test.js`
- `tests/unit/auto/session-metrics.test.js`
- `tests/unit/auto/session-persistence-service.test.js`
- `tests/unit/auto/session-presenter.test.js`
- `tests/unit/auto/session-prune-service.test.js`
- `tests/unit/auto/session-query-service.test.js`
- `tests/unit/auto/spec-protection.test.js`

Integration guardrails:
- `tests/integration/auto-close-loop-cli.integration.test.js`
- `tests/integration/version-cli.integration.test.js`
- `tests/integration/legacy-migration-guard-cli.integration.test.js`
- `tests/integration/takeover-baseline-cli.integration.test.js`

## Current Status

- Mainline helper, presenter, policy, storage, and governance-service extraction is stable.
- `runCloseLoopController` now delegates to `lib/auto/close-loop-controller-service.js` through dependency injection from `lib/commands/auto.js`.
- `executeCloseLoopBatch` now delegates to `lib/auto/close-loop-batch-service.js` through dependency injection from `lib/commands/auto.js`.
- `buildAutoObservabilitySnapshot` now delegates to `lib/auto/observability-service.js` through dependency injection from `lib/commands/auto.js`.
- `executeCloseLoopProgramGoal` now delegates to `lib/auto/close-loop-program-service.js` through dependency injection from `lib/commands/auto.js`.
- Program summary helpers (`KPI`, coordination, recovery merge, failure-source indexing) now delegate to `lib/auto/program-summary.js`.
- Program KPI/audit output writers now delegate to `lib/auto/program-output.js`.
- Batch/program/recover summary console presenter now delegates to `lib/auto/batch-output.js`.
- Program gate policy/fallback evaluation, anomaly patching, and failure-signature normalization now delegate to `lib/auto/program-governance-helpers.js`.
- Program governance replay/recover orchestration now delegates to `lib/auto/program-governance-loop-service.js`.
- Program gate auto-remediation and spec-prune side effects now delegate to `lib/auto/program-auto-remediation-service.js`.
- Shared JSON/text output writers now delegate to `lib/auto/output-writer.js`.
- Handoff capability matrix policy/recommendation/build flow now delegates to `lib/auto/handoff-capability-matrix-service.js`.
- Handoff release-evidence load/merge/report flow now delegates to `lib/auto/handoff-release-evidence-service.js`.
- Controller queue, lock, and output helpers are extracted and wired into the controller service and command wrapper.
- Dead duplicate controller queue helper definitions were removed from `lib/commands/auto.js` after cutover.
- Remaining heavy boundaries are now concentrated in auto-handoff evidence review, release draft, release gate history entry/index, and final release closure after controller, batch, observability, program, governance, output, handoff capability-matrix, and handoff release-evidence cutover stabilized.

## Working Rules

- Move one orchestration boundary at a time.
- Keep `lib/commands/auto.js` behavior stable while extracting logic into pure modules.
- A boundary is only considered complete after:
1. `node --check lib/commands/auto.js`
2. targeted `tests/unit/auto/*`
3. `tests/integration/auto-close-loop-cli.integration.test.js --runInBand`
4. if startup or workspace gating changes, also run:
- `tests/integration/version-cli.integration.test.js`
- `tests/integration/legacy-migration-guard-cli.integration.test.js`
- `tests/integration/takeover-baseline-cli.integration.test.js`

## Stop Condition

Do not continue a boundary extraction if it causes broad `auto-close-loop` integration failures. Revert that boundary to the last stable split, then debug from there.
