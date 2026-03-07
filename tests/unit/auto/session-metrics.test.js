const {
  buildStatusCounts,
  buildQueueFormatCounts,
  buildMasterSpecCounts,
  buildTopCountEntries
} = require('../../../lib/auto/session-metrics');

describe('auto session metrics helpers', () => {
  function normalizeStatusToken(value) {
    return String(value || '').trim().toLowerCase();
  }

  test('builds normalized status counts', () => {
    expect(buildStatusCounts([
      { status: 'Completed' },
      { status: ' completed ' },
      { status: 'FAILED' },
      {}
    ], normalizeStatusToken)).toEqual({
      completed: 2,
      failed: 1,
      unknown: 1
    });
  });

  test('builds queue format counts safely', () => {
    expect(buildQueueFormatCounts([
      { queue_format: 'jsonl' },
      { queue_format: ' JSONL ' },
      { queue_format: 'yaml' },
      {}
    ])).toEqual({
      jsonl: 2,
      yaml: 1,
      unknown: 1
    });
  });

  test('builds master spec counts without blanks', () => {
    expect(buildMasterSpecCounts([
      { master_spec: '01-00' },
      { master_spec: '01-00' },
      { master_spec: '02-00' },
      { master_spec: ' ' },
      {}
    ])).toEqual({
      '01-00': 2,
      '02-00': 1
    });
  });

  test('sorts top count entries deterministically', () => {
    expect(buildTopCountEntries({ beta: 2, alpha: 2, gamma: 1 }, 2)).toEqual([
      { key: 'alpha', count: 2 },
      { key: 'beta', count: 2 }
    ]);
  });
});
