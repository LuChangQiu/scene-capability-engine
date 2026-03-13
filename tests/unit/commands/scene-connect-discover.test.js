'use strict';

function loadSceneCommandsWithMoquiMocks({
  configResult = {
    config: {
      baseUrl: 'http://localhost:8080',
      credentials: { username: 'demo', password: 'demo' }
    }
  },
  validationResult = { valid: true, errors: [] },
  loginResult = { success: true },
  requestImpl = async () => ({ success: true, data: [] }),
  disposeImpl = async () => undefined
} = {}) {
  jest.resetModules();

  const mockLoadAdapterConfig = jest.fn(() => configResult);
  const mockValidateAdapterConfig = jest.fn(() => validationResult);
  const instances = [];

  class MockMoquiClient {
    constructor(config) {
      this.config = config;
      this.login = jest.fn().mockImplementation(async () => loginResult);
      this.request = jest.fn().mockImplementation(requestImpl);
      this.dispose = jest.fn().mockImplementation(disposeImpl);
      instances.push(this);
    }
  }

  jest.doMock('../../../lib/scene-runtime/moqui-adapter', () => ({
    loadAdapterConfig: mockLoadAdapterConfig,
    validateAdapterConfig: mockValidateAdapterConfig
  }));
  jest.doMock('../../../lib/scene-runtime/moqui-client', () => MockMoquiClient);

  let scene;
  jest.isolateModules(() => {
    scene = require('../../../lib/commands/scene');
  });

  return {
    scene,
    instances,
    mockLoadAdapterConfig,
    mockValidateAdapterConfig
  };
}

