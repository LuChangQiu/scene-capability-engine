'use strict';

const { auditCollabGovernance } = require('./collab-governance-audit');

async function evaluateCollabGovernanceGate(options = {}, dependencies = {}) {
  const projectPath = options.projectPath || dependencies.projectPath || process.cwd();
  const audit = await (dependencies.auditCollabGovernance || auditCollabGovernance)(
    projectPath,
    options,
    dependencies
  );

  return {
    mode: 'collab-governance-gate',
    project_path: projectPath,
    passed: audit.passed === true,
    reason: audit.reason || (audit.passed === true ? 'passed' : 'violations'),
    summary: audit.summary || {},
    warnings: Array.isArray(audit.warnings) ? audit.warnings : [],
    violations: Array.isArray(audit.violations) ? audit.violations : [],
    audit
  };
}

function formatCollabGovernanceGateBlockMessage(payload = {}, maxViolations = 3) {
  const violations = Array.isArray(payload.violations) ? payload.violations.filter(Boolean) : [];
  if (violations.length === 0) {
    return 'collaboration governance gate blocked push';
  }

  const visibleViolations = violations.slice(0, Math.max(1, maxViolations));
  const suffix = violations.length > visibleViolations.length
    ? ` (+${violations.length - visibleViolations.length} more)`
    : '';
  return `collaboration governance gate blocked push: ${visibleViolations.join('; ')}${suffix}`;
}

async function runCollabGovernanceGate(options = {}, dependencies = {}) {
  const payload = await evaluateCollabGovernanceGate(options, dependencies);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (payload.passed) {
    process.stdout.write('[collab-governance-gate] passed\n');
    process.stdout.write(
      `[collab-governance-gate] missing-ignore-rules=${payload.summary.missing_gitignore_rules || 0} legacy-references=${payload.summary.legacy_reference_count || 0}\n`
    );
  } else {
    process.stdout.write('[collab-governance-gate] blocked\n');
    payload.violations.forEach((item) => {
      process.stdout.write(`[collab-governance-gate] violation=${item}\n`);
    });
  }

  return {
    ...payload,
    exit_code: options.failOnViolation && !payload.passed ? 2 : 0
  };
}

module.exports = {
  evaluateCollabGovernanceGate,
  formatCollabGovernanceGateBlockMessage,
  runCollabGovernanceGate
};
