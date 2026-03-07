function normalizeStatusToken(statusCandidate) {
  return String(statusCandidate || '').trim().toLowerCase();
}

function isCompletedStatus(statusCandidate) {
  return normalizeStatusToken(statusCandidate) === 'completed';
}

function isFailedStatus(statusCandidate) {
  return ['failed', 'partial-failed', 'error', 'invalid'].includes(normalizeStatusToken(statusCandidate));
}

function normalizeStatsWindowDays(daysCandidate) {
  if (daysCandidate === undefined || daysCandidate === null) {
    return null;
  }
  const parsed = Number(daysCandidate);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 36500) {
    throw new Error('--days must be an integer between 0 and 36500.');
  }
  return parsed;
}

function filterEntriesByStatus(entries, statusFilter = []) {
  if (!Array.isArray(statusFilter) || statusFilter.length === 0) {
    return Array.isArray(entries) ? entries : [];
  }
  const statusSet = new Set(statusFilter.map((item) => normalizeStatusToken(item)).filter(Boolean));
  return (Array.isArray(entries) ? entries : []).filter((entry) => statusSet.has(normalizeStatusToken(entry && entry.status)));
}

function filterGovernanceEntriesByResumeMode(entries, resumeOnly = false) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  if (!resumeOnly) {
    return safeEntries;
  }
  return safeEntries.filter((entry) => (
    typeof (entry && entry.resumed_from_governance_session_id) === 'string' &&
    String(entry.resumed_from_governance_session_id).trim().length > 0
  ));
}

function calculatePercent(numerator, denominator) {
  const safeNumerator = Number(numerator) || 0;
  const safeDenominator = Number(denominator) || 0;
  if (safeDenominator <= 0) {
    return 0;
  }
  return Number(((safeNumerator / safeDenominator) * 100).toFixed(2));
}

module.exports = {
  normalizeStatusToken,
  isCompletedStatus,
  isFailedStatus,
  normalizeStatsWindowDays,
  filterEntriesByStatus,
  filterGovernanceEntriesByResumeMode,
  calculatePercent
};
