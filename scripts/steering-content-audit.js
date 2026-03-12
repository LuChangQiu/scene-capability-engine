#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const DEFAULT_GOVERNANCE = {
  review_cadence: 'weekly',
  stable_layers: [
    'CORE_PRINCIPLES.md',
    'ENVIRONMENT.md',
    'RULES_GUIDE.md'
  ],
  files: {
    'CORE_PRINCIPLES.md': {
      max_lines: 96,
      max_headings: 16,
      max_history_entries: 0,
      allow_spec_refs: false,
      allow_version_markers: false,
      allow_checklists: false
    },
    'ENVIRONMENT.md': {
      max_lines: 36,
      max_headings: 8,
      max_history_entries: 0,
      allow_spec_refs: false,
      allow_version_markers: false,
      allow_checklists: false
    },
    'CURRENT_CONTEXT.md': {
      max_lines: 24,
      max_headings: 6,
      max_history_entries: 3,
      allow_spec_refs: true,
      allow_version_markers: true,
      allow_checklists: false
    },
    'RULES_GUIDE.md': {
      max_lines: 36,
      max_headings: 8,
      max_history_entries: 0,
      allow_spec_refs: false,
      allow_version_markers: false,
      allow_checklists: false
    }
  },
  canonical_terms: {
    errorbook: {
      aliases: ['错题', '错题本'],
      guidance: 'Reuse the existing errorbook capability instead of inventing a parallel mistake-book mode in steering.'
    }
  },
  relocation_targets: {
    long_lived_principles: '.sce/steering/CORE_PRINCIPLES.md',
    project_operating_rules: '.sce/steering/ENVIRONMENT.md',
    active_delivery_context: '.sce/steering/CURRENT_CONTEXT.md',
    detailed_workflow_and_examples: 'docs/steering-governance.md',
    transient_task_state: '.sce/specs/<spec>/tasks.md',
    historical_decisions_and_evidence: '.sce/specs/<spec>/custom/'
  }
};

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    projectPath: process.cwd(),
    json: false,
    failOnError: false,
    failOnWarning: false,
    out: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--json') {
      options.json = true;
      continue;
    }
    if (value === '--fail-on-error') {
      options.failOnError = true;
      continue;
    }
    if (value === '--fail-on-warning') {
      options.failOnWarning = true;
      continue;
    }
    if (value === '--project-path') {
      options.projectPath = path.resolve(argv[index + 1] || process.cwd());
      index += 1;
      continue;
    }
    if (value === '--out') {
      options.out = path.resolve(argv[index + 1] || '');
      index += 1;
      continue;
    }
  }

  return options;
}

function mergeGovernance(manifestGovernance = {}) {
  const mergedFiles = { ...DEFAULT_GOVERNANCE.files };
  const manifestFiles = manifestGovernance.files || {};
  for (const [name, config] of Object.entries(manifestFiles)) {
    mergedFiles[name] = {
      ...(mergedFiles[name] || {}),
      ...(config || {})
    };
  }

  return {
    ...DEFAULT_GOVERNANCE,
    ...manifestGovernance,
    stable_layers: Array.isArray(manifestGovernance.stable_layers)
      ? manifestGovernance.stable_layers.slice()
      : DEFAULT_GOVERNANCE.stable_layers.slice(),
    canonical_terms: {
      ...DEFAULT_GOVERNANCE.canonical_terms,
      ...(manifestGovernance.canonical_terms || {})
    },
    relocation_targets: {
      ...DEFAULT_GOVERNANCE.relocation_targets,
      ...(manifestGovernance.relocation_targets || {})
    },
    files: mergedFiles
  };
}

