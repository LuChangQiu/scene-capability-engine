const path = require('path');

function normalizeBatchFormat(formatCandidate) {
  const normalized = typeof formatCandidate === 'string'
    ? formatCandidate.trim().toLowerCase()
    : 'auto';
  if (!['auto', 'json', 'lines'].includes(normalized)) {
    throw new Error('--format must be one of: auto, json, lines');
  }
  return normalized;
}

function parseGoalsFromJsonPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === 'object' && Array.isArray(payload.goals)) {
    return payload.goals;
  }
  throw new Error('JSON goals file must be an array of strings or an object with a "goals" array.');
}

function parseGoalsFromLines(content) {
  return `${content || ''}`
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

async function loadCloseLoopBatchGoals(projectPath, goalsFile, formatCandidate, dependencies = {}) {
  const { fs, path: pathModule = path } = dependencies;
  const resolvedFile = pathModule.isAbsolute(goalsFile)
    ? goalsFile
    : pathModule.join(projectPath, goalsFile);
  if (!(await fs.pathExists(resolvedFile))) {
    throw new Error(`Goals file not found: ${resolvedFile}`);
  }

  const format = normalizeBatchFormat(formatCandidate);
  const isJsonByExtension = resolvedFile.toLowerCase().endsWith('.json');
  const useJson = format === 'json' || (format === 'auto' && isJsonByExtension);
  let goals = [];

  if (useJson) {
    let payload = null;
    try {
      payload = await fs.readJson(resolvedFile);
    } catch (error) {
      throw new Error(`Invalid JSON goals file: ${resolvedFile} (${error.message})`);
    }
    goals = parseGoalsFromJsonPayload(payload);
  } else {
    const content = await fs.readFile(resolvedFile, 'utf8');
    goals = parseGoalsFromLines(content);
  }

  const normalizedGoals = goals
    .map(item => `${item || ''}`.trim())
    .filter(Boolean);
  if (normalizedGoals.length === 0) {
    throw new Error(`No valid goals found in file: ${resolvedFile}`);
  }

  return {
    file: resolvedFile,
    goals: normalizedGoals
  };
}

const PROGRAM_CATEGORY_GOAL_LIBRARY = {
  closeLoop: 'Build automatic closed-loop progression without manual confirmation waits for the program scope.',
  decomposition: 'Split broad functional scope into coordinated master/sub specs with explicit dependency ownership.',
  orchestration: 'Harden orchestration scheduling, parallel execution, and shared resource governance for multi-spec delivery.',
  quality: 'Enforce quality gates, tests, and observability evidence across all autonomous execution tracks.',
  docs: 'Complete documentation and rollout guidance so autonomous workflows can be repeatedly operated at scale.'
};
const DEFAULT_PROGRAM_DECOMPOSITION_MIN_QUALITY_SCORE = 70;

function normalizeProgramGoalCount(programGoalsCandidate, fallbackCount) {
  if (programGoalsCandidate === undefined || programGoalsCandidate === null) {
    return fallbackCount;
  }

  const parsed = Number(programGoalsCandidate);
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 12) {
    throw new Error('--program-goals must be an integer between 2 and 12.');
  }
  return parsed;
}

function inferProgramGoalCount(semantic) {
  const clauseCount = Array.isArray(semantic && semantic.clauses) ? semantic.clauses.length : 0;
  const activeCategories = semantic && semantic.categoryScores
    ? Object.values(semantic.categoryScores).filter(score => score > 0).length
    : 0;

  if (clauseCount >= 8 || activeCategories >= 4) {
    return 5;
  }
  if (clauseCount >= 5 || activeCategories >= 3) {
    return 4;
  }
  return 3;
}

function normalizeProgramMinQualityScore(scoreCandidate) {
  if (scoreCandidate === undefined || scoreCandidate === null) {
    return DEFAULT_PROGRAM_DECOMPOSITION_MIN_QUALITY_SCORE;
  }
  const parsed = Number(scoreCandidate);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
    throw new Error('--program-min-quality-score must be a number between 0 and 100.');
  }
  return Number(parsed.toFixed(2));
}

