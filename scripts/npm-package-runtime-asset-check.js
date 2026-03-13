#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

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
    'Usage: node scripts/npm-package-runtime-asset-check.js [options]',
    '',
    'Options:',
    '  --project-path <path>     Project path (default: cwd)',
    '  --fail-on-violation       Exit non-zero when runtime assets are missing',
    '  --json                    Print JSON payload',
    '  -h, --help                Show help'
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

function resolveNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function collectRuntimeScriptFiles(projectPath = process.cwd(), dependencies = {}) {
  const fileSystem = dependencies.fileSystem || fs;
  const scriptsDir = path.join(projectPath, 'scripts');
  const results = [];

  function walk(currentDir) {
    let entries = [];
    try {
      entries = fileSystem.readdirSync(currentDir, { withFileTypes: true });
    } catch (_error) {
      return;
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const relativePath = path.relative(projectPath, absolutePath).replace(/\\/g, '/');
      if (!relativePath.startsWith('scripts/') || !relativePath.endsWith('.js')) {
        continue;
      }
      results.push(relativePath);
    }
  }

  walk(scriptsDir);
  return results.sort();
}

function runPackDryRun(projectPath = process.cwd(), dependencies = {}) {
  if (typeof dependencies.packRunner === 'function') {
    return dependencies.packRunner(projectPath);
  }

  if (process.platform === 'win32') {
    try {
      const stdout = execSync('npm pack --json --dry-run', {
        cwd: projectPath,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024
      });
      return {
        status: 0,
        stdout: `${stdout || ''}`,
        stderr: '',
        error: ''
      };
    } catch (error) {
      return {
        status: Number.isInteger(error.status) ? error.status : 1,
        stdout: `${error.stdout || ''}`,
        stderr: `${error.stderr || ''}`,
        error: `${error.message || ''}`.trim()
      };
    }
  }

  const result = spawnSync(resolveNpmCommand(), ['pack', '--json', '--dry-run'], {
    cwd: projectPath,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024
  });

  return {
    status: Number.isInteger(result.status) ? result.status : 1,
    stdout: `${result.stdout || ''}`,
    stderr: `${result.stderr || ''}`,
    error: result.error ? `${result.error.message || ''}`.trim() : ''
  };
}

function extractPackedFilePaths(packStdout) {
  const parsed = JSON.parse(`${packStdout || ''}`);
  const payload = Array.isArray(parsed) ? parsed[0] : parsed;
  const files = Array.isArray(payload && payload.files) ? payload.files : [];
  return files
    .map((entry) => entry && typeof entry.path === 'string' ? entry.path.replace(/\\/g, '/') : '')
    .filter(Boolean)
    .sort();
}

function evaluatePackageRuntimeAssets(projectPath = process.cwd(), options = {}, dependencies = {}) {
  const expectedScripts = Array.isArray(options.expectedScripts)
    ? options.expectedScripts.slice().sort()
    : collectRuntimeScriptFiles(projectPath, dependencies);
  const packResult = runPackDryRun(projectPath, dependencies);

  if (packResult.status !== 0) {
    const packError = `${packResult.stderr || ''}`.trim()
      || `${packResult.error || ''}`.trim()
      || 'unknown error';
    const violations = [`npm pack --dry-run failed: ${packError}`];
    return {
      exit_code: options.failOnViolation ? 1 : 0,
      passed: false,
      blocked: options.failOnViolation === true,
      violations,
      payload: {
        mode: 'npm-package-runtime-asset-check',
        project_path: projectPath,
        expected_script_count: expectedScripts.length,
        expected_scripts: expectedScripts,
        packed_script_count: 0,
        packed_scripts: [],
        missing_runtime_scripts: expectedScripts,
        pack_error: packError,
        passed: false
      }
    };
  }

  const packedFiles = extractPackedFilePaths(packResult.stdout);
  const packedScripts = packedFiles.filter((item) => item.startsWith('scripts/'));
  const packedScriptSet = new Set(packedScripts);
  const missingRuntimeScripts = expectedScripts.filter((item) => !packedScriptSet.has(item));
  const violations = missingRuntimeScripts.map((item) => `missing runtime script from npm package: ${item}`);
  const passed = violations.length === 0;
  const blocked = options.failOnViolation === true && !passed;

  return {
    exit_code: blocked ? 1 : 0,
    passed,
    blocked,
    violations,
    payload: {
      mode: 'npm-package-runtime-asset-check',
      project_path: projectPath,
      expected_script_count: expectedScripts.length,
      expected_scripts: expectedScripts,
      packed_script_count: packedScripts.length,
      packed_scripts: packedScripts,
      missing_runtime_scripts: missingRuntimeScripts,
      passed
    }
  };
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const result = evaluatePackageRuntimeAssets(options.projectPath, options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result.payload, null, 2)}\n`);
  } else if (result.passed) {
    process.stdout.write('[npm-package-runtime-assets] passed\n');
  } else {
    process.stdout.write('[npm-package-runtime-assets] blocked\n');
    result.violations.forEach((item) => process.stdout.write(`[npm-package-runtime-assets] violation=${item}\n`));
  }
  process.exit(result.exit_code);
}

module.exports = {
  collectRuntimeScriptFiles,
  evaluatePackageRuntimeAssets,
  extractPackedFilePaths,
  parseArgs,
  runPackDryRun
};