describe('Scene connect/discover commands', () => {
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
    jest.resetModules();
    jest.unmock('../../../lib/scene-runtime/moqui-adapter');
    jest.unmock('../../../lib/scene-runtime/moqui-client');
  });

  test('connect helpers normalize defaults and connect successfully', async () => {
    const { scene, instances, mockLoadAdapterConfig } = loadSceneCommandsWithMoquiMocks();

    expect(scene.normalizeSceneConnectOptions({
      config: ' custom.json ',
      registry: ' custom-reg ',
      json: true
    })).toEqual({
      config: 'custom.json',
      registry: 'custom-reg',
      json: true
    });
    expect(scene.normalizeSceneConnectOptions()).toEqual({
      config: undefined,
      registry: '.sce/registry',
      json: false
    });
    expect(scene.validateSceneConnectOptions({})).toBeNull();

    const payload = await scene.runSceneConnectCommand(
      { config: 'moqui-adapter.json' },
      { projectRoot: '/workspace' }
    );

    expect(mockLoadAdapterConfig).toHaveBeenCalledWith('moqui-adapter.json', '/workspace');
    expect(payload).toEqual({
      success: true,
      baseUrl: 'http://localhost:8080',
      authStatus: 'authenticated'
    });
    expect(instances[0].login).toHaveBeenCalled();
    expect(instances[0].dispose).toHaveBeenCalled();
  });

  test('connect reports login failures and configuration failures', async () => {
    const authFailure = loadSceneCommandsWithMoquiMocks({
      loginResult: { success: false, error: 'bad credentials' }
    });

    const failedPayload = await authFailure.scene.runSceneConnectCommand(
      {},
      { projectRoot: '/workspace' }
    );

    expect(failedPayload).toEqual({
      success: false,
      baseUrl: 'http://localhost:8080',
      error: {
        code: 'AUTH_FAILED',
        message: 'bad credentials'
      }
    });

    const configFailure = loadSceneCommandsWithMoquiMocks({
      configResult: {
        config: null,
        error: 'CONFIG_NOT_FOUND: missing config'
      }
    });

    const configPayload = await configFailure.scene.runSceneConnectCommand(
      { config: 'missing.json', json: true },
      { projectRoot: '/workspace' }
    );

    expect(configPayload.success).toBe(false);
    expect(configPayload.error.code).toBe('CONNECT_FAILED');
    expect(configPayload.error.message).toContain('CONFIG_NOT_FOUND');
    expect(process.exitCode).toBe(1);
  });

  test('connect summary prints JSON payloads when requested', () => {
    const { scene } = loadSceneCommandsWithMoquiMocks();
    const logs = [];
    console.log = jest.fn((value) => logs.push(value));

    scene.printSceneConnectSummary(
      { json: true },
      { success: true, baseUrl: 'http://localhost:8080', authStatus: 'authenticated' }
    );

    expect(JSON.parse(logs[0])).toEqual({
      success: true,
      baseUrl: 'http://localhost:8080',
      authStatus: 'authenticated'
    });
  });

  test('discover helpers validate types and return typed catalogs and summary payloads', async () => {
    const requestImpl = jest
      .fn()
      .mockResolvedValueOnce({ success: true, data: { entities: [{ entityName: 'OrderHeader' }] } })
      .mockResolvedValueOnce({ success: true, data: { services: [{ name: 'place#Order' }] } })
      .mockResolvedValueOnce({ success: true, data: { screens: [{ name: 'OrderEntry' }] } })
      .mockResolvedValueOnce({ success: true, data: { entities: [{ entityName: 'OrderHeader' }, { entityName: 'Product' }] } })
      .mockResolvedValueOnce({ success: true, data: { services: [{ name: 'place#Order' }] } })
      .mockResolvedValueOnce({ success: true, data: { screens: [{ name: 'OrderEntry' }, { name: 'OrderList' }] } });

    const { scene, instances } = loadSceneCommandsWithMoquiMocks({ requestImpl });

    expect(scene.normalizeSceneDiscoverOptions({
      config: ' custom.json ',
      type: ' entities ',
      json: true
    })).toEqual({
      config: 'custom.json',
      type: 'entities',
      json: true
    });
    expect(scene.validateSceneDiscoverOptions({ type: 'widgets' })).toContain('invalid --type');
    expect(scene.validateSceneDiscoverOptions({ type: 'entities' })).toBeNull();

    const entitiesPayload = await scene.runSceneDiscoverCommand(
      { type: 'entities' },
      { projectRoot: '/workspace' }
    );
    const servicesPayload = await scene.runSceneDiscoverCommand(
      { type: 'services' },
      { projectRoot: '/workspace' }
    );
    const screensPayload = await scene.runSceneDiscoverCommand(
      { type: 'screens' },
      { projectRoot: '/workspace' }
    );
    const summaryPayload = await scene.runSceneDiscoverCommand(
      {},
      { projectRoot: '/workspace' }
    );

    expect(entitiesPayload).toEqual({
      success: true,
      type: 'entities',
      entities: [{ entityName: 'OrderHeader' }],
      count: 1
    });
    expect(servicesPayload).toEqual({
      success: true,
      type: 'services',
      services: [{ name: 'place#Order' }],
      count: 1
    });
    expect(screensPayload).toEqual({
      success: true,
      type: 'screens',
      screens: [{ name: 'OrderEntry' }],
      count: 1
    });
    expect(summaryPayload).toEqual({
      success: true,
      summary: {
        entities: { count: 2 },
        services: { count: 1 },
        screens: { count: 2 }
      }
    });
    expect(instances.every((instance) => instance.dispose.mock.calls.length === 1)).toBe(true);
  });

  test('discover reports auth and config failures and prints JSON payloads', async () => {
    const authFailure = loadSceneCommandsWithMoquiMocks({
      loginResult: { success: false, error: 'authentication failed' }
    });

    const authPayload = await authFailure.scene.runSceneDiscoverCommand(
      { type: 'entities' },
      { projectRoot: '/workspace' }
    );

    expect(authPayload).toEqual({
      success: false,
      error: {
        code: 'DISCOVER_FAILED',
        message: 'authentication failed'
      }
    });

    const logs = [];
    console.log = jest.fn((value) => logs.push(value));
    authFailure.scene.printSceneDiscoverSummary(
      { json: true },
      { success: true, type: 'entities', entities: ['OrderHeader'], count: 1 }
    );
    expect(JSON.parse(logs[0])).toEqual({
      success: true,
      type: 'entities',
      entities: ['OrderHeader'],
      count: 1
    });
  });
});
