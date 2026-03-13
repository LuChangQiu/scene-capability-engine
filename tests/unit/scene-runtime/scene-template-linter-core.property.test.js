'use strict';

const fc = require('fast-check');

const {
  REQUIRED_MANIFEST_FIELDS,
  REQUIRED_PACKAGE_FIELDS,
  checkManifestCompleteness,
  checkSceneManifestCompleteness,
  checkBindingRefFormat,
  checkGovernanceReasonableness,
  checkPackageConsistency,
  checkTemplateVariables,
  checkDocumentation,
  calculateQualityScore
} = require('../../../lib/scene-runtime/scene-template-linter');
const {
  createScenePackageFixture,
  createValidContract,
  createValidManifest
} = require('../utils/scene-package-fixture');

const validRefArb = fc.constantFrom('moqui.Order.list', 'spec.erp.order.lookup', 'sce.scene.order.review');
const invalidRefArb = fc.constantFrom('legacy.order.lookup', 'custom.ref', 'bad-prefix.task');

describe('Scene template linter core properties', () => {
  test('lintScenePackage keeps summary counts and validity aligned with emitted items', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        async (includeReadme, includeDescription, includeSceneYaml) => {
          const fixture = await createScenePackageFixture({
            includeReadme,
            omitSceneYaml: !includeSceneYaml,
            contractOverrides: includeDescription
              ? {}
              : {
                  metadata: {
                    description: ''
                  }
                }
          });

          try {
            const result = await require('../../../lib/scene-runtime/scene-template-linter')
              .lintScenePackage(fixture.packageDir);

            expect(result.summary.error_count).toBe(result.errors.length);
            expect(result.summary.warning_count).toBe(result.warnings.length);
            expect(result.summary.info_count).toBe(result.info.length);
            expect(result.valid).toBe(result.errors.length === 0);
          } finally {
            await fixture.cleanup();
          }
        }
      ),
      { numRuns: 25 }
    );
  });

  test('missing required package and manifest fields produce exact issue counts', async () => {
    await fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...REQUIRED_PACKAGE_FIELDS), { maxLength: REQUIRED_PACKAGE_FIELDS.length }),
        fc.uniqueArray(fc.constantFrom(...REQUIRED_MANIFEST_FIELDS), { maxLength: REQUIRED_MANIFEST_FIELDS.length }),
        (presentPackageFields, presentManifestFields) => {
          const packageContract = {};
          for (const field of presentPackageFields) {
            packageContract[field] = createValidContract()[field];
          }

          const sceneManifest = {};
          for (const field of presentManifestFields) {
            sceneManifest[field] = createValidManifest()[field];
          }

          expect(checkManifestCompleteness(packageContract)).toHaveLength(
            REQUIRED_PACKAGE_FIELDS.length - presentPackageFields.length
          );
          expect(checkSceneManifestCompleteness(sceneManifest)).toHaveLength(
            REQUIRED_MANIFEST_FIELDS.length - presentManifestFields.length
          );
        }
      ),
      { numRuns: 50 }
    );
  });

  test('binding ref validation reports exactly the refs with unsupported prefixes', async () => {
    await fc.assert(
      fc.property(
        fc.array(fc.oneof(validRefArb, invalidRefArb), { maxLength: 12 }),
        (refs) => {
          const items = checkBindingRefFormat({
            capability_contract: {
              bindings: refs.map((ref) => ({ ref }))
            }
          });

          expect(items).toHaveLength(refs.filter((ref) => ref.startsWith('legacy.') || ref.startsWith('custom.') || ref.startsWith('bad-prefix.')).length);
        }
      ),
      { numRuns: 50 }
    );
  });

  test('governance reasonableness reports invalid states exactly', async () => {
    await fc.assert(
      fc.property(
        fc.constantFrom('low', 'medium', 'high', 'critical'),
        fc.boolean(),
        fc.boolean(),
        (riskLevel, hasApproval, hasIdempotency) => {
          const items = checkGovernanceReasonableness({
            risk_level: riskLevel,
            approval: hasApproval ? { required: true } : null,
            idempotency: hasIdempotency ? { required: false } : null
          });

          const expectedCodes = [];
          if (riskLevel === 'critical') {
            expectedCodes.push('INVALID_RISK_LEVEL');
          }
          if (!hasApproval) {
            expectedCodes.push('MISSING_APPROVAL');
          }
          if (!hasIdempotency) {
            expectedCodes.push('MISSING_IDEMPOTENCY');
          }

          expect(items.map((item) => item.code).sort()).toEqual(expectedCodes.sort());
        }
      ),
      { numRuns: 40 }
    );
  });

  test('package consistency follows name, version, and entry-scene invariants', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        async (validName, validVersion, entryExists) => {
          const items = await checkPackageConsistency(
            createValidContract({
              metadata: {
                name: validName ? 'valid-name' : 'Bad Name',
                version: validVersion ? '1.2.3' : 'bad-version'
              },
              artifacts: {
                entry_scene: 'scene.yaml'
              }
            }),
            '/virtual/package',
            {
              pathExists: jest.fn().mockResolvedValue(entryExists)
            }
          );

          const expectedCodes = [];
          if (!validName) {
            expectedCodes.push('NAME_NOT_KEBAB');
          }
          if (!validVersion) {
            expectedCodes.push('INVALID_VERSION');
          }
          if (!entryExists) {
            expectedCodes.push('ENTRY_SCENE_MISSING');
          }

          expect(items.map((item) => item.code).sort()).toEqual(expectedCodes.sort());
        }
      ),
      { numRuns: 40 }
    );
  });

  test('template variable checks emit missing-type and missing-description warnings exactly', async () => {
    await fc.assert(
      fc.property(
        fc.array(
          fc.record({
            hasType: fc.boolean(),
            hasDescription: fc.boolean()
          }),
          { maxLength: 10 }
        ),
        (variableSpecs) => {
          const items = checkTemplateVariables({
            parameters: variableSpecs.map((spec, index) => ({
              id: `param-${index}`,
              type: spec.hasType ? 'string' : '',
              description: spec.hasDescription ? 'described' : ''
            }))
          });

          const expectedCount = variableSpecs.reduce((count, spec) => (
            count + (spec.hasType ? 0 : 1) + (spec.hasDescription ? 0 : 1)
          ), 0);

          expect(items).toHaveLength(expectedCount);
        }
      ),
      { numRuns: 50 }
    );
  });

  test('documentation checks track README and metadata.description combinations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.boolean(),
        async (hasReadme, hasDescription) => {
          const result = await checkDocumentation(
            createValidContract({
              metadata: {
                description: hasDescription ? 'Documented' : ''
              }
            }),
            '/virtual/package',
            {
              pathExists: jest.fn().mockResolvedValue(hasReadme)
            }
          );

          const codes = result.items.map((item) => item.code).sort();
          const expectedCodes = [];
          if (hasReadme) {
            expectedCodes.push('HAS_README');
          }
          if (hasDescription) {
            expectedCodes.push('HAS_DESCRIPTION');
          }
          if (!hasReadme && !hasDescription) {
            expectedCodes.push('NO_DOCUMENTATION');
          }

          expect(codes).toEqual(expectedCodes.sort());
          expect(result.hasReadme).toBe(hasReadme);
        }
      ),
      { numRuns: 25 }
    );
  });

  test('quality score totals equal the sum of all dimensions and threshold decides pass/fail', async () => {
    await fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 0, max: 6 }),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: 0, max: 110 }),
        (
          errorCount,
          warningCount,
          hasReadme,
          hasDescription,
          hasVariableDescriptions,
          hasRiskLevel,
          hasApproval,
          hasIdempotency,
          hasRollback,
          threshold
        ) => {
          const lintResult = {
            errors: new Array(errorCount).fill({ level: 'error', code: 'ERR' }),
            warnings: hasVariableDescriptions
              ? new Array(warningCount).fill({ level: 'warning', code: 'WARN' })
              : [{ level: 'warning', code: 'VARIABLE_MISSING_DESC' }].concat(
                  new Array(Math.max(0, warningCount - 1)).fill({ level: 'warning', code: 'WARN' })
                ),
            _context: {
              contractErrors: [],
              manifestErrors: [],
              hasReadme,
              contract: {
                metadata: {
                  description: hasDescription ? 'Documented' : ''
                },
                governance: {
                  risk_level: hasRiskLevel ? 'low' : '',
                  approval: hasApproval ? { required: true } : null,
                  idempotency: hasIdempotency ? { required: false } : null,
                  rollback_supported: hasRollback
                }
              }
            }
          };

          const score = calculateQualityScore(lintResult, { threshold });
          const dimensionTotal = Object.values(score.dimensions)
            .reduce((sum, dimension) => sum + dimension.score, 0);

          expect(score.score).toBe(dimensionTotal);
          expect(score.pass).toBe(score.score >= threshold);
          expect(score.score).toBeGreaterThanOrEqual(0);
          expect(score.score).toBeLessThanOrEqual(110);
        }
      ),
      { numRuns: 100 }
    );
  });
});
