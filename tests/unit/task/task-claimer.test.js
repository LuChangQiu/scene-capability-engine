const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const TaskClaimer = require('../../../lib/task/task-claimer');

describe('TaskClaimer', () => {
  let tempRoot;
  let claimer;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-task-claimer-'));
    claimer = new TaskClaimer();
  });

  afterEach(async () => {
    await fs.remove(tempRoot);
  });

  async function writeTasks(specName, content) {
    const specDir = path.join(tempRoot, '.sce', 'specs', specName);
    await fs.ensureDir(specDir);
    const tasksPath = path.join(specDir, 'tasks.md');
    await fs.writeFile(tasksPath, content, 'utf8');
    return tasksPath;
  }

  test('parseTasks supports dotted IDs, nested indentation, optional markers, and legacy Task labels', async () => {
    const tasksPath = await writeTasks('demo-spec', `# Implementation Plan\n\n## Tasks\n\n- [x] 1. Top task\n  - [ ] 1.1 Nested task\n- [ ]* 2 Optional task\n- [x] **Task 3: Legacy style task**\n`);

    const tasks = await claimer.parseTasks(tasksPath);

    expect(tasks).toHaveLength(4);
    expect(tasks.map((task) => task.taskId)).toEqual(['1', '1.1', '2', '3']);

    const nested = tasks.find((task) => task.taskId === '1.1');
    expect(nested).toBeDefined();
    expect(nested.linePrefix).toBe('  - ');
    expect(nested.status).toBe('not-started');

    const optional = tasks.find((task) => task.taskId === '2');
    expect(optional.isOptional).toBe(true);

    const legacy = tasks.find((task) => task.taskId === '3');
    expect(legacy.title).toBe('Legacy style task');
    expect(legacy.status).toBe('completed');
  });

  test('claim/update/unclaim preserve nested task indentation', async () => {
    await writeTasks('demo-spec', `# Implementation Plan\n\n## Tasks\n\n- [ ] 1. Top task\n  - [ ] 1.1 Nested task\n`);

    const claimed = await claimer.claimTask(tempRoot, 'demo-spec', '1.1', 'alice');
    expect(claimed.success).toBe(true);

    const updated = await claimer.updateTaskStatus(tempRoot, 'demo-spec', '1.1', 'completed');
    expect(updated.success).toBe(true);

    const released = await claimer.unclaimTask(tempRoot, 'demo-spec', '1.1', 'alice');
    expect(released.success).toBe(true);

    const tasksPath = path.join(tempRoot, '.sce', 'specs', 'demo-spec', 'tasks.md');
    const lines = (await fs.readFile(tasksPath, 'utf8')).split('\n');
    const nestedLine = lines.find((line) => line.includes('1.1 Nested task'));

    expect(nestedLine).toBe('  - [ ] 1.1 Nested task');
  });


  test('parseTasks supports marker-only status view when preferStatusMarkers is enabled', async () => {
    const tasksPath = await writeTasks('marker-spec', `# Implementation Plan

## Tasks

- [ ] 1 Legacy backlog item
- [x] 2 Legacy done item

## SCE Status Markers

- [x] 1 Marker completed item
- [x] 2 Marker completed item
`);

    const fullTasks = await claimer.parseTasks(tasksPath);
    const markerTasks = await claimer.parseTasks(tasksPath, { preferStatusMarkers: true });

    expect(fullTasks).toHaveLength(4);
    expect(markerTasks).toHaveLength(2);
    expect(markerTasks.every((task) => task.title.includes('Marker'))).toBe(true);
  });

  test('parseTasks falls back to full task list when marker section is absent', async () => {
    const tasksPath = await writeTasks('marker-fallback-spec', `# Implementation Plan

## Tasks

- [x] 1 Existing completed item
- [ ] 2 Existing pending item
`);

    const defaultTasks = await claimer.parseTasks(tasksPath);
    const preferredTasks = await claimer.parseTasks(tasksPath, { preferStatusMarkers: true });

    expect(preferredTasks).toHaveLength(defaultTasks.length);
    expect(preferredTasks.map((task) => task.taskId)).toEqual(defaultTasks.map((task) => task.taskId));
  });

});
