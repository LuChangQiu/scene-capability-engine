#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const CODE_EXTENSIONS = new Set([
  '.js', '.cjs', '.mjs', '.jsx',
  '.ts', '.tsx',
  '.py',
  '.java',
  '.go',
  '.rb',
  '.php',
  '.cs'
]);

const DEFAULT_SCAN_DIRS = [
  'src',
  'lib',
  'scripts',
  'bin',
  'app',
  'server',
  'client',
  'packages',
  'tests'
];

const SKIP_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.idea',
  '.vscode',
  '.sce/reports'
]);

const THRESHOLD_PROFILES = Object.freeze({
  source: {
    floors: {
      assessment: 800,
      refactor: 1800
    },
    defaults: {
      assessment: 2000,
      refactor: 4000,
      redline: 10000
    }
  },
  test: {
    floors: {
      assessment: 1200,
      refactor: 3000
    },
    defaults: {
      assessment: 3000,
      refactor: 6000,
      redline: 15000
    }
  }
});

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    projectPath: process.cwd(),
    json: false,
    failOnRedline: false,
    out: null,
    scanDirs: DEFAULT_SCAN_DIRS.slice()
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
    if (token === '--fail-on-redline') {
      options.failOnRedline = true;
      continue;
    }
    if (token === '--out' && next) {
      options.out = path.resolve(next);
      index += 1;
      continue;
    }
    if (token === '--scan-dir' && next) {
      options.scanDirs.push(next.trim());
      index += 1;
      continue;
    }
  }

  options.scanDirs = Array.from(new Set(options.scanDirs.filter(Boolean)));
  return options;
}

function normalizePath(value) {
  return `${value || ''}`.replace(/\\/g, '/');
}

function shouldSkipDir(relativePath, entryName) {
  if (SKIP_DIRS.has(entryName)) {
    return true;
  }
  return SKIP_DIRS.has(normalizePath(relativePath));
}

function collectFilesRecursive(rootDir, relativeRoot = '') {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const results = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    const relativePath = normalizePath(path.join(relativeRoot, entry.name));
    if (entry.isDirectory()) {
      if (shouldSkipDir(relativePath, entry.name)) {
        continue;
      }
      results.push(...collectFilesRecursive(absolutePath, relativePath));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!CODE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }
    results.push({
      absolutePath,
      relativePath
    });
  }
  return results;
}

function classifyFile(relativePath) {
  const normalized = normalizePath(relativePath).toLowerCase();
  if (
    normalized.startsWith('tests/')
    || normalized.includes('/__tests__/')
    || normalized.includes('.test.')
    || normalized.includes('.spec.')
  ) {
    return 'test';
  }
  return 'source';
}

function countLines(content) {
  if (!content) {
    return 0;
  }
  return content.split(/\r?\n/).length;
}

function roundUp(value, step) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.ceil(value / step) * step;
}

function quantile(sortedValues, ratio) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
    return 0;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }
  const index = Math.max(0, Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * ratio) - 1));
  return sortedValues[index];
}

function buildStats(files) {
  const lineValues = files.map((item) => item.lines).sort((left, right) => left - right);
  const count = lineValues.length;
  return {
    count,
    max: count > 0 ? lineValues[count - 1] : 0,
    p50: quantile(lineValues, 0.5),
    p90: quantile(lineValues, 0.9),
    p95: quantile(lineValues, 0.95)
  };
}

function buildRecommendedThresholds(stats, profile) {
  const assessmentRaw = roundUp(Math.max(profile.floors.assessment, stats.p90 * 1.25), 50);
  const refactorRaw = roundUp(Math.max(profile.floors.refactor, stats.p95 * 1.35, assessmentRaw + 400), 50);

  const assessment = Math.min(profile.defaults.assessment, Math.max(profile.floors.assessment, assessmentRaw));
  const refactor = Math.min(profile.defaults.refactor, Math.max(profile.floors.refactor, refactorRaw, assessment + 400));
  const redline = profile.defaults.redline;

  return {
    assessment,
    refactor,
    redline
  };
}

function evaluateFile(lines, thresholds) {
  if (lines >= thresholds.redline) {
    return 'redline';
  }
  if (lines >= thresholds.refactor) {
    return 'refactor';
  }
  if (lines >= thresholds.assessment) {
    return 'assessment';
  }
  return 'ok';
}

