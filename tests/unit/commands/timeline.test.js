const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  runTimelineSaveCommand,
  runTimelineAutoCommand,
  runTimelineListCommand,
  runTimelineShowCommand,
  runTimelineRestoreCommand,
  runTimelineConfigCommand,
  runTimelinePushCommand
} = require('../../../lib/commands/timeline');

describe('timeline commands', () => {
  let tempDir;
  let originalLog;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-timeline-cmd-'));
    originalLog = console.log;
    console.log = jest.fn();

    await fs.ensureDir(path.join(tempDir, 'src'));
    await fs.writeFile(path.join(tempDir, 'src', 'index.js'), 'module.exports = 1;\n', 'utf8');
    await fs.writeFile(path.join(tempDir, 'README.md'), '# timeline\n', 'utf8');
  });

  afterEach(async () => {
    console.log = originalLog;
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('save/list/show workflow returns deterministic payloads', async () => {
    const saved = await runTimelineSaveCommand({
      trigger: 'manual',
      event: 'test.manual',
      summary: 'first save',
      json: true
    }, {
      projectPath: tempDir
    });

    expect(saved.success).toBe(true);
    expect(saved.snapshot.snapshot_id).toBeTruthy();

    const listed = await runTimelineListCommand({
      limit: '10',
      json: true
    }, {
      projectPath: tempDir
    });
    expect(listed.total).toBe(1);
    expect(listed.read_source).toBe('sqlite');
    expect(listed.consistency).toEqual(expect.objectContaining({
      status: expect.any(String)
    }));
    expect(listed.view_model.summary).toEqual(expect.objectContaining({
      total: 1,
      latest_snapshot_id: saved.snapshot.snapshot_id
    }));
    expect(listed.view_model.entries[0]).toEqual(expect.objectContaining({
      snapshot_id: saved.snapshot.snapshot_id,
      show_command: expect.stringContaining(saved.snapshot.snapshot_id),
      restore_command: expect.stringContaining(saved.snapshot.snapshot_id)
    }));

    const shown = await runTimelineShowCommand(saved.snapshot.snapshot_id, {
      json: true
    }, {
      projectPath: tempDir
    });

    expect(shown.success).toBe(true);
    expect(shown.read_source).toBe('sqlite');
    expect(shown.consistency).toEqual(expect.objectContaining({
      status: expect.any(String)
    }));
    expect(shown.snapshot.summary).toBe('first save');
    expect(shown.files.file_count).toBeGreaterThanOrEqual(2);
    expect(shown.view_model.snapshot).toEqual(expect.objectContaining({
      snapshot_id: saved.snapshot.snapshot_id,
      title: 'first save'
    }));
    expect(shown.view_model.file_total).toBeGreaterThanOrEqual(2);
  });

  test('auto snapshot skips when interval not reached', async () => {
    const first = await runTimelineAutoCommand({
      interval: '1',
      event: 'auto.test',
      summary: 'auto one',
      json: true
    }, {
      projectPath: tempDir
    });
    expect(first.created).toBe(true);

    const second = await runTimelineAutoCommand({
      interval: '60',
      event: 'auto.test',
      summary: 'auto two',
      json: true
    }, {
      projectPath: tempDir
    });
    expect(second.created).toBe(false);
    expect(second.reason).toBe('interval-not-reached');
  });

  test('restore command restores selected snapshot', async () => {
    const saved = await runTimelineSaveCommand({
      trigger: 'manual',
      event: 'restore.seed',
      summary: 'seed',
      json: true
    }, {
      projectPath: tempDir
    });

    await fs.writeFile(path.join(tempDir, 'src', 'index.js'), 'module.exports = 2;\n', 'utf8');

    const restored = await runTimelineRestoreCommand(saved.snapshot.snapshot_id, {
      prune: false,
      preSave: true,
      json: true
    }, {
      projectPath: tempDir
    });

    expect(restored.success).toBe(true);
    const content = await fs.readFile(path.join(tempDir, 'src', 'index.js'), 'utf8');
    expect(content).toContain('module.exports = 1');
  });

  test('config command reads and updates config', async () => {
    const shown = await runTimelineConfigCommand({
      json: true
    }, {
      projectPath: tempDir
    });
    expect(shown.success).toBe(true);
    expect(shown.updated).toBe(false);

    const updated = await runTimelineConfigCommand({
      enabled: 'true',
      interval: '12',
      maxEntries: '50',
      json: true
    }, {
      projectPath: tempDir
    });

    expect(updated.success).toBe(true);
    expect(updated.updated).toBe(true);
    expect(updated.config.auto_interval_minutes).toBe(12);
    expect(updated.config.max_entries).toBe(50);
  });

  test('timeline push blocks before checkpoint when collaboration governance gate fails', async () => {
    const gateMock = jest.fn().mockResolvedValue({
      passed: false,
      violations: ['missing ignore rule: .sce/config/coordination-log.json']
    });
    const checkpointMock = jest.fn();
    const spawnMock = jest.fn();

    await expect(runTimelinePushCommand(['origin', 'main'], {
      json: true
    }, {
      projectPath: tempDir,
      evaluateCollabGovernanceGate: gateMock,
      captureTimelineCheckpoint: checkpointMock,
      spawnSync: spawnMock
    })).rejects.toMatchObject({
      exitCode: 2,
      message: expect.stringContaining('collaboration governance gate blocked push')
    });

    expect(gateMock).toHaveBeenCalledTimes(1);
    expect(checkpointMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test('timeline push runs governance gate before checkpoint and git push', async () => {
    const gateMock = jest.fn().mockResolvedValue({
      passed: true,
      violations: [],
      warnings: [],
      summary: {}
    });
    const checkpointMock = jest.fn().mockResolvedValue({
      snapshot_id: 'tl-push-1'
    });
    const spawnMock = jest.fn().mockReturnValue({
      status: 0
    });

    const result = await runTimelinePushCommand(['origin', 'main'], {
      json: true,
      summary: 'push now'
    }, {
      projectPath: tempDir,
      evaluateCollabGovernanceGate: gateMock,
      captureTimelineCheckpoint: checkpointMock,
      spawnSync: spawnMock
    });

    expect(result.success).toBe(true);
    expect(result.checkpoint.snapshot_id).toBe('tl-push-1');
    expect(gateMock.mock.invocationCallOrder[0]).toBeLessThan(checkpointMock.mock.invocationCallOrder[0]);
    expect(checkpointMock.mock.invocationCallOrder[0]).toBeLessThan(spawnMock.mock.invocationCallOrder[0]);
    expect(spawnMock).toHaveBeenCalledWith('git', ['push', 'origin', 'main'], expect.objectContaining({
      cwd: tempDir
    }));
  });
});
