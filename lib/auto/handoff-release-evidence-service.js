const path = require('path');

async function loadAutoHandoffReleaseEvidence(projectPath, fileCandidate = null, dependencies = {}) {
  const { resolveAutoHandoffReleaseEvidenceFile, fs } = dependencies;
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

async function mergeAutoHandoffRunIntoReleaseEvidence(projectPath, result, reportFile = null, dependencies = {}) {
  const {
    resolveAutoHandoffReleaseEvidenceFile,
    normalizeHandoffReleaseEvidenceWindow,
    loadAutoHandoffReleaseEvidence,
    fs,
    buildAutoHandoffRegressionReport,
    normalizeHandoffText,
    buildAutoHandoffReleaseEvidenceEntry,
    now = () => new Date().toISOString()
  } = dependencies;

  const evidenceFile = resolveAutoHandoffReleaseEvidenceFile(projectPath);
  if (result && result.dry_run) {
    return {
      mode: 'auto-handoff-release-evidence',
      merged: false,
      skipped: true,
      reason: 'dry-run',
      file: evidenceFile
    };
  }

  let existing = null;
  try {
    existing = await loadAutoHandoffReleaseEvidence(projectPath, evidenceFile);
  } catch (error) {
    if (!(error && typeof error.message === 'string' && error.message.includes('release evidence file not found'))) {
      throw new Error(`failed to read release evidence JSON: ${evidenceFile} (${error.message})`);
    }
  }

  const existingSessions = existing && Array.isArray(existing.sessions)
    ? existing.sessions.filter(item => item && typeof item === 'object')
    : [];
  const nowIso = now();
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

  const generatedAt = existing && existing.payload && typeof existing.payload.generated_at === 'string' && existing.payload.generated_at.trim()
    ? existing.payload.generated_at
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

async function writeAutoHandoffRunReport(projectPath, result, outCandidate = null, dependencies = {}) {
  const { maybeWriteOutput, reportDir } = dependencies;
  if (typeof outCandidate === 'string' && outCandidate.trim().length > 0) {
    await maybeWriteOutput(result, outCandidate.trim(), projectPath);
    return;
  }
  const defaultFile = path.join(reportDir, `${result.session_id}.json`);
  await maybeWriteOutput(result, defaultFile, projectPath);
}

module.exports = {
  loadAutoHandoffReleaseEvidence,
  mergeAutoHandoffRunIntoReleaseEvidence,
  writeAutoHandoffRunReport
};
