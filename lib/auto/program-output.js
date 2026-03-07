async function maybeWriteProgramKpi(summary, outCandidate, projectPath, dependencies = {}) {
  const pathModule = dependencies.pathModule;
  const fs = dependencies.fs;
  if (!outCandidate) {
    return;
  }

  const outputPath = pathModule.isAbsolute(outCandidate)
    ? outCandidate
    : pathModule.join(projectPath, outCandidate);
  await fs.ensureDir(pathModule.dirname(outputPath));
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

async function maybeWriteProgramAudit(summary, outCandidate, projectPath, dependencies = {}) {
  const pathModule = dependencies.pathModule;
  const fs = dependencies.fs;
  const now = dependencies.now || (() => new Date().toISOString());
  if (!outCandidate) {
    return;
  }
  const outputPath = pathModule.isAbsolute(outCandidate)
    ? outCandidate
    : pathModule.join(projectPath, outCandidate);
  await fs.ensureDir(pathModule.dirname(outputPath));
  await fs.writeJson(outputPath, {
    mode: 'auto-close-loop-program-audit',
    generated_at: now(),
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

module.exports = {
  maybeWriteProgramKpi,
  maybeWriteProgramAudit
};
