const path = require('path');
const fc = require('fast-check');

const {
  SUPPORTED_PATTERNS,
  SCENE_API_VERSION,
  PACKAGE_API_VERSION,
  serializeManifestToYaml,
  parseYaml,
  groupRelatedEntities,
  analyzeResources,
  generateSceneManifest,
  generatePackageContract,
  derivePackageName,
  writeTemplateBundles,
  runExtraction
} = require('../../../lib/scene-runtime/moqui-extractor');

function normalizePath(targetPath) {
  return String(targetPath || '').split('\\').join('/');
}

const safeKeyArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,7}$/);
const safeStringArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9._/-]{0,10}$/);
const baseNameArb = fc.stringMatching(/^[A-Z][a-z]{2,8}$/);
const bundleDirArb = fc.stringMatching(/^[a-z][a-z0-9-]{1,16}$/);

const yamlObjectArb = fc.letrec((tie) => ({
  primitive: fc.oneof(
    safeStringArb,
    fc.integer({ min: -100, max: 100 }),
    fc.boolean()
  ),
  array: fc.array(fc.oneof(tie('primitive'), tie('object')), { maxLength: 3 }),
  object: fc.dictionary(safeKeyArb, fc.oneof(tie('primitive'), tie('array'), tie('object')), {
    maxKeys: 4
  })
})).object;

const groupedEntitiesCaseArb = fc.uniqueArray(baseNameArb, { minLength: 1, maxLength: 6 })
  .chain((bases) => fc.array(
    fc.constantFrom('single', 'header-item', 'header-detail', 'master-detail'),
    { minLength: bases.length, maxLength: bases.length }
  ).map((modes) => ({
    entities: bases.flatMap((base, index) => {
      switch (modes[index]) {
        case 'header-item':
          return [`${base}Header`, `${base}Item`];
        case 'header-detail':
          return [`${base}Header`, `${base}Detail`];
        case 'master-detail':
          return [`${base}Master`, `${base}Detail`];
        default:
          return [base];
      }
    }),
    pairs: bases.map((base, index) => ({ base, mode: modes[index] }))
  })));

const entityAnalysisCaseArb = fc.uniqueArray(baseNameArb, { minLength: 1, maxLength: 6 })
  .chain((bases) => fc.array(fc.boolean(), { minLength: bases.length, maxLength: bases.length })
    .map((serviceFlags) => ({
      entities: bases.map((base) => `${base}Header`),
      services: bases
        .filter((_, index) => serviceFlags[index])
        .map((base) => `${base}Service`)
    })));

function buildModelScope(primaryEntity, pattern) {
  const lower = primaryEntity.charAt(0).toLowerCase() + primaryEntity.slice(1);
  return {
    read: [`moqui.${primaryEntity}.${lower}Id`, `moqui.${primaryEntity}.statusId`],
    write: pattern === 'query' ? [] : [`moqui.${primaryEntity}.statusId`]
  };
}

const crudMatchArb = baseNameArb.map((base) => ({
  pattern: 'crud',
  primaryResource: base,
  entities: [`${base}Header`, `${base}Item`],
  services: [],
  bindingRefs: [],
  modelScope: buildModelScope(`${base}Header`, 'crud'),
  governance: {
    riskLevel: 'medium',
    approvalRequired: true,
    idempotencyRequired: true,
    idempotencyKey: `${base.charAt(0).toLowerCase() + base.slice(1)}Id`
  }
}));

const queryMatchArb = baseNameArb.map((base) => ({
  pattern: 'query',
  primaryResource: base,
  entities: [base],
  services: [],
  bindingRefs: [],
  modelScope: buildModelScope(base, 'query'),
  governance: {
    riskLevel: 'low',
    approvalRequired: false,
    idempotencyRequired: false
  }
}));

const workflowMatchArb = baseNameArb.chain((base) => fc.uniqueArray(
  fc.stringMatching(/^[A-Z][a-z]{2,8}(Flow|Workflow|Process)$/),
  { minLength: 1, maxLength: 4 }
).map((services) => ({
  pattern: 'workflow',
  primaryResource: base,
  entities: [`${base}Header`],
  services,
  bindingRefs: services.map((service) => `moqui.service.${service}.invoke`),
  modelScope: buildModelScope(`${base}Header`, 'workflow'),
  governance: {
    riskLevel: 'medium',
    approvalRequired: true,
    idempotencyRequired: true,
    idempotencyKey: `${base.charAt(0).toLowerCase() + base.slice(1)}Id`
  }
})));

const patternMatchArb = fc.oneof(crudMatchArb, queryMatchArb, workflowMatchArb);

const bundleArb = fc.uniqueArray(fc.record({
  bundleDir: bundleDirArb,
  manifestYaml: safeStringArb.map((value) => `${value}\n`),
  contractJson: fc.constant('{}')
}), {
  selector: (bundle) => bundle.bundleDir,
  maxLength: 5
});

