const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  auditSpecDeliverySync
} = require('../../../lib/workspace/spec-delivery-audit');

function buildRunGitMock(responses) {
  return (_projectRoot, args) => {
    const key = Array.isArray(args) ? args.join(' ') : `${args || ''}`;
    if (Object.prototype.hasOwnProperty.call(responses, key)) {
      const value = responses[key];
      return typeof value === 'function' ? value() : value;
    }
    return {
      status: 0,
      stdout: '',
      stderr: ''
    };
  };
}

describe('spec-delivery-audit', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-spec-delivery-audit-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('passes in advisory mode when no manifests exist', async () => {
    const report = await auditSpecDeliverySync(tempDir, {
      requireManifest: false
    });

    expect(report.passed).toBe(true);
    expect(report.reason).toBe('no-manifests');
    expect(report.summary.manifest_count).toBe(0);
  });

  test('fails when a declared file exists but is not tracked by git', async () => {
    const specDir = path.join(tempDir, '.sce', 'specs', '121-00-spec-delivery-sync-integrity-gate');
    const filePath = path.join(tempDir, 'src', 'feature.js');

    await fs.ensureDir(specDir);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, 'module.exports = true;\n', 'utf8');
    await fs.writeJson(path.join(specDir, 'deliverables.json'), {
      verification_mode: 'blocking',
      declared_files: ['src/feature.js']
    }, { spaces: 2 });

    const report = await auditSpecDeliverySync(tempDir, {}, {
      runGit: buildRunGitMock({
        'rev-parse --is-inside-work-tree': { status: 0, stdout: 'true\n', stderr: '' },
        'ls-files': { status: 0, stdout: '', stderr: '' },
        'status --porcelain': { status: 0, stdout: '?? src/feature.js\n', stderr: '' },
        'remote -v': { status: 0, stdout: '', stderr: '' },
        'rev-parse --abbrev-ref HEAD': { status: 0, stdout: 'main\n', stderr: '' }
      })
    });

    expect(report.passed).toBe(false);
    expect(report.reason).toBe('violations');
    expect(report.summary.untracked_declared_files).toBe(1);
    expect(report.violations).toContain('[121-00-spec-delivery-sync-integrity-gate] src/feature.js => not-tracked');
    expect(report.warnings).toContain(
      '[121-00-spec-delivery-sync-integrity-gate] no GitHub/GitLab remote configured; cannot prove cross-machine delivery sync'
    );
  });

  test('fails when declared files are tracked but branch is ahead of upstream', async () => {
    const specDir = path.join(tempDir, '.sce', 'specs', '121-00-spec-delivery-sync-integrity-gate');
    const filePath = path.join(tempDir, 'src', 'feature.js');

    await fs.ensureDir(specDir);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, 'module.exports = true;\n', 'utf8');
    await fs.writeJson(path.join(specDir, 'deliverables.json'), {
      verification_mode: 'blocking',
      declared_files: ['src/feature.js']
    }, { spaces: 2 });

    const report = await auditSpecDeliverySync(tempDir, {}, {
      runGit: buildRunGitMock({
        'rev-parse --is-inside-work-tree': { status: 0, stdout: 'true\n', stderr: '' },
        'ls-files': { status: 0, stdout: 'src/feature.js\n', stderr: '' },
        'status --porcelain': { status: 0, stdout: '', stderr: '' },
        'remote -v': {
          status: 0,
          stdout: 'origin https://github.com/acme/demo.git (fetch)\norigin https://github.com/acme/demo.git (push)\n',
          stderr: ''
        },
        'rev-parse --abbrev-ref HEAD': { status: 0, stdout: 'main\n', stderr: '' },
        'rev-parse --abbrev-ref --symbolic-full-name @{u}': {
          status: 0,
          stdout: 'origin/main\n',
          stderr: ''
        },
        'rev-list --left-right --count HEAD...@{u}': { status: 0, stdout: '2 0\n', stderr: '' }
      })
    });

    expect(report.passed).toBe(false);
    expect(report.violations).toContain(
      '[121-00-spec-delivery-sync-integrity-gate] branch is ahead of upstream by 2 commit(s); push required'
    );
    expect(report.git.ahead).toBe(2);
    expect(report.git.behind).toBe(0);
  });

  test('passes tracked deliverables in detached HEAD release checkout when upstream proof is unavailable', async () => {
    const specDir = path.join(tempDir, '.sce', 'specs', '121-00-spec-delivery-sync-integrity-gate');
    const filePath = path.join(tempDir, 'src', 'feature.js');

    await fs.ensureDir(specDir);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, 'module.exports = true;\n', 'utf8');
    await fs.writeJson(path.join(specDir, 'deliverables.json'), {
      verification_mode: 'blocking',
      declared_files: ['src/feature.js']
    }, { spaces: 2 });

    const report = await auditSpecDeliverySync(tempDir, {
      allowDetachedHead: true
    }, {
      runGit: buildRunGitMock({
        'rev-parse --is-inside-work-tree': { status: 0, stdout: 'true\n', stderr: '' },
        'ls-files': { status: 0, stdout: 'src/feature.js\n', stderr: '' },
        'status --porcelain': { status: 0, stdout: '', stderr: '' },
        'remote -v': {
          status: 0,
          stdout: 'origin https://github.com/acme/demo.git (fetch)\norigin https://github.com/acme/demo.git (push)\n',
          stderr: ''
        },
        'rev-parse --abbrev-ref HEAD': { status: 0, stdout: 'HEAD\n', stderr: '' }
      })
    });

    expect(report.passed).toBe(true);
    expect(report.reason).toBe('passed');
    expect(report.git.branch).toBe('HEAD');
    expect(report.git.violations).toEqual([]);
    expect(report.git.warnings).toContain('detached HEAD release checkout detected; upstream tracking check skipped');
  });
});
