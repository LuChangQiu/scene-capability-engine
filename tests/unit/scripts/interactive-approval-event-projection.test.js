'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const { SceStateStore } = require('../../../lib/state/sce-state-store');
const {
  doctorInteractiveApprovalProjection,
  parseArgs,
  queryInteractiveApprovalProjection,
  rebuildInteractiveApprovalProjection
} = require('../../../scripts/interactive-approval-event-projection');

async function writeAuditFixture(rootDir) {
  const auditPath = path.join(rootDir, '.sce', 'reports', 'interactive-approval-events.jsonl');
  await fs.ensureDir(path.dirname(auditPath));
  await fs.writeFile(auditPath, [
    JSON.stringify({
      event_id: 'evt-1',
      workflow_id: 'wf-1',
      event_type: 'interactive.approval.submit',
      action: 'submit',
      actor: 'product-owner',
      actor_role: 'product-owner',
      from_status: 'draft',
      to_status: 'submitted',
      blocked: false,
      reason: null,
      timestamp: '2026-03-12T10:00:00.000Z'
    }),
    JSON.stringify({
      event_id: 'evt-2',
      workflow_id: 'wf-1',
      event_type: 'interactive.approval.approve',
      action: 'approve',
      actor: 'security-admin',
      actor_role: 'security-admin',
      from_status: 'submitted',
      to_status: 'approved',
      blocked: false,
      reason: null,
      timestamp: '2026-03-12T10:05:00.000Z'
    })
  ].join('\n'), 'utf8');
}

describe('interactive-approval-event-projection script', () => {
  let tempDir;
  let stateStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-approval-projection-'));
    stateStore = new SceStateStore(tempDir, {
      fileSystem: fs,
      env: { NODE_ENV: 'test' },
      sqliteModule: {}
    });
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('parseArgs validates projection command options', () => {
    const parsed = parseArgs([
      '--action', 'doctor',
      '--workspace', tempDir,
      '--audit-file', '.sce/reports/interactive-approval-events.jsonl',
      '--read-source', 'projection',
      '--actor', 'security-admin',
      '--approval-action', 'approve',
      '--blocked',
      '--limit', '5',
      '--json',
      '--fail-on-drift'
    ]);

    expect(parsed.action).toBe('doctor');
    expect(parsed.projectPath).toBe(path.resolve(tempDir));
    expect(parsed.input).toBe('.sce/reports/interactive-approval-events.jsonl');
    expect(parsed.readSource).toBe('projection');
    expect(parsed.actor).toBe('security-admin');
    expect(parsed.approvalAction).toBe('approve');
    expect(parsed.blocked).toBe(true);
    expect(parsed.limit).toBe(5);
    expect(parsed.failOnDrift).toBe(true);
  });

  test('rebuild aligns projection and doctor reports aligned status', async () => {
    await writeAuditFixture(tempDir);

    const rebuild = await rebuildInteractiveApprovalProjection({
      projectPath: tempDir,
      input: '.sce/reports/interactive-approval-events.jsonl'
    }, {
      stateStore
    });

    expect(rebuild.passed).toBe(true);
    expect(rebuild.source_event_count).toBe(2);
    expect(rebuild.projection_event_count).toBe(2);

    const doctor = await doctorInteractiveApprovalProjection({
      projectPath: tempDir,
      input: '.sce/reports/interactive-approval-events.jsonl',
      failOnDrift: true
    }, {
      stateStore
    });

    expect(doctor.passed).toBe(true);
    expect(doctor.status).toBe('aligned');
    expect(doctor.projection_event_count).toBe(2);
  });

  test('query falls back to file when projection is missing and uses projection after rebuild', async () => {
    await writeAuditFixture(tempDir);

    const fromFile = await queryInteractiveApprovalProjection({
      projectPath: tempDir,
      input: '.sce/reports/interactive-approval-events.jsonl',
      readSource: 'auto',
      actor: 'security-admin',
      approvalAction: 'approve',
      limit: 10
    }, {
      stateStore
    });

    expect(fromFile.read_source).toBe('file');
    expect(fromFile.result_count).toBe(1);
    expect(fromFile.results[0]).toEqual(expect.objectContaining({
      event_id: 'evt-2'
    }));

    await rebuildInteractiveApprovalProjection({
      projectPath: tempDir,
      input: '.sce/reports/interactive-approval-events.jsonl'
    }, {
      stateStore
    });

    const fromProjection = await queryInteractiveApprovalProjection({
      projectPath: tempDir,
      input: '.sce/reports/interactive-approval-events.jsonl',
      readSource: 'auto',
      actor: 'security-admin',
      approvalAction: 'approve',
      limit: 10
    }, {
      stateStore
    });

    expect(fromProjection.read_source).toBe('projection');
    expect(fromProjection.result_count).toBe(1);
    expect(fromProjection.results[0]).toEqual(expect.objectContaining({
      event_id: 'evt-2',
      actor: 'security-admin',
      action: 'approve'
    }));
  });

  test('doctor flags projection-ahead as blocking', async () => {
    await writeAuditFixture(tempDir);
    await rebuildInteractiveApprovalProjection({
      projectPath: tempDir,
      input: '.sce/reports/interactive-approval-events.jsonl'
    }, {
      stateStore
    });

    await stateStore.upsertInteractiveApprovalEventProjection([
      {
        event_id: 'evt-3',
        workflow_id: 'wf-1',
        event_type: 'interactive.approval.archive',
        action: 'archive',
        actor: 'release-operator',
        actor_role: 'release-operator',
        blocked: false,
        timestamp: '2026-03-12T10:06:00.000Z',
        audit_file: '.sce/reports/interactive-approval-events.jsonl',
        line_no: 3
      }
    ], {
      auditFile: '.sce/reports/interactive-approval-events.jsonl',
      source: 'test.projection-ahead'
    });

    const doctor = await doctorInteractiveApprovalProjection({
      projectPath: tempDir,
      input: '.sce/reports/interactive-approval-events.jsonl',
      failOnDrift: true
    }, {
      stateStore
    });

    expect(doctor.passed).toBe(false);
    expect(doctor.status).toBe('projection-ahead');
    expect(doctor.blocking).toEqual(expect.arrayContaining(['projection-ahead']));
  });
});
