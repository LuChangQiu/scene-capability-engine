'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const BindingRegistry = require('../../../lib/scene-runtime/binding-registry');
const { createMoquiAdapterHandler } = require('../../../lib/scene-runtime/moqui-adapter');

describe('Moqui adapter handler execution', () => {
  test.each([
    ['moqui.OrderHeader.list', { pageIndex: 1, pageSize: 20 }, 'GET', '/api/v1/entities/OrderHeader'],
    ['moqui.OrderHeader.get', { id: '100' }, 'GET', '/api/v1/entities/OrderHeader/100'],
    ['moqui.OrderHeader.create', { data: { id: '100' } }, 'POST', '/api/v1/entities/OrderHeader'],
    ['moqui.OrderHeader.update', { id: '100', data: { statusId: 'APPROVED' } }, 'PUT', '/api/v1/entities/OrderHeader/100'],
    ['moqui.OrderHeader.delete', { id: '100' }, 'DELETE', '/api/v1/entities/OrderHeader/100'],
    ['moqui.service.PlaceOrder.invoke', { params: { orderId: '100' } }, 'POST', '/api/v1/services/PlaceOrder'],
    ['moqui.service.PlaceOrder.async', { params: { orderId: '100' } }, 'POST', '/api/v1/services/PlaceOrder'],
    ['moqui.service.PlaceOrder.job-status', { jobId: 'job-1' }, 'GET', '/api/v1/services/PlaceOrder/jobs/job-1'],
    ['moqui.screen.catalog', {}, 'GET', '/api/v1/screens'],
    ['moqui.screen.OrderEntry', {}, 'GET', '/api/v1/screens/OrderEntry'],
    ['spec.erp.order-query', { params: { orderId: '100' } }, 'POST', '/api/v1/services/order-query']
  ])('executes %s via the expected HTTP request', async (bindingRef, payload, method, expectedPath) => {
    const client = {
      request: jest.fn().mockResolvedValue({
        success: true,
        data: { ok: true },
        meta: { source: 'test' }
      }),
      login: jest.fn().mockResolvedValue({ success: true })
    };
    const handler = createMoquiAdapterHandler({ client, strictMatch: true });

    const result = await handler.execute({ binding_ref: bindingRef }, payload);

    expect(client.request).toHaveBeenCalledWith(method, expectedPath, expect.any(Object));
    expect(result).toEqual({
      status: 'success',
      handler_id: 'moqui.adapter',
      binding_ref: bindingRef,
      data: { ok: true },
      meta: { source: 'test' }
    });
  });

  test('readiness distinguishes ready, unreachable, and auth-failed cases', async () => {
    const readyHandler = createMoquiAdapterHandler({
      client: {
        login: jest.fn().mockResolvedValue({ success: true })
      },
      strictMatch: true
    });
    const unreachableHandler = createMoquiAdapterHandler({
      client: {
        login: jest.fn().mockResolvedValue({ success: false, error: 'Network error: ECONNREFUSED' })
      },
      strictMatch: true
    });
    const authFailedHandler = createMoquiAdapterHandler({
      client: {
        login: jest.fn().mockResolvedValue({ success: false, error: 'invalid credentials' })
      },
      strictMatch: true
    });

    await expect(readyHandler.readiness({ binding_ref: 'moqui.OrderHeader.list' })).resolves.toEqual({
      passed: true,
      reason: 'moqui-ready'
    });
    await expect(unreachableHandler.readiness({ binding_ref: 'moqui.OrderHeader.list' })).resolves.toEqual({
      passed: false,
      reason: 'moqui-unreachable'
    });
    await expect(authFailedHandler.readiness({ binding_ref: 'moqui.OrderHeader.list' })).resolves.toEqual({
      passed: false,
      reason: 'moqui-auth-failed'
    });
  });

  test('BindingRegistry resolves moqui and spec.erp refs to the moqui adapter when config is present', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-binding-registry-moqui-handler-'));

    try {
      await fs.writeJson(path.join(tempRoot, 'moqui-adapter.json'), {
        baseUrl: 'http://localhost:8080',
        credentials: { username: 'demo', password: 'demo' }
      }, { spaces: 2 });

      const registry = new BindingRegistry({ projectRoot: tempRoot });

      expect(registry.resolve({ binding_ref: 'moqui.OrderHeader.list' }).id).toBe('moqui.adapter');
      expect(registry.resolve({ binding_ref: 'spec.erp.order-query' }).id).toBe('moqui.adapter');
    } finally {
      await fs.remove(tempRoot);
    }
  });
});
