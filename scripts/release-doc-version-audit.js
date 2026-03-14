#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const RELEASE_DOCS = [
  {
    file: 'README.md',
    label: 'README.md',
    versionField: 'Version',
    versionPattern: /\*\*Version\*\*:\s*([^\s]+)/,
    updatedField: 'Last Updated',
    updatedPattern: /\*\*Last Updated\*\*:\s*(\d{4}-\d{2}-\d{2})/
  },
  {
    file: 'README.zh.md',
    label: 'README.zh.md',
    versionField: '版本',
    versionPattern: /\*\*版本\*\*[：:]\s*([^\s]+)/,
    updatedField: '最后更新',
    updatedPattern: /\*\*最后更新\*\*[：:]\s*(\d{4}-\d{2}-\d{2})/
  },
  {
    file: '.sce/README.md',
    label: '.sce/README.md',
    versionField: 'sce Version',
    versionPattern: /\*\*sce Version\*\*:\s*([^\s]+)/,
    updatedField: 'Last Updated',
    updatedPattern: /\*\*Last Updated\*\*:\s*(\d{4}-\d{2}-\d{2})/,
    forbidVersionedHeadings: true
  },
  {
    file: 'template/.sce/README.md',
    label: 'template/.sce/README.md',
    versionField: 'sce Version',
    versionPattern: /\*\*sce Version\*\*:\s*([^\s]+)/,
    updatedField: 'Last Updated',
    updatedPattern: /\*\*Last Updated\*\*:\s*(\d{4}-\d{2}-\d{2})/,
    forbidVersionedHeadings: true
  }
];

const VERSIONED_HEADING_PATTERN = /^#{1,6}\s+.*\((?:v)?\d+\.\d+(?:\.\d+|\.x)\)\s*$/gm;
const CHANGELOG_RELEASE_PATTERN = /^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})(?:\s.*)?$/gm;

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    projectPath: process.cwd(),
    json: false,
    failOnError: false,
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

function pushViolation(violations, file, rule, message, suggestion) {
  violations.push({
    severity: 'error',
    file,
    rule,
    message,
    suggestion
  });
}

function loadPackageVersion(projectPath, violations) {
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    pushViolation(
      violations,
      'package.json',
      'missing_package_json',
      'package.json is required to resolve the current release version.',
      'Restore package.json before running the release doc audit.'
    );
    return null;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return typeof packageJson.version === 'string' ? packageJson.version.trim() : null;
}

function extractLatestChangelogRelease(changelogContent) {
  CHANGELOG_RELEASE_PATTERN.lastIndex = 0;
  let match = CHANGELOG_RELEASE_PATTERN.exec(changelogContent);
  if (!match) {
    return null;
  }

  return {
    version: match[1].trim(),
    date: match[2].trim()
  };
}

function loadLatestChangelogRelease(projectPath, packageVersion, violations) {
  const changelogPath = path.join(projectPath, 'CHANGELOG.md');
  if (!fs.existsSync(changelogPath)) {
    pushViolation(
      violations,
      'CHANGELOG.md',
      'missing_changelog',
      'CHANGELOG.md is required to resolve the latest release date.',
      'Restore CHANGELOG.md before running the release doc audit.'
    );
    return null;
  }

  const changelogContent = fs.readFileSync(changelogPath, 'utf8');
  const latestRelease = extractLatestChangelogRelease(changelogContent);
  if (!latestRelease) {
    pushViolation(
      violations,
      'CHANGELOG.md',
      'missing_release_entry',
      'Could not find a released version entry in CHANGELOG.md.',
      'Add a release entry like `## [x.y.z] - YYYY-MM-DD` before publishing.'
    );
    return null;
  }

  if (packageVersion && latestRelease.version !== packageVersion) {
    pushViolation(
      violations,
      'CHANGELOG.md',
      'stale_latest_release_entry',
      `CHANGELOG.md latest release is ${latestRelease.version} but package.json is ${packageVersion}.`,
      'Update the top released CHANGELOG entry so version and release date match package.json.'
    );
  }

  return latestRelease;
}

