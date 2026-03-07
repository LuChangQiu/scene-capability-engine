async function executeCloseLoopRecoveryCycle(input = {}, dependencies = {}) {
  const {
    projectPath,
    sourceSummary,
    baseOptions,
    recoverAutonomousEnabled,
    resumeStrategy,
    recoverUntilComplete,
    recoverMaxRounds,
    recoverMaxDurationMs,
    recoveryMemoryTtlDays,
    recoveryMemoryScope,
    actionCandidate
  } = input;
  const {
    pruneCloseLoopRecoveryMemory,
    loadCloseLoopRecoveryMemory,
    normalizeRecoveryMemoryToken,
    buildRecoveryMemorySignature,
    getRecoveryMemoryEntry,
    resolveRecoveryActionSelection,
    applyRecoveryActionPatch,
    buildCloseLoopBatchGoalsFromSummaryPayload,
    executeCloseLoopBatch,
    loadCloseLoopBatchSummaryPayload,
    updateCloseLoopRecoveryMemory,
    now = () => Date.now()
  } = dependencies;

  let resolvedSourceSummary = sourceSummary && typeof sourceSummary === 'object'
    ? {
      file: typeof sourceSummary.file === 'string' && sourceSummary.file.trim()
        ? sourceSummary.file
        : '(in-memory-summary)',
      payload: sourceSummary.payload && typeof sourceSummary.payload === 'object'
        ? sourceSummary.payload
        : {}
    }
    : {
      file: '(in-memory-summary)',
      payload: {}
    };

  if (recoveryMemoryTtlDays !== null && recoveryMemoryTtlDays !== undefined) {
    await pruneCloseLoopRecoveryMemory(projectPath, {
      olderThanDays: recoveryMemoryTtlDays,
      dryRun: false
    });
  }
  const recoveryMemory = await loadCloseLoopRecoveryMemory(projectPath);
  const resolvedRecoveryScope = normalizeRecoveryMemoryToken(recoveryMemoryScope || '') || 'default-scope';
  const recoverySignature = buildRecoveryMemorySignature(resolvedSourceSummary.payload, {
    scope: resolvedRecoveryScope
  });
  const recoveryMemoryEntry = getRecoveryMemoryEntry(recoveryMemory.payload, recoverySignature);
  const pinnedActionSelection = resolveRecoveryActionSelection(
    resolvedSourceSummary.payload,
    actionCandidate,
    { recoveryMemoryEntry }
  );

  let finalSummary = null;
  let finalRecoveryOptions = null;
  const recoveryHistory = [];
  const startedAt = Number(now());
  let budgetExhausted = false;
  for (let round = 1; round <= recoverMaxRounds; round += 1) {
    if (recoverMaxDurationMs !== null && recoverMaxDurationMs !== undefined) {
      const elapsedBeforeRound = Number(now()) - startedAt;
      if (elapsedBeforeRound >= recoverMaxDurationMs && finalSummary) {
        budgetExhausted = true;
        break;
      }
    }

    const recoveryOptions = applyRecoveryActionPatch({
      ...baseOptions,
      batchAutonomous: recoverAutonomousEnabled
    }, pinnedActionSelection.selectedAction);

    if (
      recoverUntilComplete &&
      typeof recoveryOptions.batchSessionId === 'string' &&
      recoveryOptions.batchSessionId.trim()
    ) {
      recoveryOptions.batchSessionId = `${recoveryOptions.batchSessionId.trim()}-r${round}`;
    }

    const goalsResult = await buildCloseLoopBatchGoalsFromSummaryPayload(
      resolvedSourceSummary.payload,
      resolvedSourceSummary.file,
      projectPath,
      'auto',
      resumeStrategy
    );
    const summary = await executeCloseLoopBatch(
      goalsResult,
      recoveryOptions,
      projectPath,
      'auto-close-loop-recover'
    );

    summary.recovered_from_summary = {
      file: resolvedSourceSummary.file,
      source_mode: resolvedSourceSummary.payload.mode || null,
      source_status: resolvedSourceSummary.payload.status || null,
      resume_strategy: resumeStrategy,
      selected_action_index: pinnedActionSelection.selectedIndex,
      selected_action: pinnedActionSelection.selectedAction || null,
      round
    };
    summary.recovery_plan = {
      remediation_actions: pinnedActionSelection.availableActions,
      applied_patch: pinnedActionSelection.appliedPatch,
      selection_source: pinnedActionSelection.selectionSource,
      selection_explain: pinnedActionSelection.selectionExplain || null
    };

    recoveryHistory.push({
      round,
      source_summary: resolvedSourceSummary.file,
      status: summary.status,
      processed_goals: summary.processed_goals,
      completed_goals: summary.completed_goals,
      failed_goals: summary.failed_goals,
      batch_session_file: summary.batch_session && summary.batch_session.file
        ? summary.batch_session.file
        : null
    });

    finalSummary = summary;
    finalRecoveryOptions = recoveryOptions;

    if (!recoverUntilComplete || summary.status === 'completed') {
      break;
    }

    resolvedSourceSummary = summary.batch_session && summary.batch_session.file
      ? await loadCloseLoopBatchSummaryPayload(projectPath, summary.batch_session.file)
      : {
        file: '(derived-from-summary)',
        payload: summary
      };
  }

  if (!finalSummary) {
    throw new Error('Recovery cycle did not produce a summary.');
  }

  finalSummary.recovery_cycle = {
    enabled: recoverUntilComplete,
    max_rounds: recoverMaxRounds,
    performed_rounds: recoveryHistory.length,
    converged: finalSummary.status === 'completed',
    exhausted: ((recoverUntilComplete && recoveryHistory.length >= recoverMaxRounds && finalSummary.status !== 'completed') || budgetExhausted),
    time_budget_minutes: recoverMaxDurationMs ? Number((recoverMaxDurationMs / 60000).toFixed(2)) : null,
    elapsed_ms: Number(now()) - startedAt,
    budget_exhausted: budgetExhausted,
    history: recoveryHistory
  };

  const memoryUpdate = await updateCloseLoopRecoveryMemory(
    projectPath,
    recoveryMemory,
    recoverySignature,
    pinnedActionSelection.selectedIndex,
    pinnedActionSelection.selectedAction,
    finalSummary.status,
    { scope: resolvedRecoveryScope }
  );
  finalSummary.recovery_memory = {
    file: memoryUpdate.file,
    signature: memoryUpdate.signature,
    scope: memoryUpdate.scope,
    action_key: memoryUpdate.action_key,
    selected_action_index: pinnedActionSelection.selectedIndex,
    selection_source: pinnedActionSelection.selectionSource,
    selection_explain: pinnedActionSelection.selectionExplain || null,
    action_stats: memoryUpdate.entry
  };

  return {
    summary: finalSummary,
    options: finalRecoveryOptions || baseOptions,
    pinnedActionSelection
  };
}

module.exports = {
  executeCloseLoopRecoveryCycle
};
