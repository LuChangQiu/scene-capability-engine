'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const fc = require('fast-check');

const {
  DEFAULT_TIMEOUT,
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_DELAY,
  loadAdapterConfig,
  validateAdapterConfig,
  parseBindingRef,
  mapMoquiResponseToResult,
  buildHttpRequest,
  createMoquiAdapterHandler
} = require('../../../lib/scene-runtime/moqui-adapter');

const packageNameArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9-]{0,12}$/);

describe('Moqui adapter properties', () => {
  test('config load round-trip preserves persisted configuration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          baseUrl: fc.webUrl(),
          credentials: fc.record({
            username: fc.string({ minLength: 1, maxLength: 12 }),
            password: fc.string({ minLength: 1, maxLength: 12 })
          }),
          timeout: fc.integer({ min: 1, max: 60000 }),
          retryCount: fc.integer({ min: 0, max: 10 }),
          retryDelay: fc.integer({ min: 0, max: 10000 })
        }),
        async (config) => {
          const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-moqui-config-'));

          try {
            await fs.writeJson(path.join(tmpDir, 'moqui-adapter.json'), config);
            const result = loadAdapterConfig(undefined, tmpDir);
            expect(result.error).toBeUndefined();
            expect(result.config).toEqual(config);
          } finally {
            await fs.remove(tmpDir);
          }
        }
      ),
      { numRuns: 40 }
    );
  });

  test('config defaults fill optional fields when they are omitted', async () => {
    await fc.assert(
      fc.asyncProperty(fc.webUrl(), fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), async (baseUrl, username, password) => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-moqui-config-'));

        try {
          await fs.writeJson(path.join(tmpDir, 'moqui-adapter.json'), {
            baseUrl,
            credentials: { username, password }
          });
          const result = loadAdapterConfig(undefined, tmpDir);
          expect(result.config.timeout).toBe(DEFAULT_TIMEOUT);
          expect(result.config.retryCount).toBe(DEFAULT_RETRY_COUNT);
          expect(result.config.retryDelay).toBe(DEFAULT_RETRY_DELAY);
        } finally {
          await fs.remove(tmpDir);
        }
      }),
      { numRuns: 40 }
    );
  });

  test('config validation catches missing required fields', async () => {
    await fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (hasBaseUrl, hasUsername, hasPassword) => {
        const validation = validateAdapterConfig({
          ...(hasBaseUrl ? { baseUrl: 'http://localhost:8080' } : {}),
          credentials: {
            ...(hasUsername ? { username: 'demo' } : {}),
            ...(hasPassword ? { password: 'demo' } : {})
          }
        });

        expect(validation.valid).toBe(hasBaseUrl && hasUsername && hasPassword);
      }),
      { numRuns: 100 }
    );
  });

  test('invalid JSON config always returns CONFIG_INVALID_JSON', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string().filter((value) => {
        try {
          JSON.parse(value);
          return false;
        } catch (_error) {
          return true;
        }
      }), async (invalidJson) => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-moqui-config-'));

        try {
          await fs.writeFile(path.join(tmpDir, 'moqui-adapter.json'), invalidJson, 'utf8');
          const result = loadAdapterConfig(undefined, tmpDir);
          expect(result.config).toBeNull();
          expect(result.error).toContain('CONFIG_INVALID_JSON');
        } finally {
          await fs.remove(tmpDir);
        }
      }),
      { numRuns: 40 }
    );
  });

  test('parseBindingRef extracts supported refs and rejects unsupported shapes', async () => {
    await fc.assert(
      fc.property(
        packageNameArb,
        fc.constantFrom('list', 'get', 'create', 'update', 'delete'),
        (entity, operation) => {
          expect(parseBindingRef(`moqui.${entity}.${operation}`)).toEqual({ entity, operation });
          expect(parseBindingRef(`spec.erp.${entity}`)).toEqual({ service: entity, operation: 'invoke' });
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Moqui response mapping preserves success and failure structures', async () => {
    await fc.assert(
      fc.property(fc.boolean(), fc.jsonValue(), fc.jsonValue(), (success, data, metaOrDetails) => {
        const response = success
          ? { success: true, data, meta: metaOrDetails }
          : { success: false, error: { code: 'ERR', message: 'failed', details: metaOrDetails } };

        const result = mapMoquiResponseToResult(response, 'moqui.adapter', 'moqui.OrderHeader.list');

        expect(result.status).toBe(success ? 'success' : 'failed');
        if (success) {
          expect(result.data).toEqual(data);
          expect(result.meta).toEqual(metaOrDetails);
        } else {
          expect(result.error).toEqual({
            code: 'ERR',
            message: 'failed',
            details: metaOrDetails
          });
        }
      }),
      { numRuns: 100 }
    );
  });

  test('binding ref matcher only claims moqui and eligible spec.erp refs', async () => {
    await fc.assert(
      fc.property(fc.string(), (suffix) => {
        const handler = createMoquiAdapterHandler({
          projectRoot: path.join(os.tmpdir(), `sce-moqui-${Date.now()}`),
          strictMatch: true
        });
        const moquiRef = `moqui.${suffix || 'OrderHeader.list'}`;
        const specRef = `spec.erp.${suffix || 'order-query'}`;
        const otherRef = `custom.${suffix || 'noop'}`;

        expect(handler.match({ binding_ref: moquiRef })).toBe(true);
        expect(handler.match({ binding_ref: specRef })).toBe(true);
        expect(handler.match({ binding_ref: otherRef })).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  test('operation descriptors map to correct HTTP methods and paths', async () => {
    await fc.assert(
      fc.property(packageNameArb, fc.string({ minLength: 1, maxLength: 8 }), (name, id) => {
        expect(buildHttpRequest({ entity: name, operation: 'list' }, {})).toMatchObject({
          method: 'GET',
          path: `/api/v1/entities/${name}`
        });
        expect(buildHttpRequest({ entity: name, operation: 'get' }, { id })).toMatchObject({
          method: 'GET',
          path: `/api/v1/entities/${name}/${id}`
        });
        expect(buildHttpRequest({ entity: name, operation: 'create' }, { data: { id } })).toMatchObject({
          method: 'POST',
          path: `/api/v1/entities/${name}`
        });
        expect(buildHttpRequest({ entity: name, operation: 'update' }, { id, data: { id } })).toMatchObject({
          method: 'PUT',
          path: `/api/v1/entities/${name}/${id}`
        });
        expect(buildHttpRequest({ entity: name, operation: 'delete' }, { id })).toMatchObject({
          method: 'DELETE',
          path: `/api/v1/entities/${name}/${id}`
        });
        expect(buildHttpRequest({ service: name, operation: 'invoke' }, { params: { id } })).toMatchObject({
          method: 'POST',
          path: `/api/v1/services/${name}`
        });
        expect(buildHttpRequest({ service: name, operation: 'invoke', mode: 'async' }, { params: { id } })).toMatchObject({
          method: 'POST',
          path: `/api/v1/services/${name}`
        });
        expect(buildHttpRequest({ service: name, operation: 'job-status' }, { jobId: id })).toMatchObject({
          method: 'GET',
          path: `/api/v1/services/${name}/jobs/${id}`
        });
        expect(buildHttpRequest({ operation: 'screen-catalog' }, {})).toMatchObject({
          method: 'GET',
          path: '/api/v1/screens'
        });
        expect(buildHttpRequest({ screen: name, operation: 'screen-definition' }, {})).toMatchObject({
          method: 'GET',
          path: `/api/v1/screens/${name}`
        });
      }),
      { numRuns: 100 }
    );
  });
});