function scoreProgramGoalClause(clause) {
  const text = `${clause || ''}`.trim().toLowerCase();
  if (!text) {
    return 0;
  }

  const words = text.split(/\s+/).filter(Boolean).length;
  const connectorSignals = (text.match(/,|;| and | with | plus |并且|以及|并行|同时/g) || []).length;
  const domainSignals = (text.match(
    /orchestrat|integration|migration|observability|quality|security|performance|resilience|compliance|governance|闭环|主从|并行|重规划/g
  ) || []).length;
  return words + (connectorSignals * 2) + (domainSignals * 3);
}

function buildProgramGoalDecompositionQuality(semantic, generatedGoals, targetGoalCount) {
  const goals = Array.isArray(generatedGoals) ? generatedGoals : [];
  const rankedCategories = Array.isArray(semantic && semantic.rankedCategories)
    ? semantic.rankedCategories
    : [];
  const categoryScores = semantic && semantic.categoryScores && typeof semantic.categoryScores === 'object'
    ? semantic.categoryScores
    : {};
  const activeCategoryCount = Object.values(categoryScores)
    .filter(value => Number(value) > 0)
    .length;
  const averageGoalWords = goals.length === 0
    ? 0
    : Number((
      goals
        .map(goal => `${goal || ''}`.trim().split(/\s+/).filter(Boolean).length)
        .reduce((sum, value) => sum + value, 0) / goals.length
    ).toFixed(2));
  const normalizedGoalSeeds = goals
    .map(goal => `${goal || ''}`.toLowerCase().replace(/[0-9]+/g, '#').replace(/[^a-z\u4e00-\u9fff# ]+/g, ' '))
    .map(goal => goal.split(/\s+/).filter(Boolean).slice(0, 8).join(' '))
    .filter(Boolean);
  const uniqueGoalSeeds = new Set(normalizedGoalSeeds);
  const diversityRatio = goals.length === 0
    ? 1
    : Math.min(1, uniqueGoalSeeds.size / goals.length);
  const coverageRatio = targetGoalCount <= 0
    ? 1
    : Math.min(1, goals.length / targetGoalCount);
  const categoryCoverageRatio = activeCategoryCount <= 0
    ? 1
    : Math.min(1, rankedCategories.length / activeCategoryCount);
  const warnings = [];
  if (goals.length < targetGoalCount) {
    warnings.push('under-produced-goals');
  }
  if (averageGoalWords < 6) {
    warnings.push('goals-too-short');
  }
  if (activeCategoryCount >= 3 && rankedCategories.length < 2) {
    warnings.push('category-coverage-low');
  }
  if (diversityRatio < 0.6) {
    warnings.push('goal-diversity-low');
  }

  const score = Number((
    (coverageRatio * 45) +
    (categoryCoverageRatio * 25) +
    (Math.min(1, averageGoalWords / 12) * 20) +
    (diversityRatio * 10)
  ).toFixed(2));
  return {
    score,
    coverage_ratio_percent: Number((coverageRatio * 100).toFixed(2)),
    category_coverage_ratio_percent: Number((categoryCoverageRatio * 100).toFixed(2)),
    diversity_ratio_percent: Number((diversityRatio * 100).toFixed(2)),
    average_goal_words: averageGoalWords,
    warnings
  };
}

function buildRefinedProgramGoalFromClause(clause, contextGoal) {
  const normalizedClause = `${clause || ''}`.replace(/\s+/g, ' ').trim().replace(/[.。;；]+$/g, '');
  if (!normalizedClause) {
    return null;
  }
  return (
    `Deliver ${normalizedClause} as a dedicated execution track with implementation tasks, ` +
    `automated validation, and rollout evidence aligned to: ${contextGoal}`
  );
}

function buildRefinedProgramGoalFromCategory(category, contextGoal) {
  const template = PROGRAM_CATEGORY_GOAL_LIBRARY[category];
  if (!template) {
    return null;
  }
  return (
    `${template} Ensure cross-spec coordination, measurable acceptance criteria, ` +
    `and audit-ready output for: ${contextGoal}`
  );
}

function shouldRefineProgramGoalQuality(quality, minQualityScore) {
  const safeQuality = quality && typeof quality === 'object' ? quality : {};
  const warnings = Array.isArray(safeQuality.warnings) ? safeQuality.warnings : [];
  const score = Number(safeQuality.score);
  if (Number.isFinite(score) && score < minQualityScore) {
    return true;
  }
  return warnings.includes('goals-too-short') || warnings.includes('under-produced-goals');
}

function buildCloseLoopBatchGoalsFromGoal(goalCandidate, programGoalsCandidate, settings = {}, dependencies = {}) {
  const { analyzeGoalSemantics } = dependencies;
  const normalizedGoal = `${goalCandidate || ''}`.trim();
  if (!normalizedGoal) {
    throw new Error('--decompose-goal requires a non-empty goal string.');
  }

  const semantic = analyzeGoalSemantics(normalizedGoal);
  const targetGoalCount = normalizeProgramGoalCount(
    programGoalsCandidate,
    inferProgramGoalCount(semantic)
  );
  const minQualityScore = normalizeProgramMinQualityScore(settings.minQualityScore);
  const enforceQualityGate = Boolean(settings.enforceQualityGate);

  const seenGoals = new Set();
  const generatedGoals = [];
  const pushGoal = goal => {
    const normalized = `${goal || ''}`.trim();
    if (!normalized) {
      return;
    }
    const dedupeKey = normalized.toLowerCase();
    if (seenGoals.has(dedupeKey)) {
      return;
    }
    seenGoals.add(dedupeKey);
    generatedGoals.push(normalized);
  };

  const scoredClauses = (semantic.clauses || [])
    .map(clause => `${clause || ''}`.trim())
    .filter(clause => clause.length >= 8)
    .map(clause => ({
      clause,
      score: scoreProgramGoalClause(clause)
    }))
    .sort((left, right) => right.score - left.score);

  for (const item of scoredClauses) {
    if (generatedGoals.length >= targetGoalCount) {
      break;
    }
    pushGoal(item.clause);
  }

  for (const category of semantic.rankedCategories || []) {
    if (generatedGoals.length >= targetGoalCount) {
      break;
    }

    const template = PROGRAM_CATEGORY_GOAL_LIBRARY[category];
    if (!template) {
      continue;
    }
    pushGoal(`${template} Program goal context: ${normalizedGoal}`);
  }

  if (generatedGoals.length === 0) {
    pushGoal(normalizedGoal);
  }
  let finalGoals = generatedGoals.slice(0, targetGoalCount);
  const initialQuality = buildProgramGoalDecompositionQuality(semantic, finalGoals, targetGoalCount);
  let finalQuality = initialQuality;
  let refinementApplied = false;
  let refinementReason = null;

  if (shouldRefineProgramGoalQuality(initialQuality, minQualityScore)) {
    refinementReason = Number(initialQuality.score) < minQualityScore
      ? 'score-below-threshold'
      : 'quality-warning-triggered';
    const refinedGoals = [];
    const refinedSeen = new Set();
    const pushRefinedGoal = goal => {
      const normalized = `${goal || ''}`.trim();
      if (!normalized) {
        return;
      }
      const dedupeKey = normalized.toLowerCase();
      if (refinedSeen.has(dedupeKey)) {
        return;
      }
      refinedSeen.add(dedupeKey);
      refinedGoals.push(normalized);
    };

    for (const item of scoredClauses) {
      if (refinedGoals.length >= targetGoalCount) {
        break;
      }
      pushRefinedGoal(buildRefinedProgramGoalFromClause(item.clause, normalizedGoal));
    }

    for (const category of semantic.rankedCategories || []) {
      if (refinedGoals.length >= targetGoalCount) {
        break;
      }
      pushRefinedGoal(buildRefinedProgramGoalFromCategory(category, normalizedGoal));
    }

    if (refinedGoals.length === 0) {
      pushRefinedGoal(
        `Execute ${normalizedGoal} with coordinated master/sub specs, quality gates, and completion evidence.`
      );
    }

    while (refinedGoals.length < targetGoalCount) {
      pushRefinedGoal(
        `Track ${refinedGoals.length + 1}: Deliver ${normalizedGoal} with implementation tasks, ` +
        'integration checks, and operational handoff evidence.'
      );
    }

    const refinedFinalGoals = refinedGoals.slice(0, targetGoalCount);
    const refinedQuality = buildProgramGoalDecompositionQuality(semantic, refinedFinalGoals, targetGoalCount);
    const refinedWarnings = Array.isArray(refinedQuality.warnings) ? refinedQuality.warnings.length : 0;
    const initialWarnings = Array.isArray(initialQuality.warnings) ? initialQuality.warnings.length : 0;
    if (
      Number(refinedQuality.score) > Number(initialQuality.score) ||
      (Number(refinedQuality.score) === Number(initialQuality.score) && refinedWarnings < initialWarnings)
    ) {
      finalGoals = refinedFinalGoals;
      finalQuality = refinedQuality;
      refinementApplied = true;
    }
  }

  const quality = {
    ...finalQuality,
    refinement: {
      attempted: shouldRefineProgramGoalQuality(initialQuality, minQualityScore),
      applied: refinementApplied,
      min_score: minQualityScore,
      reason: refinementReason,
      before_score: initialQuality.score,
      after_score: finalQuality.score,
      before_warnings: initialQuality.warnings,
      after_warnings: finalQuality.warnings
    }
  };
  if (enforceQualityGate && Number(quality.score) < minQualityScore) {
    const warningText = Array.isArray(quality.warnings) && quality.warnings.length > 0
      ? ` Warnings: ${quality.warnings.join(', ')}.`
      : '';
    throw new Error(
      `Decomposition quality score ${quality.score} is below required ${minQualityScore}.${warningText}`
    );
  }

  return {
    file: '(generated-from-goal)',
    goals: finalGoals,
    generatedFromGoal: {
      goal: normalizedGoal,
      strategy: 'semantic-clause-and-category',
      target_goal_count: targetGoalCount,
      produced_goal_count: finalGoals.length,
      clauses_considered: Array.isArray(semantic.clauses) ? semantic.clauses.length : 0,
      category_scores: semantic.categoryScores || {},
      ranked_categories: semantic.rankedCategories || [],
      quality
    }
  };
}

function normalizeResumeStrategy(resumeStrategyCandidate) {
  const normalized = typeof resumeStrategyCandidate === 'string'
    ? resumeStrategyCandidate.trim().toLowerCase()
    : 'pending';
  if (!['pending', 'failed-only'].includes(normalized)) {
    throw new Error('--resume-strategy must be one of: pending, failed-only');
  }
  return normalized;
}

async function buildCloseLoopBatchGoalsFromSummaryPayload(
  summary,
  summaryFile,
  projectPath,
  formatCandidate,
  resumeStrategyCandidate,
  dependencies = {}
) {
  const { fs, path: pathModule = path, loadCloseLoopBatchGoals } = dependencies;
  const resumeStrategy = normalizeResumeStrategy(resumeStrategyCandidate);
  if (!summary || typeof summary !== 'object') {
    throw new Error(`Invalid batch summary payload: ${summaryFile}`);
  }
  if (!Array.isArray(summary.results)) {
    throw new Error(`Batch summary missing "results" array: ${summaryFile}`);
  }

  const retryStatuses = resumeStrategy === 'failed-only'
    ? new Set(['failed', 'error'])
    : new Set(['failed', 'error', 'unknown', 'stopped', 'planned', 'prepared']);
  const pendingByIndex = new Map();
  for (const item of summary.results) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const status = typeof item.status === 'string' ? item.status.trim().toLowerCase() : '';
    const goal = typeof item.goal === 'string' ? item.goal.trim() : '';
    const index = Number(item.index);
    if (!goal || !retryStatuses.has(status)) {
      continue;
    }
    if (Number.isInteger(index) && index > 0) {
      pendingByIndex.set(index, goal);
    } else {
      pendingByIndex.set(pendingByIndex.size + 1, goal);
    }
  }

  let sourceGoals = null;
  let resolvedGoalsFile = null;
  if (typeof summary.goals_file === 'string' && summary.goals_file.trim()) {
    const goalsFileCandidate = summary.goals_file.trim();
    const isSyntheticGoalsFile = goalsFileCandidate.startsWith('(') && goalsFileCandidate.endsWith(')');
    if (!isSyntheticGoalsFile) {
      const resolvedGoalsCandidate = pathModule.isAbsolute(goalsFileCandidate)
        ? goalsFileCandidate
        : pathModule.join(projectPath, goalsFileCandidate);
      if (await fs.pathExists(resolvedGoalsCandidate)) {
        const loadedSource = await loadCloseLoopBatchGoals(projectPath, goalsFileCandidate, formatCandidate, { fs, path: pathModule });
        sourceGoals = loadedSource.goals;
        resolvedGoalsFile = loadedSource.file;
      }
    }
  }

  const totalGoals = Number(summary.total_goals);
  const processedGoals = Number(summary.processed_goals);
  if (
    resumeStrategy === 'pending' &&
    sourceGoals &&
    Number.isInteger(totalGoals) &&
    Number.isInteger(processedGoals) &&
    processedGoals < totalGoals
  ) {
    const seenIndexes = new Set(
      summary.results
        .map(item => Number(item && item.index))
        .filter(index => Number.isInteger(index) && index > 0)
    );
    for (let index = 1; index <= sourceGoals.length; index += 1) {
      if (!seenIndexes.has(index)) {
        pendingByIndex.set(index, sourceGoals[index - 1]);
      }
    }
  }

  const orderedPendingEntries = [...pendingByIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([sourceIndex, goal]) => ({
      goal,
      sourceIndex: Math.max(0, sourceIndex - 1)
    }));
  if (orderedPendingEntries.length === 0) {
    throw new Error(`No pending goals found in batch summary: ${summaryFile}`);
  }

  return {
    file: resolvedGoalsFile || summary.goals_file || '(derived-from-summary)',
    goals: orderedPendingEntries.map(item => item.goal),
    goal_entries: orderedPendingEntries,
    resumedFromSummary: {
      file: summaryFile,
      strategy: resumeStrategy,
      previous_status: summary.status || null,
      previous_total_goals: Number.isInteger(totalGoals) ? totalGoals : null,
      previous_processed_goals: Number.isInteger(processedGoals) ? processedGoals : null
    }
  };
}

async function loadCloseLoopBatchGoalsFromSummary(
  projectPath,
  summaryCandidate,
  formatCandidate,
  resumeStrategyCandidate,
  dependencies = {}
) {
  const { fs, resolveCloseLoopBatchSummaryFile, buildCloseLoopBatchGoalsFromSummaryPayload } = dependencies;
  const summaryFile = await resolveCloseLoopBatchSummaryFile(projectPath, summaryCandidate);
  if (!(await fs.pathExists(summaryFile))) {
    throw new Error(`Batch summary file not found: ${summaryFile}`);
  }

  let summary = null;
  try {
    summary = await fs.readJson(summaryFile);
  } catch (error) {
    throw new Error(`Invalid batch summary JSON: ${summaryFile} (${error.message})`);
  }

  return buildCloseLoopBatchGoalsFromSummaryPayload(
    summary,
    summaryFile,
    projectPath,
    formatCandidate,
    resumeStrategyCandidate,
    {
      ...dependencies,
      fs,
      loadCloseLoopBatchGoals
    }
  );
}

module.exports = {
  normalizeBatchFormat,
  parseGoalsFromJsonPayload,
  parseGoalsFromLines,
  loadCloseLoopBatchGoals,
  buildCloseLoopBatchGoalsFromGoal,
  normalizeResumeStrategy,
  buildCloseLoopBatchGoalsFromSummaryPayload,
  loadCloseLoopBatchGoalsFromSummary
};