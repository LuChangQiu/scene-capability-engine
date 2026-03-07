function presentGovernanceSessionList(projectPath, filteredSessions, statusFilter, resumeOnly, buildStatusCounts, getGovernanceCloseLoopSessionDir) {
  const resumedSessions = filteredSessions.filter((session) => session && session.resumed_from_governance_session_id).length;
  return {
    mode: 'auto-governance-session-list',
    session_dir: getGovernanceCloseLoopSessionDir(projectPath),
    total: filteredSessions.length,
    status_filter: statusFilter,
    resume_only: resumeOnly,
    resumed_sessions: resumedSessions,
    fresh_sessions: filteredSessions.length - resumedSessions,
    status_counts: buildStatusCounts(filteredSessions),
    sessions: filteredSessions.map((item) => ({
      id: item.id,
      status: item.status,
      target_risk: item.target_risk,
      final_risk: item.final_risk,
      performed_rounds: item.performed_rounds,
      max_rounds: item.max_rounds,
      converged: item.converged,
      execute_advisory: item.execute_advisory,
      advisory_failed_actions: item.advisory_failed_actions,
      release_gate_available: item.release_gate_available,
      release_gate_latest_gate_passed: item.release_gate_latest_gate_passed,
      release_gate_pass_rate_percent: item.release_gate_pass_rate_percent,
      release_gate_drift_alert_rate_percent: item.release_gate_drift_alert_rate_percent,
      round_release_gate_observed: item.round_release_gate_observed,
      round_release_gate_changed: item.round_release_gate_changed,
      stop_reason: item.stop_reason,
      resumed_from_governance_session_id: item.resumed_from_governance_session_id,
      updated_at: item.updated_at,
      parse_error: item.parse_error,
      file: item.file
    }))
  };
}

module.exports = {
  presentGovernanceSessionList
};
