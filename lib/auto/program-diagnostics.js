function buildProgramFailureClusters(results = [], normalizeFailureSignatureFromError = (value) => String(value || 'unknown')) {
  const failedStatuses = new Set(['failed', 'error', 'unknown', 'stopped']);
  const source = Array.isArray(results) ? results : [];
  const clusters = new Map();

  for (const item of source) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const status = String(item.status || 'unknown').trim().toLowerCase();
    if (!failedStatuses.has(status)) {
      continue;
    }

    const signatureSeed = normalizeFailureSignatureFromError(item.error);
    const signature = status + ':' + signatureSeed;
    if (!clusters.has(signature)) {
      clusters.set(signature, {
        signature,
        status,
        count: 0,
        goal_indexes: [],
        example_goal: item.goal || null,
        example_error: item.error || null
      });
    }

    const cluster = clusters.get(signature);
    cluster.count += 1;
    const sourceIndex = Number.isInteger(item.source_index) ? item.source_index + 1 : Number(item.index);
    if (Number.isInteger(sourceIndex) && sourceIndex > 0) {
      cluster.goal_indexes.push(sourceIndex);
    }
  }

  return [...clusters.values()]
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return String(left.signature).localeCompare(String(right.signature));
    })
    .map((cluster) => ({
      ...cluster,
      goal_indexes: cluster.goal_indexes.slice(0, 20)
    }));
}

function buildProgramRemediationActions(summary, failureClusters) {
  const failedGoals = Number(summary && summary.failed_goals) || 0;
  const retry = summary && summary.batch_retry ? summary.batch_retry : {};
  const actions = [];

  if (failedGoals === 0) {
    return [{
      priority: 'monitor',
      action: 'No remediation required. Program converged successfully.',
      reason: 'All goals completed in the current run.',
      suggested_command: null,
      strategy_patch: {}
    }];
  }

  actions.push({
    priority: 'high',
    action: 'Resume unresolved goals from latest program/batch summary.',
    reason: failedGoals + ' goals are unresolved after the current run.',
    suggested_command: 'sce auto close-loop-recover latest --json',
    strategy_patch: {
      batchAutonomous: true,
      continueOnError: true,
      batchRetryUntilComplete: true
    }
  });

  if ((Number(retry.max_rounds) || 0) > 0 && (Number(retry.performed_rounds) || 0) >= (Number(retry.max_rounds) || 0)) {
    actions.push({
      priority: 'high',
      action: 'Increase retry ceiling or split the program into smaller sub-goal groups.',
      reason: 'Retry rounds were exhausted before convergence.',
      suggested_command: 'sce auto close-loop-recover latest --batch-retry-max-rounds 15 --json',
      strategy_patch: {
        batchRetryUntilComplete: true,
        batchRetryMaxRounds: 15
      }
    });
  }

  const failureText = (Array.isArray(failureClusters) ? failureClusters : [])
    .map((cluster) => String(cluster.signature) + ' ' + (cluster.example_error || ''))
    .join(' | ')
    .toLowerCase();

  if (/timeout|timed out|deadline|terminated|killed/.test(failureText)) {
    actions.push({
      priority: 'medium',
      action: 'Reduce parallel pressure and increase orchestration timeout budget.',
      reason: 'Failure clusters indicate timeout/resource-pressure symptoms.',
      suggested_command: 'sce auto close-loop-recover latest --batch-parallel 2 --batch-agent-budget 2 --json',
      strategy_patch: {
        batchParallel: 2,
        batchAgentBudget: 2,
        batchPriority: 'complex-first',
        batchAgingFactor: 2
      }
    });
  }

  if (/dod|test|validation|checklist|compliance/.test(failureText)) {
    actions.push({
      priority: 'medium',
      action: 'Run strict quality gates early to surface deterministic failures.',
      reason: 'Failure clusters indicate DoD/test/compliance gate issues.',
      suggested_command: 'sce auto close-loop-recover latest --dod-tests "npm run test:smoke" --dod-tasks-closed --json',
      strategy_patch: {
        dodTests: 'npm run test:smoke',
        dodTasksClosed: true
      }
    });
  }

  return actions.slice(0, 5);
}

function buildProgramDiagnostics(summary, normalizeFailureSignatureFromError) {
  const failureClusters = buildProgramFailureClusters(summary && summary.results, normalizeFailureSignatureFromError);
  return {
    failed_goal_count: Number(summary && summary.failed_goals) || 0,
    failure_clusters: failureClusters,
    remediation_actions: buildProgramRemediationActions(summary, failureClusters)
  };
}

module.exports = {
  buildProgramFailureClusters,
  buildProgramRemediationActions,
  buildProgramDiagnostics
};
