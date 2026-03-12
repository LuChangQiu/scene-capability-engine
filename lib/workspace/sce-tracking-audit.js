const { execSync } = require('child_process');

const FIXTURE_ROOT = 'tests/fixtures/moqui-core-regression/workspace/.sce';
const REQUIRED_TRACKED_FILES = [
  `${FIXTURE_ROOT}/specs/60-10-moqui-core-order-query/custom/scene-package.json`,
  `${FIXTURE_ROOT}/specs/60-10-moqui-core-order-query/custom/scene.yaml`,
  `${FIXTURE_ROOT}/templates/scene-packages/sce.scene--erp-order-query-read--0.1.0/scene-package.json`,
];
const DISALLOWED_TRACKED_PREFIXES = [
  `${FIXTURE_ROOT}/reports/`,
  `${FIXTURE_ROOT}/auto/`,
];

function defaultGetTrackedFiles(repoRoot) {
  const output = execSync('git ls-files', {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function auditSceTracking(repoRoot = process.cwd(), dependencies = {}) {
  const getTrackedFiles = dependencies.getTrackedFiles || defaultGetTrackedFiles;
  const trackedFiles = getTrackedFiles(repoRoot)
    .map((filePath) => `${filePath}`.replace(/\\/g, '/'));
  const trackedSet = new Set(trackedFiles);

  const missingRequiredFiles = REQUIRED_TRACKED_FILES.filter((filePath) => !trackedSet.has(filePath));
  const fixtureTrackedFiles = trackedFiles.filter((filePath) => filePath.startsWith(`${FIXTURE_ROOT}/`));
  const fixtureSpecTrackedFiles = fixtureTrackedFiles.filter((filePath) => filePath.startsWith(`${FIXTURE_ROOT}/specs/`));
  const fixtureTemplateTrackedFiles = fixtureTrackedFiles.filter((filePath) => filePath.startsWith(`${FIXTURE_ROOT}/templates/`));
  const disallowedTrackedFiles = fixtureTrackedFiles.filter((filePath) =>
    DISALLOWED_TRACKED_PREFIXES.some((prefix) => filePath.startsWith(prefix))
  );

  const summary = {
    missing_required_files: missingRequiredFiles.length,
    fixture_spec_files: fixtureSpecTrackedFiles.length,
    fixture_template_files: fixtureTemplateTrackedFiles.length,
    disallowed_fixture_files: disallowedTrackedFiles.length
  };

  const passed =
    missingRequiredFiles.length === 0 &&
    fixtureSpecTrackedFiles.length > 0 &&
    fixtureTemplateTrackedFiles.length > 0 &&
    disallowedTrackedFiles.length === 0;

  return {
    mode: 'sce-tracking-audit',
    passed,
    root: repoRoot,
    required_files: REQUIRED_TRACKED_FILES,
    missing_required_files: missingRequiredFiles,
    fixture: {
      root: FIXTURE_ROOT,
      tracked_total: fixtureTrackedFiles.length,
      tracked_specs: fixtureSpecTrackedFiles,
      tracked_templates: fixtureTemplateTrackedFiles,
      disallowed_tracked_files: disallowedTrackedFiles
    },
    summary
  };
}

module.exports = {
  FIXTURE_ROOT,
  REQUIRED_TRACKED_FILES,
  DISALLOWED_TRACKED_PREFIXES,
  auditSceTracking
};
