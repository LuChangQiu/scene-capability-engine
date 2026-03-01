const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  resolveStudioPaths,
  readLatestJob,
  readStudioEvents,
  runStudioPlanCommand,
  runStudioGenerateCommand,
  runStudioApplyCommand,
  runStudioVerifyCommand,
  runStudioReleaseCommand,
  runStudioRollbackCommand,
  runStudioEventsCommand,
  runStudioResumeCommand,
  loadStudioSecurityPolicy,
  ensureStudioAuthorization,
  buildReleaseGateSteps
} = require('../../../lib/commands/studio');
const { ensureSpecDomainArtifacts } = require('../../../lib/spec/domain-modeling');
const { resolveErrorbookPaths } = require('../../../lib/commands/errorbook');

describe('studio command workflow', () => {
  let tempDir;
  let originalLog;
  let successRunner;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-studio-cmd-'));
    originalLog = console.log;
    console.log = jest.fn();
    successRunner = jest.fn(async () => ({
      status: 0,
      stdout: 'ok',
      stderr: '',
      duration_ms: 1
    }));
  });

  afterEach(async () => {
    console.log = originalLog;
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('creates a plan job and writes latest pointer', async () => {
    const payload = await runStudioPlanCommand({
      scene: 'scene.customer-order-inventory',
      fromChat: 'session-001',
      goal: 'Build customer-order-inventory demo',
      json: true
    }, {
      projectPath: tempDir
    });

    expect(payload.mode).toBe('studio-plan');
    expect(payload.status).toBe('planned');
    expect(payload.job_id).toContain('studio-');
    expect(payload.next_action).toContain('sce studio generate');

    const paths = resolveStudioPaths(tempDir);
    const latestJobId = await readLatestJob(paths);
    expect(latestJobId).toBe(payload.job_id);

    const jobPath = path.join(paths.jobsDir, `${payload.job_id}.json`);
    expect(await fs.pathExists(jobPath)).toBe(true);
  });

  test('plan with --spec ingests domain-chain and carries it through generate/verify/release reports', async () => {
    const specId = '01-00-domain-aware';
    const specRoot = path.join(tempDir, '.sce', 'specs', specId);
    await fs.ensureDir(specRoot);
    await ensureSpecDomainArtifacts(tempDir, specId, {
      fileSystem: fs,
      sceneId: 'scene.customer-order-inventory',
      problemStatement: 'Customer-order-inventory flow has reconciliation drift',
      primaryFlow: 'Customer order should reserve inventory before confirmation',
      verificationPlan: 'Run order+inventory consistency checks'
    });

    const planned = await runStudioPlanCommand({
      scene: 'scene.customer-order-inventory',
      spec: specId,
      fromChat: 'session-domain-001',
      goal: 'stabilize customer order inventory lifecycle',
      json: true
    }, {
      projectPath: tempDir
    });

    const paths = resolveStudioPaths(tempDir);
    const plannedJob = await fs.readJson(path.join(paths.jobsDir, `${planned.job_id}.json`));
    expect(plannedJob.source.spec_id).toBe(specId);
    expect(plannedJob.source.domain_chain).toEqual(expect.objectContaining({
      resolved: true,
      source: 'explicit-spec',
      spec_id: specId
    }));
    expect(plannedJob.stages.plan.metadata.domain_chain_resolved).toBe(true);

    await runStudioGenerateCommand({
      job: planned.job_id,
      json: true
    }, {
      projectPath: tempDir
    });

    const generatedJob = await fs.readJson(path.join(paths.jobsDir, `${planned.job_id}.json`));
    expect(generatedJob.stages.generate.metadata.domain_chain).toEqual(expect.objectContaining({
      resolved: true,
      source: 'explicit-spec',
      spec_id: specId
    }));
    expect(generatedJob.artifacts.generate_report).toContain(`generate-${planned.job_id}.json`);
    const generateReport = await fs.readJson(path.join(tempDir, generatedJob.artifacts.generate_report));
    expect(generateReport.domain_chain).toEqual(expect.objectContaining({
      resolved: true,
      source: 'explicit-spec',
      spec_id: specId
    }));

    await runStudioApplyCommand({
      job: planned.job_id,
      json: true
    }, {
      projectPath: tempDir
    });
    await runStudioVerifyCommand({
      job: planned.job_id,
      profile: 'standard',
      json: true
    }, {
      projectPath: tempDir,
      commandRunner: successRunner
    });
    await runStudioReleaseCommand({
      job: planned.job_id,
      profile: 'standard',
      channel: 'dev',
      json: true
    }, {
      projectPath: tempDir,
      commandRunner: successRunner
    });

    const releasedJob = await fs.readJson(path.join(paths.jobsDir, `${planned.job_id}.json`));
    const verifyReport = await fs.readJson(path.join(tempDir, releasedJob.artifacts.verify_report));
    const releaseReport = await fs.readJson(path.join(tempDir, releasedJob.artifacts.release_report));
    expect(verifyReport.domain_chain).toEqual(expect.objectContaining({
      resolved: true,
      source: 'explicit-spec',
      spec_id: specId
    }));
    expect(releaseReport.domain_chain).toEqual(expect.objectContaining({
      resolved: true,
      source: 'explicit-spec',
      spec_id: specId
    }));
  });

  test('plan without --spec auto-binds latest scene domain-chain candidate', async () => {
    const specId = '01-01-domain-auto';
    const specRoot = path.join(tempDir, '.sce', 'specs', specId);
    await fs.ensureDir(specRoot);
    await ensureSpecDomainArtifacts(tempDir, specId, {
      fileSystem: fs,
      sceneId: 'scene.auto-bind',
      problemStatement: 'Auto bind domain chain for scene',
      verificationPlan: 'Smoke checks'
    });

    const planned = await runStudioPlanCommand({
      scene: 'scene.auto-bind',
      fromChat: 'session-domain-002',
      json: true
    }, {
      projectPath: tempDir
    });

    const paths = resolveStudioPaths(tempDir);
    const plannedJob = await fs.readJson(path.join(paths.jobsDir, `${planned.job_id}.json`));
    expect(plannedJob.source.domain_chain).toEqual(expect.objectContaining({
      resolved: true,
      source: 'scene-auto-single',
      spec_id: specId
    }));
  });

  test('supports end-to-end stage flow from generate to release', async () => {
    const planned = await runStudioPlanCommand({
      scene: 'scene.customer-order-inventory',
      fromChat: 'session-002',
      json: true
    }, {
      projectPath: tempDir
    });

    const generated = await runStudioGenerateCommand({
      scene: 'scene.customer-order-inventory',
      json: true
    }, {
      projectPath: tempDir
    });

    expect(generated.status).toBe('generated');
    expect(generated.artifacts.patch_bundle_id).toContain('patch-scene.customer-order-inventory-');

    const applied = await runStudioApplyCommand({
      job: planned.job_id,
      json: true
    }, {
      projectPath: tempDir
    });
    expect(applied.status).toBe('applied');

    const verified = await runStudioVerifyCommand({
      profile: 'standard',
      json: true
    }, {
      projectPath: tempDir,
      commandRunner: successRunner
    });
    expect(verified.status).toBe('verified');
    expect(verified.artifacts.verify_report).toContain(`verify-${planned.job_id}.json`);

    const released = await runStudioReleaseCommand({
      channel: 'prod',
      json: true
    }, {
      projectPath: tempDir,
      commandRunner: successRunner
    });
    expect(released.status).toBe('released');
    expect(released.next_action).toBe('complete');

    const resumed = await runStudioResumeCommand({
      job: planned.job_id,
      json: true
    }, {
      projectPath: tempDir
    });
    expect(resumed.status).toBe('released');
    expect(resumed.progress.percent).toBe(100);
  });

  test('fails generate when no plan job exists', async () => {
    await expect(runStudioGenerateCommand({
      scene: 'scene.demo',
      json: true
    }, {
      projectPath: tempDir
    })).rejects.toThrow('No studio job found');
  });

  test('fails release on invalid channel', async () => {
    await runStudioPlanCommand({
      scene: 'scene.release-channel-check',
      fromChat: 'session-003',
      json: true
    }, {
      projectPath: tempDir
    });

    await expect(runStudioReleaseCommand({
      channel: 'staging',
      json: true
    }, {
      projectPath: tempDir
    })).rejects.toThrow('Invalid --channel');
  });

  test('fails verify when required gate command fails', async () => {
    const packageJsonPath = path.join(tempDir, 'package.json');
    await fs.writeJson(packageJsonPath, {
      name: 'studio-verify-fixture',
      version: '1.0.0',
      scripts: {
        'test:unit': 'echo test'
      }
    }, { spaces: 2 });

    const planned = await runStudioPlanCommand({
      scene: 'scene.verify-fail',
      fromChat: 'session-006',
      json: true
    }, {
      projectPath: tempDir
    });
    await runStudioGenerateCommand({
      job: planned.job_id,
      scene: 'scene.verify-fail',
      json: true
    }, {
      projectPath: tempDir
    });
    await runStudioApplyCommand({
      job: planned.job_id,
      json: true
    }, {
      projectPath: tempDir
    });

    const failRunner = jest.fn(async () => ({
      status: 2,
      stdout: '',
      stderr: 'boom',
      duration_ms: 3
    }));

    await expect(runStudioVerifyCommand({
      job: planned.job_id,
      json: true
    }, {
      projectPath: tempDir,
      commandRunner: failRunner
    })).rejects.toThrow('studio verify failed');

    const paths = resolveStudioPaths(tempDir);
    const job = await fs.readJson(path.join(paths.jobsDir, `${planned.job_id}.json`));
    expect(job.status).toBe('verify_failed');
    expect(job.stages.verify.status).toBe('failed');

    const errorbookPaths = resolveErrorbookPaths(tempDir);
    const errorbookIndex = await fs.readJson(errorbookPaths.indexFile);
    expect(errorbookIndex.total_entries).toBeGreaterThanOrEqual(1);
    const entry = await fs.readJson(path.join(errorbookPaths.entriesDir, `${errorbookIndex.entries[0].id}.json`));
    expect(entry.status).toBe('candidate');
    expect(entry.tags).toEqual(expect.arrayContaining(['release-blocker', 'stage-verify']));
  });

  test('enforces stage order constraints', async () => {
    const planned = await runStudioPlanCommand({
      scene: 'scene.order',
      fromChat: 'session-004',
      json: true
    }, {
      projectPath: tempDir
    });

    await expect(runStudioApplyCommand({
      job: planned.job_id,
      json: true
    }, {
      projectPath: tempDir
    })).rejects.toThrow('stage "generate" is not completed');

    await runStudioGenerateCommand({
      job: planned.job_id,
      scene: 'scene.order',
      json: true
    }, {
      projectPath: tempDir
    });

    await expect(runStudioReleaseCommand({
      job: planned.job_id,
      channel: 'dev',
      json: true
    }, {
      projectPath: tempDir
    })).rejects.toThrow('stage "verify" is not completed');
  });

  test('records studio events and supports rollback', async () => {
    const planned = await runStudioPlanCommand({
      scene: 'scene.inventory',
      fromChat: 'session-005',
      json: true
    }, {
      projectPath: tempDir
    });

    await runStudioGenerateCommand({
      job: planned.job_id,
      scene: 'scene.inventory',
      json: true
    }, {
      projectPath: tempDir
    });
    await runStudioApplyCommand({
      job: planned.job_id,
      json: true
    }, {
      projectPath: tempDir
    });

    const rolledBack = await runStudioRollbackCommand({
      job: planned.job_id,
      reason: 'manual-check-failed',
      json: true
    }, {
      projectPath: tempDir
    });
    expect(rolledBack.status).toBe('rolled_back');
    expect(rolledBack.next_action).toContain('sce studio plan');

    const eventsPayload = await runStudioEventsCommand({
      job: planned.job_id,
      limit: '10',
      json: true
    }, {
      projectPath: tempDir
    });
    expect(eventsPayload.events.length).toBeGreaterThanOrEqual(4);
    expect(eventsPayload.events[eventsPayload.events.length - 1].event_type).toBe('job.rolled_back');

    const paths = resolveStudioPaths(tempDir);
    const rawEvents = await readStudioEvents(paths, planned.job_id, { limit: 100 });
    expect(rawEvents.some((event) => event.event_type === 'stage.apply.completed')).toBe(true);

    await expect(runStudioVerifyCommand({
      job: planned.job_id,
      json: true
    }, {
      projectPath: tempDir
    })).rejects.toThrow('is rolled back');
  });

  test('requires authorization for protected actions when policy is enabled', async () => {
    const secureEnv = {
      ...process.env,
      SCE_STUDIO_REQUIRE_AUTH: '1',
      SCE_STUDIO_AUTH_PASSWORD: 'top-secret'
    };

    const planned = await runStudioPlanCommand({
      scene: 'scene.secure',
      fromChat: 'session-007',
      json: true
    }, {
      projectPath: tempDir
    });

    await runStudioGenerateCommand({
      job: planned.job_id,
      scene: 'scene.secure',
      json: true
    }, {
      projectPath: tempDir
    });

    await expect(runStudioApplyCommand({
      job: planned.job_id,
      json: true
    }, {
      projectPath: tempDir,
      env: secureEnv
    })).rejects.toThrow('Authorization required for studio apply');

    const applied = await runStudioApplyCommand({
      job: planned.job_id,
      authPassword: 'top-secret',
      json: true
    }, {
      projectPath: tempDir,
      env: secureEnv
    });
    expect(applied.status).toBe('applied');

    await expect(runStudioRollbackCommand({
      job: planned.job_id,
      json: true
    }, {
      projectPath: tempDir,
      env: secureEnv
    })).rejects.toThrow('Authorization required for studio rollback');

    const rolledBack = await runStudioRollbackCommand({
      job: planned.job_id,
      authPassword: 'top-secret',
      reason: 'auth-test',
      json: true
    }, {
      projectPath: tempDir,
      env: secureEnv
    });
    expect(rolledBack.status).toBe('rolled_back');
  });

  test('loads studio security policy from .sce/config and supports env override', async () => {
    const policyPath = path.join(tempDir, '.sce', 'config', 'studio-security.json');
    await fs.ensureDir(path.dirname(policyPath));
    await fs.writeJson(policyPath, {
      enabled: true,
      require_auth_for: ['apply'],
      password_env: 'SCE_STUDIO_AUTH_PASSWORD_LOCAL'
    }, { spaces: 2 });

    const policy = await loadStudioSecurityPolicy(tempDir, fs, {
      SCE_STUDIO_PASSWORD_ENV: 'SCE_STUDIO_AUTH_PASSWORD_OVERRIDE'
    });

    expect(policy.enabled).toBe(true);
    expect(policy.require_auth_for).toEqual(['apply']);
    expect(policy.password_env).toBe('SCE_STUDIO_AUTH_PASSWORD_OVERRIDE');
  });

  test('ensureStudioAuthorization honors policy file configuration', async () => {
    const policyPath = path.join(tempDir, '.sce', 'config', 'studio-security.json');
    await fs.ensureDir(path.dirname(policyPath));
    await fs.writeJson(policyPath, {
      enabled: true,
      require_auth_for: ['release'],
      password_env: 'SCE_STUDIO_AUTH_PASSWORD_LOCAL'
    }, { spaces: 2 });

    await expect(ensureStudioAuthorization('release', {}, {
      projectPath: tempDir,
      fileSystem: fs,
      env: {
        SCE_STUDIO_AUTH_PASSWORD_LOCAL: 'secret'
      }
    })).rejects.toThrow('Authorization required for studio release');

    const result = await ensureStudioAuthorization('release', {
      authPassword: 'secret'
    }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: {
        SCE_STUDIO_AUTH_PASSWORD_LOCAL: 'secret'
      }
    });

    expect(result.required).toBe(true);
    expect(result.password_env).toBe('SCE_STUDIO_AUTH_PASSWORD_LOCAL');
  });

  test('strict verify fails when required gates are unavailable', async () => {
    const planned = await runStudioPlanCommand({
      scene: 'scene.strict-verify',
      fromChat: 'session-008',
      json: true
    }, {
      projectPath: tempDir
    });

    await runStudioGenerateCommand({
      job: planned.job_id,
      scene: 'scene.strict-verify',
      json: true
    }, {
      projectPath: tempDir
    });

    await runStudioApplyCommand({
      job: planned.job_id,
      json: true
    }, {
      projectPath: tempDir
    });

    await expect(runStudioVerifyCommand({
      job: planned.job_id,
      profile: 'strict',
      json: true
    }, {
      projectPath: tempDir,
      commandRunner: successRunner
    })).rejects.toThrow('studio verify failed');

    const paths = resolveStudioPaths(tempDir);
    const job = await fs.readJson(path.join(paths.jobsDir, `${planned.job_id}.json`));
    expect(job.status).toBe('verify_failed');
  });

  test('strict release fails when required release evidence gates are unavailable', async () => {
    const planned = await runStudioPlanCommand({
      scene: 'scene.strict-release',
      fromChat: 'session-009',
      json: true
    }, {
      projectPath: tempDir
    });

    await runStudioGenerateCommand({
      job: planned.job_id,
      scene: 'scene.strict-release',
      json: true
    }, {
      projectPath: tempDir
    });

    await runStudioApplyCommand({
      job: planned.job_id,
      json: true
    }, {
      projectPath: tempDir
    });

    await runStudioVerifyCommand({
      job: planned.job_id,
      profile: 'standard',
      json: true
    }, {
      projectPath: tempDir,
      commandRunner: successRunner
    });

    await expect(runStudioReleaseCommand({
      job: planned.job_id,
      profile: 'strict',
      channel: 'dev',
      json: true
    }, {
      projectPath: tempDir,
      commandRunner: successRunner
    })).rejects.toThrow('studio release failed');

    const paths = resolveStudioPaths(tempDir);
    const job = await fs.readJson(path.join(paths.jobsDir, `${planned.job_id}.json`));
    expect(job.status).toBe('release_failed');

    const errorbookPaths = resolveErrorbookPaths(tempDir);
    const errorbookIndex = await fs.readJson(errorbookPaths.indexFile);
    expect(errorbookIndex.total_entries).toBeGreaterThanOrEqual(1);
  });

  test('release gate includes ontology and capability matrix checks when handoff manifest exists', async () => {
    const handoffDir = path.join(tempDir, 'docs', 'handoffs');
    await fs.ensureDir(handoffDir);
    await fs.writeJson(path.join(handoffDir, 'handoff-manifest.json'), {
      project: 'studio-release-gate-fixture',
      entries: []
    }, { spaces: 2 });
    const scriptsDir = path.join(tempDir, 'scripts');
    await fs.ensureDir(scriptsDir);
    await fs.writeFile(
      path.join(scriptsDir, 'git-managed-gate.js'),
      "console.log(JSON.stringify({ mode: 'git-managed-gate', passed: true }));\n",
      'utf8'
    );
    await fs.writeFile(
      path.join(scriptsDir, 'errorbook-release-gate.js'),
      "console.log(JSON.stringify({ mode: 'errorbook-release-gate', passed: true }));\n",
      'utf8'
    );

    const steps = await buildReleaseGateSteps({
      profile: 'standard'
    }, {
      projectPath: tempDir,
      fileSystem: fs
    });

    const byId = new Map(steps.map((item) => [item.id, item]));
    expect(byId.get('git-managed-gate')).toEqual(expect.objectContaining({
      enabled: true,
      required: true
    }));
    expect(byId.get('errorbook-release-gate')).toEqual(expect.objectContaining({
      enabled: true,
      required: true
    }));
    expect(byId.get('scene-package-publish-batch-dry-run')).toEqual(expect.objectContaining({
      enabled: true,
      required: true
    }));
    expect(byId.get('handoff-capability-matrix-gate')).toEqual(expect.objectContaining({
      enabled: true,
      required: true
    }));
  });
});
