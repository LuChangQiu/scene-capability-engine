#!/usr/bin/env node
'use strict';

const path = require('path');
const { runCollabGovernanceGate } = require('../lib/workspace/collab-governance-gate');

function parseArgs(argv = []) {
  const options = {
    projectPath: process.cwd(),
    failOnViolation: false,
    json: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === '--project-path' && next) {
      options.projectPath = path.resolve(next);
      index += 1;
    } else if (token === '--fail-on-violation') {
      options.failOnViolation = true;
    } else if (token === '--json') {
      options.json = true;
    } else if (token === '--help' || token === '-h') {
      options.help = true;
    }
  }

  return options;
}

function printHelp() {
  const lines = [
    'Usage: node scripts/collab-governance-gate.js [options]',
    '',
    'Options:',
    '  --project-path <path>     Project path (default: cwd)',
    '  --fail-on-violation       Exit with code 2 when violations exist',
    '  --json                    Print JSON payload',
    '  -h, --help                Show help'
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  runCollabGovernanceGate(options)
    .then((result) => {
      process.exitCode = result.exit_code;
    })
    .catch((error) => {
      const payload = {
        mode: 'collab-governance-gate',
        passed: false,
        error: error.message
      };
      if (options.json) {
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      } else {
        process.stderr.write(`[collab-governance-gate] error=${error.message}\n`);
      }
      process.exitCode = 1;
    });
}

module.exports = {
  parseArgs,
  runCollabGovernanceGate
};
