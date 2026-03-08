const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { SceStateStore } = require('../../../lib/state/sce-state-store');
const {
  runAssuranceResourceStatusCommand,
  runAssuranceLogsViewsCommand,
  runAssuranceBackupListCommand,
  runAssuranceConfigSwitchesCommand
} = require('../../../lib/commands/assurance');

describe('assurance commands', () => {
  let tempDir;
  let originalLog;
  let stateStore;
  const testEnv = { NODE_ENV: 'test' };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-assurance-command-'));
    originalLog = console.log;
    console.log = jest.fn();
    stateStore = new SceStateStore(tempDir, {
      fileSystem: fs,
      env: testEnv,
      sqliteModule: {}
    });
  });

  afterEach(async () => {
    console.log = originalLog;
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('returns assurance tables with view_model output', async () => {
    await stateStore.upsertAssuranceResourceSnapshot({
      snapshot_id: 'RES-001',
      resource_type: 'service',
      resource_name: 'moqui-runtime',
      status: 'healthy',
      summary: 'runtime healthy'
    });
    await stateStore.upsertAssuranceLogView({
      view_id: 'LOG-001',
      title: 'error logs',
      source: 'app.log',
      status: 'ready',
      summary: 'latest runtime errors'
    });
    await stateStore.upsertAssuranceBackupRecord({
      backup_id: 'BKP-001',
      title: 'nightly backup',
      backup_type: 'snapshot',
      status: 'ready',
      recoverable: true,
      generated_at: '2026-03-08'
    });
    await stateStore.upsertAssuranceConfigSwitch({
      switch_id: 'CFG-001',
      title: 'maintenance mode',
      switch_key: 'maintenance.mode',
      desired_state: 'off',
      actual_state: 'off',
      status: 'aligned'
    });

    const resource = await runAssuranceResourceStatusCommand({ json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(resource.view_model.type).toBe('table');
    expect(resource.items[0].snapshot_id).toBe('RES-001');

    const logs = await runAssuranceLogsViewsCommand({ json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(logs.items[0].view_id).toBe('LOG-001');
    expect(logs.items[0].mb_status).toBeDefined();

    const backup = await runAssuranceBackupListCommand({ json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(backup.items[0].backup_id).toBe('BKP-001');
    expect(backup.items[0].recoverable).toBe(true);

    const config = await runAssuranceConfigSwitchesCommand({ json: true }, {
      projectPath: tempDir,
      fileSystem: fs,
      env: testEnv,
      stateStore
    });
    expect(config.items[0].switch_id).toBe('CFG-001');
    expect(config.items[0].desired_state).toBe('off');
  });
});
