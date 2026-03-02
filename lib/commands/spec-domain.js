const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const {
  ensureSpecDomainArtifacts,
  validateSpecDomainArtifacts,
  analyzeSpecDomainCoverage
} = require('../spec/domain-modeling');

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function resolveSpecId(options = {}) {
  return normalizeText(options.spec || options.name);
}

async function assertSpecExists(projectPath, specId, fileSystem = fs) {
  const specPath = path.join(projectPath, '.sce', 'specs', specId);
  if (!await fileSystem.pathExists(specPath)) {
    throw new Error(`Spec not found: ${specId}`);
  }
  return specPath;
}

async function runSpecDomainInitCommand(options = {}, dependencies = {}) {
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const specId = resolveSpecId(options);
  if (!specId) {
    throw new Error('--spec is required');
  }
  await assertSpecExists(projectPath, specId, fileSystem);

  const result = await ensureSpecDomainArtifacts(projectPath, specId, {
    fileSystem,
    dryRun: options.dryRun === true,
    force: false,
    sceneId: options.scene,
    problemStatement: options.problem,
    primaryFlow: options.primaryFlow,
    verificationPlan: options.verificationPlan
  });

  const payload = {
    mode: 'spec-domain-init',
    spec_id: specId,
    dry_run: options.dryRun === true,
    created: result.created,
    files: result.paths
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (!options.silent) {
    console.log(chalk.green('✓ Spec domain artifacts initialized'));
    console.log(chalk.gray(`  spec: ${specId}`));
  }

  return payload;
}

async function runSpecDomainRefreshCommand(options = {}, dependencies = {}) {
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const specId = resolveSpecId(options);
  if (!specId) {
    throw new Error('--spec is required');
  }
  await assertSpecExists(projectPath, specId, fileSystem);

  const result = await ensureSpecDomainArtifacts(projectPath, specId, {
    fileSystem,
    dryRun: options.dryRun === true,
    force: true,
    sceneId: options.scene,
    problemStatement: options.problem,
    primaryFlow: options.primaryFlow,
    verificationPlan: options.verificationPlan
  });

  const payload = {
    mode: 'spec-domain-refresh',
    spec_id: specId,
    dry_run: options.dryRun === true,
    refreshed: result.created,
    files: result.paths
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (!options.silent) {
    console.log(chalk.green('✓ Spec domain artifacts refreshed'));
    console.log(chalk.gray(`  spec: ${specId}`));
  }

  return payload;
}

async function runSpecDomainValidateCommand(options = {}, dependencies = {}) {
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const specId = resolveSpecId(options);
  if (!specId) {
    throw new Error('--spec is required');
  }
  await assertSpecExists(projectPath, specId, fileSystem);

  const validation = await validateSpecDomainArtifacts(projectPath, specId, fileSystem);
  const coverage = await analyzeSpecDomainCoverage(projectPath, specId, fileSystem);
  const payload = {
    mode: 'spec-domain-validate',
    spec_id: specId,
    passed: validation.passed,
    ratio: validation.ratio,
    details: validation.details,
    warnings: validation.warnings,
    coverage: {
      passed: coverage.passed,
      coverage_ratio: coverage.coverage_ratio,
      covered_count: coverage.covered_count,
      total_count: coverage.total_count,
      uncovered: coverage.uncovered
    }
  };

  if (options.failOnError && !validation.passed) {
    throw new Error(`spec domain validation failed: ${validation.warnings.join('; ')}`);
  }
  if (options.failOnGap && !coverage.passed) {
    throw new Error(`spec domain coverage has gaps: ${coverage.uncovered.join(', ')}`);
  }

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (!options.silent) {
    if (validation.passed) {
      console.log(chalk.green('✓ Spec domain validation passed'));
    } else {
      console.log(chalk.red('✗ Spec domain validation failed'));
      validation.warnings.forEach((message) => {
        console.log(chalk.gray(`  - ${message}`));
      });
    }
  }

  return payload;
}

async function runSpecDomainCoverageCommand(options = {}, dependencies = {}) {
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const specId = resolveSpecId(options);
  if (!specId) {
    throw new Error('--spec is required');
  }
  await assertSpecExists(projectPath, specId, fileSystem);

  const coverage = await analyzeSpecDomainCoverage(projectPath, specId, fileSystem);
  const payload = {
    mode: 'spec-domain-coverage',
    spec_id: specId,
    passed: coverage.passed,
    coverage_ratio: coverage.coverage_ratio,
    covered_count: coverage.covered_count,
    total_count: coverage.total_count,
    uncovered: coverage.uncovered,
    items: coverage.items
  };

  if (options.failOnGap && !coverage.passed) {
    throw new Error(`spec domain coverage has gaps: ${coverage.uncovered.join(', ')}`);
  }

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (!options.silent) {
    if (coverage.passed) {
      console.log(chalk.green('✓ Spec domain closed-loop coverage passed'));
    } else {
      console.log(chalk.red('✗ Spec domain closed-loop coverage has gaps'));
      coverage.items
        .filter((item) => !item.covered)
        .forEach((item) => {
          console.log(chalk.gray(`  - ${item.id}: ${item.label}`));
        });
    }
  }

  return payload;
}

function registerSpecDomainCommand(program) {
  const specDomain = program
    .command('spec-domain')
    .description('Manage problem-domain modeling artifacts (use: sce spec domain)');

  specDomain
    .command('init')
    .description('Create missing problem-domain artifacts for a Spec')
    .requiredOption('--spec <name>', 'Spec identifier')
    .option('--scene <scene-id>', 'Scene id used in generated chain/model')
    .option('--problem <text>', 'Problem statement seed')
    .option('--primary-flow <text>', 'Primary flow seed')
    .option('--verification-plan <text>', 'Verification plan seed')
    .option('--dry-run', 'Preview output without writing files')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
      try {
        await runSpecDomainInitCommand(options);
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: error.message }, null, 2));
        } else {
          console.error(chalk.red('❌ spec-domain init failed:'), error.message);
        }
        process.exit(1);
      }
    });

  specDomain
    .command('refresh')
    .description('Force-refresh problem-domain artifacts for a Spec')
    .requiredOption('--spec <name>', 'Spec identifier')
    .option('--scene <scene-id>', 'Scene id used in generated chain/model')
    .option('--problem <text>', 'Problem statement seed')
    .option('--primary-flow <text>', 'Primary flow seed')
    .option('--verification-plan <text>', 'Verification plan seed')
    .option('--dry-run', 'Preview output without writing files')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
      try {
        await runSpecDomainRefreshCommand(options);
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: error.message }, null, 2));
        } else {
          console.error(chalk.red('❌ spec-domain refresh failed:'), error.message);
        }
        process.exit(1);
      }
    });

  specDomain
    .command('validate')
    .description('Validate problem-domain artifacts for a Spec')
    .requiredOption('--spec <name>', 'Spec identifier')
    .option('--fail-on-error', 'Exit non-zero when validation fails')
    .option('--fail-on-gap', 'Exit non-zero when closed-loop coverage is incomplete')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
      try {
        await runSpecDomainValidateCommand(options);
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: error.message }, null, 2));
        } else {
          console.error(chalk.red('❌ spec-domain validate failed:'), error.message);
        }
        process.exit(1);
      }
    });

  specDomain
    .command('coverage')
    .description('Analyze scene-closed-loop research coverage for a Spec')
    .requiredOption('--spec <name>', 'Spec identifier')
    .option('--fail-on-gap', 'Exit non-zero when closed-loop coverage is incomplete')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
      try {
        await runSpecDomainCoverageCommand(options);
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: error.message }, null, 2));
        } else {
          console.error(chalk.red('❌ spec-domain coverage failed:'), error.message);
        }
        process.exit(1);
      }
    });
}

module.exports = {
  runSpecDomainInitCommand,
  runSpecDomainRefreshCommand,
  runSpecDomainValidateCommand,
  runSpecDomainCoverageCommand,
  registerSpecDomainCommand
};
