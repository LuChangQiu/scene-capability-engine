async function runCloseLoopController(queueFile, options = {}, context = {}, dependencies = {}) {
  const {
    loadControllerGoalQueue,
    normalizeControllerMaxCycles,
    normalizeControllerMaxMinutes,
    normalizeControllerPollSeconds,
    normalizeControllerDequeueLimit,
    writeControllerGoalQueue,
    acquireControllerLock,
    refreshControllerLock,
    releaseControllerLock,
    sleepForMs,
    executeCloseLoopProgramGoal,
    appendControllerGoalArchive,
    maybePersistCloseLoopControllerSummary,
    maybeWriteOutput,
    now = () => Date.now()
  } = dependencies;

  const clock = typeof now === 'function' ? now : () => Date.now();
  const projectPath = context.projectPath || process.cwd();
  const resumedSession = context.resumedSession || null;
  const queueInput = typeof queueFile === 'string' && queueFile.trim()
    ? queueFile.trim()
    : resumedSession && resumedSession.payload && typeof resumedSession.payload.queue_file === 'string'
      ? resumedSession.payload.queue_file
      : null;
  const queueFormatCandidate = (
    options.queueFormat === 'auto' &&
    resumedSession &&
    resumedSession.payload &&
    typeof resumedSession.payload.queue_format === 'string' &&
    resumedSession.payload.queue_format.trim()
  )
    ? resumedSession.payload.queue_format
    : options.queueFormat;
  const queuePayload = await loadControllerGoalQueue(projectPath, queueInput, queueFormatCandidate, {
    dedupe: options.controllerDedupe !== false
  });
  const maxCycles = normalizeControllerMaxCycles(options.maxCycles);
  const maxMinutes = normalizeControllerMaxMinutes(options.maxMinutes);
  const maxDurationMs = maxMinutes * 60 * 1000;
  const pollSeconds = normalizeControllerPollSeconds(options.pollSeconds);
  const dequeueLimit = normalizeControllerDequeueLimit(options.dequeueLimit);
  const waitOnEmpty = Boolean(options.waitOnEmpty);
  const stopOnGoalFailure = Boolean(options.stopOnGoalFailure);
  const startedAtMs = clock();
  const startedAtIso = new Date(startedAtMs).toISOString();
  const history = [];
  const results = [];
  let performedCycles = 0;
  let stopReason = 'completed';
  let exhausted = false;
  let haltRequested = false;
  let doneArchiveFile = null;
  let failedArchiveFile = null;
  let dedupeDroppedGoals = Number(queuePayload.duplicate_count) || 0;
  let lockState = null;

  if (options.controllerDedupe !== false && queuePayload.duplicate_count > 0) {
    await writeControllerGoalQueue(queuePayload.file, queuePayload.format, queuePayload.goals);
  }

  lockState = await acquireControllerLock(projectPath, queuePayload.file, options);

  try {
    for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
      if ((clock() - startedAtMs) >= maxDurationMs) {
        exhausted = true;
        stopReason = 'time-budget-exhausted';
        break;
      }

      await refreshControllerLock(lockState);

      const currentQueue = await loadControllerGoalQueue(projectPath, queuePayload.file, queuePayload.format, {
        dedupe: options.controllerDedupe !== false
      });
      const pendingGoals = currentQueue.goals;
      dedupeDroppedGoals += Number(currentQueue.duplicate_count) || 0;

      if (options.controllerDedupe !== false && currentQueue.duplicate_count > 0) {
        await writeControllerGoalQueue(currentQueue.file, currentQueue.format, pendingGoals);
      }

      if (pendingGoals.length === 0) {
        history.push({
          cycle,
          queue_before: 0,
          dequeued: 0,
          queue_after: 0,
          status: waitOnEmpty ? 'idle-wait' : 'empty-stop'
        });
        performedCycles += 1;
        if (!waitOnEmpty) {
          stopReason = 'queue-empty';
          break;
        }
        await sleepForMs(pollSeconds * 1000);
        continue;
      }

      const effectiveDequeueLimit = dequeueLimit === null ? pendingGoals.length : dequeueLimit;
      const dequeuedGoals = pendingGoals.slice(0, effectiveDequeueLimit);
      const remainingGoals = pendingGoals.slice(dequeuedGoals.length);
      await writeControllerGoalQueue(currentQueue.file, currentQueue.format, remainingGoals);

      const cycleRecord = {
        cycle,
        queue_before: pendingGoals.length,
        dequeued: dequeuedGoals.length,
        queue_after: remainingGoals.length,
        processed: 0,
        completed: 0,
        failed: 0,
        status: 'processed'
      };

      for (let index = 0; index < dequeuedGoals.length; index += 1) {
        const goal = dequeuedGoals[index];
        const goalStartedAt = clock();
        let goalResult = {
          cycle,
          queue_index: index + 1,
          goal,
          status: 'failed',
          error: null
        };

        try {
          const perGoalOptions = {
            ...options,
            out: null,
            programKpiOut: null,
            programAuditOut: null,
            json: false
          };
          const programResult = await executeCloseLoopProgramGoal(goal, perGoalOptions, {
            projectPath,
            printSummary: options.controllerPrintProgramSummary === true,
            writeOutputs: false
          });
          const programSummary = programResult.summary || {};
          const failed = programResult.exitCode !== 0;
          goalResult = {
            ...goalResult,
            status: failed ? 'failed' : 'completed',
            program_status: programSummary.status || null,
            program_gate_passed: Boolean(
              programSummary.program_gate_effective &&
              programSummary.program_gate_effective.passed
            ),
            governance_stop_reason: programSummary.program_governance
              ? programSummary.program_governance.stop_reason
              : null,
            batch_session_file: programSummary.batch_session && programSummary.batch_session.file
              ? programSummary.batch_session.file
              : null
          };
        } catch (error) {
          goalResult.error = error.message;
        }

        goalResult.elapsed_ms = Math.max(0, clock() - goalStartedAt);
        results.push(goalResult);
        cycleRecord.processed += 1;

        if (goalResult.status === 'completed') {
          cycleRecord.completed += 1;
          doneArchiveFile = await appendControllerGoalArchive(
            options.controllerDoneFile,
            projectPath,
            goal,
            {
              status: 'completed',
              program_status: goalResult.program_status,
              gate_passed: goalResult.program_gate_passed
            }
          ) || doneArchiveFile;
        } else {
          cycleRecord.failed += 1;
          failedArchiveFile = await appendControllerGoalArchive(
            options.controllerFailedFile,
            projectPath,
            goal,
            {
              status: 'failed',
              program_status: goalResult.program_status,
              gate_passed: goalResult.program_gate_passed
            }
          ) || failedArchiveFile;
          if (stopOnGoalFailure) {
            haltRequested = true;
          }
        }

        if (haltRequested) {
          break;
        }
      }

      if (haltRequested) {
        cycleRecord.status = 'stopped-on-goal-failure';
        stopReason = 'goal-failure';
      }
      history.push(cycleRecord);
      performedCycles += 1;

      if (haltRequested) {
        break;
      }
    }
  } finally {
    await releaseControllerLock(lockState);
  }

  const finalQueue = await loadControllerGoalQueue(projectPath, queuePayload.file, queuePayload.format, {
    dedupe: options.controllerDedupe !== false
  });
  const pendingGoals = finalQueue.goals.length;
  dedupeDroppedGoals += Number(finalQueue.duplicate_count) || 0;
  if (options.controllerDedupe !== false && finalQueue.duplicate_count > 0) {
    await writeControllerGoalQueue(finalQueue.file, finalQueue.format, finalQueue.goals);
  }

  if (!exhausted && stopReason === 'completed') {
    if (performedCycles >= maxCycles && (pendingGoals > 0 || waitOnEmpty)) {
      exhausted = true;
      stopReason = 'cycle-limit-reached';
    } else if (pendingGoals === 0 && results.length === 0) {
      stopReason = 'queue-empty';
    }
  }

  const completedGoals = results.filter(item => item.status === 'completed').length;
  const failedGoals = results.filter(item => item.status !== 'completed').length;
  const status = failedGoals === 0
    ? 'completed'
    : completedGoals === 0
      ? 'failed'
      : 'partial-failed';
  const summary = {
    mode: 'auto-close-loop-controller',
    status,
    queue_file: queuePayload.file,
    queue_format: queuePayload.format,
    started_at: startedAtIso,
    completed_at: new Date(clock()).toISOString(),
    elapsed_ms: Math.max(0, clock() - startedAtMs),
    wait_on_empty: waitOnEmpty,
    poll_seconds: pollSeconds,
    dequeue_limit: dequeueLimit === null ? 'all' : dequeueLimit,
    max_cycles: maxCycles,
    max_minutes: maxMinutes,
    cycles_performed: performedCycles,
    exhausted,
    stop_reason: stopReason,
    processed_goals: results.length,
    completed_goals: completedGoals,
    failed_goals: failedGoals,
    pending_goals: pendingGoals,
    dedupe_enabled: options.controllerDedupe !== false,
    dedupe_dropped_goals: dedupeDroppedGoals,
    lock_enabled: options.controllerLock !== false,
    lock_file: lockState && lockState.file ? lockState.file : null,
    lock_ttl_seconds: lockState && Number.isInteger(lockState.ttl_seconds) ? lockState.ttl_seconds : null,
    resumed_from_controller_session: resumedSession
      ? {
          id: resumedSession.id,
          file: resumedSession.file || null,
          created_at: resumedSession.created_at || null
        }
      : null,
    done_archive_file: doneArchiveFile,
    failed_archive_file: failedArchiveFile,
    history,
    results
  };

  await maybePersistCloseLoopControllerSummary(summary, options, projectPath);
  await maybeWriteOutput(summary, options.controllerOut, projectPath);
  return summary;
}

module.exports = {
  runCloseLoopController
};
