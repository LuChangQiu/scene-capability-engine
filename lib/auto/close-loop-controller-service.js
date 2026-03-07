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
  const startedAt = Date.now();
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
      if ((Date.now() - startedAt) >= maxDurationMs) {
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
        const goalStartedAt = Date.now();
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

        goalResult.elapsed_ms = Math.max(0, Date.now() - goalStartedAt);
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
    started_at: new Date(startedAt).toISOString(),
    completed_at: new Date().toISOString(),
    elapsed_ms: Math.max(0, Date.now() - startedAt),
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
        file: resumedSession.file,
        status: resumedSession.payload && resumedSession.payload.status
          ? resumedSession.payload.status
          : null
      }
      : null,
    history,
    results,
    done_archive_file: doneArchiveFile,
    failed_archive_file: failedArchiveFile
  };

  await maybePersistCloseLoopControllerSummary(summary, options, projectPath);
  await maybeWriteOutput(summary, options.controllerOut, projectPath);
  return summary;
}

function printCloseLoopControllerSummary(summary) {
  console.log(chalk.blue('Autonomous close-loop controller summary'));
  console.log(chalk.gray(`  Status: ${summary.status}`));
  console.log(chalk.gray(`  Cycles: ${summary.cycles_performed}/${summary.max_cycles}`));
  console.log(chalk.gray(`  Processed goals: ${summary.processed_goals}`));
  console.log(chalk.gray(`  Completed: ${summary.completed_goals}`));
  console.log(chalk.gray(`  Failed: ${summary.failed_goals}`));
  console.log(chalk.gray(`  Pending queue goals: ${summary.pending_goals}`));
  if (summary.dedupe_enabled) {
    console.log(chalk.gray(`  Dedupe dropped: ${summary.dedupe_dropped_goals || 0}`));
  }
  console.log(chalk.gray(`  Stop reason: ${summary.stop_reason}`));
  if (summary.lock_enabled && summary.lock_file) {
    console.log(chalk.gray(`  Lock: ${summary.lock_file}`));
  }
  if (summary.controller_session && summary.controller_session.file) {
    console.log(chalk.gray(`  Session: ${summary.controller_session.file}`));
  }
  if (summary.done_archive_file) {
    console.log(chalk.gray(`  Done archive: ${summary.done_archive_file}`));
  }
  if (summary.failed_archive_file) {
    console.log(chalk.gray(`  Failed archive: ${summary.failed_archive_file}`));
  }
  if (summary.output_file) {
    console.log(chalk.gray(`  Output: ${summary.output_file}`));
  }
}

function printCloseLoopBatchSummary(summary, options) {
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const title = summary.mode === 'auto-close-loop-program'
    ? 'Autonomous close-loop program summary'
    : summary.mode === 'auto-close-loop-recover'
      ? 'Autonomous close-loop recovery summary'
    : 'Autonomous close-loop batch summary';
  console.log(chalk.blue(title));
  console.log(chalk.gray(`  Status: ${summary.status}`));
  console.log(chalk.gray(`  Processed: ${summary.processed_goals}/${summary.total_goals}`));
  console.log(chalk.gray(`  Completed: ${summary.completed_goals}`));
  console.log(chalk.gray(`  Failed: ${summary.failed_goals}`));
  console.log(chalk.gray(`  Batch parallel: ${summary.batch_parallel}`));
  if (summary.autonomous_policy && summary.autonomous_policy.enabled) {
    console.log(chalk.gray(`  Autonomous policy: ${summary.autonomous_policy.profile}`));
  }
  if (summary.batch_retry && summary.batch_retry.performed_rounds > 0) {
    console.log(chalk.gray(
      `  Batch retry: ${summary.batch_retry.performed_rounds}/${summary.batch_retry.configured_rounds} extra rounds`
    ));
  }
  if (summary.batch_retry && summary.batch_retry.recovery_recommended) {
    console.log(chalk.yellow(
      `  Rate-limit recovery recommended: signals=${summary.batch_retry.total_rate_limit_signals || 0}, ` +
      `backoff=${summary.batch_retry.total_rate_limit_backoff_ms || 0}ms`
    ));
    if (summary.batch_retry.recovery_suggested_command) {
      console.log(chalk.yellow(`  Suggested command: ${summary.batch_retry.recovery_suggested_command}`));
    }
  }
  if (summary.resource_plan.agent_budget !== null) {
    console.log(chalk.gray(
      `  Agent budget: ${summary.resource_plan.agent_budget} ` +
      `(per-goal maxParallel=${summary.resource_plan.per_goal_max_parallel})`
    ));
  }
  console.log(chalk.gray(`  Success rate: ${summary.metrics.success_rate_percent}%`));
  if (summary.program_kpi) {
    console.log(chalk.gray(
      `  Program KPI: ${summary.program_kpi.convergence_state}, ` +
      `risk=${summary.program_kpi.risk_level}, ` +
      `retry-recovery=${summary.program_kpi.retry_recovery_rate_percent}%`
    ));
  }
  if (summary.program_gate) {
    console.log(chalk.gray(
      `  Program gate: ${summary.program_gate.passed ? 'passed' : 'failed'} ` +
      `(profile=${summary.program_gate.policy.profile || 'default'}, ` +
      `min-success=${summary.program_gate.policy.min_success_rate_percent}%, ` +
      `max-risk=${summary.program_gate.policy.max_risk_level})`
    ));
    const gatePolicy = summary.program_gate.policy || {};
    const gateActual = summary.program_gate.actual || {};
    if (
      gatePolicy.max_elapsed_minutes !== null ||
      gatePolicy.max_agent_budget !== null ||
      gatePolicy.max_total_sub_specs !== null
    ) {
      console.log(chalk.gray(
        `  Program budget gate: elapsed=${gateActual.elapsed_minutes ?? 'n/a'}/${gatePolicy.max_elapsed_minutes ?? 'n/a'} min, ` +
        `agent=${gateActual.agent_budget ?? 'n/a'}/${gatePolicy.max_agent_budget ?? 'n/a'}, ` +
        `sub-specs=${gateActual.total_sub_specs ?? 'n/a'}/${gatePolicy.max_total_sub_specs ?? 'n/a'}`
      ));
    }
    if (
      summary.program_gate_effective &&
      summary.program_gate_effective.source !== 'primary' &&
      summary.program_gate_effective.fallback_profile
    ) {
      console.log(chalk.gray(
        `  Program gate fallback accepted: profile=${summary.program_gate_effective.fallback_profile}`
      ));
    }
  }
  if (
    summary.program_diagnostics &&
    Array.isArray(summary.program_diagnostics.remediation_actions) &&
    summary.program_diagnostics.remediation_actions.length > 0
  ) {
    const topAction = summary.program_diagnostics.remediation_actions[0];
    console.log(chalk.gray(`  Top remediation: ${topAction.action}`));
  }
  if (summary.recovery_cycle && summary.recovery_cycle.enabled) {
    console.log(chalk.gray(
      `  Recovery rounds: ${summary.recovery_cycle.performed_rounds}/${summary.recovery_cycle.max_rounds}`
    ));
    if (summary.recovery_cycle.budget_exhausted) {
      console.log(chalk.gray('  Recovery time budget exhausted before convergence.'));
    }
  }
  if (summary.auto_recovery && summary.auto_recovery.triggered) {
    console.log(chalk.gray(
      `  Program auto-recovery: ${summary.auto_recovery.recovery_status} ` +
      `(action ${summary.auto_recovery.selected_action_index || 'n/a'}, ` +
      `source=${summary.auto_recovery.selection_source || 'default'})`
    ));
  }
  if (summary.program_governance && summary.program_governance.enabled) {
    console.log(chalk.gray(
      `  Program governance: ${summary.program_governance.performed_rounds}/` +
      `${summary.program_governance.max_rounds} rounds, stop=${summary.program_governance.stop_reason}`
    ));
    if (summary.program_governance.action_selection_enabled) {
      console.log(chalk.gray(
        `  Governance action selection: ` +
        `${summary.program_governance.auto_action_enabled ? 'auto' : 'manual-only'}, ` +
        `pinned=${summary.program_governance.pinned_action_index || 'none'}`
      ));
    }
    if (Array.isArray(summary.program_governance.history) && summary.program_governance.history.length > 0) {
      const latestRound = summary.program_governance.history[summary.program_governance.history.length - 1];
      if (latestRound && latestRound.selected_action) {
        console.log(chalk.gray(
          `  Governance selected action: #${latestRound.selected_action_index || 'n/a'} ${latestRound.selected_action}`
        ));
      }
    }
    if (summary.program_governance.exhausted) {
      console.log(chalk.yellow('  Program governance exhausted before reaching stable state.'));
    }
  }
  if (Array.isArray(summary.program_kpi_anomalies) && summary.program_kpi_anomalies.length > 0) {
    const highCount = summary.program_kpi_anomalies
      .filter(item => `${item && item.severity ? item.severity : ''}`.trim().toLowerCase() === 'high')
      .length;
    console.log(chalk.gray(
      `  Program KPI anomalies: total=${summary.program_kpi_anomalies.length}, high=${highCount}`
    ));
  }
  if (summary.program_coordination) {
    console.log(chalk.gray(
      `  Master/Sub sync: masters=${summary.program_coordination.master_spec_count}, ` +
      `sub-specs=${summary.program_coordination.sub_spec_count}, ` +
      `unresolved=${summary.program_coordination.unresolved_goal_count}`
    ));
  }
  if (summary.batch_session && summary.batch_session.file) {
    console.log(chalk.gray(`  Batch session: ${summary.batch_session.file}`));
  }
  if (summary.goal_input_guard && summary.goal_input_guard.enabled) {
    console.log(chalk.gray(
      `  Goal duplicate guard: duplicates=${summary.goal_input_guard.duplicate_goals}/` +
      `${summary.goal_input_guard.max_duplicate_goals}`
    ));
    if (summary.goal_input_guard.over_limit) {
      console.log(chalk.yellow('  Goal duplicate guard exceeded.'));
    }
  }
  if (summary.spec_session_prune && summary.spec_session_prune.enabled) {
    console.log(chalk.gray(
      `  Spec prune: deleted=${summary.spec_session_prune.deleted_count}, ` +
      `protected=${summary.spec_session_prune.protected_count}`
    ));
  }
  if (summary.spec_session_budget && summary.spec_session_budget.enabled) {
    console.log(chalk.gray(
      `  Spec budget: ${summary.spec_session_budget.total_after}/${summary.spec_session_budget.max_total} ` +
      `(created~${summary.spec_session_budget.estimated_created}, pruned=${summary.spec_session_budget.pruned_count})`
    ));
    if (summary.spec_session_budget.over_limit_after) {
      console.log(chalk.yellow(
        `  Spec budget exceeded (${summary.spec_session_budget.total_after} > ${summary.spec_session_budget.max_total})`
      ));
    }
  }
  if (summary.spec_session_growth_guard && summary.spec_session_growth_guard.enabled) {
    console.log(chalk.gray(
      `  Spec growth guard: created~${summary.spec_session_growth_guard.estimated_created}` +
      ` (per-goal=${summary.spec_session_growth_guard.estimated_created_per_goal})`
    ));
    if (summary.spec_session_growth_guard.over_limit) {
      console.log(chalk.yellow(`  Spec growth guard exceeded: ${summary.spec_session_growth_guard.reasons.join('; ')}`));
    }
  }
  if (summary.program_gate_auto_remediation && summary.program_gate_auto_remediation.enabled) {
    const autoRemediationActions = Array.isArray(summary.program_gate_auto_remediation.actions)
      ? summary.program_gate_auto_remediation.actions
      : [];
    console.log(chalk.gray(
      `  Program auto-remediation: actions=${autoRemediationActions.length}, ` +
      `next-patch=${summary.program_gate_auto_remediation.next_run_patch ? 'yes' : 'no'}`
    ));
  }
  if (summary.program_kpi_file) {
    console.log(chalk.gray(`  Program KPI file: ${summary.program_kpi_file}`));
  }
  if (summary.program_audit_file) {
    console.log(chalk.gray(`  Program audit file: ${summary.program_audit_file}`));
  }
  if (summary.output_file) {
    console.log(chalk.gray(`  Output: ${summary.output_file}`));
  }
}

async function maybeWriteOutput(result, outCandidate, projectPath) {
  if (!outCandidate) {
    return;
  }

  const outputPath = path.isAbsolute(outCandidate)
    ? outCandidate
    : path.join(projectPath, outCandidate);
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeJson(outputPath, result, { spaces: 2 });
  result.output_file = outputPath;
}

async function maybeWriteTextOutput(result, content, outCandidate, projectPath) {
  if (!outCandidate) {
    return;
  }

  const outputPath = path.isAbsolute(outCandidate)
    ? outCandidate
    : path.join(projectPath, outCandidate);
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, content, 'utf8');
  result.output_file = outputPath;
}

function normalizeAutoHandoffManifestPath(projectPath, manifestCandidate) {
  const candidate = typeof manifestCandidate === 'string'
    ? manifestCandidate.trim()
    : '';
  if (!candidate) {
    throw new Error('handoff manifest path is required');
  }
  return path.isAbsolute(candidate)
    ? candidate
    : path.join(projectPath, candidate);
}

function toAutoHandoffCliPath(projectPath, absolutePath) {
  const relative = path.relative(projectPath, absolutePath);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/');
  }
  return absolutePath;
}

function quoteCliArg(value) {
  const raw = `${value || ''}`;
  if (raw.length === 0) {
    return '""';
  }
  if (!/[\s"'`]/.test(raw)) {
    return raw;
  }
  return `"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function readHandoffPathValue(input, keyPath) {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const parts = String(keyPath || '')
    .split('.')
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  let cursor = input;
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object' || !(part in cursor)) {
      return null;
    }
    cursor = cursor[part];
  }
  return cursor;
}

function readHandoffFirstPathValue(input, keyPaths = []) {
  const paths = Array.isArray(keyPaths) ? keyPaths : [];
  for (const keyPath of paths) {
    const value = readHandoffPathValue(input, keyPath);
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
}

function normalizeHandoffNumber(value, options = {}) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) {
    return null;
  }
  const min = Number.isFinite(options.min) ? Number(options.min) : null;
  const max = Number.isFinite(options.max) ? Number(options.max) : null;
  if (min !== null && candidate < min) {
    return null;
  }
  if (max !== null && candidate > max) {
    return null;
  }
  if (options.integer === true) {
    return Math.trunc(candidate);
  }
  const precision = Number.isInteger(options.precision) && options.precision >= 0
    ? options.precision
    : null;
  if (precision === null) {
    return candidate;
  }
  return Number(candidate.toFixed(precision));
}

function normalizeHandoffOntologyCollection(rawCollection) {
  if (Array.isArray(rawCollection)) {
    return rawCollection.filter(item => item && typeof item === 'object' && !Array.isArray(item));
  }
  if (!rawCollection || typeof rawCollection !== 'object' || Array.isArray(rawCollection)) {
    return [];
  }

  const listCandidate = rawCollection.items || rawCollection.values || rawCollection.list || rawCollection.nodes;
  if (Array.isArray(listCandidate)) {
    return listCandidate.filter(item => item && typeof item === 'object' && !Array.isArray(item));
  }

  return Object.values(rawCollection)
    .filter(item => item && typeof item === 'object' && !Array.isArray(item));
}

function normalizeHandoffOntologyModel(payload) {
  const modelRoot = readHandoffFirstPathValue(payload, [
    'model',
    'ontology_model',
    'semantic_model',
    'ontology.model'
  ]) || payload || {};

  const entityItems = normalizeHandoffOntologyCollection(
    readHandoffFirstPathValue(modelRoot, ['entities', 'entity_model.entities', 'entity_relations.entities'])
  );
  const relationItems = normalizeHandoffOntologyCollection(
    readHandoffFirstPathValue(modelRoot, ['relations', 'entity_relations.relations', 'relation_model.relations'])
  );
  const ruleItems = normalizeHandoffOntologyCollection(
    readHandoffFirstPathValue(modelRoot, ['business_rules', 'rules', 'governance.business_rules'])
  );
  const decisionItems = normalizeHandoffOntologyCollection(
    readHandoffFirstPathValue(modelRoot, ['decision_logic', 'decisions', 'governance.decision_logic'])
  );

  const entities = entityItems.map(item => ({
    id: normalizeHandoffIdentifier(item, ['id', 'ref', 'name', 'entity', 'code']) || null,
    type: normalizeHandoffText(item.type) || null
  }));

  const relations = relationItems.map(item => ({
    source: normalizeHandoffIdentifier(item, ['source', 'from', 'src', 'left', 'parent']) || null,
    target: normalizeHandoffIdentifier(item, ['target', 'to', 'dst', 'right', 'child']) || null,
    type: normalizeHandoffText(item.type || item.relation || item.relation_type) || null
  }));

  const rules = ruleItems.map(item => {
    const statusText = normalizeHandoffText(item.status || item.state || item.result || item.verdict);
    const statusToken = statusText ? statusText.toLowerCase() : null;
    const mapped = item.mapped === true
      || item.bound === true
      || Boolean(
        normalizeHandoffIdentifier(item, [
          'entity',
          'entity_ref',
          'target_ref',
          'bind_to',
          'applies_to',
          'scope_ref'
        ])
      );
    const passed = item.passed === true
      || item.valid === true
      || item.success === true
      || (statusToken
        ? ['passed', 'active', 'implemented', 'enforced', 'success', 'ok', 'valid'].includes(statusToken)
        : false);

    return {
      id: normalizeHandoffIdentifier(item, ['id', 'rule_id', 'name', 'ref']) || null,
      mapped,
      passed
    };
  });

  const decisions = decisionItems.map(item => {
    const statusText = normalizeHandoffText(item.status || item.state || item.result || item.outcome);
    const statusToken = statusText ? statusText.toLowerCase() : null;
    const resolved = item.resolved === true
      || item.applied === true
      || item.decided === true
      || item.completed === true
      || (statusToken
        ? ['resolved', 'decided', 'implemented', 'completed', 'active', 'success'].includes(statusToken)
        : false);
    const automated = item.automated === true
      || item.tested === true
      || item.simulated === true;

    return {
      id: normalizeHandoffIdentifier(item, ['id', 'decision_id', 'name', 'ref']) || null,
      resolved,
      automated
    };
  });

  return {
    entities,
    relations,
    business_rules: rules,
    decision_logic: decisions
  };
}

function normalizeHandoffIdentifier(entry, fieldCandidates = []) {
  const directText = normalizeHandoffText(entry);
  if (directText) {
    return directText;
  }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }

  for (const field of fieldCandidates) {
    const value = readHandoffPathValue(entry, field);
    const normalized = normalizeHandoffText(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function collectUniqueIdentifiers(rawEntries, fieldCandidates, label) {
  const warnings = [];
  if (rawEntries === undefined || rawEntries === null) {
    return { values: [], warnings };
  }
  if (!Array.isArray(rawEntries)) {
    return {
      values: [],
      warnings: [`${label} must be an array`]
    };
  }

  const values = [];
  const seen = new Set();
  rawEntries.forEach((entry, index) => {
    const normalized = normalizeHandoffIdentifier(entry, fieldCandidates);
    if (!normalized) {
      warnings.push(`${label}[${index}] is invalid and was ignored`);
      return;
    }
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    values.push(normalized);
  });

  return { values, warnings };
}

function normalizeAutoHandoffTemplateCapabilityCandidate(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const raw = `${value}`.trim();
  if (!raw) {
    return null;
  }
  const normalizedPath = raw.toLowerCase().replace(/\\/g, '/');
  const baseName = normalizedPath.split('/').pop() || normalizedPath;
  let candidate = baseName.replace(/^[a-z0-9-]+\.scene--/, 'scene--');
  candidate = candidate.replace(/^scene--/, '');
  candidate = candidate.replace(
    /--\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?(?:\+[a-z0-9.-]+)?$/,
    ''
  );
  candidate = candidate.replace(/--\d{4}(?:-\d{2}){1,2}(?:-[a-z0-9-]+)?$/, '');
  return normalizeMoquiCapabilityToken(candidate);
}

function inferManifestCapabilitiesFromTemplates(
  templateIdentifiers = [],
  lexiconIndex = MOQUI_CAPABILITY_LEXICON_INDEX
) {
  const inferred = [];
  const inferredSet = new Set();
  const inferredFrom = [];
  const unresolvedTemplates = [];
  const unresolvedSet = new Set();

  if (!Array.isArray(templateIdentifiers) || templateIdentifiers.length === 0) {
    return {
      capabilities: inferred,
      inferred_from: inferredFrom,
      unresolved_templates: unresolvedTemplates
    };
  }

  for (const templateIdentifier of templateIdentifiers) {
    const candidate = normalizeAutoHandoffTemplateCapabilityCandidate(templateIdentifier);
    if (!candidate) {
      continue;
    }
    const descriptor = resolveMoquiCapabilityDescriptor(candidate, lexiconIndex);
    if (descriptor && descriptor.is_known) {
      if (!inferredSet.has(descriptor.canonical)) {
        inferredSet.add(descriptor.canonical);
        inferred.push(descriptor.canonical);
      }
      inferredFrom.push({
        template: templateIdentifier,
        normalized_template: candidate,
        capability: descriptor.canonical
      });
      continue;
    }
    if (!unresolvedSet.has(templateIdentifier)) {
      unresolvedSet.add(templateIdentifier);
      unresolvedTemplates.push(templateIdentifier);
    }
  }

  return {
    capabilities: inferred,
    inferred_from: inferredFrom,
    unresolved_templates: unresolvedTemplates
  };
}

function normalizeHandoffDependencyEntry(entry) {
  return normalizeHandoffIdentifier(entry, [
    'name',
    'spec',
    'spec_name',
    'spec_id',
    'id',
    'spec.name',
    'spec.id'
  ]);
}

function normalizeHandoffDependencyList(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return [];
  }
  const raw =
    readHandoffPathValue(entry, 'depends_on')
    || readHandoffPathValue(entry, 'dependsOn')
    || readHandoffPathValue(entry, 'dependencies')
    || readHandoffPathValue(entry, 'depends')
    || readHandoffPathValue(entry, 'requires')
    || null;
  if (!raw) {
    return [];
  }

  let candidates = [];
  if (Array.isArray(raw)) {
    candidates = raw;
  } else if (typeof raw === 'string') {
    candidates = raw
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  } else {
    candidates = [raw];
  }

  const values = [];
  const seen = new Set();
  for (const item of candidates) {
    const normalized = normalizeHandoffDependencyEntry(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    values.push(normalized);
  }
  return values;
}

function collectHandoffSpecDescriptors(rawEntries) {
  const warnings = [];
  if (rawEntries === undefined || rawEntries === null) {
    return {
      values: [],
      descriptors: [],
      warnings: ['specs must be an array']
    };
  }
  if (!Array.isArray(rawEntries)) {
    return {
      values: [],
      descriptors: [],
      warnings: ['specs must be an array']
    };
  }

  const values = [];
  const descriptors = [];
  const seen = new Set();
  const descriptorMap = new Map();

  rawEntries.forEach((entry, index) => {
    const name = normalizeHandoffIdentifier(entry, [
      'name',
      'spec',
      'spec_name',
      'spec_id',
      'id',
      'spec.name',
      'spec.id'
    ]);
    if (!name) {
      warnings.push(`specs[${index}] is invalid and was ignored`);
      return;
    }
    const dependsOn = normalizeHandoffDependencyList(entry);
    if (!seen.has(name)) {
      seen.add(name);
      values.push(name);
      const descriptor = {
        name,
        depends_on: dependsOn
      };
      descriptors.push(descriptor);
      descriptorMap.set(name, descriptor);
      return;
    }

    const existing = descriptorMap.get(name);
    const existingSet = new Set(existing.depends_on);
    for (const dep of dependsOn) {
      if (!existingSet.has(dep)) {
        existingSet.add(dep);
        existing.depends_on.push(dep);
      }
    }
  });

  const specSet = new Set(values);
  descriptors.forEach(item => {
    const filtered = [];
    const seenDeps = new Set();
    item.depends_on.forEach(dep => {
      if (dep === item.name) {
        warnings.push(`spec ${item.name} dependency "${dep}" ignored (self reference)`);
        return;
      }
      if (!specSet.has(dep)) {
        warnings.push(`spec ${item.name} dependency "${dep}" ignored (not found in specs list)`);
        return;
      }
      if (seenDeps.has(dep)) {
        return;
      }
      seenDeps.add(dep);
      filtered.push(dep);
    });
    item.depends_on = filtered;
  });

  return { values, descriptors, warnings };
}

function buildAutoHandoffDependencyBatches(specDescriptors = []) {
  const normalized = Array.isArray(specDescriptors)
    ? specDescriptors
      .filter(item => item && typeof item.name === 'string' && item.name.trim().length > 0)
      .map(item => ({
        name: item.name.trim(),
        depends_on: Array.isArray(item.depends_on)
          ? item.depends_on
            .map(dep => `${dep || ''}`.trim())
            .filter(Boolean)
          : []
      }))
    : [];
  const warnings = [];
  if (normalized.length === 0) {
    return {
      enabled: true,
      batch_count: 0,
      batches: [],
      warnings,
      cyclic: false
    };
  }

  const nodeMap = new Map();
  normalized.forEach(item => nodeMap.set(item.name, item));
  normalized.forEach(item => {
    item.depends_on = item.depends_on.filter(dep => nodeMap.has(dep) && dep !== item.name);
  });

  const remaining = new Set(normalized.map(item => item.name));
  const batches = [];
  let cyclic = false;
  while (remaining.size > 0) {
    const ready = [];
    for (const name of remaining) {
      const node = nodeMap.get(name);
      const blocked = node.depends_on.some(dep => remaining.has(dep));
      if (!blocked) {
        ready.push(name);
      }
    }

    if (ready.length === 0) {
      cyclic = true;
      const fallback = Array.from(remaining).sort();
      warnings.push('spec dependency cycle detected; fallback to one final merged batch');
      batches.push({
        index: batches.length + 1,
        specs: fallback
      });
      break;
    }

    ready.sort();
    batches.push({
      index: batches.length + 1,
      specs: ready
    });
    ready.forEach(name => remaining.delete(name));
  }

  return {
    enabled: true,
    batch_count: batches.length,
    batches,
    warnings,
    cyclic
  };
}

function collectKnownGaps(rawKnownGaps) {
  const warnings = [];
  if (rawKnownGaps === undefined || rawKnownGaps === null) {
    return { gaps: [], warnings };
  }
  if (!Array.isArray(rawKnownGaps)) {
    return {
      gaps: [],
      warnings: ['known_gaps must be an array']
    };
  }

  const gaps = [];
  rawKnownGaps.forEach((entry, index) => {
    const normalized = normalizeHandoffIdentifier(entry, [
      'gap',
      'title',
      'description',
      'message',
      'name',
      'id'
    ]);
    if (!normalized) {
      warnings.push(`known_gaps[${index}] is invalid and was ignored`);
      return;
    }
    gaps.push(normalized);
  });
  return { gaps, warnings };
}

function normalizeAutoHandoffManifest(payload = {}) {
  const validationErrors = [];
  const validationWarnings = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('handoff manifest must be a JSON object');
  }

  const sourceProject = normalizeHandoffText(payload.source_project);
  if (!sourceProject) {
    validationWarnings.push('source_project is missing');
  }

  const timestamp = normalizeHandoffText(payload.timestamp);
  if (!timestamp) {
    validationWarnings.push('timestamp is missing');
  }

  const specsCollected = collectHandoffSpecDescriptors(payload.specs);
  validationWarnings.push(...specsCollected.warnings);
  if (specsCollected.values.length === 0) {
    validationErrors.push('specs must include at least one valid spec identifier');
  }
  const dependencyBatches = buildAutoHandoffDependencyBatches(specsCollected.descriptors);
  validationWarnings.push(...dependencyBatches.warnings);

  const templatesCollected = collectUniqueIdentifiers(
    payload.templates,
    ['name', 'template', 'template_name', 'id', 'template.id', 'template.name'],
    'templates'
  );
  validationWarnings.push(...templatesCollected.warnings);
  if (templatesCollected.values.length === 0) {
    validationWarnings.push('templates is empty');
  }

  const capabilitiesCollected = collectUniqueIdentifiers(
    payload.capabilities,
    ['name', 'capability', 'capability_name', 'id', 'capability.id', 'capability.name'],
    'capabilities'
  );
  validationWarnings.push(...capabilitiesCollected.warnings);
  const capabilityInference = inferManifestCapabilitiesFromTemplates(
    templatesCollected.values,
    MOQUI_CAPABILITY_LEXICON_INDEX
  );
  let capabilityValues = capabilitiesCollected.values;
  let capabilitySource = 'manifest';
  if (capabilitiesCollected.values.length === 0) {
    if (capabilityInference.capabilities.length > 0) {
      capabilityValues = capabilityInference.capabilities;
      capabilitySource = 'inferred-from-templates';
      validationWarnings.push(
        `capabilities not declared; inferred ${capabilityValues.length} canonical capabilities from templates`
      );
      if (capabilityInference.unresolved_templates.length > 0) {
        const preview = capabilityInference.unresolved_templates.slice(0, 5).join(', ');
        const suffix = capabilityInference.unresolved_templates.length > 5
          ? ` (+${capabilityInference.unresolved_templates.length - 5} more)`
          : '';
        validationWarnings.push(
          `template capability inference skipped ${capabilityInference.unresolved_templates.length} templates not found in lexicon: ${preview}${suffix}`
        );
      }
    } else {
      capabilitySource = 'none';
      validationWarnings.push('capabilities is empty; capability coverage gate will be skipped unless capabilities are declared');
    }
  }

  const knownGapCollected = collectKnownGaps(payload.known_gaps);
  validationWarnings.push(...knownGapCollected.warnings);

  const ontologyValidation = payload.ontology_validation && typeof payload.ontology_validation === 'object'
    ? payload.ontology_validation
    : null;
  if (!ontologyValidation) {
    validationWarnings.push('ontology_validation is missing');
  }

  const nextBatch = payload.next_batch && typeof payload.next_batch === 'object'
    ? payload.next_batch
    : null;

  return {
    source_project: sourceProject,
    timestamp,
    specs: specsCollected.values,
    spec_descriptors: specsCollected.descriptors,
    dependency_batches: dependencyBatches,
    templates: templatesCollected.values,
    capabilities: capabilityValues,
    capability_source: capabilitySource,
    capability_inference: {
      applied: capabilitySource === 'inferred-from-templates',
      inferred_count: capabilityInference.capabilities.length,
      inferred_capabilities: capabilityInference.capabilities,
      inferred_from_templates: capabilityInference.inferred_from,
      unresolved_template_count: capabilityInference.unresolved_templates.length,
      unresolved_templates: capabilityInference.unresolved_templates
    },
    known_gaps: knownGapCollected.gaps,
    ontology_validation: ontologyValidation,
    next_batch: nextBatch,
    validation: {
      errors: validationErrors,
      warnings: validationWarnings
    }
  };
}

async function loadAutoHandoffManifest(projectPath, manifestCandidate) {
  const manifestPath = normalizeAutoHandoffManifestPath(projectPath, manifestCandidate);
  if (!await fs.pathExists(manifestPath)) {
    throw new Error(`handoff manifest not found: ${manifestPath}`);
  }

  let payload;
  try {
    payload = await fs.readJson(manifestPath);
  } catch (error) {
    throw new Error(`invalid handoff manifest JSON: ${manifestPath} (${error.message})`);
  }

  const normalized = normalizeAutoHandoffManifest(payload);
  return {
    manifest_path: manifestPath,
    manifest_file: toAutoHandoffCliPath(projectPath, manifestPath),
    ...normalized
  };
}

function buildAutoHandoffPhaseCommands(projectPath, manifestPath, specs = []) {
  const manifestCli = quoteCliArg(toAutoHandoffCliPath(projectPath, manifestPath));
  const phases = [];

  phases.push({
    id: 'precheck',
    title: 'Precheck',
    goal: 'Validate handoff manifest integrity and repository readiness',
    commands: [
      `sce auto handoff plan --manifest ${manifestCli} --json`,
      'sce auto governance stats --json'
    ]
  });

  const specCommands = [];
  for (const specName of specs) {
    const specArg = quoteCliArg(specName);
    const specPackagePath = quoteCliArg(`.sce/specs/${specName}/custom`);
    specCommands.push(`sce auto spec status ${specArg} --json`);
    specCommands.push(`sce auto spec instructions ${specArg} --json`);
    specCommands.push(`sce scene package-validate --spec ${specArg} --spec-package custom/scene-package.json --strict --json`);
    specCommands.push(`sce scene ontology validate --package ${specPackagePath} --json`);
  }
  phases.push({
    id: 'spec-validation',
    title: 'Spec Validation',
    goal: 'Validate spec docs, tasks, scene package contract, and ontology consistency',
    commands: specCommands
  });

  const queueCli = quoteCliArg(AUTO_HANDOFF_DEFAULT_QUEUE_FILE);
  phases.push({
    id: 'execution',
    title: 'Autonomous Execution',
    goal: 'Generate queue goals and run autonomous close-loop batch integration',
    commands: [
      `sce auto handoff queue --manifest ${manifestCli} --out ${queueCli} --json`,
      `sce auto close-loop-batch ${queueCli} --format lines --json`
    ]
  });

  phases.push({
    id: 'observability',
    title: 'Observability and Governance',
    goal: 'Snapshot integration evidence and plan remaining governance actions',
    commands: [
      'sce auto observability snapshot --json',
      'sce auto governance maintain --session-keep 50 --batch-session-keep 50 --controller-session-keep 50 --json'
    ]
  });

  return phases;
}

async function buildAutoHandoffPlan(projectPath, options = {}) {
  const handoff = await loadAutoHandoffManifest(projectPath, options.manifest);
  const validationErrors = Array.isArray(handoff.validation.errors) ? handoff.validation.errors : [];
  const validationWarnings = Array.isArray(handoff.validation.warnings) ? handoff.validation.warnings : [];

  if (options.strict && validationErrors.length > 0) {
    throw new Error(`handoff plan validation failed: ${validationErrors.join('; ')}`);
  }
  if (options.strictWarnings && validationWarnings.length > 0) {
    throw new Error(`handoff plan validation warnings: ${validationWarnings.join('; ')}`);
  }

  const phases = buildAutoHandoffPhaseCommands(projectPath, handoff.manifest_path, handoff.specs);
  return {
    mode: 'auto-handoff-plan',
    generated_at: new Date().toISOString(),
    manifest_path: handoff.manifest_path,
    source_project: handoff.source_project,
    handoff: {
      timestamp: handoff.timestamp,
      spec_count: handoff.specs.length,
      template_count: handoff.templates.length,
      capability_count: Array.isArray(handoff.capabilities) ? handoff.capabilities.length : 0,
      known_gap_count: handoff.known_gaps.length,
      specs: handoff.specs,
      spec_descriptors: handoff.spec_descriptors,
      dependency_batches: handoff.dependency_batches,
      templates: handoff.templates,
      capabilities: handoff.capabilities,
      capability_source: handoff.capability_source || 'manifest',
      capability_inference: handoff.capability_inference && typeof handoff.capability_inference === 'object'
        ? handoff.capability_inference
        : {
          applied: false,
          inferred_count: 0,
          inferred_capabilities: [],
          inferred_from_templates: [],
          unresolved_template_count: 0,
          unresolved_templates: []
        },
      known_gaps: handoff.known_gaps,
      ontology_validation: handoff.ontology_validation,
      next_batch: handoff.next_batch
    },
    validation: {
      is_valid: validationErrors.length === 0,
      errors: validationErrors,
      warnings: validationWarnings
    },
    phases,
    recommendations: [
      `sce auto handoff queue --manifest ${quoteCliArg(handoff.manifest_file)} --out ${quoteCliArg(AUTO_HANDOFF_DEFAULT_QUEUE_FILE)} --json`,
      `sce auto close-loop-batch ${quoteCliArg(AUTO_HANDOFF_DEFAULT_QUEUE_FILE)} --format lines --json`
    ]
  };
}

function buildAutoHandoffQueueGoals(handoff, options = {}) {
  const includeKnownGaps = options.includeKnownGaps !== false;
  const goals = [];
  const seen = new Set();
  const pushGoal = value => {
    const normalized = normalizeHandoffText(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    goals.push(normalized);
  };

  for (const specName of handoff.specs) {
    pushGoal(`integrate handoff spec ${specName} with scene package validation, ontology consistency checks, and close-loop completion`);
  }

  for (const templateName of handoff.templates) {
    pushGoal(`validate handoff template ${templateName} for template registry compatibility and release readiness`);
  }

  if (includeKnownGaps) {
    for (const gap of handoff.known_gaps) {
      pushGoal(`remediate handoff known gap: ${gap}`);
    }
  }

  pushGoal('generate unified observability snapshot and governance follow-up recommendations for this handoff batch');
  return goals;
}

async function buildAutoHandoffQueue(projectPath, options = {}) {
  const handoff = await loadAutoHandoffManifest(projectPath, options.manifest);
  const validationErrors = Array.isArray(handoff.validation.errors) ? handoff.validation.errors : [];
  if (validationErrors.length > 0) {
    throw new Error(`handoff queue validation failed: ${validationErrors.join('; ')}`);
  }

  const includeKnownGaps = options.includeKnownGaps !== false;
  const goals = buildAutoHandoffQueueGoals(handoff, { includeKnownGaps });
  if (goals.length === 0) {
    throw new Error('handoff queue produced no goals');
  }

  return {
    mode: 'auto-handoff-queue',
    generated_at: new Date().toISOString(),
    manifest_path: handoff.manifest_path,
    dry_run: Boolean(options.dryRun),
    append: Boolean(options.append),
    include_known_gaps: includeKnownGaps,
    goal_count: goals.length,
    goals,
    validation: {
      errors: handoff.validation.errors,
      warnings: handoff.validation.warnings
    },
    recommendations: [
      `sce auto close-loop-batch ${quoteCliArg(options.out || AUTO_HANDOFF_DEFAULT_QUEUE_FILE)} --format lines --json`
    ]
  };
}

async function writeAutoHandoffQueueFile(projectPath, queueResult, options = {}) {
  const outCandidate = typeof options.out === 'string' && options.out.trim().length > 0
    ? options.out.trim()
    : AUTO_HANDOFF_DEFAULT_QUEUE_FILE;
  const outputPath = path.isAbsolute(outCandidate)
    ? outCandidate
    : path.join(projectPath, outCandidate);
  await fs.ensureDir(path.dirname(outputPath));

  const content = `${queueResult.goals.join('\n')}\n`;
  if (options.append && await fs.pathExists(outputPath)) {
    const existing = await fs.readFile(outputPath, 'utf8');
    const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
    await fs.appendFile(outputPath, `${separator}${content}`, 'utf8');
  } else {
    await fs.writeFile(outputPath, content, 'utf8');
  }

  queueResult.output_file = outputPath;
}

async function listDirectoryNamesIfExists(baseDir) {
  if (!await fs.pathExists(baseDir)) {
    return [];
  }
  const entries = await fs.readdir(baseDir);
  const names = [];
  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry);
    try {
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        names.push(entry);
      }
    } catch (error) {
      // Ignore ephemeral or unreadable entries.
    }
  }
  return names;
}

function collectTemplateNamesFromPayload(payload, sink = new Set(), depth = 0) {
  if (depth > 6 || payload === null || payload === undefined) {
    return sink;
  }
  if (Array.isArray(payload)) {
    payload.forEach(item => collectTemplateNamesFromPayload(item, sink, depth + 1));
    return sink;
  }
  if (typeof payload !== 'object') {
    return sink;
  }

  const directName = normalizeHandoffIdentifier(payload, [
    'name',
    'template',
    'template_name',
    'template.id',
    'template.name'
  ]);
  if (directName) {
    sink.add(directName);
  }

  const candidateKeys = [
    'templates',
    'items',
    'entries',
    'packages',
    'registry',
    'values',
    'data'
  ];
  candidateKeys.forEach(key => {
    if (key in payload) {
      collectTemplateNamesFromPayload(payload[key], sink, depth + 1);
    }
  });

  return sink;
}

async function collectLocalTemplateNames(projectPath) {
  const names = new Set();
  const templateRoot = path.join(projectPath, '.sce', 'templates');
  const exportRoot = path.join(templateRoot, 'exports');
  const sceneTemplateRoot = path.join(templateRoot, 'scene-packages');
  const registryFile = path.join(sceneTemplateRoot, 'registry.json');

  (await listDirectoryNamesIfExists(templateRoot))
    .filter(name => !['exports', 'scene-packages'].includes(name))
    .forEach(name => names.add(name));

  (await listDirectoryNamesIfExists(exportRoot)).forEach(name => names.add(name));
  (await listDirectoryNamesIfExists(sceneTemplateRoot))
    .filter(name => name !== 'archives')
    .forEach(name => names.add(name));

  if (await fs.pathExists(registryFile)) {
    try {
      const payload = await fs.readJson(registryFile);
      collectTemplateNamesFromPayload(payload, names);
    } catch (error) {
      // Ignore parse failures; template diff should still work with filesystem signals.
    }
  }

  return Array.from(names).sort((left, right) => left.localeCompare(right));
}

async function buildAutoHandoffTemplateDiff(projectPath, options = {}) {
  const handoff = options.handoff && typeof options.handoff === 'object'
    ? options.handoff
    : await loadAutoHandoffManifest(projectPath, options.manifest);
  const manifestTemplates = Array.isArray(handoff.templates)
    ? handoff.templates.map(item => `${item || ''}`.trim()).filter(Boolean)
    : [];
  const localTemplates = await collectLocalTemplateNames(projectPath);

  const manifestSet = new Set(manifestTemplates);
  const localSet = new Set(localTemplates);
  const missingInLocal = manifestTemplates.filter(item => !localSet.has(item));
  const extraInLocal = localTemplates.filter(item => !manifestSet.has(item));
  const matched = manifestTemplates.filter(item => localSet.has(item));
  const compatibility = missingInLocal.length === 0 ? 'ready' : 'needs-sync';

  return {
    mode: 'auto-handoff-template-diff',
    generated_at: new Date().toISOString(),
    manifest_path: handoff.manifest_path || null,
    manifest: {
      template_count: manifestTemplates.length,
      templates: manifestTemplates
    },
    local: {
      template_count: localTemplates.length,
      templates: localTemplates
    },
    diff: {
      matched,
      missing_in_local: missingInLocal,
      extra_in_local: extraInLocal
    },
    compatibility,
    recommendations: compatibility === 'ready'
      ? []
      : [
        'sync missing templates from handoff source into .sce/templates/exports or scene-packages registry',
        're-run `sce auto handoff template-diff --manifest <path> --json` after sync'
      ]
  };
}

function buildAutoHandoffSpecGoalLookup(handoff, queueGoals = []) {
  const specs = Array.isArray(handoff && handoff.specs)
    ? handoff.specs.map(item => `${item || ''}`.trim()).filter(Boolean)
    : [];
  const goals = Array.isArray(queueGoals) ? queueGoals : [];
  const goalMap = new Map();
  const usedGoalIndexes = new Set();
  const warnings = [];

  specs.forEach(specName => {
    const prefix = `integrate handoff spec ${specName}`.toLowerCase();
    const goalIndex = goals.findIndex((goal, index) => {
      if (usedGoalIndexes.has(index)) {
        return false;
      }
      const normalizedGoal = `${goal || ''}`.trim().toLowerCase();
      return normalizedGoal.startsWith(prefix);
    });
    if (goalIndex < 0) {
      warnings.push(`spec goal not found in queue for ${specName}`);
      return;
    }
    usedGoalIndexes.add(goalIndex);
    goalMap.set(specName, goals[goalIndex]);
  });

  return {
    goal_map: goalMap,
    used_goal_indexes: usedGoalIndexes,
    warnings
  };
}

function buildAutoHandoffExecutionBatches(handoff, queueGoals = [], dependencyBatching = true) {
  const dependencyPlan = handoff && handoff.dependency_batches && handoff.dependency_batches.enabled
    ? handoff.dependency_batches
    : buildAutoHandoffDependencyBatches(Array.isArray(handoff && handoff.spec_descriptors) ? handoff.spec_descriptors : []);
  const lookup = buildAutoHandoffSpecGoalLookup(handoff, queueGoals);
  const queue = Array.isArray(queueGoals) ? queueGoals : [];
  const used = new Set(lookup.used_goal_indexes);
  const batches = [];

  if (dependencyBatching) {
    const sourceBatches = Array.isArray(dependencyPlan.batches) ? dependencyPlan.batches : [];
    sourceBatches.forEach(batch => {
      const specs = Array.isArray(batch && batch.specs) ? batch.specs : [];
      const goals = specs
        .map(spec => lookup.goal_map.get(spec))
        .filter(Boolean);
      if (goals.length === 0) {
        return;
      }
      batches.push({
        id: `spec-batch-${batch.index}`,
        type: 'spec',
        title: `Spec dependency batch ${batch.index}`,
        specs,
        goals
      });
    });
  } else {
    const allSpecGoals = Array.from(lookup.goal_map.values());
    if (allSpecGoals.length > 0) {
      batches.push({
        id: 'spec-batch-1',
        type: 'spec',
        title: 'Spec integration batch',
        specs: Array.from(lookup.goal_map.keys()),
        goals: allSpecGoals
      });
    }
  }

  const remainingGoals = queue.filter((goal, index) => !used.has(index));
  if (remainingGoals.length > 0) {
    batches.push({
      id: 'post-spec-batch',
      type: 'post-spec',
      title: 'Template, known-gap, and observability goals',
      specs: [],
      goals: remainingGoals
    });
  }

  if (batches.length === 0 && queue.length > 0) {
    batches.push({
      id: 'fallback-batch',
      type: 'fallback',
      title: 'Fallback full queue batch',
      specs: [],
      goals: queue
    });
  }

  return {
    dependency_batching: dependencyBatching,
    dependency_plan: dependencyPlan,
    batches,
    warnings: lookup.warnings
  };
}

function mergeAutoHandoffBatchSummaries(batchSummaries = [], mode = 'auto-handoff-run') {
  const summaries = Array.isArray(batchSummaries) ? batchSummaries.filter(Boolean) : [];
  if (summaries.length === 0) {
    return {
      mode,
      status: 'completed',
      goals_file: null,
      total_goals: 0,
      processed_goals: 0,
      completed_goals: 0,
      failed_goals: 0,
      batch_parallel: 0,
      resource_plan: null,
      batch_retry: {
        enabled: false,
        strategy: 'adaptive',
        until_complete: false,
        configured_rounds: 0,
        max_rounds: 0,
        performed_rounds: 0,
        exhausted: false,
        history: []
      },
      stopped_early: false,
      metrics: buildBatchMetrics([], 0),
      results: []
    };
  }

  const results = [];
  let aggregateResourcePlan = null;
  let batchParallel = 0;
  let stoppedEarly = false;
  let configuredRetryRounds = 0;
  let maxRetryRounds = 0;
  let performedRetryRounds = 0;
  let retryExhausted = false;
  let retryEnabled = false;
  let retryUntilComplete = false;
  const retryHistory = [];
  const retryStrategies = new Set();
  let totalGoals = 0;
  let processedGoals = 0;
  let completedGoals = 0;
  let failedGoals = 0;

  summaries.forEach(summary => {
    results.push(...(Array.isArray(summary.results) ? summary.results : []));
    totalGoals += Number(summary.total_goals) || 0;
    processedGoals += Number(summary.processed_goals) || 0;
    completedGoals += Number(summary.completed_goals) || 0;
    failedGoals += Number(summary.failed_goals) || 0;
    batchParallel = Math.max(batchParallel, Number(summary.batch_parallel) || 0);
    aggregateResourcePlan = mergeBatchResourcePlans(aggregateResourcePlan, summary.resource_plan);
    stoppedEarly = stoppedEarly || Boolean(summary.stopped_early);

    const retry = summary && summary.batch_retry ? summary.batch_retry : {};
    retryEnabled = retryEnabled || Boolean(retry.enabled);
    retryUntilComplete = retryUntilComplete || Boolean(retry.until_complete);
    retryExhausted = retryExhausted || Boolean(retry.exhausted);
    configuredRetryRounds += Number(retry.configured_rounds) || 0;
    maxRetryRounds += Number(retry.max_rounds) || 0;
    performedRetryRounds += Number(retry.performed_rounds) || 0;
    if (retry.strategy) {
      retryStrategies.add(retry.strategy);
    }
    const history = Array.isArray(retry.history) ? retry.history : [];
    retryHistory.push(...history);
  });

  const status = failedGoals === 0
    ? 'completed'
    : completedGoals === 0
      ? 'failed'
      : 'partial-failed';

  return {
    mode,
    status,
    goals_file: summaries[0].goals_file || null,
    resumed_from_summary: null,
    generated_from_goal: null,
    total_goals: totalGoals,
    processed_goals: processedGoals,
    completed_goals: completedGoals,
    failed_goals: failedGoals,
    batch_parallel: batchParallel,
    autonomous_policy: {
      enabled: true,
      source: 'handoff',
      continue_on_error: true,
      batch_parallel: batchParallel,
      batch_retry_rounds: configuredRetryRounds,
      batch_retry_until_complete: retryUntilComplete
    },
    resource_plan: aggregateResourcePlan,
    batch_retry: {
      enabled: retryEnabled,
      strategy: retryStrategies.size === 1 ? Array.from(retryStrategies)[0] : 'mixed',
      until_complete: retryUntilComplete,
      configured_rounds: configuredRetryRounds,
      max_rounds: maxRetryRounds,
      performed_rounds: performedRetryRounds,
      exhausted: retryExhausted,
      history: retryHistory
    },
    stopped_early: stoppedEarly,
    metrics: buildBatchMetrics(results, totalGoals),
    goal_input_guard: {
      enabled: false,
      max_duplicate_goals: null,
      duplicate_goals: 0,
      unique_goals: totalGoals,
      duplicate_examples: [],
      over_limit: false,
      hard_fail_triggered: false
    },
    results
  };
}

async function executeAutoHandoffExecutionBatches(projectPath, handoff, queue, options = {}) {
  const queueGoals = Array.isArray(queue && queue.goals) ? queue.goals : [];
  const executionPlan = buildAutoHandoffExecutionBatches(
    handoff,
    queueGoals,
    options.dependencyBatching !== false
  );
  const executionBatches = [];
  const summaries = [];

  for (const batch of executionPlan.batches) {
    const goals = Array.isArray(batch.goals) ? batch.goals : [];
    if (goals.length === 0) {
      continue;
    }
    const goalsResult = {
      file: queue && queue.output_file
        ? queue.output_file
        : path.join(projectPath, options.queueOut || AUTO_HANDOFF_DEFAULT_QUEUE_FILE),
      goals
    };
    const summary = await executeCloseLoopBatch(goalsResult, {
      continueOnError: options.continueOnError !== false,
      batchAutonomous: options.batchAutonomous !== false,
      batchParallel: options.batchParallel,
      batchAgentBudget: options.batchAgentBudget,
      batchRetryRounds: options.batchRetryRounds,
      batchRetryUntilComplete: options.batchRetryUntilComplete,
      batchRetryMaxRounds: options.batchRetryMaxRounds,
      batchSession: true
    }, projectPath, 'auto-handoff-run');
    summaries.push(summary);
    executionBatches.push({
      id: batch.id,
      type: batch.type,
      title: batch.title,
      specs: batch.specs,
      goal_count: goals.length,
      status: summary.status,
      failed_goals: summary.failed_goals
    });
  }

  return {
    summary: mergeAutoHandoffBatchSummaries(summaries, 'auto-handoff-run'),
    execution_batches: executionBatches,
    execution_plan: executionPlan
  };
}

function normalizeHandoffSessionQuery(sessionCandidate) {
  const normalized = typeof sessionCandidate === 'string'
    ? sessionCandidate.trim()
    : 'latest';
  return normalized || 'latest';
}

function normalizeHandoffRegressionWindow(windowCandidate) {
  if (windowCandidate === undefined || windowCandidate === null) {
    return 2;
  }
  const parsed = Number(windowCandidate);
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 50) {
    throw new Error('--window must be an integer between 2 and 50.');
  }
  return parsed;
}

function normalizeHandoffEvidenceWindow(windowCandidate) {
  if (windowCandidate === undefined || windowCandidate === null) {
    return 5;
  }
  const parsed = Number(windowCandidate);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new Error('--window must be an integer between 1 and 50.');
  }
  return parsed;
}

function normalizeHandoffGateHistoryKeep(keepCandidate) {
  if (keepCandidate === undefined || keepCandidate === null) {
    return 200;
  }
  const parsed = Number(keepCandidate);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5000) {
    throw new Error('--keep must be an integer between 1 and 5000.');
  }
  return parsed;
}

function normalizeHandoffRegressionFormat(formatCandidate) {
  const normalized = typeof formatCandidate === 'string'
    ? formatCandidate.trim().toLowerCase()
    : 'json';
  if (!['json', 'markdown'].includes(normalized)) {
    throw new Error('--format must be one of: json, markdown.');
  }
  return normalized;
}

function normalizeHandoffContinueStrategy(strategyCandidate) {
  const normalized = typeof strategyCandidate === 'string'
    ? strategyCandidate.trim().toLowerCase()
    : 'auto';
  if (!['auto', 'pending', 'failed-only'].includes(normalized)) {
    throw new Error('--continue-strategy must be one of: auto, pending, failed-only.');
  }
  return normalized;
}

function resolveAutoHandoffContinueStrategy(requestedStrategy, summary = null) {
  const strategyRequested = normalizeHandoffContinueStrategy(requestedStrategy);
  if (strategyRequested !== 'auto') {
    return {
      strategy: strategyRequested,
      strategy_requested: strategyRequested,
      strategy_reason: 'explicit'
    };
  }

  const payload = summary && typeof summary === 'object' ? summary : {};
  const results = Array.isArray(payload.results) ? payload.results : [];
  const totalGoals = Number(payload.total_goals);
  const processedGoals = Number(payload.processed_goals);
  const hasUnprocessed = Number.isInteger(totalGoals) && Number.isInteger(processedGoals) && processedGoals < totalGoals;
  const hasPlannedLike = results.some(item => {
    const status = `${item && item.status ? item.status : ''}`.trim().toLowerCase();
    return ['unknown', 'stopped', 'planned', 'prepared'].includes(status);
  });
  const hasFailed = results.some(item => {
    const status = `${item && item.status ? item.status : ''}`.trim().toLowerCase();
    return ['failed', 'error'].includes(status);
  });

  if (hasUnprocessed || hasPlannedLike) {
    return {
      strategy: 'pending',
      strategy_requested: 'auto',
      strategy_reason: hasUnprocessed ? 'auto-detected-unprocessed' : 'auto-detected-planned'
    };
  }
  if (hasFailed) {
    return {
      strategy: 'failed-only',
      strategy_requested: 'auto',
      strategy_reason: 'auto-detected-failed-only'
    };
  }
  return {
    strategy: 'pending',
    strategy_requested: 'auto',
    strategy_reason: 'auto-default-pending'
  };
}

async function listAutoHandoffRunReports(projectPath) {
  const dirPath = path.join(projectPath, AUTO_HANDOFF_RUN_REPORT_DIR);
  if (!await fs.pathExists(dirPath)) {
    return [];
  }
  const entries = await fs.readdir(dirPath);
  const reports = [];
  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith('.json')) {
      continue;
    }
    const filePath = path.join(dirPath, entry);
    let stats = null;
    try {
      stats = await fs.stat(filePath);
    } catch (error) {
      continue;
    }
    let payload = null;
    try {
      payload = await fs.readJson(filePath);
    } catch (error) {
      continue;
    }
    if (!payload || payload.mode !== 'auto-handoff-run') {
      continue;
    }
    const ts = Date.parse(
      payload.completed_at
      || payload.generated_at
      || payload.created_at
      || null
    );
    reports.push({
      file: filePath,
      session_id: payload.session_id || path.basename(entry, '.json'),
      payload,
      sort_ts: Number.isFinite(ts) ? ts : (stats ? stats.mtimeMs : 0)
    });
  }

  reports.sort((left, right) => right.sort_ts - left.sort_ts);
  return reports;
}

async function resolveAutoHandoffRunReportFile(projectPath, sessionCandidate, optionName = '--continue-from') {
  if (typeof sessionCandidate !== 'string' || !sessionCandidate.trim()) {
    throw new Error(`${optionName} requires a session id/file or "latest".`);
  }
  const normalizedCandidate = sessionCandidate.trim();
  if (normalizedCandidate.toLowerCase() === 'latest') {
    const reports = await listAutoHandoffRunReports(projectPath);
    if (reports.length === 0) {
      throw new Error(`No handoff run reports found in: ${path.join(projectPath, AUTO_HANDOFF_RUN_REPORT_DIR)}`);
    }
    return reports[0].file;
  }

  if (path.isAbsolute(normalizedCandidate)) {
    return normalizedCandidate;
  }
  if (
    normalizedCandidate.includes('/') ||
    normalizedCandidate.includes('\\') ||
    normalizedCandidate.toLowerCase().endsWith('.json')
  ) {
    return path.join(projectPath, normalizedCandidate);
  }

  const reports = await listAutoHandoffRunReports(projectPath);
  const bySessionId = reports.find(item => item.session_id === normalizedCandidate);
  if (bySessionId) {
    return bySessionId.file;
  }

  const bySessionFile = path.join(
    projectPath,
    AUTO_HANDOFF_RUN_REPORT_DIR,
    `${sanitizeBatchSessionId(normalizedCandidate)}.json`
  );
  if (await fs.pathExists(bySessionFile)) {
    return bySessionFile;
  }
  return path.join(projectPath, normalizedCandidate);
}

async function loadAutoHandoffRunSessionPayload(projectPath, sessionCandidate, optionName = '--continue-from') {
  const reportFile = await resolveAutoHandoffRunReportFile(projectPath, sessionCandidate, optionName);
  if (!(await fs.pathExists(reportFile))) {
    throw new Error(`Handoff run report file not found: ${reportFile}`);
  }

  let payload = null;
  try {
    payload = await fs.readJson(reportFile);
  } catch (error) {
    throw new Error(`Invalid handoff run report JSON: ${reportFile} (${error.message})`);
  }
  if (!payload || typeof payload !== 'object' || payload.mode !== 'auto-handoff-run') {
    throw new Error(`Invalid handoff run report payload: ${reportFile}`);
  }

  return {
    id: typeof payload.session_id === 'string' && payload.session_id.trim()
      ? payload.session_id.trim()
      : path.basename(reportFile, '.json'),
    file: reportFile,
    payload
  };
}

async function buildAutoHandoffQueueFromContinueSource(projectPath, plan, options = {}) {
  const resumedSession = await loadAutoHandoffRunSessionPayload(projectPath, options.continueFrom, '--continue-from');
  const previousManifestPath = typeof (resumedSession.payload && resumedSession.payload.manifest_path) === 'string' &&
    resumedSession.payload.manifest_path.trim()
    ? resumedSession.payload.manifest_path.trim()
    : null;
  if (previousManifestPath) {
    const resolvedPreviousManifest = path.resolve(projectPath, previousManifestPath);
    const resolvedCurrentManifest = path.resolve(plan.manifest_path);
    if (path.normalize(resolvedPreviousManifest) !== path.normalize(resolvedCurrentManifest)) {
      throw new Error(
        `--continue-from manifest mismatch: previous=${resolvedPreviousManifest} current=${resolvedCurrentManifest}.`
      );
    }
  }

  const previousSummary = resumedSession.payload && resumedSession.payload.batch_summary;
  if (!previousSummary || typeof previousSummary !== 'object') {
    throw new Error(`--continue-from report is missing batch_summary: ${resumedSession.file}`);
  }
  const continueStrategy = resolveAutoHandoffContinueStrategy(options.continueStrategy, previousSummary);
  const resumedGoals = await buildCloseLoopBatchGoalsFromSummaryPayload(
    previousSummary,
    resumedSession.file,
    projectPath,
    'lines',
    continueStrategy.strategy
  );

  return {
    mode: 'auto-handoff-queue',
    generated_at: new Date().toISOString(),
    manifest_path: plan.manifest_path,
    dry_run: Boolean(options.dryRun),
    append: Boolean(options.append),
    include_known_gaps: options.includeKnownGaps !== false,
    goal_count: resumedGoals.goals.length,
    goals: resumedGoals.goals,
    validation: {
      errors: [],
      warnings: []
    },
    resume_context: {
      previous_batch_summary: previousSummary
    },
    resumed_from: {
      session_id: resumedSession.id,
      file: resumedSession.file,
      strategy: continueStrategy.strategy,
      strategy_requested: continueStrategy.strategy_requested,
      strategy_reason: continueStrategy.strategy_reason,
      previous_status: resumedSession.payload.status || null,
      previous_total_goals: Number.isInteger(
        Number(resumedGoals.resumedFromSummary && resumedGoals.resumedFromSummary.previous_total_goals)
      )
        ? Number(resumedGoals.resumedFromSummary.previous_total_goals)
        : null,
      previous_processed_goals: Number.isInteger(
        Number(resumedGoals.resumedFromSummary && resumedGoals.resumedFromSummary.previous_processed_goals)
      )
        ? Number(resumedGoals.resumedFromSummary.previous_processed_goals)
        : null
    }
  };
}

function normalizeRiskRank(levelCandidate) {
  const level = `${levelCandidate || 'high'}`.trim().toLowerCase();
  if (level === 'low') {
    return 1;
  }
  if (level === 'medium') {
    return 2;
  }
  return 3;
}

function buildAutoHandoffRegressionSnapshot(report) {
  const payload = report && report.payload ? report.payload : report;
  const specStatus = payload && payload.spec_status ? payload.spec_status : {};
  const gates = payload && payload.gates ? payload.gates : {};
  const gateActual = gates && gates.actual ? gates.actual : {};
  const batchSummary = payload && payload.batch_summary ? payload.batch_summary : {};
  const ontology = payload && payload.ontology_validation ? payload.ontology_validation : {};
  const ontologyMetrics = ontology && ontology.metrics ? ontology.metrics : {};
  const scenePackageBatch = payload && payload.scene_package_batch ? payload.scene_package_batch : {};
  const scenePackageBatchSummary = scenePackageBatch && scenePackageBatch.summary
    ? scenePackageBatch.summary
    : {};

  const riskLevel = gateActual.risk_level
    || (payload && payload.observability_snapshot && payload.observability_snapshot.highlights
      ? payload.observability_snapshot.highlights.governance_risk_level
      : 'high');
  const successRate = Number(specStatus.success_rate_percent);
  const failedGoals = Number(batchSummary.failed_goals);
  const elapsedMs = Number(payload && payload.elapsed_ms);
  const ontologyQualityScore = Number(
    gateActual.ontology_quality_score !== undefined
      ? gateActual.ontology_quality_score
      : ontology.quality_score
  );
  const ontologyUnmappedRules = Number(
    gateActual.ontology_business_rule_unmapped !== undefined
      ? gateActual.ontology_business_rule_unmapped
      : ontologyMetrics.business_rule_unmapped
  );
  const ontologyUndecidedDecisions = Number(
    gateActual.ontology_decision_undecided !== undefined
      ? gateActual.ontology_decision_undecided
      : ontologyMetrics.decision_undecided
  );
  const businessRulePassRate = Number(
    gateActual.ontology_business_rule_pass_rate_percent !== undefined
      ? gateActual.ontology_business_rule_pass_rate_percent
      : ontologyMetrics.business_rule_pass_rate_percent
  );
  const decisionResolvedRate = Number(
    gateActual.ontology_decision_resolved_rate_percent !== undefined
      ? gateActual.ontology_decision_resolved_rate_percent
      : ontologyMetrics.decision_resolved_rate_percent
  );
  const sceneBatchFailureCount = Number(
    scenePackageBatchSummary.batch_gate_failure_count !== undefined
      ? scenePackageBatchSummary.batch_gate_failure_count
      : scenePackageBatchSummary.failed
  );
  const sceneBatchStatus = normalizeHandoffText(
    scenePackageBatch.status !== undefined
      ? scenePackageBatch.status
      : gateActual.scene_package_batch_status
  );
  const moquiBaseline = payload && payload.moqui_baseline ? payload.moqui_baseline : {};
  const moquiCompare = moquiBaseline && moquiBaseline.compare ? moquiBaseline.compare : {};
  const moquiMatrixRegressionCount = Number(
    gateActual.moqui_matrix_regression_count !== undefined
      ? gateActual.moqui_matrix_regression_count
      : buildAutoHandoffMoquiCoverageRegressions(moquiCompare).length
  );
  let sceneBatchPassed = null;
  if (sceneBatchStatus && sceneBatchStatus !== 'skipped') {
    sceneBatchPassed = sceneBatchStatus === 'passed';
  }
  if (gateActual.scene_package_batch_passed === true) {
    sceneBatchPassed = true;
  } else if (gateActual.scene_package_batch_passed === false) {
    sceneBatchPassed = false;
  }

  return {
    session_id: payload && payload.session_id ? payload.session_id : null,
    status: payload && payload.status ? payload.status : null,
    spec_success_rate_percent: Number.isFinite(successRate) ? successRate : null,
    risk_level: `${riskLevel || 'high'}`.trim().toLowerCase(),
    risk_level_rank: normalizeRiskRank(riskLevel),
    failed_goals: Number.isFinite(failedGoals) ? failedGoals : null,
    elapsed_ms: Number.isFinite(elapsedMs) ? elapsedMs : null,
    ontology_quality_score: Number.isFinite(ontologyQualityScore) ? ontologyQualityScore : null,
    ontology_unmapped_rules: Number.isFinite(ontologyUnmappedRules) ? ontologyUnmappedRules : null,
    ontology_undecided_decisions: Number.isFinite(ontologyUndecidedDecisions) ? ontologyUndecidedDecisions : null,
    ontology_business_rule_pass_rate_percent: Number.isFinite(businessRulePassRate) ? businessRulePassRate : null,
    ontology_decision_resolved_rate_percent: Number.isFinite(decisionResolvedRate) ? decisionResolvedRate : null,
    moqui_matrix_regression_count: Number.isFinite(moquiMatrixRegressionCount) ? moquiMatrixRegressionCount : null,
    scene_package_batch_status: sceneBatchStatus || null,
    scene_package_batch_passed: typeof sceneBatchPassed === 'boolean' ? sceneBatchPassed : null,
    scene_package_batch_failure_count: Number.isFinite(sceneBatchFailureCount) ? sceneBatchFailureCount : null,
    generated_at: payload && payload.generated_at ? payload.generated_at : null
  };
}

function buildAutoHandoffRegressionComparison(currentSnapshot, previousSnapshot) {
  const deltaSuccess = (
    Number.isFinite(currentSnapshot.spec_success_rate_percent) &&
    Number.isFinite(previousSnapshot.spec_success_rate_percent)
  )
    ? Number((currentSnapshot.spec_success_rate_percent - previousSnapshot.spec_success_rate_percent).toFixed(2))
    : null;
  const deltaRiskRank = (
    Number.isFinite(currentSnapshot.risk_level_rank) &&
    Number.isFinite(previousSnapshot.risk_level_rank)
  )
    ? currentSnapshot.risk_level_rank - previousSnapshot.risk_level_rank
    : null;
  const deltaFailedGoals = (
    Number.isFinite(currentSnapshot.failed_goals) &&
    Number.isFinite(previousSnapshot.failed_goals)
  )
    ? currentSnapshot.failed_goals - previousSnapshot.failed_goals
    : null;
  const deltaElapsedMs = (
    Number.isFinite(currentSnapshot.elapsed_ms) &&
    Number.isFinite(previousSnapshot.elapsed_ms)
  )
    ? currentSnapshot.elapsed_ms - previousSnapshot.elapsed_ms
    : null;
  const deltaOntologyQualityScore = (
    Number.isFinite(currentSnapshot.ontology_quality_score) &&
    Number.isFinite(previousSnapshot.ontology_quality_score)
  )
    ? Number((currentSnapshot.ontology_quality_score - previousSnapshot.ontology_quality_score).toFixed(2))
    : null;
  const deltaOntologyUnmappedRules = (
    Number.isFinite(currentSnapshot.ontology_unmapped_rules) &&
    Number.isFinite(previousSnapshot.ontology_unmapped_rules)
  )
    ? currentSnapshot.ontology_unmapped_rules - previousSnapshot.ontology_unmapped_rules
    : null;
  const deltaOntologyUndecidedDecisions = (
    Number.isFinite(currentSnapshot.ontology_undecided_decisions) &&
    Number.isFinite(previousSnapshot.ontology_undecided_decisions)
  )
    ? currentSnapshot.ontology_undecided_decisions - previousSnapshot.ontology_undecided_decisions
    : null;
  const deltaBusinessRulePassRate = (
    Number.isFinite(currentSnapshot.ontology_business_rule_pass_rate_percent) &&
    Number.isFinite(previousSnapshot.ontology_business_rule_pass_rate_percent)
  )
    ? Number((
      currentSnapshot.ontology_business_rule_pass_rate_percent -
      previousSnapshot.ontology_business_rule_pass_rate_percent
    ).toFixed(2))
    : null;
  const deltaDecisionResolvedRate = (
    Number.isFinite(currentSnapshot.ontology_decision_resolved_rate_percent) &&
    Number.isFinite(previousSnapshot.ontology_decision_resolved_rate_percent)
  )
    ? Number((
      currentSnapshot.ontology_decision_resolved_rate_percent -
      previousSnapshot.ontology_decision_resolved_rate_percent
    ).toFixed(2))
    : null;
  const deltaSceneBatchFailureCount = (
    Number.isFinite(currentSnapshot.scene_package_batch_failure_count) &&
    Number.isFinite(previousSnapshot.scene_package_batch_failure_count)
  )
    ? currentSnapshot.scene_package_batch_failure_count - previousSnapshot.scene_package_batch_failure_count
    : null;
  const deltaMoquiMatrixRegressionCount = (
    Number.isFinite(currentSnapshot.moqui_matrix_regression_count) &&
    Number.isFinite(previousSnapshot.moqui_matrix_regression_count)
  )
    ? currentSnapshot.moqui_matrix_regression_count - previousSnapshot.moqui_matrix_regression_count
    : null;

  let trend = 'stable';
  if (
    (Number.isFinite(deltaSuccess) && deltaSuccess > 0) &&
    (deltaRiskRank === null || deltaRiskRank <= 0) &&
    (deltaFailedGoals === null || deltaFailedGoals <= 0) &&
    (deltaOntologyQualityScore === null || deltaOntologyQualityScore >= 0) &&
    (deltaOntologyUnmappedRules === null || deltaOntologyUnmappedRules <= 0) &&
    (deltaOntologyUndecidedDecisions === null || deltaOntologyUndecidedDecisions <= 0) &&
    (deltaSceneBatchFailureCount === null || deltaSceneBatchFailureCount <= 0)
  ) {
    trend = 'improved';
  } else if (
    (Number.isFinite(deltaSuccess) && deltaSuccess < 0) ||
    (deltaRiskRank !== null && deltaRiskRank > 0) ||
    (deltaFailedGoals !== null && deltaFailedGoals > 0) ||
    (deltaOntologyQualityScore !== null && deltaOntologyQualityScore < 0) ||
    (deltaOntologyUnmappedRules !== null && deltaOntologyUnmappedRules > 0) ||
    (deltaOntologyUndecidedDecisions !== null && deltaOntologyUndecidedDecisions > 0) ||
    (deltaSceneBatchFailureCount !== null && deltaSceneBatchFailureCount > 0) ||
    (deltaMoquiMatrixRegressionCount !== null && deltaMoquiMatrixRegressionCount > 0)
  ) {
    trend = 'degraded';
  }

  return {
    trend,
    delta: {
      spec_success_rate_percent: deltaSuccess,
      risk_level_rank: deltaRiskRank,
      failed_goals: deltaFailedGoals,
      elapsed_ms: deltaElapsedMs,
      ontology_quality_score: deltaOntologyQualityScore,
      ontology_unmapped_rules: deltaOntologyUnmappedRules,
      ontology_undecided_decisions: deltaOntologyUndecidedDecisions,
      ontology_business_rule_pass_rate_percent: deltaBusinessRulePassRate,
      ontology_decision_resolved_rate_percent: deltaDecisionResolvedRate,
      moqui_matrix_regression_count: deltaMoquiMatrixRegressionCount,
      scene_package_batch_failure_count: deltaSceneBatchFailureCount
    }
  };
}

function buildAutoHandoffRegressionWindowTrend(series = []) {
  const normalized = Array.isArray(series) ? series.filter(Boolean) : [];
  if (normalized.length < 2) {
    return {
      trend: 'baseline',
      delta: {
        spec_success_rate_percent: null,
        risk_level_rank: null,
        failed_goals: null,
        elapsed_ms: null,
        ontology_quality_score: null,
        ontology_unmapped_rules: null,
        ontology_undecided_decisions: null,
        ontology_business_rule_pass_rate_percent: null,
        ontology_decision_resolved_rate_percent: null,
        moqui_matrix_regression_count: null,
        scene_package_batch_failure_count: null
      },
      has_baseline: false
    };
  }
  const latest = normalized[0];
  const oldest = normalized[normalized.length - 1];
  const comparison = buildAutoHandoffRegressionComparison(latest, oldest);
  return {
    trend: comparison.trend,
    delta: comparison.delta,
    has_baseline: true
  };
}

function buildAutoHandoffRegressionAggregates(series = []) {
  const snapshots = Array.isArray(series) ? series.filter(Boolean) : [];
  const successRates = snapshots
    .map(item => Number(item.spec_success_rate_percent))
    .filter(value => Number.isFinite(value));
  const failedGoals = snapshots
    .map(item => Number(item.failed_goals))
    .filter(value => Number.isFinite(value));
  const ontologyScores = snapshots
    .map(item => Number(item.ontology_quality_score))
    .filter(value => Number.isFinite(value));
  const ontologyUnmappedRules = snapshots
    .map(item => Number(item.ontology_unmapped_rules))
    .filter(value => Number.isFinite(value));
  const ontologyUndecidedDecisions = snapshots
    .map(item => Number(item.ontology_undecided_decisions))
    .filter(value => Number.isFinite(value));
  const rulePassRates = snapshots
    .map(item => Number(item.ontology_business_rule_pass_rate_percent))
    .filter(value => Number.isFinite(value));
  const decisionResolvedRates = snapshots
    .map(item => Number(item.ontology_decision_resolved_rate_percent))
    .filter(value => Number.isFinite(value));
  const sceneBatchFailures = snapshots
    .map(item => Number(item.scene_package_batch_failure_count))
    .filter(value => Number.isFinite(value));
  const moquiMatrixRegressions = snapshots
    .map(item => Number(item.moqui_matrix_regression_count))
    .filter(value => Number.isFinite(value));
  const sceneBatchApplicables = snapshots.filter(item => typeof item.scene_package_batch_passed === 'boolean');
  const sceneBatchPassedCount = sceneBatchApplicables.filter(item => item.scene_package_batch_passed === true).length;
  const sceneBatchFailedCount = sceneBatchApplicables.filter(item => item.scene_package_batch_passed === false).length;
  const riskLevels = {
    low: 0,
    medium: 0,
    high: 0,
    unknown: 0
  };
  snapshots.forEach(item => {
    const risk = `${item && item.risk_level ? item.risk_level : 'unknown'}`.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(riskLevels, risk)) {
      riskLevels[risk] += 1;
    } else {
      riskLevels.unknown += 1;
    }
  });

  const averageSuccessRate = successRates.length > 0
    ? Number((successRates.reduce((sum, value) => sum + value, 0) / successRates.length).toFixed(2))
    : null;
  const averageFailedGoals = failedGoals.length > 0
    ? Number((failedGoals.reduce((sum, value) => sum + value, 0) / failedGoals.length).toFixed(2))
    : null;
  const averageOntologyScore = ontologyScores.length > 0
    ? Number((ontologyScores.reduce((sum, value) => sum + value, 0) / ontologyScores.length).toFixed(2))
    : null;
  const averageOntologyUnmappedRules = ontologyUnmappedRules.length > 0
    ? Number((ontologyUnmappedRules.reduce((sum, value) => sum + value, 0) / ontologyUnmappedRules.length).toFixed(2))
    : null;
  const averageOntologyUndecidedDecisions = ontologyUndecidedDecisions.length > 0
    ? Number((ontologyUndecidedDecisions.reduce((sum, value) => sum + value, 0) / ontologyUndecidedDecisions.length).toFixed(2))
    : null;
  const averageRulePassRate = rulePassRates.length > 0
    ? Number((rulePassRates.reduce((sum, value) => sum + value, 0) / rulePassRates.length).toFixed(2))
    : null;
  const averageDecisionResolvedRate = decisionResolvedRates.length > 0
    ? Number((decisionResolvedRates.reduce((sum, value) => sum + value, 0) / decisionResolvedRates.length).toFixed(2))
    : null;
  const averageSceneBatchFailures = sceneBatchFailures.length > 0
    ? Number((sceneBatchFailures.reduce((sum, value) => sum + value, 0) / sceneBatchFailures.length).toFixed(2))
    : null;
  const averageMoquiMatrixRegressions = moquiMatrixRegressions.length > 0
    ? Number((moquiMatrixRegressions.reduce((sum, value) => sum + value, 0) / moquiMatrixRegressions.length).toFixed(2))
    : null;
  const sceneBatchPassRate = sceneBatchApplicables.length > 0
    ? Number(((sceneBatchPassedCount / sceneBatchApplicables.length) * 100).toFixed(2))
    : null;

  return {
    avg_spec_success_rate_percent: averageSuccessRate,
    min_spec_success_rate_percent: successRates.length > 0 ? Math.min(...successRates) : null,
    max_spec_success_rate_percent: successRates.length > 0 ? Math.max(...successRates) : null,
    avg_failed_goals: averageFailedGoals,
    avg_ontology_quality_score: averageOntologyScore,
    min_ontology_quality_score: ontologyScores.length > 0 ? Math.min(...ontologyScores) : null,
    max_ontology_quality_score: ontologyScores.length > 0 ? Math.max(...ontologyScores) : null,
    avg_ontology_unmapped_rules: averageOntologyUnmappedRules,
    max_ontology_unmapped_rules: ontologyUnmappedRules.length > 0 ? Math.max(...ontologyUnmappedRules) : null,
    avg_ontology_undecided_decisions: averageOntologyUndecidedDecisions,
    max_ontology_undecided_decisions: ontologyUndecidedDecisions.length > 0 ? Math.max(...ontologyUndecidedDecisions) : null,
    avg_ontology_business_rule_pass_rate_percent: averageRulePassRate,
    avg_ontology_decision_resolved_rate_percent: averageDecisionResolvedRate,
    scene_package_batch_applicable_count: sceneBatchApplicables.length,
    scene_package_batch_passed_count: sceneBatchPassedCount,
    scene_package_batch_failed_count: sceneBatchFailedCount,
    scene_package_batch_pass_rate_percent: sceneBatchPassRate,
    avg_scene_package_batch_failure_count: averageSceneBatchFailures,
    max_scene_package_batch_failure_count: sceneBatchFailures.length > 0 ? Math.max(...sceneBatchFailures) : null,
    avg_moqui_matrix_regression_count: averageMoquiMatrixRegressions,
    max_moqui_matrix_regression_count: moquiMatrixRegressions.length > 0 ? Math.max(...moquiMatrixRegressions) : null,
    risk_levels: riskLevels
  };
}

function buildAutoHandoffRegressionRiskLayers(series = []) {
  const snapshots = Array.isArray(series) ? series.filter(Boolean) : [];
  const levels = ['low', 'medium', 'high', 'unknown'];
  const result = {};

  levels.forEach(level => {
    const scoped = snapshots.filter(item => {
      const risk = `${item && item.risk_level ? item.risk_level : 'unknown'}`.trim().toLowerCase();
      return risk === level;
    });
    const successRates = scoped
      .map(item => Number(item.spec_success_rate_percent))
      .filter(value => Number.isFinite(value));
    const failedGoals = scoped
      .map(item => Number(item.failed_goals))
      .filter(value => Number.isFinite(value));
    const ontologyScores = scoped
      .map(item => Number(item.ontology_quality_score))
      .filter(value => Number.isFinite(value));
    const sceneBatchFailures = scoped
      .map(item => Number(item.scene_package_batch_failure_count))
      .filter(value => Number.isFinite(value));
    const moquiMatrixRegressions = scoped
      .map(item => Number(item.moqui_matrix_regression_count))
      .filter(value => Number.isFinite(value));
    const sceneBatchApplicable = scoped.filter(item => typeof item.scene_package_batch_passed === 'boolean');
    const sceneBatchPassed = sceneBatchApplicable.filter(item => item.scene_package_batch_passed === true).length;

    const avg = values => (
      values.length > 0
        ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
        : null
    );

    result[level] = {
      count: scoped.length,
      sessions: scoped.map(item => item.session_id).filter(Boolean),
      avg_spec_success_rate_percent: avg(successRates),
      max_spec_success_rate_percent: successRates.length > 0 ? Math.max(...successRates) : null,
      min_spec_success_rate_percent: successRates.length > 0 ? Math.min(...successRates) : null,
      avg_failed_goals: avg(failedGoals),
      avg_ontology_quality_score: avg(ontologyScores),
      avg_scene_package_batch_failure_count: avg(sceneBatchFailures),
      avg_moqui_matrix_regression_count: avg(moquiMatrixRegressions),
      max_moqui_matrix_regression_count: moquiMatrixRegressions.length > 0 ? Math.max(...moquiMatrixRegressions) : null,
      scene_package_batch_pass_rate_percent: sceneBatchApplicable.length > 0
        ? Number(((sceneBatchPassed / sceneBatchApplicable.length) * 100).toFixed(2))
        : null
    };
  });

  return result;
}

function buildAutoHandoffRegressionRecommendations(payload = {}) {
  const recommendations = [];
  const seen = new Set();
  const push = value => {
    const text = `${value || ''}`.trim();
    if (!text || seen.has(text)) {
      return;
    }
    seen.add(text);
    recommendations.push(text);
  };

  const current = payload.current || {};
  const trend = `${payload.trend || 'stable'}`.trim().toLowerCase();
  const windowTrend = payload.window_trend && payload.window_trend.trend
    ? `${payload.window_trend.trend}`.trim().toLowerCase()
    : trend;
  const currentFailed = Number(current.failed_goals);
  const currentRisk = `${current.risk_level || 'unknown'}`.trim().toLowerCase();
  const ontologyQuality = Number(current.ontology_quality_score);
  const ontologyUnmappedRules = Number(current.ontology_unmapped_rules);
  const ontologyUndecidedDecisions = Number(current.ontology_undecided_decisions);
  const sceneBatchFailureCount = Number(current.scene_package_batch_failure_count);
  const moquiMatrixRegressionCount = Number(current.moqui_matrix_regression_count);
  const sceneBatchPassed = current.scene_package_batch_passed;

  if (trend === 'degraded' || windowTrend === 'degraded') {
    push(
      `sce auto handoff run --manifest <path> --continue-from ${quoteCliArg(current.session_id || 'latest')} ` +
      '--continue-strategy pending --json'
    );
  } else if (Number.isFinite(currentFailed) && currentFailed > 0) {
    push(
      `sce auto handoff run --manifest <path> --continue-from ${quoteCliArg(current.session_id || 'latest')} ` +
      '--continue-strategy failed-only --json'
    );
  }

  if (currentRisk === 'high') {
    push('sce auto governance stats --days 14 --json');
  }

  if (Number.isFinite(ontologyQuality) && ontologyQuality < 80) {
    push('Strengthen ontology quality gate before next run: `--min-ontology-score 80`.');
  }
  if (Number.isFinite(ontologyUnmappedRules) && ontologyUnmappedRules > 0) {
    push('Drive business-rule closure to zero unmapped rules (`--max-unmapped-rules 0`).');
  }
  if (Number.isFinite(ontologyUndecidedDecisions) && ontologyUndecidedDecisions > 0) {
    push('Resolve pending decision logic entries (`--max-undecided-decisions 0`).');
  }
  if (sceneBatchPassed === false || (Number.isFinite(sceneBatchFailureCount) && sceneBatchFailureCount > 0)) {
    push(
      'Resolve scene package publish-batch gate failures and rerun: ' +
      '`sce scene package-publish-batch --manifest docs/handoffs/handoff-manifest.json --dry-run --json`.'
    );
  }
  if (Number.isFinite(moquiMatrixRegressionCount) && moquiMatrixRegressionCount > 0) {
    push(
      'Recover Moqui matrix regressions and rerun baseline gate: ' +
      '`sce scene moqui-baseline --include-all --compare-with .sce/reports/release-evidence/moqui-template-baseline.json --json`.'
    );
    for (const line of buildMoquiRegressionRecoverySequenceLines({
      wrapCommands: true,
      withPeriod: true
    })) {
      push(line);
    }
  }

  if ((payload.window && Number(payload.window.actual) > 0) && (payload.window.requested !== payload.window.actual)) {
    push('Increase regression coverage with `sce auto handoff regression --window 10 --json`.');
  }

  return recommendations;
}

function formatAutoHandoffRegressionValue(value, fallback = 'n/a') {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return fallback;
  }
  return `${value}`;
}

function getAutoHandoffMoquiCoverageMatrix(summary = {}) {
  if (!summary || typeof summary !== 'object') {
    return {};
  }
  return summary.coverage_matrix && typeof summary.coverage_matrix === 'object'
    ? summary.coverage_matrix
    : {};
}

function getAutoHandoffMoquiCoverageMetric(summary = {}, metricName = '', field = 'rate_percent') {
  const matrix = getAutoHandoffMoquiCoverageMatrix(summary);
  const metric = matrix && matrix[metricName] && typeof matrix[metricName] === 'object'
    ? matrix[metricName]
    : {};
  const value = Number(metric[field]);
  return Number.isFinite(value) ? value : null;
}

function formatAutoHandoffMoquiCoverageMetric(summary = {}, metricName = '', field = 'rate_percent', suffix = '') {
  const value = getAutoHandoffMoquiCoverageMetric(summary, metricName, field);
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `${value}${suffix}`;
}

function getAutoHandoffMoquiCoverageDeltaMatrix(compare = {}) {
  if (!compare || typeof compare !== 'object') {
    return {};
  }
  return compare.coverage_matrix_deltas && typeof compare.coverage_matrix_deltas === 'object'
    ? compare.coverage_matrix_deltas
    : {};
}

function getAutoHandoffMoquiCoverageDeltaMetric(compare = {}, metricName = '', field = 'rate_percent') {
  const matrix = getAutoHandoffMoquiCoverageDeltaMatrix(compare);
  const metric = matrix && matrix[metricName] && typeof matrix[metricName] === 'object'
    ? matrix[metricName]
    : {};
  const value = Number(metric[field]);
  return Number.isFinite(value) ? value : null;
}

function formatAutoHandoffMoquiCoverageDeltaMetric(compare = {}, metricName = '', field = 'rate_percent', suffix = '') {
  const value = getAutoHandoffMoquiCoverageDeltaMetric(compare, metricName, field);
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `${value}${suffix}`;
}

function getAutoHandoffMoquiCoverageMetricLabel(metricName = '') {
  const labels = {
    graph_valid: 'graph-valid',
    score_passed: 'score-passed',
    entity_coverage: 'entity-coverage',
    relation_coverage: 'relation-coverage',
    business_rule_coverage: 'business-rule-coverage',
    business_rule_closed: 'business-rule-closed',
    decision_coverage: 'decision-coverage',
    decision_closed: 'decision-closed',
    baseline_passed: 'baseline-passed'
  };
  return labels[metricName] || metricName;
}

function buildAutoHandoffMoquiCoverageRegressions(compare = {}) {
  const source = compare && typeof compare === 'object' ? compare : {};
  const predefined = Array.isArray(source.coverage_matrix_regressions)
    ? source.coverage_matrix_regressions
    : null;
  if (predefined) {
    const normalized = predefined
      .map(item => {
        const metric = normalizeHandoffText(item && item.metric);
        const deltaRate = Number(item && item.delta_rate_percent);
        if (!metric || !Number.isFinite(deltaRate) || deltaRate >= 0) {
          return null;
        }
        return {
          metric,
          label: normalizeHandoffText(item && item.label) || getAutoHandoffMoquiCoverageMetricLabel(metric),
          delta_rate_percent: Number(deltaRate.toFixed(2))
        };
      })
      .filter(Boolean);
    if (normalized.length > 0) {
      return normalized.sort((a, b) => {
        if (a.delta_rate_percent !== b.delta_rate_percent) {
          return a.delta_rate_percent - b.delta_rate_percent;
        }
        return `${a.metric}`.localeCompare(`${b.metric}`);
      });
    }
  }

  const deltaMatrix = getAutoHandoffMoquiCoverageDeltaMatrix(source);
  return Object.entries(deltaMatrix)
    .map(([metric, value]) => {
      const deltaRate = Number(value && value.rate_percent);
      if (!Number.isFinite(deltaRate) || deltaRate >= 0) {
        return null;
      }
      return {
        metric,
        label: getAutoHandoffMoquiCoverageMetricLabel(metric),
        delta_rate_percent: Number(deltaRate.toFixed(2))
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.delta_rate_percent !== b.delta_rate_percent) {
        return a.delta_rate_percent - b.delta_rate_percent;
      }
      return `${a.metric}`.localeCompare(`${b.metric}`);
    });
}

function formatAutoHandoffMoquiCoverageRegressions(compare = {}, limit = 3) {
  const regressions = buildAutoHandoffMoquiCoverageRegressions(compare);
  if (regressions.length === 0) {
    return 'none';
  }
  const maxItems = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : regressions.length;
  return regressions
    .slice(0, maxItems)
    .map(item => `${item.label}:${item.delta_rate_percent}%`)
    .join(' | ');
}

function renderAutoHandoffRegressionAsciiBar(value, max = 100, width = 20) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return `${'.'.repeat(width)} n/a`;
  }
  const bounded = Math.max(0, Math.min(max, parsed));
  const ratio = max > 0 ? bounded / max : 0;
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
  return `${'#'.repeat(filled)}${'.'.repeat(Math.max(0, width - filled))} ${Number(bounded.toFixed(2))}`;
}

function renderAutoHandoffRegressionMarkdown(payload = {}) {
  const current = payload.current || {};
  const previous = payload.previous || null;
  const window = payload.window || { requested: 2, actual: 0 };
  const delta = payload.delta || {};
  const windowTrend = payload.window_trend || { trend: 'baseline', delta: {} };
  const aggregates = payload.aggregates || {};
  const riskLevels = aggregates.risk_levels || {};
  const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : [];
  const series = Array.isArray(payload.series) ? payload.series : [];
  const riskLayers = payload.risk_layers && typeof payload.risk_layers === 'object'
    ? payload.risk_layers
    : {};
  const trendSeriesLines = series.length > 0
    ? series.map(item => {
      const sessionId = formatAutoHandoffRegressionValue(item.session_id);
      const generatedAt = formatAutoHandoffRegressionValue(item.generated_at);
      const riskLevel = formatAutoHandoffRegressionValue(item.risk_level);
      const failedGoals = formatAutoHandoffRegressionValue(item.failed_goals);
      const sceneBatch = item.scene_package_batch_passed === null || item.scene_package_batch_passed === undefined
        ? 'n/a'
        : (item.scene_package_batch_passed ? 'pass' : 'fail');
      const successBar = renderAutoHandoffRegressionAsciiBar(item.spec_success_rate_percent, 100, 20);
      const ontologyBar = renderAutoHandoffRegressionAsciiBar(item.ontology_quality_score, 100, 20);
      return `- ${sessionId} | ${generatedAt} | risk=${riskLevel} | failed=${failedGoals} | scene-batch=${sceneBatch} | success=${successBar} | ontology=${ontologyBar}`;
    })
    : ['- None'];
  const riskLayerLines = ['low', 'medium', 'high', 'unknown'].map(level => {
    const scoped = riskLayers[level] && typeof riskLayers[level] === 'object'
      ? riskLayers[level]
      : {};
    return (
      `- ${level}: count=${formatAutoHandoffRegressionValue(scoped.count, '0')}, ` +
      `avg_success=${formatAutoHandoffRegressionValue(scoped.avg_spec_success_rate_percent)}, ` +
      `avg_failed_goals=${formatAutoHandoffRegressionValue(scoped.avg_failed_goals)}, ` +
      `avg_ontology_quality=${formatAutoHandoffRegressionValue(scoped.avg_ontology_quality_score)}, ` +
      `scene_batch_pass_rate=${formatAutoHandoffRegressionValue(scoped.scene_package_batch_pass_rate_percent)}%, ` +
      `avg_moqui_matrix_regressions=${formatAutoHandoffRegressionValue(scoped.avg_moqui_matrix_regression_count, '0')}`
    );
  });

  const lines = [
    '# Auto Handoff Regression Report',
    '',
    `- Session: ${formatAutoHandoffRegressionValue(current.session_id)}`,
    `- Compared to: ${previous ? formatAutoHandoffRegressionValue(previous.session_id) : 'none'}`,
    `- Trend: ${formatAutoHandoffRegressionValue(payload.trend)}`,
    `- Window: ${formatAutoHandoffRegressionValue(window.actual)}/${formatAutoHandoffRegressionValue(window.requested)}`,
    '',
    '## Point Delta',
    '',
    `- Spec success rate delta: ${formatAutoHandoffRegressionValue(delta.spec_success_rate_percent)}`,
    `- Risk level rank delta: ${formatAutoHandoffRegressionValue(delta.risk_level_rank)}`,
    `- Failed goals delta: ${formatAutoHandoffRegressionValue(delta.failed_goals)}`,
    `- Elapsed ms delta: ${formatAutoHandoffRegressionValue(delta.elapsed_ms)}`,
    `- Ontology quality delta: ${formatAutoHandoffRegressionValue(delta.ontology_quality_score)}`,
    `- Ontology unmapped rules delta: ${formatAutoHandoffRegressionValue(delta.ontology_unmapped_rules)}`,
    `- Ontology undecided decisions delta: ${formatAutoHandoffRegressionValue(delta.ontology_undecided_decisions)}`,
    `- Moqui matrix regression count delta: ${formatAutoHandoffRegressionValue(delta.moqui_matrix_regression_count)}`,
    `- Scene package batch failure count delta: ${formatAutoHandoffRegressionValue(delta.scene_package_batch_failure_count)}`,
    '',
    '## Window Trend',
    '',
    `- Trend: ${formatAutoHandoffRegressionValue(windowTrend.trend)}`,
    `- Success rate delta: ${formatAutoHandoffRegressionValue(windowTrend.delta && windowTrend.delta.spec_success_rate_percent)}`,
    `- Risk level rank delta: ${formatAutoHandoffRegressionValue(windowTrend.delta && windowTrend.delta.risk_level_rank)}`,
    `- Failed goals delta: ${formatAutoHandoffRegressionValue(windowTrend.delta && windowTrend.delta.failed_goals)}`,
    `- Moqui matrix regression count delta: ${formatAutoHandoffRegressionValue(windowTrend.delta && windowTrend.delta.moqui_matrix_regression_count)}`,
    '',
    '## Aggregates',
    '',
    `- Avg spec success rate: ${formatAutoHandoffRegressionValue(aggregates.avg_spec_success_rate_percent)}`,
    `- Min spec success rate: ${formatAutoHandoffRegressionValue(aggregates.min_spec_success_rate_percent)}`,
    `- Max spec success rate: ${formatAutoHandoffRegressionValue(aggregates.max_spec_success_rate_percent)}`,
    `- Avg failed goals: ${formatAutoHandoffRegressionValue(aggregates.avg_failed_goals)}`,
    `- Avg ontology quality score: ${formatAutoHandoffRegressionValue(aggregates.avg_ontology_quality_score)}`,
    `- Min ontology quality score: ${formatAutoHandoffRegressionValue(aggregates.min_ontology_quality_score)}`,
    `- Max ontology quality score: ${formatAutoHandoffRegressionValue(aggregates.max_ontology_quality_score)}`,
    `- Avg ontology unmapped rules: ${formatAutoHandoffRegressionValue(aggregates.avg_ontology_unmapped_rules)}`,
    `- Max ontology unmapped rules: ${formatAutoHandoffRegressionValue(aggregates.max_ontology_unmapped_rules)}`,
    `- Avg ontology undecided decisions: ${formatAutoHandoffRegressionValue(aggregates.avg_ontology_undecided_decisions)}`,
    `- Max ontology undecided decisions: ${formatAutoHandoffRegressionValue(aggregates.max_ontology_undecided_decisions)}`,
    `- Avg business rule pass rate: ${formatAutoHandoffRegressionValue(aggregates.avg_ontology_business_rule_pass_rate_percent)}`,
    `- Avg decision resolved rate: ${formatAutoHandoffRegressionValue(aggregates.avg_ontology_decision_resolved_rate_percent)}`,
    `- Scene package batch pass rate: ${formatAutoHandoffRegressionValue(aggregates.scene_package_batch_pass_rate_percent)}%`,
    `- Scene package batch failed sessions: ${formatAutoHandoffRegressionValue(aggregates.scene_package_batch_failed_count, '0')}`,
    `- Avg scene package batch failure count: ${formatAutoHandoffRegressionValue(aggregates.avg_scene_package_batch_failure_count)}`,
    `- Avg Moqui matrix regression count: ${formatAutoHandoffRegressionValue(aggregates.avg_moqui_matrix_regression_count)}`,
    `- Max Moqui matrix regression count: ${formatAutoHandoffRegressionValue(aggregates.max_moqui_matrix_regression_count)}`,
    `- Risk levels: low=${formatAutoHandoffRegressionValue(riskLevels.low, '0')}, medium=${formatAutoHandoffRegressionValue(riskLevels.medium, '0')}, high=${formatAutoHandoffRegressionValue(riskLevels.high, '0')}, unknown=${formatAutoHandoffRegressionValue(riskLevels.unknown, '0')}`,
    '',
    '## Trend Series',
    '',
    ...trendSeriesLines,
    '',
    '## Risk Layer View',
    '',
    ...riskLayerLines,
    '',
    '## Recommendations'
  ];

  if (recommendations.length === 0) {
    lines.push('', '- None');
  } else {
    recommendations.forEach(item => {
      lines.push('', `- ${item}`);
    });
  }

  return `${lines.join('\n')}\n`;
}

function resolveAutoHandoffReleaseEvidenceFile(projectPath, fileCandidate) {
  const candidate = typeof fileCandidate === 'string' && fileCandidate.trim()
    ? fileCandidate.trim()
    : AUTO_HANDOFF_RELEASE_EVIDENCE_FILE;
  return path.isAbsolute(candidate)
    ? candidate
    : path.join(projectPath, candidate);
}

function resolveAutoHandoffReleaseEvidenceDir(projectPath, dirCandidate = null) {
  const candidate = typeof dirCandidate === 'string' && dirCandidate.trim()
    ? dirCandidate.trim()
    : AUTO_HANDOFF_RELEASE_EVIDENCE_DIR;
  return path.isAbsolute(candidate)
    ? candidate
    : path.join(projectPath, candidate);
}

function resolveAutoHandoffReleaseGateHistoryFile(projectPath, fileCandidate = null) {
  const candidate = typeof fileCandidate === 'string' && fileCandidate.trim()
    ? fileCandidate.trim()
    : AUTO_HANDOFF_RELEASE_GATE_HISTORY_FILE;
  return path.isAbsolute(candidate)
    ? candidate
    : path.join(projectPath, candidate);
}

function parseAutoHandoffReleaseGateTag(filenameCandidate) {
  const filename = typeof filenameCandidate === 'string'
    ? filenameCandidate.trim()
    : '';
  if (!filename) {
    return null;
  }
  const match = /^release-gate-(.+)\.json$/i.exec(filename);
  if (!match || !match[1]) {
    return null;
  }
  const tag = `${match[1]}`.trim();
  if (!tag || /^history(?:-|$)/i.test(tag)) {
    return null;
  }
  return tag;
}

function parseAutoHandoffGateNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAutoHandoffGateSignalsMap(signals = []) {
  const map = {};
  if (!Array.isArray(signals)) {
    return map;
  }
  signals.forEach(item => {
    if (typeof item !== 'string') {
      return;
    }
    const trimmed = item.trim();
    if (!trimmed) {
      return;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      return;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key) {
      return;
    }
    map[key] = value;
  });
  return map;
}

function toAutoHandoffTimestamp(valueCandidate) {
  const value = normalizeHandoffText(valueCandidate);
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildAutoHandoffReleaseGateHistoryEntry(entry = {}, options = {}) {
  const projectPath = options.projectPath || process.cwd();
  const sourceFile = typeof options.file === 'string' && options.file.trim()
    ? options.file.trim()
    : null;
  const signalMap = parseAutoHandoffGateSignalsMap(entry.signals);
  const derivedTag = normalizeHandoffText(options.tag)
    || (sourceFile ? parseAutoHandoffReleaseGateTag(path.basename(sourceFile)) : null)
    || normalizeHandoffText(entry.tag);
  const gatePassed = parseAutoHandoffGateBoolean(
    entry.gate_passed !== undefined ? entry.gate_passed : signalMap.gate_passed,
    null
  );
  const riskLevel = normalizeAutoHandoffGateRiskLevel(
    normalizeHandoffText(entry.risk_level) || signalMap.risk_level
  );
  const specSuccessRate = parseAutoHandoffGateNumber(
    entry.spec_success_rate_percent !== undefined
      ? entry.spec_success_rate_percent
      : signalMap.spec_success_rate
  );
  const sceneBatchStatus = normalizeHandoffText(
    entry.scene_package_batch_status !== undefined
      ? entry.scene_package_batch_status
      : signalMap.scene_package_batch_status
  );
  let sceneBatchPassed = parseAutoHandoffGateBoolean(
    entry.scene_package_batch_passed !== undefined
      ? entry.scene_package_batch_passed
      : signalMap.scene_package_batch_passed,
    null
  );
  if (sceneBatchPassed === null && sceneBatchStatus && sceneBatchStatus !== 'skipped') {
    sceneBatchPassed = sceneBatchStatus === 'passed';
  }
  const sceneBatchFailureCount = parseAutoHandoffGateNumber(
    entry.scene_package_batch_failure_count !== undefined
      ? entry.scene_package_batch_failure_count
      : signalMap.scene_package_batch_failure_count
  );
  const capabilityExpectedUnknownCount = parseAutoHandoffGateNumber(
    entry.capability_expected_unknown_count !== undefined
      ? entry.capability_expected_unknown_count
      : (
        signalMap.capability_expected_unknown_count !== undefined
          ? signalMap.capability_expected_unknown_count
          : signalMap.capability_lexicon_expected_unknown_count
      )
  );
  const capabilityProvidedUnknownCount = parseAutoHandoffGateNumber(
    entry.capability_provided_unknown_count !== undefined
      ? entry.capability_provided_unknown_count
      : (
        signalMap.capability_provided_unknown_count !== undefined
          ? signalMap.capability_provided_unknown_count
          : signalMap.capability_lexicon_provided_unknown_count
      )
  );
  const releaseGatePreflightAvailable = parseAutoHandoffGateBoolean(
    entry.release_gate_preflight_available !== undefined
      ? entry.release_gate_preflight_available
      : signalMap.release_gate_preflight_available,
    null
  );
  const releaseGatePreflightBlocked = parseAutoHandoffGateBoolean(
    entry.release_gate_preflight_blocked !== undefined
      ? entry.release_gate_preflight_blocked
      : signalMap.release_gate_preflight_blocked,
    null
  );
  const requireReleaseGatePreflight = parseAutoHandoffGateBoolean(
    entry.require_release_gate_preflight !== undefined
      ? entry.require_release_gate_preflight
      : (
        signalMap.require_release_gate_preflight !== undefined
          ? signalMap.require_release_gate_preflight
          : signalMap.release_gate_preflight_hard_gate
      ),
    null
  );
  const drift = entry && typeof entry.drift === 'object' && !Array.isArray(entry.drift)
    ? entry.drift
    : {};
  const driftAlerts = Array.isArray(drift.alerts)
    ? drift.alerts
      .map(item => `${item || ''}`.trim())
      .filter(Boolean)
    : [];
  const hasDriftAlertSource = (
    entry.drift_alert_count !== undefined
    || drift.alert_count !== undefined
    || Array.isArray(drift.alerts)
  );
  const driftAlertCount = hasDriftAlertSource
    ? parseAutoHandoffGateNumber(
      entry.drift_alert_count !== undefined
        ? entry.drift_alert_count
        : (drift.alert_count !== undefined ? drift.alert_count : driftAlerts.length)
    )
    : null;
  const driftBlocked = parseAutoHandoffGateBoolean(
    entry.drift_blocked !== undefined
      ? entry.drift_blocked
      : drift.blocked,
    null
  );
  const driftEnforce = parseAutoHandoffGateBoolean(
    entry.drift_enforce !== undefined
      ? entry.drift_enforce
      : drift.enforce,
    null
  );
  const driftEvaluatedAt = normalizeHandoffText(
    entry.drift_evaluated_at !== undefined
      ? entry.drift_evaluated_at
      : drift.evaluated_at
  );
  const weeklyOps = entry && typeof entry.weekly_ops === 'object' && !Array.isArray(entry.weekly_ops)
    ? entry.weekly_ops
    : {};
  const weeklyOpsSignals = weeklyOps && typeof weeklyOps.signals === 'object' && !Array.isArray(weeklyOps.signals)
    ? weeklyOps.signals
    : {};
  const weeklyOpsViolations = Array.isArray(weeklyOps.violations)
    ? weeklyOps.violations.map(item => `${item}`)
    : [];
  const weeklyOpsWarnings = Array.isArray(weeklyOps.warnings)
    ? weeklyOps.warnings.map(item => `${item}`)
    : [];
  const weeklyOpsConfigWarnings = Array.isArray(weeklyOps.config_warnings)
    ? weeklyOps.config_warnings.map(item => `${item}`)
    : [];
  const weeklyOpsAvailable = parseAutoHandoffGateBoolean(entry.weekly_ops_available, null) === true
    || Object.keys(weeklyOps).length > 0;
  const weeklyOpsBlocked = parseAutoHandoffGateBoolean(
    entry.weekly_ops_blocked !== undefined
      ? entry.weekly_ops_blocked
      : weeklyOps.blocked,
    null
  );
  const weeklyOpsRiskRaw = normalizeHandoffText(
    entry.weekly_ops_risk_level !== undefined
      ? entry.weekly_ops_risk_level
      : weeklyOpsSignals.risk
  );
  const weeklyOpsRiskLevel = weeklyOpsRiskRaw
    ? normalizeAutoHandoffGateRiskLevel(weeklyOpsRiskRaw)
    : null;
  const weeklyOpsGovernanceStatus = normalizeHandoffText(
    entry.weekly_ops_governance_status !== undefined
      ? entry.weekly_ops_governance_status
      : weeklyOpsSignals.governance_status
  ) || null;
  const weeklyOpsAuthorizationTierBlockRatePercentCandidate = (
    entry.weekly_ops_authorization_tier_block_rate_percent !== undefined
      ? entry.weekly_ops_authorization_tier_block_rate_percent
      : weeklyOpsSignals.authorization_tier_block_rate_percent
  );
  const weeklyOpsDialogueAuthorizationBlockRatePercentCandidate = (
    entry.weekly_ops_dialogue_authorization_block_rate_percent !== undefined
      ? entry.weekly_ops_dialogue_authorization_block_rate_percent
      : weeklyOpsSignals.dialogue_authorization_block_rate_percent
  );
  const weeklyOpsMatrixRegressionPositiveRatePercentCandidate = (
    entry.weekly_ops_matrix_regression_positive_rate_percent !== undefined
      ? entry.weekly_ops_matrix_regression_positive_rate_percent
      : weeklyOpsSignals.matrix_regression_positive_rate_percent
  );
  const weeklyOpsRuntimeBlockRatePercentCandidate = (
    entry.weekly_ops_runtime_block_rate_percent !== undefined
      ? entry.weekly_ops_runtime_block_rate_percent
      : weeklyOpsSignals.runtime_block_rate_percent
  );
  const weeklyOpsRuntimeUiModeViolationTotalCandidate = (
    entry.weekly_ops_runtime_ui_mode_violation_total !== undefined
      ? entry.weekly_ops_runtime_ui_mode_violation_total
      : weeklyOpsSignals.runtime_ui_mode_violation_total
  );
  const weeklyOpsRuntimeUiModeViolationRatePercentCandidate = (
    entry.weekly_ops_runtime_ui_mode_violation_rate_percent !== undefined
      ? entry.weekly_ops_runtime_ui_mode_violation_rate_percent
      : weeklyOpsSignals.runtime_ui_mode_violation_rate_percent
  );
  const weeklyOpsViolationsCountCandidate = (
    entry.weekly_ops_violations_count !== undefined
      ? entry.weekly_ops_violations_count
      : (
        weeklyOps.violations_count !== undefined
          ? weeklyOps.violations_count
          : (weeklyOpsAvailable ? weeklyOpsViolations.length : null)
      )
  );
  const weeklyOpsWarningCountCandidate = (
    entry.weekly_ops_warning_count !== undefined
      ? entry.weekly_ops_warning_count
      : (
        weeklyOps.warning_count !== undefined
          ? weeklyOps.warning_count
          : (weeklyOpsAvailable ? weeklyOpsWarnings.length : null)
      )
  );
  const weeklyOpsConfigWarningCountCandidate = (
    entry.weekly_ops_config_warning_count !== undefined
      ? entry.weekly_ops_config_warning_count
      : (
        weeklyOps.config_warning_count !== undefined
          ? weeklyOps.config_warning_count
          : (weeklyOpsAvailable ? weeklyOpsConfigWarnings.length : null)
      )
  );
  const weeklyOpsAuthorizationTierBlockRatePercent = (
    weeklyOpsAuthorizationTierBlockRatePercentCandidate === null
    || weeklyOpsAuthorizationTierBlockRatePercentCandidate === undefined
    || weeklyOpsAuthorizationTierBlockRatePercentCandidate === ''
  )
    ? null
    : parseAutoHandoffGateNumber(weeklyOpsAuthorizationTierBlockRatePercentCandidate);
  const weeklyOpsDialogueAuthorizationBlockRatePercent = (
    weeklyOpsDialogueAuthorizationBlockRatePercentCandidate === null
    || weeklyOpsDialogueAuthorizationBlockRatePercentCandidate === undefined
    || weeklyOpsDialogueAuthorizationBlockRatePercentCandidate === ''
  )
    ? null
    : parseAutoHandoffGateNumber(weeklyOpsDialogueAuthorizationBlockRatePercentCandidate);
  const weeklyOpsMatrixRegressionPositiveRatePercent = (
    weeklyOpsMatrixRegressionPositiveRatePercentCandidate === null
    || weeklyOpsMatrixRegressionPositiveRatePercentCandidate === undefined
    || weeklyOpsMatrixRegressionPositiveRatePercentCandidate === ''
  )
    ? null
    : parseAutoHandoffGateNumber(weeklyOpsMatrixRegressionPositiveRatePercentCandidate);
  const weeklyOpsRuntimeBlockRatePercent = (
    weeklyOpsRuntimeBlockRatePercentCandidate === null
    || weeklyOpsRuntimeBlockRatePercentCandidate === undefined
    || weeklyOpsRuntimeBlockRatePercentCandidate === ''
  )
    ? null
    : parseAutoHandoffGateNumber(weeklyOpsRuntimeBlockRatePercentCandidate);
  const weeklyOpsRuntimeUiModeViolationTotal = (
    weeklyOpsRuntimeUiModeViolationTotalCandidate === null
    || weeklyOpsRuntimeUiModeViolationTotalCandidate === undefined
    || weeklyOpsRuntimeUiModeViolationTotalCandidate === ''
  )
    ? null
    : parseAutoHandoffGateNumber(weeklyOpsRuntimeUiModeViolationTotalCandidate);
  const weeklyOpsRuntimeUiModeViolationRatePercent = (
    weeklyOpsRuntimeUiModeViolationRatePercentCandidate === null
    || weeklyOpsRuntimeUiModeViolationRatePercentCandidate === undefined
    || weeklyOpsRuntimeUiModeViolationRatePercentCandidate === ''
  )
    ? null
    : parseAutoHandoffGateNumber(weeklyOpsRuntimeUiModeViolationRatePercentCandidate);
  const weeklyOpsViolationsCount = (
    weeklyOpsViolationsCountCandidate === null
    || weeklyOpsViolationsCountCandidate === undefined
    || weeklyOpsViolationsCountCandidate === ''
  )
    ? null
    : parseAutoHandoffGateNumber(weeklyOpsViolationsCountCandidate);
  const weeklyOpsWarningCount = (
    weeklyOpsWarningCountCandidate === null
    || weeklyOpsWarningCountCandidate === undefined
    || weeklyOpsWarningCountCandidate === ''
  )
    ? null
    : parseAutoHandoffGateNumber(weeklyOpsWarningCountCandidate);
  const weeklyOpsConfigWarningCount = (
    weeklyOpsConfigWarningCountCandidate === null
    || weeklyOpsConfigWarningCountCandidate === undefined
    || weeklyOpsConfigWarningCountCandidate === ''
  )
    ? null
    : parseAutoHandoffGateNumber(weeklyOpsConfigWarningCountCandidate);
  const violations = Array.isArray(entry.violations)
    ? entry.violations.map(item => `${item}`)
    : [];
  const configWarnings = Array.isArray(entry.config_warnings)
    ? entry.config_warnings.map(item => `${item}`)
    : [];
  const signals = Array.isArray(entry.signals)
    ? entry.signals.map(item => `${item}`)
    : [];
  const thresholds = entry.thresholds && typeof entry.thresholds === 'object' && !Array.isArray(entry.thresholds)
    ? { ...entry.thresholds }
    : {};
  const evaluatedAt = normalizeHandoffText(
    entry.evaluated_at || entry.generated_at || entry.updated_at
  );
  const mode = normalizeHandoffText(entry.mode);
  const enforce = parseAutoHandoffGateBoolean(entry.enforce, false);
  const evidenceUsed = parseAutoHandoffGateBoolean(entry.evidence_used, false);
  const requireEvidence = parseAutoHandoffGateBoolean(entry.require_evidence, false);
  const requireGatePass = parseAutoHandoffGateBoolean(entry.require_gate_pass, true);
  const summaryFile = normalizeHandoffText(entry.summary_file);
  const portableFile = sourceFile
    ? toPortablePath(projectPath, sourceFile)
    : normalizeHandoffText(entry.file);
  const violationsCount = Number.isInteger(entry.violations_count)
    ? entry.violations_count
    : violations.length;
  const configWarningCount = Number.isInteger(entry.config_warning_count)
    ? entry.config_warning_count
    : configWarnings.length;

  return {
    tag: derivedTag,
    evaluated_at: evaluatedAt,
    gate_passed: gatePassed,
    mode,
    enforce,
    evidence_used: evidenceUsed,
    require_evidence: requireEvidence,
    require_gate_pass: requireGatePass,
    risk_level: riskLevel,
    spec_success_rate_percent: specSuccessRate,
    scene_package_batch_status: sceneBatchStatus || null,
    scene_package_batch_passed: typeof sceneBatchPassed === 'boolean' ? sceneBatchPassed : null,
    scene_package_batch_failure_count: Number.isFinite(sceneBatchFailureCount) ? sceneBatchFailureCount : null,
    capability_expected_unknown_count: Number.isFinite(capabilityExpectedUnknownCount)
      ? Math.max(0, Number(capabilityExpectedUnknownCount))
      : null,
    capability_provided_unknown_count: Number.isFinite(capabilityProvidedUnknownCount)
      ? Math.max(0, Number(capabilityProvidedUnknownCount))
      : null,
    release_gate_preflight_available: typeof releaseGatePreflightAvailable === 'boolean'
      ? releaseGatePreflightAvailable
      : null,
    release_gate_preflight_blocked: typeof releaseGatePreflightBlocked === 'boolean'
      ? releaseGatePreflightBlocked
      : null,
    require_release_gate_preflight: typeof requireReleaseGatePreflight === 'boolean'
      ? requireReleaseGatePreflight
      : null,
    drift_alert_count: Number.isFinite(driftAlertCount) ? Math.max(0, Number(driftAlertCount)) : null,
    drift_blocked: typeof driftBlocked === 'boolean' ? driftBlocked : null,
    drift_enforce: typeof driftEnforce === 'boolean' ? driftEnforce : null,
    drift_evaluated_at: driftEvaluatedAt || null,
    weekly_ops_available: weeklyOpsAvailable,
    weekly_ops_blocked: typeof weeklyOpsBlocked === 'boolean' ? weeklyOpsBlocked : null,
    weekly_ops_risk_level: weeklyOpsRiskLevel,
    weekly_ops_governance_status: weeklyOpsGovernanceStatus,
    weekly_ops_authorization_tier_block_rate_percent: Number.isFinite(weeklyOpsAuthorizationTierBlockRatePercent)
      ? weeklyOpsAuthorizationTierBlockRatePercent
      : null,
    weekly_ops_dialogue_authorization_block_rate_percent: Number.isFinite(weeklyOpsDialogueAuthorizationBlockRatePercent)
      ? weeklyOpsDialogueAuthorizationBlockRatePercent
      : null,
    weekly_ops_matrix_regression_positive_rate_percent: Number.isFinite(weeklyOpsMatrixRegressionPositiveRatePercent)
      ? weeklyOpsMatrixRegressionPositiveRatePercent
      : null,
    weekly_ops_runtime_block_rate_percent: Number.isFinite(weeklyOpsRuntimeBlockRatePercent)
      ? weeklyOpsRuntimeBlockRatePercent
      : null,
    weekly_ops_runtime_ui_mode_violation_total: Number.isFinite(weeklyOpsRuntimeUiModeViolationTotal)
      ? Math.max(0, Number(weeklyOpsRuntimeUiModeViolationTotal))
      : null,
    weekly_ops_runtime_ui_mode_violation_rate_percent: Number.isFinite(weeklyOpsRuntimeUiModeViolationRatePercent)
      ? Math.max(0, Number(weeklyOpsRuntimeUiModeViolationRatePercent))
      : null,
    weekly_ops_violations_count: Number.isFinite(weeklyOpsViolationsCount)
      ? Math.max(0, Number(weeklyOpsViolationsCount))
      : null,
    weekly_ops_warning_count: Number.isFinite(weeklyOpsWarningCount)
      ? Math.max(0, Number(weeklyOpsWarningCount))
      : null,
    weekly_ops_config_warning_count: Number.isFinite(weeklyOpsConfigWarningCount)
      ? Math.max(0, Number(weeklyOpsConfigWarningCount))
      : null,
    violations_count: Math.max(0, Number(violationsCount) || 0),
    config_warning_count: Math.max(0, Number(configWarningCount) || 0),
    thresholds,
    summary_file: summaryFile,
    file: portableFile,
    signals,
    violations,
    config_warnings: configWarnings
  };
}

async function loadAutoHandoffReleaseGateReports(projectPath, dirCandidate = null) {
  const dirPath = resolveAutoHandoffReleaseEvidenceDir(projectPath, dirCandidate);
  const warnings = [];
  if (!(await fs.pathExists(dirPath))) {
    return {
      dir: dirPath,
      report_files: [],
      entries: [],
      warnings
    };
  }

  const names = await fs.readdir(dirPath);
  const reportFiles = names
    .filter(name => {
      if (typeof name !== 'string') {
        return false;
      }
      const lowered = name.trim().toLowerCase();
      if (!lowered.startsWith('release-gate-') || !lowered.endsWith('.json')) {
        return false;
      }
      if (lowered === 'release-gate-history.json') {
        return false;
      }
      if (lowered.startsWith('release-gate-history-')) {
        return false;
      }
      return parseAutoHandoffReleaseGateTag(name) !== null;
    })
    .map(name => path.join(dirPath, name));

  const entries = [];
  for (const reportFile of reportFiles) {
    let payload = null;
    try {
      payload = await fs.readJson(reportFile);
    } catch (error) {
      warnings.push(`skip invalid release gate report: ${reportFile} (${error.message})`);
      continue;
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      warnings.push(`skip invalid release gate payload: ${reportFile}`);
      continue;
    }
    entries.push(buildAutoHandoffReleaseGateHistoryEntry(payload, {
      projectPath,
      file: reportFile,
      tag: parseAutoHandoffReleaseGateTag(path.basename(reportFile))
    }));
  }

  return {
    dir: dirPath,
    report_files: reportFiles,
    entries,
    warnings
  };
}

async function loadAutoHandoffReleaseGateHistorySeed(projectPath, fileCandidate = null) {
  const filePath = resolveAutoHandoffReleaseGateHistoryFile(projectPath, fileCandidate);
  if (!(await fs.pathExists(filePath))) {
    return {
      file: filePath,
      entries: [],
      warnings: []
    };
  }

  let payload = null;
  try {
    payload = await fs.readJson(filePath);
  } catch (error) {
    return {
      file: filePath,
      entries: [],
      warnings: [`skip invalid gate history file: ${filePath} (${error.message})`]
    };
  }
  const list = Array.isArray(payload && payload.entries) ? payload.entries : [];
  const entries = list
    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
    .map(item => buildAutoHandoffReleaseGateHistoryEntry(item, { projectPath }));
  return {
    file: filePath,
    entries,
    warnings: []
  };
}

function mergeAutoHandoffReleaseGateHistoryEntries(entries = []) {
  const merged = new Map();
  entries.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const key = normalizeHandoffText(entry.tag)
      || normalizeHandoffText(entry.file)
      || `entry-${index}`;
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, entry);
      return;
    }
    const prevTs = toAutoHandoffTimestamp(previous.evaluated_at);
    const nextTs = toAutoHandoffTimestamp(entry.evaluated_at);
    if (nextTs >= prevTs) {
      merged.set(key, entry);
    }
  });
  return Array.from(merged.values());
}

function buildAutoHandoffReleaseGateHistoryAggregates(entries = []) {
  const riskCounts = {
    low: 0,
    medium: 0,
    high: 0,
    unknown: 0
  };
  const specRates = [];
  let gatePassedCount = 0;
  let gateFailedCount = 0;
  let gateUnknownCount = 0;
  let evidenceUsedCount = 0;
  let enforceCount = 0;
  let advisoryCount = 0;
  let violationsTotal = 0;
  let configWarningsTotal = 0;
  let driftAlertTotal = 0;
  let driftAlertRuns = 0;
  let driftBlockedRuns = 0;
  let driftKnownRuns = 0;
  let weeklyOpsKnownRuns = 0;
  let weeklyOpsBlockedRuns = 0;
  let weeklyOpsViolationsTotal = 0;
  let weeklyOpsWarningsTotal = 0;
  let weeklyOpsConfigWarningsTotal = 0;
  let weeklyOpsConfigWarningRuns = 0;
  let weeklyOpsRuntimeUiModeViolationKnownRuns = 0;
  let weeklyOpsRuntimeUiModeViolationRuns = 0;
  let weeklyOpsRuntimeUiModeViolationTotal = 0;
  const weeklyOpsAuthorizationTierBlockRates = [];
  const weeklyOpsDialogueAuthorizationBlockRates = [];
  const weeklyOpsMatrixRegressionPositiveRates = [];
  const weeklyOpsRuntimeBlockRates = [];
  const weeklyOpsRuntimeUiModeViolationRates = [];
  let preflightKnownRuns = 0;
  let preflightAvailableRuns = 0;
  let preflightBlockedRuns = 0;
  let preflightHardGateRuns = 0;
  let capabilityExpectedUnknownKnownRuns = 0;
  let capabilityExpectedUnknownPositiveRuns = 0;
  let capabilityProvidedUnknownKnownRuns = 0;
  let capabilityProvidedUnknownPositiveRuns = 0;
  const capabilityExpectedUnknownCounts = [];
  const capabilityProvidedUnknownCounts = [];
  const sceneBatchFailureCounts = [];
  let sceneBatchApplicableCount = 0;
  let sceneBatchPassedCount = 0;
  let sceneBatchFailedCount = 0;

  entries.forEach(entry => {
    const gatePassed = parseAutoHandoffGateBoolean(entry && entry.gate_passed, null);
    if (gatePassed === true) {
      gatePassedCount += 1;
    } else if (gatePassed === false) {
      gateFailedCount += 1;
    } else {
      gateUnknownCount += 1;
    }

    const evidenceUsed = parseAutoHandoffGateBoolean(entry && entry.evidence_used, false);
    if (evidenceUsed) {
      evidenceUsedCount += 1;
    }

    const enforce = parseAutoHandoffGateBoolean(entry && entry.enforce, false);
    if (enforce) {
      enforceCount += 1;
    } else {
      advisoryCount += 1;
    }

    const riskLevel = normalizeAutoHandoffGateRiskLevel(entry && entry.risk_level);
    riskCounts[riskLevel] += 1;

    const specRate = parseAutoHandoffGateNumber(entry && entry.spec_success_rate_percent);
    if (Number.isFinite(specRate)) {
      specRates.push(specRate);
    }
    const sceneBatchPassed = parseAutoHandoffGateBoolean(entry && entry.scene_package_batch_passed, null);
    if (sceneBatchPassed === true) {
      sceneBatchApplicableCount += 1;
      sceneBatchPassedCount += 1;
    } else if (sceneBatchPassed === false) {
      sceneBatchApplicableCount += 1;
      sceneBatchFailedCount += 1;
    }
    const sceneBatchFailureCount = parseAutoHandoffGateNumber(
      entry && entry.scene_package_batch_failure_count
    );
    if (Number.isFinite(sceneBatchFailureCount)) {
      sceneBatchFailureCounts.push(sceneBatchFailureCount);
    }
    const capabilityExpectedUnknownCount = parseAutoHandoffGateNumber(
      entry && entry.capability_expected_unknown_count
    );
    if (Number.isFinite(capabilityExpectedUnknownCount)) {
      const normalizedCount = Math.max(0, Number(capabilityExpectedUnknownCount));
      capabilityExpectedUnknownKnownRuns += 1;
      capabilityExpectedUnknownCounts.push(normalizedCount);
      if (normalizedCount > 0) {
        capabilityExpectedUnknownPositiveRuns += 1;
      }
    }
    const capabilityProvidedUnknownCount = parseAutoHandoffGateNumber(
      entry && entry.capability_provided_unknown_count
    );
    if (Number.isFinite(capabilityProvidedUnknownCount)) {
      const normalizedCount = Math.max(0, Number(capabilityProvidedUnknownCount));
      capabilityProvidedUnknownKnownRuns += 1;
      capabilityProvidedUnknownCounts.push(normalizedCount);
      if (normalizedCount > 0) {
        capabilityProvidedUnknownPositiveRuns += 1;
      }
    }
    const preflightAvailable = parseAutoHandoffGateBoolean(
      entry && entry.release_gate_preflight_available,
      null
    );
    const preflightBlocked = parseAutoHandoffGateBoolean(
      entry && entry.release_gate_preflight_blocked,
      null
    );
    const requirePreflight = parseAutoHandoffGateBoolean(
      entry && entry.require_release_gate_preflight,
      null
    );
    const hasPreflightSignal = (
      preflightAvailable === true || preflightAvailable === false ||
      preflightBlocked === true || preflightBlocked === false
    );
    if (hasPreflightSignal) {
      preflightKnownRuns += 1;
      if (preflightAvailable === true) {
        preflightAvailableRuns += 1;
      }
      if (preflightBlocked === true) {
        preflightBlockedRuns += 1;
      }
    }
    if (requirePreflight === true) {
      preflightHardGateRuns += 1;
    }
    const driftAlertRaw = entry && entry.drift_alert_count;
    const driftAlertCount = (
      driftAlertRaw === null
      || driftAlertRaw === undefined
      || driftAlertRaw === ''
    )
      ? null
      : parseAutoHandoffGateNumber(driftAlertRaw);
    if (Number.isFinite(driftAlertCount)) {
      driftKnownRuns += 1;
      const normalizedAlertCount = Math.max(0, Number(driftAlertCount));
      driftAlertTotal += normalizedAlertCount;
      if (normalizedAlertCount > 0) {
        driftAlertRuns += 1;
      }
    }
    const driftBlocked = parseAutoHandoffGateBoolean(entry && entry.drift_blocked, null);
    if (driftBlocked === true) {
      driftBlockedRuns += 1;
      if (!Number.isFinite(driftAlertCount)) {
        driftKnownRuns += 1;
      }
    } else if (driftBlocked === false && !Number.isFinite(driftAlertCount)) {
      driftKnownRuns += 1;
    }

    const weeklyOpsBlocked = parseAutoHandoffGateBoolean(entry && entry.weekly_ops_blocked, null);
    const weeklyOpsViolationsCountRaw = entry && entry.weekly_ops_violations_count;
    const weeklyOpsWarningCountRaw = entry && entry.weekly_ops_warning_count;
    const weeklyOpsConfigWarningCountRaw = entry && entry.weekly_ops_config_warning_count;
    const weeklyOpsAuthorizationTierBlockRateRaw = entry && entry.weekly_ops_authorization_tier_block_rate_percent;
    const weeklyOpsDialogueAuthorizationBlockRateRaw = entry && entry.weekly_ops_dialogue_authorization_block_rate_percent;
    const weeklyOpsMatrixRegressionPositiveRateRaw = entry && entry.weekly_ops_matrix_regression_positive_rate_percent;
    const weeklyOpsRuntimeBlockRateRaw = entry && entry.weekly_ops_runtime_block_rate_percent;
    const weeklyOpsRuntimeUiModeViolationTotalRaw = entry && entry.weekly_ops_runtime_ui_mode_violation_total;
    const weeklyOpsRuntimeUiModeViolationRateRaw = entry && entry.weekly_ops_runtime_ui_mode_violation_rate_percent;
    const weeklyOpsViolationsCount = (
      weeklyOpsViolationsCountRaw === null
      || weeklyOpsViolationsCountRaw === undefined
      || weeklyOpsViolationsCountRaw === ''
    )
      ? null
      : parseAutoHandoffGateNumber(weeklyOpsViolationsCountRaw);
    const weeklyOpsWarningCount = (
      weeklyOpsWarningCountRaw === null
      || weeklyOpsWarningCountRaw === undefined
      || weeklyOpsWarningCountRaw === ''
    )
      ? null
      : parseAutoHandoffGateNumber(weeklyOpsWarningCountRaw);
    const weeklyOpsConfigWarningCount = (
      weeklyOpsConfigWarningCountRaw === null
      || weeklyOpsConfigWarningCountRaw === undefined
      || weeklyOpsConfigWarningCountRaw === ''
    )
      ? null
      : parseAutoHandoffGateNumber(weeklyOpsConfigWarningCountRaw);
    const weeklyOpsAuthorizationTierBlockRate = (
      weeklyOpsAuthorizationTierBlockRateRaw === null
      || weeklyOpsAuthorizationTierBlockRateRaw === undefined
      || weeklyOpsAuthorizationTierBlockRateRaw === ''
    )
      ? null
      : parseAutoHandoffGateNumber(weeklyOpsAuthorizationTierBlockRateRaw);
    const weeklyOpsDialogueAuthorizationBlockRate = (
      weeklyOpsDialogueAuthorizationBlockRateRaw === null
      || weeklyOpsDialogueAuthorizationBlockRateRaw === undefined
      || weeklyOpsDialogueAuthorizationBlockRateRaw === ''
    )
      ? null
      : parseAutoHandoffGateNumber(weeklyOpsDialogueAuthorizationBlockRateRaw);
    const weeklyOpsMatrixRegressionPositiveRate = (
      weeklyOpsMatrixRegressionPositiveRateRaw === null
      || weeklyOpsMatrixRegressionPositiveRateRaw === undefined
      || weeklyOpsMatrixRegressionPositiveRateRaw === ''
    )
      ? null
      : parseAutoHandoffGateNumber(weeklyOpsMatrixRegressionPositiveRateRaw);
    const weeklyOpsRuntimeBlockRate = (
      weeklyOpsRuntimeBlockRateRaw === null
      || weeklyOpsRuntimeBlockRateRaw === undefined
      || weeklyOpsRuntimeBlockRateRaw === ''
    )
      ? null
      : parseAutoHandoffGateNumber(weeklyOpsRuntimeBlockRateRaw);
    const weeklyOpsRuntimeUiModeViolationTotalCount = (
      weeklyOpsRuntimeUiModeViolationTotalRaw === null
      || weeklyOpsRuntimeUiModeViolationTotalRaw === undefined
      || weeklyOpsRuntimeUiModeViolationTotalRaw === ''
    )
      ? null
      : parseAutoHandoffGateNumber(weeklyOpsRuntimeUiModeViolationTotalRaw);
    const weeklyOpsRuntimeUiModeViolationRate = (
      weeklyOpsRuntimeUiModeViolationRateRaw === null
      || weeklyOpsRuntimeUiModeViolationRateRaw === undefined
      || weeklyOpsRuntimeUiModeViolationRateRaw === ''
    )
      ? null
      : parseAutoHandoffGateNumber(weeklyOpsRuntimeUiModeViolationRateRaw);
    const weeklyOpsHasSignal = (
      entry && entry.weekly_ops_available === true
      || weeklyOpsBlocked === true
      || weeklyOpsBlocked === false
      || Number.isFinite(weeklyOpsViolationsCount)
      || Number.isFinite(weeklyOpsWarningCount)
      || Number.isFinite(weeklyOpsConfigWarningCount)
      || Number.isFinite(weeklyOpsAuthorizationTierBlockRate)
      || Number.isFinite(weeklyOpsDialogueAuthorizationBlockRate)
      || Number.isFinite(weeklyOpsMatrixRegressionPositiveRate)
      || Number.isFinite(weeklyOpsRuntimeBlockRate)
      || Number.isFinite(weeklyOpsRuntimeUiModeViolationTotalCount)
      || Number.isFinite(weeklyOpsRuntimeUiModeViolationRate)
    );
    if (weeklyOpsHasSignal) {
      weeklyOpsKnownRuns += 1;
      if (weeklyOpsBlocked === true) {
        weeklyOpsBlockedRuns += 1;
      }
      const normalizedWeeklyViolations = Number.isFinite(weeklyOpsViolationsCount)
        ? Math.max(0, Number(weeklyOpsViolationsCount))
        : 0;
      const normalizedWeeklyWarnings = Number.isFinite(weeklyOpsWarningCount)
        ? Math.max(0, Number(weeklyOpsWarningCount))
        : 0;
      const normalizedWeeklyConfigWarnings = Number.isFinite(weeklyOpsConfigWarningCount)
        ? Math.max(0, Number(weeklyOpsConfigWarningCount))
        : 0;
      weeklyOpsViolationsTotal += normalizedWeeklyViolations;
      weeklyOpsWarningsTotal += normalizedWeeklyWarnings;
      weeklyOpsConfigWarningsTotal += normalizedWeeklyConfigWarnings;
      if (normalizedWeeklyConfigWarnings > 0) {
        weeklyOpsConfigWarningRuns += 1;
      }
      if (Number.isFinite(weeklyOpsAuthorizationTierBlockRate)) {
        weeklyOpsAuthorizationTierBlockRates.push(Math.max(0, Number(weeklyOpsAuthorizationTierBlockRate)));
      }
      if (Number.isFinite(weeklyOpsDialogueAuthorizationBlockRate)) {
        weeklyOpsDialogueAuthorizationBlockRates.push(Math.max(0, Number(weeklyOpsDialogueAuthorizationBlockRate)));
      }
      if (Number.isFinite(weeklyOpsMatrixRegressionPositiveRate)) {
        weeklyOpsMatrixRegressionPositiveRates.push(Math.max(0, Number(weeklyOpsMatrixRegressionPositiveRate)));
      }
      if (Number.isFinite(weeklyOpsRuntimeBlockRate)) {
        weeklyOpsRuntimeBlockRates.push(Math.max(0, Number(weeklyOpsRuntimeBlockRate)));
      }
      const hasRuntimeUiModeSignal = (
        Number.isFinite(weeklyOpsRuntimeUiModeViolationTotalCount) ||
        Number.isFinite(weeklyOpsRuntimeUiModeViolationRate) ||
        Number.isFinite(weeklyOpsRuntimeBlockRate)
      );
      if (hasRuntimeUiModeSignal) {
        weeklyOpsRuntimeUiModeViolationKnownRuns += 1;
      }
      if (Number.isFinite(weeklyOpsRuntimeUiModeViolationTotalCount)) {
        const normalizedRuntimeUiModeViolationTotal = Math.max(0, Number(weeklyOpsRuntimeUiModeViolationTotalCount));
        weeklyOpsRuntimeUiModeViolationTotal += normalizedRuntimeUiModeViolationTotal;
        if (normalizedRuntimeUiModeViolationTotal > 0) {
          weeklyOpsRuntimeUiModeViolationRuns += 1;
        }
      }
      if (Number.isFinite(weeklyOpsRuntimeUiModeViolationRate)) {
        weeklyOpsRuntimeUiModeViolationRates.push(Math.max(0, Number(weeklyOpsRuntimeUiModeViolationRate)));
      }
    }

    violationsTotal += Math.max(0, Number(entry && entry.violations_count) || 0);
    configWarningsTotal += Math.max(0, Number(entry && entry.config_warning_count) || 0);
  });

  const evaluatedGateCount = gatePassedCount + gateFailedCount;
  const passRate = evaluatedGateCount > 0
    ? Number(((gatePassedCount / evaluatedGateCount) * 100).toFixed(2))
    : null;
  const averageSpecRate = specRates.length > 0
    ? Number((specRates.reduce((sum, value) => sum + value, 0) / specRates.length).toFixed(2))
    : null;
  const minSpecRate = specRates.length > 0
    ? Number(Math.min(...specRates).toFixed(2))
    : null;
  const maxSpecRate = specRates.length > 0
    ? Number(Math.max(...specRates).toFixed(2))
    : null;
  const sceneBatchPassRate = sceneBatchApplicableCount > 0
    ? Number(((sceneBatchPassedCount / sceneBatchApplicableCount) * 100).toFixed(2))
    : null;
  const avgSceneBatchFailureCount = sceneBatchFailureCounts.length > 0
    ? Number((sceneBatchFailureCounts.reduce((sum, value) => sum + value, 0) / sceneBatchFailureCounts.length).toFixed(2))
    : null;
  const maxSceneBatchFailureCount = sceneBatchFailureCounts.length > 0
    ? Number(Math.max(...sceneBatchFailureCounts).toFixed(2))
    : null;
  const avgCapabilityExpectedUnknownCount = capabilityExpectedUnknownCounts.length > 0
    ? Number((capabilityExpectedUnknownCounts.reduce((sum, value) => sum + value, 0) / capabilityExpectedUnknownCounts.length).toFixed(2))
    : null;
  const maxCapabilityExpectedUnknownCount = capabilityExpectedUnknownCounts.length > 0
    ? Number(Math.max(...capabilityExpectedUnknownCounts).toFixed(2))
    : null;
  const capabilityExpectedUnknownPositiveRate = capabilityExpectedUnknownKnownRuns > 0
    ? Number(((capabilityExpectedUnknownPositiveRuns / capabilityExpectedUnknownKnownRuns) * 100).toFixed(2))
    : null;
  const avgCapabilityProvidedUnknownCount = capabilityProvidedUnknownCounts.length > 0
    ? Number((capabilityProvidedUnknownCounts.reduce((sum, value) => sum + value, 0) / capabilityProvidedUnknownCounts.length).toFixed(2))
    : null;
  const maxCapabilityProvidedUnknownCount = capabilityProvidedUnknownCounts.length > 0
    ? Number(Math.max(...capabilityProvidedUnknownCounts).toFixed(2))
    : null;
  const capabilityProvidedUnknownPositiveRate = capabilityProvidedUnknownKnownRuns > 0
    ? Number(((capabilityProvidedUnknownPositiveRuns / capabilityProvidedUnknownKnownRuns) * 100).toFixed(2))
    : null;
  const driftAlertRate = driftKnownRuns > 0
    ? Number(((driftAlertRuns / driftKnownRuns) * 100).toFixed(2))
    : null;
  const driftBlockRate = driftKnownRuns > 0
    ? Number(((driftBlockedRuns / driftKnownRuns) * 100).toFixed(2))
    : null;
  const weeklyOpsBlockRate = weeklyOpsKnownRuns > 0
    ? Number(((weeklyOpsBlockedRuns / weeklyOpsKnownRuns) * 100).toFixed(2))
    : null;
  const weeklyOpsConfigWarningRunRate = weeklyOpsKnownRuns > 0
    ? Number(((weeklyOpsConfigWarningRuns / weeklyOpsKnownRuns) * 100).toFixed(2))
    : null;
  const weeklyOpsAuthorizationTierBlockRateAvg = weeklyOpsAuthorizationTierBlockRates.length > 0
    ? Number((weeklyOpsAuthorizationTierBlockRates.reduce((sum, value) => sum + value, 0) / weeklyOpsAuthorizationTierBlockRates.length).toFixed(2))
    : null;
  const weeklyOpsAuthorizationTierBlockRateMax = weeklyOpsAuthorizationTierBlockRates.length > 0
    ? Number(Math.max(...weeklyOpsAuthorizationTierBlockRates).toFixed(2))
    : null;
  const weeklyOpsDialogueAuthorizationBlockRateAvg = weeklyOpsDialogueAuthorizationBlockRates.length > 0
    ? Number((weeklyOpsDialogueAuthorizationBlockRates.reduce((sum, value) => sum + value, 0) / weeklyOpsDialogueAuthorizationBlockRates.length).toFixed(2))
    : null;
  const weeklyOpsDialogueAuthorizationBlockRateMax = weeklyOpsDialogueAuthorizationBlockRates.length > 0
    ? Number(Math.max(...weeklyOpsDialogueAuthorizationBlockRates).toFixed(2))
    : null;
  const weeklyOpsMatrixRegressionPositiveRateAvg = weeklyOpsMatrixRegressionPositiveRates.length > 0
    ? Number((weeklyOpsMatrixRegressionPositiveRates.reduce((sum, value) => sum + value, 0) / weeklyOpsMatrixRegressionPositiveRates.length).toFixed(2))
    : null;
  const weeklyOpsMatrixRegressionPositiveRateMax = weeklyOpsMatrixRegressionPositiveRates.length > 0
    ? Number(Math.max(...weeklyOpsMatrixRegressionPositiveRates).toFixed(2))
    : null;
  const weeklyOpsRuntimeBlockRateAvg = weeklyOpsRuntimeBlockRates.length > 0
    ? Number((weeklyOpsRuntimeBlockRates.reduce((sum, value) => sum + value, 0) / weeklyOpsRuntimeBlockRates.length).toFixed(2))
    : null;
  const weeklyOpsRuntimeBlockRateMax = weeklyOpsRuntimeBlockRates.length > 0
    ? Number(Math.max(...weeklyOpsRuntimeBlockRates).toFixed(2))
    : null;
  const weeklyOpsRuntimeUiModeViolationRateAvg = weeklyOpsRuntimeUiModeViolationRates.length > 0
    ? Number((weeklyOpsRuntimeUiModeViolationRates.reduce((sum, value) => sum + value, 0) / weeklyOpsRuntimeUiModeViolationRates.length).toFixed(2))
    : null;
  const weeklyOpsRuntimeUiModeViolationRateMax = weeklyOpsRuntimeUiModeViolationRates.length > 0
    ? Number(Math.max(...weeklyOpsRuntimeUiModeViolationRates).toFixed(2))
    : null;
  const weeklyOpsRuntimeUiModeViolationRunRate = weeklyOpsRuntimeUiModeViolationKnownRuns > 0
    ? Number(((weeklyOpsRuntimeUiModeViolationRuns / weeklyOpsRuntimeUiModeViolationKnownRuns) * 100).toFixed(2))
    : null;
  const preflightAvailabilityRate = preflightKnownRuns > 0
    ? Number(((preflightAvailableRuns / preflightKnownRuns) * 100).toFixed(2))
    : null;
  const preflightBlockedRate = preflightKnownRuns > 0
    ? Number(((preflightBlockedRuns / preflightKnownRuns) * 100).toFixed(2))
    : null;

  return {
    gate_passed_count: gatePassedCount,
    gate_failed_count: gateFailedCount,
    gate_unknown_count: gateUnknownCount,
    pass_rate_percent: passRate,
    evidence_used_count: evidenceUsedCount,
    enforce_count: enforceCount,
    advisory_count: advisoryCount,
    violations_total: violationsTotal,
    config_warnings_total: configWarningsTotal,
    avg_spec_success_rate_percent: averageSpecRate,
    min_spec_success_rate_percent: minSpecRate,
    max_spec_success_rate_percent: maxSpecRate,
    scene_package_batch_applicable_count: sceneBatchApplicableCount,
    scene_package_batch_passed_count: sceneBatchPassedCount,
    scene_package_batch_failed_count: sceneBatchFailedCount,
    scene_package_batch_pass_rate_percent: sceneBatchPassRate,
    avg_scene_package_batch_failure_count: avgSceneBatchFailureCount,
    max_scene_package_batch_failure_count: maxSceneBatchFailureCount,
    capability_expected_unknown_known_runs: capabilityExpectedUnknownKnownRuns,
    capability_expected_unknown_positive_runs: capabilityExpectedUnknownPositiveRuns,
    capability_expected_unknown_positive_rate_percent: capabilityExpectedUnknownPositiveRate,
    avg_capability_expected_unknown_count: avgCapabilityExpectedUnknownCount,
    max_capability_expected_unknown_count: maxCapabilityExpectedUnknownCount,
    capability_provided_unknown_known_runs: capabilityProvidedUnknownKnownRuns,
    capability_provided_unknown_positive_runs: capabilityProvidedUnknownPositiveRuns,
    capability_provided_unknown_positive_rate_percent: capabilityProvidedUnknownPositiveRate,
    avg_capability_provided_unknown_count: avgCapabilityProvidedUnknownCount,
    max_capability_provided_unknown_count: maxCapabilityProvidedUnknownCount,
    drift_known_runs: driftKnownRuns,
    drift_alert_total: driftAlertTotal,
    drift_alert_runs: driftAlertRuns,
    drift_blocked_runs: driftBlockedRuns,
    drift_alert_rate_percent: driftAlertRate,
    drift_block_rate_percent: driftBlockRate,
    weekly_ops_known_runs: weeklyOpsKnownRuns,
    weekly_ops_blocked_runs: weeklyOpsBlockedRuns,
    weekly_ops_block_rate_percent: weeklyOpsBlockRate,
    weekly_ops_violations_total: weeklyOpsViolationsTotal,
    weekly_ops_warnings_total: weeklyOpsWarningsTotal,
    weekly_ops_config_warnings_total: weeklyOpsConfigWarningsTotal,
    weekly_ops_config_warning_runs: weeklyOpsConfigWarningRuns,
    weekly_ops_config_warning_run_rate_percent: weeklyOpsConfigWarningRunRate,
    weekly_ops_authorization_tier_block_rate_avg_percent: weeklyOpsAuthorizationTierBlockRateAvg,
    weekly_ops_authorization_tier_block_rate_max_percent: weeklyOpsAuthorizationTierBlockRateMax,
    weekly_ops_dialogue_authorization_block_rate_avg_percent: weeklyOpsDialogueAuthorizationBlockRateAvg,
    weekly_ops_dialogue_authorization_block_rate_max_percent: weeklyOpsDialogueAuthorizationBlockRateMax,
    weekly_ops_matrix_regression_positive_rate_avg_percent: weeklyOpsMatrixRegressionPositiveRateAvg,
    weekly_ops_matrix_regression_positive_rate_max_percent: weeklyOpsMatrixRegressionPositiveRateMax,
    weekly_ops_runtime_block_rate_avg_percent: weeklyOpsRuntimeBlockRateAvg,
    weekly_ops_runtime_block_rate_max_percent: weeklyOpsRuntimeBlockRateMax,
    weekly_ops_runtime_ui_mode_violation_known_runs: weeklyOpsRuntimeUiModeViolationKnownRuns,
    weekly_ops_runtime_ui_mode_violation_runs: weeklyOpsRuntimeUiModeViolationRuns,
    weekly_ops_runtime_ui_mode_violation_run_rate_percent: weeklyOpsRuntimeUiModeViolationRunRate,
    weekly_ops_runtime_ui_mode_violation_total: weeklyOpsRuntimeUiModeViolationTotal,
    weekly_ops_runtime_ui_mode_violation_rate_avg_percent: weeklyOpsRuntimeUiModeViolationRateAvg,
    weekly_ops_runtime_ui_mode_violation_rate_max_percent: weeklyOpsRuntimeUiModeViolationRateMax,
    release_gate_preflight_known_runs: preflightKnownRuns,
    release_gate_preflight_available_runs: preflightAvailableRuns,
    release_gate_preflight_blocked_runs: preflightBlockedRuns,
    release_gate_preflight_hard_gate_runs: preflightHardGateRuns,
    release_gate_preflight_availability_rate_percent: preflightAvailabilityRate,
    release_gate_preflight_block_rate_percent: preflightBlockedRate,
    risk_levels: riskCounts
  };
}

async function buildAutoHandoffReleaseGateHistoryIndex(projectPath, options = {}) {
  const keep = normalizeHandoffGateHistoryKeep(options.keep);
  const outFile = resolveAutoHandoffReleaseGateHistoryFile(projectPath, options.out);
  const historySeedFile = typeof options.historyFile === 'string' && options.historyFile.trim()
    ? resolveAutoHandoffReleaseGateHistoryFile(projectPath, options.historyFile)
    : outFile;
  const reportResult = await loadAutoHandoffReleaseGateReports(projectPath, options.dir);
  const historySeed = await loadAutoHandoffReleaseGateHistorySeed(projectPath, historySeedFile);
  const mergedEntries = mergeAutoHandoffReleaseGateHistoryEntries([
    ...reportResult.entries,
    ...historySeed.entries
  ]);

  if (mergedEntries.length === 0) {
    throw new Error(`no release gate reports found: ${reportResult.dir}`);
  }

  mergedEntries.sort((left, right) => {
    const leftTs = toAutoHandoffTimestamp(left && left.evaluated_at);
    const rightTs = toAutoHandoffTimestamp(right && right.evaluated_at);
    if (rightTs !== leftTs) {
      return rightTs - leftTs;
    }
    const leftTag = normalizeHandoffText(left && left.tag) || '';
    const rightTag = normalizeHandoffText(right && right.tag) || '';
    return rightTag.localeCompare(leftTag);
  });

  const entries = mergedEntries.slice(0, keep);
  const latestEntry = entries[0] || null;
  const warnings = [...reportResult.warnings, ...historySeed.warnings];
  const payload = {
    mode: 'auto-handoff-release-gate-history',
    generated_at: new Date().toISOString(),
    source_dir: reportResult.dir,
    report_file_count: reportResult.report_files.length,
    report_entry_count: reportResult.entries.length,
    seed_file: historySeed.file,
    seed_entry_count: historySeed.entries.length,
    keep,
    total_entries: entries.length,
    latest: latestEntry
      ? {
        tag: latestEntry.tag,
        evaluated_at: latestEntry.evaluated_at,
        gate_passed: latestEntry.gate_passed,
        risk_level: latestEntry.risk_level,
        scene_package_batch_passed: latestEntry.scene_package_batch_passed,
        scene_package_batch_failure_count: latestEntry.scene_package_batch_failure_count,
        capability_expected_unknown_count: latestEntry.capability_expected_unknown_count,
        capability_provided_unknown_count: latestEntry.capability_provided_unknown_count,
        release_gate_preflight_available: latestEntry.release_gate_preflight_available,
        release_gate_preflight_blocked: latestEntry.release_gate_preflight_blocked,
        require_release_gate_preflight: latestEntry.require_release_gate_preflight,
        weekly_ops_blocked: latestEntry.weekly_ops_blocked,
        weekly_ops_risk_level: latestEntry.weekly_ops_risk_level,
        weekly_ops_governance_status: latestEntry.weekly_ops_governance_status,
        weekly_ops_authorization_tier_block_rate_percent: latestEntry.weekly_ops_authorization_tier_block_rate_percent,
        weekly_ops_dialogue_authorization_block_rate_percent: latestEntry.weekly_ops_dialogue_authorization_block_rate_percent,
        weekly_ops_matrix_regression_positive_rate_percent: latestEntry.weekly_ops_matrix_regression_positive_rate_percent,
        weekly_ops_runtime_block_rate_percent: latestEntry.weekly_ops_runtime_block_rate_percent,
        weekly_ops_runtime_ui_mode_violation_total: latestEntry.weekly_ops_runtime_ui_mode_violation_total,
        weekly_ops_runtime_ui_mode_violation_rate_percent: latestEntry.weekly_ops_runtime_ui_mode_violation_rate_percent,
        weekly_ops_violations_count: latestEntry.weekly_ops_violations_count,
        weekly_ops_warning_count: latestEntry.weekly_ops_warning_count,
        weekly_ops_config_warning_count: latestEntry.weekly_ops_config_warning_count,
        drift_alert_count: latestEntry.drift_alert_count,
        drift_blocked: latestEntry.drift_blocked
      }
      : null,
    aggregates: buildAutoHandoffReleaseGateHistoryAggregates(entries),
    warnings,
    warnings_count: warnings.length,
    entries
  };
  return payload;
}

function renderAutoHandoffReleaseGateHistoryMarkdown(payload = {}) {
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const aggregates = payload.aggregates && typeof payload.aggregates === 'object'
    ? payload.aggregates
    : {};
  const latest = payload.latest && typeof payload.latest === 'object'
    ? payload.latest
    : null;
  const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
  const recentEntries = entries.slice(0, 10);

  const lines = [
    '# Auto Handoff Release Gate History',
    '',
    `- Generated at: ${formatAutoHandoffRegressionValue(payload.generated_at)}`,
    `- Source dir: ${formatAutoHandoffRegressionValue(payload.source_dir)}`,
    `- Total entries: ${formatAutoHandoffRegressionValue(payload.total_entries, '0')}`,
    `- Keep: ${formatAutoHandoffRegressionValue(payload.keep, '0')}`,
    ''
  ];

  if (latest) {
    lines.push('## Latest');
    lines.push('');
    lines.push(`- Tag: ${formatAutoHandoffRegressionValue(latest.tag)}`);
    lines.push(`- Evaluated at: ${formatAutoHandoffRegressionValue(latest.evaluated_at)}`);
    lines.push(`- Gate passed: ${latest.gate_passed === true ? 'yes' : (latest.gate_passed === false ? 'no' : 'n/a')}`);
    lines.push(`- Risk level: ${formatAutoHandoffRegressionValue(latest.risk_level)}`);
    lines.push(`- Scene package batch: ${latest.scene_package_batch_passed === true ? 'pass' : (latest.scene_package_batch_passed === false ? 'fail' : 'n/a')}`);
    lines.push(`- Scene package batch failures: ${formatAutoHandoffRegressionValue(latest.scene_package_batch_failure_count)}`);
    lines.push(`- Capability expected unknown count: ${formatAutoHandoffRegressionValue(latest.capability_expected_unknown_count, '0')}`);
    lines.push(`- Capability provided unknown count: ${formatAutoHandoffRegressionValue(latest.capability_provided_unknown_count, '0')}`);
    lines.push(`- Release preflight available: ${latest.release_gate_preflight_available === true ? 'yes' : (latest.release_gate_preflight_available === false ? 'no' : 'n/a')}`);
    lines.push(`- Release preflight blocked: ${latest.release_gate_preflight_blocked === true ? 'yes' : (latest.release_gate_preflight_blocked === false ? 'no' : 'n/a')}`);
    lines.push(`- Release preflight hard-gate: ${latest.require_release_gate_preflight === true ? 'enabled' : (latest.require_release_gate_preflight === false ? 'advisory' : 'n/a')}`);
    lines.push(`- Weekly ops blocked: ${latest.weekly_ops_blocked === true ? 'yes' : (latest.weekly_ops_blocked === false ? 'no' : 'n/a')}`);
    lines.push(`- Weekly ops risk: ${formatAutoHandoffRegressionValue(latest.weekly_ops_risk_level)}`);
    lines.push(`- Weekly ops governance status: ${formatAutoHandoffRegressionValue(latest.weekly_ops_governance_status)}`);
    lines.push(`- Weekly ops auth-tier block rate: ${formatAutoHandoffRegressionValue(latest.weekly_ops_authorization_tier_block_rate_percent)}%`);
    lines.push(`- Weekly ops dialogue-auth block rate: ${formatAutoHandoffRegressionValue(latest.weekly_ops_dialogue_authorization_block_rate_percent)}%`);
    lines.push(`- Weekly ops matrix regression-positive rate: ${formatAutoHandoffRegressionValue(latest.weekly_ops_matrix_regression_positive_rate_percent)}%`);
    lines.push(`- Weekly ops runtime block rate: ${formatAutoHandoffRegressionValue(latest.weekly_ops_runtime_block_rate_percent)}%`);
    lines.push(`- Weekly ops runtime ui-mode violations: ${formatAutoHandoffRegressionValue(latest.weekly_ops_runtime_ui_mode_violation_total, '0')}`);
    lines.push(`- Weekly ops runtime ui-mode violation rate: ${formatAutoHandoffRegressionValue(latest.weekly_ops_runtime_ui_mode_violation_rate_percent)}%`);
    lines.push(`- Weekly ops violations: ${formatAutoHandoffRegressionValue(latest.weekly_ops_violations_count, '0')}`);
    lines.push(`- Weekly ops warnings: ${formatAutoHandoffRegressionValue(latest.weekly_ops_warning_count, '0')}`);
    lines.push(`- Weekly ops config warnings: ${formatAutoHandoffRegressionValue(latest.weekly_ops_config_warning_count, '0')}`);
    lines.push(`- Drift alerts: ${formatAutoHandoffRegressionValue(latest.drift_alert_count, '0')}`);
    lines.push(`- Drift blocked: ${latest.drift_blocked === true ? 'yes' : (latest.drift_blocked === false ? 'no' : 'n/a')}`);
    lines.push('');
  }

  lines.push('## Aggregates');
  lines.push('');
  lines.push(`- Gate pass rate: ${formatAutoHandoffRegressionValue(aggregates.pass_rate_percent)}%`);
  lines.push(`- Passed: ${formatAutoHandoffRegressionValue(aggregates.gate_passed_count, '0')}`);
  lines.push(`- Failed: ${formatAutoHandoffRegressionValue(aggregates.gate_failed_count, '0')}`);
  lines.push(`- Unknown: ${formatAutoHandoffRegressionValue(aggregates.gate_unknown_count, '0')}`);
  lines.push(`- Evidence used: ${formatAutoHandoffRegressionValue(aggregates.evidence_used_count, '0')}`);
  lines.push(`- Enforce mode runs: ${formatAutoHandoffRegressionValue(aggregates.enforce_count, '0')}`);
  lines.push(`- Advisory mode runs: ${formatAutoHandoffRegressionValue(aggregates.advisory_count, '0')}`);
  lines.push(`- Avg spec success rate: ${formatAutoHandoffRegressionValue(aggregates.avg_spec_success_rate_percent)}`);
  lines.push(`- Scene package batch pass rate: ${formatAutoHandoffRegressionValue(aggregates.scene_package_batch_pass_rate_percent)}%`);
  lines.push(`- Scene package batch failed: ${formatAutoHandoffRegressionValue(aggregates.scene_package_batch_failed_count, '0')}`);
  lines.push(`- Avg scene package batch failures: ${formatAutoHandoffRegressionValue(aggregates.avg_scene_package_batch_failure_count)}`);
  lines.push(`- Capability expected unknown positive rate: ${formatAutoHandoffRegressionValue(aggregates.capability_expected_unknown_positive_rate_percent)}%`);
  lines.push(`- Avg capability expected unknown count: ${formatAutoHandoffRegressionValue(aggregates.avg_capability_expected_unknown_count)}`);
  lines.push(`- Max capability expected unknown count: ${formatAutoHandoffRegressionValue(aggregates.max_capability_expected_unknown_count)}`);
  lines.push(`- Capability provided unknown positive rate: ${formatAutoHandoffRegressionValue(aggregates.capability_provided_unknown_positive_rate_percent)}%`);
  lines.push(`- Avg capability provided unknown count: ${formatAutoHandoffRegressionValue(aggregates.avg_capability_provided_unknown_count)}`);
  lines.push(`- Max capability provided unknown count: ${formatAutoHandoffRegressionValue(aggregates.max_capability_provided_unknown_count)}`);
  lines.push(`- Drift alert runs: ${formatAutoHandoffRegressionValue(aggregates.drift_alert_runs, '0')}`);
  lines.push(`- Drift blocked runs: ${formatAutoHandoffRegressionValue(aggregates.drift_blocked_runs, '0')}`);
  lines.push(`- Drift alert rate: ${formatAutoHandoffRegressionValue(aggregates.drift_alert_rate_percent)}%`);
  lines.push(`- Drift block rate: ${formatAutoHandoffRegressionValue(aggregates.drift_block_rate_percent)}%`);
  lines.push(`- Weekly ops known runs: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_known_runs, '0')}`);
  lines.push(`- Weekly ops blocked runs: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_blocked_runs, '0')}`);
  lines.push(`- Weekly ops block rate: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_block_rate_percent)}%`);
  lines.push(`- Weekly ops violations total: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_violations_total, '0')}`);
  lines.push(`- Weekly ops warnings total: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_warnings_total, '0')}`);
  lines.push(`- Weekly ops config warnings total: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_config_warnings_total, '0')}`);
  lines.push(`- Weekly ops config warning runs: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_config_warning_runs, '0')}`);
  lines.push(`- Weekly ops config warning run rate: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_config_warning_run_rate_percent)}%`);
  lines.push(`- Weekly ops auth-tier block rate avg/max: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_authorization_tier_block_rate_avg_percent)}/${formatAutoHandoffRegressionValue(aggregates.weekly_ops_authorization_tier_block_rate_max_percent)}%`);
  lines.push(`- Weekly ops dialogue-auth block rate avg/max: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_dialogue_authorization_block_rate_avg_percent)}/${formatAutoHandoffRegressionValue(aggregates.weekly_ops_dialogue_authorization_block_rate_max_percent)}%`);
  lines.push(`- Weekly ops matrix regression-positive rate avg/max: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_matrix_regression_positive_rate_avg_percent)}/${formatAutoHandoffRegressionValue(aggregates.weekly_ops_matrix_regression_positive_rate_max_percent)}%`);
  lines.push(`- Weekly ops runtime block rate avg/max: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_runtime_block_rate_avg_percent)}/${formatAutoHandoffRegressionValue(aggregates.weekly_ops_runtime_block_rate_max_percent)}%`);
  lines.push(`- Weekly ops runtime ui-mode known runs: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_runtime_ui_mode_violation_known_runs, '0')}`);
  lines.push(`- Weekly ops runtime ui-mode violation runs: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_runtime_ui_mode_violation_runs, '0')}`);
  lines.push(`- Weekly ops runtime ui-mode violation run rate: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_runtime_ui_mode_violation_run_rate_percent)}%`);
  lines.push(`- Weekly ops runtime ui-mode violations total: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_runtime_ui_mode_violation_total, '0')}`);
  lines.push(`- Weekly ops runtime ui-mode violation rate avg/max: ${formatAutoHandoffRegressionValue(aggregates.weekly_ops_runtime_ui_mode_violation_rate_avg_percent)}/${formatAutoHandoffRegressionValue(aggregates.weekly_ops_runtime_ui_mode_violation_rate_max_percent)}%`);
  lines.push(`- Release preflight known runs: ${formatAutoHandoffRegressionValue(aggregates.release_gate_preflight_known_runs, '0')}`);
  lines.push(`- Release preflight available runs: ${formatAutoHandoffRegressionValue(aggregates.release_gate_preflight_available_runs, '0')}`);
  lines.push(`- Release preflight blocked runs: ${formatAutoHandoffRegressionValue(aggregates.release_gate_preflight_blocked_runs, '0')}`);
  lines.push(`- Release preflight hard-gate runs: ${formatAutoHandoffRegressionValue(aggregates.release_gate_preflight_hard_gate_runs, '0')}`);
  lines.push(`- Release preflight availability rate: ${formatAutoHandoffRegressionValue(aggregates.release_gate_preflight_availability_rate_percent)}%`);
  lines.push(`- Release preflight block rate: ${formatAutoHandoffRegressionValue(aggregates.release_gate_preflight_block_rate_percent)}%`);
  lines.push(`- Risk levels: low=${formatAutoHandoffRegressionValue(aggregates.risk_levels && aggregates.risk_levels.low, '0')}, medium=${formatAutoHandoffRegressionValue(aggregates.risk_levels && aggregates.risk_levels.medium, '0')}, high=${formatAutoHandoffRegressionValue(aggregates.risk_levels && aggregates.risk_levels.high, '0')}, unknown=${formatAutoHandoffRegressionValue(aggregates.risk_levels && aggregates.risk_levels.unknown, '0')}`);
  lines.push('');
  lines.push('## Recent Entries');
  lines.push('');

  if (recentEntries.length === 0) {
    lines.push('- None');
  } else {
    recentEntries.forEach(entry => {
      const tag = formatAutoHandoffRegressionValue(entry && entry.tag);
      const passed = entry && entry.gate_passed === true ? 'yes' : (entry && entry.gate_passed === false ? 'no' : 'n/a');
      const risk = formatAutoHandoffRegressionValue(entry && entry.risk_level);
      const successRate = formatAutoHandoffRegressionValue(entry && entry.spec_success_rate_percent);
      const evaluatedAt = formatAutoHandoffRegressionValue(entry && entry.evaluated_at);
      const violations = formatAutoHandoffRegressionValue(entry && entry.violations_count, '0');
      const sceneBatch = entry && entry.scene_package_batch_passed === true
        ? 'pass'
        : (entry && entry.scene_package_batch_passed === false ? 'fail' : 'n/a');
      const sceneBatchFailures = formatAutoHandoffRegressionValue(
        entry && entry.scene_package_batch_failure_count
      );
      const capabilityExpectedUnknown = formatAutoHandoffRegressionValue(
        entry && entry.capability_expected_unknown_count,
        '0'
      );
      const capabilityProvidedUnknown = formatAutoHandoffRegressionValue(
        entry && entry.capability_provided_unknown_count,
        '0'
      );
      const preflightBlocked = entry && entry.release_gate_preflight_blocked === true
        ? 'yes'
        : (entry && entry.release_gate_preflight_blocked === false ? 'no' : 'n/a');
      const preflightHardGate = entry && entry.require_release_gate_preflight === true
        ? 'enabled'
        : (entry && entry.require_release_gate_preflight === false ? 'advisory' : 'n/a');
      const driftAlerts = formatAutoHandoffRegressionValue(entry && entry.drift_alert_count, '0');
      const driftBlocked = entry && entry.drift_blocked === true
        ? 'yes'
        : (entry && entry.drift_blocked === false ? 'no' : 'n/a');
      const weeklyOpsBlocked = entry && entry.weekly_ops_blocked === true
        ? 'yes'
        : (entry && entry.weekly_ops_blocked === false ? 'no' : 'n/a');
      const weeklyOpsConfigWarnings = formatAutoHandoffRegressionValue(
        entry && entry.weekly_ops_config_warning_count,
        '0'
      );
      const weeklyOpsDialogueRate = formatAutoHandoffRegressionValue(
        entry && entry.weekly_ops_dialogue_authorization_block_rate_percent
      );
      const weeklyOpsAuthTierRate = formatAutoHandoffRegressionValue(
        entry && entry.weekly_ops_authorization_tier_block_rate_percent
      );
      const weeklyOpsRuntimeBlockRate = formatAutoHandoffRegressionValue(
        entry && entry.weekly_ops_runtime_block_rate_percent
      );
      const weeklyOpsRuntimeUiModeViolationTotal = formatAutoHandoffRegressionValue(
        entry && entry.weekly_ops_runtime_ui_mode_violation_total,
        '0'
      );
      const weeklyOpsRuntimeUiModeViolationRate = formatAutoHandoffRegressionValue(
        entry && entry.weekly_ops_runtime_ui_mode_violation_rate_percent
      );
      lines.push(
        `- ${tag} | passed=${passed} | risk=${risk} | scene-batch=${sceneBatch} | ` +
        `scene-failures=${sceneBatchFailures} | capability-unknown=${capabilityExpectedUnknown}/${capabilityProvidedUnknown} | ` +
        `preflight-blocked=${preflightBlocked} | hard-gate=${preflightHardGate} | ` +
        `drift-alerts=${driftAlerts} | drift-blocked=${driftBlocked} | ` +
        `weekly-blocked=${weeklyOpsBlocked} | weekly-config-warnings=${weeklyOpsConfigWarnings} | ` +
        `weekly-auth-tier-rate=${weeklyOpsAuthTierRate}% | weekly-dialogue-rate=${weeklyOpsDialogueRate}% | ` +
        `weekly-runtime-block-rate=${weeklyOpsRuntimeBlockRate}% | ` +
        `weekly-runtime-ui-mode=${weeklyOpsRuntimeUiModeViolationTotal}/${weeklyOpsRuntimeUiModeViolationRate}% | ` +
        `success=${successRate} | violations=${violations} | at=${evaluatedAt}`
      );
    });
  }

  if (warnings.length > 0) {
    lines.push('');
    lines.push('## Warnings');
    warnings.forEach(item => {
      lines.push('', `- ${item}`);
    });
  }

  return `${lines.join('\n')}\n`;
}

async function loadAutoHandoffReleaseEvidence(projectPath, fileCandidate = null) {
  const filePath = resolveAutoHandoffReleaseEvidenceFile(projectPath, fileCandidate);
  if (!(await fs.pathExists(filePath))) {
    throw new Error(`release evidence file not found: ${filePath}`);
  }

  let payload = null;
  try {
    payload = await fs.readJson(filePath);
  } catch (error) {
    throw new Error(`invalid release evidence JSON: ${filePath} (${error.message})`);
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error(`invalid release evidence payload: ${filePath}`);
  }

  const sessions = Array.isArray(payload.sessions)
    ? payload.sessions.filter(item => item && typeof item === 'object')
    : [];
  sessions.sort((left, right) => {
    const leftTs = Date.parse(
      left && (left.merged_at || left.generated_at || left.updated_at)
        ? (left.merged_at || left.generated_at || left.updated_at)
        : 0
    );
    const rightTs = Date.parse(
      right && (right.merged_at || right.generated_at || right.updated_at)
        ? (right.merged_at || right.generated_at || right.updated_at)
        : 0
    );
    return (Number.isFinite(rightTs) ? rightTs : 0) - (Number.isFinite(leftTs) ? leftTs : 0);
  });

  return {
    file: filePath,
    payload,
    sessions
  };
}

function buildAutoHandoffEvidenceSnapshot(entry = {}) {
  const toNumber = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const gate = entry && typeof entry.gate === 'object' ? entry.gate : {};
  const gateActual = gate && typeof gate.actual === 'object' ? gate.actual : {};
  const ontology = entry && typeof entry.ontology_validation === 'object'
    ? entry.ontology_validation
    : {};
  const ontologyMetrics = ontology && typeof ontology.metrics === 'object'
    ? ontology.metrics
    : {};
  const moquiBaseline = entry && typeof entry.moqui_baseline === 'object'
    ? entry.moqui_baseline
    : {};
  const moquiCompare = moquiBaseline && typeof moquiBaseline.compare === 'object'
    ? moquiBaseline.compare
    : {};
  const moquiMatrixRegressions = buildAutoHandoffMoquiCoverageRegressions(moquiCompare);
  const scenePackageBatch = entry && typeof entry.scene_package_batch === 'object'
    ? entry.scene_package_batch
    : {};
  const scenePackageBatchSummary = scenePackageBatch && typeof scenePackageBatch.summary === 'object'
    ? scenePackageBatch.summary
    : {};
  const sceneBatchStatus = normalizeHandoffText(scenePackageBatch.status);
  const sceneBatchPassed = sceneBatchStatus
    ? (sceneBatchStatus === 'skipped' ? null : sceneBatchStatus === 'passed')
    : null;
  const riskLevel = normalizeHandoffText(
    gateActual.risk_level
      || (entry && entry.regression ? entry.regression.risk_level : null)
      || 'high'
  ) || 'high';

  return {
    session_id: normalizeHandoffText(entry.session_id),
    status: normalizeHandoffText(entry.status),
    merged_at: normalizeHandoffText(entry.merged_at),
    manifest_path: normalizeHandoffText(entry.manifest_path),
    gate_passed: gate.passed === true,
    spec_success_rate_percent: toNumber(gateActual.spec_success_rate_percent),
    risk_level: `${riskLevel}`.trim().toLowerCase(),
    risk_level_rank: normalizeRiskRank(riskLevel),
    failed_goals: toNumber(entry && entry.batch_summary ? entry.batch_summary.failed_goals : null),
    elapsed_ms: null,
    ontology_quality_score: toNumber(
      gateActual.ontology_quality_score !== undefined
        ? gateActual.ontology_quality_score
        : ontology.quality_score
    ),
    ontology_unmapped_rules: toNumber(
      gateActual.ontology_business_rule_unmapped !== undefined
        ? gateActual.ontology_business_rule_unmapped
        : ontologyMetrics.business_rule_unmapped
    ),
    ontology_undecided_decisions: toNumber(
      gateActual.ontology_decision_undecided !== undefined
        ? gateActual.ontology_decision_undecided
        : ontologyMetrics.decision_undecided
    ),
    ontology_business_rule_pass_rate_percent: toNumber(ontologyMetrics.business_rule_pass_rate_percent),
    ontology_decision_resolved_rate_percent: toNumber(ontologyMetrics.decision_resolved_rate_percent),
    scene_package_batch_status: sceneBatchStatus,
    scene_package_batch_passed: typeof sceneBatchPassed === 'boolean' ? sceneBatchPassed : null,
    scene_package_batch_failure_count: toNumber(
      scenePackageBatchSummary.batch_gate_failure_count !== undefined
        ? scenePackageBatchSummary.batch_gate_failure_count
        : scenePackageBatchSummary.failed
    ),
    capability_coverage_percent: toNumber(
      entry &&
      entry.capability_coverage &&
      entry.capability_coverage.summary
        ? entry.capability_coverage.summary.coverage_percent
        : null
    ),
    capability_coverage_passed: Boolean(
      entry &&
      entry.capability_coverage &&
      entry.capability_coverage.summary &&
      entry.capability_coverage.summary.passed === true
    ),
    moqui_matrix_regression_count: moquiMatrixRegressions.length,
    generated_at: normalizeHandoffText(entry.merged_at)
  };
}

function buildAutoHandoffEvidenceStatusCounts(entries = []) {
  const counts = {
    completed: 0,
    failed: 0,
    dry_run: 0,
    running: 0,
    other: 0
  };
  entries.forEach(entry => {
    const status = `${entry && entry.status ? entry.status : ''}`.trim().toLowerCase();
    if (status === 'completed') {
      counts.completed += 1;
    } else if (status === 'failed') {
      counts.failed += 1;
    } else if (status === 'dry-run' || status === 'dry_run') {
      counts.dry_run += 1;
    } else if (status === 'running') {
      counts.running += 1;
    } else {
      counts.other += 1;
    }
  });
  return counts;
}

function renderAutoHandoffEvidenceReviewMarkdown(payload = {}) {
  const current = payload.current || {};
  const currentOverview = payload.current_overview || {};
  const gate = currentOverview.gate && typeof currentOverview.gate === 'object'
    ? currentOverview.gate
    : {};
  const gateActual = gate && gate.actual && typeof gate.actual === 'object'
    ? gate.actual
    : {};
  const releaseGatePreflight = currentOverview.release_gate_preflight && typeof currentOverview.release_gate_preflight === 'object'
    ? currentOverview.release_gate_preflight
    : {};
  const failureSummary = currentOverview.failure_summary && typeof currentOverview.failure_summary === 'object'
    ? currentOverview.failure_summary
    : {};
  const currentPolicy = currentOverview.policy && typeof currentOverview.policy === 'object'
    ? currentOverview.policy
    : {};
  const ontology = currentOverview.ontology_validation && typeof currentOverview.ontology_validation === 'object'
    ? currentOverview.ontology_validation
    : {};
  const ontologyMetrics = ontology && ontology.metrics && typeof ontology.metrics === 'object'
    ? ontology.metrics
    : {};
  const regression = currentOverview.regression && typeof currentOverview.regression === 'object'
    ? currentOverview.regression
    : {};
  const moquiBaseline = currentOverview.moqui_baseline && typeof currentOverview.moqui_baseline === 'object'
    ? currentOverview.moqui_baseline
    : {};
  const moquiSummary = moquiBaseline && moquiBaseline.summary && typeof moquiBaseline.summary === 'object'
    ? moquiBaseline.summary
    : {};
  const moquiScopeBreakdown = moquiSummary && moquiSummary.scope_breakdown && typeof moquiSummary.scope_breakdown === 'object'
    ? moquiSummary.scope_breakdown
    : {};
  const moquiGapFrequency = Array.isArray(moquiSummary && moquiSummary.gap_frequency)
    ? moquiSummary.gap_frequency
    : [];
  const moquiCompare = moquiBaseline && moquiBaseline.compare && typeof moquiBaseline.compare === 'object'
    ? moquiBaseline.compare
    : {};
  const moquiMatrixRegressions = buildAutoHandoffMoquiCoverageRegressions(moquiCompare);
  const moquiDeltas = moquiCompare && moquiCompare.deltas && typeof moquiCompare.deltas === 'object'
    ? moquiCompare.deltas
    : {};
  const moquiFailedTemplates = moquiCompare && moquiCompare.failed_templates && typeof moquiCompare.failed_templates === 'object'
    ? moquiCompare.failed_templates
    : {};
  const scenePackageBatch = currentOverview.scene_package_batch && typeof currentOverview.scene_package_batch === 'object'
    ? currentOverview.scene_package_batch
    : {};
  const scenePackageBatchSummary = scenePackageBatch && scenePackageBatch.summary && typeof scenePackageBatch.summary === 'object'
    ? scenePackageBatch.summary
    : {};
  const scenePackageBatchGate = scenePackageBatch && scenePackageBatch.batch_ontology_gate && typeof scenePackageBatch.batch_ontology_gate === 'object'
    ? scenePackageBatch.batch_ontology_gate
    : {};
  const scenePackageBatchFailures = Array.isArray(scenePackageBatchGate.failures)
    ? scenePackageBatchGate.failures
    : [];
  const capabilityCoverage = currentOverview.capability_coverage && typeof currentOverview.capability_coverage === 'object'
    ? currentOverview.capability_coverage
    : {};
  const capabilitySummary = capabilityCoverage && capabilityCoverage.summary && typeof capabilityCoverage.summary === 'object'
    ? capabilityCoverage.summary
    : {};
  const capabilityCompare = capabilityCoverage && capabilityCoverage.compare && typeof capabilityCoverage.compare === 'object'
    ? capabilityCoverage.compare
    : {};
  const capabilityGaps = Array.isArray(capabilityCoverage && capabilityCoverage.gaps)
    ? capabilityCoverage.gaps
    : [];
  const capabilityNormalization = capabilityCoverage && capabilityCoverage.normalization && typeof capabilityCoverage.normalization === 'object'
    ? capabilityCoverage.normalization
    : {};
  const capabilityWarnings = Array.isArray(capabilityCoverage && capabilityCoverage.warnings)
    ? capabilityCoverage.warnings
    : [];
  const window = payload.window || { requested: 5, actual: 0 };
  const series = Array.isArray(payload.series) ? payload.series : [];
  const riskLayers = payload.risk_layers && typeof payload.risk_layers === 'object'
    ? payload.risk_layers
    : {};
  const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : [];
  const governanceSnapshot = payload.governance_snapshot && typeof payload.governance_snapshot === 'object'
    ? payload.governance_snapshot
    : null;
  const governanceHealth = governanceSnapshot && governanceSnapshot.health &&
    typeof governanceSnapshot.health === 'object'
    ? governanceSnapshot.health
    : {};
  const governanceReleaseGate = governanceHealth.release_gate && typeof governanceHealth.release_gate === 'object'
    ? governanceHealth.release_gate
    : {};
  const governanceHandoffQuality = governanceHealth.handoff_quality && typeof governanceHealth.handoff_quality === 'object'
    ? governanceHealth.handoff_quality
    : {};
  const trendSeriesLines = series.length > 0
    ? series.map(item => {
      const sessionId = formatAutoHandoffRegressionValue(item.session_id);
      const mergedAt = formatAutoHandoffRegressionValue(item.merged_at || item.generated_at);
      const riskLevel = formatAutoHandoffRegressionValue(item.risk_level);
      const failedGoals = formatAutoHandoffRegressionValue(item.failed_goals);
      const sceneBatch = item.scene_package_batch_passed === null || item.scene_package_batch_passed === undefined
        ? 'n/a'
        : (item.scene_package_batch_passed ? 'pass' : 'fail');
      const successBar = renderAutoHandoffRegressionAsciiBar(item.spec_success_rate_percent, 100, 20);
      const ontologyBar = renderAutoHandoffRegressionAsciiBar(item.ontology_quality_score, 100, 20);
      const capabilityBar = renderAutoHandoffRegressionAsciiBar(item.capability_coverage_percent, 100, 20);
      return (
        `- ${sessionId} | ${mergedAt} | risk=${riskLevel} | failed=${failedGoals} | scene-batch=${sceneBatch} | ` +
        `success=${successBar} | ontology=${ontologyBar} | capability=${capabilityBar}`
      );
    })
    : ['- None'];
  const riskLayerLines = ['low', 'medium', 'high', 'unknown'].map(level => {
    const scoped = riskLayers[level] && typeof riskLayers[level] === 'object'
      ? riskLayers[level]
      : {};
    return (
      `- ${level}: count=${formatAutoHandoffRegressionValue(scoped.count, '0')}, ` +
      `avg_success=${formatAutoHandoffRegressionValue(scoped.avg_spec_success_rate_percent)}, ` +
      `avg_failed_goals=${formatAutoHandoffRegressionValue(scoped.avg_failed_goals)}, ` +
      `avg_ontology_quality=${formatAutoHandoffRegressionValue(scoped.avg_ontology_quality_score)}, ` +
      `scene_batch_pass_rate=${formatAutoHandoffRegressionValue(scoped.scene_package_batch_pass_rate_percent)}%, ` +
      `avg_moqui_matrix_regressions=${formatAutoHandoffRegressionValue(scoped.avg_moqui_matrix_regression_count, '0')}`
    );
  });

  const lines = [
    '# Auto Handoff Release Evidence Review',
    '',
    `- Evidence file: ${formatAutoHandoffRegressionValue(payload.evidence_file)}`,
    `- Session: ${formatAutoHandoffRegressionValue(current.session_id)}`,
    `- Status: ${formatAutoHandoffRegressionValue(current.status)}`,
    `- Trend: ${formatAutoHandoffRegressionValue(payload.trend)}`,
    `- Window: ${formatAutoHandoffRegressionValue(window.actual)}/${formatAutoHandoffRegressionValue(window.requested)}`,
    '',
    '## Current Gate',
    '',
    `- Passed: ${gate.passed === true ? 'yes' : 'no'}`,
    `- Spec success rate: ${formatAutoHandoffRegressionValue(gateActual.spec_success_rate_percent)}`,
    `- Risk level: ${formatAutoHandoffRegressionValue(gateActual.risk_level)}`,
    `- Ontology quality score: ${formatAutoHandoffRegressionValue(gateActual.ontology_quality_score)}`,
    `- Unmapped business rules: ${formatAutoHandoffRegressionValue(gateActual.ontology_business_rule_unmapped)}`,
    `- Undecided decisions: ${formatAutoHandoffRegressionValue(gateActual.ontology_decision_undecided)}`,
    '',
    '## Current Release Gate Preflight',
    '',
    `- Available: ${releaseGatePreflight.available === true ? 'yes' : 'no'}`,
    `- Blocked: ${releaseGatePreflight.blocked === true ? 'yes' : 'no'}`,
    `- Latest tag: ${formatAutoHandoffRegressionValue(releaseGatePreflight.latest_tag)}`,
    `- Latest gate passed: ${releaseGatePreflight.latest_gate_passed === true ? 'yes' : (releaseGatePreflight.latest_gate_passed === false ? 'no' : 'n/a')}`,
    `- Pass rate: ${formatAutoHandoffRegressionValue(releaseGatePreflight.pass_rate_percent)}%`,
    `- Scene batch pass rate: ${formatAutoHandoffRegressionValue(releaseGatePreflight.scene_package_batch_pass_rate_percent)}%`,
    `- Drift alert rate: ${formatAutoHandoffRegressionValue(releaseGatePreflight.drift_alert_rate_percent)}%`,
    `- Drift blocked runs: ${formatAutoHandoffRegressionValue(releaseGatePreflight.drift_blocked_runs)}`,
    `- Runtime block rate (latest/max): ${formatAutoHandoffRegressionValue(releaseGatePreflight.latest_weekly_ops_runtime_block_rate_percent)}/${formatAutoHandoffRegressionValue(releaseGatePreflight.weekly_ops_runtime_block_rate_max_percent)}%`,
    `- Runtime ui-mode violations (latest/total): ${formatAutoHandoffRegressionValue(releaseGatePreflight.latest_weekly_ops_runtime_ui_mode_violation_total, '0')}/${formatAutoHandoffRegressionValue(releaseGatePreflight.weekly_ops_runtime_ui_mode_violation_total, '0')}`,
    `- Runtime ui-mode violation rate (latest/run-rate/max): ${formatAutoHandoffRegressionValue(releaseGatePreflight.latest_weekly_ops_runtime_ui_mode_violation_rate_percent)}/${formatAutoHandoffRegressionValue(releaseGatePreflight.weekly_ops_runtime_ui_mode_violation_run_rate_percent)}/${formatAutoHandoffRegressionValue(releaseGatePreflight.weekly_ops_runtime_ui_mode_violation_rate_max_percent)}%`,
    `- Reasons: ${Array.isArray(releaseGatePreflight.reasons) && releaseGatePreflight.reasons.length > 0 ? releaseGatePreflight.reasons.join(' | ') : 'none'}`,
    `- Parse error: ${formatAutoHandoffRegressionValue(releaseGatePreflight.parse_error)}`,
    '',
    '## Current Failure Summary',
    '',
    `- Failed phase: ${formatAutoHandoffRegressionValue(failureSummary.failed_phase && failureSummary.failed_phase.id)}`,
    `- Gate failed: ${failureSummary.gate_failed === true ? 'yes' : 'no'}`,
    `- Release gate preflight blocked: ${failureSummary.release_gate_preflight_blocked === true ? 'yes' : 'no'}`,
    `- Highlights: ${Array.isArray(failureSummary.highlights) && failureSummary.highlights.length > 0 ? failureSummary.highlights.join(' | ') : 'none'}`,
    '',
    '## Current Ontology',
    '',
    `- Status: ${formatAutoHandoffRegressionValue(ontology.status)}`,
    `- Passed: ${ontology.passed === true ? 'yes' : 'no'}`,
    `- Quality score: ${formatAutoHandoffRegressionValue(ontology.quality_score)}`,
    `- Entity total: ${formatAutoHandoffRegressionValue(ontologyMetrics.entity_total)}`,
    `- Relation total: ${formatAutoHandoffRegressionValue(ontologyMetrics.relation_total)}`,
    `- Business rule unmapped: ${formatAutoHandoffRegressionValue(ontologyMetrics.business_rule_unmapped)}`,
    `- Decision undecided: ${formatAutoHandoffRegressionValue(ontologyMetrics.decision_undecided)}`,
    '',
    '## Current Regression',
    '',
    `- Trend: ${formatAutoHandoffRegressionValue(regression.trend)}`,
    `- Delta success rate: ${formatAutoHandoffRegressionValue(regression.delta && regression.delta.spec_success_rate_percent)}`,
    `- Delta risk rank: ${formatAutoHandoffRegressionValue(regression.delta && regression.delta.risk_level_rank)}`,
    `- Delta failed goals: ${formatAutoHandoffRegressionValue(regression.delta && regression.delta.failed_goals)}`,
    '',
    '## Current Moqui Baseline',
    '',
    `- Status: ${formatAutoHandoffRegressionValue(moquiBaseline.status)}`,
    `- Portfolio passed: ${moquiSummary.portfolio_passed === true ? 'yes' : (moquiSummary.portfolio_passed === false ? 'no' : 'n/a')}`,
    `- Avg score: ${formatAutoHandoffRegressionValue(moquiSummary.avg_score)}`,
    `- Valid-rate: ${formatAutoHandoffRegressionValue(moquiSummary.valid_rate_percent)}%`,
    `- Baseline failed templates: ${formatAutoHandoffRegressionValue(moquiSummary.baseline_failed)}`,
    `- Matrix regression count: ${formatAutoHandoffRegressionValue(moquiMatrixRegressions.length, '0')}`,
    `- Matrix regression gate (max): ${formatAutoHandoffRegressionValue(currentPolicy.max_moqui_matrix_regressions)}`,
    `- Scope mix (moqui/suite/other): ${formatAutoHandoffRegressionValue(moquiScopeBreakdown.moqui_erp, '0')}/${formatAutoHandoffRegressionValue(moquiScopeBreakdown.scene_orchestration, '0')}/${formatAutoHandoffRegressionValue(moquiScopeBreakdown.other, '0')}`,
    `- Entity coverage: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'entity_coverage', 'rate_percent', '%')}`,
    `- Relation coverage: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'relation_coverage', 'rate_percent', '%')}`,
    `- Business-rule coverage: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'business_rule_coverage', 'rate_percent', '%')}`,
    `- Business-rule closed: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'business_rule_closed', 'rate_percent', '%')}`,
    `- Decision coverage: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'decision_coverage', 'rate_percent', '%')}`,
    `- Decision closed: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'decision_closed', 'rate_percent', '%')}`,
    `- Delta avg score: ${formatAutoHandoffRegressionValue(moquiDeltas.avg_score)}`,
    `- Delta valid-rate: ${formatAutoHandoffRegressionValue(moquiDeltas.valid_rate_percent)}%`,
    `- Delta entity coverage: ${formatAutoHandoffMoquiCoverageDeltaMetric(moquiCompare, 'entity_coverage', 'rate_percent', '%')}`,
    `- Delta business-rule closed: ${formatAutoHandoffMoquiCoverageDeltaMetric(moquiCompare, 'business_rule_closed', 'rate_percent', '%')}`,
    `- Delta decision closed: ${formatAutoHandoffMoquiCoverageDeltaMetric(moquiCompare, 'decision_closed', 'rate_percent', '%')}`,
    `- Matrix regressions: ${formatAutoHandoffMoquiCoverageRegressions(moquiCompare, 5)}`,
    `- Newly failed templates: ${Array.isArray(moquiFailedTemplates.newly_failed) && moquiFailedTemplates.newly_failed.length > 0 ? moquiFailedTemplates.newly_failed.join(', ') : 'none'}`,
    `- Recovered templates: ${Array.isArray(moquiFailedTemplates.recovered) && moquiFailedTemplates.recovered.length > 0 ? moquiFailedTemplates.recovered.join(', ') : 'none'}`,
    `- Top baseline gaps: ${moquiGapFrequency.length > 0 ? moquiGapFrequency.slice(0, 3).map(item => `${item.gap}:${item.count}`).join(' | ') : 'none'}`,
    `- Baseline JSON: ${formatAutoHandoffRegressionValue(moquiBaseline.output && moquiBaseline.output.json)}`,
    '',
    '## Current Scene Package Batch',
    '',
    `- Status: ${formatAutoHandoffRegressionValue(scenePackageBatch.status)}`,
    `- Generated: ${scenePackageBatch.generated === true ? 'yes' : 'no'}`,
    `- Selected specs: ${formatAutoHandoffRegressionValue(scenePackageBatchSummary.selected)}`,
    `- Failed specs: ${formatAutoHandoffRegressionValue(scenePackageBatchSummary.failed)}`,
    `- Batch gate passed: ${scenePackageBatchSummary.batch_gate_passed === true ? 'yes' : (scenePackageBatchSummary.batch_gate_passed === false ? 'no' : 'n/a')}`,
    `- Batch gate failure count: ${formatAutoHandoffRegressionValue(scenePackageBatchSummary.batch_gate_failure_count)}`,
    `- Ontology average score: ${formatAutoHandoffRegressionValue(scenePackageBatchSummary.ontology_average_score)}`,
    `- Ontology valid-rate: ${formatAutoHandoffRegressionValue(scenePackageBatchSummary.ontology_valid_rate_percent)}%`,
    `- Batch gate failures: ${scenePackageBatchFailures.length > 0 ? scenePackageBatchFailures.map(item => item && item.message ? item.message : '').filter(Boolean).join(' | ') : 'none'}`,
    `- Scene batch JSON: ${formatAutoHandoffRegressionValue(scenePackageBatch.output && scenePackageBatch.output.json)}`,
    '',
    '## Current Capability Coverage',
    '',
    `- Status: ${formatAutoHandoffRegressionValue(capabilityCoverage.status)}`,
    `- Passed: ${capabilitySummary.passed === true ? 'yes' : (capabilitySummary.passed === false ? 'no' : 'n/a')}`,
    `- Coverage: ${formatAutoHandoffRegressionValue(capabilitySummary.coverage_percent)}%`,
    `- Min required: ${formatAutoHandoffRegressionValue(capabilitySummary.min_required_percent)}%`,
    `- Covered capabilities: ${formatAutoHandoffRegressionValue(capabilitySummary.covered_capabilities)}`,
    `- Uncovered capabilities: ${formatAutoHandoffRegressionValue(capabilitySummary.uncovered_capabilities)}`,
    `- Delta coverage: ${formatAutoHandoffRegressionValue(capabilityCompare.delta_coverage_percent)}%`,
    `- Delta covered capabilities: ${formatAutoHandoffRegressionValue(capabilityCompare.delta_covered_capabilities)}`,
    `- Newly covered: ${Array.isArray(capabilityCompare.newly_covered) && capabilityCompare.newly_covered.length > 0 ? capabilityCompare.newly_covered.join(', ') : 'none'}`,
    `- Newly uncovered: ${Array.isArray(capabilityCompare.newly_uncovered) && capabilityCompare.newly_uncovered.length > 0 ? capabilityCompare.newly_uncovered.join(', ') : 'none'}`,
    `- Lexicon version: ${formatAutoHandoffRegressionValue(capabilityNormalization.lexicon_version)}`,
    `- Expected alias mapped: ${formatAutoHandoffRegressionValue(Array.isArray(capabilityNormalization.expected_alias_mapped) ? capabilityNormalization.expected_alias_mapped.length : 0)}`,
    `- Expected deprecated alias: ${formatAutoHandoffRegressionValue(Array.isArray(capabilityNormalization.expected_deprecated_aliases) ? capabilityNormalization.expected_deprecated_aliases.length : 0)}`,
    `- Expected unknown: ${formatAutoHandoffRegressionValue(Array.isArray(capabilityNormalization.expected_unknown) ? capabilityNormalization.expected_unknown.length : 0)}`,
    `- Provided alias mapped: ${formatAutoHandoffRegressionValue(Array.isArray(capabilityNormalization.provided_alias_mapped) ? capabilityNormalization.provided_alias_mapped.length : 0)}`,
    `- Provided deprecated alias: ${formatAutoHandoffRegressionValue(Array.isArray(capabilityNormalization.provided_deprecated_aliases) ? capabilityNormalization.provided_deprecated_aliases.length : 0)}`,
    `- Provided unknown: ${formatAutoHandoffRegressionValue(Array.isArray(capabilityNormalization.provided_unknown) ? capabilityNormalization.provided_unknown.length : 0)}`,
    `- Capability gaps: ${capabilityGaps.length > 0 ? capabilityGaps.join(', ') : 'none'}`,
    `- Coverage warnings: ${capabilityWarnings.length > 0 ? capabilityWarnings.join(' | ') : 'none'}`,
    `- Coverage JSON: ${formatAutoHandoffRegressionValue(capabilityCoverage.output && capabilityCoverage.output.json)}`,
    '',
    '## Trend Series',
    '',
    ...trendSeriesLines,
    '',
    '## Risk Layer View',
    '',
    ...riskLayerLines,
    '',
    '## Governance Snapshot',
    '',
    `- Risk level: ${formatAutoHandoffRegressionValue(governanceHealth.risk_level)}`,
    `- Concern count: ${formatAutoHandoffRegressionValue(Array.isArray(governanceHealth.concerns) ? governanceHealth.concerns.length : 0, '0')}`,
    `- Recommendation count: ${formatAutoHandoffRegressionValue(Array.isArray(governanceHealth.recommendations) ? governanceHealth.recommendations.length : 0, '0')}`,
    `- Release gate available: ${governanceReleaseGate.available === true ? 'yes' : 'no'}`,
    `- Release gate latest passed: ${governanceReleaseGate.latest_gate_passed === true ? 'yes' : (governanceReleaseGate.latest_gate_passed === false ? 'no' : 'n/a')}`,
    `- Handoff quality available: ${governanceHandoffQuality.available === true ? 'yes' : 'no'}`,
    `- Handoff latest status: ${formatAutoHandoffRegressionValue(governanceHandoffQuality.latest_status)}`,
    `- Handoff latest gate passed: ${governanceHandoffQuality.latest_gate_passed === true ? 'yes' : (governanceHandoffQuality.latest_gate_passed === false ? 'no' : 'n/a')}`,
    `- Handoff latest ontology score: ${formatAutoHandoffRegressionValue(governanceHandoffQuality.latest_ontology_quality_score)}`,
    '',
    '## Recommendations'
  ];

  if (recommendations.length === 0) {
    lines.push('', '- None');
  } else {
    recommendations.forEach(item => {
      lines.push('', `- ${item}`);
    });
  }

  return `${lines.join('\n')}\n`;
}

function normalizeHandoffReleaseDate(dateCandidate) {
  const fallbackDate = new Date().toISOString().slice(0, 10);
  if (dateCandidate === undefined || dateCandidate === null || `${dateCandidate}`.trim().length === 0) {
    return fallbackDate;
  }
  const normalized = `${dateCandidate}`.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error('--release-date must be in YYYY-MM-DD format.');
  }
  const parsed = Date.parse(`${normalized}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) {
    throw new Error('--release-date must be a valid calendar date.');
  }
  return normalized;
}

function normalizeHandoffReleaseVersion(versionCandidate, fallbackVersion) {
  const fallback = typeof fallbackVersion === 'string' && fallbackVersion.trim()
    ? fallbackVersion.trim()
    : '0.0.0';
  const normalized = versionCandidate === undefined || versionCandidate === null || `${versionCandidate}`.trim().length === 0
    ? fallback
    : `${versionCandidate}`.trim();
  return normalized.startsWith('v') ? normalized : `v${normalized}`;
}

function toPortablePath(projectPath, absolutePath) {
  const relative = path.relative(projectPath, absolutePath);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/');
  }
  return absolutePath;
}

async function resolveAutoHandoffReleaseDraftContext(projectPath, options = {}) {
  let packageVersion = null;
  try {
    const packagePayload = await fs.readJson(path.join(projectPath, 'package.json'));
    if (packagePayload && typeof packagePayload.version === 'string' && packagePayload.version.trim()) {
      packageVersion = packagePayload.version.trim();
    }
  } catch (error) {
    packageVersion = null;
  }

  return {
    version: normalizeHandoffReleaseVersion(options.releaseVersion, packageVersion || '0.0.0'),
    releaseDate: normalizeHandoffReleaseDate(options.releaseDate)
  };
}

function renderAutoHandoffReleaseNotesDraft(payload = {}, context = {}) {
  const current = payload.current || {};
  const currentOverview = payload.current_overview || {};
  const gate = currentOverview.gate && typeof currentOverview.gate === 'object'
    ? currentOverview.gate
    : {};
  const gateActual = gate && gate.actual && typeof gate.actual === 'object'
    ? gate.actual
    : {};
  const releaseGatePreflight = currentOverview.release_gate_preflight && typeof currentOverview.release_gate_preflight === 'object'
    ? currentOverview.release_gate_preflight
    : {};
  const failureSummary = currentOverview.failure_summary && typeof currentOverview.failure_summary === 'object'
    ? currentOverview.failure_summary
    : {};
  const currentPolicy = currentOverview.policy && typeof currentOverview.policy === 'object'
    ? currentOverview.policy
    : {};
  const ontology = currentOverview.ontology_validation && typeof currentOverview.ontology_validation === 'object'
    ? currentOverview.ontology_validation
    : {};
  const ontologyMetrics = ontology && ontology.metrics && typeof ontology.metrics === 'object'
    ? ontology.metrics
    : {};
  const regression = currentOverview.regression && typeof currentOverview.regression === 'object'
    ? currentOverview.regression
    : {};
  const moquiBaseline = currentOverview.moqui_baseline && typeof currentOverview.moqui_baseline === 'object'
    ? currentOverview.moqui_baseline
    : {};
  const moquiSummary = moquiBaseline && moquiBaseline.summary && typeof moquiBaseline.summary === 'object'
    ? moquiBaseline.summary
    : {};
  const moquiScopeBreakdown = moquiSummary && moquiSummary.scope_breakdown && typeof moquiSummary.scope_breakdown === 'object'
    ? moquiSummary.scope_breakdown
    : {};
  const moquiGapFrequency = Array.isArray(moquiSummary && moquiSummary.gap_frequency)
    ? moquiSummary.gap_frequency
    : [];
  const moquiCompare = moquiBaseline && moquiBaseline.compare && typeof moquiBaseline.compare === 'object'
    ? moquiBaseline.compare
    : {};
  const moquiMatrixRegressions = buildAutoHandoffMoquiCoverageRegressions(moquiCompare);
  const moquiDeltas = moquiCompare && moquiCompare.deltas && typeof moquiCompare.deltas === 'object'
    ? moquiCompare.deltas
    : {};
  const moquiFailedTemplates = moquiCompare && moquiCompare.failed_templates && typeof moquiCompare.failed_templates === 'object'
    ? moquiCompare.failed_templates
    : {};
  const scenePackageBatch = currentOverview.scene_package_batch && typeof currentOverview.scene_package_batch === 'object'
    ? currentOverview.scene_package_batch
    : {};
  const scenePackageBatchSummary = scenePackageBatch && scenePackageBatch.summary && typeof scenePackageBatch.summary === 'object'
    ? scenePackageBatch.summary
    : {};
  const scenePackageBatchGate = scenePackageBatch && scenePackageBatch.batch_ontology_gate && typeof scenePackageBatch.batch_ontology_gate === 'object'
    ? scenePackageBatch.batch_ontology_gate
    : {};
  const scenePackageBatchFailures = Array.isArray(scenePackageBatchGate.failures)
    ? scenePackageBatchGate.failures
    : [];
  const capabilityCoverage = currentOverview.capability_coverage && typeof currentOverview.capability_coverage === 'object'
    ? currentOverview.capability_coverage
    : {};
  const capabilitySummary = capabilityCoverage && capabilityCoverage.summary && typeof capabilityCoverage.summary === 'object'
    ? capabilityCoverage.summary
    : {};
  const capabilityCompare = capabilityCoverage && capabilityCoverage.compare && typeof capabilityCoverage.compare === 'object'
    ? capabilityCoverage.compare
    : {};
  const capabilityGaps = Array.isArray(capabilityCoverage && capabilityCoverage.gaps)
    ? capabilityCoverage.gaps
    : [];
  const capabilityNormalization = capabilityCoverage && capabilityCoverage.normalization && typeof capabilityCoverage.normalization === 'object'
    ? capabilityCoverage.normalization
    : {};
  const capabilityWarnings = Array.isArray(capabilityCoverage && capabilityCoverage.warnings)
    ? capabilityCoverage.warnings
    : [];
  const riskLayers = payload.risk_layers && typeof payload.risk_layers === 'object'
    ? payload.risk_layers
    : {};
  const statusCounts = payload.aggregates && payload.aggregates.status_counts
    ? payload.aggregates.status_counts
    : {};
  const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : [];
  const governanceSnapshot = payload.governance_snapshot && typeof payload.governance_snapshot === 'object'
    ? payload.governance_snapshot
    : null;
  const governanceHealth = governanceSnapshot && governanceSnapshot.health &&
    typeof governanceSnapshot.health === 'object'
    ? governanceSnapshot.health
    : {};
  const governanceReleaseGate = governanceHealth.release_gate && typeof governanceHealth.release_gate === 'object'
    ? governanceHealth.release_gate
    : {};
  const governanceHandoffQuality = governanceHealth.handoff_quality && typeof governanceHealth.handoff_quality === 'object'
    ? governanceHealth.handoff_quality
    : {};
  const reviewFile = typeof context.reviewFile === 'string' && context.reviewFile.trim()
    ? context.reviewFile.trim()
    : null;
  const version = normalizeHandoffReleaseVersion(context.version, '0.0.0');
  const releaseDate = normalizeHandoffReleaseDate(context.releaseDate);

  const riskLines = ['low', 'medium', 'high', 'unknown'].map(level => {
    const scoped = riskLayers[level] && typeof riskLayers[level] === 'object'
      ? riskLayers[level]
      : {};
    return (
      `- ${level}: count=${formatAutoHandoffRegressionValue(scoped.count, '0')}, ` +
      `avg_success=${formatAutoHandoffRegressionValue(scoped.avg_spec_success_rate_percent)}, ` +
      `avg_failed_goals=${formatAutoHandoffRegressionValue(scoped.avg_failed_goals)}, ` +
      `avg_ontology_quality=${formatAutoHandoffRegressionValue(scoped.avg_ontology_quality_score)}, ` +
      `avg_moqui_matrix_regressions=${formatAutoHandoffRegressionValue(scoped.avg_moqui_matrix_regression_count, '0')}`
    );
  });

  const lines = [
    `# Release Notes Draft: ${version}`,
    '',
    `Release date: ${releaseDate}`,
    '',
    '## Handoff Evidence Summary',
    '',
    `- Evidence file: ${formatAutoHandoffRegressionValue(payload.evidence_file)}`,
    `- Current session: ${formatAutoHandoffRegressionValue(current.session_id)}`,
    `- Current status: ${formatAutoHandoffRegressionValue(current.status)}`,
    `- Gate passed: ${gate.passed === true ? 'yes' : 'no'}`,
    `- Release gate preflight available: ${releaseGatePreflight.available === true ? 'yes' : 'no'}`,
    `- Release gate preflight blocked: ${releaseGatePreflight.blocked === true ? 'yes' : 'no'}`,
    `- Release gate preflight hard-gate: ${currentPolicy.require_release_gate_preflight === true ? 'enabled' : 'advisory'}`,
    `- Release gate preflight reasons: ${Array.isArray(releaseGatePreflight.reasons) && releaseGatePreflight.reasons.length > 0 ? releaseGatePreflight.reasons.join(' | ') : 'none'}`,
    `- Release gate runtime block rate (latest/max): ${formatAutoHandoffRegressionValue(releaseGatePreflight.latest_weekly_ops_runtime_block_rate_percent)}/${formatAutoHandoffRegressionValue(releaseGatePreflight.weekly_ops_runtime_block_rate_max_percent)}%`,
    `- Release gate runtime ui-mode violations (latest/total): ${formatAutoHandoffRegressionValue(releaseGatePreflight.latest_weekly_ops_runtime_ui_mode_violation_total, '0')}/${formatAutoHandoffRegressionValue(releaseGatePreflight.weekly_ops_runtime_ui_mode_violation_total, '0')}`,
    `- Release gate runtime ui-mode violation rate (latest/run-rate/max): ${formatAutoHandoffRegressionValue(releaseGatePreflight.latest_weekly_ops_runtime_ui_mode_violation_rate_percent)}/${formatAutoHandoffRegressionValue(releaseGatePreflight.weekly_ops_runtime_ui_mode_violation_run_rate_percent)}/${formatAutoHandoffRegressionValue(releaseGatePreflight.weekly_ops_runtime_ui_mode_violation_rate_max_percent)}%`,
    `- Failure summary highlights: ${Array.isArray(failureSummary.highlights) && failureSummary.highlights.length > 0 ? failureSummary.highlights.join(' | ') : 'none'}`,
    `- Spec success rate: ${formatAutoHandoffRegressionValue(gateActual.spec_success_rate_percent)}`,
    `- Risk level: ${formatAutoHandoffRegressionValue(gateActual.risk_level)}`,
    `- Ontology quality score: ${formatAutoHandoffRegressionValue(gateActual.ontology_quality_score)}`,
    `- Ontology unmapped rules: ${formatAutoHandoffRegressionValue(gateActual.ontology_business_rule_unmapped, formatAutoHandoffRegressionValue(ontologyMetrics.business_rule_unmapped))}`,
    `- Ontology undecided decisions: ${formatAutoHandoffRegressionValue(gateActual.ontology_decision_undecided, formatAutoHandoffRegressionValue(ontologyMetrics.decision_undecided))}`,
    `- Regression trend: ${formatAutoHandoffRegressionValue(regression.trend, formatAutoHandoffRegressionValue(payload.trend))}`,
    `- Window trend: ${formatAutoHandoffRegressionValue(payload.window_trend && payload.window_trend.trend)}`,
    `- Gate pass rate (window): ${formatAutoHandoffRegressionValue(payload.aggregates && payload.aggregates.gate_pass_rate_percent)}%`,
    `- Moqui baseline portfolio passed: ${moquiSummary.portfolio_passed === true ? 'yes' : (moquiSummary.portfolio_passed === false ? 'no' : 'n/a')}`,
    `- Moqui baseline avg score: ${formatAutoHandoffRegressionValue(moquiSummary.avg_score)}`,
    `- Moqui baseline valid-rate: ${formatAutoHandoffRegressionValue(moquiSummary.valid_rate_percent)}%`,
    `- Moqui baseline failed templates: ${formatAutoHandoffRegressionValue(moquiSummary.baseline_failed)}`,
    `- Moqui matrix regression count: ${formatAutoHandoffRegressionValue(moquiMatrixRegressions.length, '0')}`,
    `- Moqui matrix regression gate (max): ${formatAutoHandoffRegressionValue(currentPolicy.max_moqui_matrix_regressions)}`,
    `- Moqui scope mix (moqui/suite/other): ${formatAutoHandoffRegressionValue(moquiScopeBreakdown.moqui_erp, '0')}/${formatAutoHandoffRegressionValue(moquiScopeBreakdown.scene_orchestration, '0')}/${formatAutoHandoffRegressionValue(moquiScopeBreakdown.other, '0')}`,
    `- Moqui entity coverage: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'entity_coverage', 'rate_percent', '%')}`,
    `- Moqui relation coverage: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'relation_coverage', 'rate_percent', '%')}`,
    `- Moqui business-rule coverage: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'business_rule_coverage', 'rate_percent', '%')}`,
    `- Moqui business-rule closed: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'business_rule_closed', 'rate_percent', '%')}`,
    `- Moqui decision coverage: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'decision_coverage', 'rate_percent', '%')}`,
    `- Moqui decision closed: ${formatAutoHandoffMoquiCoverageMetric(moquiSummary, 'decision_closed', 'rate_percent', '%')}`,
    `- Moqui baseline avg score delta: ${formatAutoHandoffRegressionValue(moquiDeltas.avg_score)}`,
    `- Moqui baseline valid-rate delta: ${formatAutoHandoffRegressionValue(moquiDeltas.valid_rate_percent)}%`,
    `- Moqui entity coverage delta: ${formatAutoHandoffMoquiCoverageDeltaMetric(moquiCompare, 'entity_coverage', 'rate_percent', '%')}`,
    `- Moqui business-rule closed delta: ${formatAutoHandoffMoquiCoverageDeltaMetric(moquiCompare, 'business_rule_closed', 'rate_percent', '%')}`,
    `- Moqui decision closed delta: ${formatAutoHandoffMoquiCoverageDeltaMetric(moquiCompare, 'decision_closed', 'rate_percent', '%')}`,
    `- Moqui matrix regressions: ${formatAutoHandoffMoquiCoverageRegressions(moquiCompare, 5)}`,
    `- Moqui newly failed templates: ${Array.isArray(moquiFailedTemplates.newly_failed) && moquiFailedTemplates.newly_failed.length > 0 ? moquiFailedTemplates.newly_failed.join(', ') : 'none'}`,
    `- Moqui top baseline gaps: ${moquiGapFrequency.length > 0 ? moquiGapFrequency.slice(0, 3).map(item => `${item.gap}:${item.count}`).join(' | ') : 'none'}`,
    `- Scene package batch status: ${formatAutoHandoffRegressionValue(scenePackageBatch.status)}`,
    `- Scene package batch selected: ${formatAutoHandoffRegressionValue(scenePackageBatchSummary.selected)}`,
    `- Scene package batch failed: ${formatAutoHandoffRegressionValue(scenePackageBatchSummary.failed)}`,
    `- Scene package batch gate passed: ${scenePackageBatchSummary.batch_gate_passed === true ? 'yes' : (scenePackageBatchSummary.batch_gate_passed === false ? 'no' : 'n/a')}`,
    `- Scene package batch gate failures: ${scenePackageBatchFailures.length > 0 ? scenePackageBatchFailures.map(item => item && item.message ? item.message : '').filter(Boolean).join(' | ') : 'none'}`,
    `- Capability coverage status: ${formatAutoHandoffRegressionValue(capabilityCoverage.status)}`,
    `- Capability coverage passed: ${capabilitySummary.passed === true ? 'yes' : (capabilitySummary.passed === false ? 'no' : 'n/a')}`,
    `- Capability coverage: ${formatAutoHandoffRegressionValue(capabilitySummary.coverage_percent)}%`,
    `- Capability min required: ${formatAutoHandoffRegressionValue(capabilitySummary.min_required_percent)}%`,
    `- Capability coverage delta: ${formatAutoHandoffRegressionValue(capabilityCompare.delta_coverage_percent)}%`,
    `- Capability newly uncovered: ${Array.isArray(capabilityCompare.newly_uncovered) && capabilityCompare.newly_uncovered.length > 0 ? capabilityCompare.newly_uncovered.join(', ') : 'none'}`,
    `- Capability lexicon version: ${formatAutoHandoffRegressionValue(capabilityNormalization.lexicon_version)}`,
    `- Capability expected alias mapped: ${formatAutoHandoffRegressionValue(Array.isArray(capabilityNormalization.expected_alias_mapped) ? capabilityNormalization.expected_alias_mapped.length : 0)}`,
    `- Capability expected deprecated alias: ${formatAutoHandoffRegressionValue(Array.isArray(capabilityNormalization.expected_deprecated_aliases) ? capabilityNormalization.expected_deprecated_aliases.length : 0)}`,
    `- Capability provided deprecated alias: ${formatAutoHandoffRegressionValue(Array.isArray(capabilityNormalization.provided_deprecated_aliases) ? capabilityNormalization.provided_deprecated_aliases.length : 0)}`,
    `- Capability gaps: ${capabilityGaps.length > 0 ? capabilityGaps.join(', ') : 'none'}`,
    `- Capability warnings: ${capabilityWarnings.length > 0 ? capabilityWarnings.join(' | ') : 'none'}`,
    '',
    '## Status Breakdown',
    '',
    `- completed: ${formatAutoHandoffRegressionValue(statusCounts.completed, '0')}`,
    `- failed: ${formatAutoHandoffRegressionValue(statusCounts.failed, '0')}`,
    `- dry_run: ${formatAutoHandoffRegressionValue(statusCounts.dry_run, '0')}`,
    `- running: ${formatAutoHandoffRegressionValue(statusCounts.running, '0')}`,
    `- other: ${formatAutoHandoffRegressionValue(statusCounts.other, '0')}`,
    '',
    '## Risk Layer Snapshot',
    '',
    ...riskLines,
    '',
    '## Governance Snapshot',
    '',
    `- Risk level: ${formatAutoHandoffRegressionValue(governanceHealth.risk_level)}`,
    `- Concern count: ${formatAutoHandoffRegressionValue(Array.isArray(governanceHealth.concerns) ? governanceHealth.concerns.length : 0, '0')}`,
    `- Recommendation count: ${formatAutoHandoffRegressionValue(Array.isArray(governanceHealth.recommendations) ? governanceHealth.recommendations.length : 0, '0')}`,
    `- Release gate available: ${governanceReleaseGate.available === true ? 'yes' : 'no'}`,
    `- Release gate latest passed: ${governanceReleaseGate.latest_gate_passed === true ? 'yes' : (governanceReleaseGate.latest_gate_passed === false ? 'no' : 'n/a')}`,
    `- Handoff quality available: ${governanceHandoffQuality.available === true ? 'yes' : 'no'}`,
    `- Handoff latest status: ${formatAutoHandoffRegressionValue(governanceHandoffQuality.latest_status)}`,
    `- Handoff latest gate passed: ${governanceHandoffQuality.latest_gate_passed === true ? 'yes' : (governanceHandoffQuality.latest_gate_passed === false ? 'no' : 'n/a')}`,
    `- Handoff latest ontology score: ${formatAutoHandoffRegressionValue(governanceHandoffQuality.latest_ontology_quality_score)}`,
    '',
    '## Release Evidence Artifacts',
    '',
    `- Evidence review report: ${reviewFile || 'n/a'}`,
    `- Handoff report: ${formatAutoHandoffRegressionValue(currentOverview.handoff_report_file)}`,
    `- Release evidence JSON: ${formatAutoHandoffRegressionValue(payload.evidence_file)}`,
    `- Moqui baseline JSON: ${formatAutoHandoffRegressionValue(moquiBaseline.output && moquiBaseline.output.json)}`,
    `- Moqui baseline markdown: ${formatAutoHandoffRegressionValue(moquiBaseline.output && moquiBaseline.output.markdown)}`,
    `- Scene package batch JSON: ${formatAutoHandoffRegressionValue(scenePackageBatch.output && scenePackageBatch.output.json)}`,
    `- Capability coverage JSON: ${formatAutoHandoffRegressionValue(capabilityCoverage.output && capabilityCoverage.output.json)}`,
    `- Capability coverage markdown: ${formatAutoHandoffRegressionValue(capabilityCoverage.output && capabilityCoverage.output.markdown)}`,
    `- Governance snapshot generated at: ${formatAutoHandoffRegressionValue(governanceSnapshot && governanceSnapshot.generated_at)}`,
    '',
    '## Recommendations'
  ];

  if (recommendations.length === 0) {
    lines.push('', '- None');
  } else {
    recommendations.forEach(item => {
      lines.push('', `- ${item}`);
    });
  }

  return `${lines.join('\n')}\n`;
}

async function buildAutoHandoffEvidenceReviewReport(projectPath, options = {}) {
  const releaseEvidence = await loadAutoHandoffReleaseEvidence(projectPath, options.file);
  if (releaseEvidence.sessions.length === 0) {
    throw new Error(`no release evidence sessions found: ${releaseEvidence.file}`);
  }

  const query = normalizeHandoffSessionQuery(options.sessionId);
  const windowSize = normalizeHandoffEvidenceWindow(options.window);
  let currentIndex = 0;
  if (query !== 'latest') {
    currentIndex = releaseEvidence.sessions.findIndex(item => normalizeHandoffText(item.session_id) === query);
    if (currentIndex < 0) {
      throw new Error(`release evidence session not found: ${query}`);
    }
  }

  const selectedEntries = releaseEvidence.sessions.slice(currentIndex, currentIndex + windowSize);
  const series = selectedEntries.map(item => buildAutoHandoffEvidenceSnapshot(item));
  const currentSnapshot = series[0];
  const previousSnapshot = series[1] || null;
  const comparison = previousSnapshot
    ? buildAutoHandoffRegressionComparison(currentSnapshot, previousSnapshot)
    : {
      trend: 'baseline',
      delta: {
        spec_success_rate_percent: null,
        risk_level_rank: null,
        failed_goals: null,
        elapsed_ms: null,
        ontology_quality_score: null,
        ontology_unmapped_rules: null,
        ontology_undecided_decisions: null,
        ontology_business_rule_pass_rate_percent: null,
        ontology_decision_resolved_rate_percent: null,
        scene_package_batch_failure_count: null
      }
    };
  const windowTrend = buildAutoHandoffRegressionWindowTrend(series);
  const aggregates = buildAutoHandoffRegressionAggregates(series);
  const riskLayers = buildAutoHandoffRegressionRiskLayers(series);
  const statusCounts = buildAutoHandoffEvidenceStatusCounts(selectedEntries);
  const gatePassCount = selectedEntries.filter(item => item && item.gate && item.gate.passed === true).length;
  const gatePassRate = selectedEntries.length > 0
    ? Number(((gatePassCount / selectedEntries.length) * 100).toFixed(2))
    : null;
  let governanceSnapshot = null;
  try {
    const governanceStats = await buildAutoGovernanceStats(projectPath, {});
    governanceSnapshot = {
      mode: governanceStats && governanceStats.mode ? governanceStats.mode : 'auto-governance-stats',
      generated_at: governanceStats && governanceStats.generated_at ? governanceStats.generated_at : new Date().toISOString(),
      criteria: governanceStats && governanceStats.criteria ? governanceStats.criteria : null,
      totals: governanceStats && governanceStats.totals ? governanceStats.totals : null,
      health: governanceStats && governanceStats.health ? governanceStats.health : null
    };
  } catch (error) {
    governanceSnapshot = {
      mode: 'auto-governance-stats',
      generated_at: new Date().toISOString(),
      error: error.message
    };
  }

  const payload = {
    mode: 'auto-handoff-evidence-review',
    generated_at: new Date().toISOString(),
    evidence_file: releaseEvidence.file,
    release_evidence_updated_at: normalizeHandoffText(releaseEvidence.payload.updated_at),
    session_query: query,
    current: currentSnapshot,
    current_overview: selectedEntries[0] || null,
    previous: previousSnapshot,
    trend: comparison.trend,
    delta: comparison.delta,
    window: {
      requested: windowSize,
      actual: series.length
    },
    series,
    window_trend: windowTrend,
    aggregates: {
      ...aggregates,
      status_counts: statusCounts,
      gate_pass_rate_percent: gatePassRate
    },
    risk_layers: riskLayers,
    governance_snapshot: governanceSnapshot,
    recommendations: []
  };
  payload.recommendations = buildAutoHandoffRegressionRecommendations(payload);
  return payload;
}

async function buildAutoHandoffRegression(projectPath, currentResult) {
  const reports = await listAutoHandoffRunReports(projectPath);
  const previous = reports.find(item => item.session_id !== currentResult.session_id) || null;
  const currentSnapshot = buildAutoHandoffRegressionSnapshot(currentResult);
  if (!previous) {
    return {
      mode: 'auto-handoff-regression',
      current: currentSnapshot,
      previous: null,
      trend: 'baseline',
      delta: {
        spec_success_rate_percent: null,
        risk_level_rank: null,
        failed_goals: null,
        elapsed_ms: null,
        ontology_quality_score: null,
        ontology_unmapped_rules: null,
        ontology_undecided_decisions: null,
        ontology_business_rule_pass_rate_percent: null,
        ontology_decision_resolved_rate_percent: null,
        scene_package_batch_failure_count: null
      }
    };
  }

  const previousSnapshot = buildAutoHandoffRegressionSnapshot(previous);
  const comparison = buildAutoHandoffRegressionComparison(currentSnapshot, previousSnapshot);
  return {
    mode: 'auto-handoff-regression',
    current: currentSnapshot,
    previous: previousSnapshot,
    trend: comparison.trend,
    delta: comparison.delta
  };
}

async function buildAutoHandoffRegressionReport(projectPath, options = {}) {
  const reports = await listAutoHandoffRunReports(projectPath);
  if (reports.length === 0) {
    throw new Error('no handoff run reports found');
  }
  const query = normalizeHandoffSessionQuery(options.sessionId);
  const windowSize = normalizeHandoffRegressionWindow(options.window);
  let currentIndex = 0;
  if (query !== 'latest') {
    currentIndex = reports.findIndex(item => item.session_id === query);
    if (currentIndex < 0) {
      throw new Error(`handoff run session not found: ${query}`);
    }
  }

  const chainReports = reports.slice(currentIndex, currentIndex + windowSize);
  const series = chainReports.map(item => buildAutoHandoffRegressionSnapshot(item));
  const currentSnapshot = series[0];
  const previousSnapshot = series[1] || null;
  const comparison = previousSnapshot
    ? buildAutoHandoffRegressionComparison(currentSnapshot, previousSnapshot)
    : {
      trend: 'baseline',
      delta: {
        spec_success_rate_percent: null,
        risk_level_rank: null,
        failed_goals: null,
        elapsed_ms: null,
        ontology_quality_score: null,
        ontology_unmapped_rules: null,
        ontology_undecided_decisions: null,
        ontology_business_rule_pass_rate_percent: null,
        ontology_decision_resolved_rate_percent: null,
        scene_package_batch_failure_count: null
      }
    };
  const windowTrend = buildAutoHandoffRegressionWindowTrend(series);
  const aggregates = buildAutoHandoffRegressionAggregates(series);
  const riskLayers = buildAutoHandoffRegressionRiskLayers(series);

  const payload = {
    mode: 'auto-handoff-regression',
    current: currentSnapshot,
    previous: previousSnapshot,
    trend: comparison.trend,
    delta: comparison.delta,
    window: {
      requested: windowSize,
      actual: series.length
    },
    series,
    window_trend: windowTrend,
    aggregates,
    risk_layers: riskLayers,
    recommendations: []
  };
  payload.recommendations = buildAutoHandoffRegressionRecommendations(payload);
  return payload;
}

function normalizeHandoffMinSpecSuccessRate(rateCandidate) {
  if (rateCandidate === undefined || rateCandidate === null) {
    return 100;
  }
  const parsed = Number(rateCandidate);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error('--min-spec-success-rate must be a number between 0 and 100.');
  }
  return Number(parsed.toFixed(2));
}

function normalizeHandoffRiskLevel(levelCandidate) {
  const normalized = typeof levelCandidate === 'string'
    ? levelCandidate.trim().toLowerCase()
    : 'high';
  if (!['low', 'medium', 'high'].includes(normalized)) {
    throw new Error('--max-risk-level must be one of: low, medium, high.');
  }
  return normalized;
}

function normalizeHandoffMinOntologyScore(scoreCandidate) {
  if (scoreCandidate === undefined || scoreCandidate === null) {
    return 0;
  }
  const parsed = Number(scoreCandidate);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error('--min-ontology-score must be a number between 0 and 100.');
  }
  return Number(parsed.toFixed(2));
}

function normalizeHandoffMinCapabilityCoverage(coverageCandidate) {
  if (coverageCandidate === undefined || coverageCandidate === null) {
    return 100;
  }
  const parsed = Number(coverageCandidate);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error('--min-capability-coverage must be a number between 0 and 100.');
  }
  return Number(parsed.toFixed(2));
}

function normalizeHandoffMinCapabilitySemantic(semanticCandidate) {
  if (semanticCandidate === undefined || semanticCandidate === null) {
    return 100;
  }
  const parsed = Number(semanticCandidate);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error('--min-capability-semantic must be a number between 0 and 100.');
  }
  return Number(parsed.toFixed(2));
}

function normalizeHandoffMaxMoquiMatrixRegressions(valueCandidate) {
  if (valueCandidate === undefined || valueCandidate === null || valueCandidate === '') {
    return 0;
  }
  const parsed = Number(valueCandidate);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('--max-moqui-matrix-regressions must be an integer >= 0.');
  }
  return parsed;
}

function normalizeHandoffOptionalNonNegativeInteger(valueCandidate, optionName) {
  if (valueCandidate === undefined || valueCandidate === null || valueCandidate === '') {
    return null;
  }
  const parsed = Number(valueCandidate);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${optionName} must be an integer >= 0.`);
  }
  return parsed;
}

function normalizeHandoffReleaseEvidenceWindow(windowCandidate) {
  if (windowCandidate === undefined || windowCandidate === null || windowCandidate === '') {
    return 5;
  }
  const parsed = Number(windowCandidate);
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 50) {
    throw new Error('--release-evidence-window must be an integer between 2 and 50.');
  }
  return parsed;
}

function normalizeAutoHandoffPolicyProfile(profileCandidate, optionName = '--profile') {
  const normalized = typeof profileCandidate === 'string'
    ? profileCandidate.trim().toLowerCase()
    : 'default';
  if (!normalized) {
    return 'default';
  }
  if (!AUTO_HANDOFF_POLICY_PROFILE_PRESETS[normalized]) {
    const allowed = Object.keys(AUTO_HANDOFF_POLICY_PROFILE_PRESETS).join(', ');
    throw new Error(`${optionName} must be one of: ${allowed}.`);
  }
  return normalized;
}

function resolveAutoHandoffPolicyPreset(profileCandidate, optionName) {
  const profile = normalizeAutoHandoffPolicyProfile(profileCandidate, optionName);
  const preset = AUTO_HANDOFF_POLICY_PROFILE_PRESETS[profile];
  return {
    profile,
    preset: {
      ...preset
    }
  };
}

function resolveAutoHandoffPolicyOptionNumber(valueCandidate, fallbackValue) {
  if (valueCandidate === undefined || valueCandidate === null || valueCandidate === '') {
    return fallbackValue;
  }
  return valueCandidate;
}

function resolveAutoHandoffPolicyOptionBoolean(valueCandidate, fallbackValue) {
  if (valueCandidate === undefined || valueCandidate === null) {
    return fallbackValue === true;
  }
  return valueCandidate === true;
}

function buildAutoHandoffRunPolicy(options = {}) {
  const { profile, preset } = resolveAutoHandoffPolicyPreset(options.profile, '--profile');
  return {
    profile,
    min_spec_success_rate: normalizeHandoffMinSpecSuccessRate(
      resolveAutoHandoffPolicyOptionNumber(options.minSpecSuccessRate, preset.min_spec_success_rate)
    ),
    max_risk_level: normalizeHandoffRiskLevel(
      resolveAutoHandoffPolicyOptionNumber(options.maxRiskLevel, preset.max_risk_level)
    ),
    min_ontology_score: normalizeHandoffMinOntologyScore(
      resolveAutoHandoffPolicyOptionNumber(options.minOntologyScore, preset.min_ontology_score)
    ),
    min_capability_coverage_percent: normalizeHandoffMinCapabilityCoverage(
      resolveAutoHandoffPolicyOptionNumber(
        options.minCapabilityCoverage,
        preset.min_capability_coverage_percent
      )
    ),
    max_moqui_matrix_regressions: normalizeHandoffMaxMoquiMatrixRegressions(
      resolveAutoHandoffPolicyOptionNumber(
        options.maxMoquiMatrixRegressions,
        preset.max_moqui_matrix_regressions
      )
    ),
    max_unmapped_rules: normalizeHandoffOptionalNonNegativeInteger(
      resolveAutoHandoffPolicyOptionNumber(options.maxUnmappedRules, preset.max_unmapped_rules),
      '--max-unmapped-rules'
    ),
    max_undecided_decisions: normalizeHandoffOptionalNonNegativeInteger(
      resolveAutoHandoffPolicyOptionNumber(options.maxUndecidedDecisions, preset.max_undecided_decisions),
      '--max-undecided-decisions'
    ),
    require_ontology_validation: resolveAutoHandoffPolicyOptionBoolean(
      options.requireOntologyValidation,
      preset.require_ontology_validation
    ),
    require_moqui_baseline: resolveAutoHandoffPolicyOptionBoolean(
      options.requireMoquiBaseline,
      preset.require_moqui_baseline
    ),
    require_scene_package_batch: resolveAutoHandoffPolicyOptionBoolean(
      options.requireScenePackageBatch,
      preset.require_scene_package_batch
    ),
    require_capability_coverage: resolveAutoHandoffPolicyOptionBoolean(
      options.requireCapabilityCoverage,
      preset.require_capability_coverage
    ),
    require_capability_lexicon: resolveAutoHandoffPolicyOptionBoolean(
      options.requireCapabilityLexicon,
      preset.require_capability_lexicon
    ),
    require_release_gate_preflight: resolveAutoHandoffPolicyOptionBoolean(
      options.requireReleaseGatePreflight,
      preset.require_release_gate_preflight
    ),
    dependency_batching: resolveAutoHandoffPolicyOptionBoolean(
      options.dependencyBatching,
      preset.dependency_batching
    ),
    release_evidence_window: normalizeHandoffReleaseEvidenceWindow(
      resolveAutoHandoffPolicyOptionNumber(options.releaseEvidenceWindow, preset.release_evidence_window)
    )
  };
}

function buildAutoHandoffCapabilityMatrixPolicy(options = {}) {
  const { profile, preset } = resolveAutoHandoffPolicyPreset(options.profile, '--profile');
  return {
    profile,
    min_capability_coverage_percent: normalizeHandoffMinCapabilityCoverage(
      resolveAutoHandoffPolicyOptionNumber(
        options.minCapabilityCoverage,
        preset.min_capability_coverage_percent
      )
    ),
    min_capability_semantic_percent: normalizeHandoffMinCapabilitySemantic(
      resolveAutoHandoffPolicyOptionNumber(
        options.minCapabilitySemantic,
        preset.min_capability_semantic_percent
      )
    ),
    require_capability_coverage: resolveAutoHandoffPolicyOptionBoolean(
      options.requireCapabilityCoverage,
      preset.require_capability_coverage
    ),
    require_capability_semantic: resolveAutoHandoffPolicyOptionBoolean(
      options.requireCapabilitySemantic,
      preset.require_capability_semantic
    ),
    require_capability_lexicon: resolveAutoHandoffPolicyOptionBoolean(
      options.requireCapabilityLexicon,
      preset.require_capability_lexicon
    ),
    require_moqui_baseline: resolveAutoHandoffPolicyOptionBoolean(
      options.requireMoquiBaseline,
      preset.require_moqui_baseline
    )
  };
}

function evaluateHandoffOntologyValidation(ontologyValidation) {
  const payload = ontologyValidation && typeof ontologyValidation === 'object'
    ? ontologyValidation
    : null;
  const statusText = normalizeHandoffText(
    readHandoffPathValue(payload, 'status')
      || readHandoffPathValue(payload, 'result')
      || readHandoffPathValue(payload, 'state')
  );
  const statusToken = statusText ? statusText.toLowerCase() : null;
  const boolSignals = [
    readHandoffPathValue(payload, 'passed'),
    readHandoffPathValue(payload, 'valid'),
    readHandoffPathValue(payload, 'success')
  ];
  let passed = false;
  if (boolSignals.some(value => value === true)) {
    passed = true;
  } else if (statusToken && ['passed', 'success', 'ok', 'valid', 'completed', 'complete'].includes(statusToken)) {
    passed = true;
  }

  const model = normalizeHandoffOntologyModel(payload);
  const entityCount = normalizeHandoffNumber(
    readHandoffFirstPathValue(payload, [
      'coverage.entities.total',
      'metrics.entities.total',
      'entities.total',
      'entity_count'
    ]),
    { min: 0, integer: true }
  );
  const relationCount = normalizeHandoffNumber(
    readHandoffFirstPathValue(payload, [
      'coverage.relations.total',
      'metrics.relations.total',
      'relations.total',
      'relation_count'
    ]),
    { min: 0, integer: true }
  );
  const ruleTotal = normalizeHandoffNumber(
    readHandoffFirstPathValue(payload, [
      'business_rules.total',
      'rules.total',
      'coverage.business_rules.total',
      'metrics.business_rules.total',
      'rule_count'
    ]),
    { min: 0, integer: true }
  );
  const mappedRules = normalizeHandoffNumber(
    readHandoffFirstPathValue(payload, [
      'business_rules.mapped',
      'rules.mapped',
      'coverage.business_rules.mapped',
      'metrics.business_rules.mapped'
    ]),
    { min: 0, integer: true }
  );
  const passedRules = normalizeHandoffNumber(
    readHandoffFirstPathValue(payload, [
      'business_rules.passed',
      'rules.passed',
      'coverage.business_rules.passed',
      'metrics.business_rules.passed'
    ]),
    { min: 0, integer: true }
  );
  const failedRules = normalizeHandoffNumber(
    readHandoffFirstPathValue(payload, [
      'business_rules.failed',
      'rules.failed',
      'coverage.business_rules.failed',
      'metrics.business_rules.failed'
    ]),
    { min: 0, integer: true }
  );
  const decisionTotal = normalizeHandoffNumber(
    readHandoffFirstPathValue(payload, [
      'decision_logic.total',
      'decisions.total',
      'coverage.decision_logic.total',
      'metrics.decision_logic.total',
      'decision_count'
    ]),
    { min: 0, integer: true }
  );
  const resolvedDecisions = normalizeHandoffNumber(
    readHandoffFirstPathValue(payload, [
      'decision_logic.resolved',
      'decisions.resolved',
      'coverage.decision_logic.resolved',
      'metrics.decision_logic.resolved'
    ]),
    { min: 0, integer: true }
  );
  const pendingDecisions = normalizeHandoffNumber(
    readHandoffFirstPathValue(payload, [
      'decision_logic.pending',
      'decisions.pending',
      'coverage.decision_logic.pending',
      'metrics.decision_logic.pending'
    ]),
    { min: 0, integer: true }
  );
  const automatedDecisions = normalizeHandoffNumber(
    readHandoffFirstPathValue(payload, [
      'decision_logic.automated',
      'decisions.automated',
      'decision_logic.tested',
      'decisions.tested',
      'coverage.decision_logic.automated',
      'metrics.decision_logic.automated'
    ]),
    { min: 0, integer: true }
  );

  const resolvedEntityCount = entityCount !== null ? entityCount : model.entities.length;
  const resolvedRelationCount = relationCount !== null ? relationCount : model.relations.length;
  const resolvedRuleTotal = ruleTotal !== null ? ruleTotal : model.business_rules.length;
  const resolvedRuleMapped = mappedRules !== null
    ? mappedRules
    : model.business_rules.filter(item => item.mapped).length;
  const resolvedRulePassed = passedRules !== null
    ? passedRules
    : model.business_rules.filter(item => item.passed).length;
  const resolvedRuleFailed = failedRules !== null
    ? failedRules
    : (resolvedRuleTotal !== null && resolvedRulePassed !== null
      ? Math.max(0, resolvedRuleTotal - resolvedRulePassed)
      : null);
  const resolvedDecisionTotal = decisionTotal !== null ? decisionTotal : model.decision_logic.length;
  const resolvedDecisionResolved = resolvedDecisions !== null
    ? resolvedDecisions
    : model.decision_logic.filter(item => item.resolved).length;
  const resolvedDecisionPending = pendingDecisions !== null
    ? pendingDecisions
    : (resolvedDecisionTotal !== null && resolvedDecisionResolved !== null
      ? Math.max(0, resolvedDecisionTotal - resolvedDecisionResolved)
      : null);
  const resolvedDecisionAutomated = automatedDecisions !== null
    ? automatedDecisions
    : model.decision_logic.filter(item => item.automated).length;

  const unmappedRules = (
    Number.isFinite(resolvedRuleTotal) && Number.isFinite(resolvedRuleMapped)
  )
    ? Math.max(0, resolvedRuleTotal - resolvedRuleMapped)
    : null;
  const undecidedDecisions = Number.isFinite(resolvedDecisionPending)
    ? resolvedDecisionPending
    : (
      Number.isFinite(resolvedDecisionTotal) && Number.isFinite(resolvedDecisionResolved)
        ? Math.max(0, resolvedDecisionTotal - resolvedDecisionResolved)
        : null
    );

  const ruleMappingRate = Number.isFinite(resolvedRuleTotal) && resolvedRuleTotal > 0 && Number.isFinite(resolvedRuleMapped)
    ? Number(((resolvedRuleMapped / resolvedRuleTotal) * 100).toFixed(2))
    : null;
  const rulePassRate = Number.isFinite(resolvedRuleTotal) && resolvedRuleTotal > 0 && Number.isFinite(resolvedRulePassed)
    ? Number(((resolvedRulePassed / resolvedRuleTotal) * 100).toFixed(2))
    : null;
  const decisionResolvedRate = Number.isFinite(resolvedDecisionTotal) && resolvedDecisionTotal > 0 && Number.isFinite(resolvedDecisionResolved)
    ? Number(((resolvedDecisionResolved / resolvedDecisionTotal) * 100).toFixed(2))
    : null;

  const qualityScoreFromManifest = normalizeHandoffNumber(
    readHandoffFirstPathValue(payload, [
      'quality.score',
      'quality_score',
      'metrics.quality_score',
      'score'
    ]),
    { min: 0, max: 100, precision: 2 }
  );

  let qualityScore = qualityScoreFromManifest;
  let qualityScoreSource = qualityScoreFromManifest === null ? 'derived' : 'manifest';
  const qualityComponents = {
    structure: 0,
    business_rules: 0,
    decision_logic: 0
  };
  if (qualityScore === null) {
    qualityComponents.structure = (
      (Number.isFinite(resolvedEntityCount) && resolvedEntityCount > 0 ? 20 : 0) +
      (Number.isFinite(resolvedRelationCount) && resolvedRelationCount > 0 ? 20 : 0)
    );
    qualityComponents.business_rules = Number.isFinite(ruleMappingRate)
      ? Number((30 * (ruleMappingRate / 100)).toFixed(2))
      : 15;
    qualityComponents.decision_logic = Number.isFinite(decisionResolvedRate)
      ? Number((30 * (decisionResolvedRate / 100)).toFixed(2))
      : 15;
    qualityScore = Number((
      qualityComponents.structure +
      qualityComponents.business_rules +
      qualityComponents.decision_logic
    ).toFixed(2));
  } else {
    qualityScoreSource = 'manifest';
  }

  return {
    present: Boolean(payload),
    passed,
    status: statusText || null,
    quality_score: qualityScore,
    quality_score_source: qualityScoreSource,
    quality_components: qualityComponents,
    model: {
      entity_relation: {
        entities: resolvedEntityCount,
        relations: resolvedRelationCount
      },
      business_rules: {
        total: resolvedRuleTotal,
        mapped: resolvedRuleMapped,
        passed: resolvedRulePassed,
        failed: resolvedRuleFailed,
        unmapped: unmappedRules
      },
      decision_logic: {
        total: resolvedDecisionTotal,
        resolved: resolvedDecisionResolved,
        pending: resolvedDecisionPending,
        automated: resolvedDecisionAutomated,
        undecided: undecidedDecisions
      }
    },
    metrics: {
      entity_count: resolvedEntityCount,
      relation_count: resolvedRelationCount,
      business_rule_total: resolvedRuleTotal,
      business_rule_mapped: resolvedRuleMapped,
      business_rule_passed: resolvedRulePassed,
      business_rule_failed: resolvedRuleFailed,
      business_rule_unmapped: unmappedRules,
      business_rule_mapping_rate_percent: ruleMappingRate,
      business_rule_pass_rate_percent: rulePassRate,
      decision_total: resolvedDecisionTotal,
      decision_resolved: resolvedDecisionResolved,
      decision_pending: resolvedDecisionPending,
      decision_automated: resolvedDecisionAutomated,
      decision_undecided: undecidedDecisions,
      decision_resolved_rate_percent: decisionResolvedRate
    },
    payload
  };
}

function evaluateAutoHandoffOntologyGateReasons(policy = {}, ontology = {}) {
  const reasons = [];
  if (policy.require_ontology_validation && !ontology.passed) {
    if (!ontology.present) {
      reasons.push('manifest ontology_validation is missing');
    } else {
      reasons.push(`manifest ontology_validation status is not passed (${ontology.status || 'unknown'})`);
    }
  }

  const scoreThreshold = Number(policy.min_ontology_score);
  if (Number.isFinite(scoreThreshold) && scoreThreshold > 0) {
    const qualityScore = Number(ontology.quality_score);
    if (!Number.isFinite(qualityScore)) {
      reasons.push('ontology_quality_score unavailable');
    } else if (qualityScore < scoreThreshold) {
      reasons.push(`ontology_quality_score ${qualityScore} < required ${scoreThreshold}`);
    }
  }

  if (Number.isInteger(policy.max_unmapped_rules)) {
    const unmapped = Number(
      ontology && ontology.metrics ? ontology.metrics.business_rule_unmapped : null
    );
    if (!Number.isFinite(unmapped)) {
      reasons.push('ontology business_rule_unmapped unavailable');
    } else if (unmapped > policy.max_unmapped_rules) {
      reasons.push(`ontology business_rule_unmapped ${unmapped} > allowed ${policy.max_unmapped_rules}`);
    }
  }

  if (Number.isInteger(policy.max_undecided_decisions)) {
    const undecided = Number(
      ontology && ontology.metrics ? ontology.metrics.decision_undecided : null
    );
    if (!Number.isFinite(undecided)) {
      reasons.push('ontology decision_undecided unavailable');
    } else if (undecided > policy.max_undecided_decisions) {
      reasons.push(`ontology decision_undecided ${undecided} > allowed ${policy.max_undecided_decisions}`);
    }
  }

  return reasons;
}

function evaluateAutoHandoffMoquiBaselineGateReasons(policy = {}, moquiBaseline = null) {
  const reasons = [];
  if (policy.require_moqui_baseline !== true) {
    return reasons;
  }

  const baseline = moquiBaseline && typeof moquiBaseline === 'object'
    ? moquiBaseline
    : null;
  const summary = baseline && baseline.summary && typeof baseline.summary === 'object'
    ? baseline.summary
    : {};
  const compare = baseline && baseline.compare && typeof baseline.compare === 'object'
    ? baseline.compare
    : {};
  const matrixRegressions = buildAutoHandoffMoquiCoverageRegressions(compare);
  const status = `${baseline && baseline.status ? baseline.status : 'missing'}`.trim().toLowerCase();
  if (!baseline || baseline.generated !== true) {
    const reason = baseline && baseline.reason ? baseline.reason : 'moqui baseline snapshot missing';
    reasons.push(`moqui baseline unavailable: ${reason}`);
    return reasons;
  }
  if (status === 'error') {
    reasons.push(`moqui baseline errored: ${baseline.error || 'unknown error'}`);
    return reasons;
  }
  if (summary.portfolio_passed !== true) {
    const avgScore = Number(summary.avg_score);
    const validRate = Number(summary.valid_rate_percent);
    reasons.push(
      `moqui baseline portfolio not passed (avg_score=${Number.isFinite(avgScore) ? avgScore : 'n/a'}, ` +
      `valid_rate=${Number.isFinite(validRate) ? `${validRate}%` : 'n/a'})`
    );
  }
  if (Number.isInteger(policy.max_moqui_matrix_regressions)) {
    const limit = Number(policy.max_moqui_matrix_regressions);
    if (matrixRegressions.length > limit) {
      reasons.push(
        `moqui baseline matrix regressions ${matrixRegressions.length} > allowed ${limit} ` +
        `(${matrixRegressions.slice(0, 3).map(item => `${item.label}:${item.delta_rate_percent}%`).join(' | ')})`
      );
    }
  }
  return reasons;
}

function evaluateAutoHandoffScenePackageBatchGateReasons(policy = {}, scenePackageBatch = null) {
  const reasons = [];
  if (policy.require_scene_package_batch !== true) {
    return reasons;
  }

  const batch = scenePackageBatch && typeof scenePackageBatch === 'object'
    ? scenePackageBatch
    : null;
  if (!batch) {
    reasons.push('scene package publish-batch dry-run snapshot missing');
    return reasons;
  }
  if (batch.status === 'skipped') {
    return reasons;
  }
  if (batch.status === 'error') {
    reasons.push(`scene package publish-batch dry-run errored: ${batch.error || 'unknown error'}`);
    return reasons;
  }
  if (batch.status !== 'passed') {
    const summary = batch.summary && typeof batch.summary === 'object' ? batch.summary : {};
    const selected = Number(summary.selected);
    const failed = Number(summary.failed);
    const batchGatePassed = summary.batch_gate_passed === true;
    reasons.push(
      `scene package publish-batch dry-run failed (selected=${Number.isFinite(selected) ? selected : 'n/a'}, ` +
      `failed=${Number.isFinite(failed) ? failed : 'n/a'}, batch_gate=${batchGatePassed ? 'pass' : 'fail'})`
    );
  }
  return reasons;
}

function evaluateAutoHandoffCapabilityCoverageGateReasons(policy = {}, capabilityCoverage = null) {
  const reasons = [];
  if (policy.require_capability_coverage !== true) {
    return reasons;
  }

  const coverage = capabilityCoverage && typeof capabilityCoverage === 'object'
    ? capabilityCoverage
    : null;
  if (!coverage) {
    reasons.push('capability coverage snapshot missing');
    return reasons;
  }
  if (coverage.status === 'error') {
    reasons.push(`capability coverage errored: ${coverage.error || 'unknown error'}`);
    return reasons;
  }
  if (coverage.status === 'skipped') {
    const totalCapabilities = Number(
      coverage &&
      coverage.summary &&
      coverage.summary.total_capabilities !== undefined
        ? coverage.summary.total_capabilities
        : 0
    );
    if (Number.isFinite(totalCapabilities) && totalCapabilities <= 0) {
      return reasons;
    }
    reasons.push(`capability coverage skipped: ${coverage.reason || 'unknown reason'}`);
    return reasons;
  }

  const summary = coverage.summary && typeof coverage.summary === 'object'
    ? coverage.summary
    : {};
  const coveragePercent = Number(summary.coverage_percent);
  const minCoverage = Number(policy.min_capability_coverage_percent);
  if (!Number.isFinite(coveragePercent)) {
    reasons.push('capability_coverage_percent unavailable');
  } else if (Number.isFinite(minCoverage) && coveragePercent < minCoverage) {
    reasons.push(`capability_coverage_percent ${coveragePercent} < required ${minCoverage}`);
  }
  return reasons;
}

function evaluateAutoHandoffCapabilityLexiconGateReasons(policy = {}, capabilityCoverage = null) {
  const reasons = [];
  if (policy.require_capability_lexicon !== true) {
    return reasons;
  }

  const coverage = capabilityCoverage && typeof capabilityCoverage === 'object'
    ? capabilityCoverage
    : null;
  if (!coverage) {
    reasons.push('capability lexicon snapshot missing');
    return reasons;
  }
  if (coverage.status === 'error') {
    reasons.push(`capability lexicon errored: ${coverage.error || 'unknown error'}`);
    return reasons;
  }
  if (coverage.status === 'skipped') {
    const totalCapabilities = Number(
      coverage &&
      coverage.summary &&
      coverage.summary.total_capabilities !== undefined
        ? coverage.summary.total_capabilities
        : 0
    );
    if (Number.isFinite(totalCapabilities) && totalCapabilities <= 0) {
      return reasons;
    }
    reasons.push(`capability lexicon skipped: ${coverage.reason || 'unknown reason'}`);
    return reasons;
  }

  const normalization = coverage.normalization && typeof coverage.normalization === 'object'
    ? coverage.normalization
    : {};
  const expectedUnknownCount = Array.isArray(normalization.expected_unknown)
    ? normalization.expected_unknown.length
    : 0;
  const providedUnknownCount = Array.isArray(normalization.provided_unknown)
    ? normalization.provided_unknown.length
    : 0;
  if (expectedUnknownCount > 0) {
    reasons.push(`capability_lexicon_expected_unknown_count ${expectedUnknownCount} > allowed 0`);
  }
  if (providedUnknownCount > 0) {
    reasons.push(`capability_lexicon_provided_unknown_count ${providedUnknownCount} > allowed 0`);
  }

  return reasons;
}

function evaluateAutoHandoffCapabilitySemanticGateReasons(policy = {}, capabilityCoverage = null) {
  const reasons = [];
  if (policy.require_capability_semantic !== true) {
    return reasons;
  }

  const coverage = capabilityCoverage && typeof capabilityCoverage === 'object'
    ? capabilityCoverage
    : null;
  if (!coverage) {
    reasons.push('capability semantic snapshot missing');
    return reasons;
  }
  if (coverage.status === 'error') {
    reasons.push(`capability semantic errored: ${coverage.error || 'unknown error'}`);
    return reasons;
  }
  if (coverage.status === 'skipped') {
    const totalCapabilities = Number(
      coverage &&
      coverage.summary &&
      coverage.summary.total_capabilities !== undefined
        ? coverage.summary.total_capabilities
        : 0
    );
    if (Number.isFinite(totalCapabilities) && totalCapabilities <= 0) {
      return reasons;
    }
    reasons.push(`capability semantic skipped: ${coverage.reason || 'unknown reason'}`);
    return reasons;
  }

  const summary = coverage.summary && typeof coverage.summary === 'object'
    ? coverage.summary
    : {};
  const semanticPercent = Number(summary.semantic_complete_percent);
  const minSemantic = Number(policy.min_capability_semantic_percent);
  if (!Number.isFinite(semanticPercent)) {
    reasons.push('capability_semantic_percent unavailable');
  } else if (Number.isFinite(minSemantic) && semanticPercent < minSemantic) {
    reasons.push(`capability_semantic_percent ${semanticPercent} < required ${minSemantic}`);
  }
  return reasons;
}

function evaluateAutoHandoffReleaseGatePreflightGateReasons(policy = {}, preflight = null) {
  const reasons = [];
  if (policy.require_release_gate_preflight !== true) {
    return reasons;
  }

  const snapshot = preflight && typeof preflight === 'object' && !Array.isArray(preflight)
    ? preflight
    : null;
  if (!snapshot) {
    reasons.push('release gate preflight snapshot missing');
    return reasons;
  }
  if (snapshot.parse_error) {
    reasons.push(`release gate preflight parse error: ${snapshot.parse_error}`);
    return reasons;
  }
  if (snapshot.available !== true) {
    reasons.push('release gate preflight unavailable');
    return reasons;
  }
  if (snapshot.blocked === true) {
    const reasonText = Array.isArray(snapshot.reasons) && snapshot.reasons.length > 0
      ? snapshot.reasons.join('; ')
      : 'release gate blocked';
    reasons.push(`release gate preflight blocked: ${reasonText}`);
  }

  return reasons;
}

function buildAutoHandoffReleaseGatePreflight(signals = null) {
  const source = signals && typeof signals === 'object' && !Array.isArray(signals)
    ? signals
    : {};
  const toNumber = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const blockState = evaluateGovernanceReleaseGateBlockState({
    health: {
      release_gate: source
    }
  });
  return {
    available: source.available === true,
    file: normalizeHandoffText(source.file),
    latest_tag: normalizeHandoffText(source.latest_tag),
    latest_gate_passed: parseAutoHandoffGateBoolean(source.latest_gate_passed, null),
    latest_risk_level: normalizeHandoffText(source.latest_risk_level),
    pass_rate_percent: toNumber(source.pass_rate_percent),
    scene_package_batch_pass_rate_percent: toNumber(source.scene_package_batch_pass_rate_percent),
    scene_package_batch_failed_count: toNumber(source.scene_package_batch_failed_count),
    drift_alert_rate_percent: toNumber(source.drift_alert_rate_percent),
    drift_alert_runs: toNumber(source.drift_alert_runs),
    drift_blocked_runs: toNumber(source.drift_blocked_runs),
    latest_weekly_ops_runtime_block_rate_percent: toNumber(
      source.latest_weekly_ops_runtime_block_rate_percent
    ),
    latest_weekly_ops_runtime_ui_mode_violation_total: toNumber(
      source.latest_weekly_ops_runtime_ui_mode_violation_total
    ),
    latest_weekly_ops_runtime_ui_mode_violation_rate_percent: toNumber(
      source.latest_weekly_ops_runtime_ui_mode_violation_rate_percent
    ),
    weekly_ops_runtime_block_rate_max_percent: toNumber(
      source.weekly_ops_runtime_block_rate_max_percent
    ),
    weekly_ops_runtime_ui_mode_violation_total: toNumber(
      source.weekly_ops_runtime_ui_mode_violation_total
    ),
    weekly_ops_runtime_ui_mode_violation_run_rate_percent: toNumber(
      source.weekly_ops_runtime_ui_mode_violation_run_rate_percent
    ),
    weekly_ops_runtime_ui_mode_violation_rate_max_percent: toNumber(
      source.weekly_ops_runtime_ui_mode_violation_rate_max_percent
    ),
    parse_error: normalizeHandoffText(source.parse_error),
    blocked: blockState.blocked === true,
    reasons: Array.isArray(blockState.reasons) ? blockState.reasons : []
  };
}

function buildAutoHandoffPreflightCheckRecommendations(projectPath, result = {}) {
  const recommendations = [];
  const seen = new Set();
  const push = value => {
    const text = `${value || ''}`.trim();
    if (!text || seen.has(text)) {
      return;
    }
    seen.add(text);
    recommendations.push(text);
  };

  const policy = result && result.policy && typeof result.policy === 'object'
    ? result.policy
    : {};
  const preflight = result && result.release_gate_preflight && typeof result.release_gate_preflight === 'object'
    ? result.release_gate_preflight
    : {};
  const reasons = Array.isArray(result.reasons) ? result.reasons : [];
  const windowSize = Number.isInteger(policy.release_evidence_window)
    ? policy.release_evidence_window
    : 5;

  if (preflight.available !== true || preflight.parse_error) {
    push(
      'sce auto handoff gate-index ' +
      '--dir .sce/reports/release-evidence ' +
      '--out .sce/reports/release-evidence/release-gate-history.json --json'
    );
  }
  if (result.status !== 'pass' || preflight.blocked === true) {
    push(`sce auto handoff evidence --window ${windowSize} --json`);
  }

  if (preflight.blocked === true) {
    const governanceRecommendations = buildGovernanceCloseLoopRecommendations(
      {
        health: {
          recommendations: []
        }
      },
      'release-gate-blocked',
      {
        reasons: Array.isArray(preflight.reasons) ? preflight.reasons : []
      }
    );
    for (const item of governanceRecommendations) {
      push(item);
    }
  }

  if (reasons.some(item => `${item}`.includes('parse error'))) {
    push(
      'Review and repair release gate history JSON, then rerun `sce auto handoff preflight-check --json`.'
    );
  }
  if (
    reasons.some(item => `${item}`.includes('unavailable') || `${item}`.includes('snapshot missing'))
  ) {
    push(
      'Ensure release workflow publishes `release-gate-history.json` and rerun preflight check.'
    );
  }

  return recommendations;
}

async function buildAutoHandoffPreflightCheck(projectPath, options = {}) {
  const policy = buildAutoHandoffRunPolicy(options);
  const releaseGateSignals = await loadGovernanceReleaseGateSignals(projectPath, {
    historyFile: options.historyFile
  });
  const releaseGatePreflight = buildAutoHandoffReleaseGatePreflight(releaseGateSignals);
  const hardGateReasons = evaluateAutoHandoffReleaseGatePreflightGateReasons(
    policy,
    releaseGatePreflight
  );

  const advisoryReasons = [];
  if (hardGateReasons.length === 0) {
    if (releaseGatePreflight.parse_error) {
      advisoryReasons.push(`release gate preflight parse error: ${releaseGatePreflight.parse_error}`);
    } else if (releaseGatePreflight.available !== true) {
      advisoryReasons.push('release gate preflight unavailable (advisory mode)');
    } else if (releaseGatePreflight.blocked === true) {
      const reasonText = Array.isArray(releaseGatePreflight.reasons) && releaseGatePreflight.reasons.length > 0
        ? releaseGatePreflight.reasons.join('; ')
        : 'release gate blocked';
      advisoryReasons.push(`release gate preflight blocked (advisory mode): ${reasonText}`);
    }
  }

  const status = hardGateReasons.length > 0
    ? 'blocked'
    : (advisoryReasons.length > 0 ? 'warning' : 'pass');
  const reasons = hardGateReasons.length > 0 ? hardGateReasons : advisoryReasons;
  const result = {
    mode: 'auto-handoff-preflight-check',
    generated_at: new Date().toISOString(),
    status,
    reasons,
    hard_gate_reasons: hardGateReasons,
    policy: {
      profile: policy.profile,
      require_release_gate_preflight: policy.require_release_gate_preflight === true,
      release_evidence_window: policy.release_evidence_window
    },
    release_gate_preflight: releaseGatePreflight,
    signals: {
      history_file: releaseGateSignals.file || releaseGatePreflight.file || null,
      total_entries: releaseGateSignals.total_entries,
      latest: {
        tag: releaseGatePreflight.latest_tag,
        gate_passed: releaseGatePreflight.latest_gate_passed,
        risk_level: releaseGatePreflight.latest_risk_level,
        weekly_ops_runtime_block_rate_percent:
          releaseGatePreflight.latest_weekly_ops_runtime_block_rate_percent,
        weekly_ops_runtime_ui_mode_violation_total:
          releaseGatePreflight.latest_weekly_ops_runtime_ui_mode_violation_total,
        weekly_ops_runtime_ui_mode_violation_rate_percent:
          releaseGatePreflight.latest_weekly_ops_runtime_ui_mode_violation_rate_percent
      },
      aggregates: {
        pass_rate_percent: releaseGatePreflight.pass_rate_percent,
        scene_package_batch_pass_rate_percent: releaseGatePreflight.scene_package_batch_pass_rate_percent,
        drift_alert_rate_percent: releaseGatePreflight.drift_alert_rate_percent,
        drift_blocked_runs: releaseGatePreflight.drift_blocked_runs,
        weekly_ops_runtime_block_rate_max_percent:
          releaseGatePreflight.weekly_ops_runtime_block_rate_max_percent,
        weekly_ops_runtime_ui_mode_violation_total:
          releaseGatePreflight.weekly_ops_runtime_ui_mode_violation_total,
        weekly_ops_runtime_ui_mode_violation_run_rate_percent:
          releaseGatePreflight.weekly_ops_runtime_ui_mode_violation_run_rate_percent,
        weekly_ops_runtime_ui_mode_violation_rate_max_percent:
          releaseGatePreflight.weekly_ops_runtime_ui_mode_violation_rate_max_percent
      }
    },
    recommended_commands: []
  };
  result.recommended_commands = buildAutoHandoffPreflightCheckRecommendations(projectPath, result);
  return result;
}

function extractAutoObservabilityWeeklyOpsStopTelemetry(observabilitySnapshotCandidate) {
  const observabilitySnapshot = observabilitySnapshotCandidate &&
    typeof observabilitySnapshotCandidate === 'object' &&
    !Array.isArray(observabilitySnapshotCandidate)
    ? observabilitySnapshotCandidate
    : null;
  if (!observabilitySnapshot) {
    return null;
  }
  const highlights = observabilitySnapshot.highlights && typeof observabilitySnapshot.highlights === 'object'
    ? observabilitySnapshot.highlights
    : {};
  const snapshots = observabilitySnapshot.snapshots && typeof observabilitySnapshot.snapshots === 'object'
    ? observabilitySnapshot.snapshots
    : {};
  const weeklyOpsStop = snapshots.governance_weekly_ops_stop && typeof snapshots.governance_weekly_ops_stop === 'object'
    ? snapshots.governance_weekly_ops_stop
    : {};
  const toNumber = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const pickNumber = (primary, fallback) => (
    Number.isFinite(primary) ? primary : (Number.isFinite(fallback) ? fallback : null)
  );

  const sessions = pickNumber(
    toNumber(highlights.governance_weekly_ops_stop_sessions),
    toNumber(weeklyOpsStop.sessions)
  );
  const sessionRatePercent = pickNumber(
    toNumber(highlights.governance_weekly_ops_stop_session_rate_percent),
    toNumber(weeklyOpsStop.session_rate_percent)
  );
  const highPressureSessions = pickNumber(
    toNumber(highlights.governance_weekly_ops_high_pressure_sessions),
    toNumber(weeklyOpsStop.high_pressure_sessions)
  );
  const highPressureRatePercent = pickNumber(
    toNumber(highlights.governance_weekly_ops_high_pressure_rate_percent),
    toNumber(weeklyOpsStop.high_pressure_session_rate_percent)
  );
  const configWarningPositiveSessions = pickNumber(
    toNumber(highlights.governance_weekly_ops_config_warning_positive_sessions),
    toNumber(weeklyOpsStop.config_warning_positive_sessions)
  );
  const authTierPressureSessions = pickNumber(
    toNumber(highlights.governance_weekly_ops_auth_tier_pressure_sessions),
    toNumber(weeklyOpsStop.auth_tier_pressure_sessions)
  );
  const dialogueAuthorizationPressureSessions = pickNumber(
    toNumber(highlights.governance_weekly_ops_dialogue_authorization_pressure_sessions),
    toNumber(weeklyOpsStop.dialogue_authorization_pressure_sessions)
  );
  const runtimeBlockRateHighSessions = pickNumber(
    toNumber(highlights.governance_weekly_ops_runtime_block_rate_high_sessions),
    toNumber(weeklyOpsStop.runtime_block_rate_high_sessions)
  );
  const runtimeUiModeViolationHighSessions = pickNumber(
    toNumber(highlights.governance_weekly_ops_runtime_ui_mode_violation_high_sessions),
    toNumber(weeklyOpsStop.runtime_ui_mode_violation_high_sessions)
  );
  const runtimeUiModeViolationTotalSum = pickNumber(
    toNumber(highlights.governance_weekly_ops_runtime_ui_mode_violation_total_sum),
    toNumber(weeklyOpsStop.runtime_ui_mode_violation_total_sum)
  );
  const hasSignal = (
    Number.isFinite(sessions) ||
    Number.isFinite(sessionRatePercent) ||
    Number.isFinite(highPressureSessions) ||
    Number.isFinite(highPressureRatePercent) ||
    Number.isFinite(configWarningPositiveSessions) ||
    Number.isFinite(authTierPressureSessions) ||
    Number.isFinite(dialogueAuthorizationPressureSessions) ||
    Number.isFinite(runtimeBlockRateHighSessions) ||
    Number.isFinite(runtimeUiModeViolationHighSessions) ||
    Number.isFinite(runtimeUiModeViolationTotalSum)
  );
  if (!hasSignal) {
    return null;
  }
  return {
    sessions,
    session_rate_percent: sessionRatePercent,
    high_pressure_sessions: highPressureSessions,
    high_pressure_rate_percent: highPressureRatePercent,
    config_warning_positive_sessions: configWarningPositiveSessions,
    auth_tier_pressure_sessions: authTierPressureSessions,
    dialogue_authorization_pressure_sessions: dialogueAuthorizationPressureSessions,
    runtime_block_rate_high_sessions: runtimeBlockRateHighSessions,
    runtime_ui_mode_violation_high_sessions: runtimeUiModeViolationHighSessions,
    runtime_ui_mode_violation_total_sum: runtimeUiModeViolationTotalSum
  };
}

function buildAutoHandoffRunFailureSummary(result = {}) {
  const phases = Array.isArray(result && result.phases) ? result.phases : [];
  const failedPhase = phases.find(item => item && item.status === 'failed') || null;
  const gates = result && result.gates && typeof result.gates === 'object'
    ? result.gates
    : {};
  const gateReasons = Array.isArray(gates.reasons) ? gates.reasons : [];
  const releaseGatePreflight = result && result.release_gate_preflight && typeof result.release_gate_preflight === 'object'
    ? result.release_gate_preflight
    : null;
  const releaseGateReasons = releaseGatePreflight && Array.isArray(releaseGatePreflight.reasons)
    ? releaseGatePreflight.reasons
    : [];
  const moquiBaseline = result && result.moqui_baseline && typeof result.moqui_baseline === 'object'
    ? result.moqui_baseline
    : null;
  const moquiCompare = moquiBaseline && moquiBaseline.compare && typeof moquiBaseline.compare === 'object'
    ? moquiBaseline.compare
    : {};
  const moquiMatrixRegressions = buildAutoHandoffMoquiCoverageRegressions(moquiCompare);
  const observabilityWeeklyOps = extractAutoObservabilityWeeklyOpsStopTelemetry(
    result && result.observability_snapshot
  );
  const highlights = [];
  if (typeof result.error === 'string' && result.error.trim()) {
    highlights.push(`error: ${result.error.trim()}`);
  }
  if (gateReasons.length > 0) {
    highlights.push(`gate: ${gateReasons.join('; ')}`);
  }
  if (releaseGatePreflight && releaseGatePreflight.blocked === true) {
    highlights.push(
      `release_gate_preflight: ${releaseGateReasons.length > 0 ? releaseGateReasons.join('; ') : 'blocked'}`
    );
  }
  if (failedPhase && failedPhase.id) {
    highlights.push(`phase: ${failedPhase.id}${failedPhase.error ? ` (${failedPhase.error})` : ''}`);
  }
  if (moquiMatrixRegressions.length > 0) {
    highlights.push(
      `moqui_matrix_regression: ${moquiMatrixRegressions.slice(0, 3).map(item => `${item.label}:${item.delta_rate_percent}%`).join(' | ')}`
    );
  }
  if (
    observabilityWeeklyOps &&
    Number.isFinite(observabilityWeeklyOps.sessions) &&
    observabilityWeeklyOps.sessions > 0
  ) {
    highlights.push(
      `observability_weekly_ops_stop: sessions=${observabilityWeeklyOps.sessions}, ` +
      `high_pressure=${Number.isFinite(observabilityWeeklyOps.high_pressure_sessions) ? observabilityWeeklyOps.high_pressure_sessions : 0}, ` +
      `config_warning=${Number.isFinite(observabilityWeeklyOps.config_warning_positive_sessions) ? observabilityWeeklyOps.config_warning_positive_sessions : 0}, ` +
      `auth_tier=${Number.isFinite(observabilityWeeklyOps.auth_tier_pressure_sessions) ? observabilityWeeklyOps.auth_tier_pressure_sessions : 0}, ` +
      `dialogue=${Number.isFinite(observabilityWeeklyOps.dialogue_authorization_pressure_sessions) ? observabilityWeeklyOps.dialogue_authorization_pressure_sessions : 0}, ` +
      `runtime_block=${Number.isFinite(observabilityWeeklyOps.runtime_block_rate_high_sessions) ? observabilityWeeklyOps.runtime_block_rate_high_sessions : 0}, ` +
      `runtime_ui_mode=${Number.isFinite(observabilityWeeklyOps.runtime_ui_mode_violation_high_sessions) ? observabilityWeeklyOps.runtime_ui_mode_violation_high_sessions : 0}, ` +
      `runtime_ui_mode_total=${Number.isFinite(observabilityWeeklyOps.runtime_ui_mode_violation_total_sum) ? observabilityWeeklyOps.runtime_ui_mode_violation_total_sum : 0}`
    );
  }
  return {
    status: normalizeHandoffText(result && result.status),
    failed_phase: failedPhase
      ? {
        id: normalizeHandoffText(failedPhase.id),
        title: normalizeHandoffText(failedPhase.title),
        error: normalizeHandoffText(failedPhase.error)
      }
      : null,
    gate_failed: gates.passed === false,
    gate_reasons: gateReasons,
    moqui_matrix_regressions: moquiMatrixRegressions,
    release_gate_preflight_blocked: Boolean(releaseGatePreflight && releaseGatePreflight.blocked === true),
    release_gate_preflight_reasons: releaseGateReasons,
    highlights
  };
}

function collectHandoffBlockers(resultItem) {
  const blockers = [];
  if (!resultItem) {
    return blockers;
  }
  if (typeof resultItem.error === 'string' && resultItem.error.trim().length > 0) {
    blockers.push(resultItem.error.trim());
  }
  const status = typeof resultItem.status === 'string' ? resultItem.status.trim().toLowerCase() : 'unknown';
  if (status !== 'completed' && blockers.length === 0) {
    blockers.push(`close-loop-batch status: ${status || 'unknown'}`);
  }
  return blockers;
}

function buildAutoHandoffSpecStatus(handoffSpecs = [], batchSummary = null, baselineSummary = null) {
  const specs = Array.isArray(handoffSpecs)
    ? handoffSpecs.map(item => `${item || ''}`.trim()).filter(Boolean)
    : [];
  const results = Array.isArray(batchSummary && batchSummary.results) ? batchSummary.results : [];
  const baselineResults = Array.isArray(baselineSummary && baselineSummary.results) ? baselineSummary.results : [];

  const statuses = specs.map(specName => {
    const expectedPrefix = `integrate handoff spec ${specName}`.toLowerCase();
    const currentResult = results.find(item => {
      const goal = `${item && item.goal ? item.goal : ''}`.trim().toLowerCase();
      return goal.startsWith(expectedPrefix);
    }) || null;
    const baselineResult = currentResult ? null : baselineResults.find(item => {
      const goal = `${item && item.goal ? item.goal : ''}`.trim().toLowerCase();
      return goal.startsWith(expectedPrefix);
    }) || null;
    const effectiveResult = currentResult || baselineResult;
    const status = effectiveResult && typeof effectiveResult.status === 'string'
      ? effectiveResult.status
      : 'missing';
    const blockers = effectiveResult
      ? collectHandoffBlockers(effectiveResult)
      : ['missing close-loop-batch result for spec integration goal'];
    const success = status === 'completed';
    return {
      spec: specName,
      status,
      success,
      blockers,
      source: currentResult
        ? 'current-run'
        : (baselineResult ? 'continued-from' : 'missing')
    };
  });

  const total = statuses.length;
  const successful = statuses.filter(item => item.success).length;
  const blocked = statuses.filter(item => item.blockers.length > 0).length;
  const successRate = total > 0
    ? Number(((successful / total) * 100).toFixed(2))
    : 100;

  return {
    total_specs: total,
    successful_specs: successful,
    blocked_specs: blocked,
    success_rate_percent: successRate,
    items: statuses
  };
}

function evaluateAutoHandoffRunGates(context = {}) {
  const policy = context.policy || {
    min_spec_success_rate: 100,
    max_risk_level: 'high',
    min_ontology_score: 0,
    max_moqui_matrix_regressions: 0,
    max_unmapped_rules: null,
    max_undecided_decisions: null,
    require_ontology_validation: true,
    require_scene_package_batch: true,
    require_capability_coverage: true,
    require_capability_lexicon: true
  };
  const dryRun = Boolean(context.dryRun);
  const specStatus = context.specStatus || {
    success_rate_percent: 100
  };
  const ontology = context.ontology || {
    present: false,
    passed: false
  };
  const moquiBaseline = context.moquiBaseline && typeof context.moquiBaseline === 'object'
    ? context.moquiBaseline
    : null;
  const moquiCompare = moquiBaseline && moquiBaseline.compare && typeof moquiBaseline.compare === 'object'
    ? moquiBaseline.compare
    : {};
  const moquiMatrixRegressions = buildAutoHandoffMoquiCoverageRegressions(moquiCompare);
  const scenePackageBatch = context.scenePackageBatch && typeof context.scenePackageBatch === 'object'
    ? context.scenePackageBatch
    : null;
  const capabilityCoverage = context.capabilityCoverage && typeof context.capabilityCoverage === 'object'
    ? context.capabilityCoverage
    : null;
  const kpi = context.programKpi || {
    risk_level: 'high'
  };
  const riskLevel = `${kpi.risk_level || 'high'}`.trim().toLowerCase();
  const riskRank = {
    low: 1,
    medium: 2,
    high: 3
  };

  const reasons = [];
  if (!dryRun) {
    const successRate = Number(specStatus.success_rate_percent);
    if (!Number.isFinite(successRate)) {
      reasons.push('spec_success_rate_percent unavailable');
    } else if (successRate < policy.min_spec_success_rate) {
      reasons.push(`spec_success_rate_percent ${successRate} < required ${policy.min_spec_success_rate}`);
    }

    if ((riskRank[riskLevel] || 3) > (riskRank[policy.max_risk_level] || 3)) {
      reasons.push(`risk_level ${riskLevel} exceeds allowed ${policy.max_risk_level}`);
    }
  }

  reasons.push(...evaluateAutoHandoffOntologyGateReasons(policy, ontology));
  reasons.push(...evaluateAutoHandoffMoquiBaselineGateReasons(policy, moquiBaseline));
  reasons.push(...evaluateAutoHandoffScenePackageBatchGateReasons(policy, scenePackageBatch));
  reasons.push(...evaluateAutoHandoffCapabilityCoverageGateReasons(policy, capabilityCoverage));
  reasons.push(...evaluateAutoHandoffCapabilityLexiconGateReasons(policy, capabilityCoverage));

  return {
    passed: reasons.length === 0,
    dry_run: dryRun,
    policy,
    actual: {
      spec_success_rate_percent: Number(specStatus.success_rate_percent),
      risk_level: riskLevel,
      ontology_validation_present: Boolean(ontology.present),
      ontology_validation_passed: Boolean(ontology.passed),
      ontology_validation_status: ontology.status || null,
      ontology_quality_score: Number.isFinite(Number(ontology.quality_score))
        ? Number(ontology.quality_score)
        : null,
      ontology_business_rule_unmapped: Number.isFinite(
        Number(ontology && ontology.metrics ? ontology.metrics.business_rule_unmapped : null)
      )
        ? Number(ontology.metrics.business_rule_unmapped)
        : null,
      ontology_decision_undecided: Number.isFinite(
        Number(ontology && ontology.metrics ? ontology.metrics.decision_undecided : null)
      )
        ? Number(ontology.metrics.decision_undecided)
        : null,
      ontology_business_rule_pass_rate_percent: Number.isFinite(
        Number(ontology && ontology.metrics ? ontology.metrics.business_rule_pass_rate_percent : null)
      )
        ? Number(ontology.metrics.business_rule_pass_rate_percent)
        : null,
      ontology_decision_resolved_rate_percent: Number.isFinite(
        Number(ontology && ontology.metrics ? ontology.metrics.decision_resolved_rate_percent : null)
      )
        ? Number(ontology.metrics.decision_resolved_rate_percent)
        : null,
      moqui_baseline_status: normalizeHandoffText(moquiBaseline && moquiBaseline.status),
      moqui_baseline_portfolio_passed: Boolean(
        moquiBaseline &&
        moquiBaseline.summary &&
        moquiBaseline.summary.portfolio_passed === true
      ),
      moqui_matrix_regression_count: moquiMatrixRegressions.length,
      max_moqui_matrix_regressions: Number.isInteger(policy.max_moqui_matrix_regressions)
        ? Number(policy.max_moqui_matrix_regressions)
        : null,
      scene_package_batch_status: normalizeHandoffText(scenePackageBatch && scenePackageBatch.status),
      scene_package_batch_passed: Boolean(scenePackageBatch && scenePackageBatch.status === 'passed'),
      capability_coverage_status: normalizeHandoffText(capabilityCoverage && capabilityCoverage.status),
      capability_coverage_percent: Number.isFinite(
        Number(capabilityCoverage && capabilityCoverage.summary ? capabilityCoverage.summary.coverage_percent : null)
      )
        ? Number(capabilityCoverage.summary.coverage_percent)
        : null,
      capability_expected_unknown_count: Array.isArray(
        capabilityCoverage && capabilityCoverage.normalization
          ? capabilityCoverage.normalization.expected_unknown
          : null
      )
        ? capabilityCoverage.normalization.expected_unknown.length
        : null,
      capability_provided_unknown_count: Array.isArray(
        capabilityCoverage && capabilityCoverage.normalization
          ? capabilityCoverage.normalization.provided_unknown
          : null
      )
        ? capabilityCoverage.normalization.provided_unknown.length
        : null,
      require_capability_lexicon: policy.require_capability_lexicon === true
    },
    reasons
  };
}

function buildAutoHandoffRunRecommendations(projectPath, result) {
  const recommendations = [];
  const seen = new Set();
  const push = value => {
    const text = `${value || ''}`.trim();
    if (!text || seen.has(text)) {
      return;
    }
    seen.add(text);
    recommendations.push(text);
  };

  const manifestPath = typeof result.manifest_path === 'string' && result.manifest_path.trim().length > 0
    ? result.manifest_path
    : null;
  const manifestCli = manifestPath
    ? quoteCliArg(toAutoHandoffCliPath(projectPath, manifestPath))
    : '<manifest>';
  const summary = result && result.batch_summary && typeof result.batch_summary === 'object'
    ? result.batch_summary
    : null;
  const totalGoals = Number(summary && summary.total_goals) || 0;
  const processedGoals = Number(summary && summary.processed_goals) || 0;
  const failedGoals = Number(summary && summary.failed_goals) || 0;
  const hasPendingOrFailed = totalGoals > 0 && (failedGoals > 0 || processedGoals < totalGoals);
  const moquiBaseline = result && result.moqui_baseline && typeof result.moqui_baseline === 'object'
    ? result.moqui_baseline
    : null;
  const moquiSummary = moquiBaseline && moquiBaseline.summary && typeof moquiBaseline.summary === 'object'
    ? moquiBaseline.summary
    : null;
  const moquiCompare = moquiBaseline && moquiBaseline.compare && typeof moquiBaseline.compare === 'object'
    ? moquiBaseline.compare
    : {};
  const moquiCoverageRegressions = buildAutoHandoffMoquiCoverageRegressions(moquiCompare);
  const observabilityWeeklyOps = extractAutoObservabilityWeeklyOpsStopTelemetry(
    result && result.observability_snapshot
  );
  const pushMoquiClusterFirstRecoverySequence = () => {
    const lines = buildMoquiRegressionRecoverySequenceLines({
      clusterGoalsArg: quoteCliArg(AUTO_HANDOFF_MOQUI_CLUSTER_REMEDIATION_FILE),
      baselineArg: quoteCliArg(AUTO_HANDOFF_MOQUI_BASELINE_JSON_FILE),
      wrapCommands: false,
      withPeriod: false
    });
    for (const line of lines) {
      push(line);
    }
  };

  if (manifestPath && result.session_id && hasPendingOrFailed) {
    push(
      `sce auto handoff run --manifest ${manifestCli} ` +
      `--continue-from ${quoteCliArg(result.session_id)} --continue-strategy auto --json`
    );
  }

  if (
    result.status === 'failed' &&
    typeof result.error === 'string' &&
    result.error.toLowerCase().includes('ontology validation gate failed') &&
    manifestPath
  ) {
    push(
      `Ensure manifest ontology_validation is present and passed, then rerun: ` +
      `sce auto handoff run --manifest ${manifestCli} --json`
    );
    if (result.error.toLowerCase().includes('ontology_quality_score')) {
      push(`sce auto handoff run --manifest ${manifestCli} --min-ontology-score 80 --json`);
    }
    if (result.error.toLowerCase().includes('business_rule_unmapped')) {
      push(`sce auto handoff run --manifest ${manifestCli} --max-unmapped-rules 0 --json`);
    }
    if (result.error.toLowerCase().includes('decision_undecided')) {
      push(`sce auto handoff run --manifest ${manifestCli} --max-undecided-decisions 0 --json`);
    }
  }

  const gateActual = result && result.gates && result.gates.actual ? result.gates.actual : {};
  const ontologyScore = Number(gateActual.ontology_quality_score);
  if (manifestPath && Number.isFinite(ontologyScore) && ontologyScore < 80) {
    push(`sce auto handoff run --manifest ${manifestCli} --min-ontology-score 80 --json`);
  }
  const unmappedRules = Number(gateActual.ontology_business_rule_unmapped);
  if (manifestPath && Number.isFinite(unmappedRules) && unmappedRules > 0) {
    push(`sce auto handoff run --manifest ${manifestCli} --max-unmapped-rules 0 --json`);
  }
  const undecidedDecisions = Number(gateActual.ontology_decision_undecided);
  if (manifestPath && Number.isFinite(undecidedDecisions) && undecidedDecisions > 0) {
    push(`sce auto handoff run --manifest ${manifestCli} --max-undecided-decisions 0 --json`);
  }

  if (result.template_diff && result.template_diff.compatibility === 'needs-sync' && manifestPath) {
    push(`sce auto handoff template-diff --manifest ${manifestCli} --json`);
  }

  if (result.session_id) {
    push(`sce auto handoff regression --session-id ${quoteCliArg(result.session_id)} --json`);
  }

  const releaseGatePreflight = result && result.release_gate_preflight && typeof result.release_gate_preflight === 'object'
    ? result.release_gate_preflight
    : null;
  if (releaseGatePreflight && releaseGatePreflight.blocked === true) {
    push('sce auto handoff evidence --window 5 --json');
    if (
      Array.isArray(releaseGatePreflight.reasons) &&
      releaseGatePreflight.reasons.some(item => (
        `${item}`.includes('scene-batch') || `${item}`.includes('drift')
      ))
    ) {
      push(
        'sce scene package-publish-batch --manifest docs/handoffs/handoff-manifest.json ' +
        '--dry-run --ontology-task-queue-out .sce/auto/ontology-remediation.lines --json'
      );
    }
  }
  if (
    releaseGatePreflight &&
    releaseGatePreflight.available !== true &&
    releaseGatePreflight.file
  ) {
    push(
      'sce auto handoff gate-index ' +
      '--dir .sce/reports/release-evidence ' +
      '--out .sce/reports/release-evidence/release-gate-history.json --json'
    );
  }

  const riskLevel = result && result.gates && result.gates.actual && typeof result.gates.actual.risk_level === 'string'
    ? result.gates.actual.risk_level.trim().toLowerCase()
    : null;
  if (riskLevel === 'high') {
    push('sce auto governance stats --days 14 --json');
  }
  if (
    observabilityWeeklyOps &&
    Number.isFinite(observabilityWeeklyOps.sessions) &&
    observabilityWeeklyOps.sessions > 0
  ) {
    push('node scripts/release-ops-weekly-summary.js --json');
    push('node scripts/release-weekly-ops-gate.js');
    if (
      Number.isFinite(observabilityWeeklyOps.config_warning_positive_sessions) &&
      observabilityWeeklyOps.config_warning_positive_sessions > 0
    ) {
      push(
        'Fix invalid weekly ops threshold variables (`KSE_RELEASE_WEEKLY_OPS_*`) and rerun release gates ' +
        'to clear config warnings.'
      );
    }
    if (
      Number.isFinite(observabilityWeeklyOps.auth_tier_pressure_sessions) &&
      observabilityWeeklyOps.auth_tier_pressure_sessions > 0
    ) {
      push(
        'node scripts/interactive-authorization-tier-evaluate.js ' +
        '--policy docs/interactive-customization/authorization-tier-policy-baseline.json --json'
      );
    }
    if (
      Number.isFinite(observabilityWeeklyOps.dialogue_authorization_pressure_sessions) &&
      observabilityWeeklyOps.dialogue_authorization_pressure_sessions > 0
    ) {
      push(
        'node scripts/interactive-dialogue-governance.js ' +
        '--policy docs/interactive-customization/dialogue-governance-policy-baseline.json ' +
        '--authorization-dialogue-policy docs/interactive-customization/authorization-dialogue-policy-baseline.json --json'
      );
    }
    if (
      Number.isFinite(observabilityWeeklyOps.runtime_ui_mode_violation_high_sessions) &&
      observabilityWeeklyOps.runtime_ui_mode_violation_high_sessions > 0
    ) {
      push('node scripts/interactive-governance-report.js --period weekly --fail-on-alert --json');
      push(
        'Review runtime ui-mode contract in docs/interactive-customization/runtime-mode-policy-baseline.json ' +
        'to keep user-app suggestion-only and route apply actions to ops-console.'
      );
    }
    if (
      Number.isFinite(observabilityWeeklyOps.runtime_block_rate_high_sessions) &&
      observabilityWeeklyOps.runtime_block_rate_high_sessions > 0
    ) {
      push(
        'Tune runtime deny/review pressure and rerun ' +
        'node scripts/interactive-governance-report.js --period weekly --json'
      );
    }
  }

  if (result && result.remediation_queue && result.remediation_queue.file) {
    push(
      `sce auto close-loop-batch ${quoteCliArg(
        toAutoHandoffCliPath(projectPath, result.remediation_queue.file)
      )} --format lines --json`
    );
    if (moquiCoverageRegressions.length > 0) {
      pushMoquiClusterFirstRecoverySequence();
    }
  }

  if (moquiBaseline && moquiBaseline.status === 'error') {
    push('sce scene moqui-baseline --json');
  } else if (moquiSummary && moquiSummary.portfolio_passed === false) {
    push(
      'sce scene moqui-baseline --include-all ' +
      '--compare-with .sce/reports/release-evidence/moqui-template-baseline.json --json'
    );
    push(
      'sce scene package-publish-batch --manifest docs/handoffs/handoff-manifest.json ' +
      '--dry-run --ontology-task-queue-out .sce/auto/ontology-remediation.lines --json'
    );
  }
  if (moquiCoverageRegressions.length > 0) {
    push(
      `Recover Moqui matrix regressions before next handoff run: ` +
      `${moquiCoverageRegressions.slice(0, 3).map(item => `${item.label}:${item.delta_rate_percent}%`).join(' | ')}`
    );
    push(
      'sce scene moqui-baseline --include-all ' +
      '--compare-with .sce/reports/release-evidence/moqui-template-baseline.json --json'
    );
    pushMoquiClusterFirstRecoverySequence();
    if (manifestPath) {
      push(
        `sce auto handoff run --manifest ${manifestCli} ` +
        '--max-moqui-matrix-regressions 0 --json'
      );
      push(
        `sce scene package-publish-batch --manifest ${manifestCli} ` +
        '--dry-run --ontology-task-queue-out .sce/auto/ontology-remediation.lines --json'
      );
    }
  }

  const scenePackageBatch = result && result.scene_package_batch && typeof result.scene_package_batch === 'object'
    ? result.scene_package_batch
    : null;
  if (
    scenePackageBatch &&
    scenePackageBatch.status &&
    ['failed', 'error'].includes(`${scenePackageBatch.status}`.toLowerCase())
  ) {
    push(
      `sce scene package-publish-batch --manifest ${manifestCli} ` +
      '--dry-run --ontology-task-queue-out .sce/auto/ontology-remediation.lines --json'
    );
  }

  const capabilityCoverage = result && result.moqui_capability_coverage && typeof result.moqui_capability_coverage === 'object'
    ? result.moqui_capability_coverage
    : null;
  const capabilitySummary = capabilityCoverage && capabilityCoverage.summary && typeof capabilityCoverage.summary === 'object'
    ? capabilityCoverage.summary
    : null;
  const capabilityNormalization = capabilityCoverage && capabilityCoverage.normalization && typeof capabilityCoverage.normalization === 'object'
    ? capabilityCoverage.normalization
    : null;
  if (capabilityCoverage && capabilityCoverage.status === 'error') {
    push('declare manifest capabilities and rerun `sce auto handoff run` to rebuild capability coverage evidence');
  } else if (capabilitySummary && capabilitySummary.passed === false) {
    push('complete uncovered moqui capabilities and rerun `sce auto handoff run --json`');
  } else if (capabilityCoverage && capabilityCoverage.status === 'skipped') {
    push('declare `capabilities` in handoff manifest to enable machine-checkable moqui capability coverage');
  }
  if (
    capabilityNormalization &&
    Array.isArray(capabilityNormalization.expected_deprecated_aliases) &&
    capabilityNormalization.expected_deprecated_aliases.length > 0
  ) {
    push('replace deprecated manifest capabilities with canonical Moqui capability ids and rerun `sce auto handoff run --json`');
  }
  if (
    capabilityNormalization &&
    Array.isArray(capabilityNormalization.expected_unknown) &&
    capabilityNormalization.expected_unknown.length > 0
  ) {
    push(
      'normalize unknown manifest capabilities and rerun strict gates via ' +
      '`sce auto handoff capability-matrix --manifest docs/handoffs/handoff-manifest.json --fail-on-gap --json`'
    );
  }
  if (
    capabilityNormalization &&
    Array.isArray(capabilityNormalization.provided_unknown) &&
    capabilityNormalization.provided_unknown.length > 0
  ) {
    push(
      'normalize unknown template capabilities via ' +
      '`node scripts/moqui-lexicon-audit.js --manifest docs/handoffs/handoff-manifest.json --template-dir .sce/templates/scene-packages --fail-on-gap --json`'
    );
  }

  return recommendations;
}

function buildAutoHandoffRunSessionId() {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    `${now.getUTCMonth() + 1}`.padStart(2, '0'),
    `${now.getUTCDate()}`.padStart(2, '0'),
    `${now.getUTCHours()}`.padStart(2, '0'),
    `${now.getUTCMinutes()}`.padStart(2, '0'),
    `${now.getUTCSeconds()}`.padStart(2, '0')
  ].join('');
  const suffix = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, '0');
  return `handoff-${stamp}-${suffix}`;
}

function beginAutoHandoffRunPhase(result, id, title) {
  const phase = {
    id,
    title,
    status: 'running',
    started_at: new Date().toISOString(),
    completed_at: null,
    elapsed_ms: null
  };
  result.phases.push(phase);
  return {
    phase,
    startedAt: Date.now()
  };
}

function completeAutoHandoffRunPhase(phaseState, details = null) {
  phaseState.phase.status = 'completed';
  if (details && typeof details === 'object') {
    phaseState.phase.details = details;
  }
  phaseState.phase.completed_at = new Date().toISOString();
  phaseState.phase.elapsed_ms = Math.max(0, Date.now() - phaseState.startedAt);
}

function failAutoHandoffRunPhase(phaseState, error) {
  phaseState.phase.status = 'failed';
  phaseState.phase.error = error && error.message ? error.message : `${error}`;
  phaseState.phase.completed_at = new Date().toISOString();
  phaseState.phase.elapsed_ms = Math.max(0, Date.now() - phaseState.startedAt);
}

function skipAutoHandoffRunPhase(result, id, title, reason) {
  result.phases.push({
    id,
    title,
    status: 'skipped',
    reason,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    elapsed_ms: 0
  });
}

function buildAutoHandoffReleaseEvidenceEntry(projectPath, result, reportFile = null, trendWindow = null) {
  const toNumber = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const gate = result && result.gates && typeof result.gates === 'object'
    ? result.gates
    : {};
  const gateActual = gate && gate.actual && typeof gate.actual === 'object'
    ? gate.actual
    : {};
  const ontology = result && result.ontology_validation && typeof result.ontology_validation === 'object'
    ? result.ontology_validation
    : {};
  const ontologyMetrics = ontology && ontology.metrics && typeof ontology.metrics === 'object'
    ? ontology.metrics
    : {};
  const regression = result && result.regression && typeof result.regression === 'object'
    ? result.regression
    : {};
  const regressionDelta = regression && regression.delta && typeof regression.delta === 'object'
    ? regression.delta
    : {};
  const moquiBaseline = result && result.moqui_baseline && typeof result.moqui_baseline === 'object'
    ? result.moqui_baseline
    : {};
  const moquiSummary = moquiBaseline && moquiBaseline.summary && typeof moquiBaseline.summary === 'object'
    ? moquiBaseline.summary
    : {};
  const moquiCompare = moquiBaseline && moquiBaseline.compare && typeof moquiBaseline.compare === 'object'
    ? moquiBaseline.compare
    : {};
  const moquiDeltas = moquiCompare && moquiCompare.deltas && typeof moquiCompare.deltas === 'object'
    ? moquiCompare.deltas
    : {};
  const moquiFailedTemplates = moquiCompare && moquiCompare.failed_templates && typeof moquiCompare.failed_templates === 'object'
    ? moquiCompare.failed_templates
    : {};
  const moquiScopeBreakdown = moquiSummary && moquiSummary.scope_breakdown && typeof moquiSummary.scope_breakdown === 'object'
    ? moquiSummary.scope_breakdown
    : {};
  const moquiCoverageMatrix = moquiSummary && moquiSummary.coverage_matrix && typeof moquiSummary.coverage_matrix === 'object'
    ? moquiSummary.coverage_matrix
    : {};
  const moquiCoverageMatrixDeltas = moquiCompare && moquiCompare.coverage_matrix_deltas
    && typeof moquiCompare.coverage_matrix_deltas === 'object'
    ? moquiCompare.coverage_matrix_deltas
    : {};
  const moquiCoverageMatrixRegressions = buildAutoHandoffMoquiCoverageRegressions(moquiCompare);
  const moquiGapFrequency = Array.isArray(moquiSummary && moquiSummary.gap_frequency)
    ? moquiSummary.gap_frequency
    : [];
  const scenePackageBatch = result && result.scene_package_batch && typeof result.scene_package_batch === 'object'
    ? result.scene_package_batch
    : {};
  const scenePackageBatchSummary = scenePackageBatch && scenePackageBatch.summary && typeof scenePackageBatch.summary === 'object'
    ? scenePackageBatch.summary
    : {};
  const scenePackageBatchGate = scenePackageBatch && scenePackageBatch.batch_ontology_gate && typeof scenePackageBatch.batch_ontology_gate === 'object'
    ? scenePackageBatch.batch_ontology_gate
    : {};
  const capabilityCoverage = result && result.moqui_capability_coverage && typeof result.moqui_capability_coverage === 'object'
    ? result.moqui_capability_coverage
    : {};
  const capabilitySummary = capabilityCoverage && capabilityCoverage.summary && typeof capabilityCoverage.summary === 'object'
    ? capabilityCoverage.summary
    : {};
  const capabilityCompare = capabilityCoverage && capabilityCoverage.compare && typeof capabilityCoverage.compare === 'object'
    ? capabilityCoverage.compare
    : {};
  const capabilityGaps = Array.isArray(capabilityCoverage && capabilityCoverage.gaps)
    ? capabilityCoverage.gaps
    : [];
  const capabilityNormalization = capabilityCoverage && capabilityCoverage.normalization && typeof capabilityCoverage.normalization === 'object'
    ? capabilityCoverage.normalization
    : {};
  const capabilityWarnings = Array.isArray(capabilityCoverage && capabilityCoverage.warnings)
    ? capabilityCoverage.warnings
    : [];
  const batchSummary = result && result.batch_summary && typeof result.batch_summary === 'object'
    ? result.batch_summary
    : {};
  const reportPath = typeof reportFile === 'string' && reportFile.trim().length > 0
    ? reportFile.trim()
    : (
      result && typeof result.output_file === 'string' && result.output_file.trim().length > 0
        ? result.output_file.trim()
        : null
    );

  return {
    session_id: result && result.session_id ? result.session_id : null,
    merged_at: new Date().toISOString(),
    status: result && result.status ? result.status : null,
    dry_run: Boolean(result && result.dry_run),
    manifest_path: result && result.manifest_path ? result.manifest_path : null,
    source_project: result && result.source_project ? result.source_project : null,
    handoff_report_file: reportPath ? toAutoHandoffCliPath(projectPath, reportPath) : null,
    gate: {
      passed: gate.passed === true,
      reasons: Array.isArray(gate.reasons) ? gate.reasons : [],
      actual: {
        spec_success_rate_percent: toNumber(gateActual.spec_success_rate_percent),
        risk_level: normalizeHandoffText(gateActual.risk_level),
        ontology_quality_score: toNumber(gateActual.ontology_quality_score),
        ontology_business_rule_unmapped: toNumber(gateActual.ontology_business_rule_unmapped),
        ontology_decision_undecided: toNumber(gateActual.ontology_decision_undecided),
        capability_expected_unknown_count: toNumber(gateActual.capability_expected_unknown_count),
        capability_provided_unknown_count: toNumber(gateActual.capability_provided_unknown_count)
      }
    },
    release_gate_preflight: result && result.release_gate_preflight && typeof result.release_gate_preflight === 'object'
      ? result.release_gate_preflight
      : null,
    failure_summary: result && result.failure_summary && typeof result.failure_summary === 'object'
      ? result.failure_summary
      : null,
    ontology_validation: {
      status: normalizeHandoffText(ontology.status),
      passed: ontology.passed === true,
      quality_score: toNumber(ontology.quality_score),
      metrics: {
        entity_total: toNumber(ontologyMetrics.entity_total),
        relation_total: toNumber(ontologyMetrics.relation_total),
        business_rule_total: toNumber(ontologyMetrics.business_rule_total),
        business_rule_mapped: toNumber(ontologyMetrics.business_rule_mapped),
        business_rule_unmapped: toNumber(ontologyMetrics.business_rule_unmapped),
        decision_total: toNumber(ontologyMetrics.decision_total),
        decision_resolved: toNumber(ontologyMetrics.decision_resolved),
        decision_undecided: toNumber(ontologyMetrics.decision_undecided),
        business_rule_pass_rate_percent: toNumber(ontologyMetrics.business_rule_pass_rate_percent),
        decision_resolved_rate_percent: toNumber(ontologyMetrics.decision_resolved_rate_percent)
      }
    },
    regression: {
      trend: normalizeHandoffText(regression.trend),
      delta: {
        spec_success_rate_percent: toNumber(regressionDelta.spec_success_rate_percent),
        risk_level_rank: toNumber(regressionDelta.risk_level_rank),
        failed_goals: toNumber(regressionDelta.failed_goals),
        ontology_quality_score: toNumber(regressionDelta.ontology_quality_score),
        ontology_unmapped_rules: toNumber(regressionDelta.ontology_unmapped_rules),
        ontology_undecided_decisions: toNumber(regressionDelta.ontology_undecided_decisions)
      }
    },
    moqui_baseline: {
      status: normalizeHandoffText(moquiBaseline.status),
      generated: moquiBaseline.generated === true,
      reason: normalizeHandoffText(moquiBaseline.reason),
      error: normalizeHandoffText(moquiBaseline.error),
      summary: {
        total_templates: toNumber(moquiSummary.total_templates),
        scoped_templates: toNumber(moquiSummary.scoped_templates),
        avg_score: toNumber(moquiSummary.avg_score),
        valid_rate_percent: toNumber(moquiSummary.valid_rate_percent),
        baseline_passed: toNumber(moquiSummary.baseline_passed),
        baseline_failed: toNumber(moquiSummary.baseline_failed),
        portfolio_passed: moquiSummary.portfolio_passed === true,
        scope_breakdown: {
          moqui_erp: toNumber(moquiScopeBreakdown.moqui_erp),
          scene_orchestration: toNumber(moquiScopeBreakdown.scene_orchestration),
          other: toNumber(moquiScopeBreakdown.other)
        },
        coverage_matrix: moquiCoverageMatrix,
        gap_frequency: moquiGapFrequency
      },
      compare: Object.keys(moquiCompare).length === 0
        ? null
        : {
          previous_generated_at: normalizeHandoffText(moquiCompare.previous_generated_at),
          previous_template_root: normalizeHandoffText(moquiCompare.previous_template_root),
          deltas: {
            scoped_templates: toNumber(moquiDeltas.scoped_templates),
            avg_score: toNumber(moquiDeltas.avg_score),
            valid_rate_percent: toNumber(moquiDeltas.valid_rate_percent),
            baseline_passed: toNumber(moquiDeltas.baseline_passed),
            baseline_failed: toNumber(moquiDeltas.baseline_failed)
          },
          coverage_matrix_deltas: moquiCoverageMatrixDeltas,
          coverage_matrix_regressions: moquiCoverageMatrixRegressions,
          failed_templates: {
            newly_failed: Array.isArray(moquiFailedTemplates.newly_failed) ? moquiFailedTemplates.newly_failed : [],
            recovered: Array.isArray(moquiFailedTemplates.recovered) ? moquiFailedTemplates.recovered : []
          }
        },
      output: {
        json: normalizeHandoffText(moquiBaseline && moquiBaseline.output ? moquiBaseline.output.json : null),
        markdown: normalizeHandoffText(moquiBaseline && moquiBaseline.output ? moquiBaseline.output.markdown : null)
      }
    },
    scene_package_batch: {
      status: normalizeHandoffText(scenePackageBatch.status),
      generated: scenePackageBatch.generated === true,
      reason: normalizeHandoffText(scenePackageBatch.reason),
      error: normalizeHandoffText(scenePackageBatch.error),
      summary: {
        selected: toNumber(scenePackageBatchSummary.selected),
        failed: toNumber(scenePackageBatchSummary.failed),
        skipped: toNumber(scenePackageBatchSummary.skipped),
        batch_gate_passed: scenePackageBatchSummary.batch_gate_passed === true,
        batch_gate_failure_count: toNumber(scenePackageBatchSummary.batch_gate_failure_count),
        ontology_average_score: toNumber(scenePackageBatchSummary.ontology_average_score),
        ontology_valid_rate_percent: toNumber(scenePackageBatchSummary.ontology_valid_rate_percent)
      },
      batch_ontology_gate: {
        passed: scenePackageBatchGate.passed === true,
        failures: Array.isArray(scenePackageBatchGate.failures) ? scenePackageBatchGate.failures : []
      },
      output: {
        json: normalizeHandoffText(scenePackageBatch && scenePackageBatch.output ? scenePackageBatch.output.json : null)
      }
    },
    capability_coverage: {
      status: normalizeHandoffText(capabilityCoverage.status),
      generated: capabilityCoverage.generated === true,
      reason: normalizeHandoffText(capabilityCoverage.reason),
      error: normalizeHandoffText(capabilityCoverage.error),
      summary: {
        total_capabilities: toNumber(capabilitySummary.total_capabilities),
        covered_capabilities: toNumber(capabilitySummary.covered_capabilities),
        uncovered_capabilities: toNumber(capabilitySummary.uncovered_capabilities),
        coverage_percent: toNumber(capabilitySummary.coverage_percent),
        min_required_percent: toNumber(capabilitySummary.min_required_percent),
        passed: capabilitySummary.passed === true
      },
      compare: Object.keys(capabilityCompare).length === 0
        ? null
        : {
          previous_generated_at: normalizeHandoffText(capabilityCompare.previous_generated_at),
          delta_coverage_percent: toNumber(capabilityCompare.delta_coverage_percent),
          delta_covered_capabilities: toNumber(capabilityCompare.delta_covered_capabilities),
          newly_covered: Array.isArray(capabilityCompare.newly_covered) ? capabilityCompare.newly_covered : [],
          newly_uncovered: Array.isArray(capabilityCompare.newly_uncovered) ? capabilityCompare.newly_uncovered : []
        },
      normalization: {
        lexicon_version: normalizeHandoffText(capabilityNormalization.lexicon_version),
        expected_alias_mapped: Array.isArray(capabilityNormalization.expected_alias_mapped) ? capabilityNormalization.expected_alias_mapped : [],
        expected_deprecated_aliases: Array.isArray(capabilityNormalization.expected_deprecated_aliases) ? capabilityNormalization.expected_deprecated_aliases : [],
        expected_unknown: Array.isArray(capabilityNormalization.expected_unknown) ? capabilityNormalization.expected_unknown : [],
        provided_alias_mapped: Array.isArray(capabilityNormalization.provided_alias_mapped) ? capabilityNormalization.provided_alias_mapped : [],
        provided_deprecated_aliases: Array.isArray(capabilityNormalization.provided_deprecated_aliases) ? capabilityNormalization.provided_deprecated_aliases : [],
        provided_unknown: Array.isArray(capabilityNormalization.provided_unknown) ? capabilityNormalization.provided_unknown : []
      },
      gaps: capabilityGaps,
      warnings: capabilityWarnings,
      output: {
        json: normalizeHandoffText(capabilityCoverage && capabilityCoverage.output ? capabilityCoverage.output.json : null),
        markdown: normalizeHandoffText(capabilityCoverage && capabilityCoverage.output ? capabilityCoverage.output.markdown : null)
      }
    },
    batch_summary: {
      status: normalizeHandoffText(batchSummary.status),
      total_goals: toNumber(batchSummary.total_goals),
      processed_goals: toNumber(batchSummary.processed_goals),
      completed_goals: toNumber(batchSummary.completed_goals),
      failed_goals: toNumber(batchSummary.failed_goals)
    },
    continued_from: result && result.continued_from ? result.continued_from : null,
    policy: {
      max_moqui_matrix_regressions: Number.isFinite(
        Number(result && result.policy ? result.policy.max_moqui_matrix_regressions : null)
      )
        ? Number(result.policy.max_moqui_matrix_regressions)
        : null,
      require_capability_lexicon: Boolean(
        result &&
        result.policy &&
        result.policy.require_capability_lexicon === true
      ),
      require_release_gate_preflight: Boolean(
        result &&
        result.policy &&
        result.policy.require_release_gate_preflight === true
      )
    },
    trend_window: trendWindow && typeof trendWindow === 'object'
      ? trendWindow
      : null
  };
}

async function mergeAutoHandoffRunIntoReleaseEvidence(projectPath, result, reportFile = null) {
  const evidenceFile = path.join(projectPath, AUTO_HANDOFF_RELEASE_EVIDENCE_FILE);
  const nowIso = new Date().toISOString();
  let existing = null;
  if (await fs.pathExists(evidenceFile)) {
    try {
      existing = await fs.readJson(evidenceFile);
    } catch (error) {
      throw new Error(`failed to read release evidence JSON: ${evidenceFile} (${error.message})`);
    }
  }

  const existingSessions = existing && Array.isArray(existing.sessions)
    ? existing.sessions.filter(item => item && typeof item === 'object')
    : [];
  let trendWindow = null;
  const trendWindowSize = Number(
    result &&
    result.policy &&
    result.policy.release_evidence_window !== undefined &&
    result.policy.release_evidence_window !== null
      ? result.policy.release_evidence_window
      : 5
  );
  if (Number.isInteger(trendWindowSize) && trendWindowSize >= 2 && trendWindowSize <= 50) {
    try {
      const regressionSnapshot = await buildAutoHandoffRegressionReport(projectPath, {
        sessionId: result && result.session_id ? result.session_id : 'latest',
        window: trendWindowSize
      });
      trendWindow = {
        generated_at: nowIso,
        window: regressionSnapshot.window || {
          requested: trendWindowSize,
          actual: null
        },
        trend: normalizeHandoffText(regressionSnapshot.trend),
        window_trend: regressionSnapshot.window_trend || null,
        aggregates: regressionSnapshot.aggregates || null,
        risk_layers: regressionSnapshot.risk_layers || null
      };
    } catch (error) {
      trendWindow = {
        generated_at: nowIso,
        window: {
          requested: trendWindowSize,
          actual: null
        },
        error: error && error.message ? error.message : `${error}`
      };
    }
  }

  const nextEntry = buildAutoHandoffReleaseEvidenceEntry(projectPath, result, reportFile, trendWindow);
  const sessionId = normalizeHandoffText(nextEntry.session_id);
  let updatedExisting = false;
  const mergedSessions = existingSessions.slice();

  if (sessionId) {
    const existingIndex = mergedSessions.findIndex(item => normalizeHandoffText(item.session_id) === sessionId);
    if (existingIndex >= 0) {
      mergedSessions[existingIndex] = {
        ...mergedSessions[existingIndex],
        ...nextEntry
      };
      updatedExisting = true;
    } else {
      mergedSessions.push(nextEntry);
    }
  } else {
    mergedSessions.push(nextEntry);
  }

  mergedSessions.sort((left, right) => {
    const leftTs = Date.parse(left && (left.merged_at || left.generated_at || left.updated_at) ? (left.merged_at || left.generated_at || left.updated_at) : 0);
    const rightTs = Date.parse(right && (right.merged_at || right.generated_at || right.updated_at) ? (right.merged_at || right.generated_at || right.updated_at) : 0);
    return (Number.isFinite(rightTs) ? rightTs : 0) - (Number.isFinite(leftTs) ? leftTs : 0);
  });

  const generatedAt = existing && typeof existing.generated_at === 'string' && existing.generated_at.trim()
    ? existing.generated_at
    : nowIso;
  const payload = {
    mode: 'auto-handoff-release-evidence',
    generated_at: generatedAt,
    updated_at: nowIso,
    latest_session_id: sessionId || (
      mergedSessions.length > 0 && normalizeHandoffText(mergedSessions[0].session_id)
        ? normalizeHandoffText(mergedSessions[0].session_id)
        : null
    ),
    total_runs: mergedSessions.length,
    latest_trend_window: mergedSessions.length > 0 && mergedSessions[0] && mergedSessions[0].trend_window
      ? mergedSessions[0].trend_window
      : null,
    sessions: mergedSessions
  };

  await fs.ensureDir(path.dirname(evidenceFile));
  await fs.writeJson(evidenceFile, payload, { spaces: 2 });
  return {
    mode: 'auto-handoff-release-evidence',
    merged: true,
    updated_existing: updatedExisting,
    file: evidenceFile,
    latest_session_id: payload.latest_session_id,
    total_runs: payload.total_runs,
    trend_window: nextEntry.trend_window
  };
}

async function writeAutoHandoffRunReport(projectPath, result, outCandidate = null) {
  if (typeof outCandidate === 'string' && outCandidate.trim().length > 0) {
    await maybeWriteOutput(result, outCandidate.trim(), projectPath);
    return;
  }
  const defaultFile = path.join(AUTO_HANDOFF_RUN_REPORT_DIR, `${result.session_id}.json`);
  await maybeWriteOutput(result, defaultFile, projectPath);
}

function buildAutoHandoffMoquiBaselinePhaseDetails(payload) {
  const baseline = payload && typeof payload === 'object' ? payload : {};
  const summary = baseline.summary && typeof baseline.summary === 'object' ? baseline.summary : null;
  const compare = baseline.compare && typeof baseline.compare === 'object' ? baseline.compare : {};
  const regressions = buildAutoHandoffMoquiCoverageRegressions(compare);
  const scopeBreakdown = summary && summary.scope_breakdown && typeof summary.scope_breakdown === 'object'
    ? summary.scope_breakdown
    : null;
  const coverageMatrix = summary && summary.coverage_matrix && typeof summary.coverage_matrix === 'object'
    ? summary.coverage_matrix
    : null;
  const gapFrequency = summary && Array.isArray(summary.gap_frequency)
    ? summary.gap_frequency
    : [];
  return {
    status: baseline.status || 'unknown',
    generated: baseline.generated === true,
    output: baseline.output || null,
    portfolio_passed: summary ? summary.portfolio_passed === true : null,
    avg_score: summary && Number.isFinite(Number(summary.avg_score))
      ? Number(summary.avg_score)
      : null,
    valid_rate_percent: summary && Number.isFinite(Number(summary.valid_rate_percent))
      ? Number(summary.valid_rate_percent)
      : null,
    scope_breakdown: scopeBreakdown,
    coverage_matrix: coverageMatrix,
    gap_frequency_top: gapFrequency.slice(0, 5),
    entity_coverage_rate_percent: getAutoHandoffMoquiCoverageMetric(summary, 'entity_coverage', 'rate_percent'),
    relation_coverage_rate_percent: getAutoHandoffMoquiCoverageMetric(summary, 'relation_coverage', 'rate_percent'),
    business_rule_closed_rate_percent: getAutoHandoffMoquiCoverageMetric(summary, 'business_rule_closed', 'rate_percent'),
    decision_closed_rate_percent: getAutoHandoffMoquiCoverageMetric(summary, 'decision_closed', 'rate_percent'),
    coverage_matrix_deltas: getAutoHandoffMoquiCoverageDeltaMatrix(compare),
    coverage_matrix_regressions: regressions,
    entity_coverage_delta_rate_percent: getAutoHandoffMoquiCoverageDeltaMetric(compare, 'entity_coverage', 'rate_percent'),
    business_rule_closed_delta_rate_percent: getAutoHandoffMoquiCoverageDeltaMetric(compare, 'business_rule_closed', 'rate_percent'),
    decision_closed_delta_rate_percent: getAutoHandoffMoquiCoverageDeltaMetric(compare, 'decision_closed', 'rate_percent'),
    matrix_regression_count: regressions.length
  };
}

function parseAutoHandoffJsonFromCommandStdout(stdoutText = '') {
  const text = `${stdoutText || ''}`.trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (_error) {
    // continue
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (_error) {
      return null;
    }
  }
  return null;
}

async function buildAutoHandoffMoquiBaselineSnapshot(projectPath) {
  const scriptPath = path.join(projectPath, 'scripts', 'moqui-template-baseline-report.js');
  if (!(await fs.pathExists(scriptPath))) {
    return {
      status: 'skipped',
      generated: false,
      reason: `baseline script missing: ${toAutoHandoffCliPath(projectPath, scriptPath)}`
    };
  }

  const outputJsonPath = path.join(projectPath, AUTO_HANDOFF_MOQUI_BASELINE_JSON_FILE);
  const outputMarkdownPath = path.join(projectPath, AUTO_HANDOFF_MOQUI_BASELINE_MARKDOWN_FILE);
  await fs.ensureDir(path.dirname(outputJsonPath));

  const scriptArgs = [
    scriptPath,
    '--out', outputJsonPath,
    '--markdown-out', outputMarkdownPath,
    '--json'
  ];

  if (await fs.pathExists(outputJsonPath)) {
    scriptArgs.push('--compare-with', outputJsonPath);
  }

  const execution = spawnSync(process.execPath, scriptArgs, {
    cwd: projectPath,
    encoding: 'utf8'
  });

  const stdout = typeof execution.stdout === 'string' ? execution.stdout.trim() : '';
  const stderr = typeof execution.stderr === 'string' ? execution.stderr.trim() : '';

  if (execution.error) {
    return {
      status: 'error',
      generated: false,
      error: execution.error.message
    };
  }

  if (execution.status !== 0) {
    return {
      status: 'error',
      generated: false,
      error: stderr || stdout || `baseline script exited with code ${execution.status}`
    };
  }

  let reportPayload = null;
  try {
    reportPayload = stdout ? JSON.parse(stdout) : await fs.readJson(outputJsonPath);
  } catch (error) {
    return {
      status: 'error',
      generated: false,
      error: `failed to parse baseline payload: ${error.message}`
    };
  }

  const summary = reportPayload && reportPayload.summary && typeof reportPayload.summary === 'object'
    ? reportPayload.summary
    : {};
  const compare = reportPayload && reportPayload.compare && typeof reportPayload.compare === 'object'
    ? reportPayload.compare
    : null;
  const failedTemplates = compare && compare.failed_templates && typeof compare.failed_templates === 'object'
    ? compare.failed_templates
    : {};
  const scopeBreakdown = summary && summary.scope_breakdown && typeof summary.scope_breakdown === 'object'
    ? summary.scope_breakdown
    : {};
  const coverageMatrix = summary && summary.coverage_matrix && typeof summary.coverage_matrix === 'object'
    ? summary.coverage_matrix
    : {};
  const gapFrequency = summary && Array.isArray(summary.gap_frequency)
    ? summary.gap_frequency
    : [];

  return {
    status: summary.portfolio_passed === true ? 'passed' : 'failed',
    generated: true,
    summary: {
      total_templates: Number(summary.total_templates) || 0,
      scoped_templates: Number(summary.scoped_templates) || 0,
      avg_score: Number.isFinite(Number(summary.avg_score)) ? Number(summary.avg_score) : null,
      valid_rate_percent: Number.isFinite(Number(summary.valid_rate_percent)) ? Number(summary.valid_rate_percent) : null,
      baseline_passed: Number(summary.baseline_passed) || 0,
      baseline_failed: Number(summary.baseline_failed) || 0,
      portfolio_passed: summary.portfolio_passed === true,
      scope_breakdown: {
        moqui_erp: Number(scopeBreakdown.moqui_erp) || 0,
        scene_orchestration: Number(scopeBreakdown.scene_orchestration) || 0,
        other: Number(scopeBreakdown.other) || 0
      },
      coverage_matrix: coverageMatrix,
      gap_frequency: gapFrequency
    },
    compare: compare
      ? {
        previous_generated_at: compare.previous_generated_at || null,
        previous_template_root: compare.previous_template_root || null,
        deltas: compare.deltas || null,
        coverage_matrix_deltas: compare.coverage_matrix_deltas || null,
        coverage_matrix_regressions: buildAutoHandoffMoquiCoverageRegressions(compare),
        failed_templates: {
          previous: Array.isArray(failedTemplates.previous) ? failedTemplates.previous : [],
          current: Array.isArray(failedTemplates.current) ? failedTemplates.current : [],
          newly_failed: Array.isArray(failedTemplates.newly_failed) ? failedTemplates.newly_failed : [],
          recovered: Array.isArray(failedTemplates.recovered) ? failedTemplates.recovered : []
        }
      }
      : null,
    output: {
      json: toAutoHandoffCliPath(projectPath, outputJsonPath),
      markdown: toAutoHandoffCliPath(projectPath, outputMarkdownPath)
    },
    warnings: stderr ? [stderr] : []
  };
}

function buildAutoHandoffScenePackageBatchPhaseDetails(payload) {
  const batch = payload && typeof payload === 'object' ? payload : {};
  const summary = batch.summary && typeof batch.summary === 'object' ? batch.summary : null;
  return {
    status: batch.status || 'unknown',
    generated: batch.generated === true,
    output: batch.output || null,
    selected: summary && Number.isFinite(Number(summary.selected))
      ? Number(summary.selected)
      : null,
    failed: summary && Number.isFinite(Number(summary.failed))
      ? Number(summary.failed)
      : null,
    batch_gate_passed: summary ? summary.batch_gate_passed === true : null
  };
}

async function buildAutoHandoffScenePackageBatchSnapshot(projectPath, manifestPath) {
  const manifestFile = normalizeHandoffText(manifestPath);
  if (!manifestFile) {
    return {
      status: 'skipped',
      generated: false,
      reason: 'manifest path unavailable for scene package batch gate'
    };
  }
  if (!(await fs.pathExists(AUTO_HANDOFF_CLI_SCRIPT_FILE))) {
    return {
      status: 'skipped',
      generated: false,
      reason: `sce cli script missing: ${toAutoHandoffCliPath(projectPath, AUTO_HANDOFF_CLI_SCRIPT_FILE)}`
    };
  }

  const outputJsonPath = path.join(projectPath, AUTO_HANDOFF_SCENE_PACKAGE_BATCH_JSON_FILE);
  const taskQueuePath = path.join(projectPath, AUTO_HANDOFF_SCENE_PACKAGE_BATCH_TASK_QUEUE_FILE);
  await fs.ensureDir(path.dirname(outputJsonPath));

  const execution = spawnSync(
    process.execPath,
    [
      AUTO_HANDOFF_CLI_SCRIPT_FILE,
      'scene',
      'package-publish-batch',
      '--manifest', manifestFile,
      '--dry-run',
      '--ontology-report-out', outputJsonPath,
      '--ontology-task-queue-out', taskQueuePath,
      '--json'
    ],
    {
      cwd: projectPath,
      encoding: 'utf8'
    }
  );

  const stdout = typeof execution.stdout === 'string' ? execution.stdout.trim() : '';
  const stderr = typeof execution.stderr === 'string' ? execution.stderr.trim() : '';

  if (execution.error) {
    return {
      status: 'error',
      generated: false,
      error: execution.error.message
    };
  }

  const payload = parseAutoHandoffJsonFromCommandStdout(stdout);
  if (!payload || typeof payload !== 'object') {
    const missingSpecArray = /manifest spec array (not found|is empty)/i.test(stderr);
    if (missingSpecArray) {
      return {
        status: 'skipped',
        generated: false,
        reason: 'manifest specs are not scene package batch compatible',
        warnings: stderr ? [stderr] : []
      };
    }
    return {
      status: 'error',
      generated: false,
      error: stderr || stdout || `scene package publish-batch exited with code ${execution.status}`,
      warnings: stderr ? [stderr] : []
    };
  }

  const summary = payload.summary && typeof payload.summary === 'object'
    ? payload.summary
    : {};
  const ontologySummary = payload.ontology_summary && typeof payload.ontology_summary === 'object'
    ? payload.ontology_summary
    : {};
  const batchGate = payload.batch_ontology_gate && typeof payload.batch_ontology_gate === 'object'
    ? payload.batch_ontology_gate
    : {};
  const batchGateFailures = Array.isArray(batchGate.failures) ? batchGate.failures : [];
  const selected = Number(summary.selected) || 0;
  const failed = Number(summary.failed) || 0;

  if (selected <= 0 && failed <= 0) {
    return {
      status: 'skipped',
      generated: false,
      reason: 'no scene package publish candidates were selected from handoff manifest',
      summary: {
        selected,
        published: Number(summary.published) || 0,
        planned: Number(summary.planned) || 0,
        failed,
        skipped: Number(summary.skipped) || 0,
        batch_gate_passed: batchGate.passed === true,
        batch_gate_failure_count: batchGateFailures.length
      },
      output: {
        json: toAutoHandoffCliPath(projectPath, outputJsonPath)
      },
      warnings: stderr ? [stderr] : []
    };
  }

  return {
    status: payload.success === true ? 'passed' : 'failed',
    generated: true,
    mode: payload.mode || 'dry-run',
    success: payload.success === true,
    manifest: normalizeHandoffText(payload.manifest),
    summary: {
      selected,
      published: Number(summary.published) || 0,
      planned: Number(summary.planned) || 0,
      failed,
      skipped: Number(summary.skipped) || 0,
      batch_gate_passed: batchGate.passed === true,
      batch_gate_failure_count: batchGateFailures.length,
      ontology_average_score: Number.isFinite(Number(ontologySummary.average_score))
        ? Number(ontologySummary.average_score)
        : null,
      ontology_valid_rate_percent: Number.isFinite(Number(ontologySummary.valid_rate_percent))
        ? Number(ontologySummary.valid_rate_percent)
        : null
    },
    failures: Array.isArray(payload.failures)
      ? payload.failures.map(item => ({
        spec: normalizeHandoffText(item && item.spec),
        error: normalizeHandoffText(item && item.error)
      }))
      : [],
    batch_ontology_gate: {
      passed: batchGate.passed === true,
      failures: batchGateFailures.map(item => ({
        id: normalizeHandoffText(item && item.id),
        message: normalizeHandoffText(item && item.message)
      }))
    },
    task_queue: payload.ontology_task_queue && typeof payload.ontology_task_queue === 'object'
      ? {
        output_path: normalizeHandoffText(payload.ontology_task_queue.output_path),
        task_count: Number(payload.ontology_task_queue.task_count) || 0
      }
      : null,
    output: {
      json: toAutoHandoffCliPath(projectPath, outputJsonPath)
    },
    warnings: stderr ? [stderr] : []
  };
}

function normalizeMoquiCapabilityToken(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = `${value}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : null;
}

function buildMoquiCapabilityLexiconIndex(rawLexicon = {}) {
  const aliasToCanonical = new Map();
  const deprecatedAliasToCanonical = new Map();
  const canonicalSet = new Set();
  const entries = Array.isArray(rawLexicon && rawLexicon.capabilities)
    ? rawLexicon.capabilities
    : [];

  for (const entry of entries) {
    const canonical = normalizeMoquiCapabilityToken(entry && entry.canonical);
    if (!canonical) {
      continue;
    }
    canonicalSet.add(canonical);
    aliasToCanonical.set(canonical, canonical);

    const aliases = Array.isArray(entry && entry.aliases) ? entry.aliases : [];
    for (const alias of aliases) {
      const normalizedAlias = normalizeMoquiCapabilityToken(alias);
      if (!normalizedAlias) {
        continue;
      }
      aliasToCanonical.set(normalizedAlias, canonical);
    }

    const deprecatedAliases = Array.isArray(entry && entry.deprecated_aliases)
      ? entry.deprecated_aliases
      : [];
    for (const deprecatedAlias of deprecatedAliases) {
      const normalizedDeprecatedAlias = normalizeMoquiCapabilityToken(deprecatedAlias);
      if (!normalizedDeprecatedAlias) {
        continue;
      }
      aliasToCanonical.set(normalizedDeprecatedAlias, canonical);
      deprecatedAliasToCanonical.set(normalizedDeprecatedAlias, canonical);
    }
  }

  return {
    version: rawLexicon && rawLexicon.version ? `${rawLexicon.version}` : null,
    source: rawLexicon && rawLexicon.source ? `${rawLexicon.source}` : null,
    canonical_set: canonicalSet,
    alias_to_canonical: aliasToCanonical,
    deprecated_alias_to_canonical: deprecatedAliasToCanonical
  };
}

function resolveMoquiCapabilityDescriptor(value, lexiconIndex = MOQUI_CAPABILITY_LEXICON_INDEX) {
  const normalized = normalizeMoquiCapabilityToken(value);
  if (!normalized) {
    return null;
  }

  const aliasToCanonical = lexiconIndex && lexiconIndex.alias_to_canonical instanceof Map
    ? lexiconIndex.alias_to_canonical
    : new Map();
  const deprecatedAliasToCanonical = lexiconIndex && lexiconIndex.deprecated_alias_to_canonical instanceof Map
    ? lexiconIndex.deprecated_alias_to_canonical
    : new Map();
  const canonicalSet = lexiconIndex && lexiconIndex.canonical_set instanceof Set
    ? lexiconIndex.canonical_set
    : new Set();

  const canonical = aliasToCanonical.get(normalized) || normalized;
  const deprecatedCanonical = deprecatedAliasToCanonical.get(normalized) || null;
  const isDeprecatedAlias = Boolean(deprecatedCanonical);
  const isAlias = !isDeprecatedAlias && normalized !== canonical;
  const isKnown = canonicalSet.has(canonical);

  return {
    raw: `${value}`,
    normalized,
    canonical,
    is_known: isKnown,
    is_alias: isAlias,
    is_deprecated_alias: isDeprecatedAlias,
    deprecated_replacement: isDeprecatedAlias ? deprecatedCanonical : null
  };
}

function tokenizeMoquiCapability(value) {
  const normalized = normalizeMoquiCapabilityToken(value);
  if (!normalized) {
    return [];
  }
  return normalized.split('-').map(item => item.trim()).filter(Boolean);
}

function moquiCapabilityMatch(expected, provided) {
  const leftInfo = resolveMoquiCapabilityDescriptor(expected, MOQUI_CAPABILITY_LEXICON_INDEX);
  const rightInfo = resolveMoquiCapabilityDescriptor(provided, MOQUI_CAPABILITY_LEXICON_INDEX);
  const left = leftInfo ? leftInfo.canonical : null;
  const right = rightInfo ? rightInfo.canonical : null;
  if (!left || !right) {
    return false;
  }
  if (leftInfo && rightInfo && leftInfo.is_known && rightInfo.is_known) {
    return left === right;
  }
  if (left === right) {
    return true;
  }
  if ((left.length >= 8 && left.includes(right)) || (right.length >= 8 && right.includes(left))) {
    return true;
  }
  const leftTokens = tokenizeMoquiCapability(left);
  const rightTokens = tokenizeMoquiCapability(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return false;
  }
  const rightSet = new Set(rightTokens);
  const overlap = leftTokens.filter(item => rightSet.has(item)).length;
  return overlap >= 2;
}

function renderMoquiCapabilityCoverageMarkdown(report = {}) {
  const summary = report.summary && typeof report.summary === 'object'
    ? report.summary
    : {};
  const normalization = report.normalization && typeof report.normalization === 'object'
    ? report.normalization
    : {};
  const warnings = Array.isArray(report.warnings) ? report.warnings : [];
  const coverage = Array.isArray(report.coverage) ? report.coverage : [];
  const compare = report.compare && typeof report.compare === 'object' ? report.compare : null;
  const lines = [
    '# Moqui Capability Coverage Report',
    '',
    `- Generated at: ${report.generated_at || 'n/a'}`,
    `- Expected capabilities: ${summary.total_capabilities !== undefined ? summary.total_capabilities : 'n/a'}`,
    `- Covered capabilities: ${summary.covered_capabilities !== undefined ? summary.covered_capabilities : 'n/a'}`,
    `- Uncovered capabilities: ${summary.uncovered_capabilities !== undefined ? summary.uncovered_capabilities : 'n/a'}`,
    `- Coverage: ${summary.coverage_percent !== undefined && summary.coverage_percent !== null ? `${summary.coverage_percent}%` : 'n/a'}`,
    `- Min required: ${summary.min_required_percent !== undefined && summary.min_required_percent !== null ? `${summary.min_required_percent}%` : 'n/a'}`,
    `- Passed: ${summary.passed === true ? 'yes' : 'no'}`,
    `- Semantic complete: ${summary.semantic_complete_percent !== undefined && summary.semantic_complete_percent !== null ? `${summary.semantic_complete_percent}%` : 'n/a'}`,
    `- Semantic min required: ${summary.min_semantic_required_percent !== undefined && summary.min_semantic_required_percent !== null ? `${summary.min_semantic_required_percent}%` : 'n/a'}`,
    `- Semantic passed: ${summary.semantic_passed === true ? 'yes' : 'no'}`,
    `- Lexicon version: ${normalization.lexicon_version || 'n/a'}`,
    `- Expected alias mapped: ${Array.isArray(normalization.expected_alias_mapped) ? normalization.expected_alias_mapped.length : 0}`,
    `- Expected deprecated alias: ${Array.isArray(normalization.expected_deprecated_aliases) ? normalization.expected_deprecated_aliases.length : 0}`,
    `- Expected unknown: ${Array.isArray(normalization.expected_unknown) ? normalization.expected_unknown.length : 0}`,
    `- Provided alias mapped: ${Array.isArray(normalization.provided_alias_mapped) ? normalization.provided_alias_mapped.length : 0}`,
    `- Provided deprecated alias: ${Array.isArray(normalization.provided_deprecated_aliases) ? normalization.provided_deprecated_aliases.length : 0}`,
    `- Provided unknown: ${Array.isArray(normalization.provided_unknown) ? normalization.provided_unknown.length : 0}`,
    '',
    '## Capability Matrix',
    '',
    '| Capability | Covered | Semantic Complete | Missing Semantic Dimensions | Matched Templates |',
    '| --- | --- | --- | --- | --- |'
  ];

  for (const item of coverage) {
    const matchedTemplates = Array.isArray(item.matched_templates) && item.matched_templates.length > 0
      ? item.matched_templates.join(', ')
      : 'none';
    const semanticMissing = Array.isArray(item.semantic_missing_dimensions) && item.semantic_missing_dimensions.length > 0
      ? item.semantic_missing_dimensions.join(', ')
      : 'none';
    lines.push(
      `| ${item.capability} | ${item.covered ? 'yes' : 'no'} | ${item.semantic_complete ? 'yes' : 'no'} | ${semanticMissing} | ${matchedTemplates} |`
    );
  }

  lines.push('');
  lines.push('## Normalization Warnings');
  lines.push('');
  if (warnings.length === 0) {
    lines.push('- none');
  } else {
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (compare) {
    lines.push('');
    lines.push('## Trend vs Previous');
    lines.push('');
    lines.push(`- Previous generated at: ${compare.previous_generated_at || 'n/a'}`);
    lines.push(`- Delta coverage: ${compare.delta_coverage_percent !== null && compare.delta_coverage_percent !== undefined ? `${compare.delta_coverage_percent}%` : 'n/a'}`);
    lines.push(`- Delta covered capabilities: ${compare.delta_covered_capabilities !== null && compare.delta_covered_capabilities !== undefined ? compare.delta_covered_capabilities : 'n/a'}`);
    lines.push(`- Newly covered: ${Array.isArray(compare.newly_covered) && compare.newly_covered.length > 0 ? compare.newly_covered.join(', ') : 'none'}`);
    lines.push(`- Newly uncovered: ${Array.isArray(compare.newly_uncovered) && compare.newly_uncovered.length > 0 ? compare.newly_uncovered.join(', ') : 'none'}`);
  }

  return `${lines.join('\n')}\n`;
}

function buildCapabilityCoverageComparison(currentPayload, previousPayload) {
  const currentSummary = currentPayload && currentPayload.summary ? currentPayload.summary : {};
  const previousSummary = previousPayload && previousPayload.summary ? previousPayload.summary : {};
  const currentCoverage = Array.isArray(currentPayload && currentPayload.coverage) ? currentPayload.coverage : [];
  const previousCoverage = Array.isArray(previousPayload && previousPayload.coverage) ? previousPayload.coverage : [];
  const currentCovered = new Set(
    currentCoverage.filter(item => item && item.covered === true).map(item => item.capability)
  );
  const previousCovered = new Set(
    previousCoverage.filter(item => item && item.covered === true).map(item => item.capability)
  );
  const newlyCovered = Array.from(currentCovered).filter(item => !previousCovered.has(item)).sort();
  const newlyUncovered = Array.from(previousCovered).filter(item => !currentCovered.has(item)).sort();
  const toDelta = (current, previous) => {
    if (!Number.isFinite(Number(current)) || !Number.isFinite(Number(previous))) {
      return null;
    }
    return Number((Number(current) - Number(previous)).toFixed(2));
  };
  return {
    previous_generated_at: previousPayload && previousPayload.generated_at ? previousPayload.generated_at : null,
    delta_coverage_percent: toDelta(currentSummary.coverage_percent, previousSummary.coverage_percent),
    delta_covered_capabilities: toDelta(currentSummary.covered_capabilities, previousSummary.covered_capabilities),
    newly_covered: newlyCovered,
    newly_uncovered: newlyUncovered
  };
}

async function loadLatestMoquiCapabilityCoverageReport(projectPath) {
  const reportPath = path.join(projectPath, AUTO_HANDOFF_MOQUI_CAPABILITY_COVERAGE_JSON_FILE);
  if (!(await fs.pathExists(reportPath))) {
    return null;
  }
  try {
    const payload = await fs.readJson(reportPath);
    return payload && typeof payload === 'object' ? payload : null;
  } catch (_error) {
    return null;
  }
}

async function buildAutoHandoffCapabilityCoverageSnapshot(projectPath, handoff = null, policy = {}) {
  const expectedRaw = Array.isArray(handoff && handoff.capabilities)
    ? handoff.capabilities
    : [];
  const normalization = {
    lexicon_version: MOQUI_CAPABILITY_LEXICON_INDEX && MOQUI_CAPABILITY_LEXICON_INDEX.version
      ? MOQUI_CAPABILITY_LEXICON_INDEX.version
      : null,
    expected_alias_mapped: [],
    expected_deprecated_aliases: [],
    expected_unknown: [],
    provided_alias_mapped: [],
    provided_deprecated_aliases: [],
    provided_unknown: []
  };
  const warnings = [];
  const minRequiredPercentPolicy = Number(policy.min_capability_coverage_percent);
  const minRequiredPercentValue = Number.isFinite(minRequiredPercentPolicy)
    ? Number(minRequiredPercentPolicy.toFixed(2))
    : 100;
  const minSemanticRequiredPolicy = Number(policy.min_capability_semantic_percent);
  const minSemanticRequiredValue = Number.isFinite(minSemanticRequiredPolicy)
    ? Number(minSemanticRequiredPolicy.toFixed(2))
    : 100;
  const addNormalizationRecord = (target, descriptor) => {
    const list = Array.isArray(normalization[target]) ? normalization[target] : [];
    const item = {
      raw: descriptor.raw,
      normalized: descriptor.normalized,
      canonical: descriptor.canonical
    };
    const key = `${item.raw}|${item.normalized}|${item.canonical}`;
    if (!list.some(existing => `${existing.raw}|${existing.normalized}|${existing.canonical}` === key)) {
      list.push(item);
    }
    normalization[target] = list;
  };
  const expectedMap = new Map();
  for (const rawCapability of expectedRaw) {
    const descriptor = resolveMoquiCapabilityDescriptor(rawCapability, MOQUI_CAPABILITY_LEXICON_INDEX);
    if (!descriptor) {
      continue;
    }
    if (descriptor.is_alias) {
      addNormalizationRecord('expected_alias_mapped', descriptor);
    }
    if (descriptor.is_deprecated_alias) {
      addNormalizationRecord('expected_deprecated_aliases', descriptor);
      warnings.push(
        `manifest capability "${descriptor.raw}" is deprecated; use "${descriptor.deprecated_replacement || descriptor.canonical}" instead`
      );
    }
    if (!descriptor.is_known) {
      addNormalizationRecord('expected_unknown', descriptor);
      warnings.push(`manifest capability "${descriptor.raw}" is unknown to Moqui lexicon`);
    }
    if (!expectedMap.has(descriptor.canonical)) {
      expectedMap.set(descriptor.canonical, {
        capability: descriptor.canonical,
        source_values: [descriptor.normalized]
      });
    } else {
      const existing = expectedMap.get(descriptor.canonical);
      if (!existing.source_values.includes(descriptor.normalized)) {
        existing.source_values.push(descriptor.normalized);
      }
    }
  }
  const expected = Array.from(expectedMap.keys());
  if (expected.length === 0) {
    return {
      status: 'skipped',
      generated: false,
      reason: 'manifest capabilities not declared',
      summary: {
        total_capabilities: 0,
        covered_capabilities: 0,
        uncovered_capabilities: 0,
        coverage_percent: null,
        min_required_percent: minRequiredPercentValue,
        semantic_complete_capabilities: 0,
        semantic_incomplete_capabilities: 0,
        semantic_complete_percent: null,
        min_semantic_required_percent: minSemanticRequiredValue,
        semantic_passed: true,
        passed: true
      },
      coverage: [],
      gaps: [],
      normalization,
      warnings
    };
  }

  const templateRoot = path.join(projectPath, '.sce', 'templates', 'scene-packages');
  if (!(await fs.pathExists(templateRoot))) {
    return {
      status: 'skipped',
      generated: false,
      reason: `template library not found: ${toAutoHandoffCliPath(projectPath, templateRoot)}`,
      summary: {
        total_capabilities: expected.length,
        covered_capabilities: 0,
        uncovered_capabilities: expected.length,
        coverage_percent: 0,
        min_required_percent: minRequiredPercentValue,
        semantic_complete_capabilities: 0,
        semantic_incomplete_capabilities: expected.length,
        semantic_complete_percent: 0,
        min_semantic_required_percent: minSemanticRequiredValue,
        semantic_passed: false,
        passed: false
      },
      coverage: expected.map(item => ({
        capability: item,
        covered: false,
        matched_templates: [],
        matched_provides: [],
        matched_template_semantics: [],
        semantic_complete: false,
        semantic_missing_dimensions: [
          'ontology.entities',
          'ontology.relations',
          'governance.business_rules',
          'governance.decision_logic'
        ],
        source_values: expectedMap.get(item).source_values
      })),
      gaps: expected,
      normalization,
      warnings
    };
  }

  const templateEntries = await fs.readdir(templateRoot);
  const templates = [];
  for (const entry of templateEntries) {
    const templateDir = path.join(templateRoot, entry);
    let stat = null;
    try {
      stat = await fs.stat(templateDir);
    } catch (_error) {
      stat = null;
    }
    if (!stat || !stat.isDirectory()) {
      continue;
    }
    const contractFile = path.join(templateDir, 'scene-package.json');
    if (!(await fs.pathExists(contractFile))) {
      continue;
    }
    try {
      const payload = await fs.readJson(contractFile);
      const providesRaw = [];
      const contractProvides = payload && payload.contract && payload.contract.capabilities && payload.contract.capabilities.provides;
      const rootProvides = payload && payload.capabilities && payload.capabilities.provides;
      if (Array.isArray(contractProvides)) {
        providesRaw.push(...contractProvides);
      }
      if (Array.isArray(rootProvides)) {
        providesRaw.push(...rootProvides);
      }
      const provides = [];
      for (const providedCapability of providesRaw) {
        const descriptor = resolveMoquiCapabilityDescriptor(providedCapability, MOQUI_CAPABILITY_LEXICON_INDEX);
        if (!descriptor) {
          continue;
        }
        if (descriptor.is_alias) {
          addNormalizationRecord('provided_alias_mapped', descriptor);
        }
        if (descriptor.is_deprecated_alias) {
          addNormalizationRecord('provided_deprecated_aliases', descriptor);
          warnings.push(
            `template "${entry}" uses deprecated capability "${descriptor.raw}" (canonical "${descriptor.deprecated_replacement || descriptor.canonical}")`
          );
        }
        if (!descriptor.is_known) {
          addNormalizationRecord('provided_unknown', descriptor);
        }
        provides.push(descriptor.canonical);
      }
      const governanceContract = payload && payload.governance_contract && typeof payload.governance_contract === 'object'
        ? payload.governance_contract
        : {};
      const ontologyModel = payload && payload.ontology_model && typeof payload.ontology_model === 'object'
        ? payload.ontology_model
        : {};
      const businessRules = Array.isArray(governanceContract.business_rules)
        ? governanceContract.business_rules
        : [];
      const decisionLogic = Array.isArray(governanceContract.decision_logic)
        ? governanceContract.decision_logic
        : [];
      const ontologyEntities = Array.isArray(ontologyModel.entities)
        ? ontologyModel.entities
        : [];
      const ontologyRelations = Array.isArray(ontologyModel.relations)
        ? ontologyModel.relations
        : [];
      const semanticMissingDimensions = [];
      if (ontologyEntities.length <= 0) {
        semanticMissingDimensions.push('ontology.entities');
      }
      if (ontologyRelations.length <= 0) {
        semanticMissingDimensions.push('ontology.relations');
      }
      if (businessRules.length <= 0) {
        semanticMissingDimensions.push('governance.business_rules');
      }
      if (decisionLogic.length <= 0) {
        semanticMissingDimensions.push('governance.decision_logic');
      }
      const uniqueProvides = Array.from(new Set(provides));
      if (uniqueProvides.length > 0 && semanticMissingDimensions.length > 0) {
        warnings.push(
          `template "${entry}" semantic coverage missing: ${semanticMissingDimensions.join(', ')}`
        );
      }
      templates.push({
        template_id: entry,
        provides: uniqueProvides,
        semantic: {
          ontology_entities_count: ontologyEntities.length,
          ontology_relations_count: ontologyRelations.length,
          business_rules_count: businessRules.length,
          decision_logic_count: decisionLogic.length,
          missing_dimensions: semanticMissingDimensions,
          complete: semanticMissingDimensions.length === 0
        }
      });
    } catch (_error) {
      // Ignore malformed template package entries.
    }
  }

  const coverage = expected.map(capability => {
    const matchedTemplates = [];
    const matchedProvides = [];
    const matchedTemplateSemantics = [];
    let hasOntologyEntities = false;
    let hasOntologyRelations = false;
    let hasBusinessRules = false;
    let hasDecisionLogic = false;
    for (const template of templates) {
      const providedMatched = template.provides.filter(item => moquiCapabilityMatch(capability, item));
      if (providedMatched.length > 0) {
        matchedTemplates.push(template.template_id);
        matchedProvides.push(...providedMatched);
        const semantic = template.semantic && typeof template.semantic === 'object'
          ? template.semantic
          : {};
        const templateSemantic = {
          template_id: template.template_id,
          ontology_entities_count: Number(semantic.ontology_entities_count) || 0,
          ontology_relations_count: Number(semantic.ontology_relations_count) || 0,
          business_rules_count: Number(semantic.business_rules_count) || 0,
          decision_logic_count: Number(semantic.decision_logic_count) || 0,
          missing_dimensions: Array.isArray(semantic.missing_dimensions) ? semantic.missing_dimensions : [],
          complete: semantic.complete === true
        };
        matchedTemplateSemantics.push(templateSemantic);
        hasOntologyEntities = hasOntologyEntities || templateSemantic.ontology_entities_count > 0;
        hasOntologyRelations = hasOntologyRelations || templateSemantic.ontology_relations_count > 0;
        hasBusinessRules = hasBusinessRules || templateSemantic.business_rules_count > 0;
        hasDecisionLogic = hasDecisionLogic || templateSemantic.decision_logic_count > 0;
      }
    }
    const semanticMissingDimensions = [];
    if (!hasOntologyEntities) {
      semanticMissingDimensions.push('ontology.entities');
    }
    if (!hasOntologyRelations) {
      semanticMissingDimensions.push('ontology.relations');
    }
    if (!hasBusinessRules) {
      semanticMissingDimensions.push('governance.business_rules');
    }
    if (!hasDecisionLogic) {
      semanticMissingDimensions.push('governance.decision_logic');
    }
    const uniqueProvides = Array.from(new Set(matchedProvides)).sort();
    return {
      capability,
      covered: matchedTemplates.length > 0,
      source_values: expectedMap.has(capability) ? expectedMap.get(capability).source_values : [],
      matched_templates: Array.from(new Set(matchedTemplates)).sort(),
      matched_provides: uniqueProvides,
      matched_template_semantics: matchedTemplateSemantics,
      semantic_complete: semanticMissingDimensions.length === 0,
      semantic_missing_dimensions: semanticMissingDimensions
    };
  });

  const coveredCount = coverage.filter(item => item.covered).length;
  const semanticCompleteCount = coverage.filter(item => item.semantic_complete).length;
  const uncovered = coverage.filter(item => !item.covered).map(item => item.capability);
  const coveragePercent = expected.length > 0
    ? Number(((coveredCount / expected.length) * 100).toFixed(2))
    : null;
  const semanticCompletePercent = expected.length > 0
    ? Number(((semanticCompleteCount / expected.length) * 100).toFixed(2))
    : null;
  const minRequiredPercent = minRequiredPercentValue;
  const minSemanticRequiredPercent = minSemanticRequiredValue;
  const passed = Number.isFinite(coveragePercent) && Number.isFinite(minRequiredPercent)
    ? coveragePercent >= minRequiredPercent
    : false;
  const semanticPassed = Number.isFinite(semanticCompletePercent) && Number.isFinite(minSemanticRequiredPercent)
    ? semanticCompletePercent >= minSemanticRequiredPercent
    : false;

  const payload = {
    mode: 'moqui-capability-coverage',
    generated_at: new Date().toISOString(),
    expected_capabilities: expected,
    summary: {
      total_capabilities: expected.length,
      covered_capabilities: coveredCount,
      uncovered_capabilities: expected.length - coveredCount,
      coverage_percent: coveragePercent,
      min_required_percent: minRequiredPercent,
      semantic_complete_capabilities: semanticCompleteCount,
      semantic_incomplete_capabilities: expected.length - semanticCompleteCount,
      semantic_complete_percent: semanticCompletePercent,
      min_semantic_required_percent: minSemanticRequiredPercent,
      semantic_passed: semanticPassed,
      passed
    },
    coverage,
    gaps: uncovered,
    normalization,
    warnings: Array.from(new Set(warnings))
  };

  const previousPayload = await loadLatestMoquiCapabilityCoverageReport(projectPath);
  if (previousPayload) {
    payload.compare = buildCapabilityCoverageComparison(payload, previousPayload);
  }

  const outputJsonPath = path.join(projectPath, AUTO_HANDOFF_MOQUI_CAPABILITY_COVERAGE_JSON_FILE);
  const outputMarkdownPath = path.join(projectPath, AUTO_HANDOFF_MOQUI_CAPABILITY_COVERAGE_MARKDOWN_FILE);
  await fs.ensureDir(path.dirname(outputJsonPath));
  await fs.writeJson(outputJsonPath, payload, { spaces: 2 });
  await fs.writeFile(outputMarkdownPath, renderMoquiCapabilityCoverageMarkdown(payload), 'utf8');

  return {
    status: 'evaluated',
    generated: true,
    summary: payload.summary,
    coverage: payload.coverage,
    gaps: payload.gaps,
    normalization: payload.normalization,
    warnings: payload.warnings,
    compare: payload.compare || null,
    output: {
      json: toAutoHandoffCliPath(projectPath, outputJsonPath),
      markdown: toAutoHandoffCliPath(projectPath, outputMarkdownPath)
    }
  };
}

function buildAutoHandoffCapabilityMatrixRecommendations(result = {}) {
  const recommendations = [];
  const push = value => {
    const text = `${value || ''}`.trim();
    if (!text || recommendations.includes(text)) {
      return;
    }
    recommendations.push(text);
  };

  const manifestPath = normalizeHandoffText(result && result.manifest_path);
  const manifestCli = manifestPath ? quoteCliArg(manifestPath) : '<path>';
  const templateDiff = result && result.template_diff && typeof result.template_diff === 'object'
    ? result.template_diff
    : {};
  const capabilityCoverage = result && result.capability_coverage && typeof result.capability_coverage === 'object'
    ? result.capability_coverage
    : {};
  const coverageSummary = capabilityCoverage && capabilityCoverage.summary && typeof capabilityCoverage.summary === 'object'
    ? capabilityCoverage.summary
    : {};
  const coverageNormalization = capabilityCoverage && capabilityCoverage.normalization &&
    typeof capabilityCoverage.normalization === 'object'
    ? capabilityCoverage.normalization
    : {};
  const expectedUnknownCount = Array.isArray(coverageNormalization.expected_unknown)
    ? coverageNormalization.expected_unknown.length
    : 0;
  const providedUnknownCount = Array.isArray(coverageNormalization.provided_unknown)
    ? coverageNormalization.provided_unknown.length
    : 0;
  const baseline = result && result.moqui_baseline && typeof result.moqui_baseline === 'object'
    ? result.moqui_baseline
    : {};
  const baselineCompare = baseline && baseline.compare && typeof baseline.compare === 'object'
    ? baseline.compare
    : {};
  const baselineRegressions = buildAutoHandoffMoquiCoverageRegressions(baselineCompare);

  if (templateDiff.compatibility === 'needs-sync') {
    push(`Sync template library and rerun: sce auto handoff template-diff --manifest ${manifestCli} --json`);
  }
  if (baseline.status === 'error' || (baseline.summary && baseline.summary.portfolio_passed === false)) {
    push('Rebuild Moqui baseline: sce scene moqui-baseline --json');
  }
  if (baselineRegressions.length > 0) {
    push(
      `Recover Moqui matrix regressions: ` +
      `${baselineRegressions.slice(0, 3).map(item => `${item.label}:${item.delta_rate_percent}%`).join(' | ')}`
    );
    for (const line of buildMoquiRegressionRecoverySequenceLines({
      clusterGoalsArg: quoteCliArg(AUTO_HANDOFF_MOQUI_CLUSTER_REMEDIATION_FILE),
      baselineArg: quoteCliArg(AUTO_HANDOFF_MOQUI_BASELINE_JSON_FILE),
      wrapCommands: false,
      withPeriod: false
    })) {
      push(line);
    }
  }
  if (capabilityCoverage.status === 'skipped') {
    push('Declare `capabilities` in handoff manifest to enable capability matrix coverage gates.');
  }
  if (coverageSummary && coverageSummary.passed === false) {
    push(
      `Close capability gaps with strict gate: ` +
      `sce auto handoff run --manifest ${manifestCli} --min-capability-coverage ${coverageSummary.min_required_percent} --json`
    );
  }
  if (coverageSummary && coverageSummary.semantic_passed === false) {
    push(
      `Backfill capability ontology semantics and rerun matrix: ` +
      `sce scene package-ontology-backfill-batch --manifest ${manifestCli} --json`
    );
  }
  if (expectedUnknownCount > 0 || providedUnknownCount > 0) {
    push(
      `Normalize capability lexicon gaps with strict audit: ` +
      `node scripts/moqui-lexicon-audit.js --manifest ${manifestCli} ` +
      '--template-dir .sce/templates/scene-packages --fail-on-gap --json'
    );
  }
  if (result.remediation_queue && result.remediation_queue.file) {
    push(
      `Replay remediation queue: sce auto close-loop-batch ${quoteCliArg(result.remediation_queue.file)} --format lines --json`
    );
  }

  return recommendations;
}

function renderAutoHandoffCapabilityMatrixMarkdown(payload = {}) {
  const handoff = payload && payload.handoff && typeof payload.handoff === 'object'
    ? payload.handoff
    : {};
  const policy = payload && payload.policy && typeof payload.policy === 'object'
    ? payload.policy
    : {};
  const gates = payload && payload.gates && typeof payload.gates === 'object'
    ? payload.gates
    : {};
  const templateDiff = payload && payload.template_diff && typeof payload.template_diff === 'object'
    ? payload.template_diff
    : {};
  const diff = templateDiff && templateDiff.diff && typeof templateDiff.diff === 'object'
    ? templateDiff.diff
    : {};
  const moquiBaseline = payload && payload.moqui_baseline && typeof payload.moqui_baseline === 'object'
    ? payload.moqui_baseline
    : {};
  const baselineSummary = moquiBaseline && moquiBaseline.summary && typeof moquiBaseline.summary === 'object'
    ? moquiBaseline.summary
    : {};
  const baselineCompare = moquiBaseline && moquiBaseline.compare && typeof moquiBaseline.compare === 'object'
    ? moquiBaseline.compare
    : {};
  const baselineScopeBreakdown = baselineSummary && baselineSummary.scope_breakdown && typeof baselineSummary.scope_breakdown === 'object'
    ? baselineSummary.scope_breakdown
    : {};
  const baselineGapFrequency = Array.isArray(baselineSummary && baselineSummary.gap_frequency)
    ? baselineSummary.gap_frequency
    : [];
  const capabilityCoverage = payload && payload.capability_coverage && typeof payload.capability_coverage === 'object'
    ? payload.capability_coverage
    : {};
  const coverageSummary = capabilityCoverage && capabilityCoverage.summary && typeof capabilityCoverage.summary === 'object'
    ? capabilityCoverage.summary
    : {};
  const coverageNormalization = capabilityCoverage && capabilityCoverage.normalization &&
    typeof capabilityCoverage.normalization === 'object'
    ? capabilityCoverage.normalization
    : {};
  const expectedUnknownCount = Array.isArray(coverageNormalization.expected_unknown)
    ? coverageNormalization.expected_unknown.length
    : 0;
  const providedUnknownCount = Array.isArray(coverageNormalization.provided_unknown)
    ? coverageNormalization.provided_unknown.length
    : 0;
  const coverage = Array.isArray(capabilityCoverage && capabilityCoverage.coverage)
    ? capabilityCoverage.coverage
    : [];
  const recommendations = Array.isArray(payload.recommendations)
    ? payload.recommendations
    : [];

  const lines = [
    '# Auto Handoff Capability Matrix',
    '',
    `- Generated at: ${payload.generated_at || 'n/a'}`,
    `- Status: ${payload.status || 'unknown'}`,
    `- Manifest: ${payload.manifest_path || 'n/a'}`,
    `- Source project: ${payload.source_project || 'n/a'}`,
    `- Specs: ${handoff.spec_count !== undefined ? handoff.spec_count : 'n/a'}`,
    `- Templates: ${handoff.template_count !== undefined ? handoff.template_count : 'n/a'}`,
    `- Capabilities: ${handoff.capability_count !== undefined ? handoff.capability_count : 'n/a'}`,
    `- Policy profile: ${policy.profile || 'default'}`,
    `- Min capability coverage: ${policy.min_capability_coverage_percent !== undefined ? `${policy.min_capability_coverage_percent}%` : 'n/a'}`,
    `- Min capability semantic completeness: ${policy.min_capability_semantic_percent !== undefined ? `${policy.min_capability_semantic_percent}%` : 'n/a'}`,
    `- Capability lexicon gate: ${policy.require_capability_lexicon === false ? 'disabled' : 'enabled'}`,
    '',
    '## Gates',
    '',
    `- Passed: ${gates.passed === true ? 'yes' : 'no'}`,
    `- Reasons: ${Array.isArray(gates.reasons) && gates.reasons.length > 0 ? gates.reasons.join(' | ') : 'none'}`,
    '',
    '## Template Sync',
    '',
    `- Compatibility: ${templateDiff.compatibility || 'unknown'}`,
    `- Missing in local: ${Array.isArray(diff.missing_in_local) ? diff.missing_in_local.length : 0}`,
    `- Extra in local: ${Array.isArray(diff.extra_in_local) ? diff.extra_in_local.length : 0}`,
    '',
    '## Moqui Baseline',
    '',
    `- Status: ${moquiBaseline.status || 'unknown'}`,
    `- Portfolio passed: ${baselineSummary.portfolio_passed === true ? 'yes' : (baselineSummary.portfolio_passed === false ? 'no' : 'n/a')}`,
    `- Avg score: ${formatAutoHandoffRegressionValue(baselineSummary.avg_score)}`,
    `- Valid-rate: ${formatAutoHandoffRegressionValue(baselineSummary.valid_rate_percent)}%`,
    `- Scope mix (moqui/suite/other): ${formatAutoHandoffRegressionValue(baselineScopeBreakdown.moqui_erp, '0')}/${formatAutoHandoffRegressionValue(baselineScopeBreakdown.scene_orchestration, '0')}/${formatAutoHandoffRegressionValue(baselineScopeBreakdown.other, '0')}`,
    `- Entity coverage: ${formatAutoHandoffMoquiCoverageMetric(baselineSummary, 'entity_coverage', 'rate_percent', '%')}`,
    `- Relation coverage: ${formatAutoHandoffMoquiCoverageMetric(baselineSummary, 'relation_coverage', 'rate_percent', '%')}`,
    `- Business-rule coverage: ${formatAutoHandoffMoquiCoverageMetric(baselineSummary, 'business_rule_coverage', 'rate_percent', '%')}`,
    `- Business-rule closed: ${formatAutoHandoffMoquiCoverageMetric(baselineSummary, 'business_rule_closed', 'rate_percent', '%')}`,
    `- Decision coverage: ${formatAutoHandoffMoquiCoverageMetric(baselineSummary, 'decision_coverage', 'rate_percent', '%')}`,
    `- Decision closed: ${formatAutoHandoffMoquiCoverageMetric(baselineSummary, 'decision_closed', 'rate_percent', '%')}`,
    `- Entity coverage delta: ${formatAutoHandoffMoquiCoverageDeltaMetric(baselineCompare, 'entity_coverage', 'rate_percent', '%')}`,
    `- Business-rule closed delta: ${formatAutoHandoffMoquiCoverageDeltaMetric(baselineCompare, 'business_rule_closed', 'rate_percent', '%')}`,
    `- Decision closed delta: ${formatAutoHandoffMoquiCoverageDeltaMetric(baselineCompare, 'decision_closed', 'rate_percent', '%')}`,
    `- Matrix regressions: ${formatAutoHandoffMoquiCoverageRegressions(baselineCompare, 5)}`,
    `- Top baseline gaps: ${baselineGapFrequency.length > 0 ? baselineGapFrequency.slice(0, 3).map(item => `${item.gap}:${item.count}`).join(' | ') : 'none'}`,
    '',
    '## Capability Coverage',
    '',
    `- Status: ${capabilityCoverage.status || 'unknown'}`,
    `- Passed: ${coverageSummary.passed === true ? 'yes' : (coverageSummary.passed === false ? 'no' : 'n/a')}`,
    `- Coverage: ${formatAutoHandoffRegressionValue(coverageSummary.coverage_percent)}%`,
    `- Covered capabilities: ${formatAutoHandoffRegressionValue(coverageSummary.covered_capabilities, '0')}`,
    `- Uncovered capabilities: ${formatAutoHandoffRegressionValue(coverageSummary.uncovered_capabilities, '0')}`,
    `- Semantic complete: ${formatAutoHandoffRegressionValue(coverageSummary.semantic_complete_percent)}%`,
    `- Semantic passed: ${coverageSummary.semantic_passed === true ? 'yes' : (coverageSummary.semantic_passed === false ? 'no' : 'n/a')}`,
    `- Expected unknown capability aliases: ${expectedUnknownCount}`,
    `- Provided unknown capability aliases: ${providedUnknownCount}`,
    '',
    '| Capability | Covered | Semantic Complete | Missing Semantic Dimensions | Matched Templates |',
    '| --- | --- | --- | --- | --- |'
  ];

  if (coverage.length === 0) {
    lines.push('| none | n/a | n/a | n/a | n/a |');
  } else {
    for (const item of coverage) {
      const matchedTemplates = Array.isArray(item && item.matched_templates) && item.matched_templates.length > 0
        ? item.matched_templates.join(', ')
        : 'none';
      const semanticMissing = Array.isArray(item && item.semantic_missing_dimensions)
        && item.semantic_missing_dimensions.length > 0
        ? item.semantic_missing_dimensions.join(', ')
        : 'none';
      lines.push(
        `| ${item && item.capability ? item.capability : 'n/a'} | ${item && item.covered === true ? 'yes' : 'no'} | ${item && item.semantic_complete === true ? 'yes' : 'no'} | ${semanticMissing} | ${matchedTemplates} |`
      );
    }
  }

  if (payload.remediation_queue && payload.remediation_queue.file) {
    lines.push('');
    lines.push('## Remediation Queue');
    lines.push('');
    lines.push(`- File: ${payload.remediation_queue.file}`);
    lines.push(`- Goal count: ${payload.remediation_queue.goal_count}`);
  }

  lines.push('');
  lines.push('## Recommendations');
  lines.push('');
  if (recommendations.length === 0) {
    lines.push('- none');
  } else {
    recommendations.forEach(item => lines.push(`- ${item}`));
  }

  return `${lines.join('\n')}\n`;
}

async function buildAutoHandoffCapabilityMatrix(projectPath, options = {}) {
  const plan = await buildAutoHandoffPlan(projectPath, {
    manifest: options.manifest,
    strict: options.strict,
    strictWarnings: options.strictWarnings
  });

  const policy = buildAutoHandoffCapabilityMatrixPolicy(options);

  const [templateDiff, moquiBaseline, capabilityCoverage] = await Promise.all([
    buildAutoHandoffTemplateDiff(projectPath, { handoff: plan.handoff }),
    buildAutoHandoffMoquiBaselineSnapshot(projectPath),
    buildAutoHandoffCapabilityCoverageSnapshot(projectPath, plan.handoff, policy)
  ]);

  const templateSyncReasons = templateDiff.compatibility === 'ready'
    ? []
    : [`template-sync:${templateDiff.compatibility}`];
  const baselineGateReasons = evaluateAutoHandoffMoquiBaselineGateReasons(
    { require_moqui_baseline: true },
    moquiBaseline
  );
  const capabilityGateReasons = evaluateAutoHandoffCapabilityCoverageGateReasons(
    policy,
    capabilityCoverage
  );
  const semanticGateReasons = evaluateAutoHandoffCapabilitySemanticGateReasons(
    policy,
    capabilityCoverage
  );
  const lexiconGateReasons = evaluateAutoHandoffCapabilityLexiconGateReasons(
    policy,
    capabilityCoverage
  );
  const reasons = [
    ...templateSyncReasons,
    ...baselineGateReasons.map(item => `moqui-baseline:${item}`),
    ...capabilityGateReasons.map(item => `capability-coverage:${item}`),
    ...semanticGateReasons.map(item => `capability-semantic:${item}`),
    ...lexiconGateReasons.map(item => `capability-lexicon:${item}`)
  ];

  const result = {
    mode: 'auto-handoff-capability-matrix',
    generated_at: new Date().toISOString(),
    status: reasons.length === 0 ? 'ready' : 'needs-remediation',
    manifest_path: plan.manifest_path,
    source_project: plan.source_project || null,
    handoff: {
      spec_count: plan.handoff && Number.isFinite(Number(plan.handoff.spec_count))
        ? Number(plan.handoff.spec_count)
        : 0,
      template_count: plan.handoff && Number.isFinite(Number(plan.handoff.template_count))
        ? Number(plan.handoff.template_count)
        : 0,
      capability_count: Array.isArray(plan.handoff && plan.handoff.capabilities)
        ? plan.handoff.capabilities.length
        : 0,
      capability_source: normalizeHandoffText(plan.handoff && plan.handoff.capability_source) || 'manifest',
      capability_inference: plan.handoff && plan.handoff.capability_inference &&
        typeof plan.handoff.capability_inference === 'object'
        ? plan.handoff.capability_inference
        : {
          applied: false,
          inferred_count: 0,
          inferred_capabilities: [],
          inferred_from_templates: [],
          unresolved_template_count: 0,
          unresolved_templates: []
        },
      capabilities: Array.isArray(plan.handoff && plan.handoff.capabilities)
        ? plan.handoff.capabilities
        : []
    },
    policy,
    template_diff: templateDiff,
    moqui_baseline: moquiBaseline,
    capability_coverage: capabilityCoverage,
    gates: {
      passed: reasons.length === 0,
      reasons,
      template_sync: {
        passed: templateSyncReasons.length === 0,
        reasons: templateSyncReasons
      },
      moqui_baseline: {
        passed: baselineGateReasons.length === 0,
        reasons: baselineGateReasons
      },
      capability_coverage: {
        passed: capabilityGateReasons.length === 0,
        reasons: capabilityGateReasons
      },
      capability_semantic: {
        passed: semanticGateReasons.length === 0,
        reasons: semanticGateReasons
      },
      capability_lexicon: {
        passed: lexiconGateReasons.length === 0,
        reasons: lexiconGateReasons
      }
    },
    remediation_queue: null,
    recommendations: []
  };

  result.remediation_queue = await maybeWriteAutoHandoffMoquiRemediationQueue(
    projectPath,
    {
      moqui_baseline: moquiBaseline,
      moqui_capability_coverage: capabilityCoverage
    },
    options.remediationQueueOut
  );
  result.recommendations = buildAutoHandoffCapabilityMatrixRecommendations(result);

  return result;
}

function collectAutoHandoffMoquiRemediationGoals(result) {
  const goals = [];
  const seen = new Set();
  const pushGoal = value => {
    const text = `${value || ''}`.trim();
    if (!text || seen.has(text)) {
      return;
    }
    seen.add(text);
    goals.push(text);
  };

  const moquiBaseline = result && result.moqui_baseline && typeof result.moqui_baseline === 'object'
    ? result.moqui_baseline
    : null;
  const baselineSummary = moquiBaseline && moquiBaseline.summary && typeof moquiBaseline.summary === 'object'
    ? moquiBaseline.summary
    : null;
  const baselineCompare = moquiBaseline && moquiBaseline.compare && typeof moquiBaseline.compare === 'object'
    ? moquiBaseline.compare
    : null;
  const baselineRegressions = buildAutoHandoffMoquiCoverageRegressions(baselineCompare || {});
  const baselineFailedTemplates = baselineCompare && baselineCompare.failed_templates && typeof baselineCompare.failed_templates === 'object'
    ? baselineCompare.failed_templates
    : {};

  if (moquiBaseline && moquiBaseline.status === 'error') {
    pushGoal('repair moqui baseline generation pipeline and regenerate baseline evidence');
  } else if (baselineSummary && baselineSummary.portfolio_passed === false) {
    pushGoal(
      `raise moqui baseline portfolio score (avg=${baselineSummary.avg_score || 'n/a'}, ` +
      `valid-rate=${baselineSummary.valid_rate_percent || 'n/a'}%) to pass thresholds`
    );
    const targetTemplates = Array.isArray(baselineFailedTemplates.current)
      ? baselineFailedTemplates.current
      : [];
    for (const templateId of targetTemplates) {
      pushGoal(`remediate moqui template ${templateId} ontology semantics and close baseline gaps`);
    }
  }
  if (baselineRegressions.length > 0) {
    for (const item of baselineRegressions.slice(0, 5)) {
      pushGoal(
        `recover moqui matrix regression ${item.label} (${item.delta_rate_percent}%) by closing ontology semantic gaps`
      );
      if (item.metric === 'business_rule_closed') {
        pushGoal('remap governance_contract.business_rules for Moqui templates until closure regression is recovered');
      }
      if (item.metric === 'decision_closed') {
        pushGoal('resolve undecided governance_contract.decision_logic entries in Moqui templates');
      }
      if (item.metric === 'entity_coverage' || item.metric === 'relation_coverage') {
        pushGoal('backfill ontology_model entities/relations for regressed Moqui templates');
      }
    }
  }

  const scenePackageBatch = result && result.scene_package_batch && typeof result.scene_package_batch === 'object'
    ? result.scene_package_batch
    : null;
  const sceneBatchSummary = scenePackageBatch && scenePackageBatch.summary && typeof scenePackageBatch.summary === 'object'
    ? scenePackageBatch.summary
    : null;
  const sceneBatchFailures = Array.isArray(scenePackageBatch && scenePackageBatch.failures)
    ? scenePackageBatch.failures
    : [];
  const sceneBatchGateFailures = scenePackageBatch
    && scenePackageBatch.batch_ontology_gate
    && Array.isArray(scenePackageBatch.batch_ontology_gate.failures)
    ? scenePackageBatch.batch_ontology_gate.failures
    : [];
  if (scenePackageBatch && scenePackageBatch.status === 'error') {
    pushGoal('repair scene package publish-batch dry-run gate pipeline and rerun handoff gate');
  } else if (scenePackageBatch && scenePackageBatch.status === 'failed') {
    pushGoal('fix scene package publish-batch dry-run failures before autonomous handoff execution');
    if (sceneBatchSummary) {
      pushGoal(
        `improve scene package batch ontology gate metrics ` +
        `(avg=${sceneBatchSummary.ontology_average_score || 'n/a'}, valid-rate=${sceneBatchSummary.ontology_valid_rate_percent || 'n/a'}%)`
      );
    }
    for (const item of sceneBatchFailures) {
      const spec = item && item.spec ? item.spec : '(unknown)';
      const reason = item && item.error ? item.error : 'publish failed';
      pushGoal(`repair scene package contract for ${spec}: ${reason}`);
    }
    for (const item of sceneBatchGateFailures) {
      const message = item && item.message ? item.message : null;
      if (message) {
        pushGoal(`resolve scene package batch ontology gate failure: ${message}`);
      }
    }
  }

  const capabilityCoverage = result && result.moqui_capability_coverage && typeof result.moqui_capability_coverage === 'object'
    ? result.moqui_capability_coverage
    : null;
  const capabilitySummary = capabilityCoverage && capabilityCoverage.summary && typeof capabilityCoverage.summary === 'object'
    ? capabilityCoverage.summary
    : null;
  const capabilityGaps = capabilityCoverage && Array.isArray(capabilityCoverage.gaps)
    ? capabilityCoverage.gaps
    : [];
  const capabilityNormalization = capabilityCoverage && capabilityCoverage.normalization && typeof capabilityCoverage.normalization === 'object'
    ? capabilityCoverage.normalization
    : null;
  if (
    capabilityCoverage &&
    capabilityCoverage.status === 'evaluated' &&
    capabilitySummary &&
    capabilitySummary.passed === false
  ) {
    pushGoal(
      `increase moqui capability coverage to >=${capabilitySummary.min_required_percent}% ` +
      `(current=${capabilitySummary.coverage_percent || 0}%)`
    );
    for (const capability of capabilityGaps) {
      pushGoal(`implement scene template or ontology mapping for moqui capability ${capability}`);
    }
  }
  if (
    capabilityCoverage &&
    capabilityCoverage.status === 'evaluated' &&
    capabilitySummary &&
    capabilitySummary.semantic_passed === false
  ) {
    pushGoal(
      `increase moqui capability semantic completeness to >=${capabilitySummary.min_semantic_required_percent}% ` +
      `(current=${capabilitySummary.semantic_complete_percent || 0}%)`
    );
    const semanticGaps = Array.isArray(capabilityCoverage.coverage)
      ? capabilityCoverage.coverage.filter(item => item && item.semantic_complete !== true)
      : [];
    for (const item of semanticGaps) {
      const capability = item && item.capability ? item.capability : '(unknown)';
      const missingDimensions = Array.isArray(item && item.semantic_missing_dimensions)
        && item.semantic_missing_dimensions.length > 0
        ? item.semantic_missing_dimensions.join(', ')
        : 'ontology semantic dimensions';
      pushGoal(
        `complete capability semantic dimensions for ${capability}: ${missingDimensions}`
      );
    }
  }
  if (
    capabilityNormalization &&
    Array.isArray(capabilityNormalization.expected_deprecated_aliases) &&
    capabilityNormalization.expected_deprecated_aliases.length > 0
  ) {
    for (const item of capabilityNormalization.expected_deprecated_aliases) {
      const raw = item && item.raw ? item.raw : '(unknown)';
      const canonical = item && item.canonical ? item.canonical : '(unknown)';
      pushGoal(`replace deprecated manifest capability alias ${raw} with canonical ${canonical}`);
    }
  }
  if (
    capabilityNormalization &&
    Array.isArray(capabilityNormalization.expected_unknown) &&
    capabilityNormalization.expected_unknown.length > 0
  ) {
    for (const item of capabilityNormalization.expected_unknown) {
      const raw = item && item.raw ? item.raw : '(unknown)';
      pushGoal(`align unknown manifest capability ${raw} with Moqui capability lexicon`);
    }
  }
  if (
    capabilityNormalization &&
    Array.isArray(capabilityNormalization.provided_unknown) &&
    capabilityNormalization.provided_unknown.length > 0
  ) {
    for (const item of capabilityNormalization.provided_unknown) {
      const raw = item && item.raw ? item.raw : '(unknown)';
      pushGoal(`align unknown template capability ${raw} with Moqui capability lexicon`);
    }
  }

  return goals;
}

async function maybeWriteAutoHandoffMoquiRemediationQueue(projectPath, result, outCandidate) {
  const goals = collectAutoHandoffMoquiRemediationGoals(result);
  if (goals.length === 0) {
    return null;
  }
  const outputCandidate = typeof outCandidate === 'string' && outCandidate.trim().length > 0
    ? outCandidate.trim()
    : AUTO_HANDOFF_MOQUI_REMEDIATION_QUEUE_FILE;
  const queuePath = path.isAbsolute(outputCandidate)
    ? outputCandidate
    : path.join(projectPath, outputCandidate);
  await fs.ensureDir(path.dirname(queuePath));
  await fs.writeFile(queuePath, `${goals.join('\n')}\n`, 'utf8');
  return {
    file: queuePath,
    goal_count: goals.length,
    goals
  };
}

async function runAutoHandoff(projectPath, options = {}) {
  const startedAtMs = Date.now();
  const result = {
    mode: 'auto-handoff-run',
    status: 'running',
    generated_at: new Date().toISOString(),
    session_id: buildAutoHandoffRunSessionId(),
    manifest_path: null,
    source_project: null,
    policy: buildAutoHandoffRunPolicy(options),
    dry_run: Boolean(options.dryRun),
    phases: [],
    handoff: null,
    template_diff: null,
    queue: null,
    continued_from: null,
    dependency_execution: null,
    batch_summary: null,
    observability_snapshot: null,
    spec_status: null,
    ontology_validation: null,
    moqui_baseline: null,
    scene_package_batch: null,
    moqui_capability_coverage: null,
    release_gate_preflight: null,
    remediation_queue: null,
    gates: null,
    regression: null,
    release_evidence: null,
    failure_summary: null,
    recommendations: [],
    warnings: [],
    error: null
  };

  try {
    const precheckPhase = beginAutoHandoffRunPhase(result, 'precheck', 'Plan and precheck');
    let plan = null;
    try {
      plan = await buildAutoHandoffPlan(projectPath, {
        manifest: options.manifest,
        strict: options.strict,
        strictWarnings: options.strictWarnings
      });
      result.manifest_path = plan.manifest_path;
      result.source_project = plan.source_project || null;
      result.handoff = plan.handoff;
      result.ontology_validation = evaluateHandoffOntologyValidation(
        plan && plan.handoff ? plan.handoff.ontology_validation : null
      );
      result.template_diff = await buildAutoHandoffTemplateDiff(projectPath, { manifest: options.manifest });
      result.release_gate_preflight = buildAutoHandoffReleaseGatePreflight(
        await loadGovernanceReleaseGateSignals(projectPath)
      );
      if (result.release_gate_preflight.parse_error) {
        result.warnings.push(
          `release gate preflight parse failed: ${result.release_gate_preflight.parse_error}`
        );
      }
      if (result.release_gate_preflight.blocked === true) {
        const reasonText = result.release_gate_preflight.reasons.length > 0
          ? result.release_gate_preflight.reasons.join('; ')
          : 'release gate blocked';
        result.warnings.push(`release gate preflight is blocked: ${reasonText}`);
      }
      completeAutoHandoffRunPhase(precheckPhase, {
        validation: plan.validation,
        phase_count: Array.isArray(plan.phases) ? plan.phases.length : 0,
        template_compatibility: result.template_diff.compatibility,
        release_gate_preflight: {
          available: result.release_gate_preflight.available,
          blocked: result.release_gate_preflight.blocked,
          latest_tag: result.release_gate_preflight.latest_tag,
          latest_gate_passed: result.release_gate_preflight.latest_gate_passed,
          latest_weekly_ops_runtime_block_rate_percent:
            result.release_gate_preflight.latest_weekly_ops_runtime_block_rate_percent,
          latest_weekly_ops_runtime_ui_mode_violation_total:
            result.release_gate_preflight.latest_weekly_ops_runtime_ui_mode_violation_total,
          latest_weekly_ops_runtime_ui_mode_violation_rate_percent:
            result.release_gate_preflight.latest_weekly_ops_runtime_ui_mode_violation_rate_percent,
          weekly_ops_runtime_block_rate_max_percent:
            result.release_gate_preflight.weekly_ops_runtime_block_rate_max_percent,
          weekly_ops_runtime_ui_mode_violation_total:
            result.release_gate_preflight.weekly_ops_runtime_ui_mode_violation_total,
          weekly_ops_runtime_ui_mode_violation_run_rate_percent:
            result.release_gate_preflight.weekly_ops_runtime_ui_mode_violation_run_rate_percent,
          weekly_ops_runtime_ui_mode_violation_rate_max_percent:
            result.release_gate_preflight.weekly_ops_runtime_ui_mode_violation_rate_max_percent
        }
      });
      const ontologyGateReasons = evaluateAutoHandoffOntologyGateReasons(
        result.policy,
        result.ontology_validation
      );
      if (ontologyGateReasons.length > 0) {
        throw new Error(`handoff ontology validation gate failed: ${ontologyGateReasons.join('; ')}`);
      }
      const releaseGatePreflightReasons = evaluateAutoHandoffReleaseGatePreflightGateReasons(
        result.policy,
        result.release_gate_preflight
      );
      if (releaseGatePreflightReasons.length > 0) {
        throw new Error(`handoff release gate preflight failed: ${releaseGatePreflightReasons.join('; ')}`);
      }
    } catch (error) {
      failAutoHandoffRunPhase(precheckPhase, error);
      throw error;
    }

    const baselinePhase = beginAutoHandoffRunPhase(result, 'moqui-baseline', 'Moqui template baseline scorecard');
    try {
      result.moqui_baseline = await buildAutoHandoffMoquiBaselineSnapshot(projectPath);
      completeAutoHandoffRunPhase(
        baselinePhase,
        buildAutoHandoffMoquiBaselinePhaseDetails(result.moqui_baseline)
      );
      if (result.moqui_baseline && result.moqui_baseline.status === 'error') {
        result.warnings.push(`moqui baseline generation failed: ${result.moqui_baseline.error || 'unknown error'}`);
      }
      const moquiBaselineGateReasons = evaluateAutoHandoffMoquiBaselineGateReasons(
        result.policy,
        result.moqui_baseline
      );
      if (moquiBaselineGateReasons.length > 0) {
        throw new Error(`handoff moqui baseline gate failed: ${moquiBaselineGateReasons.join('; ')}`);
      }
    } catch (baselineError) {
      failAutoHandoffRunPhase(baselinePhase, baselineError);
      if (!result.moqui_baseline) {
        result.moqui_baseline = {
          status: 'error',
          generated: false,
          error: baselineError && baselineError.message ? baselineError.message : `${baselineError}`
        };
      }
      throw baselineError;
    }

    const sceneBatchPhase = beginAutoHandoffRunPhase(
      result,
      'scene-package-batch',
      'Scene package publish-batch dry-run gate'
    );
    try {
      result.scene_package_batch = await buildAutoHandoffScenePackageBatchSnapshot(
        projectPath,
        result.manifest_path
      );
      completeAutoHandoffRunPhase(
        sceneBatchPhase,
        buildAutoHandoffScenePackageBatchPhaseDetails(result.scene_package_batch)
      );
      if (result.scene_package_batch && result.scene_package_batch.status === 'error') {
        result.warnings.push(
          `scene package publish-batch dry-run failed: ${result.scene_package_batch.error || 'unknown error'}`
        );
      }
      const sceneBatchGateReasons = evaluateAutoHandoffScenePackageBatchGateReasons(
        result.policy,
        result.scene_package_batch
      );
      if (sceneBatchGateReasons.length > 0) {
        throw new Error(`handoff scene package batch gate failed: ${sceneBatchGateReasons.join('; ')}`);
      }
    } catch (sceneBatchError) {
      failAutoHandoffRunPhase(sceneBatchPhase, sceneBatchError);
      if (!result.scene_package_batch) {
        result.scene_package_batch = {
          status: 'error',
          generated: false,
          error: sceneBatchError && sceneBatchError.message ? sceneBatchError.message : `${sceneBatchError}`
        };
      }
      throw sceneBatchError;
    }

    const capabilityCoveragePhase = beginAutoHandoffRunPhase(
      result,
      'moqui-capability-coverage',
      'Moqui capability coverage matrix'
    );
    try {
      result.moqui_capability_coverage = await buildAutoHandoffCapabilityCoverageSnapshot(
        projectPath,
        result.handoff,
        result.policy
      );
      completeAutoHandoffRunPhase(capabilityCoveragePhase, {
        status: result.moqui_capability_coverage.status || 'unknown',
        coverage_percent: Number.isFinite(
          Number(
            result.moqui_capability_coverage &&
            result.moqui_capability_coverage.summary
              ? result.moqui_capability_coverage.summary.coverage_percent
              : null
          )
        )
          ? Number(result.moqui_capability_coverage.summary.coverage_percent)
          : null,
        passed: Boolean(
          result.moqui_capability_coverage &&
          result.moqui_capability_coverage.summary &&
          result.moqui_capability_coverage.summary.passed === true
        )
      });
      const capabilityCoverageGateReasons = evaluateAutoHandoffCapabilityCoverageGateReasons(
        result.policy,
        result.moqui_capability_coverage
      );
      if (capabilityCoverageGateReasons.length > 0) {
        throw new Error(`handoff capability coverage gate failed: ${capabilityCoverageGateReasons.join('; ')}`);
      }
      const capabilityLexiconGateReasons = evaluateAutoHandoffCapabilityLexiconGateReasons(
        result.policy,
        result.moqui_capability_coverage
      );
      if (capabilityLexiconGateReasons.length > 0) {
        throw new Error(`handoff capability lexicon gate failed: ${capabilityLexiconGateReasons.join('; ')}`);
      }
    } catch (capabilityCoverageError) {
      failAutoHandoffRunPhase(capabilityCoveragePhase, capabilityCoverageError);
      if (!result.moqui_capability_coverage) {
        result.moqui_capability_coverage = {
          status: 'error',
          generated: false,
          error: capabilityCoverageError && capabilityCoverageError.message
            ? capabilityCoverageError.message
            : `${capabilityCoverageError}`
        };
      }
      throw capabilityCoverageError;
    }

    const queuePhase = beginAutoHandoffRunPhase(result, 'queue', 'Queue generation');
    let queue = null;
    try {
      if (options.continueFrom) {
        queue = await buildAutoHandoffQueueFromContinueSource(projectPath, plan, options);
      } else {
        queue = await buildAutoHandoffQueue(projectPath, {
          manifest: options.manifest,
          out: options.queueOut,
          append: options.append,
          includeKnownGaps: options.includeKnownGaps,
          dryRun: options.dryRun
        });
      }
      if (!queue.dry_run) {
        await writeAutoHandoffQueueFile(projectPath, queue, {
          out: options.queueOut,
          append: options.append
        });
      }
      result.queue = {
        goal_count: queue.goal_count,
        include_known_gaps: queue.include_known_gaps,
        output_file: queue.output_file || null,
        dependency_batching: result.policy.dependency_batching,
        resumed_from: queue.resumed_from || null
      };
      result.continued_from = queue.resumed_from || null;
      completeAutoHandoffRunPhase(queuePhase, {
        goal_count: queue.goal_count,
        output_file: queue.output_file || null,
        resumed_from: queue.resumed_from
          ? {
            session_id: queue.resumed_from.session_id,
            strategy: queue.resumed_from.strategy
          }
          : null
      });
    } catch (error) {
      failAutoHandoffRunPhase(queuePhase, error);
      throw error;
    }

    const continuationBaselineSummary = queue && queue.resume_context && queue.resume_context.previous_batch_summary
      ? queue.resume_context.previous_batch_summary
      : null;

    if (result.dry_run) {
      skipAutoHandoffRunPhase(result, 'execution', 'Autonomous close-loop-batch', 'dry-run');
      skipAutoHandoffRunPhase(result, 'observability', 'Observability snapshot', 'dry-run');
      result.dependency_execution = buildAutoHandoffExecutionBatches(
        result.handoff,
        Array.isArray(queue && queue.goals) ? queue.goals : [],
        result.policy.dependency_batching
      );
      result.spec_status = buildAutoHandoffSpecStatus(
        result.handoff && Array.isArray(result.handoff.specs) ? result.handoff.specs : [],
        null,
        continuationBaselineSummary
      );
      result.gates = evaluateAutoHandoffRunGates({
        policy: result.policy,
        dryRun: true,
        specStatus: result.spec_status,
        ontology: result.ontology_validation,
        moquiBaseline: result.moqui_baseline,
        scenePackageBatch: result.scene_package_batch,
        capabilityCoverage: result.moqui_capability_coverage,
        programKpi: {
          risk_level: 'low'
        }
      });
      result.status = 'dry-run';
      return result;
    }

    const executionPhase = beginAutoHandoffRunPhase(result, 'execution', 'Autonomous close-loop-batch');
    let executionResult = null;
    try {
      executionResult = await executeAutoHandoffExecutionBatches(projectPath, result.handoff, queue, {
        queueOut: options.queueOut,
        continueOnError: options.continueOnError,
        batchAutonomous: options.batchAutonomous,
        batchParallel: options.batchParallel,
        batchAgentBudget: options.batchAgentBudget,
        batchRetryRounds: options.batchRetryRounds,
        batchRetryUntilComplete: options.batchRetryUntilComplete,
        batchRetryMaxRounds: options.batchRetryMaxRounds,
        dependencyBatching: result.policy.dependency_batching
      });
      result.dependency_execution = executionResult.execution_plan;
      result.batch_summary = executionResult.summary;
      result.spec_status = buildAutoHandoffSpecStatus(
        result.handoff && Array.isArray(result.handoff.specs) ? result.handoff.specs : [],
        result.batch_summary,
        continuationBaselineSummary
      );
      completeAutoHandoffRunPhase(executionPhase, {
        status: result.batch_summary.status,
        processed_goals: result.batch_summary.processed_goals,
        failed_goals: result.batch_summary.failed_goals,
        execution_batches: Array.isArray(executionResult.execution_batches)
          ? executionResult.execution_batches.length
          : 0
      });
    } catch (error) {
      failAutoHandoffRunPhase(executionPhase, error);
      throw error;
    }

    const observabilityPhase = beginAutoHandoffRunPhase(result, 'observability', 'Observability snapshot');
    try {
      result.observability_snapshot = await buildAutoObservabilitySnapshot(projectPath, options);
      const observabilityWeeklyOps = extractAutoObservabilityWeeklyOpsStopTelemetry(result.observability_snapshot);
      completeAutoHandoffRunPhase(observabilityPhase, {
        risk_level: result.observability_snapshot && result.observability_snapshot.highlights
          ? result.observability_snapshot.highlights.governance_risk_level
          : null,
        weekly_ops_stop_sessions: Number(
          observabilityWeeklyOps && observabilityWeeklyOps.sessions
        ) || 0,
        weekly_ops_high_pressure_sessions: Number(
          observabilityWeeklyOps && observabilityWeeklyOps.high_pressure_sessions
        ) || 0,
        weekly_ops_config_warning_positive_sessions: Number(
          observabilityWeeklyOps && observabilityWeeklyOps.config_warning_positive_sessions
        ) || 0,
        weekly_ops_auth_tier_pressure_sessions: Number(
          observabilityWeeklyOps && observabilityWeeklyOps.auth_tier_pressure_sessions
        ) || 0,
        weekly_ops_dialogue_authorization_pressure_sessions: Number(
          observabilityWeeklyOps && observabilityWeeklyOps.dialogue_authorization_pressure_sessions
        ) || 0,
        weekly_ops_runtime_block_rate_high_sessions: Number(
          observabilityWeeklyOps && observabilityWeeklyOps.runtime_block_rate_high_sessions
        ) || 0,
        weekly_ops_runtime_ui_mode_violation_high_sessions: Number(
          observabilityWeeklyOps && observabilityWeeklyOps.runtime_ui_mode_violation_high_sessions
        ) || 0,
        weekly_ops_runtime_ui_mode_violation_total_sum: Number(
          observabilityWeeklyOps && observabilityWeeklyOps.runtime_ui_mode_violation_total_sum
        ) || 0
      });
    } catch (error) {
      failAutoHandoffRunPhase(observabilityPhase, error);
      throw error;
    }

    result.gates = evaluateAutoHandoffRunGates({
      policy: result.policy,
      dryRun: false,
      specStatus: result.spec_status,
      ontology: result.ontology_validation,
      moquiBaseline: result.moqui_baseline,
      scenePackageBatch: result.scene_package_batch,
      capabilityCoverage: result.moqui_capability_coverage,
      programKpi: buildProgramKpiSnapshot(result.batch_summary || {})
    });
    if (!result.gates.passed) {
      throw new Error(`handoff run gate failed: ${result.gates.reasons.join('; ')}`);
    }
    result.status = 'completed';
  } catch (error) {
    result.status = 'failed';
    result.error = error && error.message ? error.message : `${error}`;
  } finally {
    result.completed_at = new Date().toISOString();
    result.elapsed_ms = Math.max(0, Date.now() - startedAtMs);
    result.regression = await buildAutoHandoffRegression(projectPath, result);
    result.remediation_queue = await maybeWriteAutoHandoffMoquiRemediationQueue(projectPath, result);
    result.failure_summary = buildAutoHandoffRunFailureSummary(result);
    result.recommendations = buildAutoHandoffRunRecommendations(projectPath, result);
    await writeAutoHandoffRunReport(projectPath, result, options.out);
    if (result.dry_run) {
      result.release_evidence = {
        mode: 'auto-handoff-release-evidence',
        merged: false,
        skipped: true,
        reason: 'dry-run',
        file: path.join(projectPath, AUTO_HANDOFF_RELEASE_EVIDENCE_FILE)
      };
    } else {
      try {
        result.release_evidence = await mergeAutoHandoffRunIntoReleaseEvidence(projectPath, result, result.output_file);
      } catch (mergeError) {
        const message = mergeError && mergeError.message ? mergeError.message : `${mergeError}`;
        result.release_evidence = {
          mode: 'auto-handoff-release-evidence',
          merged: false,
          file: path.join(projectPath, AUTO_HANDOFF_RELEASE_EVIDENCE_FILE),
          error: message
        };
        result.warnings.push(`release evidence merge failed: ${message}`);
      }
    }
    try {
      await writeAutoHandoffRunReport(projectPath, result, options.out);
    } catch (refreshError) {
      const message = refreshError && refreshError.message ? refreshError.message : `${refreshError}`;
      result.warnings.push(`handoff run report refresh failed: ${message}`);
    }
  }

  return result;
}

function buildProgramKpiSnapshot(summary) {
  const results = Array.isArray(summary && summary.results) ? summary.results : [];
  const totalGoals = Number(summary && summary.total_goals) || results.length || 1;
  const completedGoals = Number(summary && summary.completed_goals) || 0;
  const failedGoals = Number(summary && summary.failed_goals) || 0;
  const processedGoals = Number(summary && summary.processed_goals) || results.length;
  const completionRate = Number(((completedGoals / totalGoals) * 100).toFixed(2));
  const failureRate = Number(((failedGoals / totalGoals) * 100).toFixed(2));
  const averageWaitTicks = Number(
    (
      results.reduce((sum, item) => sum + (Number(item && item.wait_ticks) || 0), 0) /
      (results.length || 1)
    ).toFixed(2)
  );
  const highComplexityGoals = results.filter(item => (Number(item && item.goal_weight) || 0) >= 3).length;
  const highComplexityRatioPercent = Number(((highComplexityGoals / totalGoals) * 100).toFixed(2));
  const retry = summary && summary.batch_retry ? summary.batch_retry : {};
  const retryHistory = Array.isArray(retry.history) ? retry.history : [];
  const firstRoundUnresolved = retryHistory.length > 0
    ? (Number(retryHistory[0].failed_goals) || 0) + (Number(retryHistory[0].unprocessed_goals) || 0)
    : failedGoals;
  const recoveredGoals = Math.max(0, firstRoundUnresolved - failedGoals);
  const retryRecoveryRatePercent = firstRoundUnresolved > 0
    ? Number(((recoveredGoals / firstRoundUnresolved) * 100).toFixed(2))
    : 100;

  let convergenceState = 'converged';
  if (summary && summary.status === 'partial-failed') {
    convergenceState = 'at-risk';
  } else if (summary && summary.status === 'failed') {
    convergenceState = 'blocked';
  }

  let riskLevel = 'low';
  if (failureRate > 20 || convergenceState === 'blocked') {
    riskLevel = 'high';
  } else if (failureRate > 0 || (Number(retry.performed_rounds) || 0) > 0) {
    riskLevel = 'medium';
  }

  return {
    generated_at: new Date().toISOString(),
    completion_rate_percent: completionRate,
    failure_rate_percent: failureRate,
    processed_goals: processedGoals,
    high_complexity_goal_ratio_percent: highComplexityRatioPercent,
    average_wait_ticks: averageWaitTicks,
    retry_rounds_performed: Number(retry.performed_rounds) || 0,
    retry_recovery_rate_percent: retryRecoveryRatePercent,
    convergence_state: convergenceState,
    risk_level: riskLevel
  };
}

function evaluateProgramConvergenceGate(summary, policy = {}) {
  const metrics = summary && summary.metrics && typeof summary.metrics === 'object'
    ? summary.metrics
    : {};
  const programKpi = summary && summary.program_kpi && typeof summary.program_kpi === 'object'
    ? summary.program_kpi
    : buildProgramKpiSnapshot(summary || {});
  const resolvedPolicy = resolveProgramGatePolicy(policy);
  const minSuccessRate = resolvedPolicy.minSuccessRate;
  const maxRiskLevel = resolvedPolicy.maxRiskLevel;
  const maxElapsedMinutes = resolvedPolicy.maxElapsedMinutes;
  const maxAgentBudget = resolvedPolicy.maxAgentBudget;
  const maxTotalSubSpecs = resolvedPolicy.maxTotalSubSpecs;
  const completionRateFromKpi = Number(programKpi.completion_rate_percent);
  const successRateFromMetrics = Number(metrics.success_rate_percent);
  const successRate = Number.isFinite(completionRateFromKpi)
    ? completionRateFromKpi
    : (Number.isFinite(successRateFromMetrics) ? successRateFromMetrics : null);
  const elapsedMsCandidate = Number(summary && summary.program_elapsed_ms);
  const elapsedMs = Number.isFinite(elapsedMsCandidate) && elapsedMsCandidate >= 0
    ? elapsedMsCandidate
    : null;
  const elapsedMinutes = elapsedMs === null
    ? null
    : Number((elapsedMs / 60000).toFixed(2));
  const resourcePlan = summary && summary.resource_plan && typeof summary.resource_plan === 'object'
    ? summary.resource_plan
    : {};
  const agentBudgetCandidate = Number(resourcePlan.agent_budget);
  const effectiveParallelCandidate = Number(resourcePlan.effective_goal_parallel);
  const batchParallelCandidate = Number(summary && summary.batch_parallel);
  const actualAgentBudget = Number.isFinite(agentBudgetCandidate) && agentBudgetCandidate > 0
    ? agentBudgetCandidate
    : Number.isFinite(effectiveParallelCandidate) && effectiveParallelCandidate > 0
      ? effectiveParallelCandidate
      : Number.isFinite(batchParallelCandidate) && batchParallelCandidate > 0
        ? batchParallelCandidate
        : null;
  const totalSubSpecsFromMetrics = Number(metrics.total_sub_specs);
  const totalSubSpecs = Number.isFinite(totalSubSpecsFromMetrics)
    ? totalSubSpecsFromMetrics
    : (
      Array.isArray(summary && summary.results)
        ? summary.results.reduce((sum, item) => sum + (Number(item && item.sub_spec_count) || 0), 0)
        : null
    );
  const riskLevel = `${programKpi.risk_level || 'high'}`.trim().toLowerCase();
  const riskRank = {
    low: 1,
    medium: 2,
    high: 3
  };
  const reasons = [];
  if (!Number.isFinite(successRate)) {
    reasons.push('success_rate_percent unavailable');
  } else if (successRate < minSuccessRate) {
    reasons.push(`success_rate_percent ${successRate} < required ${minSuccessRate}`);
  }
  if ((riskRank[riskLevel] || 3) > (riskRank[maxRiskLevel] || 3)) {
    reasons.push(`risk_level ${riskLevel} exceeds allowed ${maxRiskLevel}`);
  }
  if (maxElapsedMinutes !== null) {
    if (!Number.isFinite(elapsedMinutes)) {
      reasons.push('program_elapsed_minutes unavailable');
    } else if (elapsedMinutes > maxElapsedMinutes) {
      reasons.push(`program_elapsed_minutes ${elapsedMinutes} exceeds allowed ${maxElapsedMinutes}`);
    }
  }
  if (maxAgentBudget !== null) {
    if (!Number.isFinite(actualAgentBudget)) {
      reasons.push('agent_budget unavailable');
    } else if (actualAgentBudget > maxAgentBudget) {
      reasons.push(`agent_budget ${actualAgentBudget} exceeds allowed ${maxAgentBudget}`);
    }
  }
  if (maxTotalSubSpecs !== null) {
    if (!Number.isFinite(totalSubSpecs)) {
      reasons.push('total_sub_specs unavailable');
    } else if (totalSubSpecs > maxTotalSubSpecs) {
      reasons.push(`total_sub_specs ${totalSubSpecs} exceeds allowed ${maxTotalSubSpecs}`);
    }
  }

  return {
    passed: reasons.length === 0,
    policy: {
      profile: resolvedPolicy.profile,
      min_success_rate_percent: minSuccessRate,
      max_risk_level: maxRiskLevel,
      max_elapsed_minutes: maxElapsedMinutes,
      max_agent_budget: maxAgentBudget,
      max_total_sub_specs: maxTotalSubSpecs
    },
    actual: {
      success_rate_percent: Number.isFinite(successRate) ? successRate : null,
      risk_level: riskLevel,
      elapsed_minutes: Number.isFinite(elapsedMinutes) ? elapsedMinutes : null,
      agent_budget: Number.isFinite(actualAgentBudget) ? actualAgentBudget : null,
      total_sub_specs: Number.isFinite(totalSubSpecs) ? totalSubSpecs : null
    },
    reasons
  };
}

async function applyProgramGateOutcome(summary, context = {}) {
  const projectPath = context && context.projectPath ? context.projectPath : process.cwd();
  const options = context && context.options && typeof context.options === 'object'
    ? context.options
    : {};
  const resolvedPolicy = resolveProgramGatePolicy(context && context.programGatePolicy ? context.programGatePolicy : {});
  const gateFallbackChain = Array.isArray(context && context.gateFallbackChain)
    ? context.gateFallbackChain
    : [];
  const enableAutoRemediation = context && context.enableAutoRemediation !== undefined
    ? Boolean(context.enableAutoRemediation)
    : true;

  summary.program_gate = evaluateProgramConvergenceGate(summary, {
    profile: resolvedPolicy.profile,
    minSuccessRate: resolvedPolicy.minSuccessRate,
    maxRiskLevel: resolvedPolicy.maxRiskLevel,
    maxElapsedMinutes: resolvedPolicy.maxElapsedMinutes,
    maxAgentBudget: resolvedPolicy.maxAgentBudget,
    maxTotalSubSpecs: resolvedPolicy.maxTotalSubSpecs
  });

  let effectiveGatePassed = summary.program_gate.passed;
  let effectiveGateSource = 'primary';
  let matchedFallbackProfile = null;
  summary.program_gate_fallbacks = [];
  if (!effectiveGatePassed && gateFallbackChain.length > 0) {
    for (const fallbackProfile of gateFallbackChain) {
      const fallbackResult = evaluateProgramConvergenceGate(summary, {
        profile: fallbackProfile,
        maxElapsedMinutes: resolvedPolicy.maxElapsedMinutes,
        maxAgentBudget: resolvedPolicy.maxAgentBudget,
        maxTotalSubSpecs: resolvedPolicy.maxTotalSubSpecs
      });
      summary.program_gate_fallbacks.push(fallbackResult);
      if (fallbackResult.passed) {
        effectiveGatePassed = true;
        effectiveGateSource = 'fallback-chain';
        matchedFallbackProfile = fallbackProfile;
        break;
      }
    }
  }
  summary.program_gate_fallback = summary.program_gate_fallbacks.length > 0
    ? summary.program_gate_fallbacks[0]
    : null;
  summary.program_gate_effective = {
    passed: effectiveGatePassed,
    source: effectiveGateSource,
    primary_passed: Boolean(summary.program_gate && summary.program_gate.passed),
    fallback_profile: matchedFallbackProfile,
    fallback_chain: gateFallbackChain,
    fallback_passed: matchedFallbackProfile !== null,
    attempted_fallback_count: summary.program_gate_fallbacks.length
  };

  if (
    enableAutoRemediation &&
    (
      !summary.program_gate_effective.passed ||
      isSpecSessionBudgetHardFailure(summary) ||
      isSpecSessionGrowthGuardHardFailure(summary)
    )
  ) {
    summary.program_gate_auto_remediation = await applyProgramGateAutoRemediation(summary, {
      projectPath,
      options
    });
  }

  return summary;
}

function hasRecoverableProgramGoals(summary) {
  const failedStatuses = getBatchFailureStatusSet();
  const results = Array.isArray(summary && summary.results) ? summary.results : [];
  return results.some(item => failedStatuses.has(`${item && item.status ? item.status : ''}`.trim().toLowerCase()));
}

function applyAnomalyBatchConcurrencyReductionPatch(summary, patch, reasons, options, anomalyType) {
  const currentParallelCandidate = patch.batchParallel !== undefined && patch.batchParallel !== null
    ? patch.batchParallel
    : (
      options.batchParallel !== undefined && options.batchParallel !== null
        ? options.batchParallel
        : (summary && summary.batch_parallel ? summary.batch_parallel : 1)
    );
  const currentParallel = normalizeBatchParallel(currentParallelCandidate);
  if (currentParallel > 1) {
    patch.batchParallel = currentParallel - 1;
    reasons.push(`reduce batch parallel from ${currentParallel} to ${patch.batchParallel} due to ${anomalyType}`);
  }

  const currentAgentBudgetCandidate = patch.batchAgentBudget !== undefined && patch.batchAgentBudget !== null
    ? patch.batchAgentBudget
    : (
      options.batchAgentBudget !== undefined && options.batchAgentBudget !== null
        ? options.batchAgentBudget
        : (summary && summary.resource_plan ? summary.resource_plan.agent_budget : null)
    );
  const currentAgentBudget = normalizeBatchAgentBudget(currentAgentBudgetCandidate);
  if (currentAgentBudget !== null && currentAgentBudget > 1) {
    patch.batchAgentBudget = currentAgentBudget - 1;
    reasons.push(`reduce batch agent budget from ${currentAgentBudget} to ${patch.batchAgentBudget} due to ${anomalyType}`);
  }
}

function buildProgramAnomalyGovernancePatch(summary, anomalies, options = {}) {
  const sourceAnomalies = Array.isArray(anomalies) ? anomalies : [];
  const highAnomalies = sourceAnomalies.filter(item => `${item && item.severity ? item.severity : ''}`.trim().toLowerCase() === 'high');
  const patch = {};
  const reasons = [];

  const anomalyTypes = new Set(highAnomalies.map(item => `${item && item.type ? item.type : ''}`.trim().toLowerCase()));
  if (anomalyTypes.has('success-rate-drop')) {
    const currentRetryRounds = normalizeBatchRetryRounds(options.batchRetryRounds);
    patch.batchRetryRounds = Math.min(5, Math.max(1, currentRetryRounds + 1));
    patch.batchRetryUntilComplete = true;
    reasons.push('increase retry rounds due to success-rate-drop anomaly');
  }

  if (anomalyTypes.has('failed-goals-spike')) {
    applyAnomalyBatchConcurrencyReductionPatch(summary, patch, reasons, options, 'failed-goals-spike');
  }

  if (anomalyTypes.has('rate-limit-spike')) {
    applyAnomalyBatchConcurrencyReductionPatch(summary, patch, reasons, options, 'rate-limit-spike');
  }

  if (anomalyTypes.has('spec-growth-spike')) {
    patch.specSessionBudgetHardFail = true;
    reasons.push('enable spec-session budget hard-fail due to spec-growth-spike');
    if (options.specSessionMaxCreated === undefined || options.specSessionMaxCreated === null) {
      const estimatedCreated = Number(summary && summary.spec_session_budget && summary.spec_session_budget.estimated_created) || 0;
      patch.specSessionMaxCreated = Math.max(1, Math.ceil(estimatedCreated * 0.8));
      reasons.push(`set specSessionMaxCreated=${patch.specSessionMaxCreated} due to spec-growth-spike`);
    }
  }

  return {
    patch,
    reasons,
    anomaly_count: highAnomalies.length,
    anomaly_types: [...anomalyTypes]
  };
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

async function runProgramGovernanceLoop(context = {}) {
  let summary = context.summary && typeof context.summary === 'object' ? context.summary : {};
  const projectPath = context.projectPath || process.cwd();
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
  const governanceStartedAt = Date.now();
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
    const elapsedBeforeRound = Date.now() - governanceStartedAt;
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
    if (hasRecoverableProgramGoals(summary)) {
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

async function applyProgramGateAutoRemediation(summary, context = {}) {
  const projectPath = context && context.projectPath ? context.projectPath : process.cwd();
  const options = context && context.options && typeof context.options === 'object'
    ? context.options
    : {};
  const gate = summary && summary.program_gate && typeof summary.program_gate === 'object'
    ? summary.program_gate
    : null;
  const policy = gate && gate.policy && typeof gate.policy === 'object' ? gate.policy : {};
  const reasons = Array.isArray(gate && gate.reasons) ? gate.reasons : [];
  const actions = [];
  const nextRunPatch = {};

  const maxAgentBudget = Number(policy.max_agent_budget);
  if (
    reasons.some(reason => `${reason || ''}`.includes('agent_budget')) &&
    Number.isFinite(maxAgentBudget) &&
    maxAgentBudget > 0
  ) {
    const currentAgentBudget = Number(options.batchAgentBudget || (summary && summary.batch_parallel) || 0);
    nextRunPatch.batchAgentBudget = maxAgentBudget;
    nextRunPatch.batchParallel = Math.max(1, Math.min(currentAgentBudget || maxAgentBudget, maxAgentBudget));
    actions.push({
      type: 'reduce-agent-budget',
      applied: true,
      details: `Set batchAgentBudget=${nextRunPatch.batchAgentBudget}, batchParallel=${nextRunPatch.batchParallel}.`
    });
  }

  const maxTotalSubSpecs = Number(policy.max_total_sub_specs);
  if (
    reasons.some(reason => `${reason || ''}`.includes('total_sub_specs')) &&
    Number.isFinite(maxTotalSubSpecs) &&
    maxTotalSubSpecs > 0
  ) {
    const avgSubSpecs = Number(summary && summary.metrics && summary.metrics.average_sub_specs_per_goal) || 1;
    const totalGoals = Number(summary && summary.total_goals) || 2;
    const suggestedProgramGoals = Math.max(2, Math.min(totalGoals, Math.floor(maxTotalSubSpecs / Math.max(1, avgSubSpecs))));
    nextRunPatch.programGoals = suggestedProgramGoals;
    actions.push({
      type: 'shrink-goal-width',
      applied: true,
      details: `Set programGoals=${suggestedProgramGoals} using max_total_sub_specs=${maxTotalSubSpecs}.`
    });
  }

  const maxElapsedMinutes = Number(policy.max_elapsed_minutes);
  if (
    reasons.some(reason => `${reason || ''}`.includes('program_elapsed_minutes')) &&
    Number.isFinite(maxElapsedMinutes) &&
    maxElapsedMinutes > 0
  ) {
    const totalGoals = Number(summary && summary.total_goals) || 2;
    const reducedProgramGoals = Math.max(2, Math.min(totalGoals, Math.ceil(totalGoals * 0.8)));
    nextRunPatch.programGoals = Math.min(
      Number(nextRunPatch.programGoals) || reducedProgramGoals,
      reducedProgramGoals
    );
    nextRunPatch.batchRetryRounds = 0;
    actions.push({
      type: 'time-budget-constrain',
      applied: true,
      details: `Set programGoals=${nextRunPatch.programGoals}, batchRetryRounds=0 for elapsed budget ${maxElapsedMinutes}m.`
    });
  }

  let appliedSpecPrune = null;
  const specBudget = summary && summary.spec_session_budget && summary.spec_session_budget.enabled
    ? summary.spec_session_budget
    : null;
  if (specBudget && specBudget.over_limit_after && Number.isFinite(Number(specBudget.max_total))) {
    try {
      const currentRunSpecNames = collectSpecNamesFromBatchSummary(summary || {});
      appliedSpecPrune = await pruneSpecSessions(projectPath, {
        keep: Number(specBudget.max_total),
        olderThanDays: null,
        dryRun: false,
        protectActive: true,
        protectWindowDays: options.specSessionProtectWindowDays,
        additionalProtectedSpecs: currentRunSpecNames
      });
      summary.spec_session_auto_prune = appliedSpecPrune;
      const specsAfter = await readSpecSessionEntries(projectPath);
      const totalAfter = specsAfter.length;
      const prunedCount = Number(appliedSpecPrune && appliedSpecPrune.deleted_count) || 0;
      summary.spec_session_budget = {
        ...specBudget,
        total_after: totalAfter,
        pruned_count: (Number(specBudget.pruned_count) || 0) + prunedCount,
        estimated_created: Math.max(0, totalAfter + ((Number(specBudget.pruned_count) || 0) + prunedCount) - specBudget.total_before),
        over_limit_after: totalAfter > specBudget.max_total,
        hard_fail_triggered: Boolean(specBudget.hard_fail && totalAfter > specBudget.max_total)
      };
      actions.push({
        type: 'trigger-spec-prune',
        applied: true,
        details: `Pruned specs to enforce max_total=${specBudget.max_total}. deleted=${appliedSpecPrune.deleted_count}`
      });
    } catch (error) {
      actions.push({
        type: 'trigger-spec-prune',
        applied: false,
        error: error.message
      });
    }
  }

  const hasPatch = Object.keys(nextRunPatch).length > 0;
  return {
    enabled: true,
    attempted_at: new Date().toISOString(),
    reason_count: reasons.length,
    reasons,
    actions,
    next_run_patch: hasPatch ? nextRunPatch : null,
    applied_spec_prune: appliedSpecPrune
  };
}

function normalizeFailureSignatureFromError(errorMessage) {
  if (typeof errorMessage !== 'string' || !errorMessage.trim()) {
    return 'no-error-details';
  }

  return errorMessage
    .toLowerCase()
    .replace(/[0-9]+/g, '#')
    .replace(/[a-z]:\\[^ ]+/gi, '<path>')
    .replace(/\/[^ ]+/g, '<path>')
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

async function maybeWriteProgramKpi(summary, outCandidate, projectPath) {
  if (!outCandidate) {
    return;
  }

  const outputPath = path.isAbsolute(outCandidate)
    ? outCandidate
    : path.join(projectPath, outCandidate);
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeJson(outputPath, {
    mode: summary.mode === 'auto-close-loop-recover'
      ? 'auto-close-loop-recover-kpi'
      : 'auto-close-loop-program-kpi',
    program_mode: summary.mode,
    status: summary.status,
    program_started_at: summary.program_started_at || null,
    program_completed_at: summary.program_completed_at || null,
    program_elapsed_ms: Number.isFinite(Number(summary.program_elapsed_ms))
      ? Number(summary.program_elapsed_ms)
      : null,
    total_goals: summary.total_goals,
    processed_goals: summary.processed_goals,
    completed_goals: summary.completed_goals,
    failed_goals: summary.failed_goals,
    metrics: summary.metrics,
    program_kpi: summary.program_kpi,
    program_diagnostics: summary.program_diagnostics,
    program_coordination: summary.program_coordination || null,
    auto_recovery: summary.auto_recovery || null,
    program_governance: summary.program_governance || null,
    program_kpi_trend: summary.program_kpi_trend || null,
    program_kpi_anomalies: Array.isArray(summary.program_kpi_anomalies) ? summary.program_kpi_anomalies : [],
    goal_input_guard: summary.goal_input_guard || null,
    spec_session_budget: summary.spec_session_budget || null,
    spec_session_growth_guard: summary.spec_session_growth_guard || null,
    spec_session_auto_prune: summary.spec_session_auto_prune || null,
    program_gate_auto_remediation: summary.program_gate_auto_remediation || null,
    program_gate: summary.program_gate || null,
    program_gate_fallback: summary.program_gate_fallback || null,
    program_gate_fallbacks: summary.program_gate_fallbacks || [],
    program_gate_effective: summary.program_gate_effective || null
  }, { spaces: 2 });
  summary.program_kpi_file = outputPath;
}

async function maybeWriteProgramAudit(summary, outCandidate, projectPath) {
  if (!outCandidate) {
    return;
  }
  const outputPath = path.isAbsolute(outCandidate)
    ? outCandidate
    : path.join(projectPath, outCandidate);
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeJson(outputPath, {
    mode: 'auto-close-loop-program-audit',
    generated_at: new Date().toISOString(),
    summary_mode: summary && summary.mode ? summary.mode : null,
    status: summary && summary.status ? summary.status : null,
    program_started_at: summary && summary.program_started_at ? summary.program_started_at : null,
    program_completed_at: summary && summary.program_completed_at ? summary.program_completed_at : null,
    program_elapsed_ms: Number.isFinite(Number(summary && summary.program_elapsed_ms))
      ? Number(summary && summary.program_elapsed_ms)
      : null,
    totals: {
      total_goals: Number(summary && summary.total_goals) || 0,
      processed_goals: Number(summary && summary.processed_goals) || 0,
      completed_goals: Number(summary && summary.completed_goals) || 0,
      failed_goals: Number(summary && summary.failed_goals) || 0
    },
    metrics: summary && summary.metrics ? summary.metrics : null,
    batch_retry: summary && summary.batch_retry ? summary.batch_retry : null,
    program_kpi: summary && summary.program_kpi ? summary.program_kpi : null,
    program_diagnostics: summary && summary.program_diagnostics ? summary.program_diagnostics : null,
    program_coordination: summary && summary.program_coordination ? summary.program_coordination : null,
    program_gate: summary && summary.program_gate ? summary.program_gate : null,
    program_gate_fallback: summary && summary.program_gate_fallback ? summary.program_gate_fallback : null,
    program_gate_fallbacks: Array.isArray(summary && summary.program_gate_fallbacks) ? summary.program_gate_fallbacks : [],
    program_gate_effective: summary && summary.program_gate_effective ? summary.program_gate_effective : null,
    auto_recovery: summary && summary.auto_recovery ? summary.auto_recovery : null,
    program_governance: summary && summary.program_governance ? summary.program_governance : null,
    program_kpi_trend: summary && summary.program_kpi_trend ? summary.program_kpi_trend : null,
    program_kpi_anomalies: Array.isArray(summary && summary.program_kpi_anomalies) ? summary.program_kpi_anomalies : [],
    recovery_cycle: summary && summary.recovery_cycle ? summary.recovery_cycle : null,
    recovery_plan: summary && summary.recovery_plan ? summary.recovery_plan : null,
    recovery_memory: summary && summary.recovery_memory ? summary.recovery_memory : null,
    goal_input_guard: summary && summary.goal_input_guard ? summary.goal_input_guard : null,
    spec_session_prune: summary && summary.spec_session_prune ? summary.spec_session_prune : null,
    spec_session_budget: summary && summary.spec_session_budget ? summary.spec_session_budget : null,
    spec_session_growth_guard: summary && summary.spec_session_growth_guard ? summary.spec_session_growth_guard : null,
    spec_session_auto_prune: summary && summary.spec_session_auto_prune ? summary.spec_session_auto_prune : null,
    program_gate_auto_remediation: summary && summary.program_gate_auto_remediation ? summary.program_gate_auto_remediation : null,
    resource_plan: summary && summary.resource_plan ? summary.resource_plan : null,
    results: Array.isArray(summary && summary.results) ? summary.results : []
  }, { spaces: 2 });
  summary.program_audit_file = outputPath;
}

function normalizeBatchSessionKeep(keepCandidate) {
  if (keepCandidate === undefined || keepCandidate === null) {
    return null;
  }

  const parsed = Number(keepCandidate);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1000) {
    throw new Error('--batch-session-keep must be an integer between 0 and 1000.');
  }
  return parsed;
}

function normalizeBatchSessionOlderThanDays(daysCandidate) {
  if (daysCandidate === undefined || daysCandidate === null) {
    return null;
  }

  const parsed = Number(daysCandidate);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 36500) {
    throw new Error('--batch-session-older-than-days must be an integer between 0 and 36500.');
  }
  return parsed;
}

function sanitizeBatchSessionId(value) {
  return `${value || ''}`
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function createBatchSessionId() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `batch-${timestamp}`;
}

function getCloseLoopControllerSessionDir(projectPath) {
  return path.join(projectPath, '.sce', 'auto', 'close-loop-controller-sessions');
}

function createControllerSessionId() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `controller-${timestamp}`;
}

function getGovernanceCloseLoopSessionDir(projectPath) {
  return path.join(projectPath, '.sce', 'auto', 'governance-close-loop-sessions');
}

function createGovernanceCloseLoopSessionId() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `governance-${timestamp}`;
}

function deriveGovernanceWeeklyOpsReasonFlags(reasonsCandidate) {
  const reasons = Array.isArray(reasonsCandidate)
    ? reasonsCandidate.map(item => `${item || ''}`.trim().toLowerCase()).filter(Boolean)
    : [];
  const hasWeeklyOpsReason = reasons.some(reason => reason.startsWith('weekly-ops-'));
  const hasBlockedReason = reasons.some(reason => (
    reason === 'weekly-ops-latest-blocked' ||
    reason.startsWith('weekly-ops-blocked-runs-positive:') ||
    reason.startsWith('weekly-ops-block-rate-positive:')
  ));
  const hasHighReason = reasons.some(reason => (
    reason === 'weekly-ops-latest-risk-high' ||
    reason.startsWith('weekly-ops-auth-tier-block-rate-high:') ||
    reason.startsWith('weekly-ops-dialogue-authorization-block-rate-high:') ||
    reason.startsWith('weekly-ops-latest-auth-tier-block-rate-high:') ||
    reason.startsWith('weekly-ops-latest-dialogue-authorization-block-rate-high:') ||
    reason.startsWith('weekly-ops-latest-runtime-block-rate-high:') ||
    reason.startsWith('weekly-ops-runtime-block-rate-high:') ||
    reason.startsWith('weekly-ops-latest-runtime-ui-mode-violations-positive:') ||
    reason.startsWith('weekly-ops-runtime-ui-mode-violations-positive:') ||
    reason.startsWith('weekly-ops-latest-runtime-ui-mode-violation-rate-positive:') ||
    reason.startsWith('weekly-ops-runtime-ui-mode-violation-run-rate-positive:') ||
    reason.startsWith('weekly-ops-runtime-ui-mode-violation-rate-high:')
  ));
  const hasConfigWarningReason = reasons.some(reason => (
    reason.startsWith('weekly-ops-config-warnings-positive:') ||
    reason.startsWith('weekly-ops-latest-config-warnings-positive:')
  ));
  const hasAuthTierHighReason = reasons.some(reason => (
    reason.startsWith('weekly-ops-auth-tier-block-rate-high:') ||
    reason.startsWith('weekly-ops-latest-auth-tier-block-rate-high:')
  ));
  const hasDialogueHighReason = reasons.some(reason => (
    reason.startsWith('weekly-ops-dialogue-authorization-block-rate-high:') ||
    reason.startsWith('weekly-ops-latest-dialogue-authorization-block-rate-high:')
  ));
  const hasRuntimeBlockRateHighReason = reasons.some(reason => (
    reason.startsWith('weekly-ops-latest-runtime-block-rate-high:') ||
    reason.startsWith('weekly-ops-runtime-block-rate-high:')
  ));
  const hasRuntimeUiModeViolationReason = reasons.some(reason => (
    reason.startsWith('weekly-ops-latest-runtime-ui-mode-violations-positive:') ||
    reason.startsWith('weekly-ops-runtime-ui-mode-violations-positive:') ||
    reason.startsWith('weekly-ops-latest-runtime-ui-mode-violation-rate-positive:') ||
    reason.startsWith('weekly-ops-runtime-ui-mode-violation-run-rate-positive:') ||
    reason.startsWith('weekly-ops-runtime-ui-mode-violation-rate-high:')
  ));
  return {
    has_weekly_ops_reason: hasWeeklyOpsReason,
    blocked: hasBlockedReason,
    high: hasHighReason,
    config_warning_positive: hasConfigWarningReason,
    auth_tier_block_rate_high: hasAuthTierHighReason,
    dialogue_authorization_block_rate_high: hasDialogueHighReason,
    runtime_block_rate_high: hasRuntimeBlockRateHighReason,
    runtime_ui_mode_violation_high: hasRuntimeUiModeViolationReason
  };
}

function normalizeGovernanceHandoffQualitySnapshot(snapshotCandidate) {
  if (!snapshotCandidate || typeof snapshotCandidate !== 'object' || Array.isArray(snapshotCandidate)) {
    return null;
  }
  return {
    available: snapshotCandidate.available === true,
    total_runs: toGovernanceReleaseGateNumber(snapshotCandidate.total_runs),
    latest_status: normalizeHandoffText(snapshotCandidate.latest_status),
    latest_gate_passed: parseAutoHandoffGateBoolean(snapshotCandidate.latest_gate_passed, null),
    latest_ontology_quality_score: toGovernanceReleaseGateNumber(snapshotCandidate.latest_ontology_quality_score),
    latest_capability_coverage_percent: toGovernanceReleaseGateNumber(snapshotCandidate.latest_capability_coverage_percent),
    latest_capability_coverage_passed: parseAutoHandoffGateBoolean(snapshotCandidate.latest_capability_coverage_passed, null),
    latest_capability_expected_unknown_count: toGovernanceReleaseGateNumber(
      snapshotCandidate.latest_capability_expected_unknown_count
    ),
    latest_capability_provided_unknown_count: toGovernanceReleaseGateNumber(
      snapshotCandidate.latest_capability_provided_unknown_count
    ),
    latest_moqui_matrix_regression_count: toGovernanceReleaseGateNumber(
      snapshotCandidate.latest_moqui_matrix_regression_count
    ),
    latest_moqui_matrix_regression_gate_max: toGovernanceReleaseGateNumber(
      snapshotCandidate.latest_moqui_matrix_regression_gate_max
    ),
    latest_release_gate_preflight_blocked: parseAutoHandoffGateBoolean(
      snapshotCandidate.latest_release_gate_preflight_blocked,
      null
    ),
    failure_rate_percent: toGovernanceReleaseGateNumber(snapshotCandidate.failure_rate_percent),
    gate_pass_rate_percent: toGovernanceReleaseGateNumber(snapshotCandidate.gate_pass_rate_percent),
    capability_coverage_pass_rate_percent: toGovernanceReleaseGateNumber(
      snapshotCandidate.capability_coverage_pass_rate_percent
    ),
    capability_expected_unknown_positive_rate_percent: toGovernanceReleaseGateNumber(
      snapshotCandidate.capability_expected_unknown_positive_rate_percent
    ),
    capability_provided_unknown_positive_rate_percent: toGovernanceReleaseGateNumber(
      snapshotCandidate.capability_provided_unknown_positive_rate_percent
    ),
    avg_moqui_matrix_regression_count: toGovernanceReleaseGateNumber(
      snapshotCandidate.avg_moqui_matrix_regression_count
    ),
    max_moqui_matrix_regression_count: toGovernanceReleaseGateNumber(
      snapshotCandidate.max_moqui_matrix_regression_count
    ),
    moqui_matrix_regression_positive_rate_percent: toGovernanceReleaseGateNumber(
      snapshotCandidate.moqui_matrix_regression_positive_rate_percent
    )
  };
}

function areGovernanceReleaseGateSnapshotsEqual(leftSnapshot, rightSnapshot) {
  if (!leftSnapshot && !rightSnapshot) {
    return true;
  }
  if (!leftSnapshot || !rightSnapshot) {
    return false;
  }
  return (
    leftSnapshot.available === rightSnapshot.available &&
    leftSnapshot.latest_gate_passed === rightSnapshot.latest_gate_passed &&
    leftSnapshot.pass_rate_percent === rightSnapshot.pass_rate_percent &&
    leftSnapshot.scene_package_batch_pass_rate_percent === rightSnapshot.scene_package_batch_pass_rate_percent &&
    leftSnapshot.drift_alert_rate_percent === rightSnapshot.drift_alert_rate_percent &&
    leftSnapshot.drift_blocked_runs === rightSnapshot.drift_blocked_runs
  );
}

function summarizeGovernanceRoundReleaseGateTelemetry(roundsCandidate) {
  const rounds = Array.isArray(roundsCandidate) ? roundsCandidate : [];
  let observedRounds = 0;
  let changedRounds = 0;

  for (const round of rounds) {
    const before = normalizeGovernanceReleaseGateSnapshot(round && round.release_gate_before);
    const after = normalizeGovernanceReleaseGateSnapshot(round && round.release_gate_after);
    if (!before && !after) {
      continue;
    }
    observedRounds += 1;
    if (!areGovernanceReleaseGateSnapshotsEqual(before, after)) {
      changedRounds += 1;
    }
  }

  return {
    observed_rounds: observedRounds,
    changed_rounds: changedRounds
  };
}

async function readGovernanceCloseLoopSessionEntries(projectPath) {
  return readGovernanceCloseLoopSessionEntriesService(projectPath, {
    getGovernanceCloseLoopSessionDir,
    fs,
    normalizeGovernanceReleaseGateSnapshot,
    summarizeGovernanceRoundReleaseGateTelemetry,
    normalizeGovernanceWeeklyOpsStopDetail,
    deriveGovernanceWeeklyOpsReasonFlags
  });
}

async function resolveGovernanceCloseLoopSessionFile(projectPath, sessionCandidate) {
  if (typeof sessionCandidate !== 'string' || !sessionCandidate.trim()) {
    throw new Error('--governance-resume requires a session id/file or "latest".');
  }
  const normalizedCandidate = sessionCandidate.trim();

  if (normalizedCandidate.toLowerCase() === 'latest') {
    const sessions = await readGovernanceCloseLoopSessionEntries(projectPath);
    if (sessions.length === 0) {
      throw new Error(`No governance close-loop sessions found in: ${getGovernanceCloseLoopSessionDir(projectPath)}`);
    }
    return sessions[0].file;
  }

  if (path.isAbsolute(normalizedCandidate)) {
    return normalizedCandidate;
  }
  if (
    normalizedCandidate.includes('/') ||
    normalizedCandidate.includes('\\') ||
    normalizedCandidate.toLowerCase().endsWith('.json')
  ) {
    return path.join(projectPath, normalizedCandidate);
  }

  const byId = path.join(
    getGovernanceCloseLoopSessionDir(projectPath),
    `${sanitizeBatchSessionId(normalizedCandidate)}.json`
  );
  if (await fs.pathExists(byId)) {
    return byId;
  }
  return path.join(projectPath, normalizedCandidate);
}

async function loadGovernanceCloseLoopSessionPayload(projectPath, sessionCandidate) {
  return loadGovernanceCloseLoopSessionPayloadService(projectPath, sessionCandidate, {
    readGovernanceCloseLoopSessionEntries,
    getGovernanceCloseLoopSessionDir,
    sanitizeBatchSessionId,
    fs
  });
}

async function persistGovernanceCloseLoopSession(projectPath, sessionId, payload, status = 'running') {
  return persistGovernanceCloseLoopSessionService(projectPath, sessionId, payload, status, {
    sanitizeBatchSessionId,
    getGovernanceCloseLoopSessionDir,
    schemaVersion: AUTO_ARCHIVE_SCHEMA_VERSION,
    fs
  });
}
async function readCloseLoopControllerSessionEntries(projectPath) {
  return readCloseLoopControllerSessionEntriesService(projectPath, {
    getCloseLoopControllerSessionDir,
    fs
  });
}

async function resolveCloseLoopControllerSessionFile(projectPath, sessionCandidate) {
  if (typeof sessionCandidate !== 'string' || !sessionCandidate.trim()) {
    throw new Error('--controller-resume requires a session id/file or "latest".');
  }

  const normalizedCandidate = sessionCandidate.trim();
  if (normalizedCandidate.toLowerCase() === 'latest') {
    const sessions = await readCloseLoopControllerSessionEntries(projectPath);
    if (sessions.length === 0) {
      throw new Error(`No controller sessions found in: ${getCloseLoopControllerSessionDir(projectPath)}`);
    }
    return sessions[0].file;
  }

  if (path.isAbsolute(normalizedCandidate)) {
    return normalizedCandidate;
  }
  if (
    normalizedCandidate.includes('/') ||
    normalizedCandidate.includes('\\') ||
    normalizedCandidate.toLowerCase().endsWith('.json')
  ) {
    return path.join(projectPath, normalizedCandidate);
  }

  const byId = path.join(
    getCloseLoopControllerSessionDir(projectPath),
    `${sanitizeBatchSessionId(normalizedCandidate)}.json`
  );
  if (await fs.pathExists(byId)) {
    return byId;
  }
  return path.join(projectPath, normalizedCandidate);
}

async function loadCloseLoopControllerSessionPayload(projectPath, sessionCandidate) {
  return loadCloseLoopControllerSessionPayloadService(projectPath, sessionCandidate, {
    readCloseLoopControllerSessionEntries,
    getCloseLoopControllerSessionDir,
    sanitizeBatchSessionId,
    fs
  });
}
async function pruneCloseLoopControllerSessions(projectPath, policy = {}) {
  return pruneCloseLoopControllerSessionsService(projectPath, policy, {
    readCloseLoopControllerSessionEntries,
    getCloseLoopControllerSessionDir,
    fs
  });
}

module.exports = {
  runCloseLoopController
};
