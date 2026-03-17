const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { runOrchestration } = require('./orchestrate');
const {
  parseSpecTargets,
  runMultiSpecViaOrchestrate
} = require('../spec/multi-spec-orchestrate');

const { PipelineStateStore } = require('../spec/pipeline/state-store');
const { StageRunner } = require('../spec/pipeline/stage-runner');
const { createDefaultStageAdapters } = require('../spec/pipeline/stage-adapters');
const { SessionStore } = require('../runtime/session-store');
const { resolveSpecSceneBinding } = require('../runtime/scene-session-binding');
const { bindMultiSpecSceneSession } = require('../runtime/multi-spec-scene-session');
const { buildStrategyAssessment, emitStrategyAdvisory } = require('./spec-gate');

async function runSpecPipeline(options = {}, dependencies = {}) {
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const sessionStore = dependencies.sessionStore || new SessionStore(projectPath);
  const specTargets = parseSpecTargets(options);
  if (specTargets.length === 0) {
    throw new Error('Either --spec or --specs is required');
  }

  if (specTargets.length > 1) {
    const executeOrchestration = dependencies.runOrchestration || runOrchestration;
    return bindMultiSpecSceneSession({
      specTargets,
      sceneId: options.scene,
      commandName: 'spec-pipeline',
      commandLabel: 'Multi-spec pipeline',
      commandOptions: options,
      runViaOrchestrate: () => runMultiSpecViaOrchestrate({
        specTargets,
        projectPath,
        commandOptions: options,
        runOrchestration: executeOrchestration,
        commandLabel: 'Multi-spec pipeline',
        nextActionLabel: 'Multi-spec execution defaulted to orchestrate mode.'
      })
    }, {
      projectPath,
      fileSystem,
      sessionStore
    });
  }

  const specId = specTargets[0];

  const specPath = path.join(projectPath, '.sce', 'specs', specId);
  if (!await fileSystem.pathExists(specPath)) {
    throw new Error(`Spec not found: ${specId}`);
  }

  const sceneBinding = await resolveSpecSceneBinding({
    sceneId: options.scene,
    allowNoScene: false
  }, {
    projectPath,
    fileSystem,
    sessionStore
  });

  let specSession = null;
  if (sceneBinding && !options.dryRun) {
    const linked = await sessionStore.startSpecSession({
      sceneId: sceneBinding.scene_id,
      specId,
      objective: `Spec pipeline: ${specId}`
    });
    specSession = linked.spec_session;
  }

  const stateStore = dependencies.stateStore || new PipelineStateStore(projectPath);
  const adapters = dependencies.adapters || createDefaultStageAdapters(projectPath);
  const stageRunner = dependencies.stageRunner || new StageRunner({
    stateStore,
    adapters
  });

  let state;
  if (options.resume) {
    state = await stateStore.loadLatest(specId);
  }

  if (!state) {
    state = await stateStore.create(specId, {
      failFast: options.failFast !== false,
      continueOnWarning: !!options.continueOnWarning
    });
  }

  const runContext = {
    specId,
    runId: state.run_id,
    fromStage: options.fromStage,
    toStage: options.toStage,
    dryRun: !!options.dryRun,
    resume: !!options.resume,
    failFast: options.failFast !== false,
    continueOnWarning: !!options.continueOnWarning,
    strict: !!options.strict,
    gateOut: options.gateOut,
    state
  };

  let execution;
  try {
    execution = await stageRunner.run(runContext);
  } catch (error) {
    if (specSession) {
      await sessionStore.completeSpecSession({
        specSessionRef: specSession.session_id,
        status: 'failed',
        summary: `Spec pipeline failed: ${specId}`,
        payload: {
          command: 'spec-pipeline',
          spec: specId,
          error: error.message
        }
      });
    }
    throw error;
  }
  await stateStore.markFinished(state, execution.status);

  const result = {
    spec_id: specId,
    run_id: state.run_id,
    status: execution.status,
    stage_results: execution.stageResults,
    failure: execution.failure,
    strategy_assessment: await buildStrategyAssessment(specId, {
      projectPath,
      fileSystem,
      strategyAssessor: dependencies.strategyAssessor
    }),
    next_actions: buildNextActions(execution),
    state_file: path.relative(projectPath, stateStore.getRunPath(specId, state.run_id)),
    scene_session: sceneBinding
      ? {
        bound: true,
        scene_id: sceneBinding.scene_id,
        scene_cycle: sceneBinding.scene_cycle,
        scene_session_id: sceneBinding.scene_session_id,
        spec_session_id: specSession ? specSession.session_id : null,
        binding_source: sceneBinding.source
      }
      : {
        bound: false
      }
  };

  if (specSession) {
    await sessionStore.completeSpecSession({
      specSessionRef: specSession.session_id,
      status: execution.status === 'completed' ? 'completed' : 'failed',
      summary: `Spec pipeline ${execution.status}: ${specId}`,
      payload: {
        command: 'spec-pipeline',
        spec: specId,
        run_id: state.run_id,
        pipeline_status: execution.status,
        failure: execution.failure || null,
        strategy_decision: result.strategy_assessment ? result.strategy_assessment.decision : null
      }
    });
  }

  if (options.out) {
    const outPath = path.isAbsolute(options.out)
      ? options.out
      : path.join(projectPath, options.out);
    await fs.ensureDir(path.dirname(outPath));
    await fs.writeJson(outPath, result, { spaces: 2 });
    result.output_file = outPath;
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printResult(result);
    emitStrategyAdvisory(result.strategy_assessment, options);
  }

  return result;
}

