const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  buildProjectSharedProblemProjection,
  syncProjectSharedProblemProjection,
  DEFAULT_PROJECT_SHARED_PROBLEM_FILE
} = require('../../../lib/problem/project-problem-projection');

async function writeSpec(tempDir, specId, options = {}) {
  const specRoot = path.join(tempDir, '.sce', 'specs', specId);
  await fs.ensureDir(path.join(specRoot, 'custom'));
  await fs.writeFile(path.join(specRoot, 'requirements.md'), '# requirements\n', 'utf8');
  await fs.writeFile(path.join(specRoot, 'design.md'), '# design\n', 'utf8');
  await fs.writeFile(path.join(specRoot, 'tasks.md'), options.tasks || '- [ ] pending task\n', 'utf8');
  await fs.writeJson(path.join(specRoot, 'custom', 'problem-contract.json'), {
    schema_version: '1.0',
    spec_id: specId,
    scene_id: options.sceneId || 'scene.demo',
    issue_statement: options.problemStatement || `Problem for ${specId}`,
    expected_outcome: options.expectedOutcome || 'Close the loop',
    reproduction_steps: ['Step 1'],
    impact_scope: options.impactScope || 'scene=scene.demo',
    forbidden_workarounds: ['Do not bypass gate']
  }, { spaces: 2 });
  await fs.writeJson(path.join(specRoot, 'custom', 'problem-domain-chain.json'), {
    api_version: 'sce.problem-domain-chain/v0.1',
    spec_id: specId,
    scene_id: options.sceneId || 'scene.demo',
    problem: {
      statement: options.problemStatement || `Problem for ${specId}`
    },
    summary: {
      ontology_counts: {
        entity: 1,
        relation: 1,
        business_rule: 1,
        decision_policy: 1,
        execution_flow: 1
      },
      evidence_binding_count: 2,
      hypothesis_count: 1,
      risk_count: 1,
      verification_gates: ['spec-gate']
    }
  }, { spaces: 2 });

  if (options.updatedAt) {
    const updatedAt = new Date(options.updatedAt);
    await fs.utimes(specRoot, updatedAt, updatedAt);
    await fs.utimes(path.join(specRoot, 'tasks.md'), updatedAt, updatedAt);
    await fs.utimes(path.join(specRoot, 'custom', 'problem-contract.json'), updatedAt, updatedAt);
    await fs.utimes(path.join(specRoot, 'custom', 'problem-domain-chain.json'), updatedAt, updatedAt);
  }
}

describe('project-problem-projection', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-project-problem-projection-'));
    await fs.ensureDir(path.join(tempDir, '.sce', 'config'));
    await fs.writeJson(path.join(tempDir, '.sce', 'config', 'problem-closure-policy.json'), {
      schema_version: '1.0',
      enabled: true,
      governance_report_path: '.sce/reports/interactive-governance-report.json',
      project_shared_projection: {
        enabled: true,
        file: DEFAULT_PROJECT_SHARED_PROBLEM_FILE,
        scope: 'non_completed'
      },
      verify: {
        require_problem_contract: true,
        require_domain_validation: true,
        require_domain_coverage: true
      },
      release: {
        require_problem_contract: true,
        require_domain_validation: true,
        require_domain_coverage: true,
        require_verify_report: true,
        require_governance_report: false,
        block_on_high_governance_alerts: true
      }
    }, { spaces: 2 });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test('build filters out completed specs by default and includes problem contract details', async () => {
    await writeSpec(tempDir, '01-00-active-problem', {
      problemStatement: 'Active problem',
      tasks: '- [ ] todo\n',
      updatedAt: '2026-03-16T00:00:00.000Z'
    });
    await writeSpec(tempDir, '02-00-completed-problem', {
      problemStatement: 'Completed problem',
      tasks: '- [x] done\n',
      updatedAt: '2026-03-16T00:00:00.000Z'
    });

    const payload = await buildProjectSharedProblemProjection(tempDir);

    expect(payload.api_version).toBe('sce.project-problem-projection/v0.1');
    expect(payload.source.scope).toBe('non_completed');
    expect(payload.summary.total_entries).toBe(1);
    expect(payload.entries[0]).toEqual(expect.objectContaining({
      spec_id: '01-00-active-problem',
      lifecycle_state: 'active',
      problem_statement: 'Active problem',
      expected_outcome: 'Close the loop'
    }));
  });

  test('sync writes active_only projection to tracked path', async () => {
    await writeSpec(tempDir, '01-00-active-problem', {
      problemStatement: 'Active problem',
      tasks: '- [ ] todo\n',
      updatedAt: '2026-03-16T00:00:00.000Z'
    });
    await writeSpec(tempDir, '02-00-stale-problem', {
      problemStatement: 'Stale problem',
      tasks: '- [ ] todo\n',
      updatedAt: '2026-02-01T00:00:00.000Z'
    });

    const result = await syncProjectSharedProblemProjection(tempDir, {
      projectSharedProjection: {
        enabled: true,
        file: DEFAULT_PROJECT_SHARED_PROBLEM_FILE,
        scope: 'active_only'
      }
    });

    expect(result.refreshed).toBe(true);
    expect(result.total_entries).toBe(1);
    const payload = await fs.readJson(path.join(tempDir, DEFAULT_PROJECT_SHARED_PROBLEM_FILE));
    expect(payload.source.scope).toBe('active_only');
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].spec_id).toBe('01-00-active-problem');
  });

  test('sync returns advisory result when projection is disabled', async () => {
    const result = await syncProjectSharedProblemProjection(tempDir, {
      projectSharedProjection: {
        enabled: false,
        file: DEFAULT_PROJECT_SHARED_PROBLEM_FILE,
        scope: 'non_completed'
      }
    });

    expect(result.enabled).toBe(false);
    expect(result.refreshed).toBe(false);
  });

  test('sync is idempotent when projection content has not changed', async () => {
    await writeSpec(tempDir, '01-00-active-problem', {
      problemStatement: 'Active problem',
      tasks: '- [ ] todo\n',
      updatedAt: '2026-03-16T00:00:00.000Z'
    });

    const first = await syncProjectSharedProblemProjection(tempDir, {
      projectSharedProjection: {
        enabled: true,
        file: DEFAULT_PROJECT_SHARED_PROBLEM_FILE,
        scope: 'non_completed'
      }
    });
    const before = await fs.readJson(path.join(tempDir, DEFAULT_PROJECT_SHARED_PROBLEM_FILE));

    const second = await syncProjectSharedProblemProjection(tempDir, {
      projectSharedProjection: {
        enabled: true,
        file: DEFAULT_PROJECT_SHARED_PROBLEM_FILE,
        scope: 'non_completed'
      }
    });
    const after = await fs.readJson(path.join(tempDir, DEFAULT_PROJECT_SHARED_PROBLEM_FILE));

    expect(first.refreshed).toBe(true);
    expect(second.refreshed).toBe(false);
    expect(after.generated_at).toBe(before.generated_at);
    expect(after.entries).toEqual(before.entries);
  });
});
