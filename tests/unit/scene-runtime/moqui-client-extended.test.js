'use strict';

const MoquiClient = require('../../../lib/scene-runtime/moqui-client');

describe('MoquiClient extended coverage', () => {
  test('login stores token pairs from top-level fields', async () => {
    const client = new MoquiClient({
      baseUrl: 'http://localhost:8080',
      credentials: { username: 'demo', password: 'demo' }
    });

    client._httpRequest = jest.fn().mockResolvedValue({
      statusCode: 200,
      headers: {},
      body: {
        accessToken: 'access-1',
        refreshToken: 'refresh-1'
      }
    });

    const result = await client.login();

    expect(result).toEqual({ success: true });
    expect(client.isAuthenticated()).toBe(true);
    expect(client.accessToken).toBe('access-1');
    expect(client.refreshTokenValue).toBe('refresh-1');
  });

  test('login stores token pairs from nested data fields and clears auth state on failure', async () => {
    const client = new MoquiClient({
      baseUrl: 'http://localhost:8080',
      credentials: { username: 'demo', password: 'demo' }
    });

    client._httpRequest = jest.fn()
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          data: {
            accessToken: 'nested-access',
            refreshToken: 'nested-refresh'
          }
        }
      })
      .mockResolvedValueOnce({
        statusCode: 401,
        headers: {},
        body: {
          error: {
            message: 'bad credentials'
          }
        }
      });

    expect(await client.login()).toEqual({ success: true });
    expect(client.isAuthenticated()).toBe(true);

    const failed = await client.login();

    expect(failed).toEqual({ success: false, error: 'bad credentials' });
    expect(client.isAuthenticated()).toBe(false);
    expect(client.accessToken).toBeNull();
    expect(client.refreshTokenValue).toBeNull();
  });

  test('request refreshes tokens on 401 and retries the original request', async () => {
    const client = new MoquiClient({
      baseUrl: 'http://localhost:8080',
      credentials: { username: 'demo', password: 'demo' }
    });
    client.accessToken = 'expired-token';
    client.refreshTokenValue = 'refresh-token';
    client.authenticated = true;

    client._httpRequest = jest.fn()
      .mockResolvedValueOnce({
        statusCode: 401,
        headers: {},
        body: { error: { message: 'expired' } }
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          accessToken: 'fresh-token',
          refreshToken: 'fresh-refresh'
        }
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          success: true,
          data: { id: 'order-1' }
        }
      });

    const result = await client.request('GET', '/api/v1/entities/OrderHeader/100');

    expect(result).toEqual({
      success: true,
      data: { id: 'order-1' }
    });
    expect(client.accessToken).toBe('fresh-token');
    expect(client.refreshTokenValue).toBe('fresh-refresh');
    expect(client._httpRequest).toHaveBeenNthCalledWith(
      3,
      'GET',
      'http://localhost:8080/api/v1/entities/OrderHeader/100',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fresh-token'
        })
      })
    );
  });

  test('request falls back to re-login when refresh fails', async () => {
    const client = new MoquiClient({
      baseUrl: 'http://localhost:8080',
      credentials: { username: 'demo', password: 'demo' }
    });
    client.accessToken = 'expired-token';
    client.refreshTokenValue = 'refresh-token';
    client.authenticated = true;

    client._httpRequest = jest.fn()
      .mockResolvedValueOnce({
        statusCode: 401,
        headers: {},
        body: {}
      })
      .mockResolvedValueOnce({
        statusCode: 401,
        headers: {},
        body: {}
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          accessToken: 'relogin-token',
          refreshToken: 'relogin-refresh'
        }
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: {
          success: true,
          data: { ok: true }
        }
      });

    const result = await client.request('POST', '/api/v1/services/PlaceOrder', {
      body: { orderId: '100' }
    });

    expect(result).toEqual({
      success: true,
      data: { ok: true }
    });
    expect(client.accessToken).toBe('relogin-token');
  });

  test('request retries retryable 5xx responses until success', async () => {
    const client = new MoquiClient({
      baseUrl: 'http://localhost:8080',
      credentials: { username: 'demo', password: 'demo' },
      retryCount: 2,
      retryDelay: 0
    });

    client._httpRequest = jest.fn()
      .mockResolvedValueOnce({
        statusCode: 503,
        headers: {},
        body: { error: { message: 'unavailable' } }
      })
      .mockResolvedValueOnce({
        statusCode: 502,
        headers: {},
        body: { error: { message: 'bad gateway' } }
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: { success: true, data: { ok: true } }
      });

    const result = await client.request('GET', '/api/v1/entities/OrderHeader');

    expect(client._httpRequest).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      success: true,
      data: { ok: true }
    });
  });

  test('request returns timeout errors without retrying indefinitely', async () => {
    const client = new MoquiClient({
      baseUrl: 'http://localhost:8080',
      credentials: { username: 'demo', password: 'demo' },
      timeout: 1234
    });
    const timeoutError = Object.assign(new Error('Request timed out after 1234ms'), { code: 'TIMEOUT' });

    client._httpRequest = jest.fn().mockRejectedValue(timeoutError);

    const result = await client.request('GET', '/api/v1/entities/OrderHeader');

    expect(result).toEqual({
      success: false,
      error: {
        code: 'TIMEOUT',
        message: 'Request timed out after 1234ms'
      }
    });
    expect(client._httpRequest).toHaveBeenCalledTimes(1);
  });

  test('dispose triggers logout and clears tokens', async () => {
    const client = new MoquiClient({
      baseUrl: 'http://localhost:8080',
      credentials: { username: 'demo', password: 'demo' }
    });
    client.accessToken = 'active-token';
    client.refreshTokenValue = 'refresh-token';
    client.authenticated = true;
    client._httpRequest = jest.fn().mockResolvedValue({
      statusCode: 200,
      headers: {},
      body: { success: true }
    });

    await client.dispose();

    expect(client._httpRequest).toHaveBeenCalledWith(
      'POST',
      'http://localhost:8080/api/v1/auth/logout',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer active-token'
        })
      })
    );
    expect(client.isAuthenticated()).toBe(false);
    expect(client.accessToken).toBeNull();
    expect(client.refreshTokenValue).toBeNull();
  });
});
