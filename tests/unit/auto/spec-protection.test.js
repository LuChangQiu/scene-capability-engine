const {
  collectSpecNamesFromBatchSummary,
  collectSpecNamesFromCloseLoopSessionPayload,
  collectSpecNamesFromBatchSummaryPayload,
  createProtectionReasonRecord,
  ensureProtectionReasonRecord,
  incrementProtectionReason,
  buildProtectionRanking,
  buildSpecProtectionReasonPayload
} = require('../../../lib/auto/spec-protection');

describe('auto spec protection helpers', () => {
  test('collects spec names from batch and session payloads', () => {
    expect(collectSpecNamesFromBatchSummary({ results: [{ master_spec: '100-00-a' }] })).toEqual(['100-00-a']);
    expect(Array.from(collectSpecNamesFromCloseLoopSessionPayload({ portfolio: { master_spec: '100-00-a', sub_specs: ['100-01-b'] } }))).toEqual(['100-00-a', '100-01-b']);
    expect(Array.from(collectSpecNamesFromBatchSummaryPayload({ results: [{ master_spec: '100-00-a', status: 'completed' }, { master_spec: '100-01-b', status: 'failed' }] }))).toEqual(['100-01-b']);
  });

  test('tracks and ranks protection reasons', () => {
    const reasonMap = new Map();
    const record = ensureProtectionReasonRecord(reasonMap, '100-00-a');
    expect(record).toEqual(expect.objectContaining({ total_references: 0 }));
    incrementProtectionReason(reasonMap, '100-00-a', 'collaboration_active', 2);
    incrementProtectionReason(reasonMap, '100-00-a', 'additional', 1);
    const ranking = buildProtectionRanking(reasonMap);
    expect(ranking[0]).toEqual(expect.objectContaining({
      spec: '100-00-a',
      total_references: 3
    }));
    expect(buildSpecProtectionReasonPayload('100-00-a', reasonMap)).toEqual({
      total_references: 3,
      additional: 1,
      collaboration_active: 2,
      close_loop_session_recent_or_incomplete: 0,
      batch_summary_recent_or_incomplete: 0,
      controller_session_recent_or_incomplete: 0
    });
  });

  test('creates empty reason record deterministically', () => {
    expect(createProtectionReasonRecord()).toEqual({
      additional: 0,
      collaboration_active: 0,
      close_loop_session_recent_or_incomplete: 0,
      batch_summary_recent_or_incomplete: 0,
      controller_session_recent_or_incomplete: 0,
      total_references: 0
    });
  });
});