function registerSpecPipelineCommand(program) {
  const pipeline = program
    .command('spec-pipeline')
    .description('Run Spec workflow pipeline (use: sce spec pipeline run)');

  pipeline
    .command('run')
    .description('Execute pipeline stages for one or more Specs')
    .option('--spec <name>', 'Single Spec identifier')
    .option('--specs <names>', 'Comma-separated Spec identifiers (multi-spec defaults to orchestrate mode)')
    .option('--scene <scene-id>', 'Bind this spec pipeline run as a child session of an active scene')
    .option('--from-stage <stage>', 'Start stage (requirements/design/tasks/gate)')
    .option('--to-stage <stage>', 'End stage (requirements/design/tasks/gate)')
    .option('--resume', 'Resume from latest unfinished stage state')
    .option('--dry-run', 'Preview pipeline execution without writing stage outputs')
    .option('--json', 'Output machine-readable JSON')
    .option('--out <path>', 'Write pipeline result JSON to file')
    .option('--max-parallel <n>', 'Maximum parallel agents when orchestrate mode is used', parseInt)
    .option('--continue-on-warning', 'Continue when stage returns warnings')
    .option('--no-fail-fast', 'Do not stop immediately on failed stage')
    .option('--strict', 'Enable strict mode for downstream gate stage')
    .option('--gate-out <path>', 'Output path for nested gate stage report')
    .action(async options => {
      try {
        await runSpecPipeline(options);
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: error.message }, null, 2));
        } else {
          console.error(chalk.red('❌ Spec pipeline failed:'), error.message);
        }
        process.exit(1);
      }
    });
}

function printResult(result) {
  const statusColor = result.status === 'completed' ? chalk.green : chalk.red;

  console.log(chalk.red('🔥') + ' Spec Workflow Pipeline');
  console.log();
  console.log(`${chalk.gray('Spec:')} ${result.spec_id}`);
  console.log(`${chalk.gray('Run:')} ${result.run_id}`);
  console.log(`${chalk.gray('Status:')} ${statusColor(result.status)}`);
  console.log();

  console.log(chalk.bold('Stage Results'));
  result.stage_results.forEach(stage => {
    const icon = stage.status === 'completed'
      ? chalk.green('✓')
      : stage.status === 'warning'
        ? chalk.yellow('!')
        : stage.status === 'skipped'
          ? chalk.gray('→')
          : chalk.red('✗');
    console.log(`  ${icon} ${stage.name}: ${stage.status}`);
  });

  if (result.next_actions.length > 0) {
    console.log();
    console.log(chalk.bold('Next Actions'));
    result.next_actions.forEach(action => console.log(`  - ${action}`));
  }
}

function buildNextActions(execution) {
  if (execution.status === 'completed') {
    return ['Review pipeline output and continue implementation on completed Spec stages.'];
  }

  if (execution.failure && execution.failure.stage) {
    return [
      `Resolve failure at stage: ${execution.failure.stage}`,
      'Use --resume to continue from the last unfinished stage after remediation.'
    ];
  }

  return ['Inspect stage_results for failure details and re-run pipeline.'];
}

async function _runPipelineInOrchestrateMode(specTargets, options, dependencies) {
  const projectPath = dependencies.projectPath || process.cwd();
  const executeOrchestration = dependencies.runOrchestration || runOrchestration;

  return runMultiSpecViaOrchestrate({
    specTargets,
    projectPath,
    commandOptions: options,
    runOrchestration: executeOrchestration,
    commandLabel: 'Multi-spec pipeline',
    nextActionLabel: 'Multi-spec execution defaulted to orchestrate mode.'
  });
}

function _parseSpecTargets(options = {}) {
  return parseSpecTargets(options);
}

module.exports = {
  registerSpecPipelineCommand,
  runSpecPipeline,
  _parseSpecTargets
};
