const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { SceStateStore } = require('../../../lib/state/sce-state-store');

describe('sce-state-store assurance data plane', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-assurance-store-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('upserts and lists assurance resource/log/backup/config records in memory fallback', async () => {
    const store = new SceStateStore(tempDir, {
      fileSystem: fs,
      env: { NODE_ENV: 'test' },
      sqliteModule: {}
    });

    await store.upsertAssuranceResourceSnapshot({
      snapshot_id: 'RES-001',
      resource_type: 'service',
      resource_name: 'moqui-runtime',
      status: 'healthy',
      summary: 'runtime healthy'
    });
    await store.upsertAssuranceLogView({
      view_id: 'LOG-001',
      title: 'error logs',
      source: 'app.log',
      status: 'ready'
    });
    await store.upsertAssuranceBackupRecord({
      backup_id: 'BKP-001',
      title: 'nightly backup',
      backup_type: 'snapshot',
      status: 'ready',
      recoverable: true,
      generated_at: '2026-03-08'
    });
    await store.upsertAssuranceConfigSwitch({
      switch_id: 'CFG-001',
      title: 'maintenance mode',
      switch_key: 'maintenance.mode',
      desired_state: 'off',
      actual_state: 'off',
      status: 'aligned'
    });

    expect((await store.listAssuranceResourceSnapshots({ limit: 10 }))).toHaveLength(1);
    expect((await store.listAssuranceLogViews({ limit: 10 }))).toHaveLength(1);
    expect((await store.listAssuranceBackupRecords({ limit: 10 }))).toHaveLength(1);
    expect((await store.listAssuranceConfigSwitches({ limit: 10 }))).toHaveLength(1);
  });
});
