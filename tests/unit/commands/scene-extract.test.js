const {
  normalizeSceneExtractOptions,
  validateSceneExtractOptions,
  printSceneExtractSummary,
  runSceneExtractCommand
} = require('../../../lib/commands/scene');

function createMockClient() {
  return {
    request: jest.fn(async (_method, reqPath) => {
      if (reqPath === '/api/v1/entities') {
        return { success: true, data: { entities: ['OrderHeader', 'Product'] } };
      }
      if (reqPath === '/api/v1/services') {
        return { success: true, data: { services: ['OrderService', 'ShipmentWorkflow'] } };
      }
      if (reqPath === '/api/v1/screens') {
        return { success: true, data: { screens: [] } };
      }
      return { success: true, data: {} };
    }),
    dispose: jest.fn(async () => {})
  };
}

describe('Scene extract command helpers', () => {
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

  test('normalizeSceneExtractOptions trims values and applies defaults', () => {
    expect(normalizeSceneExtractOptions({
      config: ' moqui.json ',
      type: ' entities ',
      pattern: ' crud ',
      out: ' custom/out ',
      dryRun: true,
      json: true
    })).toEqual({
      config: 'moqui.json',
      type: 'entities',
      pattern: 'crud',
      out: 'custom/out',
      dryRun: true,
      json: true
    });

    expect(normalizeSceneExtractOptions({})).toEqual({
      config: undefined,
      type: undefined,
      pattern: undefined,
      out: '.sce/templates/extracted',
      dryRun: false,
      json: false
    });
  });

  test('validateSceneExtractOptions rejects unsupported type and pattern values', () => {
    expect(validateSceneExtractOptions({ type: 'bad' })).toContain('invalid --type');
    expect(validateSceneExtractOptions({ pattern: 'bad' })).toContain('invalid --pattern');
    expect(validateSceneExtractOptions({ type: 'entities', pattern: 'crud' })).toBeNull();
  });

  test('printSceneExtractSummary prints JSON payloads unchanged', () => {
    const logs = [];
    console.log = jest.fn((value) => logs.push(value));
    const payload = {
      success: true,
      templates: [],
      summary: { totalTemplates: 1, patterns: { crud: 1, query: 0, workflow: 0 }, outputDir: '/out' },
      warnings: []
    };

    printSceneExtractSummary({ json: true }, payload);

    expect(JSON.parse(logs[0])).toEqual(payload);
  });

  test('printSceneExtractSummary renders warnings in human-readable mode', () => {
    const logs = [];
    console.log = jest.fn((...args) => logs.push(args.join(' ')));

    printSceneExtractSummary(
      { json: false, dryRun: false },
      {
        success: true,
        templates: [],
        summary: { totalTemplates: 2, patterns: { crud: 1, query: 1, workflow: 0 }, outputDir: '/out' },
        warnings: ['services: unavailable']
      }
    );

    expect(logs.some((line) => line.includes('Extracted 2 template(s)'))).toBe(true);
    expect(logs.some((line) => line.includes('Warnings: 1'))).toBe(true);
  });

  test('runSceneExtractCommand returns a successful dry-run payload with an injected client', async () => {
    const logs = [];
    console.log = jest.fn((...args) => logs.push(args.join(' ')));

    const result = await runSceneExtractCommand(
      { dryRun: true, pattern: 'crud' },
      { client: createMockClient() }
    );

    expect(result).not.toBeNull();
    expect(result.success).toBe(true);
    expect(result.summary.totalTemplates).toBeGreaterThanOrEqual(0);
    expect(result.summary.outputDir).toBe('.sce/templates/extracted');
    expect(logs.some((line) => line.includes('dry-run'))).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  test('runSceneExtractCommand returns a failure payload and sets exitCode when extraction fails', async () => {
    const result = await runSceneExtractCommand({
      config: '/nonexistent/moqui-adapter.json',
      json: true
    });

    expect(result).not.toBeNull();
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('CONFIG_NOT_FOUND');
    expect(process.exitCode).toBe(1);
    expect(console.log).toHaveBeenCalled();
  });
});
