'use strict';

const path = require('path');
const fs = require('fs-extra');
const { minimatch } = require('minimatch');
const {
  runGit,
  parseRemotes,
  parseAheadBehind
} = require('../../scripts/git-managed-gate');

const DELIVERY_MANIFEST_FILE = 'deliverables.json';
const DELIVERY_VERIFICATION_MODES = new Set(['blocking', 'advisory']);

function shouldAllowDetachedHeadSync(options = {}) {
  if (typeof options.allowDetachedHead === 'boolean') {
    return options.allowDetachedHead;
  }

  const githubActions = `${process.env.GITHUB_ACTIONS || ''}`.trim().toLowerCase() === 'true';
  const githubRefType = `${process.env.GITHUB_REF_TYPE || ''}`.trim().toLowerCase();
  const githubRef = `${process.env.GITHUB_REF || ''}`.trim();
  return githubActions && (
    githubRefType === 'tag' ||
    githubRef.startsWith('refs/tags/')
  );
}

function normalizeRelativePath(projectRoot, candidate) {
  if (typeof candidate !== 'string') {
    return null;
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }

  const absolutePath = path.isAbsolute(trimmed)
    ? trimmed
    : path.join(projectRoot, trimmed);
  const relativePath = path.relative(projectRoot, absolutePath);
  const normalized = `${relativePath}`.replace(/\\/g, '/');

  if (!normalized || normalized.startsWith('..')) {
    return null;
  }

  return normalized;
}

function normalizePathList(projectRoot, values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set();
  const results = [];
  for (const value of values) {
    const normalized = normalizeRelativePath(projectRoot, value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    results.push(normalized);
  }
  return results;
}

function normalizePatternList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set();
  const results = [];
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    results.push(normalized);
  }
  return results;
}

function parseManifest(projectRoot, specName, payload) {
  const manifest = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};
  const verificationMode = DELIVERY_VERIFICATION_MODES.has(manifest.verification_mode)
    ? manifest.verification_mode
    : 'blocking';
  return {
    spec: specName,
    verification_mode: verificationMode,
    declared_files: normalizePathList(projectRoot, manifest.declared_files),
    optional_files: normalizePathList(projectRoot, manifest.optional_files),
    ignored_patterns: normalizePatternList(manifest.ignored_patterns)
  };
}

function parseStatusEntries(raw = '') {
  const entries = new Map();
  const lines = `${raw || ''}`.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
  for (const line of lines) {
    if (line.length < 3) {
      continue;
    }
    const xy = line.slice(0, 2);
    const payload = line.slice(3).trim();
    const targetPath = payload.includes(' -> ') ? payload.split(' -> ').pop().trim() : payload;
    const normalizedPath = `${targetPath}`.replace(/\\/g, '/');
    entries.set(normalizedPath, {
      raw: line,
      x: xy[0],
      y: xy[1]
    });
  }
  return entries;
}

function resolveWorktreeStatus(statusEntry) {
  if (!statusEntry) {
    return 'unmodified';
  }
  if (statusEntry.x === '?' && statusEntry.y === '?') {
    return 'untracked';
  }

  const statusToken = [statusEntry.x, statusEntry.y].find((value) => value && value !== ' ');
  switch (statusToken) {
    case 'M':
      return 'modified';
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    case 'U':
      return 'unmerged';
    default:
      return 'unmodified';
  }
}

function shouldIgnorePath(filePath, ignoredPatterns = []) {
  return ignoredPatterns.some((pattern) => minimatch(filePath, pattern, { dot: true }));
}

async function discoverDeliveryManifests(projectRoot, options = {}, dependencies = {}) {
  const fileSystem = dependencies.fileSystem || fs;
  const specRoot = path.join(projectRoot, '.sce', 'specs');
  const specFilter = typeof options.spec === 'string' && options.spec.trim().length > 0
    ? options.spec.trim()
    : null;

  const exists = await fileSystem.pathExists(specRoot);
  if (!exists) {
    return [];
  }

  const entries = await fileSystem.readdir(specRoot, { withFileTypes: true });
  const manifests = [];
  for (const entry of entries) {
    if (!entry || !entry.isDirectory()) {
      continue;
    }
    if (specFilter && entry.name !== specFilter) {
      continue;
    }
    const manifestPath = path.join(specRoot, entry.name, DELIVERY_MANIFEST_FILE);
    if (!await fileSystem.pathExists(manifestPath)) {
      continue;
    }
    manifests.push({
      spec: entry.name,
      manifest_path: manifestPath
    });
  }
  return manifests.sort((left, right) => left.spec.localeCompare(right.spec));
}