const extractionResultArb = fc.record({
  success: fc.boolean(),
  templates: fc.array(fc.record({
    bundleDir: bundleDirArb,
    manifest: yamlObjectArb,
    contract: yamlObjectArb,
    manifestYaml: safeStringArb.map((value) => `${value}\n`),
    contractJson: fc.constant('{}')
  }), { maxLength: 3 }),
  summary: fc.record({
    totalTemplates: fc.integer({ min: 0, max: 3 }),
    patterns: fc.record({
      crud: fc.integer({ min: 0, max: 3 }),
      query: fc.integer({ min: 0, max: 3 }),
      workflow: fc.integer({ min: 0, max: 3 })
    }),
    outputDir: fc.stringMatching(/^[./A-Za-z0-9_-]{1,24}$/)
  }),
  warnings: fc.array(safeStringArb, { maxLength: 3 }),
  error: fc.option(fc.record({
    code: safeStringArb,
    message: safeStringArb
  }), { nil: null })
});

describe('Moqui extractor properties', () => {
  test('YAML serialization round-trips supported manifest objects', async () => {
    await fc.assert(
      fc.property(yamlObjectArb, (manifest) => {
        expect(parseYaml(serializeManifestToYaml(manifest))).toEqual(manifest);
      }),
      { numRuns: 100 }
    );
  });

  test('entity grouping preserves all entities exactly once', async () => {
    await fc.assert(
      fc.property(groupedEntitiesCaseArb, ({ entities, pairs }) => {
        const groups = groupRelatedEntities(entities);
        const flattened = groups.flatMap((group) => group.entities);

        expect(flattened.slice().sort()).toEqual(entities.slice().sort());
        expect(new Set(flattened).size).toBe(entities.length);

        for (const pair of pairs) {
          if (pair.mode === 'single') {
            continue;
          }

          const expectedEntities = pair.mode === 'header-item'
            ? [`${pair.base}Header`, `${pair.base}Item`]
            : pair.mode === 'header-detail'
              ? [`${pair.base}Header`, `${pair.base}Detail`]
              : [`${pair.base}Master`, `${pair.base}Detail`];

          expect(groups.some((group) => (
            group.base === pair.base
            && group.isComposite === true
            && group.entities.slice().sort().join('|') === expectedEntities.slice().sort().join('|')
          ))).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  test('pattern classification returns valid matches with non-empty entity subsets', async () => {
    await fc.assert(
      fc.property(entityAnalysisCaseArb, ({ entities, services }) => {
        const matches = analyzeResources({ entities, services, screens: [] });

        for (const match of matches) {
          expect(SUPPORTED_PATTERNS).toContain(match.pattern);
          expect(Array.isArray(match.entities)).toBe(true);
          expect(match.entities.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  test('pattern filtering restricts analyzeResources output to the requested pattern', async () => {
    await fc.assert(
      fc.property(entityAnalysisCaseArb, fc.constantFrom(...SUPPORTED_PATTERNS), ({ entities, services }, pattern) => {
        const unfiltered = analyzeResources({ entities, services, screens: [] });
        const filtered = analyzeResources({ entities, services, screens: [] }, { pattern });
        const unfilteredKeys = new Set(
          unfiltered.map((match) => `${match.pattern}:${match.primaryResource}:${(match.entities || []).join(',')}`)
        );

        for (const match of filtered) {
          const key = `${match.pattern}:${match.primaryResource}:${(match.entities || []).join(',')}`;
          expect(match.pattern).toBe(pattern);
          expect(unfilteredKeys.has(key)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  test('manifest generation produces the expected shape for each pattern', async () => {
    await fc.assert(
      fc.property(patternMatchArb, (match) => {
        const manifest = generateSceneManifest(match);
        const bindings = manifest.spec.capability_contract.bindings;

        expect(manifest.apiVersion).toBe(SCENE_API_VERSION);
        expect(manifest.kind).toBe('scene');
        expect(manifest.metadata.obj_id).toContain(derivePackageName(match));
        expect(bindings.length).toBe(
          match.pattern === 'crud' ? 5 : match.pattern === 'query' ? 2 : match.bindingRefs.length
        );
        expect(manifest.spec.governance_contract.approval.required).toBe(match.pattern !== 'query');
        if (match.pattern === 'query') {
          expect(manifest.spec.governance_contract.risk_level).toBe('low');
          expect(manifest.spec.governance_contract.idempotency).toBeUndefined();
        } else {
          expect(manifest.spec.governance_contract.risk_level).toBe('medium');
          expect(manifest.spec.governance_contract.idempotency).toEqual(expect.objectContaining({
            required: true,
            key: expect.any(String)
          }));
        }
      }),
      { numRuns: 100 }
    );
  });

  test('contract generation produces the expected metadata and governance', async () => {
    await fc.assert(
      fc.property(patternMatchArb, (match) => {
        const contract = generatePackageContract(match);

        expect(contract.apiVersion).toBe(PACKAGE_API_VERSION);
        expect(contract.kind).toBe('scene-template');
        expect(contract.metadata.name).toBe(derivePackageName(match));
        expect(contract.metadata.name).toMatch(/^[a-z0-9-]+$/);
        expect(contract.parameters.length).toBeGreaterThanOrEqual(2);
        expect(contract.artifacts.entry_scene).toBe('scene.yaml');
        expect(contract.artifacts.generates).toEqual(['scene.yaml', 'scene-package.json']);
        expect(contract.governance.approval.required).toBe(match.pattern !== 'query');
        expect(contract.governance.idempotency.required).toBe(match.pattern !== 'query');
        expect(Array.isArray(contract.ontology_model.entities)).toBe(true);
        expect(Array.isArray(contract.ontology_model.relations)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  test('ExtractionResult JSON round-trips through JSON.stringify and JSON.parse', async () => {
    await fc.assert(
      fc.property(extractionResultArb, (result) => {
        expect(JSON.parse(JSON.stringify(result))).toEqual(result);
      }),
      { numRuns: 100 }
    );
  });

  test('file writing creates scene.yaml and scene-package.json for every bundle', async () => {
    await fc.assert(
      fc.asyncProperty(bundleArb.filter((bundles) => bundles.length > 0), bundleDirArb.map((dir) => path.join('/tmp', dir)), async (bundles, outDir) => {
        const dirs = [];
        const files = {};
        const mockFs = {
          ensureDirSync: jest.fn((targetDir) => { dirs.push(targetDir); }),
          writeFileSync: jest.fn((targetPath, content) => { files[targetPath] = content; })
        };

        const results = await writeTemplateBundles(bundles, outDir, mockFs);

        expect(results).toHaveLength(bundles.length);
        expect(results.every((entry) => entry.success)).toBe(true);
        for (const bundle of bundles) {
          expect(Object.prototype.hasOwnProperty.call(files, path.join(outDir, bundle.bundleDir, 'scene.yaml')))
            .toBe(true);
          expect(Object.prototype.hasOwnProperty.call(files, path.join(outDir, bundle.bundleDir, 'scene-package.json')))
            .toBe(true);
        }
        expect(dirs.map(normalizePath)).toContain(normalizePath(outDir));
      }),
      { numRuns: 100 }
    );
  });

  test('dry-run extraction performs no file writes', async () => {
    const optionArb = fc.record({
      type: fc.option(fc.constantFrom('entities', 'services', 'screens'), { nil: undefined }),
      pattern: fc.option(fc.constantFrom(...SUPPORTED_PATTERNS), { nil: undefined })
    });

    await fc.assert(
      fc.asyncProperty(optionArb, async ({ type, pattern }) => {
        const writes = [];
        const client = {
          request: jest.fn(async (_method, reqPath) => {
            if (reqPath === '/api/v1/entities') {
              return { success: true, data: { entities: ['OrderHeader', 'Product'] } };
            }
            if (reqPath === '/api/v1/services') {
              return { success: true, data: { services: ['OrderService', 'ShipmentWorkflow'] } };
            }
            if (reqPath === '/api/v1/screens') {
              return { success: true, data: { screens: ['OrderScreen'] } };
            }
            return { success: true, data: {} };
          })
        };
        const mockFs = {
          ensureDirSync: jest.fn((targetPath) => writes.push(`dir:${targetPath}`)),
          writeFileSync: jest.fn((targetPath) => writes.push(`file:${targetPath}`))
        };

        const result = await runExtraction(
          { type, pattern, dryRun: true },
          { client, fileSystem: mockFs }
        );

        expect(result.success).toBe(true);
        expect(writes).toEqual([]);
      }),
      { numRuns: 100 }
    );
  });

  test('partial file write failures preserve successful bundles and record failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        bundleArb.filter((bundles) => bundles.length > 0),
        fc.uniqueArray(fc.integer({ min: 0, max: 4 }), { maxLength: 4 }),
        async (bundles, failingIndexes) => {
          const failSet = new Set(
            failingIndexes
              .filter((index) => index < bundles.length)
              .map((index) => bundles[index].bundleDir)
          );
          const files = {};
          const mockFs = {
            ensureDirSync: jest.fn(),
            writeFileSync: jest.fn((targetPath, content) => {
              const normalized = normalizePath(targetPath);
              if ([...failSet].some((bundleDir) => normalized.includes(`/${bundleDir}/scene.yaml`))) {
                throw new Error('EACCES');
              }
              files[targetPath] = content;
            })
          };

          const results = await writeTemplateBundles(bundles, '/tmp/out', mockFs);

          for (const bundle of bundles) {
            const result = results.find((entry) => entry.bundleDir === bundle.bundleDir);
            expect(result).toBeDefined();
            if (failSet.has(bundle.bundleDir)) {
              expect(result.success).toBe(false);
              expect(result.error).toContain('EACCES');
            } else {
              expect(result.success).toBe(true);
              expect(Object.prototype.hasOwnProperty.call(
                files,
                path.join('/tmp/out', bundle.bundleDir, 'scene-package.json')
              )).toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
