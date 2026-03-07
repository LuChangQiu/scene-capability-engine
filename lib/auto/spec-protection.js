function normalizeStatusToken(statusCandidate) {
  return String(statusCandidate || '').trim().toLowerCase();
}

function collectSpecNamesFromBatchSummary(summary) {
  const names = new Set();
  const results = Array.isArray(summary && summary.results) ? summary.results : [];
  for (const item of results) {
    const masterSpec = String(item && item.master_spec ? item.master_spec : '').trim();
    if (masterSpec) {
      names.add(masterSpec);
    }
  }
  return [...names];
}

function collectSpecNamesFromCloseLoopSessionPayload(payload) {
  const names = new Set();
  const portfolio = payload && payload.portfolio && typeof payload.portfolio === 'object'
    ? payload.portfolio
    : {};
  const masterSpec = String(portfolio.master_spec || '').trim();
  if (masterSpec) {
    names.add(masterSpec);
  }
  const subSpecs = Array.isArray(portfolio.sub_specs) ? portfolio.sub_specs : [];
  for (const item of subSpecs) {
    const specName = String(item || '').trim();
    if (specName) {
      names.add(specName);
    }
  }
  return names;
}

function collectSpecNamesFromBatchSummaryPayload(payload, includeCompleted = false) {
  const names = new Set();
  const results = Array.isArray(payload && payload.results) ? payload.results : [];
  for (const item of results) {
    const status = normalizeStatusToken(item && item.status);
    if (!includeCompleted && status === 'completed') {
      continue;
    }
    const masterSpec = String(item && item.master_spec ? item.master_spec : '').trim();
    if (masterSpec) {
      names.add(masterSpec);
    }
  }
  return names;
}

function createProtectionReasonRecord() {
  return {
    additional: 0,
    collaboration_active: 0,
    close_loop_session_recent_or_incomplete: 0,
    batch_summary_recent_or_incomplete: 0,
    controller_session_recent_or_incomplete: 0,
    total_references: 0
  };
}

function ensureProtectionReasonRecord(reasonMap, specName) {
  const key = String(specName || '').trim();
  if (!key) {
    return null;
  }
  if (!reasonMap.has(key)) {
    reasonMap.set(key, createProtectionReasonRecord());
  }
  return reasonMap.get(key);
}

function incrementProtectionReason(reasonMap, specName, reasonKey, delta = 1) {
  if (!Number.isFinite(delta) || delta <= 0) {
    return;
  }
  const record = ensureProtectionReasonRecord(reasonMap, specName);
  if (!record) {
    return;
  }
  const normalizedReason = String(reasonKey || '').trim();
  if (!normalizedReason || !Object.prototype.hasOwnProperty.call(record, normalizedReason)) {
    return;
  }
  record[normalizedReason] += delta;
  record.total_references += delta;
}

function buildProtectionRanking(reasonMap) {
  const entries = [];
  for (const [spec, reasons] of reasonMap.entries()) {
    entries.push({
      spec,
      total_references: Number(reasons.total_references) || 0,
      reasons: {
        additional: Number(reasons.additional) || 0,
        collaboration_active: Number(reasons.collaboration_active) || 0,
        close_loop_session_recent_or_incomplete: Number(reasons.close_loop_session_recent_or_incomplete) || 0,
        batch_summary_recent_or_incomplete: Number(reasons.batch_summary_recent_or_incomplete) || 0,
        controller_session_recent_or_incomplete: Number(reasons.controller_session_recent_or_incomplete) || 0
      }
    });
  }
  entries.sort((left, right) => {
    if (right.total_references !== left.total_references) {
      return right.total_references - left.total_references;
    }
    return left.spec.localeCompare(right.spec);
  });
  return entries;
}

function buildSpecProtectionReasonPayload(specName, reasonMap) {
  if (!reasonMap || typeof reasonMap.get !== 'function') {
    return null;
  }
  const record = reasonMap.get(specName);
  if (!record) {
    return null;
  }
  return {
    total_references: Number(record.total_references) || 0,
    additional: Number(record.additional) || 0,
    collaboration_active: Number(record.collaboration_active) || 0,
    close_loop_session_recent_or_incomplete: Number(record.close_loop_session_recent_or_incomplete) || 0,
    batch_summary_recent_or_incomplete: Number(record.batch_summary_recent_or_incomplete) || 0,
    controller_session_recent_or_incomplete: Number(record.controller_session_recent_or_incomplete) || 0
  };
}

module.exports = {
  collectSpecNamesFromBatchSummary,
  collectSpecNamesFromCloseLoopSessionPayload,
  collectSpecNamesFromBatchSummaryPayload,
  createProtectionReasonRecord,
  ensureProtectionReasonRecord,
  incrementProtectionReason,
  buildProtectionRanking,
  buildSpecProtectionReasonPayload
};
