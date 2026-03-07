async function executeCloseLoopProgramGoal(goal, options = {}, context = {}, dependencies = {}) {
  const {
    normalizeRecoverMaxRounds,
    normalizeRecoverMaxMinutes,
    normalizeResumeStrategy,
    normalizeProgramGovernMaxRounds,
    normalizeProgramGovernMaxMinutes,
    normalizeProgramGovernAnomalyWeeks,
    normalizeAutoKpiTrendPeriod,
    normalizeProgramGovernUseAction,
    resolveProgramGatePolicy,
    normalizeProgramGateFallbackProfile,
    resolveProgramGateFallbackChain,
    resolveRecoveryMemoryScope,
    normalizeBatchRetryMaxRounds,
    normalizeBatchSessionKeep,
    normalizeBatchSessionOlderThanDays,
    normalizeSpecKeep,
    normalizeOlderThanDays,
    normalizeSpecSessionProtectWindowDays,
    normalizeSpecSessionMaxTotal,
    normalizeSpecSessionMaxCreated,
    normalizeSpecSessionMaxCreatedPerGoal,
    normalizeSpecSessionMaxDuplicateGoals,
    sanitizeBatchSessionId,
    buildCloseLoopBatchGoalsFromGoal,
    executeCloseLoopBatch,
    executeCloseLoopRecoveryCycle,
    mergeProgramRecoveryIntoProgramSummary,
    buildProgramKpiSnapshot,
    buildProgramDiagnostics,
    buildProgramCoordinationSnapshot,
    maybeWriteProgramKpi,
    maybeWriteOutput,
    maybePersistCloseLoopBatchSummary,
    applyProgramGateOutcome,
    runProgramGovernanceLoop,
    isSpecSessionBudgetHardFailure,
    isSpecSessionGrowthGuardHardFailure,
    maybeWriteProgramAudit,
    printCloseLoopBatchSummary,
    now = () => Date.now(),
    cwd = () => process.cwd()
  } = dependencies;

  const programStartedAt = now();
  const projectPath = context.projectPath || cwd();
  const shouldPrintSummary = context.printSummary !== false;
  const writeOutputs = context.writeOutputs !== false;
  const programAutonomousEnabled = options.batchAutonomous !== false;
  const programAutoRecoverEnabled = options.programAutoRecover !== false;
  const programRecoverMaxRounds = normalizeRecoverMaxRounds(options.programRecoverMaxRounds);
  const programRecoverMaxMinutes = normalizeRecoverMaxMinutes(options.programRecoverMaxMinutes, '--program-recover-max-minutes');
  const programRecoverResumeStrategy = normalizeResumeStrategy(options.programRecoverResumeStrategy);
  const programGovernUntilStable = Boolean(options.programGovernUntilStable);
  const programGovernMaxRounds = normalizeProgramGovernMaxRounds(options.programGovernMaxRounds);
  const programGovernMaxMinutes = normalizeProgramGovernMaxMinutes(options.programGovernMaxMinutes);
  const programGovernAnomalyEnabled = options.programGovernAnomaly !== false;
  const programGovernAnomalyWeeks = normalizeProgramGovernAnomalyWeeks(options.programGovernAnomalyWeeks);
  const programGovernAnomalyPeriod = normalizeAutoKpiTrendPeriod(options.programGovernAnomalyPeriod);
  const programGovernUseAction = normalizeProgramGovernUseAction(options.programGovernUseAction);
  const programGovernAutoActionEnabled = options.programGovernAutoAction !== false;
  const programGatePolicy = resolveProgramGatePolicy({
    profile: options.programGateProfile,
    minSuccessRate: options.programMinSuccessRate,
    maxRiskLevel: options.programMaxRiskLevel,
    maxElapsedMinutes: options.programMaxElapsedMinutes,
    maxAgentBudget: options.programMaxAgentBudget,
    maxTotalSubSpecs: options.programMaxTotalSubSpecs
  });
  const gateFallbackProfile = normalizeProgramGateFallbackProfile(options.programGateFallbackProfile);
  const gateFallbackChain = resolveProgramGateFallbackChain(options.programGateFallbackChain, gateFallbackProfile);
  const recoveryMemoryScope = await resolveRecoveryMemoryScope(projectPath, options.recoveryMemoryScope);
  if (options.resume) {
    throw new Error('--resume is not supported in close-loop-program. Use close-loop --resume or remove --resume.');
  }
  if (options.sessionId) {
    throw new Error('--session-id is not supported in close-loop-program. Session ids are generated per goal.');
  }
  if (
    options.batchRetryMaxRounds !== undefined &&
    options.batchRetryMaxRounds !== null &&
    !options.batchRetryUntilComplete &&
    !programAutonomousEnabled
  ) {
    throw new Error('--batch-retry-max-rounds requires --batch-retry-until-complete.');
  }
  if (options.batchRetryMaxRounds !== undefined && options.batchRetryMaxRounds !== null) {
    normalizeBatchRetryMaxRounds(options.batchRetryMaxRounds);
  }
  if (options.batchSessionKeep !== undefined && options.batchSessionKeep !== null) {
    normalizeBatchSessionKeep(options.batchSessionKeep);
  }
  if (options.batchSessionOlderThanDays !== undefined && options.batchSessionOlderThanDays !== null) {
    normalizeBatchSessionOlderThanDays(options.batchSessionOlderThanDays);
  }
  if (options.specSessionKeep !== undefined && options.specSessionKeep !== null) {
    normalizeSpecKeep(options.specSessionKeep);
  }
  if (options.specSessionOlderThanDays !== undefined && options.specSessionOlderThanDays !== null) {
    normalizeOlderThanDays(options.specSessionOlderThanDays);
  }
  if (options.specSessionProtectWindowDays !== undefined && options.specSessionProtectWindowDays !== null) {
    normalizeSpecSessionProtectWindowDays(options.specSessionProtectWindowDays);
  }
  if (options.specSessionMaxTotal !== undefined && options.specSessionMaxTotal !== null) {
    normalizeSpecSessionMaxTotal(options.specSessionMaxTotal);
  }
  if (options.specSessionMaxCreated !== undefined && options.specSessionMaxCreated !== null) {
    normalizeSpecSessionMaxCreated(options.specSessionMaxCreated);
  }
  if (options.specSessionMaxCreatedPerGoal !== undefined && options.specSessionMaxCreatedPerGoal !== null) {
    normalizeSpecSessionMaxCreatedPerGoal(options.specSessionMaxCreatedPerGoal);
  }
  if (options.specSessionMaxDuplicateGoals !== undefined && options.specSessionMaxDuplicateGoals !== null) {
    normalizeSpecSessionMaxDuplicateGoals(options.specSessionMaxDuplicateGoals);
  }
  if (options.batchSessionId !== undefined && options.batchSessionId !== null) {
    const sanitizedBatchSessionId = sanitizeBatchSessionId(options.batchSessionId);
    if (!sanitizedBatchSessionId) {
      throw new Error('--batch-session-id is invalid after sanitization.');
    }
  }

  const goalsResult = buildCloseLoopBatchGoalsFromGoal(goal, options.programGoals, {
    minQualityScore: options.programMinQualityScore,
    enforceQualityGate: Boolean(options.programQualityGate)
  });
  const programOptions = {
    ...options,
    batchAutonomous: programAutonomousEnabled
  };
  const initialSummary = await executeCloseLoopBatch(goalsResult, programOptions, projectPath, 'auto-close-loop-program');
  let summary = {
    ...initialSummary,
    auto_recovery: {
      enabled: programAutoRecoverEnabled,
      triggered: false,
      converged: initialSummary.status === 'completed',
      source_status: initialSummary.status
    }
  };

  if (programAutoRecoverEnabled && initialSummary.status !== 'completed') {
    const recoveryResult = await executeCloseLoopRecoveryCycle({
      projectPath,
      sourceSummary: {
        file: initialSummary.batch_session && initialSummary.batch_session.file
          ? initialSummary.batch_session.file
          : '(auto-close-loop-program-in-memory)',
        payload: initialSummary
      },
      baseOptions: {
        ...programOptions,
        useAction: options.programRecoverUseAction
      },
      recoverAutonomousEnabled: true,
      resumeStrategy: programRecoverResumeStrategy,
      recoverUntilComplete: true,
      recoverMaxRounds: programRecoverMaxRounds,
      recoverMaxDurationMs: programRecoverMaxMinutes === null ? null : programRecoverMaxMinutes * 60 * 1000,
      recoveryMemoryScope,
      actionCandidate: options.programRecoverUseAction
    });

    summary = mergeProgramRecoveryIntoProgramSummary(
      initialSummary,
      recoveryResult.summary,
      {
        enabled: true,
        triggered: true,
        recover_until_complete: true,
        recover_max_rounds: programRecoverMaxRounds,
        recover_max_minutes: programRecoverMaxMinutes,
        resume_strategy: programRecoverResumeStrategy
      }
    );
    summary.program_kpi = buildProgramKpiSnapshot(summary);
    summary.program_diagnostics = buildProgramDiagnostics(summary);
    summary.program_coordination = buildProgramCoordinationSnapshot(summary);
    if (writeOutputs) {
      await maybeWriteProgramKpi(summary, options.programKpiOut, projectPath);
      await maybeWriteOutput(summary, options.out, projectPath);
    }
    if (programOptions.batchSession !== false) {
      await maybePersistCloseLoopBatchSummary(summary, programOptions, projectPath);
    }
  }

  const programCompletedAt = now();
  summary.program_started_at = new Date(programStartedAt).toISOString();
  summary.program_completed_at = new Date(programCompletedAt).toISOString();
  summary.program_elapsed_ms = Math.max(0, programCompletedAt - programStartedAt);

  await applyProgramGateOutcome(summary, {
    projectPath,
    options: programOptions,
    programGatePolicy,
    gateFallbackChain,
    enableAutoRemediation: options.programGateAutoRemediate !== false
  });

  if (programGovernUntilStable) {
    const governanceResult = await runProgramGovernanceLoop({
      enabled: true,
      summary,
      projectPath,
      programOptions,
      baseGoalsResult: goalsResult,
      maxRounds: programGovernMaxRounds,
      maxMinutes: programGovernMaxMinutes,
      anomalyEnabled: programGovernAnomalyEnabled,
      anomalyWeeks: programGovernAnomalyWeeks,
      anomalyPeriod: programGovernAnomalyPeriod,
      programGatePolicy,
      gateFallbackChain,
      recoveryMemoryScope,
      recoverResumeStrategy: programRecoverResumeStrategy,
      recoverMaxRounds: programRecoverMaxRounds,
      recoverMaxMinutes: programRecoverMaxMinutes,
      programRecoverUseAction: options.programRecoverUseAction,
      programGateAutoRemediate: options.programGateAutoRemediate !== false,
      governUseAction: programGovernUseAction,
      governAutoActionEnabled: programGovernAutoActionEnabled
    });
    summary = governanceResult.summary;
    summary.program_governance = governanceResult.governance;
  } else {
    summary.program_governance = {
      enabled: false,
      anomaly_enabled: programGovernAnomalyEnabled,
      anomaly_weeks: programGovernAnomalyWeeks,
      anomaly_period: programGovernAnomalyPeriod,
      auto_action_enabled: programGovernAutoActionEnabled,
      action_selection_enabled: false,
      pinned_action_index: programGovernUseAction,
      max_rounds: programGovernMaxRounds,
      max_minutes: programGovernMaxMinutes,
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
    };
  }

  const finalProgramCompletedAt = now();
  summary.program_completed_at = new Date(finalProgramCompletedAt).toISOString();
  summary.program_elapsed_ms = Math.max(0, finalProgramCompletedAt - programStartedAt);

  if (writeOutputs) {
    await maybeWriteProgramKpi(summary, options.programKpiOut, projectPath);
    await maybeWriteOutput(summary, options.out, projectPath);
    await maybeWriteProgramAudit(summary, options.programAuditOut, projectPath);
  }

  if (shouldPrintSummary) {
    printCloseLoopBatchSummary(summary, programOptions);
  }

  const exitCode = (
    summary.status !== 'completed' ||
    !summary.program_gate_effective.passed ||
    isSpecSessionBudgetHardFailure(summary) ||
    isSpecSessionGrowthGuardHardFailure(summary)
  ) ? 1 : 0;

  return {
    summary,
    options: programOptions,
    exitCode
  };
}

module.exports = {
  executeCloseLoopProgramGoal
};
