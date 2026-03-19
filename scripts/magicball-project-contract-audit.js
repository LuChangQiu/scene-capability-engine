#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_CHECKS = [
  {
    path: 'README.md',
    requiredSnippets: [
      '`sce project portfolio show|target resolve|supervision show`'
    ]
  },
  {
    path: 'README.zh.md',
    requiredSnippets: [
      '`sce project portfolio show|target resolve|supervision show`'
    ]
  },
  {
    path: 'docs/command-reference.md',
    requiredSnippets: [
      'sce project portfolio show [options]',
      'sce project target resolve [options]',
      'sce project supervision show --project <id> [options]'
    ]
  },
  {
    path: 'docs/magicball-sce-adaptation-guide.md',
    requiredSnippets: [
      '`docs/magicball-project-portfolio-contract.md`',
      '`sce project portfolio show`',
      '`sce project target resolve`',
      '`sce project supervision show`'
    ]
  },
  {
    path: 'docs/magicball-integration-doc-index.md',
    requiredSnippets: [
      '`docs/magicball-project-portfolio-contract.md`',
      '| `magicball-project-portfolio-contract.md` | multi-project payload contract | medium |'
    ]
  },
  {
    path: 'docs/magicball-project-portfolio-contract.md',
    requiredSnippets: [
      'sce project portfolio show --json',
      'sce project target resolve --json',
      'sce project supervision show --project <project-id> --json'
    ]
  },
  {
    path: 'docs/magicball-frontend-state-and-command-mapping.md',
    requiredSnippets: [
      'projectPortfolio: Record<string, unknown> | null',
      '`sce project portfolio show --json`',
      '`sce project target resolve --request <text> --current-project <project-id> --json`',
      '`sce project supervision show --project <project-id> --json`'
    ]
  },
  {
    path: 'docs/magicball-cli-invocation-examples.md',
    requiredSnippets: [
      'sce project portfolio show --json',
      'sce project target resolve --request "continue customer-order-demo" --json',
      'sce project supervision show --project workspace:customer-order-demo --json'
    ]
  },
  {
    path: 'docs/magicball-adaptation-task-checklist-v1.md',
    requiredSnippets: [
      '## Phase 0: Multi-project Workspace Shell',
      'sce project portfolio show --json',
      'sce project target resolve --request "<text>" --current-project <project-id> --json',
      'sce project supervision show --project <project-id> --json'
    ]
  },
  {
    path: 'docs/magicball-ui-surface-checklist.md',
    requiredSnippets: [
      '- `docs/magicball-project-portfolio-contract.md`',
      '- project switcher from `project portfolio show`',
      '- project health summary from `project supervision show`'
    ]
  },
  {
    path: 'docs/magicball-integration-issue-tracker.md',
    requiredSnippets: [
      '- `project portfolio show/target resolve/supervision show`',
      '5. treat `project portfolio / target resolve / supervision` as the default multi-project shell truth'
    ]
  },
  {
    path: 'docs/release-checklist.md',
    requiredSnippets: [
      'npm run audit:magicball-project-contract',
      '- `audit:magicball-project-contract` passes'
    ]
  },
  {
    path: 'docs/zh/release-checklist.md',
    requiredSnippets: [
      'npm run audit:magicball-project-contract',
      '- `audit:magicball-project-contract` 通过'
    ]
  }
];

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    projectPath: process.cwd(),
    json: false,
    failOnViolation: false,
    out: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--project-path' && next) {
      options.projectPath = path.resolve(next);
      index += 1;
      continue;
    }
    if (token === '--json') {
      options.json = true;
      continue;
    }
    if (token === '--fail-on-violation') {
      options.failOnViolation = true;
      continue;
    }
    if (token === '--out' && next) {
      options.out = path.resolve(next);
      index += 1;
      continue;
    }
    if (token === '--help' || token === '-h') {
      printHelpAndExit(0);
    }
  }

  return options;
}

function printHelpAndExit(code) {
  const lines = [
    'Usage: node scripts/magicball-project-contract-audit.js [options]',
    '',
    'Options:',
    '  --project-path <path>   Project root to audit (default: current directory)',
    '  --json                  Print JSON payload',
    '  --fail-on-violation     Exit code 2 when any violation is found',
    '  --out <path>            Write JSON payload to file',
    '  -h, --help              Show this help'
  ];
  console.log(lines.join('\n'));
  process.exit(code);
}

function normalizeSlashes(value) {
  return `${value || ''}`.replace(/\\/g, '/');
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function pushViolation(violations, severity, rule, file, message) {
  violations.push({
    severity,
    rule,
    file,
    message
  });
}

function auditMagicBallProjectContract(options = {}) {
  const projectPath = path.resolve(options.projectPath || process.cwd());
  const violations = [];
  const checkedFiles = [];

  for (const check of REQUIRED_CHECKS) {
    const relativePath = normalizeSlashes(check.path);
    const absolutePath = path.join(projectPath, relativePath);
    checkedFiles.push(relativePath);
    if (!fs.existsSync(absolutePath)) {
      pushViolation(
        violations,
        'error',
        'missing_required_file',
        relativePath,
        `Required MagicBall project contract file is missing: ${relativePath}`
      );
      continue;
    }
    const content = readText(absolutePath);
    for (const snippet of check.requiredSnippets) {
      if (!content.includes(snippet)) {
        pushViolation(
          violations,
          'error',
          'missing_required_snippet',
          relativePath,
          `Missing required MagicBall project contract snippet: ${snippet}`
        );
      }
    }
  }

  return {
    mode: 'magicball-project-contract-audit',
    project_path: projectPath,
    checked_files: Array.from(new Set(checkedFiles)).sort(),
    violation_count: violations.length,
    passed: violations.length === 0,
    violations
  };
}

function emitReport(report, options = {}) {
  if (options.out) {
    fs.writeFileSync(options.out, JSON.stringify(report, null, 2));
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`MagicBall project contract audit: ${report.passed ? 'passed' : 'failed'}`);
  console.log(`Checked files: ${report.checked_files.length}`);
  console.log(`Violations: ${report.violation_count}`);
  if (report.violations.length > 0) {
    report.violations.forEach((violation) => {
      console.log(`- [${violation.rule}] ${violation.file}: ${violation.message}`);
    });
  }
}

if (require.main === module) {
  const options = parseArgs();
  const report = auditMagicBallProjectContract(options);
  emitReport(report, options);
  if (!report.passed && options.failOnViolation) {
    process.exit(2);
  }
}

module.exports = {
  REQUIRED_CHECKS,
  parseArgs,
  auditMagicBallProjectContract
};
