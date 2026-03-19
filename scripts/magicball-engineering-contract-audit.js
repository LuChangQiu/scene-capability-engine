#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_CHECKS = [
  {
    path: 'README.md',
    requiredSnippets: [
      '`sce scene delivery show`',
      '`sce app engineering preview|ownership|open|import|show|attach|hydrate|scaffold|activate`'
    ]
  },
  {
    path: 'README.zh.md',
    requiredSnippets: [
      '`sce scene delivery show`',
      '`sce app engineering preview|ownership|open|import|show|attach|hydrate|scaffold|activate`'
    ]
  },
  {
    path: 'docs/command-reference.md',
    requiredSnippets: [
      'sce scene delivery show --scene scene.demo --json',
      'sce app engineering preview --app customer-order-demo --json',
      'sce app engineering ownership --app customer-order-demo --json',
      'sce app engineering open --app customer-order-demo --json',
      'sce app engineering import --app customer-order-demo --json',
      'sce app engineering scaffold --app customer-order-demo --overwrite-policy missing-only --json'
    ]
  },
  {
    path: 'docs/magicball-sce-adaptation-guide.md',
    requiredSnippets: [
      '`docs/magicball-engineering-projection-contract.md`',
      '`scene delivery show`',
      '`app engineering preview`',
      '`app engineering ownership`',
      '`sce app engineering preview/ownership/open/import/show/attach/hydrate/scaffold/activate`'
    ]
  },
  {
    path: 'docs/magicball-integration-doc-index.md',
    requiredSnippets: [
      '`docs/magicball-engineering-projection-contract.md`',
      '| `magicball-engineering-projection-contract.md` | engineering payload contract | medium |'
    ]
  },
  {
    path: 'docs/magicball-engineering-projection-contract.md',
    requiredSnippets: [
      'sce scene delivery show --scene <scene-id> --json',
      'sce app engineering preview --app <app-key> --json',
      'sce app engineering ownership --app <app-key> --json',
      'sce app engineering open --app <app-key> --json',
      'sce app engineering import --app <app-key> --json',
      'sce app engineering scaffold --app <app-key> --overwrite-policy missing-only --json'
    ]
  },
  {
    path: 'docs/magicball-frontend-state-and-command-mapping.md',
    requiredSnippets: [
      'sceneDelivery: Record<string, unknown> | null',
      'engineeringPreview: Record<string, unknown> | null',
      'engineeringOwnership: Record<string, unknown> | null',
      '`sce scene delivery show --scene <scene-id> --json`',
      '`sce app engineering preview --app <app-key> --json`',
      '`sce app engineering ownership --app <app-key> --json`'
    ]
  },
  {
    path: 'docs/magicball-cli-invocation-examples.md',
    requiredSnippets: [
      'sce scene delivery show --scene scene.customer-order-demo --json',
      'sce app engineering preview --app customer-order-demo --json',
      'sce app engineering ownership --app customer-order-demo --json',
      'sce app engineering open --app customer-order-demo --json',
      'sce app engineering import --app customer-order-demo --json',
      'sce app engineering scaffold --app customer-order-demo --overwrite-policy missing-only --json'
    ]
  },
  {
    path: 'docs/magicball-write-auth-adaptation-guide.md',
    requiredSnippets: [
      '- `app:engineering:scaffold`',
      '| Scaffold engineering workspace baseline | `sce app engineering scaffold` | `app:engineering:scaffold` |',
      'sce auth grant --scope app:engineering:attach,app:engineering:hydrate,app:engineering:scaffold,app:engineering:activate --reason "initialize engineering workspace" --json'
    ]
  },
  {
    path: 'docs/magicball-mode-home-and-ontology-empty-state-playbook.md',
    requiredSnippets: [
      '4. `sce scene delivery show --scene <scene-id> --json`',
      '5. `sce app engineering preview --app <app-key> --json`',
      '6. `sce app engineering ownership --app <app-key> --json`'
    ]
  },
  {
    path: 'docs/magicball-adaptation-task-checklist-v1.md',
    requiredSnippets: [
      'frontend loads them sequentially in this order: application -> ontology -> engineering -> scene delivery -> engineering preview -> engineering ownership',
      'sce app engineering scaffold --app customer-order-demo --overwrite-policy missing-only --json',
      '- `sce app engineering scaffold`'
    ]
  },
  {
    path: 'docs/magicball-ui-surface-checklist.md',
    requiredSnippets: [
      '- `docs/magicball-engineering-projection-contract.md`',
      '- delivery column from `scene delivery show`',
      '- engineering readiness state from `app engineering preview`',
      '- engineering ownership state from `app engineering ownership`'
    ]
  },
  {
    path: 'docs/magicball-integration-issue-tracker.md',
    requiredSnippets: [
      '- `scene delivery show`',
      '- `app engineering preview/ownership/open/import/show/attach/hydrate/scaffold/activate`',
      '4. scene delivery show',
      '5. engineering preview',
      '6. engineering ownership'
    ]
  }
];

