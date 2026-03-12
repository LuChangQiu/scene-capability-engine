const Module = require('module');

if (process.env.SCE_TEST_MOCK_CLOSE_LOOP_RUNNER === '1') {
  const originalLoad = Module._load;
  const attemptByGoal = new Map();
  let flakyGoalKey = null;

  const slugify = value => {
    return `${value || ''}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'goal';
  };

  const mockCloseLoopRunner = {
    runAutoCloseLoop: async (goal) => {
      const goalText = `${goal || ''}`.trim();
      const key = goalText.toLowerCase() || 'goal';
      const attempts = (attemptByGoal.get(key) || 0) + 1;
      attemptByGoal.set(key, attempts);

      if (!flakyGoalKey) {
        flakyGoalKey = key;
      }
      const shouldFailThisRound = key === flakyGoalKey && attempts === 1;
      const goalSlug = slugify(goalText);
      const attemptLabel = `r${attempts}`;

      return {
        status: shouldFailThisRound ? 'failed' : 'completed',
        portfolio: {
          master_spec: `999-00-${goalSlug}-${attemptLabel}`,
          sub_specs: shouldFailThisRound ? [] : [`999-01-${goalSlug}`]
        }
      };
    }
  };

  Module._load = function patchedLoad(request, parent, isMain) {
    if (
      request === '../auto/close-loop-runner' ||
      request === './auto/close-loop-runner' ||
      /[\\/]auto[\\/]close-loop-runner$/.test(`${request || ''}`)
    ) {
      return mockCloseLoopRunner;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
}
