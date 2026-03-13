#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { minimatch } = require('minimatch');
const {
  cloneStateStoragePolicyDefaults,
  REQUIRED_COMPONENT_IDS
} = require('../lib/state/state-storage-policy');

function parseArgs(argv = []) {
  const options = {
    projectPath: process.cwd(),
    policyPath: null,
    json: false,
    failOnWarning: false,
    out: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--project-path' || token === '--workspace') {
      if (next) {
        options.projectPath = path.resolve(next);
        index += 1;
      }
      continue;
    }
    if (token === '--policy') {
      if (next) {
        options.policyPath = path.resolve(options.projectPath, next);
        index += 1;
      }
      continue;
    }
    if (token === '--json') {
      options.json = true;
      continue;
    }
    if (token === '--fail-on-warning') {
      options.failOnWarning = true;
      continue;
    }
    if (token === '--out') {
      if (next) {
        options.out = path.resolve(next);
        index += 1;
      }
    }
  }

  return options;
}

function pushViolation(violations, severity, rule, message, details = {}) {
  violations.push({
    severity,
    rule,
    message,
    ...details
  });
}

function collectFilesRecursive(rootDir, relativePrefix = '') {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    const relativePath = path.posix.join(relativePrefix, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursive(absolutePath, relativePath));
    } else {
      results.push(relativePath);
    }
  }
  return results;
}

function normalizeRulePatterns(rule = {}) {
  return []
    .concat(Array.isArray(rule.path_patterns) ? rule.path_patterns : [])
    .concat(Array.isArray(rule.explicit_paths) ? rule.explicit_paths : []);
}

function loadPolicy(projectPath, explicitPolicyPath = null) {
  const defaultPath = path.join(projectPath, '.sce', 'config', 'state-storage-policy.json');
  const policyPath = explicitPolicyPath || defaultPath;
  if (!fs.existsSync(policyPath)) {
    return {
      policyPath,
      exists: false,
      policy: cloneStateStoragePolicyDefaults()
    };
  }
  return {
    policyPath,
    exists: true,
    policy: JSON.parse(fs.readFileSync(policyPath, 'utf8'))
  };
}

