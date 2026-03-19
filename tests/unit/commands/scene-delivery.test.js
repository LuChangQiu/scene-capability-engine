const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { runSceneDeliveryShowCommand } = require('../../../lib/commands/scene');

describe('scene delivery show command', () => {
  let tempDir;
  let originalLog;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-scene-delivery-'));
    originalLog = console.log;
    console.log = jest.fn();
  });

  afterEach(async () => {
    console.log = originalLog;
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  async function seedSpec(specId, sceneId, tasksContent) {
    const specRoot = path.join(tempDir, '.sce', 'specs', specId);
    await fs.ensureDir(path.join(specRoot, 'custom'));
    await fs.writeFile(path.join(specRoot, 'requirements.md'), '# Requirements\n', 'utf8');
    await fs.writeFile(path.join(specRoot, 'design.md'), '# Design\n', 'utf8');
    await fs.writeFile(path.join(specRoot, 'tasks.md'), tasksContent, 'utf8');
    await fs.writeJson(path.join(specRoot, 'custom', 'problem-contract.json'), {
      spec_id: specId,
      scene_id: sceneId,
      issue_statement: 'demo issue'
    }, { spaces: 2 });
    await fs.writeFile(path.join(specRoot, 'custom', 'scene-spec.md'), '# Scene Spec\n', 'utf8');
    await fs.writeJson(path.join(specRoot, 'custom', 'problem-domain-chain.json'), {
      api_version: 'sce.problem-domain-chain/v0.1',
      spec_id: specId,
      scene_id: sceneId,
      problem: {
        statement: 'demo delivery projection',
        scope: 'demo',
        symptom: 'demo'
      },
      ontology: {
        entity: ['delivery_projection'],
        relation: ['delivery_projection->scene'],
        business_rule: ['demo'],
        decision_policy: ['demo'],
        execution_flow: ['demo']
      },
      correction_loop: {
        triggers: ['demo'],
        actions: ['attach debug evidence']
      },
      research_coverage: {
        required_dimensions: [
          'scene_boundary',
          'entity',
          'relation',
          'business_rule',
          'decision_policy',
          'execution_flow',
          'failure_signal',
          'debug_evidence_plan',
          'verification_gate'
        ],
        checklist: {
          scene_boundary: true,
          entity: true,
          relation: true,
          business_rule: true,
          decision_policy: true,
          execution_flow: true,
          failure_signal: true,
          debug_evidence_plan: true,
          verification_gate: true
        }
      },
      verification: {
        gates: ['projection-schema-review']
      }
    }, { spaces: 2 });
  }

  test('builds delivery projection envelope from spec, handoff, verify, and release evidence', async () => {
    await seedSpec('01-00-demo', 'scene.demo', [
      '- [x] 1.1 Finish delivery contract',
      '- [-] 1.2 Wire command output'
    ].join('\n'));

    await fs.ensureDir(path.join(tempDir, '.sce', 'spec-governance'));
    await fs.writeJson(path.join(tempDir, '.sce', 'spec-governance', 'scene-index.json'), {
      scenes: {
        'scene.demo': {
          scene_id: 'scene.demo',
          total_specs: 1,
          active_specs: 1,
          completed_specs: 0,
          stale_specs: 0,
          spec_ids: ['01-00-demo'],
          active_spec_ids: ['01-00-demo'],
          stale_spec_ids: []
        }
      }
    }, { spaces: 2 });

    await fs.ensureDir(path.join(tempDir, '.sce', 'session-governance'));
    await fs.writeJson(path.join(tempDir, '.sce', 'session-governance', 'scene-index.json'), {
      scenes: {
        'scene.demo': {
          scene_id: 'scene.demo',
          active_session_id: 'scene-demo-c1-abc123',
          active_cycle: 1,
          latest_completed_session_id: null,
          last_cycle: 1,
          cycles: [
            {
              cycle: 1,
              session_id: 'scene-demo-c1-abc123',
              status: 'active',
              started_at: '2026-03-19T08:00:00.000Z',
              completed_at: null
            }
          ]
        }
      }
    }, { spaces: 2 });

    await fs.ensureDir(path.join(tempDir, '.sce', 'reports', 'handoff-runs'));
    await fs.writeJson(path.join(tempDir, '.sce', 'reports', 'handoff-runs', 'handoff-demo.json'), {
      session_id: 'handoff-demo',
      generated_at: '2026-03-19T08:10:00.000Z',
      status: 'completed',
      manifest_path: '.sce/handoff/manifest.json',
      handoff: {
        specs: [
          { id: '01-00-demo' }
        ]
      },
      gates: {
        passed: true,
        reasons: []
      }
    }, { spaces: 2 });

    await fs.ensureDir(path.join(tempDir, '.sce', 'reports', 'studio'));
    await fs.writeJson(path.join(tempDir, '.sce', 'reports', 'studio', 'verify-job-demo.json'), {
      mode: 'studio-verify',
      profile: 'strict',
      started_at: '2026-03-19T08:20:00.000Z',
      completed_at: '2026-03-19T08:25:00.000Z',
      passed: true,
      steps: [
        { id: 'problem-closure-gate', status: 'passed' },
        { id: 'spec-domain-coverage', status: 'passed' }
      ],
      domain_chain: {
        spec_id: '01-00-demo',
        context: {
          scene_id: 'scene.demo'
        }
      }
    }, { spaces: 2 });

    await fs.writeJson(path.join(tempDir, '.sce', 'reports', 'studio', 'release-job-demo.json'), {
      mode: 'studio-release',
      profile: 'strict',
      channel: 'dev',
      release_ref: 'v1.0.0',
      started_at: '2026-03-19T08:30:00.000Z',
      completed_at: '2026-03-19T08:40:00.000Z',
      passed: true,
      steps: [
        { id: 'git-managed-release-gate', status: 'passed' }
      ],
      domain_chain: {
        spec_id: '01-00-demo',
        context: {
          scene_id: 'scene.demo'
        }
      }
    }, { spaces: 2 });

    const payload = await runSceneDeliveryShowCommand({ scene: 'scene.demo', json: true }, {
      projectRoot: tempDir,
      fileSystem: fs
    });

    expect(payload.mode).toBe('scene-delivery-show');
    expect(payload.query).toEqual({
      scene_id: 'scene.demo',
      spec_id: null
    });
    expect(payload.summary).toEqual(expect.objectContaining({
      specCount: 1,
      documentCount: 6,
      handoffCount: 1,
      releaseCount: 1,
      acceptanceCount: 1
    }));
    expect(payload.overview[0]).toEqual(expect.objectContaining({
      objectType: 'overview',
      sceneId: 'scene.demo'
    }));
    expect(payload.documents.map((item) => item.documentType)).toEqual([
      'requirements',
      'design',
      'tasks',
      'problem-contract',
      'scene-spec',
      'problem-domain-chain'
    ]);
    expect(payload.checklists[0]).toEqual(expect.objectContaining({
      objectType: 'checklist',
      specId: '01-00-demo',
      completionPercent: 50,
      counts: expect.objectContaining({
        total: 2,
        completed: 1,
        inProgress: 1
      })
    }));
    expect(payload.handoffs[0]).toEqual(expect.objectContaining({
      objectType: 'handoff',
      sceneId: 'scene.demo',
      specId: '01-00-demo',
      sessionId: 'handoff-demo',
      gatePassed: true
    }));
    expect(payload.acceptance[0]).toEqual(expect.objectContaining({
      objectType: 'acceptance',
      sceneId: 'scene.demo',
      specId: '01-00-demo',
      passed: true,
      status: 'accepted'
    }));
    expect(payload.releases[0]).toEqual(expect.objectContaining({
      objectType: 'release',
      sceneId: 'scene.demo',
      specId: '01-00-demo',
      releaseRef: 'v1.0.0',
      status: 'released'
    }));
    expect(JSON.parse(console.log.mock.calls[0][0])).toEqual(payload);
  });

  test('rejects explicit spec when it is bound to a different scene', async () => {
    await seedSpec('02-00-other', 'scene.other', '- [ ] 1.1 Do something\n');

    await expect(runSceneDeliveryShowCommand({
      scene: 'scene.demo',
      spec: '02-00-other',
      json: true
    }, {
      projectRoot: tempDir,
      fileSystem: fs
    })).rejects.toThrow('spec 02-00-other is bound to scene scene.other, not scene.demo');
  });
});