function loadGitSnapshot(projectRoot, options = {}, dependencies = {}) {
  const runGitCommand = dependencies.runGit || runGit;
  const allowNoRemote = options.allowNoRemote !== false;
  const allowDetachedHead = shouldAllowDetachedHeadSync(options);
  const targetHosts = Array.isArray(options.targetHosts) && options.targetHosts.length > 0
    ? options.targetHosts
    : ['github.com', 'gitlab.com'];

  const inside = runGitCommand(projectRoot, ['rev-parse', '--is-inside-work-tree']);
  if (inside.status !== 0 || `${inside.stdout || ''}`.trim().toLowerCase() !== 'true') {
    return {
      available: false,
      passed: false,
      reason: 'not-a-git-repository',
      target_hosts: targetHosts,
      tracked_files: new Set(),
      status_entries: new Map(),
      warnings: [],
      violations: ['current directory is not a git repository'],
      branch: null,
      upstream: null,
      ahead: null,
      behind: null,
      has_target_remote: false,
      clean_worktree: null,
      worktree_changes: {
        tracked_count: 0,
        untracked_count: 0
      }
    };
  }

  const warnings = [];
  const violations = [];
  const trackedFilesResult = runGitCommand(projectRoot, ['ls-files']);
  const trackedFiles = trackedFilesResult.status === 0
    ? new Set(
      `${trackedFilesResult.stdout || ''}`
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.replace(/\\/g, '/'))
    )
    : new Set();
  if (trackedFilesResult.status !== 0) {
    violations.push(`failed to list tracked files: ${trackedFilesResult.stderr || 'unknown error'}`);
  }

  const statusResult = runGitCommand(projectRoot, ['status', '--porcelain']);
  const statusEntries = statusResult.status === 0
    ? parseStatusEntries(statusResult.stdout)
    : new Map();

  let trackedChanges = 0;
  let untrackedChanges = 0;
  for (const entry of statusEntries.values()) {
    if (entry.x === '?' && entry.y === '?') {
      untrackedChanges += 1;
    } else {
      trackedChanges += 1;
    }
  }

  const remotesResult = runGitCommand(projectRoot, ['remote', '-v']);
  const remoteInfo = remotesResult.status === 0
    ? parseRemotes(remotesResult.stdout, targetHosts)
    : { allRemotes: [], targetRemotes: [] };
  const hasTargetRemote = remoteInfo.targetRemotes.length > 0;
  if (remotesResult.status !== 0) {
    warnings.push(`failed to read git remotes: ${remotesResult.stderr || 'unknown error'}`);
  } else if (!hasTargetRemote) {
    if (allowNoRemote) {
      warnings.push('no GitHub/GitLab remote configured; sync proof is advisory only');
    } else {
      violations.push('no GitHub/GitLab remote configured');
    }
  }

  const branchResult = runGitCommand(projectRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = branchResult.status === 0 ? `${branchResult.stdout || ''}`.trim() : null;
  if (branchResult.status !== 0) {
    warnings.push(`failed to resolve branch: ${branchResult.stderr || 'unknown error'}`);
  }

  let upstream = null;
  let ahead = null;
  let behind = null;
  if (hasTargetRemote) {
    if (branch === 'HEAD' && allowDetachedHead) {
      warnings.push('detached HEAD release checkout detected; upstream tracking check skipped');
    } else {
      const upstreamResult = runGitCommand(projectRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
      if (upstreamResult.status !== 0) {
        violations.push('current branch has no upstream tracking branch');
      } else {
        upstream = `${upstreamResult.stdout || ''}`.trim();
        const aheadBehindResult = runGitCommand(projectRoot, ['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
        if (aheadBehindResult.status !== 0) {
          violations.push(`failed to compare with upstream: ${aheadBehindResult.stderr || 'unknown error'}`);
        } else {
          const parsed = parseAheadBehind(aheadBehindResult.stdout);
          ahead = parsed.ahead;
          behind = parsed.behind;
          if (Number.isFinite(ahead) && ahead > 0) {
            violations.push(`branch is ahead of upstream by ${ahead} commit(s); push required`);
          }
          if (Number.isFinite(behind) && behind > 0) {
            violations.push(`branch is behind upstream by ${behind} commit(s); sync required`);
          }
        }
      }
    }
  }

  return {
    available: true,
    passed: violations.length === 0,
    reason: violations.length === 0 ? 'synced' : 'violations',
    target_hosts: targetHosts,
    remotes: remoteInfo.allRemotes,
    target_remotes: remoteInfo.targetRemotes,
    tracked_files: trackedFiles,
    status_entries: statusEntries,
    warnings,
    violations,
    branch,
    upstream,
    ahead,
    behind,
    has_target_remote: hasTargetRemote,
    clean_worktree: trackedChanges === 0 && untrackedChanges === 0,
    worktree_changes: {
      tracked_count: trackedChanges,
      untracked_count: untrackedChanges
    }
  };
}

async function auditSpecDeliverySync(projectRoot = process.cwd(), options = {}, dependencies = {}) {
  const fileSystem = dependencies.fileSystem || fs;
  const manifests = await discoverDeliveryManifests(projectRoot, options, dependencies);
  const requireManifest = options.requireManifest === true;
  const git = manifests.length > 0
    ? loadGitSnapshot(projectRoot, options, dependencies)
    : {
      available: false,
      passed: true,
      reason: 'not-required',
      tracked_files: new Set(),
      status_entries: new Map(),
      warnings: [],
      violations: [],
      branch: null,
      upstream: null,
      ahead: null,
      behind: null,
      has_target_remote: false,
      clean_worktree: null,
      worktree_changes: {
        tracked_count: 0,
        untracked_count: 0
      }
    };

  const report = {
    mode: 'spec-delivery-audit',
    generated_at: new Date().toISOString(),
    root: projectRoot,
    spec: typeof options.spec === 'string' && options.spec.trim().length > 0 ? options.spec.trim() : null,
    require_manifest: requireManifest,
    manifests: [],
    git: {
      available: git.available === true,
      passed: git.passed === true,
      reason: git.reason,
      warnings: git.warnings,
      violations: git.violations,
      branch: git.branch,
      upstream: git.upstream,
      ahead: git.ahead,
      behind: git.behind,
      has_target_remote: git.has_target_remote,
      clean_worktree: git.clean_worktree,
      worktree_changes: git.worktree_changes
    },
    summary: {
      manifest_count: manifests.length,
      blocking_manifest_count: 0,
      advisory_manifest_count: 0,
      passed_manifests: 0,
      failed_manifests: 0,
      declared_files: 0,
      missing_declared_files: 0,
      untracked_declared_files: 0,
      dirty_declared_files: 0
    },
    warnings: [],
    violations: [],
    passed: true,
    reason: 'passed'
  };

  if (manifests.length === 0) {
    if (requireManifest) {
      report.passed = false;
      report.reason = 'missing-manifest';
      report.violations.push(
        report.spec
          ? `no delivery manifest found for spec "${report.spec}"`
          : 'no delivery manifests found under .sce/specs'
      );
    } else {
      report.reason = 'no-manifests';
      report.warnings.push('no delivery manifests found; delivery sync audit is advisory only');
    }
    return report;
  }

  for (const item of manifests) {
    let manifestPayload;
    try {
      manifestPayload = await fileSystem.readJson(item.manifest_path);
    } catch (error) {
      const manifestReport = {
        spec: item.spec,
        manifest_file: normalizeRelativePath(projectRoot, item.manifest_path),
        verification_mode: 'blocking',
        declared_files: [],
        optional_files: [],
        ignored_patterns: [],
        files: [],
        warnings: [],
        violations: [`invalid delivery manifest: ${error.message}`],
        passed: false,
        summary: {
          declared_count: 0,
          missing_declared_files: 0,
          untracked_declared_files: 0,
          dirty_declared_files: 0
        }
      };
      report.manifests.push(manifestReport);
      report.summary.blocking_manifest_count += 1;
      report.summary.failed_manifests += 1;
      report.violations.push(`[${item.spec}] invalid delivery manifest: ${error.message}`);
      continue;
    }

    const manifest = parseManifest(projectRoot, item.spec, manifestPayload);
    const manifestReport = {
      spec: item.spec,
      manifest_file: normalizeRelativePath(projectRoot, item.manifest_path),
      verification_mode: manifest.verification_mode,
      declared_files: manifest.declared_files,
      optional_files: manifest.optional_files,
      ignored_patterns: manifest.ignored_patterns,
      files: [],
      warnings: [],
      violations: [],
      passed: true,
      summary: {
        declared_count: manifest.declared_files.length,
        missing_declared_files: 0,
        untracked_declared_files: 0,
        dirty_declared_files: 0
      }
    };

    if (manifest.verification_mode === 'blocking') {
      report.summary.blocking_manifest_count += 1;
    } else {
      report.summary.advisory_manifest_count += 1;
    }

    const declaredFiles = manifest.declared_files.filter((filePath) => !shouldIgnorePath(filePath, manifest.ignored_patterns));
    report.summary.declared_files += declaredFiles.length;

    for (const filePath of declaredFiles) {
      const absolutePath = path.join(projectRoot, filePath);
      const exists = await fileSystem.pathExists(absolutePath);
      const tracked = git.tracked_files.has(filePath);
      const worktreeStatus = resolveWorktreeStatus(git.status_entries.get(filePath));
      const fileResult = {
        path: filePath,
        exists,
        tracked,
        worktree_status: worktreeStatus,
        issues: []
      };

      if (!exists) {
        fileResult.issues.push('missing');
        manifestReport.summary.missing_declared_files += 1;
        report.summary.missing_declared_files += 1;
      }
      if (!tracked) {
        fileResult.issues.push('not-tracked');
        manifestReport.summary.untracked_declared_files += 1;
        report.summary.untracked_declared_files += 1;
      }
      if (tracked && worktreeStatus !== 'unmodified') {
        fileResult.issues.push(`dirty:${worktreeStatus}`);
        manifestReport.summary.dirty_declared_files += 1;
        report.summary.dirty_declared_files += 1;
      }

      if (fileResult.issues.length > 0) {
        const reason = `${filePath} => ${fileResult.issues.join(', ')}`;
        if (manifest.verification_mode === 'blocking') {
          manifestReport.violations.push(reason);
        } else {
          manifestReport.warnings.push(reason);
        }
      }

      manifestReport.files.push(fileResult);
    }

    if (git.available !== true) {
      const reason = git.violations[0] || 'git repository unavailable';
      if (manifest.verification_mode === 'blocking') {
        manifestReport.violations.push(reason);
      } else {
        manifestReport.warnings.push(reason);
      }
    } else {
      for (const gitViolation of git.violations) {
        if (gitViolation.includes('ahead of upstream') || gitViolation.includes('behind upstream') || gitViolation.includes('no upstream tracking branch')) {
          if (manifest.verification_mode === 'blocking') {
            manifestReport.violations.push(gitViolation);
          } else {
            manifestReport.warnings.push(gitViolation);
          }
        }
      }
      if (git.has_target_remote !== true) {
        manifestReport.warnings.push('no GitHub/GitLab remote configured; cannot prove cross-machine delivery sync');
      }
    }

    manifestReport.passed = manifestReport.violations.length === 0;
    if (manifestReport.passed) {
      report.summary.passed_manifests += 1;
    } else {
      report.summary.failed_manifests += 1;
      report.violations.push(...manifestReport.violations.map((value) => `[${item.spec}] ${value}`));
    }
    report.warnings.push(...manifestReport.warnings.map((value) => `[${item.spec}] ${value}`));
    report.manifests.push(manifestReport);
  }

  report.passed = report.violations.length === 0;
  report.reason = report.passed ? 'passed' : 'violations';
  return report;
}

module.exports = {
  DELIVERY_MANIFEST_FILE,
  DELIVERY_VERIFICATION_MODES,
  discoverDeliveryManifests,
  auditSpecDeliverySync,
  loadGitSnapshot,
  parseManifest,
  parseStatusEntries,
  resolveWorktreeStatus
};
