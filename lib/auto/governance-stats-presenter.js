function presentGovernanceSessionStats(projectPath, filteredSessions, options = {}, dependencies = {}) {
  const normalizeStatusToken = dependencies.normalizeStatusToken || ((value) => String(value || '').trim().toLowerCase());
  const isCompletedStatus = dependencies.isCompletedStatus || ((status) => normalizeStatusToken(status) === 'completed');
  const isFailedStatus = dependencies.isFailedStatus || ((status) => ['failed', 'partial-failed', 'error', 'invalid'].includes(normalizeStatusToken(status)));
  const calculatePercent = dependencies.calculatePercent || ((a, b) => (Number(b) > 0 ? Number(((Number(a) / Number(b)) * 100).toFixed(2)) : 0));
  const toNumber = dependencies.toNumber || ((value) => {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  });
  const getGovernanceCloseLoopSessionDir = dependencies.getGovernanceCloseLoopSessionDir || ((value) => value);
  const buildStatusCounts = dependencies.buildStatusCounts || (() => ({}));
  const parseGateBoolean = dependencies.parseAutoHandoffGateBoolean || ((value, fallback = null) => value === true ? true : (value === false ? false : fallback));

  const days = options.days ?? null;
  const statusFilter = Array.isArray(options.status_filter) ? options.status_filter : [];
  const resumeOnly = Boolean(options.resume_only);
  const cutoffMs = options.cutoff_ms ?? null;

  let completedSessions = 0;
  let failedSessions = 0;
  let stoppedSessions = 0;
  let convergedSessions = 0;
  let advisoryEnabledSessions = 0;
  let advisoryFailedActionsSum = 0;
  let performedRoundsSum = 0;
  let sessionsWithRounds = 0;
  let resumedSessions = 0;
  let releaseGateObservedSessions = 0;
  let releaseGateFailedSessions = 0;
  const stopReasonCounts = {};
  const finalRiskCounts = {};
  const resumedFromCounts = {};

  for (const session of filteredSessions) {
    const status = normalizeStatusToken(session && session.status) || 'unknown';
    if (isCompletedStatus(status)) {
      completedSessions += 1;
    } else if (isFailedStatus(status)) {
      failedSessions += 1;
    } else if (status === 'stopped') {
      stoppedSessions += 1;
    }
    if (session && session.converged === true) {
      convergedSessions += 1;
    }
    if (session && session.execute_advisory === true) {
      advisoryEnabledSessions += 1;
    }
    advisoryFailedActionsSum += Number(session && session.advisory_failed_actions) || 0;
    const performedRounds = Number(session && session.performed_rounds);
    if (Number.isFinite(performedRounds)) {
      performedRoundsSum += performedRounds;
      sessionsWithRounds += 1;
    }
    if (session && session.resumed_from_governance_session_id) {
      resumedSessions += 1;
      const parentId = String(session.resumed_from_governance_session_id).trim() || 'unknown';
      resumedFromCounts[parentId] = (resumedFromCounts[parentId] || 0) + 1;
    }
    if (session && session.release_gate_available === true) {
      releaseGateObservedSessions += 1;
      if (parseGateBoolean(session.release_gate_latest_gate_passed, null) === false) {
        releaseGateFailedSessions += 1;
      }
    }
    const stopReason = String(session && session.stop_reason ? session.stop_reason : '').trim().toLowerCase() || 'unknown';
    stopReasonCounts[stopReason] = (stopReasonCounts[stopReason] || 0) + 1;
    const finalRisk = String(session && session.final_risk ? session.final_risk : '').trim().toLowerCase() || 'unknown';
    finalRiskCounts[finalRisk] = (finalRiskCounts[finalRisk] || 0) + 1;
  }

  const totalSessions = filteredSessions.length;
  const averagePerformedRounds = sessionsWithRounds > 0 ? Number((performedRoundsSum / sessionsWithRounds).toFixed(2)) : 0;
  const latestSession = totalSessions > 0 ? filteredSessions[0] : null;
  const oldestSession = totalSessions > 0 ? filteredSessions[totalSessions - 1] : null;

  return {
    mode: 'auto-governance-session-stats',
    session_dir: getGovernanceCloseLoopSessionDir(projectPath),
    criteria: {
      days,
      status_filter: statusFilter,
      resume_only: resumeOnly,
      since: cutoffMs === null ? null : new Date(cutoffMs).toISOString()
    },
    total_sessions: totalSessions,
    resumed_sessions: resumedSessions,
    fresh_sessions: totalSessions - resumedSessions,
    resumed_rate_percent: calculatePercent(resumedSessions, totalSessions),
    completed_sessions: completedSessions,
    failed_sessions: failedSessions,
    stopped_sessions: stoppedSessions,
    converged_sessions: convergedSessions,
    advisory_enabled_sessions: advisoryEnabledSessions,
    advisory_failed_actions_sum: advisoryFailedActionsSum,
    completion_rate_percent: calculatePercent(completedSessions, totalSessions),
    failure_rate_percent: calculatePercent(failedSessions, totalSessions),
    average_performed_rounds: averagePerformedRounds,
    release_gate: {
      observed_sessions: releaseGateObservedSessions,
      failed_sessions: releaseGateFailedSessions,
      failed_rate_percent: calculatePercent(releaseGateFailedSessions, releaseGateObservedSessions)
    },
    status_counts: buildStatusCounts(filteredSessions),
    stop_reason_counts: stopReasonCounts,
    final_risk_counts: finalRiskCounts,
    resumed_from_counts: resumedFromCounts,
    latest_updated_at: latestSession ? latestSession.updated_at : null,
    oldest_updated_at: oldestSession ? oldestSession.updated_at : null,
    latest_sessions: filteredSessions.slice(0, 10).map((item) => ({
      id: item.id,
      status: item.status,
      final_risk: item.final_risk,
      performed_rounds: item.performed_rounds,
      updated_at: item.updated_at,
      parse_error: item.parse_error,
      file: item.file
    }))
  };
}

module.exports = {
  presentGovernanceSessionStats
};
