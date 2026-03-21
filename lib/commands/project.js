const chalk = require('chalk');
const { inspectProjectCandidate } = require('../project/candidate-inspection-service');
const { buildProjectPortfolioProjection } = require('../project/portfolio-projection-service');
const { runProjectRootOnboardingImport } = require('../project/root-onboarding-service');
const { buildProjectSupervisionProjection } = require('../project/supervision-projection-service');
const { resolveProjectTarget } = require('../project/target-resolution-service');

async function runProjectPortfolioShowCommand(options = {}, dependencies = {}) {
  const payload = await buildProjectPortfolioProjection(options, dependencies);
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(chalk.blue('Project Portfolio'));
    console.log(`  Active Project: ${payload.activeProjectId || 'none'}`);
    console.log(`  Visible Projects: ${payload.projects.length}`);
  }
  return payload;
}

async function runProjectTargetResolveCommand(options = {}, dependencies = {}) {
  const payload = await resolveProjectTarget(options, dependencies);
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(chalk.blue('Project Target Resolve'));
    console.log(`  Status: ${payload.status}`);
    console.log(`  Resolved Project: ${payload.resolvedProjectId || 'none'}`);
  }
  return payload;
}

async function runProjectSupervisionShowCommand(options = {}, dependencies = {}) {
  const payload = await buildProjectSupervisionProjection(options, dependencies);
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(chalk.blue('Project Supervision'));
    console.log(`  Project: ${payload.projectId}`);
    console.log(`  Blocked: ${payload.summary.blockedCount}`);
    console.log(`  Handoff: ${payload.summary.handoffCount}`);
    console.log(`  Risk: ${payload.summary.riskCount}`);
  }
  return payload;
}

async function runProjectCandidateInspectCommand(options = {}, dependencies = {}) {
  const payload = await inspectProjectCandidate(options, dependencies);
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(chalk.blue('Project Candidate Inspection'));
    console.log(`  Root: ${payload.rootDir}`);
    console.log(`  Kind: ${payload.kind}`);
    console.log(`  Readiness: ${payload.readiness}`);
  }
  return payload;
}

async function runProjectOnboardingImportCommand(options = {}, dependencies = {}) {
  const payload = await runProjectRootOnboardingImport(options, dependencies);
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(chalk.blue('Project Onboarding Import'));
    console.log(`  Root: ${payload.preview ? payload.preview.rootDir : options.root}`);
    console.log(`  Success: ${payload.success ? 'yes' : 'no'}`);
    console.log(`  Portfolio Visibility: ${payload.publication ? payload.publication.status : 'unknown'}`);
    console.log(`  Workspace: ${payload.result && payload.result.workspaceId ? payload.result.workspaceId : 'none'}`);
  }
  return payload;
}

function safeRun(handler, options = {}, context = 'project command') {
  Promise.resolve(handler(options))
    .catch((error) => {
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: error.message }, null, 2));
      } else {
        console.error(chalk.red(`${context} failed:`), error.message);
      }
      process.exitCode = 1;
    });
}

function registerProjectCommands(program) {
  const project = program
    .command('project')
    .description('Inspect multi-project portfolio and routing projections');

  const portfolio = project
    .command('portfolio')
    .description('Inspect the caller-visible project portfolio');

  portfolio
    .command('show')
    .description('Show the canonical project portfolio projection')
    .option('--workspace <name>', 'Resolve caller context against one registered workspace')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runProjectPortfolioShowCommand, options, 'project portfolio show'));

  const target = project
    .command('target')
    .description('Resolve target project against the caller-visible portfolio');

  target
    .command('resolve')
    .description('Resolve one project target without mutating active workspace selection')
    .option('--request <text>', 'Routing request text')
    .option('--current-project <id>', 'Caller asserted current project id')
    .option('--workspace <name>', 'Resolve caller context against one registered workspace')
    .option('--device <id>', 'Opaque caller device id')
    .option('--tool-instance-id <id>', 'Opaque caller tool instance id')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runProjectTargetResolveCommand, options, 'project target resolve'));

  const candidate = project
    .command('candidate')
    .description('Inspect one local directory as a canonical project candidate');

  candidate
    .command('inspect')
    .description('Inspect one local root without inventing adapter-side heuristics')
    .requiredOption('--root <path>', 'Local root directory to inspect')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runProjectCandidateInspectCommand, options, 'project candidate inspect'));

  const onboarding = project
    .command('onboarding')
    .description('Import one local directory into the canonical project portfolio');

  onboarding
    .command('import')
    .description('Run root-based onboarding without app-bundle-first indirection')
    .requiredOption('--root <path>', 'Local root directory to import')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runProjectOnboardingImportCommand, options, 'project onboarding import'));

  const supervision = project
    .command('supervision')
    .description('Inspect project-scoped supervision projection');

  supervision
    .command('show')
    .description('Show project-scoped supervision summary and drillback items')
    .requiredOption('--project <id>', 'Visible project id')
    .option('--cursor <cursor>', 'Best-effort incremental checkpoint; full snapshot remains supported')
    .option('--json', 'Print machine-readable JSON output')
    .action((options) => safeRun(runProjectSupervisionShowCommand, options, 'project supervision show'));
}

module.exports = {
  runProjectCandidateInspectCommand,
  runProjectOnboardingImportCommand,
  runProjectPortfolioShowCommand,
  runProjectTargetResolveCommand,
  runProjectSupervisionShowCommand,
  registerProjectCommands
};
