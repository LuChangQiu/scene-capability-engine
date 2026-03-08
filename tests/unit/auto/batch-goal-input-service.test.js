const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const {
  loadCloseLoopBatchGoals,
  buildCloseLoopBatchGoalsFromGoal,
  buildCloseLoopBatchGoalsFromSummaryPayload,
  loadCloseLoopBatchGoalsFromSummary,
  normalizeResumeStrategy
} = require('../../../lib/auto/batch-goal-input-service');

describe('auto batch goal input service', () => {
  test('loads goals from json and line files', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-batch-goals-'));
    try {
      const jsonFile = path.join(tempDir, 'goals.json');
      const lineFile = path.join(tempDir, 'goals.lines');
      await fs.writeJson(jsonFile, { goals: [' Goal A ', 'Goal B'] }, { spaces: 2 });
      await fs.writeFile(lineFile, '# note\nGoal C\n\n Goal D \n', 'utf8');

      const jsonGoals = await loadCloseLoopBatchGoals(tempDir, jsonFile, 'json', { fs, path });
      const lineGoals = await loadCloseLoopBatchGoals(tempDir, lineFile, 'lines', { fs, path });

      expect(jsonGoals.goals).toEqual(['Goal A', 'Goal B']);
      expect(lineGoals.goals).toEqual(['Goal C', 'Goal D']);
    } finally {
      await fs.remove(tempDir);
    }
  });

  test('builds refined decomposed goals from a broad goal with quality metadata', () => {
    const result = buildCloseLoopBatchGoalsFromGoal(
      'Stabilize orchestration, strengthen observability, and complete rollout docs',
      3,
      { minQualityScore: 80 },
      {
        analyzeGoalSemantics: () => ({
          clauses: [
            'Stabilize orchestration execution flow',
            'Strengthen observability coverage and reporting',
            'Complete rollout and operations documentation'
          ],
          rankedCategories: ['orchestration', 'quality', 'docs'],
          categoryScores: { orchestration: 3, quality: 2, docs: 1 }
        })
      }
    );

    expect(result.file).toBe('(generated-from-goal)');
    expect(result.goals).toHaveLength(3);
    expect(result.generatedFromGoal).toEqual(expect.objectContaining({
      target_goal_count: 3,
      produced_goal_count: 3
    }));
    expect(result.generatedFromGoal.quality.score).toBeGreaterThan(0);
  });

  test('restores pending goals from batch summary payload and summary file', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-batch-summary-'));
    try {
      const goalsFile = path.join(tempDir, 'goals.lines');
      const summaryFile = path.join(tempDir, 'summary.json');
      await fs.writeFile(goalsFile, 'Goal 1\nGoal 2\nGoal 3\n', 'utf8');
      await fs.writeJson(summaryFile, {
        goals_file: goalsFile,
        status: 'partial-failed',
        total_goals: 3,
        processed_goals: 2,
        results: [
          { index: 1, goal: 'Goal 1', status: 'completed' },
          { index: 2, goal: 'Goal 2', status: 'failed' }
        ]
      }, { spaces: 2 });

      const payload = await buildCloseLoopBatchGoalsFromSummaryPayload(
        await fs.readJson(summaryFile),
        summaryFile,
        tempDir,
        'lines',
        'pending',
        {
          fs,
          path,
          loadCloseLoopBatchGoals
        }
      );
      expect(payload.goals).toEqual(['Goal 2', 'Goal 3']);
      expect(payload.goal_entries).toEqual([
        { goal: 'Goal 2', sourceIndex: 1 },
        { goal: 'Goal 3', sourceIndex: 2 }
      ]);
      expect(normalizeResumeStrategy('failed-only')).toBe('failed-only');

      const loaded = await loadCloseLoopBatchGoalsFromSummary(tempDir, summaryFile, 'lines', 'failed-only', {
        fs,
        resolveCloseLoopBatchSummaryFile: async (_projectPath, candidate) => candidate,
        buildCloseLoopBatchGoalsFromSummaryPayload
      });
      expect(loaded.goals).toEqual(['Goal 2']);
      expect(loaded.resumedFromSummary).toEqual(expect.objectContaining({
        strategy: 'failed-only',
        previous_status: 'partial-failed'
      }));
    } finally {
      await fs.remove(tempDir);
    }
  });
});
