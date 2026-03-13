'use strict';

const path = require('path');

const {
  normalizeSceneScoreOptions,
  validateSceneScoreOptions,
  runSceneScoreCommand
} = require('../../../lib/commands/scene');
const {
  createScenePackageFixture
} = require('../utils/scene-package-fixture');

describe('Scene score command', () => {
  let originalLog;
  let originalError;
  let originalExitCode;

  beforeEach(() => {
    originalLog = console.log;
    originalError = console.error;
    originalExitCode = process.exitCode;
    console.log = jest.fn();
    console.error = jest.fn();
    delete process.exitCode;
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    process.exitCode = originalExitCode;
  });

  test('normalizeSceneScoreOptions trims values and validateSceneScoreOptions enforces threshold bounds', () => {
    expect(normalizeSceneScoreOptions({
      package: ' pkg ',
      json: true,
      threshold: 75
    })).toEqual({
      package: 'pkg',
      json: true,
      threshold: 75
    });

    expect(normalizeSceneScoreOptions()).toEqual({
      package: '.',
      json: false,
      threshold: 60
    });

    expect(validateSceneScoreOptions({ threshold: -1 })).toBe('threshold must be a number between 0 and 100');
    expect(validateSceneScoreOptions({ threshold: 101 })).toBe('threshold must be a number between 0 and 100');
    expect(validateSceneScoreOptions({ threshold: 60 })).toBeNull();
  });

  test('runSceneScoreCommand returns a passing score for a healthy package', async () => {
    const fixture = await createScenePackageFixture();

    try {
      const payload = await runSceneScoreCommand(
        { package: fixture.packageDir },
        { projectRoot: path.dirname(fixture.packageDir) }
      );

      expect(payload.success).toBe(true);
      expect(payload.scoreResult.score).toBe(110);
      expect(payload.scoreResult.pass).toBe(true);
      expect(process.exitCode).toBeUndefined();
    } finally {
      await fixture.cleanup();
    }
  });

  test('runSceneScoreCommand fails when the package score falls below the requested threshold', async () => {
    const fixture = await createScenePackageFixture({
      includeReadme: false,
      contractOverrides: {
        metadata: {
          description: ''
        },
        parameters: [
          {
            id: 'env',
            type: 'string',
            description: '',
            required: true
          }
        ],
        governance: {
          approval: null,
          idempotency: null
        },
        agent_hints: null
      }
    });

    try {
      const payload = await runSceneScoreCommand(
        { package: fixture.packageDir, threshold: 60 },
        { projectRoot: path.dirname(fixture.packageDir) }
      );

      expect(payload.success).toBe(false);
      expect(payload.scoreResult.score).toBe(58);
      expect(payload.scoreResult.pass).toBe(false);
      expect(process.exitCode).toBe(1);
    } finally {
      await fixture.cleanup();
    }
  });

  test('runSceneScoreCommand emits JSON payloads when requested', async () => {
    const logs = [];
    console.log = jest.fn((value) => logs.push(value));
    const fixture = await createScenePackageFixture();

    try {
      const payload = await runSceneScoreCommand(
        { package: fixture.packageDir, json: true, threshold: 70 },
        { projectRoot: path.dirname(fixture.packageDir) }
      );

      expect(JSON.parse(logs[0])).toEqual(payload);
    } finally {
      await fixture.cleanup();
    }
  });

  test('runSceneScoreCommand rejects invalid threshold options', async () => {
    const result = await runSceneScoreCommand({ threshold: 101 });

    expect(result).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalled();
  });
});