function loadSteeringManifest(projectPath) {
  const steeringDir = path.join(projectPath, '.sce', 'steering');
  const manifestPath = path.join(steeringDir, 'manifest.yaml');
  let manifest = {};

  if (fs.existsSync(manifestPath)) {
    manifest = yaml.load(fs.readFileSync(manifestPath, 'utf8')) || {};
  }

  const governance = mergeGovernance(manifest.governance || {});
  const layers = manifest.layers || {
    core_principles: 'CORE_PRINCIPLES.md',
    environment: 'ENVIRONMENT.md',
    current_context: 'CURRENT_CONTEXT.md',
    rules_guide: 'RULES_GUIDE.md'
  };

  return {
    steeringDir,
    manifestPath,
    manifest,
    governance,
    layers
  };
}

function countMatches(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function collectMetrics(fileName, content) {
  const lines = content.split(/\r?\n/);
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

  return {
    file: fileName,
    lines: lines.length,
    words: content.trim().length === 0 ? 0 : content.trim().split(/\s+/).filter(Boolean).length,
    headings: countMatches(content, /^#{1,6}\s+/gm),
    historyEntries: countMatches(content, /^v\d+\.\d+(?:\.\d+)?\s+\|/gm),
    checklistItems: countMatches(content, /^\s*[-*]\s+\[[ xX]\]/gm),
    specRefs: countMatches(content, /\bSpec\s+\d+\b|\b\d{2,3}-\d{2}-[a-z0-9-]+\b/gi),
    versionMarkers: countMatches(content, /\bv\d+\.\d+(?:\.\d+)?\b/g),
    nonEmptyLines: nonEmptyLines.length
  };
}

function pushViolation(violations, severity, file, rule, message, suggestion) {
  violations.push({
    severity,
    file,
    rule,
    message,
    suggestion
  });
}

function auditSteeringContent(options = {}) {
  const projectPath = path.resolve(options.projectPath || process.cwd());
  const packageJsonPath = path.join(projectPath, 'package.json');
  const packageVersion = fs.existsSync(packageJsonPath)
    ? JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version
    : null;
  const loaded = loadSteeringManifest(projectPath);
  const {
    steeringDir,
    governance,
    layers
  } = loaded;

  const fileNames = Array.from(new Set(Object.values(layers)));
  const files = [];
  const violations = [];

  for (const fileName of fileNames) {
    const absolutePath = path.join(steeringDir, fileName);
    if (!fs.existsSync(absolutePath)) {
      pushViolation(
        violations,
        'error',
        fileName,
        'missing_file',
        `Missing steering layer file: ${fileName}`,
        `Restore ${fileName} under ${steeringDir}.`
      );
      continue;
    }

    const content = fs.readFileSync(absolutePath, 'utf8');
    const metrics = collectMetrics(fileName, content);
    const config = governance.files[fileName] || {};
    files.push({
      file: fileName,
      path: absolutePath,
      metrics,
      config
    });

    if (typeof config.max_lines === 'number' && metrics.lines > config.max_lines) {
      pushViolation(
        violations,
        'error',
        fileName,
        'line_budget_exceeded',
        `${fileName} has ${metrics.lines} lines, above the ${config.max_lines}-line budget.`,
        `Move detailed procedures or historical detail to ${governance.relocation_targets.detailed_workflow_and_examples} or a Spec archive.`
      );
    }

    if (typeof config.max_headings === 'number' && metrics.headings > config.max_headings) {
      pushViolation(
        violations,
        'warning',
        fileName,
        'heading_budget_exceeded',
        `${fileName} has ${metrics.headings} headings, above the ${config.max_headings}-heading budget.`,
        'Merge related sections and keep only durable decisions in steering.'
      );
    }

    if (typeof config.max_history_entries === 'number' && metrics.historyEntries > config.max_history_entries) {
      pushViolation(
        violations,
        'error',
        fileName,
        'history_budget_exceeded',
        `${fileName} contains ${metrics.historyEntries} historical version entries, above the ${config.max_history_entries}-entry budget.`,
        `Archive historical progress into ${governance.relocation_targets.historical_decisions_and_evidence}.`
      );
    }

    if (config.allow_checklists === false && metrics.checklistItems > 0) {
      pushViolation(
        violations,
        'error',
        fileName,
        'task_checklist_in_steering',
        `${fileName} contains ${metrics.checklistItems} checklist item(s).`,
        `Move executable task state into ${governance.relocation_targets.transient_task_state}.`
      );
    }

    if (config.allow_spec_refs === false && metrics.specRefs > 0) {
      pushViolation(
        violations,
        'warning',
        fileName,
        'spec_reference_in_stable_layer',
        `${fileName} contains ${metrics.specRefs} Spec or spec-id reference(s).`,
        `Move volatile delivery detail into ${governance.relocation_targets.active_delivery_context} or a Spec archive.`
      );
    }

    if (config.allow_version_markers === false && metrics.versionMarkers > 0) {
      pushViolation(
        violations,
        'warning',
        fileName,
        'version_marker_in_stable_layer',
        `${fileName} contains ${metrics.versionMarkers} version marker(s).`,
        'Remove release-history footers from stable steering layers; keep version tracking in CHANGELOG or release notes.'
      );
    }

    if (fileName === 'CURRENT_CONTEXT.md' && packageVersion) {
      const versionMatch = content.match(/\*\*版本\*\*:\s*`([^`]+)`/);
      if (versionMatch && versionMatch[1].trim() !== packageVersion) {
        pushViolation(
          violations,
          'warning',
          fileName,
          'stale_context_version',
          `CURRENT_CONTEXT.md tracks version ${versionMatch[1].trim()} but package.json is ${packageVersion}.`,
          'Refresh CURRENT_CONTEXT.md after version bumps or release completion.'
        );
      }
    }

    for (const [canonicalName, definition] of Object.entries(governance.canonical_terms || {})) {
      const aliases = Array.isArray(definition.aliases) ? definition.aliases : [];
      for (const alias of aliases) {
        const escaped = `${alias}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const aliasCount = countMatches(content, new RegExp(escaped, 'g'));
        if (aliasCount > 0) {
          pushViolation(
            violations,
            'warning',
            fileName,
            'non_canonical_mechanism_alias',
            `${fileName} uses non-canonical mechanism alias "${alias}" (${aliasCount} occurrence(s)); canonical term is "${canonicalName}".`,
            definition.guidance || `Use the canonical term "${canonicalName}" and reference the existing SCE capability.`
          );
        }
      }
    }
  }

  const errorCount = violations.filter((item) => item.severity === 'error').length;
  const warningCount = violations.filter((item) => item.severity === 'warning').length;

  return {
    mode: 'steering-content-audit',
    passed: errorCount === 0,
    project_path: projectPath,
    steering_path: steeringDir,
    review_cadence: governance.review_cadence,
    error_count: errorCount,
    warning_count: warningCount,
    files: files.map((entry) => ({
      file: entry.file,
      metrics: entry.metrics,
      config: entry.config
    })),
    violations
  };
}

function printHumanReport(result) {
  if (result.violations.length === 0) {
    console.log('Steering content audit passed: steering layers are within hygiene budgets.');
    return;
  }

  console.error(`Steering content audit found ${result.error_count} error(s) and ${result.warning_count} warning(s).`);
  for (const violation of result.violations) {
    console.error(`- [${violation.severity}] ${violation.file} / ${violation.rule}: ${violation.message}`);
    if (violation.suggestion) {
      console.error(`  suggestion: ${violation.suggestion}`);
    }
  }
}

function maybeWriteReport(outputPath, result) {
  if (!outputPath) {
    return;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const result = auditSteeringContent(options);
  maybeWriteReport(options.out, result);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    printHumanReport(result);
  }

  if ((options.failOnWarning && result.warning_count > 0) || (options.failOnError && result.error_count > 0)) {
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_GOVERNANCE,
  auditSteeringContent,
  loadSteeringManifest,
  parseArgs
};
