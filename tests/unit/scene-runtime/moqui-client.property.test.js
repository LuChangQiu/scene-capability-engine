'use strict';

const fc = require('fast-check');

const MoquiClient = require('../../../lib/scene-runtime/moqui-client');

describe('MoquiClient properties', () => {
  test('retryable network failures respect retryCount exactly', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 6 }), async (retryCount) => {
        const client = new MoquiClient({
          baseUrl: 'http://localhost:8080',
          credentials: { username: 'demo', password: 'demo' },
          retryCount,
          retryDelay: 0
        });
        const retryableError = Object.assign(new Error('socket reset'), { code: 'ECONNRESET' });

        client._httpRequest = jest.fn().mockRejectedValue(retryableError);

        const result = await client.request('GET', '/api/v1/entities/OrderHeader');

        expect(client._httpRequest).toHaveBeenCalledTimes(retryCount + 1);
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('NETWORK_ERROR');
      }),
      { numRuns: 100 }
    );
  });
});
