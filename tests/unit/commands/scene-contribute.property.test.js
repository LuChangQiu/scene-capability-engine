'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const fc = require('fast-check');

const {
  normalizeSceneLintOptions,
  normalizeSceneScoreOptions,
  normalizeSceneContributeOptions,
  printSceneLintSummary,
  printSceneScoreSummary,
  printSceneContributeSummary,
  runSceneContributeCommand
} = require('../../../lib/commands/scene');
const {
  createScenePackageFixture
} = require('../utils/scene-package-fixture');

function tempRoot(prefix) {
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

describe('Scene contribute properties', () => {
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

  test('strict mode always turns warning-only packages into pipeline failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('docs', 'variable', 'governance'),
        async (warningSource) => {
          const contractOverrides = {};
          let includeReadme = true;

          if (warningSource === 'docs') {
            includeReadme = false;
            contractOverrides.metadata = { description: '' };
          } else if (warningSource === 'variable') {
            contractOverrides.parameters = [{ id: 'env', type: 'string', description: '', required: true }];
          } else {
            contractOverrides.governance = { approval: null };
          }

          const workspace = await createScenePackageFixture({
            rootDir: tempRoot('sce-contribute-prop'),
            packageDirName: 'pkg',
            includeReadme,
            contractOverrides
          });

          try {
            const payload = await runSceneContributeCommand(
              { package: 'pkg', registry: 'registry', strict: true, dryRun: true },
              { projectRoot: workspace.rootDir, fileSystem: fs }
            );

            expect(payload.success).toBe(false);
            expect(payload.stages.validation.passed).toBe(true);
            expect(payload.stages.lint.passed).toBe(false);
            expect(payload.stages.publish.completed).toBe(false);
          } finally {
            await workspace.cleanup();
          }
        }
      ),
      { numRuns: 24 }
    );
  });

  test('dry-run never publishes artifacts or registry metadata', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        async (strict, json, force) => {
          const workspace = await createScenePackageFixture({
            rootDir: tempRoot('sce-contribute-prop'),
            packageDirName: 'pkg'
          });

          try {
            const payload = await runSceneContributeCommand(
              { package: 'pkg', registry: 'registry', dryRun: true, strict, json, force },
              { projectRoot: workspace.rootDir, fileSystem: fs }
            );

            expect(payload.success).toBe(true);
            expect(payload.published).toBe(false);
            expect(payload.stages.publish.skipped).toBe(true);
            expect(await fs.pathExists(path.join(workspace.rootDir, 'registry'))).toBe(false);
          } finally {
            await workspace.cleanup();
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  test('skip-lint skips lint and score regardless of package lintability', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (json) => {
        const workspace = await createScenePackageFixture({
          rootDir: tempRoot('sce-contribute-prop'),
          packageDirName: 'pkg',
          contractOverrides: {
            metadata: {
              name: 'Bad Name'
            }
          }
        });

        try {
          const payload = await runSceneContributeCommand(
            { package: 'pkg', registry: 'registry', dryRun: true, skipLint: true, json },
            { projectRoot: workspace.rootDir, fileSystem: fs }
          );

          expect(payload.success).toBe(true);
          expect(payload.stages.lint.skipped).toBe(true);
          expect(payload.stages.score.skipped).toBe(true);
        } finally {
          await workspace.cleanup();
        }
      }),
      { numRuns: 20 }
    );
  });

  test('pipeline stops before publish on validation or lint failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('validation', 'lint'),
        async (failureStage) => {
          const workspace = await createScenePackageFixture({
            rootDir: tempRoot('sce-contribute-prop'),
            packageDirName: 'pkg',
            contractOverrides: failureStage === 'validation'
              ? { compatibility: null }
              : { metadata: { name: 'Bad Name' } }
          });

          try {
            const payload = await runSceneContributeCommand(
              { package: 'pkg', registry: 'registry', dryRun: true },
              { projectRoot: workspace.rootDir, fileSystem: fs }
            );

            expect(payload.success).toBe(false);
            expect(payload.published).toBe(false);
            expect(payload.stages.publish.completed).toBe(false);
            if (failureStage === 'validation') {
              expect(payload.stages.validation.passed).toBe(false);
              expect(payload.stages.lint.result).toBeNull();
            } else {
              expect(payload.stages.validation.passed).toBe(true);
              expect(payload.stages.lint.passed).toBe(false);
              expect(payload.stages.score.result).toBeNull();
            }
          } finally {
            await workspace.cleanup();
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  test('option normalizers preserve package paths, flags, and thresholds', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 12 }).filter((value) => value.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 12 }).filter((value) => value.trim().length > 0),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: 0, max: 100 }),
        (packageName, registryName, json, strict, dryRun, skipLint, force, threshold) => {
          const trimmedPackage = packageName.trim();
          const trimmedRegistry = registryName.trim();

          expect(normalizeSceneLintOptions({
            package: ` ${packageName} `,
            json,
            strict
          })).toEqual({
            package: trimmedPackage,
            json,
            strict
          });

          expect(normalizeSceneScoreOptions({
            package: ` ${packageName} `,
            json,
            threshold
          })).toEqual({
            package: trimmedPackage,
            json,
            threshold
          });

          expect(normalizeSceneContributeOptions({
            package: ` ${packageName} `,
            registry: ` ${registryName} `,
            json,
            strict,
            dryRun,
            skipLint,
            force
          })).toEqual({
            package: trimmedPackage,
            registry: trimmedRegistry,
            json,
            strict,
            dryRun,
            skipLint,
            force
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  test('json summary printers round-trip payloads without mutation', async () => {
    await fc.assert(
      fc.property(fc.jsonValue(), fc.jsonValue(), fc.jsonValue(), (lintPayload, scorePayload, contributePayload) => {
        const logs = [];
        console.log = jest.fn((value) => logs.push(value));

        printSceneLintSummary({ json: true }, lintPayload);
        printSceneScoreSummary({ json: true }, scorePayload);
        printSceneContributeSummary({ json: true }, contributePayload);

        expect(JSON.parse(logs[0])).toEqual(lintPayload);
        expect(JSON.parse(logs[1])).toEqual(scorePayload);
        expect(JSON.parse(logs[2])).toEqual(contributePayload);
      }),
      { numRuns: 100 }
    );
  });
});