function auditRefactorTriggers(options = {}) {
  const projectPath = path.resolve(options.projectPath || process.cwd());
  const scanDirs = Array.isArray(options.scanDirs) && options.scanDirs.length > 0
    ? options.scanDirs
    : DEFAULT_SCAN_DIRS;

  const files = Array.from(new Set(scanDirs))
    .flatMap((dirName) => collectFilesRecursive(path.join(projectPath, dirName), dirName))
    .map((file) => {
      const content = fs.readFileSync(file.absolutePath, 'utf8');
      const kind = classifyFile(file.relativePath);
      return {
        file: file.relativePath,
        kind,
        lines: countLines(content)
      };
    })
    .sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file));

  const sourceFiles = files.filter((item) => item.kind === 'source');
  const testFiles = files.filter((item) => item.kind === 'test');
  const sourceStats = buildStats(sourceFiles);
  const testStats = buildStats(testFiles);
  const sourceThresholds = buildRecommendedThresholds(sourceStats, THRESHOLD_PROFILES.source);
  const testThresholds = buildRecommendedThresholds(testStats, THRESHOLD_PROFILES.test);

  const evaluatedFiles = files.map((file) => {
    const thresholds = file.kind === 'test' ? testThresholds : sourceThresholds;
    return {
      ...file,
      thresholds,
      trigger: evaluateFile(file.lines, thresholds)
    };
  });

  const offenders = evaluatedFiles.filter((item) => item.trigger !== 'ok');
  const redline = offenders.filter((item) => item.trigger === 'redline');
  const refactor = offenders.filter((item) => item.trigger === 'refactor');
  const assessment = offenders.filter((item) => item.trigger === 'assessment');

  const recommendations = [
    'Run this audit weekly and before each release to recalibrate project-specific refactor trigger points.',
    'When no project-specific threshold is agreed yet, keep the SCE default source thresholds as the outer guardrail: 2000 / 4000 / 10000 lines.',
    redline.length > 0
      ? 'Redline files already exist; new non-emergency changes touching those files should prioritize decomposition instead of feature accretion.'
      : 'No redline file detected under the current recommended thresholds.'
  ];

  return {
    mode: 'refactor-trigger-audit',
    project_path: projectPath,
    passed: redline.length === 0,
    scan_dirs: scanDirs,
    scanned_file_count: files.length,
    cadence_recommendation: ['weekly', 'before_release'],
    thresholds: {
      source: sourceThresholds,
      test: testThresholds
    },
    stats: {
      source: sourceStats,
      test: testStats
    },
    summary: {
      offender_count: offenders.length,
      assessment_count: assessment.length,
      refactor_count: refactor.length,
      redline_count: redline.length
    },
    offenders: offenders.slice(0, 50),
    top_files: evaluatedFiles.slice(0, 20),
    recommendations
  };
}

function maybeWriteReport(result, outPath) {
  if (!outPath) {
    return;
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function printHumanReport(result) {
  console.log(
    `[refactor-trigger-audit] scanned=${result.scanned_file_count} offenders=${result.summary.offender_count} `
    + `assessment=${result.summary.assessment_count} refactor=${result.summary.refactor_count} redline=${result.summary.redline_count}`
  );
  console.log(
    `[refactor-trigger-audit] source-thresholds=${result.thresholds.source.assessment}/${result.thresholds.source.refactor}/${result.thresholds.source.redline} `
    + `test-thresholds=${result.thresholds.test.assessment}/${result.thresholds.test.refactor}/${result.thresholds.test.redline}`
  );
  if (result.summary.redline_count > 0) {
    result.offenders
      .filter((item) => item.trigger === 'redline')
      .slice(0, 10)
      .forEach((item) => {
        console.error(`[refactor-trigger-audit] redline ${item.kind} ${item.file} (${item.lines} lines)`);
      });
  }
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const result = auditRefactorTriggers(options);
  maybeWriteReport(result, options.out);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    printHumanReport(result);
  }

  if (options.failOnRedline && result.summary.redline_count > 0) {
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_SCAN_DIRS,
  THRESHOLD_PROFILES,
  auditRefactorTriggers,
  buildRecommendedThresholds,
  buildStats,
  classifyFile,
  parseArgs
};