const PROHIBITED_SNIPPETS = [
  {
    value: 'application -> ontology -> engineering -> engineering show',
    allowedPaths: [
      'scripts/magicball-engineering-contract-audit.js',
      'tests/unit/scripts/magicball-engineering-contract-audit.test.js'
    ]
  },
  {
    value: '`sce app engineering show/attach/hydrate/activate`',
    allowedPaths: [
      'scripts/magicball-engineering-contract-audit.js',
      'tests/unit/scripts/magicball-engineering-contract-audit.test.js',
      'docs/magicball-app-bundle-sqlite-and-command-draft.md'
    ]
  }
];

const SEARCH_DIRECTORIES = ['docs', 'README.md', 'README.zh.md'];

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
    'Usage: node scripts/magicball-engineering-contract-audit.js [options]',
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

function pushViolation(violations, severity, rule, file, message) {
  violations.push({
    severity,
    rule,
    file,
    message
  });
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function collectSearchableFiles(projectPath) {
  const files = [];
  for (const entry of SEARCH_DIRECTORIES) {
    const absolutePath = path.join(projectPath, entry);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    const stat = fs.statSync(absolutePath);
    if (stat.isFile()) {
      files.push({
        absolutePath,
        relativePath: normalizeSlashes(entry)
      });
      continue;
    }
    const childEntries = fs.readdirSync(absolutePath, { withFileTypes: true });
    for (const child of childEntries) {
      if (!child.isFile()) {
        continue;
      }
      if (!child.name.endsWith('.md')) {
        continue;
      }
      files.push({
        absolutePath: path.join(absolutePath, child.name),
        relativePath: normalizeSlashes(path.join(entry, child.name))
      });
    }
  }
  return files;
}

function auditMagicBallEngineeringContract(options = {}) {
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
        `Required MagicBall engineering contract file is missing: ${relativePath}`
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
          `Missing required MagicBall engineering contract snippet: ${snippet}`
        );
      }
    }
  }

  const searchableFiles = collectSearchableFiles(projectPath);
  for (const file of searchableFiles) {
    const content = readText(file.absolutePath);
    for (const rule of PROHIBITED_SNIPPETS) {
      if (!content.includes(rule.value)) {
        continue;
      }
      const allowedPaths = Array.isArray(rule.allowedPaths) ? rule.allowedPaths.map(normalizeSlashes) : [];
      if (allowedPaths.includes(file.relativePath)) {
        continue;
      }
      pushViolation(
        violations,
        'error',
        'prohibited_stale_magicball_engineering_phrase',
        file.relativePath,
        `Prohibited stale MagicBall engineering phrase found: ${rule.value}`
      );
    }
  }

  return {
    mode: 'magicball-engineering-contract-audit',
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

  console.log(`MagicBall engineering contract audit: ${report.passed ? 'passed' : 'failed'}`);
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
  const report = auditMagicBallEngineeringContract(options);
  emitReport(report, options);
  if (!report.passed && options.failOnViolation) {
    process.exit(2);
  }
}

module.exports = {
  REQUIRED_CHECKS,
  PROHIBITED_SNIPPETS,
  parseArgs,
  auditMagicBallEngineeringContract
};
