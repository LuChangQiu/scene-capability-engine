#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LEGACY_PATTERNS = [
  {
    label: 'legacy CLI alias',
    regex: /\bkse\b/gi
  },
  {
    label: 'legacy social handle',
    regex: /@kse_dev/gi
  },
  {
    label: 'legacy GitHub repository URL',
    regex: /https:\/\/github\.com\/heguangyong\/kiro-spec-engine/gi
  },
  {
    label: 'legacy template repository name',
    regex: /\bkse-spec-templates\b/gi
  },
  {
    label: 'legacy product naming',
    regex: /\bKiro Spec Engine\b|\bScene Capability Orchestrator\b|场景能力编排引擎/g
  },
  {
    label: 'legacy Kiro IDE wording',
    regex: /\bKiro IDE\b/gi
  },
  {
    label: 'legacy npm package name',
    regex: /\bsco-engine\b/gi
  }
];

const EXCLUDE_PREFIXES = [
  '.sce/',
  'tests/fixtures/',
  'node_modules/'
];

const EXCLUDE_FILES = new Set([
  'scripts/check-branding-consistency.js'
]);

const HISTORY_ALLOW_PREFIXES = [
  'docs/releases/',
  'docs/zh/releases/'
];

const HISTORY_ALLOW_FILES = new Set([
  'CHANGELOG.md'
]);

const TEXT_EXTENSIONS = new Set([
  '.js', '.json', '.md', '.txt', '.yml', '.yaml'
]);

function getTrackedFiles() {
  const output = execSync('git ls-files', { encoding: 'utf8' });
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function shouldScan(filePath) {
  if (EXCLUDE_FILES.has(filePath)) {
    return false;
  }

  if (EXCLUDE_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

function isHistoryDocument(filePath) {
  return HISTORY_ALLOW_FILES.has(filePath)
    || HISTORY_ALLOW_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function scanFile(filePath) {
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (_error) {
    return [];
  }

  const hits = [];

  for (const pattern of LEGACY_PATTERNS) {
    const matches = content.match(pattern.regex);
    if (matches && matches.length > 0) {
      if (isHistoryDocument(filePath)) {
        continue;
      }
      hits.push({
        label: pattern.label,
        count: matches.length
      });
    }
  }

  return hits;
}

function main() {
  const files = getTrackedFiles().filter(shouldScan);
  const violations = [];

  for (const filePath of files) {
    const hits = scanFile(filePath);
    if (hits.length > 0) {
      violations.push({ filePath, hits });
    }
  }

  if (violations.length === 0) {
    console.log('Branding consistency check passed: no legacy naming references found.');
    return;
  }

  console.error('Branding consistency check failed. Found legacy naming references:');
  for (const violation of violations) {
    const summary = violation.hits
      .map((hit) => `${hit.label} x${hit.count}`)
      .join(', ');
    console.error(`- ${violation.filePath}: ${summary}`);
  }

  process.exit(1);
}

main();