function extractField(content, pattern) {
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

function collectVersionedHeadings(content) {
  const matches = [];
  let match = VERSIONED_HEADING_PATTERN.exec(content);
  while (match) {
    matches.push(match[0].trim());
    match = VERSIONED_HEADING_PATTERN.exec(content);
  }
  VERSIONED_HEADING_PATTERN.lastIndex = 0;
  return matches;
}

function auditReleaseDocs(options = {}) {
  const projectPath = path.resolve(options.projectPath || process.cwd());
  const violations = [];
  const packageVersion = loadPackageVersion(projectPath, violations);
  const latestRelease = loadLatestChangelogRelease(projectPath, packageVersion, violations);
  const expectedVersion = packageVersion;
  const expectedDate = latestRelease ? latestRelease.date : null;
  const documents = [];

  for (const doc of RELEASE_DOCS) {
    const absolutePath = path.join(projectPath, doc.file);
    if (!fs.existsSync(absolutePath)) {
      pushViolation(
        violations,
        doc.file,
        'missing_release_doc',
        `${doc.file} is missing.`,
        `Restore ${doc.file} so release metadata stays auditable.`
      );
      continue;
    }

    const content = fs.readFileSync(absolutePath, 'utf8');
    const actualVersion = extractField(content, doc.versionPattern);
    const actualUpdated = extractField(content, doc.updatedPattern);
    const versionedHeadings = doc.forbidVersionedHeadings
      ? collectVersionedHeadings(content)
      : [];

    if (!actualVersion) {
      pushViolation(
        violations,
        doc.file,
        'missing_doc_version_field',
        `${doc.file} is missing the "${doc.versionField}" footer field.`,
        `Add a "${doc.versionField}" footer line that matches package.json version ${expectedVersion || '<unknown>'}.`
      );
    } else if (expectedVersion && actualVersion !== expectedVersion) {
      pushViolation(
        violations,
        doc.file,
        'stale_doc_version',
        `${doc.file} tracks version ${actualVersion} but package.json is ${expectedVersion}.`,
        `Refresh ${doc.file} so "${doc.versionField}" matches ${expectedVersion}.`
      );
    }

    if (!actualUpdated) {
      pushViolation(
        violations,
        doc.file,
        'missing_doc_updated_field',
        `${doc.file} is missing the "${doc.updatedField}" footer field.`,
        `Add a "${doc.updatedField}" footer line that matches the latest CHANGELOG release date ${expectedDate || '<unknown>'}.`
      );
    } else if (expectedDate && actualUpdated !== expectedDate) {
      pushViolation(
        violations,
        doc.file,
        'stale_doc_updated_date',
        `${doc.file} last updated date is ${actualUpdated} but latest CHANGELOG release date is ${expectedDate}.`,
        `Refresh ${doc.file} so "${doc.updatedField}" matches ${expectedDate}.`
      );
    }

    if (versionedHeadings.length > 0) {
      pushViolation(
        violations,
        doc.file,
        'versioned_capability_headings',
        `${doc.file} contains version-stamped headings: ${versionedHeadings.join(' | ')}.`,
        'Remove release/version markers from long-lived README headings and keep current version tracking only in the footer.'
      );
    }

    documents.push({
      file: doc.file,
      path: absolutePath,
      actual_version: actualVersion,
      expected_version: expectedVersion,
      actual_updated: actualUpdated,
      expected_updated: expectedDate,
      versioned_heading_count: versionedHeadings.length
    });
  }

  return {
    mode: 'release-doc-version-audit',
    passed: violations.length === 0,
    project_path: projectPath,
    package_version: packageVersion,
    changelog_release: latestRelease,
    error_count: violations.length,
    documents,
    violations
  };
}

function printHumanReport(result) {
  if (result.violations.length === 0) {
    console.log('Release doc version audit passed: README release metadata matches package.json and CHANGELOG.');
    return;
  }

  console.error(`Release doc version audit found ${result.error_count} error(s).`);
  for (const violation of result.violations) {
    console.error(`- ${violation.file} / ${violation.rule}: ${violation.message}`);
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
  const result = auditReleaseDocs(options);
  maybeWriteReport(options.out, result);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    printHumanReport(result);
  }

  if (options.failOnError && result.error_count > 0) {
    process.exit(1);
  }
}

module.exports = {
  RELEASE_DOCS,
  auditReleaseDocs,
  extractLatestChangelogRelease,
  parseArgs
};
