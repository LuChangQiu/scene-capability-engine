function hasRecoverableProgramGoals(summary, dependencies = {}) {
  const getBatchFailureStatusSet = dependencies.getBatchFailureStatusSet;
  const failedStatuses = getBatchFailureStatusSet();
  const results = Array.isArray(summary && summary.results) ? summary.results : [];
  return results.some(item => failedStatuses.has(`${item && item.status ? item.status : ''}`.trim().toLowerCase()));
}

function applyProgramGovernancePatch(baseOptions, patch) {
  const merged = { ...baseOptions };
  const sourcePatch = patch && typeof patch === 'object' ? patch : {};
  for (const [key, value] of Object.entries(sourcePatch)) {
    if (value === undefined) {
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

function buildProgramGovernanceReplayGoalsResult(baseGoalsResult, round, summary) {
  const source = baseGoalsResult && typeof baseGoalsResult === 'object'
    ? baseGoalsResult
    : { file: '(generated-from-goal)', goals: [] };
  const sourceSummary = summary && typeof summary === 'object' ? summary : {};
  return {
    ...source,
    file: source.file || '(generated-from-goal)',
    resumedFromSummary: {
      file: sourceSummary.batch_session && sourceSummary.batch_session.file
        ? sourceSummary.batch_session.file
        : '(program-governance-replay)',
      strategy: 'program-governance-replay',
      round,
      previous_status: sourceSummary.status || null,
      previous_total_goals: Number(sourceSummary.total_goals) || null,
      previous_processed_goals: Number(sourceSummary.processed_goals) || null
    }
  };
}

async function runProgramGovernanceLoop(context = {}, dependencies = {}) {
  const {
    normalizeProgramGovernMaxRounds,
    normalizeProgramGovernMaxMinutes,
    normalizeProgramGovernAnomalyWeeks,
    normalizeAutoKpiTrendPeriod,
    normalizeProgramGovernUseAction,
    resolveProgramGatePolicy,
    normalizeRecoveryMemoryToken,
    normalizeResumeStrategy,
    normalizeRecoverMaxRounds,
    normalizeRecoverMaxMinutes,
    isSpecSessionBudgetHardFailure,
    isSpecSessionGrowthGuardHardFailure,
    buildAutoKpiTrend,
    buildProgramAnomalyGovernancePatch,
    loadCloseLoopRecoveryMemory,
    buildRecoveryMemorySignature,
    getRecoveryMemoryEntry,
    resolveRecoveryActionSelection,
    loadCloseLoopBatchSummaryPayload,
    executeCloseLoopRecoveryCycle,
    mergeProgramRecoveryIntoProgramSummary,
    executeCloseLoopBatch,
    buildProgramKpiSnapshot,
    buildProgramDiagnostics,
    buildProgramCoordinationSnapshot,
    applyProgramGateOutcome,
    getBatchFailureStatusSet,
    now = () => Date.now(),
    cwd = () => process.cwd()
  } = dependencies;

  let summary = context.summary && typeof context.summary === 'object' ? context.summary : {};
  const projectPath = context.projectPath || cwd();
  const baseProgramOptions = context.programOptions && typeof context.programOptions === 'object'
    ? context.programOptions
    : {};
  const baseGoalsResult = context.baseGoalsResult && typeof context.baseGoalsResult === 'object'
    ? context.baseGoalsResult
    : { file: '(generated-from-goal)', goals: [] };
  const enabled = Boolean(context.enabled);
  const maxRounds = normalizeProgramGovernMaxRounds(context.maxRounds);
  const maxDurationMinutes = normalizeProgramGovernMaxMinutes(context.maxMinutes);
  const maxDurationMs = maxDurationMinutes * 60 * 1000;
  const anomalyEnabled = context.anomalyEnabled !== false;
  const anomalyWeeks = normalizeProgramGovernAnomalyWeeks(context.anomalyWeeks);
  const anomalyPeriod = normalizeAutoKpiTrendPeriod(context.anomalyPeriod);
  const governUseAction = normalizeProgramGovernUseAction(context.governUseAction);
  const governAutoActionEnabled = context.governAutoActionEnabled !== false;
  const governActionEnabled = governAutoActionEnabled || governUseAction !== null;
  const programGatePolicy = resolveProgramGatePolicy(context.programGatePolicy || {});
  const gateFallbackChain = Array.isArray(context.gateFallbackChain) ? context.gateFallbackChain : [];
  const recoveryMemoryScope = context.recoveryMemoryScope || null;
  const normalizedRecoveryScope = normalizeRecoveryMemoryToken(recoveryMemoryScope || '') || 'default-scope';
  const recoverResumeStrategy = normalizeResumeStrategy(context.recoverResumeStrategy || 'pending');
  const recoverMaxRounds = normalizeRecoverMaxRounds(context.recoverMaxRounds);
  const recoverMaxMinutes = normalizeRecoverMaxMinutes(
    context.recoverMaxMinutes,
    '--program-recover-max-minutes'
  );
  const recoverMaxDurationMs = recoverMaxMinutes === null ? null : recoverMaxMinutes * 60 * 1000;
  const governanceStartedAt = now();
  const history = [];
  let exhausted = false;
  let stopReason = enabled ? 'stable' : 'disabled';
  let settled = false;

  if (!enabled) {
    return {
      summary,
      governance: {
        enabled: false,
        anomaly_enabled: anomalyEnabled,
        anomaly_weeks: anomalyWeeks,
        anomaly_period: anomalyPeriod,
        auto_action_enabled: governAutoActionEnabled,
        action_selection_enabled: false,
        pinned_action_index: governUseAction,
        max_rounds: maxRounds,
        max_minutes: maxDurationMinutes,
        performed_rounds: 0,
        converged: Boolean(
          summary &&
          summary.program_gate_effective &&
          summary.program_gate_effective.passed &&
          !isSpecSessionBudgetHardFailure(summary) &&
          !isSpecSessionGrowthGuardHardFailure(summary)
        ),
        exhausted: false,
        stop_reason: 'disabled',
        history: []
      }
    };
  }

  for (let round = 1; round <= maxRounds; round += 1) {
    const elapsedBeforeRound = now() - governanceStartedAt;
    if (elapsedBeforeRound >= maxDurationMs) {
      exhausted = true;
      stopReason = 'time-budget-exhausted';
      break;
    }

    let trendResult = null;
    let anomalies = [];
    if (anomalyEnabled) {
      trendResult = await buildAutoKpiTrend(projectPath, {
        weeks: anomalyWeeks,
        mode: 'program',
        period: anomalyPeriod
      });
      anomalies = Array.isArray(trendResult.anomalies) ? trendResult.anomalies : [];
      summary.program_kpi_trend = {
        generated_at: trendResult.generated_at,
        weeks: trendResult.weeks,
        period_unit: trendResult.period_unit,
        total_runs: trendResult.total_runs,
        overall: trendResult.overall,
        anomaly_detection: trendResult.anomaly_detection || null
      };
      summary.program_kpi_anomalies = anomalies;
    }

    const gateFailed = Boolean(
      !summary.program_gate_effective ||
      !summary.program_gate_effective.passed ||
      isSpecSessionBudgetHardFailure(summary) ||
      isSpecSessionGrowthGuardHardFailure(summary)
    );
    const highSeverityAnomalies = anomalies.filter(item => `${item && item.severity ? item.severity : ''}`.trim().toLowerCase() === 'high');
    const anomalyFailed = anomalyEnabled && highSeverityAnomalies.length > 0;
    if (!gateFailed && !anomalyFailed) {
      stopReason = 'stable';
      settled = true;
      break;
    }

    const gatePatch = summary && summary.program_gate_auto_remediation && summary.program_gate_auto_remediation.next_run_patch
      ? summary.program_gate_auto_remediation.next_run_patch
      : {};
    const anomalyPatch = buildProgramAnomalyGovernancePatch(summary, highSeverityAnomalies, baseProgramOptions);
    let governanceActionSelection = null;
    let governanceActionPatch = {};
    if (governActionEnabled) {
      const recoveryMemory = await loadCloseLoopRecoveryMemory(projectPath);
      const recoverySignature = buildRecoveryMemorySignature(summary, {
        scope: normalizedRecoveryScope
      });
      const recoveryMemoryEntry = getRecoveryMemoryEntry(recoveryMemory.payload, recoverySignature);
      governanceActionSelection = resolveRecoveryActionSelection(summary, governUseAction, {
        recoveryMemoryEntry,
        optionLabel: '--program-govern-use-action'
      });
      governanceActionPatch = governanceActionSelection &&
        governanceActionSelection.appliedPatch &&
        typeof governanceActionSelection.appliedPatch === 'object'
        ? governanceActionSelection.appliedPatch
        : {};
    }
    const roundPatch = {
      ...(governanceActionPatch && typeof governanceActionPatch === 'object' ? governanceActionPatch : {}),
      ...(anomalyPatch.patch || {}),
      ...(gatePatch && typeof gatePatch === 'object' ? gatePatch : {})
    };
    if (Object.keys(roundPatch).length === 0) {
      stopReason = 'no-actionable-patch';
      history.push({
        round,
        status_before: summary.status,
        status_after: summary.status,
        trigger: {
          gate_failed: gateFailed,
          anomaly_failed: anomalyFailed,
          anomaly_count: highSeverityAnomalies.length
        },
        selected_action_index: governanceActionSelection ? governanceActionSelection.selectedIndex : null,
        selected_action: governanceActionSelection && governanceActionSelection.selectedAction
          ? governanceActionSelection.selectedAction.action
          : null,
        selected_action_priority: governanceActionSelection && governanceActionSelection.selectedAction
          ? governanceActionSelection.selectedAction.priority
          : null,
        action_selection_source: governanceActionSelection ? governanceActionSelection.selectionSource : null,
        action_selection_explain: governanceActionSelection ? governanceActionSelection.selectionExplain || null : null,
        execution_mode: 'none',
        applied_patch: null,
        notes: [
          'No actionable governance patch generated.'
        ]
      });
      break;
    }

    const roundOptions = applyProgramGovernancePatch(baseProgramOptions, roundPatch);
    roundOptions.out = null;
    roundOptions.programKpiOut = null;
    roundOptions.programAuditOut = null;

    const statusBefore = summary.status;
    const failedGoalsBefore = Number(summary.failed_goals) || 0;
    const selectedGovernanceActionIndex = governanceActionSelection ? governanceActionSelection.selectedIndex : null;
    let executionMode = 'program-replay';
    let roundSummary = null;
    if (hasRecoverableProgramGoals(summary, { getBatchFailureStatusSet })) {
      executionMode = 'recover-cycle';
      const roundSourceSummary = summary.batch_session && summary.batch_session.file
        ? await loadCloseLoopBatchSummaryPayload(projectPath, summary.batch_session.file)
        : {
          file: '(program-governance-derived-summary)',
          payload: summary
        };
      const recoveryResult = await executeCloseLoopRecoveryCycle({
        projectPath,
        sourceSummary: roundSourceSummary,
        baseOptions: {
          ...roundOptions,
          useAction: selectedGovernanceActionIndex || context.programRecoverUseAction
        },
        recoverAutonomousEnabled: true,
        resumeStrategy: recoverResumeStrategy,
        recoverUntilComplete: true,
        recoverMaxRounds,
        recoverMaxDurationMs,
        recoveryMemoryScope,
        actionCandidate: selectedGovernanceActionIndex || context.programRecoverUseAction
      });
      roundSummary = mergeProgramRecoveryIntoProgramSummary(summary, recoveryResult.summary, {
        enabled: true,
        triggered: true,
        governance_round: round,
        recover_until_complete: true,
        source: 'governance-recover-cycle'
      });
      roundSummary.resource_plan = recoveryResult.summary && recoveryResult.summary.resource_plan
        ? recoveryResult.summary.resource_plan
        : roundSummary.resource_plan;
      roundSummary.batch_parallel = Number(recoveryResult.summary && recoveryResult.summary.batch_parallel) || roundSummary.batch_parallel;
    } else {
      const replayGoalsResult = buildProgramGovernanceReplayGoalsResult(baseGoalsResult, round, summary);
      const replaySummary = await executeCloseLoopBatch(
        replayGoalsResult,
        roundOptions,
        projectPath,
        'auto-close-loop-program'
      );
      roundSummary = {
        ...replaySummary,
        auto_recovery: summary && summary.auto_recovery ? summary.auto_recovery : null
      };
    }

    roundSummary.program_kpi = buildProgramKpiSnapshot(roundSummary);
    roundSummary.program_diagnostics = buildProgramDiagnostics(roundSummary);
    roundSummary.program_coordination = buildProgramCoordinationSnapshot(roundSummary);
    await applyProgramGateOutcome(roundSummary, {
      projectPath,
      options: roundOptions,
      programGatePolicy,
      gateFallbackChain,
      enableAutoRemediation: context.programGateAutoRemediate !== false
    });

    const failedGoalsAfter = Number(roundSummary.failed_goals) || 0;
    history.push({
      round,
      status_before: statusBefore,
      status_after: roundSummary.status,
      trigger: {
        gate_failed: gateFailed,
        anomaly_failed: anomalyFailed,
        anomaly_count: highSeverityAnomalies.length
      },
      selected_action_index: selectedGovernanceActionIndex,
      selected_action: governanceActionSelection && governanceActionSelection.selectedAction
        ? governanceActionSelection.selectedAction.action
        : null,
      selected_action_priority: governanceActionSelection && governanceActionSelection.selectedAction
        ? governanceActionSelection.selectedAction.priority
        : null,
      action_selection_source: governanceActionSelection ? governanceActionSelection.selectionSource : null,
      action_selection_explain: governanceActionSelection ? governanceActionSelection.selectionExplain || null : null,
      execution_mode: executionMode,
      applied_patch: roundPatch,
      patch_reasons: [
        ...(governanceActionSelection && governanceActionSelection.selectionExplain
          ? [`governance-action: ${governanceActionSelection.selectionExplain.reason}`]
          : []),
        ...(Array.isArray(anomalyPatch.reasons) ? anomalyPatch.reasons : []),
        ...(summary.program_gate_auto_remediation && Array.isArray(summary.program_gate_auto_remediation.reasons)
          ? summary.program_gate_auto_remediation.reasons
          : [])
      ],
      failed_goals_before: failedGoalsBefore,
      failed_goals_after: failedGoalsAfter
    });

    summary = roundSummary;
    if (
      summary.program_gate_effective &&
      summary.program_gate_effective.passed &&
      !isSpecSessionBudgetHardFailure(summary) &&
      !isSpecSessionGrowthGuardHardFailure(summary)
    ) {
      if (!anomalyEnabled) {
        stopReason = 'gate-stable';
        break;
      }
      const postTrend = await buildAutoKpiTrend(projectPath, {
        weeks: anomalyWeeks,
        mode: 'program',
        period: anomalyPeriod
      });
      const postAnomalies = Array.isArray(postTrend.anomalies) ? postTrend.anomalies : [];
      summary.program_kpi_trend = {
        generated_at: postTrend.generated_at,
        weeks: postTrend.weeks,
        period_unit: postTrend.period_unit,
        total_runs: postTrend.total_runs,
        overall: postTrend.overall,
        anomaly_detection: postTrend.anomaly_detection || null
      };
      summary.program_kpi_anomalies = postAnomalies;
      const hasHighPostAnomaly = postAnomalies.some(item => `${item && item.severity ? item.severity : ''}`.trim().toLowerCase() === 'high');
      if (!hasHighPostAnomaly) {
        stopReason = 'stable';
        settled = true;
        break;
      }
    }
  }

  if (!settled && history.length >= maxRounds && stopReason === 'stable') {
    stopReason = 'round-limit-reached';
    exhausted = true;
  }
  if (!settled && history.length >= maxRounds && stopReason !== 'stable') {
    exhausted = true;
  }

  return {
    summary,
    governance: {
      enabled: true,
      anomaly_enabled: anomalyEnabled,
      anomaly_weeks: anomalyWeeks,
      anomaly_period: anomalyPeriod,
      auto_action_enabled: governAutoActionEnabled,
      action_selection_enabled: governActionEnabled,
      pinned_action_index: governUseAction,
      max_rounds: maxRounds,
      max_minutes: maxDurationMinutes,
      performed_rounds: history.length,
      converged: Boolean(
        summary &&
        summary.program_gate_effective &&
        summary.program_gate_effective.passed &&
        !isSpecSessionBudgetHardFailure(summary) &&
        !isSpecSessionGrowthGuardHardFailure(summary)
      ),
      exhausted,
      stop_reason: stopReason,
      history
    }
  };
}

module.exports = {
  hasRecoverableProgramGoals,
  applyProgramGovernancePatch,
  buildProgramGovernanceReplayGoalsResult,
  runProgramGovernanceLoop
};
