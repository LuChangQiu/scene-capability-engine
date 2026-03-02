const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  ProjectTimelineStore,
  TIMELINE_CONFIG_RELATIVE_PATH,
  TIMELINE_DIR
} = require('../../../lib/runtime/project-timeline');

describe('ProjectTimelineStore', () => {
  let tempDir;
  let store;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-timeline-store-'));
    store = new ProjectTimelineStore(tempDir, fs);

    await fs.ensureDir(path.join(tempDir, 'src'));
    await fs.ensureDir(path.join(tempDir, '.sce', 'steering'));
    await fs.ensureDir(path.join(tempDir, '.git'));
    await fs.writeFile(path.join(tempDir, 'src', 'app.js'), 'console.log("v1");\n', 'utf8');
    await fs.writeFile(path.join(tempDir, 'README.md'), '# demo\n', 'utf8');
    await fs.writeFile(path.join(tempDir, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('saveSnapshot persists workspace checkpoint and index entry', async () => {
    const saved = await store.saveSnapshot({
      trigger: 'manual',
      event: 'test.manual',
      summary: 'checkpoint-1'
    });

    expect(saved.snapshot_id).toBeTruthy();
    expect(saved.file_count).toBeGreaterThanOrEqual(2);

    const snapshotFile = path.join(saved.snapshot_root, 'snapshot.json');
    expect(await fs.pathExists(snapshotFile)).toBe(true);

    const list = await store.listSnapshots({ limit: 10 });
    expect(list.total).toBe(1);
    expect(list.snapshots[0].summary).toBe('checkpoint-1');
  });

  test('maybeAutoSnapshot respects interval and skips when not due', async () => {
    const first = await store.maybeAutoSnapshot({
      event: 'auto.test',
      summary: 'auto first'
    });
    expect(first.created).toBe(true);

    const second = await store.maybeAutoSnapshot({
      intervalMinutes: 60,
      event: 'auto.test',
      summary: 'auto second'
    });
    expect(second.created).toBe(false);
    expect(second.reason).toBe('interval-not-reached');
  });

  test('restoreSnapshot overwrites workspace files and optionally prunes', async () => {
    const saved = await store.saveSnapshot({
      trigger: 'manual',
      event: 'test.restore',
      summary: 'restore-point'
    });

    await fs.writeFile(path.join(tempDir, 'src', 'app.js'), 'console.log("v2");\n', 'utf8');
    await fs.writeFile(path.join(tempDir, 'src', 'extra.js'), 'extra\n', 'utf8');

    const restored = await store.restoreSnapshot(saved.snapshot_id, {
      preSave: true,
      prune: true
    });

    expect(restored.success).toBe(true);
    const content = await fs.readFile(path.join(tempDir, 'src', 'app.js'), 'utf8');
    expect(content).toContain('v1');
    expect(await fs.pathExists(path.join(tempDir, 'src', 'extra.js'))).toBe(false);

    const list = await store.listSnapshots({ limit: 10 });
    expect(list.total).toBeGreaterThanOrEqual(3);
  });

  test('updateConfig writes timeline config file', async () => {
    const updated = await store.updateConfig({
      enabled: true,
      auto_interval_minutes: 15,
      max_entries: 20
    });

    expect(updated.auto_interval_minutes).toBe(15);
    expect(updated.max_entries).toBe(20);

    const configPath = path.join(tempDir, TIMELINE_CONFIG_RELATIVE_PATH);
    expect(await fs.pathExists(configPath)).toBe(true);

    const timelinePath = path.join(tempDir, TIMELINE_DIR);
    expect(timelinePath).toContain(path.join('.sce', 'timeline'));
  });
});
