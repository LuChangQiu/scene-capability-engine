function normalizeKeep(keepCandidate) {
  if (keepCandidate === undefined || keepCandidate === null) {
    return 20;
  }
  const parsed = Number(keepCandidate);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1000) {
    throw new Error('--keep must be an integer between 0 and 1000.');
  }
  return parsed;
}

function normalizeSpecKeep(keepCandidate, fallback = 200) {
  if (keepCandidate === undefined || keepCandidate === null) {
    return fallback;
  }
  const parsed = Number(keepCandidate);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 5000) {
    throw new Error('--keep must be an integer between 0 and 5000.');
  }
  return parsed;
}

function normalizeOlderThanDays(daysCandidate) {
  if (daysCandidate === undefined || daysCandidate === null) {
    return null;
  }
  const parsed = Number(daysCandidate);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 36500) {
    throw new Error('--older-than-days must be an integer between 0 and 36500.');
  }
  return parsed;
}

function normalizeSpecSessionProtectWindowDays(daysCandidate) {
  if (daysCandidate === undefined || daysCandidate === null) {
    return 7;
  }
  const parsed = Number(daysCandidate);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 36500) {
    throw new Error('--spec-session-protect-window-days must be an integer between 0 and 36500.');
  }
  return parsed;
}

function normalizeSpecSessionMaxTotal(maxTotalCandidate) {
  if (maxTotalCandidate === undefined || maxTotalCandidate === null) {
    return null;
  }
  const parsed = Number(maxTotalCandidate);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500000) {
    throw new Error('--spec-session-max-total must be an integer between 1 and 500000.');
  }
  return parsed;
}

function normalizeSpecSessionMaxCreated(maxCreatedCandidate) {
  if (maxCreatedCandidate === undefined || maxCreatedCandidate === null) {
    return null;
  }
  const parsed = Number(maxCreatedCandidate);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 500000) {
    throw new Error('--spec-session-max-created must be an integer between 0 and 500000.');
  }
  return parsed;
}

function normalizeSpecSessionMaxCreatedPerGoal(maxCreatedPerGoalCandidate) {
  if (maxCreatedPerGoalCandidate === undefined || maxCreatedPerGoalCandidate === null) {
    return null;
  }
  const parsed = Number(maxCreatedPerGoalCandidate);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 1000) {
    throw new Error('--spec-session-max-created-per-goal must be a number between 0 and 1000.');
  }
  return Number(parsed.toFixed(2));
}

function normalizeSpecSessionMaxDuplicateGoals(maxDuplicateGoalsCandidate) {
  if (maxDuplicateGoalsCandidate === undefined || maxDuplicateGoalsCandidate === null) {
    return null;
  }
  const parsed = Number(maxDuplicateGoalsCandidate);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 500000) {
    throw new Error('--spec-session-max-duplicate-goals must be an integer between 0 and 500000.');
  }
  return parsed;
}

module.exports = {
  normalizeKeep,
  normalizeSpecKeep,
  normalizeOlderThanDays,
  normalizeSpecSessionProtectWindowDays,
  normalizeSpecSessionMaxTotal,
  normalizeSpecSessionMaxCreated,
  normalizeSpecSessionMaxCreatedPerGoal,
  normalizeSpecSessionMaxDuplicateGoals
};
