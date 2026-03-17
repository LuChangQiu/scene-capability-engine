const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { runOrchestration } = require('./orchestrate');
const {
  parseSpecTargets,
  runMultiSpecViaOrchestrate
} = require('../spec/multi-spec-orchestrate');

const { PolicyLoader } = require('../spec-gate/policy/policy-loader');
const { RuleRegistry } = require('../spec-gate/rules/rule-registry');
const { createDefaultRules } = require('../spec-gate/rules/default-rules');
const { GateEngine } = require('../spec-gate/engine/gate-engine');
const { ResultEmitter } = require('../spec-gate/result-emitter');
const { SessionStore } = require('../runtime/session-store');
const { resolveSpecSceneBinding } = require('../runtime/scene-session-binding');
const { bindMultiSpecSceneSession } = require('../runtime/multi-spec-scene-session');
const { assessComplexityStrategy } = require('../spec/complexity-strategy');

async function runSpecGate(options = {}, dependencies = {}) {
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
      commandName: 'spec-gate',
      commandLabel: 'Multi-spec gate',
      commandOptions: options,
      runViaOrchestrate: () => runMultiSpecViaOrchestrate({
        specTargets,
        projectPath,
        commandOptions: options,
        runOrchestration: executeOrchestration,
        commandLabel: 'Multi-spec gate',
        nextActionLabel: 'Multi-spec gate execution defaulted to orchestrate mode.'
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
  const linked = await sessionStore.startSpecSession({
    sceneId: sceneBinding.scene_id,
    specId,
    objective: `Spec gate: ${specId}`
  });
  const specSession = linked.spec_session;

  const policyLoader = dependencies.policyLoader || new PolicyLoader(projectPath);
  try {
    const policy = dependencies.policy || await policyLoader.load({
      policy: options.policy,
      strict: options.strict
    });

    const registry = dependencies.registry || new RuleRegistry(createDefaultRules(projectPath));
    const engine = dependencies.engine || new GateEngine({
      registry,
      policy
    });

    const gateResult = await engine.evaluate({ specId });
    const result = {
      ...gateResult,
      strategy_assessment: await buildStrategyAssessment(specId, {
        projectPath,
        fileSystem,
        strategyAssessor: dependencies.strategyAssessor
      })
    };
    const emitter = dependencies.emitter || new ResultEmitter(projectPath);
    const emitted = await emitter.emit(result, {
      json: options.json,
      out: options.out,
      silent: options.silent
    });
    emitStrategyAdvisory(result.strategy_assessment, options);

    const decisionStatus = result.decision === 'no-go' ? 'failed' : 'completed';
    await sessionStore.completeSpecSession({
      specSessionRef: specSession.session_id,
      status: decisionStatus,
      summary: `Spec gate ${result.decision}: ${specId}`,
      payload: {
        command: 'spec-gate',
        spec: specId,
        decision: result.decision,
        score: result.score,
        report_path: emitted.outputPath || null,
        strategy_decision: result.strategy_assessment ? result.strategy_assessment.decision : null
      }
    });

    return {
      ...result,
      report_path: emitted.outputPath,
      scene_session: {
        bound: true,
        scene_id: sceneBinding.scene_id,
        scene_cycle: sceneBinding.scene_cycle,
        scene_session_id: sceneBinding.scene_session_id,
        spec_session_id: specSession.session_id,
        binding_source: sceneBinding.source
      }
    };
  } catch (error) {
    await sessionStore.completeSpecSession({
      specSessionRef: specSession.session_id,
      status: 'failed',
      summary: `Spec gate failed: ${specId}`,
      payload: {
        command: 'spec-gate',
        spec: specId,
        error: error.message
      }
    });
    throw error;
  }
}

async function buildStrategyAssessment(specId, dependencies = {}) {
  const assess = dependencies.strategyAssessor || assessComplexityStrategy;
  try {
    return await assess({
      spec: specId
    }, {
      projectPath: dependencies.projectPath,
      fileSystem: dependencies.fileSystem
    });
  } catch (error) {
    return {
      decision: 'assessment-unavailable',
      decision_reason: error.message,
      advisory_only: true
    };
  }
}

function emitStrategyAdvisory(strategyAssessment, options = {}) {
  if (!strategyAssessment || options.json || options.silent) {
    return;
  }

  if (!['multi-spec-program', 'research-program'].includes(strategyAssessment.decision)) {
    return;
  }

  console.log();
  console.log(chalk.yellow('⚠ Strategy Advisory'));
  console.log(`  ${strategyAssessment.decision}: ${strategyAssessment.decision_reason}`);
  if (Array.isArray(strategyAssessment.next_actions)) {
    strategyAssessment.next_actions.forEach(action => {
      console.log(`  - ${action}`);
    });
  }
}

async function generateSpecGatePolicyTemplate(options = {}, dependencies = {}) {
  const projectPath = dependencies.projectPath || process.cwd();
  const loader = dependencies.policyLoader || new PolicyLoader(projectPath);
  const template = loader.getTemplate();

  const outputPath = options.out
    ? (path.isAbsolute(options.out) ? options.out : path.join(projectPath, options.out))
    : path.join(projectPath, '.sce', 'config', 'spec-gate-policy.template.json');

  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeJson(outputPath, template, { spaces: 2 });

  if (!options.silent) {
    console.log(chalk.green('✅ Spec gate policy template generated:'));
    console.log(`  ${outputPath}`);
  }

  return {
    success: true,
    outputPath
  };
}

function registerSpecGateCommand(program) {
  const specGate = program
    .command('spec-gate')
    .description('Run standardized Spec gate checks (use: sce spec gate)');

  specGate
    .command('run')
    .description('Execute gate checks for one or more Specs')
    .option('--spec <name>', 'Single Spec identifier')
    .option('--specs <names>', 'Comma-separated Spec identifiers (multi-spec defaults to orchestrate mode)')
    .option('--scene <scene-id>', 'Bind this spec gate run as a child session of an active scene')
    .option('--policy <path>', 'Policy JSON path')
    .option('--strict', 'Enable strict mode override')
    .option('--json', 'Output machine-readable JSON')
    .option('--out <path>', 'Write JSON result to file')
    .option('--max-parallel <n>', 'Maximum parallel agents when orchestrate mode is used', parseInt)
    .action(async options => {
      try {
        await runSpecGate(options);
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: error.message }, null, 2));
        } else {
          console.error(chalk.red('❌ Spec gate failed:'), error.message);
        }
        process.exit(1);
      }
    });

  specGate
    .command('policy-template')
    .description('Generate policy template JSON for Spec gate')
    .option('--out <path>', 'Template output path')
    .action(async options => {
      try {
        await generateSpecGatePolicyTemplate(options);
      } catch (error) {
        console.error(chalk.red('❌ Failed to generate policy template:'), error.message);
        process.exit(1);
      }
    });
}

async function _runGateInOrchestrateMode(specTargets, options, dependencies) {
  const projectPath = dependencies.projectPath || process.cwd();
  const executeOrchestration = dependencies.runOrchestration || runOrchestration;

  return runMultiSpecViaOrchestrate({
    specTargets,
    projectPath,
    commandOptions: options,
    runOrchestration: executeOrchestration,
    commandLabel: 'Multi-spec gate',
    nextActionLabel: 'Multi-spec gate execution defaulted to orchestrate mode.'
  });
}

function _parseSpecTargets(options = {}) {
  return parseSpecTargets(options);
}

module.exports = {
  registerSpecGateCommand,
  runSpecGate,
  generateSpecGatePolicyTemplate,
  _parseSpecTargets,
  buildStrategyAssessment,
  emitStrategyAdvisory
};
