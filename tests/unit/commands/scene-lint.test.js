'use strict';

const path = require('path');

const {
  normalizeSceneLintOptions,
  runSceneLintCommand
} = require('../../../lib/commands/scene');
const {
  createScenePackageFixture
} = require('../utils/scene-package-fixture');

describe('Scene lint command', () => {
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

  test('normalizeSceneLintOptions trims input and applies defaults', () => {
    expect(normalizeSceneLintOptions({
      package: ' pkg ',
      json: true,
      strict: true
    })).toEqual({
      package: 'pkg',
      json: true,
      strict: true
    });

    expect(normalizeSceneLintOptions()).toEqual({
      package: '.',
      json: false,
      strict: false
    });
  });

  test('runSceneLintCommand succeeds for a valid package and resolves default package path', async () => {
    const fixture = await createScenePackageFixture();

    try {
      const payload = await runSceneLintCommand(
        {},
        { projectRoot: fixture.packageDir }
      );

      expect(payload.success).toBe(true);
      expect(payload.strict).toBe(false);
      expect(payload.packageDir.replace(/\\/g, '/')).toBe(fixture.packageDir.replace(/\\/g, '/'));
      expect(payload.lintResult.valid).toBe(true);
      expect(process.exitCode).toBeUndefined();
    } finally {
      await fixture.cleanup();
    }
  });

  test('runSceneLintCommand strict mode promotes warnings to failure', async () => {
    const fixture = await createScenePackageFixture({
      includeReadme: false,
      contractOverrides: {
        metadata: {
          description: ''
        }
      }
    });

    try {
      const payload = await runSceneLintCommand(
        { strict: true, package: fixture.packageDir },
        { projectRoot: path.dirname(fixture.packageDir) }
      );

      expect(payload.success).toBe(false);
      expect(payload.lintResult.valid).toBe(true);
      expect(payload.lintResult.warnings.map((item) => item.code)).toContain('NO_DOCUMENTATION');
      expect(process.exitCode).toBe(1);
    } finally {
      await fixture.cleanup();
    }
  });

  test('runSceneLintCommand emits JSON payloads when requested', async () => {
    const logs = [];
    console.log = jest.fn((value) => logs.push(value));
    const fixture = await createScenePackageFixture();

    try {
      const payload = await runSceneLintCommand(
        { package: fixture.packageDir, json: true },
        { projectRoot: path.dirname(fixture.packageDir) }
      );

      expect(JSON.parse(logs[0])).toEqual(payload);
    } finally {
      await fixture.cleanup();
    }
  });

  test('runSceneLintCommand returns a failed payload for missing package content', async () => {
    const fixture = await createScenePackageFixture({ omitScenePackage: true });

    try {
      const payload = await runSceneLintCommand(
        { package: fixture.packageDir, json: true },
        { projectRoot: path.dirname(fixture.packageDir) }
      );

      expect(payload.success).toBe(false);
      expect(payload.lintResult.errors[0].code).toBe('MANIFEST_READ_FAILED');
      expect(process.exitCode).toBe(1);
    } finally {
      await fixture.cleanup();
    }
  });
});