function auditStateStorageTiering(options = {}) {
  const projectPath = path.resolve(options.projectPath || process.cwd());
  const loaded = loadPolicy(projectPath, options.policyPath || null);
  const policy = loaded.policy || {};
  const violations = [];

  if (!loaded.exists) {
    pushViolation(
      violations,
      'error',
      'missing_policy_file',
      'State storage policy file is missing.',
      { path: path.relative(projectPath, loaded.policyPath).replace(/\\/g, '/') || loaded.policyPath }
    );
  }

  if (policy.schema_version !== '1.0') {
    pushViolation(violations, 'error', 'invalid_schema_version', 'State storage policy must declare schema_version 1.0.');
  }

  if (policy.strategy !== 'selective-sqlite-advancement') {
    pushViolation(
      violations,
      'error',
      'invalid_strategy',
      'State storage policy must use the selective-sqlite-advancement strategy.'
    );
  }

  const componentScope = Array.isArray(policy.component_scope) ? policy.component_scope : [];
  const componentIds = new Set(componentScope.map((item) => `${item && item.component_id ? item.component_id : ''}`.trim()).filter(Boolean));
  for (const id of REQUIRED_COMPONENT_IDS) {
    if (!componentIds.has(id)) {
      pushViolation(
        violations,
        'error',
        'missing_component_scope',
        `Missing required component scope entry for ${id}.`,
        { component_id: id }
      );
    }
  }

  for (const component of componentScope) {
    if (!component || !component.component_id) {
      pushViolation(violations, 'error', 'invalid_component_scope_entry', 'Component scope entries must declare component_id.');
      continue;
    }
    if (component.tier !== 'sqlite-index') {
      pushViolation(
        violations,
        'error',
        'invalid_component_tier',
        `${component.component_id} must remain classified as sqlite-index.`,
        { component_id: component.component_id }
      );
    }
    if (component.canonical_source !== 'file') {
      pushViolation(
        violations,
        'warning',
        'non_file_canonical_source',
        `${component.component_id} should declare file as canonical_source for the current gradual migration model.`,
        { component_id: component.component_id }
      );
    }
    if (!component.source_path) {
      pushViolation(
        violations,
        'error',
        'missing_component_source_path',
        `${component.component_id} must declare source_path.`,
        { component_id: component.component_id }
      );
    }
  }

  const resourceRules = Array.isArray(policy.resource_rules) ? policy.resource_rules : [];
  const workspaceRule = resourceRules.find((rule) => Array.isArray(rule.explicit_paths) && rule.explicit_paths.includes('~/.sce/workspace-state.json'));
  if (!workspaceRule) {
    pushViolation(
      violations,
      'error',
      'missing_workspace_state_rule',
      'Policy must explicitly classify ~/.sce/workspace-state.json.'
    );
  } else {
    if (workspaceRule.tier !== 'file-source') {
      pushViolation(
        violations,
        'error',
        'workspace_state_wrong_tier',
        'Workspace personal state must remain file-source.'
      );
    }
    if (workspaceRule.source_replacement_allowed !== false) {
      pushViolation(
        violations,
        'error',
        'workspace_state_source_replacement',
        'Workspace personal state must not allow SQLite source replacement.'
      );
    }
  }

  const appendOnlyRuleIds = new Set();
  for (const rule of resourceRules) {
    const patterns = normalizeRulePatterns(rule);
    if (patterns.some((pattern) => pattern === '.sce/reports/**/*.jsonl' || pattern === '.sce/audit/**/*.jsonl')) {
      appendOnlyRuleIds.add(rule.rule_id);
      if (rule.tier !== 'file-source') {
        pushViolation(
          violations,
          'error',
          'append_only_wrong_tier',
          `${rule.rule_id} must remain file-source.`,
          { rule_id: rule.rule_id }
        );
      }
      if (rule.source_replacement_allowed !== false) {
        pushViolation(
          violations,
          'error',
          'append_only_source_replacement',
          `${rule.rule_id} must not allow SQLite source replacement.`,
          { rule_id: rule.rule_id }
        );
      }
    }
  }

  if (!appendOnlyRuleIds.has('append-only-report-streams')) {
    pushViolation(
      violations,
      'error',
      'missing_append_only_report_rule',
      'Policy must explicitly protect .sce/reports/**/*.jsonl as file-source.'
    );
  }
  if (!appendOnlyRuleIds.has('append-only-audit-streams')) {
    pushViolation(
      violations,
      'error',
      'missing_append_only_audit_rule',
      'Policy must explicitly protect .sce/audit/**/*.jsonl as file-source.'
    );
  }

  const scannedFiles = []
    .concat(collectFilesRecursive(path.join(projectPath, '.sce', 'reports'), '.sce/reports'))
    .concat(collectFilesRecursive(path.join(projectPath, '.sce', 'audit'), '.sce/audit'))
    .filter((relativePath) => relativePath.endsWith('.jsonl'));

  const uncoveredStreams = [];
  for (const relativePath of scannedFiles) {
    const covered = resourceRules.some((rule) => {
      const patterns = Array.isArray(rule.path_patterns) ? rule.path_patterns : [];
      return patterns.some((pattern) => minimatch(relativePath, pattern, { dot: true }));
    });
    if (!covered) {
      uncoveredStreams.push(relativePath);
      pushViolation(
        violations,
        'warning',
        'uncovered_append_only_stream',
        `Append-only stream is not covered by any resource rule: ${relativePath}`,
        { path: relativePath }
      );
    }
  }

  const errorCount = violations.filter((item) => item.severity === 'error').length;
  const warningCount = violations.filter((item) => item.severity === 'warning').length;
  const passed = errorCount === 0 && (!options.failOnWarning || warningCount === 0);

  return {
    mode: 'state-storage-tiering-audit',
    project_path: projectPath,
    policy_path: loaded.policyPath,
    policy_exists: loaded.exists,
    passed,
    success: passed,
    error_count: errorCount,
    warning_count: warningCount,
    summary: {
      component_scope_count: componentScope.length,
      required_component_scope_count: REQUIRED_COMPONENT_IDS.length,
      resource_rule_count: resourceRules.length,
      append_only_stream_count: scannedFiles.length,
      uncovered_append_only_streams: uncoveredStreams.length
    },
    violations
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = auditStateStorageTiering(options);
  if (options.out) {
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(options.out, JSON.stringify(report, null, 2), 'utf8');
  }
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (report.passed) {
    console.log('[state-storage-tiering-audit] passed');
  } else {
    console.error('[state-storage-tiering-audit] failed');
    for (const violation of report.violations) {
      console.error(`[state-storage-tiering-audit] ${violation.severity} ${violation.rule}: ${violation.message}`);
    }
  }
  if (!report.passed) {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.message ? error.message : `${error}`);
    process.exitCode = 1;
  }
}

module.exports = {
  auditStateStorageTiering,
  loadPolicy,
  parseArgs
};
