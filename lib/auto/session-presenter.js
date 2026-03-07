function presentCloseLoopSessionList(projectPath, sessions, statusFilter, limit, buildStatusCounts, getCloseLoopSessionDir) {
  const filteredSessions = Array.isArray(sessions) ? sessions : [];
  return {
    mode: 'auto-session-list',
    session_dir: getCloseLoopSessionDir(projectPath),
    total: filteredSessions.length,
    status_filter: statusFilter,
    status_counts: buildStatusCounts(filteredSessions),
    sessions: filteredSessions.slice(0, limit)
  };
}

function presentCloseLoopSessionStats(sessionDir, filteredSessions, statusFilter, cutoffMs, buildStatusCounts, buildMasterSpecCounts, isFailedStatus) {
  let completedSessions = 0;
  let failedSessions = 0;
  let subSpecCountSum = 0;
  let sessionsWithSubSpecs = 0;
  for (const session of filteredSessions) {
    const status = String(session && session.status || 'unknown').trim().toLowerCase();
    if (status === 'completed') {
      completedSessions += 1;
    }
    if (isFailedStatus(status)) {
      failedSessions += 1;
    }
    const subSpecCount = Number(session && session.sub_spec_count);
    if (Number.isFinite(subSpecCount)) {
      subSpecCountSum += subSpecCount;
      sessionsWithSubSpecs += 1;
    }
  }
  const totalSessions = filteredSessions.length;
  const completionRate = totalSessions > 0 ? Number(((completedSessions / totalSessions) * 100).toFixed(2)) : 0;
  const failureRate = totalSessions > 0 ? Number(((failedSessions / totalSessions) * 100).toFixed(2)) : 0;
  const masterSpecCounts = buildMasterSpecCounts(filteredSessions);
  const latestSession = totalSessions > 0 ? filteredSessions[0] : null;
  const oldestSession = totalSessions > 0 ? filteredSessions[totalSessions - 1] : null;
  return {
    mode: 'auto-session-stats',
    session_dir: sessionDir,
    criteria: {
      days: cutoffMs === null ? null : cutoffMs,
      status_filter: statusFilter,
      since: cutoffMs === null ? null : new Date(cutoffMs).toISOString()
    },
    total_sessions: totalSessions,
    completed_sessions: completedSessions,
    failed_sessions: failedSessions,
    completion_rate_percent: completionRate,
    failure_rate_percent: failureRate,
    sub_spec_count_sum: subSpecCountSum,
    average_sub_specs_per_session: sessionsWithSubSpecs > 0 ? Number((subSpecCountSum / sessionsWithSubSpecs).toFixed(2)) : 0,
    unique_master_spec_count: Object.keys(masterSpecCounts).length,
    master_spec_counts: masterSpecCounts,
    status_counts: buildStatusCounts(filteredSessions),
    latest_updated_at: latestSession ? latestSession.updated_at : null,
    oldest_updated_at: oldestSession ? oldestSession.updated_at : null,
    latest_sessions: filteredSessions.slice(0, 10).map((item) => ({
      id: item.id,
      status: item.status,
      goal: item.goal,
      master_spec: item.master_spec,
      sub_spec_count: item.sub_spec_count,
      updated_at: item.updated_at,
      parse_error: item.parse_error
    }))
  };
}

function presentControllerSessionList(projectPath, filteredSessions, statusFilter, limit, buildStatusCounts, getCloseLoopControllerSessionDir) {
  return {
    mode: 'auto-controller-session-list',
    session_dir: getCloseLoopControllerSessionDir(projectPath),
    total: filteredSessions.length,
    status_filter: statusFilter,
    status_counts: buildStatusCounts(filteredSessions),
    sessions: filteredSessions.slice(0, limit).map((item) => ({
      id: item.id,
      file: item.file,
      status: item.status,
      queue_file: item.queue_file,
      queue_format: item.queue_format,
      processed_goals: item.processed_goals,
      pending_goals: item.pending_goals,
      updated_at: item.updated_at,
      parse_error: item.parse_error
    }))
  };
}

module.exports = {
  presentCloseLoopSessionList,
  presentCloseLoopSessionStats,
  presentControllerSessionList
};
