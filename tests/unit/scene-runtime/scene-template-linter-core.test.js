'use strict';

const path = require('path');

const {
  REQUIRED_MANIFEST_FIELDS,
  REQUIRED_PACKAGE_FIELDS,
  createLintItem,
  checkManifestCompleteness,
  checkSceneManifestCompleteness,
  checkBindingRefFormat,
  checkGovernanceReasonableness,
  checkPackageConsistency,
  checkTemplateVariables,
  checkDocumentation,
  lintScenePackage,
  scoreContractValidity,
  scoreLintPassRate,
  scoreDocumentationQuality,
  scoreGovernanceCompleteness,
  calculateQualityScore
} = require('../../../lib/scene-runtime/scene-template-linter');
const {
  createScenePackageFixture,
  createValidContract,
  createValidManifest
} = require('../utils/scene-package-fixture');

describe('Scene template linter core helpers', () => {
  test('createLintItem returns the canonical lint structure', () => {
    expect(createLintItem('warning', 'TEST_CODE', 'hello')).toEqual({
      level: 'warning',
      code: 'TEST_CODE',
      message: 'hello'
    });
  });

  test('checkManifestCompleteness reports one error per missing package field', () => {
    const contract = {
      apiVersion: 'sce.scene.package/v0.1',
      metadata: {},
      governance: {}
    };

    const items = checkManifestCompleteness(contract);

    expect(items.map((item) => item.code)).toEqual([
      'MISSING_PACKAGE_FIELD',
      'MISSING_PACKAGE_FIELD',
      'MISSING_PACKAGE_FIELD'
    ]);
    expect(items.map((item) => item.message)).toEqual([
      'scene-package.json is missing required field: kind',
      'scene-package.json is missing required field: capabilities',
      'scene-package.json is missing required field: artifacts'
    ]);
  });

  test('checkSceneManifestCompleteness reports one warning per missing scene field', () => {
    const manifest = {
      apiVersion: 'sce.scene.manifest/v0.1'
    };

    const items = checkSceneManifestCompleteness(manifest);

    expect(items).toHaveLength(REQUIRED_MANIFEST_FIELDS.length - 1);
    expect(items.every((item) => item.level === 'warning')).toBe(true);
  });

  test('checkBindingRefFormat inspects contract and manifest binding refs', () => {
    const contractItems = checkBindingRefFormat({
      capability_contract: {
        bindings: [
          { ref: 'moqui.Order.list' },
          { ref: 'custom.Order.list' }
        ]
      }
    });
    const manifestItems = checkBindingRefFormat({
      spec: {
        capability_contract: {
          bindings: {
            one: { ref: 'sce.scene.order.lookup' },
            two: { ref: 'legacy.lookup' }
          }
        }
      }
    });

    expect(contractItems).toHaveLength(1);
    expect(contractItems[0].code).toBe('INVALID_BINDING_REF');
    expect(manifestItems).toHaveLength(1);
    expect(manifestItems[0].message).toContain('legacy.lookup');
  });

  test('checkGovernanceReasonableness flags invalid risk levels and missing booleans', () => {
    const items = checkGovernanceReasonableness({
      risk_level: 'critical',
      approval: {},
      idempotency: null
    });

    expect(items.map((item) => item.code).sort()).toEqual([
      'INVALID_RISK_LEVEL',
      'MISSING_APPROVAL',
      'MISSING_IDEMPOTENCY'
    ]);
  });

  test('checkPackageConsistency validates name, version, and entry scene existence', async () => {
    const fixture = await createScenePackageFixture();

    try {
      const badItems = await checkPackageConsistency(
        createValidContract({
          metadata: {
            name: 'Bad Name',
            version: 'not-semver'
          },
          artifacts: {
            entry_scene: 'missing.yaml'
          }
        }),
        fixture.packageDir
      );

      expect(badItems.map((item) => item.code).sort()).toEqual([
        'ENTRY_SCENE_MISSING',
        'INVALID_VERSION',
        'NAME_NOT_KEBAB'
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  test('checkTemplateVariables validates top-level and nested variable collections', () => {
    const topLevel = checkTemplateVariables({
      parameters: [
        { name: 'env', type: '', description: 'runtime' },
        { name: 'tenant', type: 'string', description: '' }
      ]
    });
    const nested = checkTemplateVariables({
      spec: {
        variables: [
          { key: 'mode', type: '', description: '' }
        ]
      }
    });

    expect(topLevel.map((item) => item.code).sort()).toEqual([
      'VARIABLE_MISSING_DESC',
      'VARIABLE_MISSING_TYPE'
    ]);
    expect(nested.map((item) => item.code).sort()).toEqual([
      'VARIABLE_MISSING_DESC',
      'VARIABLE_MISSING_TYPE'
    ]);
  });

  test('checkDocumentation recognizes readme, description, and missing docs', async () => {
    const fixture = await createScenePackageFixture({ includeReadme: false });

    try {
      const withDescription = await checkDocumentation(
        createValidContract(),
        fixture.packageDir
      );
      const withoutDocs = await checkDocumentation(
        createValidContract({
          metadata: {
            description: ''
          }
        }),
        fixture.packageDir
      );

      expect(withDescription.items.map((item) => item.code)).toEqual(['HAS_DESCRIPTION']);
      expect(withDescription.hasReadme).toBe(false);
      expect(withoutDocs.items.map((item) => item.code)).toEqual(['NO_DOCUMENTATION']);
    } finally {
      await fixture.cleanup();
    }
  });

  test('lintScenePackage returns a clean valid result for a healthy package', async () => {
    const fixture = await createScenePackageFixture();

    try {
      const result = await lintScenePackage(fixture.packageDir);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.info.map((item) => item.code).sort()).toEqual([
        'HAS_DESCRIPTION',
        'HAS_README'
      ]);
      expect(result.summary).toEqual({
        error_count: 0,
        warning_count: 0,
        info_count: 2,
        checks_run: 10
      });
      expect(result._context.contract.metadata.name).toBe('demo-scene');
      expect(result._context.manifest.metadata.name).toBe('demo-scene');
    } finally {
      await fixture.cleanup();
    }
  });

  test('lintScenePackage surfaces scene-package read failures as hard errors', async () => {
    const fixture = await createScenePackageFixture({ omitScenePackage: true });

    try {
      const result = await lintScenePackage(fixture.packageDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MANIFEST_READ_FAILED');
      expect(result.summary.error_count).toBe(1);
    } finally {
      await fixture.cleanup();
    }
  });

  test('lintScenePackage degrades missing scene.yaml to a warning', async () => {
    const fixture = await createScenePackageFixture({ omitSceneYaml: true });

    try {
      const result = await lintScenePackage(fixture.packageDir);

      expect(result.valid).toBe(false);
      expect(result.warnings.map((item) => item.code)).toContain('SCENE_YAML_READ_FAILED');
      expect(result.errors.map((item) => item.code)).toContain('ENTRY_SCENE_MISSING');
      expect(result._context.manifest).toBeNull();
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('Scene template scoring helpers', () => {
  test('scoreContractValidity awards 15 points for package and manifest completeness independently', () => {
    expect(
      scoreContractValidity({
        _context: {
          contractErrors: [],
          manifestErrors: []
        }
      })
    ).toEqual({
      score: 30,
      details: {
        package_contract: 15,
        scene_manifest: 15
      }
    });

    expect(
      scoreContractValidity({
        _context: {
          contractErrors: [createLintItem('error', 'X', 'x')],
          manifestErrors: []
        }
      }).score
    ).toBe(15);
  });

  test('scoreLintPassRate follows the documented deduction formula', () => {
    expect(
      scoreLintPassRate({
        errors: [1, 2],
        warnings: [1, 2, 3]
      })
    ).toEqual({
      score: 1,
      details: {
        error_deductions: 20,
        warning_deductions: 9
      }
    });

    expect(
      scoreLintPassRate({
        errors: [1, 2, 3, 4],
        warnings: [1]
      }).score
    ).toBe(0);
  });

  test('scoreDocumentationQuality awards readme, description, and variable-description points', () => {
    const full = scoreDocumentationQuality({
      warnings: [],
      _context: {
        hasReadme: true,
        contract: createValidContract()
      }
    });
    const missingVariableDescriptions = scoreDocumentationQuality({
      warnings: [createLintItem('warning', 'VARIABLE_MISSING_DESC', 'missing')],
      _context: {
        hasReadme: false,
        contract: createValidContract({
          metadata: {
            description: ''
          }
        })
      }
    });

    expect(full.score).toBe(20);
    expect(full.details).toEqual({
      readme_present: 10,
      description_present: 5,
      variable_descriptions: 5
    });
    expect(missingVariableDescriptions.score).toBe(0);
  });

  test('scoreGovernanceCompleteness awards each governance field separately', () => {
    const full = scoreGovernanceCompleteness({
      _context: {
        contract: createValidContract()
      }
    });
    const partial = scoreGovernanceCompleteness({
      _context: {
        contract: createValidContract({
          governance: {
            risk_level: 'low',
            approval: null,
            idempotency: null,
            rollback_supported: false
          }
        })
      }
    });

    expect(full.score).toBe(20);
    expect(partial.details).toEqual({
      risk_level: 5,
      approval: 0,
      idempotency: 0,
      rollback: 5
    });
  });

  test('calculateQualityScore returns 100 for a perfect package and honors custom thresholds', async () => {
    const fixture = await createScenePackageFixture();

    try {
      const lintResult = await lintScenePackage(fixture.packageDir);
      const pass = calculateQualityScore(lintResult);
      const fail = calculateQualityScore(lintResult, { threshold: 101 });

      expect(pass.score).toBe(110);
      expect(pass.pass).toBe(true);
      expect(pass.dimensions.contract_validity.score).toBe(30);
      expect(pass.dimensions.lint_pass_rate.score).toBe(30);
      expect(pass.dimensions.documentation_quality.score).toBe(20);
      expect(pass.dimensions.governance_completeness.score).toBe(20);
      expect(pass.dimensions.agent_readiness.score).toBe(10);
      expect(fail.pass).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  test('calculateQualityScore can fail a warning-heavy package against threshold 60', async () => {
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
      const lintResult = await lintScenePackage(fixture.packageDir);
      const score = calculateQualityScore(lintResult, { threshold: 60 });

      expect(score.score).toBe(58);
      expect(score.pass).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });
});
