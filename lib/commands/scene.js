const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const fs = require('fs-extra');
const chalk = require('chalk');
const yaml = require('js-yaml');

const semver = require('semver');
const SceneLoader = require('../scene-runtime/scene-loader');
const PlanCompiler = require('../scene-runtime/plan-compiler');
const PolicyGate = require('../scene-runtime/policy-gate');
const RuntimeExecutor = require('../scene-runtime/runtime-executor');
const EvalBridge = require('../scene-runtime/eval-bridge');
const MoquiClient = require('../scene-runtime/moqui-client');
const { loadAdapterConfig, validateAdapterConfig } = require('../scene-runtime/moqui-adapter');
const { runExtraction, SUPPORTED_PATTERNS: EXTRACTOR_SUPPORTED_PATTERNS } = require('../scene-runtime/moqui-extractor');
const { lintScenePackage, calculateQualityScore } = require('../scene-runtime/scene-template-linter');
const {
  VALID_RELATION_TYPES,
  buildOntologyFromManifest,
  validateOntology,
  queryDependencyChain,
  findImpactRadius,
  findRelationPath,
  getActionInfo,
  parseDataLineage,
  getLineageInfo,
  getAgentHints,
  evaluateOntologySemanticQuality
} = require('../scene-runtime/scene-ontology');

const RUN_MODES = new Set(['dry_run', 'commit']);
const SCAFFOLD_TYPES = new Set(['erp', 'hybrid']);
const TASK_PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);
const EVAL_CONFIG_TEMPLATE_PROFILES = new Set(['default', 'erp', 'ops', 'robot']);
const ROUTE_POLICY_TEMPLATE_PROFILES = new Set(['default', 'erp', 'hybrid', 'robot']);
const ROUTE_POLICY_SUGGEST_MAX_ADJUSTMENT_DEFAULT = 6;
const SCENE_ROUTE_POLICY_ROLLOUT_DEFAULT_DIR = '.sce/releases/scene-route-policy';
const SCENE_ROUTE_POLICY_DIFF_KEYS = [
  'weights.valid_manifest',
  'weights.invalid_manifest',
  'weights.scene_ref_exact',
  'weights.scene_ref_contains',
  'weights.scene_ref_mismatch',
  'weights.query_token_match',
  'mode_bias.commit.low',
  'mode_bias.commit.medium',
  'mode_bias.commit.high',
  'mode_bias.commit.critical',
  'max_alternatives'
];
const SCENE_PACKAGE_API_VERSION = 'sce.scene.package/v0.1';
const SCENE_PACKAGE_KINDS = new Set([
  'scene-template',
  'scene-instance',
  'scene-capability',
  'scene-domain-profile',
  'scene-policy-profile'
]);
const SCENE_PACKAGE_RISK_LEVELS = new Set(['low', 'medium', 'high', 'critical']);
const SCENE_PACKAGE_TEMPLATE_API_VERSION = 'sce.scene.template/v0.1';
const SCENE_PACKAGE_TEMPLATE_DEFAULT_DIR = '.sce/templates/scene-packages';
const SCENE_MOQUI_BASELINE_DEFAULT_MATCH = '(moqui|erp|suite|playbook|runbook|decision|action|governance)';
const SCENE_MOQUI_BASELINE_DEFAULT_MIN_SCORE = 70;
const SCENE_MOQUI_BASELINE_DEFAULT_MIN_VALID_RATE = 100;
const SCENE_PACKAGE_BATCH_DEFAULT_ONTOLOGY_MIN_AVERAGE_SCORE = 70;
const SCENE_PACKAGE_BATCH_DEFAULT_ONTOLOGY_MIN_VALID_RATE = 100;
const SCENE_PACKAGE_GATE_API_VERSION = 'sce.scene.package-gate/v0.1';
const SCENE_PACKAGE_GATE_TEMPLATE_PROFILES = new Set(['baseline', 'three-layer']);
const SCENE_PACKAGE_KIND_LAYER_MAP = Object.freeze({
  'scene-capability': 'l1-capability',
  'scene-domain-profile': 'l2-domain',
  'scene-policy-profile': 'l2-domain',
  'scene-template': 'l3-instance',
  'scene-instance': 'l3-instance'
});
const SCENE_MANIFEST_DISCOVERY_CANDIDATES = [
  'custom/scene.yaml',
  'custom/scene.yml',
  'custom/scene.json',
  'scene.yaml',
  'scene.yml',
  'scene.json'
];
const SCENE_MANIFEST_DISCOVERY_MAX_DEPTH = 4;
const BUILTIN_SCAFFOLD_TEMPLATES = {
  erp: path.join(__dirname, '..', 'scene-runtime', 'templates', 'scene-template-erp-query-v0.1.yaml'),
  hybrid: path.join(__dirname, '..', 'scene-runtime', 'templates', 'scene-template-hybrid-shadow-v0.1.yaml')
};

const DEFAULT_EVAL_TASK_SYNC_POLICY = {
  default_priority: 'medium',
  priority_by_grade: {
    critical: 'high',
    at_risk: 'high',
    watch: 'medium',
    good: 'low',
    insufficient_data: 'medium'
  },
  keyword_priority_overrides: [
    {
      pattern: 'policy denial|denied|failed|violation|compensation',
      priority: 'high'
    },
    {
      pattern: 'manual takeover|manual_takeover',
      priority: 'medium'
    }
  ]
};
const DEFAULT_EVAL_PROFILE_INFERENCE_RULES = {
  domain_aliases: {
    erp: 'erp',
    ops: 'ops',
    robot: 'robot',
    hybrid: 'robot',
    sre: 'ops',
    devops: 'ops',
    infra: 'ops'
  },
  scene_ref_rules: [
    {
      pattern: '\b(robot|hybrid)\b',
      profile: 'robot'
    },
    {
      pattern: '\b(ops|sre|devops|infra|incident)\b',
      profile: 'ops'
    },
    {
      pattern: '\berp\b',
      profile: 'erp'
    }
  ]
};
const DEFAULT_SCENE_ROUTE_POLICY = {
  weights: {
    valid_manifest: 5,
    invalid_manifest: -10,
    scene_ref_exact: 100,
    scene_ref_contains: 45,
    scene_ref_mismatch: -20,
    query_token_match: 8
  },
  mode_bias: {
    commit: {
      low: 2,
      medium: 0,
      high: -5,
      critical: -5
    }
  },
  max_alternatives: 4
};

function createDoctorTraceId() {
  return `doctor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function registerSceneCommands(program) {
  const sceneCmd = program
    .command('scene')
    .description('Execute scene contracts with runtime guardrails');

  sceneCmd
    .command('validate')
    .description('Validate scene manifest from spec or file path')
    .option('-s, --spec <spec-name>', 'Spec name under .sce/specs')
    .option('-m, --manifest <path>', 'Path to scene manifest file (yaml/json)')
    .option('--spec-manifest <relative-path>', 'Manifest path inside spec folder', 'custom/scene.yaml')
    .option('--json', 'Print validation summary as JSON')
    .action(async (options) => {
      await runSceneValidateCommand(options);
    });

  sceneCmd
    .command('doctor')
    .description('Diagnose scene policy, plan, and adapter readiness before run')
    .option('-s, --spec <spec-name>', 'Spec name under .sce/specs')
    .option('-m, --manifest <path>', 'Path to scene manifest file (yaml/json)')
    .option('--spec-manifest <relative-path>', 'Manifest path inside spec folder', 'custom/scene.yaml')
    .option('--mode <mode>', 'Policy evaluation mode (dry_run|commit)', 'dry_run')
    .option('--trace-id <trace-id>', 'Explicit trace ID for doctor session')
    .option('--context-file <path>', 'JSON file merged into runtime context')
    .option('--approved', 'Set context.approved=true')
    .option('--dual-approved', 'Set context.dualApproved=true')
    .option('--allow-hybrid-commit', 'Set context.allowHybridCommit=true')
    .option('--safety-preflight', 'Set context.safetyChecks.preflight=true')
    .option('--safety-stop-channel', 'Set context.safetyChecks.stopChannel=true')
    .option('--check-adapter', 'Run adapter readiness check for robot/hybrid scene')
    .option('--moqui-config <path>', 'Path to moqui-adapter.json config file for runtime bindings')
    .option('--binding-plugin-dir <path>', 'Binding plugin directory for runtime handler loading')
    .option('--binding-plugin-manifest <path>', 'Binding plugin manifest JSON path')
    .option('--no-binding-plugin-auto-discovery', 'Disable runtime binding plugin auto-discovery under .sce')
    .option('--no-binding-plugin-manifest-load', 'Disable runtime binding plugin manifest loading')
    .option('--todo-out <path>', 'Write remediation checklist markdown to file')
    .option('--task-out <path>', 'Write suggested task draft markdown to file')
    .option('--feedback-out <path>', 'Write execution feedback template markdown to file')
    .option('--sync-spec-tasks', 'Append actionable doctor tasks into target spec tasks.md')
    .option('--json', 'Print diagnostic report as JSON')
    .action(async (options) => {
      await runSceneDoctorCommand(options);
    });

  sceneCmd
    .command('scaffold')
    .description('Create starter scene manifest in target spec')
    .option('-s, --spec <spec-name>', 'Target spec name under .sce/specs')
    .option('-t, --type <type>', 'Starter template type (erp|hybrid)', 'erp')
    .option('--template <path>', 'Custom template path (yaml/json), overrides --type')
    .option('--output <relative-path>', 'Manifest path within spec directory', 'custom/scene.yaml')
    .option('--obj-id <obj-id>', 'Override metadata.obj_id')
    .option('--title <title>', 'Override metadata.title')
    .option('--force', 'Overwrite existing manifest file')
    .option('--dry-run', 'Preview generated manifest without writing file')
    .option('--json', 'Print scaffold summary as JSON')
    .action(async (options) => {
      await runSceneScaffoldCommand(options);
    });

  sceneCmd
    .command('run')
    .description('Run scene runtime by spec or manifest path')
    .option('-s, --spec <spec-name>', 'Spec name under .sce/specs')
    .option('-m, --manifest <path>', 'Path to scene manifest file (yaml/json)')
    .option('--spec-manifest <relative-path>', 'Manifest path inside spec folder', 'custom/scene.yaml')
    .option('--mode <mode>', 'Run mode (dry_run|commit)', 'dry_run')
    .option('--trace-id <trace-id>', 'Explicit trace ID for this run')
    .option('--context-file <path>', 'JSON file merged into runtime context')
    .option('--approved', 'Set context.approved=true')
    .option('--dual-approved', 'Set context.dualApproved=true')
    .option('--allow-hybrid-commit', 'Set context.allowHybridCommit=true')
    .option('--safety-preflight', 'Set context.safetyChecks.preflight=true')
    .option('--safety-stop-channel', 'Set context.safetyChecks.stopChannel=true')
    .option('--moqui-config <path>', 'Path to moqui-adapter.json config file for runtime bindings')
    .option('--binding-plugin-dir <path>', 'Binding plugin directory for runtime handler loading')
    .option('--binding-plugin-manifest <path>', 'Binding plugin manifest JSON path')
    .option('--no-binding-plugin-auto-discovery', 'Disable runtime binding plugin auto-discovery under .sce')
    .option('--no-binding-plugin-manifest-load', 'Disable runtime binding plugin manifest loading')
    .option('--plan-out <path>', 'Write compiled plan JSON to file')
    .option('--result-out <path>', 'Write execution result JSON to file')
    .option('--json', 'Print JSON result payload')
    .action(async (options) => {
      await runSceneCommand(options);
    });

  sceneCmd
    .command('eval')
    .description('Aggregate scene run result and doctor feedback into evaluation report')
    .option('-r, --result <path>', 'Path to scene run result JSON')
    .option('-f, --feedback <path>', 'Path to doctor feedback template markdown')
    .option('-t, --target <path>', 'Path to evaluation target JSON')
    .option('-o, --out <path>', 'Write evaluation report JSON to file')
    .option('-s, --spec <spec-name>', 'Target spec name under .sce/specs (for task sync)')
    .option('--spec-manifest <relative-path>', 'Manifest path inside spec folder for profile inference', 'custom/scene.yaml')
    .option('--sync-spec-tasks', 'Append evaluation recommendations into target spec tasks.md')
    .option('--task-policy <path>', 'Path to eval task sync policy JSON')
    .option('--eval-config <path>', 'Path to unified scene eval config JSON')
    .option('--env <env-name>', 'Eval config environment profile (dev|staging|prod)')
    .option('--profile <profile>', 'Eval profile override (default|erp|ops|robot)')
    .option('--profile-rules <path>', 'Path to eval profile inference rules JSON')
    .option('--profile-infer-strict', 'Fail when profile inference falls back to default')
    .option('--no-profile-manifest-auto-discovery', 'Disable auto discovery when --spec-manifest is missing')
    .option('--json', 'Print evaluation report as JSON')
    .action(async (options) => {
      await runSceneEvalCommand(options);
    });

  sceneCmd
    .command('eval-policy-template')
    .description('Create default eval task sync policy template JSON')
    .option('-o, --out <path>', 'Output JSON path', '.sce/templates/scene-eval-task-policy.json')
    .option('--force', 'Overwrite existing policy template file')
    .option('--json', 'Print summary as JSON')
    .action(async (options) => {
      await runSceneEvalPolicyTemplateCommand(options);
    });

  sceneCmd
    .command('eval-config-template')
    .description('Create unified scene eval config template JSON')
    .option('-o, --out <path>', 'Output JSON path', '.sce/templates/scene-eval-config.json')
    .option('-p, --profile <profile>', 'Template profile (default|erp|ops|robot)', 'default')
    .option('--force', 'Overwrite existing config template file')
    .option('--json', 'Print summary as JSON')
    .action(async (options) => {
      await runSceneEvalConfigTemplateCommand(options);
    });

  sceneCmd
    .command('eval-profile-rules-template')
    .description('Create eval profile inference rules template JSON')
    .option('-o, --out <path>', 'Output JSON path', '.sce/templates/scene-eval-profile-rules.json')
    .option('--force', 'Overwrite existing rules template file')
    .option('--json', 'Print summary as JSON')
    .action(async (options) => {
      await runSceneEvalProfileRulesTemplateCommand(options);
    });

  sceneCmd
    .command('catalog')
    .description('Build scene catalog across specs for discovery and routing')
    .option('-s, --spec <spec-name>', 'Scope catalog to one spec')
    .option('--spec-manifest <relative-path>', 'Preferred manifest path inside each spec', 'custom/scene.yaml')
    .option('--domain <domain>', 'Filter entries by domain')
    .option('--kind <kind>', 'Filter entries by manifest kind')
    .option('--include-invalid', 'Include parse/validation failures in output')
    .option('-o, --out <path>', 'Write catalog JSON to file')
    .option('--json', 'Print catalog JSON')
    .action(async (options) => {
      await runSceneCatalogCommand(options);
    });

  sceneCmd
    .command('route')
    .description('Resolve best scene target from catalog for execution routing')
    .option('-s, --spec <spec-name>', 'Scope route to one spec')
    .option('--spec-manifest <relative-path>', 'Preferred manifest path inside each spec', 'custom/scene.yaml')
    .option('--scene-ref <scene-ref>', 'Prefer exact or fuzzy scene_ref match')
    .option('--domain <domain>', 'Filter route candidates by domain')
    .option('--kind <kind>', 'Filter route candidates by manifest kind')
    .option('--query <query>', 'Keyword query matched against scene_ref/title/spec')
    .option('--mode <mode>', 'Recommended run mode for generated commands (dry_run|commit)', 'dry_run')
    .option('--route-policy <path>', 'Path to route scoring policy JSON')
    .option('--include-invalid', 'Include invalid catalog entries during route scoring')
    .option('--require-unique', 'Fail when top candidates tie on score')
    .option('-o, --out <path>', 'Write route JSON to file')
    .option('--json', 'Print route JSON')
    .action(async (options) => {
      await runSceneRouteCommand(options);
    });

  sceneCmd
    .command('route-policy-template')
    .description('Create scene route policy template JSON')
    .option('-o, --out <path>', 'Output JSON path', '.sce/templates/scene-route-policy.json')
    .option('-p, --profile <profile>', 'Template profile (default|erp|hybrid|robot)', 'default')
    .option('--force', 'Overwrite existing route policy template file')
    .option('--json', 'Print summary as JSON')
    .action(async (options) => {
      await runSceneRoutePolicyTemplateCommand(options);
    });

  sceneCmd
    .command('route-policy-suggest')
    .description('Suggest tuned route policy from scene eval reports')
    .option('-e, --eval <path...>', 'Path(s) to scene eval report JSON')
    .option('--eval-dir <path>', 'Directory containing scene eval report JSON files')
    .option('--route-policy <path>', 'Path to current route scoring policy JSON')
    .option('-p, --profile <profile>', 'Base profile when --route-policy is absent (default|erp|hybrid|robot)', 'default')
    .option('--max-adjustment <number>', 'Maximum absolute adjustment per tuning rule', String(ROUTE_POLICY_SUGGEST_MAX_ADJUSTMENT_DEFAULT))
    .option('-o, --out <path>', 'Write suggestion payload JSON to file')
    .option('--policy-out <path>', 'Write suggested route policy JSON to file')
    .option('--json', 'Print suggestion JSON')
    .action(async (options) => {
      await runSceneRoutePolicySuggestCommand(options);
    });

  sceneCmd
    .command('route-policy-rollout')
    .description('Build auditable rollout package from route policy suggestion payload')
    .requiredOption('-s, --suggestion <path>', 'Path to route policy suggestion payload JSON')
    .option('--target-policy <path>', 'Target runtime route policy path', '.sce/config/scene-route-policy.json')
    .option('--name <rollout-name>', 'Rollout package name (defaults to generated timestamp slug)')
    .option('--out-dir <path>', 'Rollout package root directory', SCENE_ROUTE_POLICY_ROLLOUT_DEFAULT_DIR)
    .option('--force', 'Overwrite rollout package directory if it already exists')
    .option('--json', 'Print rollout payload JSON')
    .action(async (options) => {
      await runSceneRoutePolicyRolloutCommand(options);
    });

  sceneCmd
    .command('package-template')
    .description('Create scene package contract template JSON')
    .option('-s, --spec <spec-name>', 'Target spec name under .sce/specs')
    .option('-o, --out <path>', 'Output path (relative; defaults by context)')
    .option('--kind <kind>', 'Package kind (scene-template|scene-instance|scene-capability|scene-domain-profile|scene-policy-profile)', 'scene-template')
    .option('--group <group>', 'Package group', 'sce.scene')
    .option('--name <name>', 'Package name (defaults from spec/out)')
    .option('--pkg-version <version>', 'Package semantic version', '0.1.0')
    .option('--force', 'Overwrite existing package contract file')
    .option('--json', 'Print summary as JSON')
    .action(async (options) => {
      await runScenePackageTemplateCommand(options);
    });

  sceneCmd
    .command('package-validate')
    .description('Validate scene package contract JSON')
    .option('-s, --spec <spec-name>', 'Spec name under .sce/specs')
    .option('-p, --package <path>', 'Path to scene package contract JSON')
    .option('--spec-package <relative-path>', 'Package path inside spec folder', 'custom/scene-package.json')
    .option('--json', 'Print validation payload as JSON')
    .option('--strict', 'Treat warnings as errors')
    .action(async (options) => {
      await runScenePackageValidateCommand(options);
    });

  sceneCmd
    .command('package-publish')
    .description('Publish scene package template assets into template library')
    .requiredOption('-s, --spec <spec-name>', 'Source spec name under .sce/specs')
    .option('--spec-package <relative-path>', 'Package path inside source spec', 'custom/scene-package.json')
    .option('--scene-manifest <relative-path>', 'Scene manifest path inside source spec', 'custom/scene.yaml')
    .option('--out-dir <path>', 'Template library output root', SCENE_PACKAGE_TEMPLATE_DEFAULT_DIR)
    .option('--template-id <template-id>', 'Explicit template id (folder name)')
    .option('--require-ontology-validation', 'Require ontology graph validation before publish (default: enabled)')
    .option('--no-require-ontology-validation', 'Allow publish when ontology graph validation fails (not recommended)')
    .option('--ontology-min-score <number>', 'Minimum ontology semantic quality score (0-100)')
    .option('--dry-run', 'Preview publish without writing files')
    .option('--force', 'Overwrite existing template directory if it already exists')
    .option('--json', 'Print publish payload as JSON')
    .action(async (options) => {
      await runScenePackagePublishCommand(options);
    });

  sceneCmd
    .command('package-publish-batch')
    .description('Publish scene package template assets in batch from handoff manifest')
    .option('-m, --manifest <path>', 'Path to handoff manifest JSON')
    .option('--manifest-spec-path <path>', 'Path to manifest spec array', 'specs')
    .option('--from-331', 'Use 331-poc defaults (manifest/docs paths + completed filter)')
    .option('--status <status>', 'Filter specs by status (default: completed, use all to disable)', 'completed')
    .option('--include <specs>', 'Comma-separated spec IDs to include')
    .option('--fallback-spec-package <relative-path>', 'Fallback package path inside spec')
    .option('--fallback-scene-manifest <relative-path>', 'Fallback scene manifest path inside spec')
    .option('--require-ontology-validation', 'Require ontology graph validation before publish (default: enabled)')
    .option('--no-require-ontology-validation', 'Allow publish when ontology graph validation fails (not recommended)')
    .option('--ontology-min-score <number>', 'Minimum ontology semantic quality score (0-100)')
    .option('--ontology-min-average-score <number>', `Minimum ontology average score for selected batch (0-100, default: ${SCENE_PACKAGE_BATCH_DEFAULT_ONTOLOGY_MIN_AVERAGE_SCORE})`)
    .option('--ontology-min-valid-rate <number>', `Minimum ontology graph-valid rate for selected batch (0-100, default: ${SCENE_PACKAGE_BATCH_DEFAULT_ONTOLOGY_MIN_VALID_RATE})`)
    .option('--ontology-report-out <path>', 'Write ontology/publish batch report JSON to file')
    .option('--ontology-task-out <path>', 'Write ontology remediation task draft markdown to file')
    .option('--ontology-task-queue-out <path>', 'Write ontology remediation queue lines for close-loop-batch')
    .option('--out-dir <path>', 'Template library output root', SCENE_PACKAGE_TEMPLATE_DEFAULT_DIR)
    .option('--dry-run', 'Preview batch publish without writing files')
    .option('--force', 'Overwrite existing template directories when they already exist')
    .option('--strict', 'Stop on first publish failure')
    .option('--json', 'Print batch publish payload as JSON')
    .action(async (options) => {
      await runScenePackagePublishBatchCommand(options);
    });

  sceneCmd
    .command('package-ontology-backfill-batch')
    .description('Backfill ontology_model semantics in scene packages from handoff manifest')
    .option('-m, --manifest <path>', 'Path to handoff manifest JSON')
    .option('--manifest-spec-path <path>', 'Path to manifest spec array', 'specs')
    .option('--from-331', 'Use 331-poc defaults (manifest/docs paths + completed filter)')
    .option('--status <status>', 'Filter specs by status (default: completed, use all to disable)', 'completed')
    .option('--include <specs>', 'Comma-separated spec IDs to include')
    .option('--spec-package-path <relative-path>', 'Scene package path inside spec')
    .option('--out-report <path>', 'Write backfill report JSON to file')
    .option('--dry-run', 'Preview ontology backfill without writing files')
    .option('--strict', 'Stop on first backfill failure')
    .option('--json', 'Print ontology backfill payload as JSON')
    .action(async (options) => {
      await runScenePackageOntologyBackfillBatchCommand(options);
    });

  sceneCmd
    .command('package-instantiate')
    .description('Instantiate new spec from published scene package template')
    .requiredOption('-t, --template <path>', 'Template manifest JSON path')
    .requiredOption('-s, --target-spec <spec-name>', 'Target spec name under .sce/specs')
    .option('-v, --values <path>', 'Template parameter values JSON path')
    .option('--force', 'Overwrite existing target spec files when they already exist')
    .option('--json', 'Print instantiate payload as JSON')
    .action(async (options) => {
      await runScenePackageInstantiateCommand(options);
    });

  sceneCmd
    .command('package-registry')
    .description('Build template library registry with validation and layer classification')
    .option('--template-dir <path>', 'Template library root directory', SCENE_PACKAGE_TEMPLATE_DEFAULT_DIR)
    .option('-o, --out <path>', 'Output path for registry JSON payload')
    .option('--strict', 'Exit non-zero when invalid templates are detected')
    .option('--json', 'Print registry payload as JSON')
    .action(async (options) => {
      await runScenePackageRegistryCommand(options);
    });

  sceneCmd
    .command('package-gate-template')
    .description('Create scene package quality gate policy template JSON')
    .option('-o, --out <path>', 'Output path for gate policy template', '.sce/templates/scene-package-gate-policy.json')
    .option('--profile <profile>', 'Gate policy profile (baseline|three-layer)', 'baseline')
    .option('--force', 'Overwrite output policy file when it already exists')
    .option('--json', 'Print gate policy payload as JSON')
    .action(async (options) => {
      await runScenePackageGateTemplateCommand(options);
    });

  sceneCmd
    .command('package-gate')
    .description('Evaluate scene package registry against quality gate policy')
    .requiredOption('-r, --registry <path>', 'Registry JSON path (output of scene package-registry)')
    .option('-p, --policy <path>', 'Gate policy JSON path', '.sce/templates/scene-package-gate-policy.json')
    .option('-s, --spec <spec-name>', 'Target spec name under .sce/specs (for task sync)')
    .option('--task-out <path>', 'Write gate task draft markdown to file')
    .option('--runbook-out <path>', 'Write remediation execution runbook markdown to file')
    .option('--sync-spec-tasks', 'Append failed gate checks into target spec tasks.md')
    .option('-o, --out <path>', 'Output path for gate evaluation payload')
    .option('--strict', 'Exit non-zero when gate fails')
    .option('--json', 'Print gate evaluation payload as JSON')
    .action(async (options) => {
      await runScenePackageGateCommand(options);
    });

  sceneCmd
    .command('template-validate')
    .description('Validate scene template package variable schema')
    .option('--package <path>', 'Path to scene-package.json or directory')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      await runSceneTemplateValidateCommand(options);
    });

  sceneCmd
    .command('template-resolve')
    .description('Resolve scene template inheritance chain and merged schema')
    .option('--package <name>', 'Template package name')
    .option('--template-dir <path>', 'Template library directory')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      await runSceneTemplateResolveCommand(options);
    });

  sceneCmd
    .command('template-render')
    .description('Render scene template package with variable values')
    .option('--package <name>', 'Template package name')
    .option('--values <json-or-path>', 'Variable values as JSON string or file path')
    .option('--out <dir>', 'Output directory')
    .option('--template-dir <path>', 'Template library directory')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      await runSceneTemplateRenderCommand(options);
    });

  sceneCmd
    .command('moqui-baseline')
    .description('Generate Moqui template baseline scorecard from scene package library')
    .option('--template-dir <path>', 'Template root directory', SCENE_PACKAGE_TEMPLATE_DEFAULT_DIR)
    .option('--out <path>', 'JSON report output path', '.sce/reports/moqui-template-baseline.json')
    .option('--markdown-out <path>', 'Markdown report output path', '.sce/reports/moqui-template-baseline.md')
    .option('--match <regex>', 'Template selector regex', SCENE_MOQUI_BASELINE_DEFAULT_MATCH)
    .option('--include-all', 'Disable selector filter and score all templates')
    .option('--min-score <number>', 'Baseline minimum semantic score (0-100)', String(SCENE_MOQUI_BASELINE_DEFAULT_MIN_SCORE))
    .option('--min-valid-rate <number>', 'Baseline minimum ontology valid-rate percent (0-100)', String(SCENE_MOQUI_BASELINE_DEFAULT_MIN_VALID_RATE))
    .option('--compare-with <path>', 'Compare with previous baseline JSON report')
    .option('--fail-on-portfolio-fail', 'Exit non-zero when portfolio baseline gate fails')
    .option('--json', 'Print payload as JSON')
    .action(async (options) => {
      await runSceneMoquiBaselineCommand(options);
    });

  sceneCmd
    .command('interactive-loop')
    .description('Run one-command interactive customization loop (intent->plan->gate->approval->optional low-risk apply)')
    .option('--context <path>', 'Page context JSON file')
    .option('--goal <text>', 'Business goal text')
    .option('--goal-file <path>', 'Path to business goal text file')
    .option('--user-id <id>', 'User identifier')
    .option('--session-id <id>', 'Session identifier')
    .option('--execution-mode <mode>', 'suggestion|apply', 'suggestion')
    .option('--business-mode <mode>', 'Business operating mode (user-mode|ops-mode|dev-mode)')
    .option('--business-mode-policy <path>', 'Business mode policy override path')
    .option('--allow-mode-override', 'Allow option overrides that conflict with selected business mode preset')
    .option('--policy <path>', 'Guardrail policy override path')
    .option('--catalog <path>', 'High-risk catalog override path')
    .option('--dialogue-policy <path>', 'Dialogue governance policy override path')
    .option('--dialogue-profile <name>', 'Dialogue governance profile (business-user|system-maintainer)', 'business-user')
    .option('--ui-mode <name>', 'Interaction surface mode (user-app|ops-console)')
    .option('--dialogue-out <path>', 'Dialogue governance report output path')
    .option('--runtime-mode <name>', 'Runtime mode (user-assist|ops-fix|feature-dev)', 'ops-fix')
    .option('--runtime-environment <name>', 'Runtime environment (dev|staging|prod)', 'staging')
    .option('--runtime-policy <path>', 'Runtime mode/environment policy override path')
    .option('--runtime-out <path>', 'Runtime policy evaluation output path')
    .option('--authorization-tier-policy <path>', 'Authorization tier policy override path')
    .option('--authorization-tier-out <path>', 'Authorization tier evaluation output path')
    .option('--context-contract <path>', 'Context contract override path for interactive intent build')
    .option('--no-strict-contract', 'Do not fail when context contract validation has issues')
    .option('--moqui-config <path>', 'Moqui adapter runtime config path')
    .option('--out-dir <path>', 'Loop artifact root directory')
    .option('--out <path>', 'Loop summary output file path')
    .option('--work-order-out <path>', 'Work-order JSON output file path')
    .option('--work-order-markdown-out <path>', 'Work-order markdown output file path')
    .option('--approval-actor <id>', 'Approval workflow actor')
    .option('--approval-actor-role <name>', 'Approval workflow actor role')
    .option('--approver-actor <id>', 'Auto-approve actor')
    .option('--approver-actor-role <name>', 'Auto-approve actor role')
    .option('--approval-role-policy <path>', 'Approval role policy JSON path')
    .option('--skip-submit', 'Skip approval submit step')
    .option('--auto-approve-low-risk', 'Auto-approve low-risk allow plans')
    .option('--auto-execute-low-risk', 'Auto-run low-risk apply for allow+low plans')
    .option('--allow-suggestion-apply', 'Allow applying plans generated in suggestion mode')
    .option('--live-apply', 'Enable live apply mode')
    .option('--no-dry-run', 'Disable dry-run simulation')
    .option('--feedback-score <number>', 'Optional feedback score (0-5)')
    .option('--feedback-comment <text>', 'Optional feedback comment')
    .option('--feedback-tags <csv>', 'Optional feedback tags (comma-separated)')
    .option('--feedback-channel <channel>', 'Feedback channel (ui|cli|api|other)', 'ui')
    .option('--auth-password <text>', 'One-time password for protected execute action')
    .option('--auth-password-hash <sha256>', 'Password verifier hash override')
    .option('--auth-password-env <name>', 'Password hash environment variable name')
    .option('--fail-on-dialogue-deny', 'Exit code 2 when dialogue decision is deny')
    .option('--fail-on-gate-deny', 'Exit code 2 when gate decision is deny')
    .option('--fail-on-gate-non-allow', 'Exit code 2 when gate decision is deny/review-required')
    .option('--fail-on-runtime-non-allow', 'Exit code 2 when runtime decision is deny/review-required')
    .option('--fail-on-execute-blocked', 'Exit code 2 when auto execute result is blocked/non-success')
    .option('--json', 'Print payload as JSON')
    .action(async (options) => {
      await runSceneInteractiveLoopCommand(options);
    });

  sceneCmd
    .command('context-bridge')
    .description('Normalize provider payload into SCE interactive page-context contract')
    .option('--input <path>', 'Raw provider payload JSON path')
    .option('--provider <name>', 'Provider dialect (moqui|generic)', 'moqui')
    .option('--out-context <path>', 'Normalized page-context output path')
    .option('--out-report <path>', 'Bridge report output path')
    .option('--context-contract <path>', 'Context contract override path')
    .option('--no-strict-contract', 'Do not fail when context contract validation has issues')
    .option('--json', 'Print payload as JSON')
    .action(async (options) => {
      await runSceneContextBridgeCommand(options);
    });

  sceneCmd
    .command('interactive-flow')
    .description('Run one-command interactive flow (context-bridge -> interactive-loop)')
    .option('--input <path>', 'Raw provider payload JSON path')
    .option('--provider <name>', 'Provider dialect (moqui|generic)', 'moqui')
    .option('--goal <text>', 'Business goal text')
    .option('--goal-file <path>', 'Path to business goal text file')
    .option('--user-id <id>', 'User identifier')
    .option('--session-id <id>', 'Session identifier')
    .option('--execution-mode <mode>', 'suggestion|apply', 'suggestion')
    .option('--business-mode <mode>', 'Business operating mode (user-mode|ops-mode|dev-mode)')
    .option('--business-mode-policy <path>', 'Business mode policy override path')
    .option('--allow-mode-override', 'Allow option overrides that conflict with selected business mode preset')
    .option('--policy <path>', 'Guardrail policy override path')
    .option('--catalog <path>', 'High-risk catalog override path')
    .option('--dialogue-policy <path>', 'Dialogue governance policy override path')
    .option('--dialogue-profile <name>', 'Dialogue governance profile (business-user|system-maintainer)', 'business-user')
    .option('--ui-mode <name>', 'Interaction surface mode (user-app|ops-console)')
    .option('--dialogue-out <path>', 'Dialogue governance report output path')
    .option('--runtime-mode <name>', 'Runtime mode (user-assist|ops-fix|feature-dev)', 'ops-fix')
    .option('--runtime-environment <name>', 'Runtime environment (dev|staging|prod)', 'staging')
    .option('--runtime-policy <path>', 'Runtime mode/environment policy override path')
    .option('--runtime-out <path>', 'Runtime policy evaluation output path')
    .option('--authorization-tier-policy <path>', 'Authorization tier policy override path')
    .option('--authorization-tier-out <path>', 'Authorization tier evaluation output path')
    .option('--context-contract <path>', 'Context contract override path')
    .option('--no-strict-contract', 'Do not fail when context contract validation has issues')
    .option('--moqui-config <path>', 'Moqui adapter runtime config path')
    .option('--out-dir <path>', 'Flow artifact root directory')
    .option('--bridge-out-context <path>', 'Bridge normalized context output file path')
    .option('--bridge-out-report <path>', 'Bridge report output file path')
    .option('--loop-out <path>', 'Interactive-loop summary output file path')
    .option('--work-order-out <path>', 'Work-order JSON output file path')
    .option('--work-order-markdown-out <path>', 'Work-order markdown output file path')
    .option('--out <path>', 'Flow summary output file path')
    .option('--approval-actor <id>', 'Approval workflow actor')
    .option('--approval-actor-role <name>', 'Approval workflow actor role')
    .option('--approver-actor <id>', 'Auto-approve actor')
    .option('--approver-actor-role <name>', 'Auto-approve actor role')
    .option('--approval-role-policy <path>', 'Approval role policy JSON path')
    .option('--skip-submit', 'Skip approval submit step')
    .option('--auto-approve-low-risk', 'Auto-approve low-risk allow plans')
    .option('--auto-execute-low-risk', 'Auto-run low-risk apply for allow+low plans')
    .option('--allow-suggestion-apply', 'Allow applying plans generated in suggestion mode')
    .option('--live-apply', 'Enable live apply mode')
    .option('--no-dry-run', 'Disable dry-run simulation')
    .option('--feedback-score <number>', 'Optional feedback score (0-5)')
    .option('--feedback-comment <text>', 'Optional feedback comment')
    .option('--feedback-tags <csv>', 'Optional feedback tags (comma-separated)')
    .option('--feedback-channel <channel>', 'Feedback channel (ui|cli|api|other)', 'ui')
    .option('--auth-password <text>', 'One-time password for protected execute action')
    .option('--auth-password-hash <sha256>', 'Password verifier hash override')
    .option('--auth-password-env <name>', 'Password hash environment variable name')
    .option('--fail-on-dialogue-deny', 'Exit code 2 when dialogue decision is deny')
    .option('--fail-on-gate-deny', 'Exit code 2 when gate decision is deny')
    .option('--fail-on-gate-non-allow', 'Exit code 2 when gate decision is deny/review-required')
    .option('--fail-on-runtime-non-allow', 'Exit code 2 when runtime decision is deny/review-required')
    .option('--fail-on-execute-blocked', 'Exit code 2 when auto execute result is blocked/non-success')
    .option('--no-matrix', 'Disable matrix baseline snapshot stage')
    .option('--matrix-template-dir <path>', 'Template library path for matrix stage')
    .option('--matrix-match <regex>', 'Matrix selector regex')
    .option('--matrix-include-all', 'Score all templates in matrix stage')
    .option('--matrix-min-score <number>', 'Matrix min semantic score (0-100)')
    .option('--matrix-min-valid-rate <number>', 'Matrix min ontology valid-rate (0-100)')
    .option('--matrix-compare-with <path>', 'Previous matrix baseline report path')
    .option('--matrix-out <path>', 'Matrix JSON report output path')
    .option('--matrix-markdown-out <path>', 'Matrix markdown report output path')
    .option('--matrix-signals <path>', 'Matrix signal JSONL append path')
    .option('--matrix-fail-on-portfolio-fail', 'Exit non-zero when matrix portfolio baseline fails')
    .option('--matrix-fail-on-regression', 'Exit code 2 when matrix regressions are detected')
    .option('--matrix-fail-on-error', 'Exit non-zero when matrix stage fails unexpectedly')
    .option('--json', 'Print payload as JSON')
    .action(async (options) => {
      await runSceneInteractiveFlowCommand(options);
    });

  sceneCmd
    .command('instantiate')
    .description('Instantiate scene template package with full pipeline (resolve, validate, render, manifest, log, hook)')
    .option('--package <name>', 'Template package name')
    .option('--values <json-or-path>', 'Variable values as JSON string or file path')
    .option('--out <dir>', 'Output directory')
    .option('--template-dir <path>', 'Template library directory')
    .option('--list', 'List available template packages')
    .option('--dry-run', 'Preview instantiation plan without writing files')
    .option('--interactive', 'Prompt for missing required variables')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      await runSceneInstantiateCommand(options);
    });

  sceneCmd
    .command('publish')
    .description('Publish scene package tarball to local registry')
    .requiredOption('-p, --package <path>', 'Path to scene package directory')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--dry-run', 'Preview publish without writing files')
    .option('--force', 'Overwrite existing version in registry')
    .option('--json', 'Print publish payload as JSON')
    .action(async (options) => {
      await runScenePackageRegistryPublishCommand(options);
    });

  sceneCmd
    .command('unpublish')
    .description('Remove a published scene package version from local registry')
    .requiredOption('-n, --name <name>', 'Package name to unpublish')
    .requiredOption('-v, --version <version>', 'Package version to unpublish')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print unpublish payload as JSON')
    .action(async (options) => {
      await runSceneUnpublishCommand(options);
    });

  sceneCmd
    .command('install')
    .description('Install scene package from local registry')
    .requiredOption('-n, --name <name>', 'Package name to install')
    .option('-v, --version <version>', 'Package version (default: latest)')
    .option('-o, --out <dir>', 'Target output directory')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--force', 'Overwrite existing installation')
    .option('--dry-run', 'Preview install without writing files')
    .option('--json', 'Print install payload as JSON')
    .action(async (options) => {
      await runSceneInstallCommand(options);
    });

  sceneCmd
    .command('list')
    .description('List all packages in the local scene registry')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      await runSceneListCommand(options);
    });

  sceneCmd
    .command('search')
    .description('Search packages in the local scene registry')
    .requiredOption('-q, --query <term>', 'Search term (substring match on name, description, group)')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      await runSceneSearchCommand(options);
    });

  sceneCmd
    .command('version')
    .description('Bump the version in a scene-package.json file')
    .option('-p, --package <dir>', 'Scene package directory', '.')
    .requiredOption('-b, --bump <type>', 'Bump type: major, minor, patch, or explicit semver')
    .option('--json', 'Print result as JSON')
    .option('--dry-run', 'Show what would change without writing')
    .action(async (options) => {
      await runSceneVersionCommand(options);
    });

  sceneCmd
    .command('diff')
    .description('Compare two versions of a scene package in the local registry')
    .requiredOption('-n, --name <name>', 'Package name')
    .requiredOption('-f, --from <version>', 'Source version')
    .requiredOption('-t, --to <version>', 'Target version')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print result as JSON')
    .option('--stat', 'Show only file change summary')
    .action(async (options) => {
      await runSceneDiffCommand(options);
    });

  sceneCmd
    .command('info')
    .description('Display detailed information about a scene package in the local registry')
    .requiredOption('-n, --name <name>', 'Package name')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print result as JSON')
    .option('--versions-only', 'Show only version list')
    .action(async (options) => {
      await runSceneInfoCommand(options);
    });

  sceneCmd
    .command('deprecate')
    .description('Mark or unmark a scene package version as deprecated')
    .requiredOption('-n, --name <name>', 'Package name')
    .option('-v, --version <version>', 'Specific version to deprecate')
    .option('-m, --message <msg>', 'Deprecation message')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print result as JSON')
    .option('--undo', 'Remove deprecation marker')
    .action(async (options) => {
      await runSceneDeprecateCommand(options);
    });

  sceneCmd
    .command('audit')
    .description('Audit local scene package registry health')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print result as JSON')
    .option('--fix', 'Auto-fix orphaned tarballs and missing entries')
    .action(async (options) => {
      await runSceneAuditCommand(options);
    });

  const ownerCmd = sceneCmd
    .command('owner')
    .description('Manage package ownership in local registry');

  ownerCmd
    .command('set')
    .description('Set or remove the owner of a package')
    .requiredOption('-n, --name <name>', 'Package name')
    .option('-o, --owner <owner>', 'Owner name to set')
    .option('--remove', 'Remove owner from package')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      await runSceneOwnerCommand({ ...options, action: 'set' });
    });

  ownerCmd
    .command('show')
    .description('Show the current owner of a package')
    .requiredOption('-n, --name <name>', 'Package name')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      await runSceneOwnerCommand({ ...options, action: 'show' });
    });

  ownerCmd
    .command('list')
    .description('List all packages owned by a specific owner')
    .requiredOption('-o, --owner <owner>', 'Owner name to filter by')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      await runSceneOwnerCommand({ ...options, action: 'list' });
    });

  ownerCmd
    .command('transfer')
    .description('Transfer package ownership from one owner to another')
    .requiredOption('-n, --name <name>', 'Package name')
    .requiredOption('--from <owner>', 'Current owner')
    .requiredOption('--to <owner>', 'New owner')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      await runSceneOwnerCommand({ ...options, action: 'transfer' });
    });

  // ── scene tag ──
  const tagCmd = sceneCmd
    .command('tag')
    .description('Manage distribution tags on scene packages');

  tagCmd
    .command('add')
    .description('Add a distribution tag to a package version')
    .requiredOption('-n, --name <name>', 'Package name')
    .requiredOption('-t, --tag <tag>', 'Tag name')
    .requiredOption('-v, --version <version>', 'Version to tag')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      await runSceneTagCommand({ ...options, action: 'add' });
    });

  tagCmd
    .command('rm')
    .description('Remove a distribution tag from a package')
    .requiredOption('-n, --name <name>', 'Package name')
    .requiredOption('-t, --tag <tag>', 'Tag name to remove')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      await runSceneTagCommand({ ...options, action: 'rm' });
    });

  tagCmd
    .command('ls')
    .description('List all distribution tags for a package')
    .requiredOption('-n, --name <name>', 'Package name')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      await runSceneTagCommand({ ...options, action: 'ls' });
    });

  // ── scene stats ──
  sceneCmd
    .command('stats')
    .description('Show aggregate statistics about the local scene package registry')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      await runSceneStatsCommand(options);
    });

  // ── scene lock ──
  const lockCmd = sceneCmd
    .command('lock')
    .description('Manage version locks on scene packages');

  lockCmd
    .command('set')
    .description('Lock a specific version of a package')
    .requiredOption('-n, --name <name>', 'Package name')
    .requiredOption('-v, --version <version>', 'Version to lock')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      await runSceneLockCommand({ ...options, action: 'set' });
    });

  lockCmd
    .command('rm')
    .description('Unlock a specific version of a package')
    .requiredOption('-n, --name <name>', 'Package name')
    .requiredOption('-v, --version <version>', 'Version to unlock')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      await runSceneLockCommand({ ...options, action: 'rm' });
    });

  lockCmd
    .command('ls')
    .description('List all locked versions for a package')
    .requiredOption('-n, --name <name>', 'Package name')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      await runSceneLockCommand({ ...options, action: 'ls' });
    });

  // ── scene connect ──
  sceneCmd
    .command('connect')
    .description('Test connectivity and authentication to a Moqui ERP instance')
    .option('-c, --config <path>', 'Path to moqui-adapter.json config file')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      await runSceneConnectCommand(options);
    });

  // ── scene discover ──
  sceneCmd
    .command('discover')
    .description('Discover available entities, services, and screens from Moqui ERP')
    .option('-c, --config <path>', 'Path to moqui-adapter.json config file')
    .option('-t, --type <type>', 'Catalog type to discover (entities|services|screens)')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      await runSceneDiscoverCommand(options);
    });

  // ── scene extract ──
  sceneCmd
    .command('extract')
    .description('Extract scene templates from a Moqui ERP instance')
    .option('-c, --config <path>', 'Path to moqui-adapter.json config file')
    .option('-t, --type <type>', 'Resource type filter (entities|services|screens)')
    .option('-p, --pattern <pattern>', 'Pattern filter (crud|query|workflow)')
    .option('-o, --out <dir>', 'Output directory for template bundles')
    .option('--dry-run', 'Preview extraction without writing files')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      await runSceneExtractCommand(options);
    });

  // ── scene lint ──
  sceneCmd
    .command('lint')
    .description('Lint a scene package for quality issues')
    .option('-p, --package <path>', 'Path to scene package directory', '.')
    .option('--strict', 'Treat warnings as errors')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      await runSceneLintCommand(options);
    });

  // ── scene score ──
  sceneCmd
    .command('score')
    .description('Calculate quality score for a scene package')
    .option('-p, --package <path>', 'Path to scene package directory', '.')
    .option('--threshold <number>', 'Minimum passing score (0-100)', '60')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      // Parse threshold from string to number
      if (options.threshold !== undefined) {
        options.threshold = Number(options.threshold);
      }
      await runSceneScoreCommand(options);
    });

  // ── scene contribute ──
  sceneCmd
    .command('contribute')
    .description('Validate, lint, score, and publish a scene package in one step')
    .option('-p, --package <path>', 'Path to scene package directory', '.')
    .option('-r, --registry <path>', 'Registry root directory', '.sce/registry')
    .option('--dry-run', 'Preview contribution without publishing')
    .option('--strict', 'Treat lint warnings as errors')
    .option('--skip-lint', 'Skip lint and score stages')
    .option('--force', 'Overwrite existing version in registry')
    .option('--json', 'Print result as JSON')
    .action(async (options) => {
      await runSceneContributeCommand(options);
    });

  // ── scene ontology ──
  const ontologyCmd = sceneCmd
    .command('ontology')
    .description('Manage scene ontology graph and semantic relationships');

  ontologyCmd
    .command('show')
    .option('-p, --package <path>', 'Path to scene package directory', '.')
    .option('--json', 'Print result as JSON')
    .description('Show ontology graph for a scene package')
    .action(async (options) => { await runSceneOntologyShowCommand(options); });

  ontologyCmd
    .command('deps')
    .requiredOption('--ref <ref>', 'Binding ref to query')
    .option('-p, --package <path>', 'Path to scene package directory', '.')
    .option('--json', 'Print result as JSON')
    .description('Show dependency chain for a binding ref')
    .action(async (options) => { await runSceneOntologyDepsCommand(options); });

  ontologyCmd
    .command('impact')
    .requiredOption('--ref <ref>', 'Binding ref to analyze impact from')
    .option('--relation <types>', `Comma-separated relation types (${VALID_RELATION_TYPES.join(', ')})`, 'depends_on')
    .option('--max-depth <number>', 'Maximum traversal depth (>= 1)')
    .option('-p, --package <path>', 'Path to scene package directory', '.')
    .option('--json', 'Print result as JSON')
    .description('Show transitive impact radius (reverse dependency traversal)')
    .action(async (options) => {
      if (options.maxDepth !== undefined) {
        options.maxDepth = Number(options.maxDepth);
      }
      await runSceneOntologyImpactCommand(options);
    });

  ontologyCmd
    .command('path')
    .requiredOption('--from <ref>', 'Source binding ref')
    .requiredOption('--to <ref>', 'Target binding ref')
    .option('--relation <types>', `Comma-separated relation types (${VALID_RELATION_TYPES.join(', ')})`)
    .option('--undirected', 'Allow reverse traversal on matching edges')
    .option('-p, --package <path>', 'Path to scene package directory', '.')
    .option('--json', 'Print result as JSON')
    .description('Find shortest relation path between two refs')
    .action(async (options) => { await runSceneOntologyPathCommand(options); });

  ontologyCmd
    .command('validate')
    .option('-p, --package <path>', 'Path to scene package directory', '.')
    .option('--json', 'Print result as JSON')
    .description('Validate ontology graph consistency')
    .action(async (options) => { await runSceneOntologyValidateCommand(options); });

  ontologyCmd
    .command('actions')
    .requiredOption('--ref <ref>', 'Binding ref to query')
    .option('-p, --package <path>', 'Path to scene package directory', '.')
    .option('--json', 'Print result as JSON')
    .description('Show action abstraction for a binding ref')
    .action(async (options) => { await runSceneOntologyActionsCommand(options); });

  ontologyCmd
    .command('lineage')
    .requiredOption('--ref <ref>', 'Binding ref to query')
    .option('-p, --package <path>', 'Path to scene package directory', '.')
    .option('--json', 'Print result as JSON')
    .description('Show data lineage for a binding ref')
    .action(async (options) => { await runSceneOntologyLineageCommand(options); });

  ontologyCmd
    .command('agent-info')
    .option('-p, --package <path>', 'Path to scene package directory', '.')
    .option('--json', 'Print result as JSON')
    .description('Show agent hints for a scene package')
    .action(async (options) => { await runSceneOntologyAgentInfoCommand(options); });
}

function normalizeSourceOptions(options = {}) {
  return {
    spec: options.spec,
    manifest: options.manifest,
    specManifest: options.specManifest || 'custom/scene.yaml',
    json: options.json === true
  };
}

function normalizeContextOptions(options = {}) {
  return {
    contextFile: options.contextFile,
    approved: options.approved === true,
    dualApproved: options.dualApproved === true,
    allowHybridCommit: options.allowHybridCommit === true,
    safetyPreflight: options.safetyPreflight === true,
    safetyStopChannel: options.safetyStopChannel === true
  };
}

function normalizeRunOptions(options = {}) {
  const source = normalizeSourceOptions(options);
  const context = normalizeContextOptions(options);

  return {
    ...source,
    ...context,
    mode: options.mode || 'dry_run',
    traceId: options.traceId,
    moquiConfig: options.moquiConfig,
    bindingPluginDir: options.bindingPluginDir,
    bindingPluginManifest: options.bindingPluginManifest,
    bindingPluginAutoDiscovery: options.bindingPluginAutoDiscovery !== false,
    bindingPluginManifestLoad: options.bindingPluginManifestLoad !== false,
    planOut: options.planOut,
    resultOut: options.resultOut
  };
}

function normalizeValidateOptions(options = {}) {
  return normalizeSourceOptions(options);
}

function normalizeDoctorOptions(options = {}) {
  const source = normalizeSourceOptions(options);
  const context = normalizeContextOptions(options);

  return {
    ...source,
    ...context,
    mode: options.mode || 'dry_run',
    traceId: options.traceId,
    checkAdapter: options.checkAdapter === true,
    moquiConfig: options.moquiConfig,
    bindingPluginDir: options.bindingPluginDir,
    bindingPluginManifest: options.bindingPluginManifest,
    bindingPluginAutoDiscovery: options.bindingPluginAutoDiscovery !== false,
    bindingPluginManifestLoad: options.bindingPluginManifestLoad !== false,
    todoOut: options.todoOut,
    taskOut: options.taskOut,
    feedbackOut: options.feedbackOut,
    syncSpecTasks: options.syncSpecTasks === true
  };
}

function normalizeScaffoldOptions(options = {}) {
  return {
    spec: options.spec,
    type: options.type || 'erp',
    template: options.template,
    output: options.output || 'custom/scene.yaml',
    objId: options.objId,
    title: options.title,
    force: options.force === true,
    dryRun: options.dryRun === true,
    json: options.json === true
  };
}

function normalizeEvalOptions(options = {}) {
  return {
    result: options.result,
    feedback: options.feedback,
    target: options.target,
    out: options.out,
    spec: options.spec,
    specManifest: options.specManifest || 'custom/scene.yaml',
    syncSpecTasks: options.syncSpecTasks === true,
    taskPolicy: options.taskPolicy,
    evalConfig: options.evalConfig,
    env: options.env,
    profile: options.profile ? String(options.profile).trim().toLowerCase() : undefined,
    profileRules: options.profileRules,
    profileInferStrict: options.profileInferStrict === true,
    profileManifestAutoDiscovery: options.profileManifestAutoDiscovery !== false,
    json: options.json === true
  };
}

function normalizeEvalPolicyTemplateOptions(options = {}) {
  return {
    out: options.out || '.sce/templates/scene-eval-task-policy.json',
    force: options.force === true,
    json: options.json === true
  };
}

function normalizeEvalConfigTemplateOptions(options = {}) {
  return {
    out: options.out || '.sce/templates/scene-eval-config.json',
    profile: options.profile ? String(options.profile).trim().toLowerCase() : 'default',
    force: options.force === true,
    json: options.json === true
  };
}

function normalizeEvalProfileRulesTemplateOptions(options = {}) {
  return {
    out: options.out || '.sce/templates/scene-eval-profile-rules.json',
    force: options.force === true,
    json: options.json === true
  };
}

function normalizeCatalogOptions(options = {}) {
  const normalizedSpecManifest = normalizeRelativePath(options.specManifest || 'custom/scene.yaml') || 'custom/scene.yaml';

  return {
    spec: options.spec ? String(options.spec).trim() : undefined,
    specManifest: normalizedSpecManifest,
    domain: options.domain ? String(options.domain).trim().toLowerCase() : undefined,
    kind: options.kind ? String(options.kind).trim().toLowerCase() : undefined,
    includeInvalid: options.includeInvalid === true,
    out: options.out,
    json: options.json === true
  };
}

function normalizeRouteOptions(options = {}) {
  const normalizedSpecManifest = normalizeRelativePath(options.specManifest || 'custom/scene.yaml') || 'custom/scene.yaml';

  return {
    spec: options.spec ? String(options.spec).trim() : undefined,
    specManifest: normalizedSpecManifest,
    sceneRef: options.sceneRef ? String(options.sceneRef).trim() : undefined,
    domain: options.domain ? String(options.domain).trim().toLowerCase() : undefined,
    kind: options.kind ? String(options.kind).trim().toLowerCase() : undefined,
    query: options.query ? String(options.query).trim() : undefined,
    mode: options.mode || 'dry_run',
    routePolicy: options.routePolicy,
    includeInvalid: options.includeInvalid === true,
    requireUnique: options.requireUnique === true,
    out: options.out,
    json: options.json === true
  };
}

function normalizeRoutePolicyTemplateOptions(options = {}) {
  return {
    out: options.out || '.sce/templates/scene-route-policy.json',
    profile: options.profile ? String(options.profile).trim().toLowerCase() : 'default',
    force: options.force === true,
    json: options.json === true
  };
}

function normalizePathListOption(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue
      .flatMap((item) => normalizePathListOption(item))
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  }

  if (typeof rawValue !== 'string') {
    return [];
  }

  return rawValue
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeRoutePolicySuggestOptions(options = {}) {
  return {
    eval: normalizePathListOption(options.eval),
    evalDir: options.evalDir ? normalizeRelativePath(String(options.evalDir).trim()) : undefined,
    routePolicy: options.routePolicy ? String(options.routePolicy).trim() : undefined,
    profile: options.profile ? String(options.profile).trim().toLowerCase() : 'default',
    maxAdjustment: options.maxAdjustment === undefined
      ? ROUTE_POLICY_SUGGEST_MAX_ADJUSTMENT_DEFAULT
      : Number(options.maxAdjustment),
    out: options.out,
    policyOut: options.policyOut,
    json: options.json === true
  };
}

function normalizeRoutePolicyRolloutOptions(options = {}) {
  return {
    suggestion: options.suggestion ? String(options.suggestion).trim() : undefined,
    targetPolicy: options.targetPolicy ? String(options.targetPolicy).trim() : '.sce/config/scene-route-policy.json',
    name: options.name ? String(options.name).trim() : undefined,
    outDir: options.outDir ? String(options.outDir).trim() : SCENE_ROUTE_POLICY_ROLLOUT_DEFAULT_DIR,
    force: options.force === true,
    json: options.json === true
  };
}

function normalizeScenePackageTemplateOptions(options = {}) {
  const hasSpec = typeof options.spec === 'string' && options.spec.trim().length > 0;

  return {
    spec: hasSpec ? String(options.spec).trim() : undefined,
    out: options.out ? String(options.out).trim() : (hasSpec ? 'custom/scene-package.json' : '.sce/templates/scene-package.json'),
    kind: options.kind ? String(options.kind).trim().toLowerCase() : 'scene-template',
    group: options.group ? String(options.group).trim() : 'sce.scene',
    name: options.name ? String(options.name).trim() : undefined,
    version: (options.pkgVersion || options.version) ? String(options.pkgVersion || options.version).trim() : '0.1.0',
    force: options.force === true,
    json: options.json === true
  };
}

function normalizeScenePackageValidateOptions(options = {}) {
  return {
    spec: options.spec ? String(options.spec).trim() : undefined,
    packagePath: options.package ? String(options.package).trim() : undefined,
    specPackage: normalizeRelativePath(options.specPackage || 'custom/scene-package.json') || 'custom/scene-package.json',
    json: options.json === true,
    strict: options.strict === true
  };
}

function normalizeScenePackagePublishOptions(options = {}) {
  return {
    spec: options.spec ? String(options.spec).trim() : undefined,
    specPackage: normalizeRelativePath(options.specPackage || 'custom/scene-package.json') || 'custom/scene-package.json',
    sceneManifest: normalizeRelativePath(options.sceneManifest || 'custom/scene.yaml') || 'custom/scene.yaml',
    outDir: options.outDir ? String(options.outDir).trim() : SCENE_PACKAGE_TEMPLATE_DEFAULT_DIR,
    templateId: options.templateId ? String(options.templateId).trim() : undefined,
    requireOntologyValidation: options.requireOntologyValidation !== false,
    ontologyMinScore: options.ontologyMinScore === undefined || options.ontologyMinScore === null || options.ontologyMinScore === ''
      ? null
      : Number(options.ontologyMinScore),
    dryRun: options.dryRun === true,
    force: options.force === true,
    silent: options.silent === true,
    json: options.json === true
  };
}

function normalizeScenePackagePublishBatchOptions(options = {}) {
  const from331 = options.from331 === true;
  const fallbackSpecPackageDefault = from331 ? 'docs/scene-package.json' : 'custom/scene-package.json';
  const fallbackSceneManifestDefault = from331 ? 'docs/scene.yaml' : 'custom/scene.yaml';

  return {
    from331,
    manifest: options.manifest
      ? String(options.manifest).trim()
      : (from331 ? 'docs/handoffs/handoff-manifest.json' : undefined),
    manifestSpecPath: options.manifestSpecPath ? String(options.manifestSpecPath).trim() : 'specs',
    status: options.status ? String(options.status).trim().toLowerCase() : 'completed',
    include: normalizePathListOption(options.include)
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0),
    fallbackSpecPackage: normalizeRelativePath(options.fallbackSpecPackage || fallbackSpecPackageDefault) || fallbackSpecPackageDefault,
    fallbackSceneManifest: normalizeRelativePath(options.fallbackSceneManifest || fallbackSceneManifestDefault) || fallbackSceneManifestDefault,
    requireOntologyValidation: options.requireOntologyValidation !== false,
    ontologyMinScore: options.ontologyMinScore === undefined || options.ontologyMinScore === null || options.ontologyMinScore === ''
      ? null
      : Number(options.ontologyMinScore),
    ontologyMinAverageScore: options.ontologyMinAverageScore === undefined || options.ontologyMinAverageScore === null || options.ontologyMinAverageScore === ''
      ? SCENE_PACKAGE_BATCH_DEFAULT_ONTOLOGY_MIN_AVERAGE_SCORE
      : Number(options.ontologyMinAverageScore),
    ontologyMinValidRate: options.ontologyMinValidRate === undefined || options.ontologyMinValidRate === null || options.ontologyMinValidRate === ''
      ? SCENE_PACKAGE_BATCH_DEFAULT_ONTOLOGY_MIN_VALID_RATE
      : Number(options.ontologyMinValidRate),
    ontologyReportOut: options.ontologyReportOut ? String(options.ontologyReportOut).trim() : undefined,
    ontologyTaskOut: options.ontologyTaskOut ? String(options.ontologyTaskOut).trim() : undefined,
    ontologyTaskQueueOut: options.ontologyTaskQueueOut ? String(options.ontologyTaskQueueOut).trim() : undefined,
    outDir: options.outDir ? String(options.outDir).trim() : SCENE_PACKAGE_TEMPLATE_DEFAULT_DIR,
    dryRun: options.dryRun === true,
    force: options.force === true,
    strict: options.strict === true,
    json: options.json === true
  };
}

function normalizeScenePackageOntologyBackfillBatchOptions(options = {}) {
  const from331 = options.from331 === true;
  const specPackagePathDefault = from331 ? 'docs/scene-package.json' : 'custom/scene-package.json';

  return {
    from331,
    manifest: options.manifest
      ? String(options.manifest).trim()
      : (from331 ? 'docs/handoffs/handoff-manifest.json' : undefined),
    manifestSpecPath: options.manifestSpecPath ? String(options.manifestSpecPath).trim() : 'specs',
    status: options.status ? String(options.status).trim().toLowerCase() : 'completed',
    include: normalizePathListOption(options.include)
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0),
    specPackagePath: normalizeRelativePath(options.specPackagePath || specPackagePathDefault) || specPackagePathDefault,
    outReport: options.outReport ? String(options.outReport).trim() : undefined,
    dryRun: options.dryRun === true,
    strict: options.strict === true,
    json: options.json === true
  };
}

function normalizeScenePackageInstantiateOptions(options = {}) {
  return {
    template: options.template ? String(options.template).trim() : undefined,
    targetSpec: options.targetSpec ? String(options.targetSpec).trim() : undefined,
    values: options.values ? String(options.values).trim() : undefined,
    force: options.force === true,
    json: options.json === true
  };
}

function normalizeScenePackageRegistryOptions(options = {}) {
  return {
    templateDir: options.templateDir ? String(options.templateDir).trim() : SCENE_PACKAGE_TEMPLATE_DEFAULT_DIR,
    out: options.out ? String(options.out).trim() : undefined,
    strict: options.strict === true,
    json: options.json === true
  };
}

function normalizeScenePackageGateTemplateOptions(options = {}) {
  return {
    out: options.out ? String(options.out).trim() : '.sce/templates/scene-package-gate-policy.json',
    profile: options.profile ? String(options.profile).trim().toLowerCase() : 'baseline',
    force: options.force === true,
    json: options.json === true
  };
}

function normalizeScenePackageGateOptions(options = {}) {
  return {
    registry: options.registry ? String(options.registry).trim() : undefined,
    policy: options.policy ? String(options.policy).trim() : '.sce/templates/scene-package-gate-policy.json',
    spec: options.spec ? String(options.spec).trim() : undefined,
    taskOut: options.taskOut ? String(options.taskOut).trim() : undefined,
    runbookOut: options.runbookOut ? String(options.runbookOut).trim() : undefined,
    syncSpecTasks: options.syncSpecTasks === true,
    out: options.out ? String(options.out).trim() : undefined,
    strict: options.strict === true,
    json: options.json === true
  };
}

function validateSourceOptions(options) {
  if (!options.spec && !options.manifest) {
    return 'either --spec or --manifest is required';
  }

  if (options.spec && options.manifest) {
    return 'use --spec or --manifest, not both';
  }

  return null;
}

function validateRunMode(mode) {
  if (!RUN_MODES.has(mode)) {
    return 'mode must be dry_run or commit';
  }

  return null;
}

function validateRunOptions(options) {
  const sourceError = validateSourceOptions(options);
  if (sourceError) {
    return sourceError;
  }

  const modeError = validateRunMode(options.mode);
  if (modeError) {
    return modeError;
  }

  if (options.bindingPluginDir && (typeof options.bindingPluginDir !== 'string' || String(options.bindingPluginDir).trim().length === 0)) {
    return '--binding-plugin-dir must be a non-empty path';
  }

  if (options.bindingPluginManifest && (typeof options.bindingPluginManifest !== 'string' || String(options.bindingPluginManifest).trim().length === 0)) {
    return '--binding-plugin-manifest must be a non-empty path';
  }

  if (options.moquiConfig && (typeof options.moquiConfig !== 'string' || String(options.moquiConfig).trim().length === 0)) {
    return '--moqui-config must be a non-empty path';
  }

  return null;
}

function validateDoctorOptions(options) {
  const sourceError = validateSourceOptions(options);
  if (sourceError) {
    return sourceError;
  }

  const modeError = validateRunMode(options.mode);
  if (modeError) {
    return modeError;
  }

  if (options.syncSpecTasks && !options.spec) {
    return '--sync-spec-tasks requires --spec source';
  }

  if (options.bindingPluginDir && (typeof options.bindingPluginDir !== 'string' || String(options.bindingPluginDir).trim().length === 0)) {
    return '--binding-plugin-dir must be a non-empty path';
  }

  if (options.bindingPluginManifest && (typeof options.bindingPluginManifest !== 'string' || String(options.bindingPluginManifest).trim().length === 0)) {
    return '--binding-plugin-manifest must be a non-empty path';
  }

  if (options.moquiConfig && (typeof options.moquiConfig !== 'string' || String(options.moquiConfig).trim().length === 0)) {
    return '--moqui-config must be a non-empty path';
  }

  return null;
}

function validateScaffoldOptions(options) {
  if (!options.spec) {
    return '--spec is required for scaffold';
  }

  if (options.type && !SCAFFOLD_TYPES.has(options.type)) {
    return 'type must be erp or hybrid';
  }

  if (!options.output || typeof options.output !== 'string') {
    return '--output must be a non-empty relative path';
  }

  return null;
}

function validateEvalOptions(options) {
  if (!options.result && !options.feedback) {
    return 'at least one of --result or --feedback is required';
  }

  if (options.syncSpecTasks && !options.spec) {
    return '--sync-spec-tasks requires --spec source';
  }

  if (options.env && !options.evalConfig) {
    return '--env requires --eval-config';
  }

  if (options.profile && !EVAL_CONFIG_TEMPLATE_PROFILES.has(options.profile)) {
    return `profile must be one of ${Array.from(EVAL_CONFIG_TEMPLATE_PROFILES).join(', ')}`;
  }

  if (options.profileRules && (typeof options.profileRules !== 'string' || String(options.profileRules).trim().length === 0)) {
    return '--profile-rules must be a non-empty path';
  }

  return null;
}

function validateEvalPolicyTemplateOptions(options) {
  if (!options.out || typeof options.out !== 'string') {
    return '--out must be a non-empty path';
  }

  return null;
}

function validateEvalConfigTemplateOptions(options) {
  if (!options.out || typeof options.out !== 'string') {
    return '--out must be a non-empty path';
  }

  if (!EVAL_CONFIG_TEMPLATE_PROFILES.has(options.profile)) {
    return `profile must be one of ${Array.from(EVAL_CONFIG_TEMPLATE_PROFILES).join(', ')}`;
  }

  return null;
}

function validateEvalProfileRulesTemplateOptions(options) {
  if (!options.out || typeof options.out !== 'string') {
    return '--out must be a non-empty path';
  }

  return null;
}

function validateCatalogOptions(options) {
  if (options.spec !== undefined && (typeof options.spec !== 'string' || options.spec.trim().length === 0)) {
    return '--spec must be a non-empty spec name';
  }

  if (!options.specManifest || typeof options.specManifest !== 'string' || options.specManifest.trim().length === 0) {
    return '--spec-manifest must be a non-empty relative path';
  }

  if (path.isAbsolute(options.specManifest)) {
    return '--spec-manifest must be a relative path';
  }

  if (options.domain !== undefined && (typeof options.domain !== 'string' || options.domain.trim().length === 0)) {
    return '--domain must be a non-empty value';
  }

  if (options.kind !== undefined && (typeof options.kind !== 'string' || options.kind.trim().length === 0)) {
    return '--kind must be a non-empty value';
  }

  if (options.out !== undefined && (typeof options.out !== 'string' || options.out.trim().length === 0)) {
    return '--out must be a non-empty path';
  }

  return null;
}

function validateRouteOptions(options) {
  const catalogValidationError = validateCatalogOptions(options);
  if (catalogValidationError) {
    return catalogValidationError;
  }

  const modeError = validateRunMode(options.mode);
  if (modeError) {
    return modeError;
  }

  if (options.sceneRef !== undefined && (typeof options.sceneRef !== 'string' || options.sceneRef.trim().length === 0)) {
    return '--scene-ref must be a non-empty value';
  }

  if (options.query !== undefined && (typeof options.query !== 'string' || options.query.trim().length === 0)) {
    return '--query must be a non-empty value';
  }

  if (options.routePolicy && (typeof options.routePolicy !== 'string' || options.routePolicy.trim().length === 0)) {
    return '--route-policy must be a non-empty path';
  }

  if (!options.spec && !options.sceneRef && !options.domain && !options.kind && !options.query) {
    return 'at least one selector is required (--spec/--scene-ref/--domain/--kind/--query)';
  }

  return null;
}

function validateRoutePolicyTemplateOptions(options) {
  if (!options.out || typeof options.out !== 'string') {
    return '--out must be a non-empty path';
  }

  if (!ROUTE_POLICY_TEMPLATE_PROFILES.has(options.profile)) {
    return `profile must be one of ${Array.from(ROUTE_POLICY_TEMPLATE_PROFILES).join(', ')}`;
  }

  return null;
}

function validateRoutePolicySuggestOptions(options) {
  const hasEvalPaths = Array.isArray(options.eval) && options.eval.length > 0;
  const hasEvalDir = typeof options.evalDir === 'string' && options.evalDir.trim().length > 0;

  if (!hasEvalPaths && !hasEvalDir) {
    return 'at least one eval source is required (--eval/--eval-dir)';
  }

  if (hasEvalPaths && options.eval.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    return '--eval must contain non-empty path values';
  }

  if (options.evalDir !== undefined && (!options.evalDir || typeof options.evalDir !== 'string')) {
    return '--eval-dir must be a non-empty path';
  }

  if (options.routePolicy !== undefined && (!options.routePolicy || typeof options.routePolicy !== 'string')) {
    return '--route-policy must be a non-empty path';
  }

  if (!ROUTE_POLICY_TEMPLATE_PROFILES.has(options.profile)) {
    return `profile must be one of ${Array.from(ROUTE_POLICY_TEMPLATE_PROFILES).join(', ')}`;
  }

  if (!Number.isFinite(options.maxAdjustment)) {
    return '--max-adjustment must be a number';
  }

  if (options.maxAdjustment < 0) {
    return '--max-adjustment must be greater than or equal to 0';
  }

  if (options.out !== undefined && (typeof options.out !== 'string' || options.out.trim().length === 0)) {
    return '--out must be a non-empty path';
  }

  if (options.policyOut !== undefined && (typeof options.policyOut !== 'string' || options.policyOut.trim().length === 0)) {
    return '--policy-out must be a non-empty path';
  }

  return null;
}

function validateRoutePolicyRolloutOptions(options) {
  if (!options.suggestion || typeof options.suggestion !== 'string') {
    return '--suggestion is required';
  }

  if (!options.targetPolicy || typeof options.targetPolicy !== 'string') {
    return '--target-policy must be a non-empty path';
  }

  if (!options.outDir || typeof options.outDir !== 'string') {
    return '--out-dir must be a non-empty path';
  }

  if (options.name !== undefined && sanitizeSceneRoutePolicyRolloutName(options.name).length === 0) {
    return '--name must contain at least one alphanumeric character';
  }

  return null;
}

function validateScenePackageTemplateOptions(options) {
  if (options.spec !== undefined && (!options.spec || typeof options.spec !== 'string')) {
    return '--spec must be a non-empty spec name';
  }

  if (!options.out || typeof options.out !== 'string') {
    return '--out must be a non-empty path';
  }

  if (!SCENE_PACKAGE_KINDS.has(options.kind)) {
    return `kind must be one of ${Array.from(SCENE_PACKAGE_KINDS).join(', ')}`;
  }

  if (!options.group || typeof options.group !== 'string') {
    return '--group must be a non-empty value';
  }

  if (options.name !== undefined && (typeof options.name !== 'string' || options.name.trim().length === 0)) {
    return '--name must be a non-empty value';
  }

  if (!options.version || typeof options.version !== 'string') {
    return '--pkg-version must be a non-empty semantic version';
  }

  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(options.version)) {
    return '--pkg-version must be a semantic version (x.y.z)';
  }

  return null;
}

function validateScenePackageValidateOptions(options) {
  if (!options.spec && !options.packagePath) {
    return 'either --spec or --package is required';
  }

  if (options.spec && options.packagePath) {
    return 'use --spec or --package, not both';
  }

  if (options.spec !== undefined && (typeof options.spec !== 'string' || options.spec.trim().length === 0)) {
    return '--spec must be a non-empty spec name';
  }

  if (options.packagePath !== undefined && (typeof options.packagePath !== 'string' || options.packagePath.trim().length === 0)) {
    return '--package must be a non-empty path';
  }

  if (!options.specPackage || typeof options.specPackage !== 'string') {
    return '--spec-package must be a non-empty relative path';
  }

  if (path.isAbsolute(options.specPackage)) {
    return '--spec-package must be a relative path';
  }

  return null;
}

function validateScenePackagePublishOptions(options) {
  if (!options.spec || typeof options.spec !== 'string') {
    return '--spec is required';
  }

  if (!options.specPackage || typeof options.specPackage !== 'string' || path.isAbsolute(options.specPackage)) {
    return '--spec-package must be a non-empty relative path';
  }

  if (!options.sceneManifest || typeof options.sceneManifest !== 'string' || path.isAbsolute(options.sceneManifest)) {
    return '--scene-manifest must be a non-empty relative path';
  }

  if (!options.outDir || typeof options.outDir !== 'string') {
    return '--out-dir must be a non-empty path';
  }

  if (options.templateId !== undefined && sanitizeScenePackageName(options.templateId).length === 0) {
    return '--template-id must contain at least one alphanumeric character';
  }

  if (options.ontologyMinScore !== undefined && options.ontologyMinScore !== null
    && (!Number.isFinite(options.ontologyMinScore) || options.ontologyMinScore < 0 || options.ontologyMinScore > 100)) {
    return '--ontology-min-score must be a number between 0 and 100';
  }

  if (options.ontologyMinAverageScore !== undefined && options.ontologyMinAverageScore !== null
    && (!Number.isFinite(options.ontologyMinAverageScore) || options.ontologyMinAverageScore < 0 || options.ontologyMinAverageScore > 100)) {
    return '--ontology-min-average-score must be a number between 0 and 100';
  }

  if (options.ontologyMinValidRate !== undefined && options.ontologyMinValidRate !== null
    && (!Number.isFinite(options.ontologyMinValidRate) || options.ontologyMinValidRate < 0 || options.ontologyMinValidRate > 100)) {
    return '--ontology-min-valid-rate must be a number between 0 and 100';
  }

  return null;
}

function validateScenePackageInstantiateOptions(options) {
  if (!options.template || typeof options.template !== 'string') {
    return '--template is required';
  }

  if (!options.targetSpec || typeof options.targetSpec !== 'string') {
    return '--target-spec is required';
  }

  if (options.values !== undefined && (typeof options.values !== 'string' || options.values.trim().length === 0)) {
    return '--values must be a non-empty path';
  }

  return null;
}

function validateScenePackageRegistryOptions(options) {
  if (!options.templateDir || typeof options.templateDir !== 'string') {
    return '--template-dir must be a non-empty path';
  }

  if (options.out !== undefined && (typeof options.out !== 'string' || options.out.trim().length === 0)) {
    return '--out must be a non-empty path';
  }

  return null;
}

function validateScenePackageGateTemplateOptions(options) {
  if (!options.out || typeof options.out !== 'string') {
    return '--out must be a non-empty path';
  }

  if (!SCENE_PACKAGE_GATE_TEMPLATE_PROFILES.has(options.profile)) {
    return `profile must be one of ${Array.from(SCENE_PACKAGE_GATE_TEMPLATE_PROFILES).join(', ')}`;
  }

  return null;
}

function validateScenePackageGateOptions(options) {
  if (!options.registry || typeof options.registry !== 'string') {
    return '--registry is required';
  }

  if (!options.policy || typeof options.policy !== 'string') {
    return '--policy must be a non-empty path';
  }

  if (options.spec !== undefined && (typeof options.spec !== 'string' || options.spec.trim().length === 0)) {
    return '--spec must be a non-empty spec name';
  }

  if (options.taskOut !== undefined && (typeof options.taskOut !== 'string' || options.taskOut.trim().length === 0)) {
    return '--task-out must be a non-empty path';
  }

  if (options.runbookOut !== undefined && (typeof options.runbookOut !== 'string' || options.runbookOut.trim().length === 0)) {
    return '--runbook-out must be a non-empty path';
  }

  if (options.syncSpecTasks && !options.spec) {
    return '--sync-spec-tasks requires --spec source';
  }

  if (options.out !== undefined && (typeof options.out !== 'string' || options.out.trim().length === 0)) {
    return '--out must be a non-empty path';
  }

  return null;
}

async function loadSceneManifest(loader, options, projectRoot) {
  if (options.spec) {
    return loader.loadFromSpec(options.spec, options.specManifest);
  }

  const manifestPath = resolvePath(projectRoot, options.manifest);
  return loader.loadFromFile(manifestPath);
}

async function buildRuntimeContext(options, projectRoot, readJson = fs.readJson) {
  const context = {};

  if (options.contextFile) {
    const contextPath = resolvePath(projectRoot, options.contextFile);
    const fileContext = await readJson(contextPath);
    if (!fileContext || typeof fileContext !== 'object' || Array.isArray(fileContext)) {
      throw new Error('context file must contain a JSON object');
    }
    Object.assign(context, fileContext);
  }

  if (options.approved) {
    context.approved = true;
  }

  if (options.dualApproved) {
    context.dualApproved = true;
  }

  if (options.allowHybridCommit) {
    context.allowHybridCommit = true;
  }

  const safetyChecks = {
    ...(context.safetyChecks && typeof context.safetyChecks === 'object' ? context.safetyChecks : {})
  };

  if (options.safetyPreflight) {
    safetyChecks.preflight = true;
  }

  if (options.safetyStopChannel) {
    safetyChecks.stopChannel = true;
  }

  if (Object.keys(safetyChecks).length > 0) {
    context.safetyChecks = safetyChecks;
  }

  return context;
}

function buildManifestSummary(sceneManifest) {
  const metadata = sceneManifest.metadata || {};
  const spec = sceneManifest.spec || {};
  const capability = spec.capability_contract || {};
  const governance = spec.governance_contract || {};
  const approval = governance.approval || {};
  const bindings = Array.isArray(capability.bindings) ? capability.bindings : [];
  const sideEffectBindings = bindings.filter((binding) => binding && binding.side_effect === true).length;

  return {
    valid: true,
    scene_ref: metadata.obj_id || null,
    scene_version: metadata.obj_version || null,
    title: metadata.title || null,
    domain: spec.domain || 'erp',
    risk_level: governance.risk_level || 'medium',
    approval_required: approval.required === true,
    binding_count: bindings.length,
    side_effect_binding_count: sideEffectBindings
  };
}

function normalizeBindingPluginReport(bindingPluginLoad) {
  if (!bindingPluginLoad || typeof bindingPluginLoad !== 'object') {
    return null;
  }

  return {
    handlers_loaded: Number.isFinite(bindingPluginLoad.handlers_loaded) ? Number(bindingPluginLoad.handlers_loaded) : 0,
    plugin_dirs: Array.isArray(bindingPluginLoad.plugin_dirs)
      ? bindingPluginLoad.plugin_dirs.filter((item) => typeof item === 'string')
      : [],
    plugin_files: Array.isArray(bindingPluginLoad.plugin_files)
      ? bindingPluginLoad.plugin_files.filter((item) => typeof item === 'string')
      : [],
    manifest_path: typeof bindingPluginLoad.manifest_path === 'string' && bindingPluginLoad.manifest_path.trim().length > 0
      ? bindingPluginLoad.manifest_path
      : null,
    manifest_loaded: bindingPluginLoad.manifest_loaded === true,
    warnings: Array.isArray(bindingPluginLoad.warnings)
      ? bindingPluginLoad.warnings.map((warning) => String(warning))
      : []
  };
}

function buildDoctorSummary(sceneManifest, diagnostics) {
  const manifestSummary = buildManifestSummary(sceneManifest);
  const blockers = [];

  if (diagnostics.planError) {
    blockers.push(`plan validation failed: ${diagnostics.planError}`);
  }

  if (diagnostics.policy && diagnostics.policy.allowed === false) {
    for (const reason of diagnostics.policy.reasons || []) {
      blockers.push(`policy blocked: ${reason}`);
    }
  }

  if (diagnostics.adapterReadiness && diagnostics.adapterReadiness.ready === false) {
    if (diagnostics.adapterReadiness.error) {
      blockers.push(`adapter readiness failed: ${diagnostics.adapterReadiness.error}`);
    }

    const failedChecks = (diagnostics.adapterReadiness.checks || [])
      .filter((item) => item && item.passed === false)
      .map((item) => item.name);

    if (failedChecks.length > 0) {
      blockers.push(`adapter checks failed: ${failedChecks.join(', ')}`);
    }
  }

  return {
    status: blockers.length === 0 ? 'healthy' : 'blocked',
    trace_id: diagnostics.traceId || null,
    scene_ref: manifestSummary.scene_ref,
    scene_version: manifestSummary.scene_version,
    domain: manifestSummary.domain,
    risk_level: manifestSummary.risk_level,
    mode: diagnostics.mode,
    plan: {
      valid: !diagnostics.planError,
      node_count: diagnostics.plan ? diagnostics.plan.nodes.length : 0,
      error: diagnostics.planError || null
    },
    policy: diagnostics.policy,
    adapter_readiness: diagnostics.adapterReadiness || null,
    binding_plugins: normalizeBindingPluginReport(diagnostics.bindingPlugins),
    blockers
  };
}


function createDoctorSuggestion(code, title, action, priority = 'medium') {
  return { code, title, action, priority };
}

function dedupeDoctorSuggestions(suggestions) {
  const seen = new Set();
  return suggestions.filter((suggestion) => {
    const key = `${suggestion.code}:${suggestion.action}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildDoctorSuggestions(report, sceneManifest) {
  const suggestions = [];
  const domain = ((sceneManifest.spec || {}).domain || report.domain || 'erp').toLowerCase();
  const policyReasons = report.policy && Array.isArray(report.policy.reasons)
    ? report.policy.reasons
    : [];

  if (report.plan && !report.plan.valid) {
    suggestions.push(createDoctorSuggestion(
      'plan-invalid',
      'Fix scene bindings and idempotency fields',
      'Run `sce scene validate` and ensure side-effect bindings have idempotency key.',
      'high'
    ));
  }

  for (const reason of policyReasons) {
    const normalizedReason = String(reason || '').toLowerCase();

    if (normalizedReason.includes('approval is required for commit')) {
      suggestions.push(createDoctorSuggestion(
        'approval-required',
        'Collect approval before commit',
        'After approval workflow completes, rerun with `--approved`.',
        'high'
      ));
      continue;
    }

    if (normalizedReason.includes('high-risk commit requires approval')) {
      suggestions.push(createDoctorSuggestion(
        'high-risk-approval',
        'Escalate high-risk approval gate',
        'Keep run mode in dry_run until explicit approval evidence is recorded.',
        'high'
      ));
      continue;
    }

    if (normalizedReason.includes('hybrid commit is disabled in runtime pilot')) {
      suggestions.push(createDoctorSuggestion(
        'hybrid-commit-disabled',
        'Use hybrid dry_run in current pilot',
        'Run hybrid scene with `--mode dry_run` and collect readiness evidence only.',
        'high'
      ));
      continue;
    }

    if (normalizedReason.includes('robot safety preflight check failed')) {
      suggestions.push(createDoctorSuggestion(
        'robot-preflight',
        'Repair robot preflight checks',
        'Verify robot adapter preflight pipeline and rerun with `--safety-preflight` when available.',
        'critical'
      ));
      continue;
    }

    if (normalizedReason.includes('robot stop channel is unavailable')) {
      suggestions.push(createDoctorSuggestion(
        'robot-stop-channel',
        'Restore emergency stop channel',
        'Validate stop-channel connectivity before any robot or hybrid commit.',
        'critical'
      ));
      continue;
    }

    if (normalizedReason.includes('critical robot commit requires dual approval')) {
      suggestions.push(createDoctorSuggestion(
        'dual-approval-required',
        'Collect dual approval for critical robot change',
        'Set dual-approval context only after two approvers sign off.',
        'critical'
      ));
      continue;
    }

    suggestions.push(createDoctorSuggestion(
      'policy-blocked',
      'Resolve policy blocker',
      `Review policy reason: ${reason}`,
      'high'
    ));
  }

  if (report.adapter_readiness && report.adapter_readiness.ready === false) {
    const checks = Array.isArray(report.adapter_readiness.checks)
      ? report.adapter_readiness.checks
      : [];

    for (const check of checks) {
      if (check && check.passed === false) {
        suggestions.push(createDoctorSuggestion(
          'adapter-readiness',
          'Fix adapter readiness checks',
          `Repair adapter check "${check.name}" and rerun \`sce scene doctor --check-adapter\`.`,
          domain === 'erp' ? 'medium' : 'high'
        ));
      }
    }

    if (report.adapter_readiness.error) {
      suggestions.push(createDoctorSuggestion(
        'adapter-runtime-error',
        'Stabilize adapter readiness probe',
        `Handle adapter probe error: ${report.adapter_readiness.error}`,
        'high'
      ));
    }
  }

  const pluginWarnings = report.binding_plugins && Array.isArray(report.binding_plugins.warnings)
    ? report.binding_plugins.warnings
    : [];

  if (pluginWarnings.some((warning) => String(warning || '').toLowerCase().includes('manifest not found'))) {
    suggestions.push(createDoctorSuggestion(
      'binding-plugin-manifest-missing',
      'Provide binding plugin manifest or disable manifest load',
      'Create manifest via `.sce/config/scene-binding-plugins.json` or rerun doctor with `--no-binding-plugin-manifest-load`.',
      'medium'
    ));
  }

  if (pluginWarnings.some((warning) => {
    const normalized = String(warning || '').toLowerCase();
    return normalized.includes('failed to load binding plugin') || normalized.includes('invalid binding handler in plugin');
  })) {
    suggestions.push(createDoctorSuggestion(
      'binding-plugin-load-failed',
      'Repair failed binding plugin modules',
      'Inspect plugin warnings and fix plugin exports/handlers before commit execution.',
      'high'
    ));
  }

  if (suggestions.length === 0) {
    suggestions.push(createDoctorSuggestion(
      'ready-to-run',
      'Scene is healthy for next execution step',
      report.mode === 'commit'
        ? 'Proceed with `sce scene run --mode commit` under normal approval flow.'
        : 'Proceed with `sce scene run --mode dry_run` to capture execution evidence.',
      'low'
    ));
  }

  return dedupeDoctorSuggestions(suggestions);
}

function buildDoctorTodoMarkdown(report, suggestions) {
  const lines = [
    '# Scene Doctor Remediation Checklist',
    '',
    `- Scene: ${report.scene_ref}@${report.scene_version}`,
    `- Domain: ${report.domain}`,
    `- Mode: ${report.mode}`,
    `- Status: ${report.status}`,
    `- Generated At: ${new Date().toISOString()}`,
    ''
  ];

  if (report.blockers.length > 0) {
    lines.push('## Blockers');
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker}`);
    }
    lines.push('');
  }

  lines.push('## Suggested Actions');
  for (const suggestion of suggestions) {
    lines.push(`- [ ] [${suggestion.priority}] ${suggestion.title}`);
    lines.push(`  - ${suggestion.action}`);
  }
  lines.push('');

  return lines.join('\n');
}

async function writeDoctorTodo(options, report, projectRoot, fileSystem = fs) {
  if (!options.todoOut) {
    return null;
  }

  const todoPath = resolvePath(projectRoot, options.todoOut);
  const markdown = buildDoctorTodoMarkdown(report, report.suggestions || []);

  await fileSystem.ensureDir(path.dirname(todoPath));
  await fileSystem.writeFile(todoPath, markdown, 'utf8');

  return todoPath;
}

function buildDoctorTaskDraft(report, suggestions) {
  const ordered = [...suggestions].sort((left, right) => {
    const weights = { critical: 0, high: 1, medium: 2, low: 3 };
    const leftWeight = Object.prototype.hasOwnProperty.call(weights, left.priority) ? weights[left.priority] : 99;
    const rightWeight = Object.prototype.hasOwnProperty.call(weights, right.priority) ? weights[right.priority] : 99;

    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight;
    }

    return left.title.localeCompare(right.title);
  });

  const lines = [
    '# Doctor Task Draft',
    '',
    `Scene: ${report.scene_ref}@${report.scene_version}`,
    `Domain: ${report.domain}`,
    `Mode: ${report.mode}`,
    `Status: ${report.status}`,
    `Trace: ${report.trace_id || 'n/a'}`,
    '',
    '## Suggested Tasks',
    ''
  ];

  ordered.forEach((suggestion, index) => {
    const taskId = index + 1;
    const code = suggestion.code || 'unknown';
    lines.push(`- [ ] ${taskId} [${suggestion.priority}] [${code}] ${suggestion.title}`);
    lines.push(`  - ${suggestion.action}`);
  });

  lines.push('');
  return lines.join('\n');
}

async function writeDoctorTaskDraft(options, report, projectRoot, fileSystem = fs) {
  if (!options.taskOut) {
    return null;
  }

  const taskPath = resolvePath(projectRoot, options.taskOut);
  const markdown = buildDoctorTaskDraft(report, report.suggestions || []);

  await fileSystem.ensureDir(path.dirname(taskPath));
  await fileSystem.writeFile(taskPath, markdown, 'utf8');

  return taskPath;
}

function buildDoctorFeedbackTemplate(report) {
  const lines = [
    '# Doctor Execution Feedback Template',
    '',
    `Scene: ${report.scene_ref}@${report.scene_version}`,
    `Domain: ${report.domain}`,
    `Mode: ${report.mode}`,
    `Status: ${report.status}`,
    `Trace: ${report.trace_id || 'n/a'}`,
    '',
    '## Task Feedback Records',
    ''
  ];

  const suggestions = Array.isArray(report.suggestions) ? report.suggestions : [];
  const suggestionByCode = new Map();
  for (const suggestion of suggestions) {
    if (suggestion && suggestion.code && !suggestionByCode.has(suggestion.code)) {
      suggestionByCode.set(suggestion.code, suggestion);
    }
  }

  const taskSync = report.task_sync || null;
  const addedTasks = taskSync && Array.isArray(taskSync.added_tasks) ? taskSync.added_tasks : [];

  if (addedTasks.length === 0) {
    lines.push('- No synced actionable tasks in this doctor run.');
    lines.push('');
    return lines.join('\n');
  }

  for (const task of addedTasks) {
    const suggestionCode = task.suggestion_code || 'unknown';
    const suggestion = suggestionByCode.get(suggestionCode) || null;

    lines.push(`### Task ${task.task_id}: ${task.title}`);
    lines.push(`- Priority: ${task.priority}`);
    lines.push(`- Suggestion Code: ${suggestionCode}`);
    lines.push(`- Trace ID: ${task.trace_id || report.trace_id || 'n/a'}`);
    lines.push(`- Scene Ref: ${report.scene_ref}`);
    if (suggestion && suggestion.action) {
      lines.push(`- Planned Action: ${suggestion.action}`);
    }
    lines.push('');
    lines.push('- [ ] Status: pending | in_progress | done | blocked');
    lines.push('- [ ] Owner:');
    lines.push('- [ ] Evidence Paths:');
    lines.push('- [ ] Completion Notes:');
    lines.push('- [ ] Eval Update:');
    lines.push('  - cycle_time_ms:');
    lines.push('  - policy_violation_count:');
    lines.push('  - node_failure_count:');
    lines.push('  - manual_takeover_rate:');
    lines.push('');
  }

  return lines.join('\n');
}

async function writeDoctorFeedbackTemplate(options, report, projectRoot, fileSystem = fs) {
  if (!options.feedbackOut) {
    return null;
  }

  const feedbackPath = resolvePath(projectRoot, options.feedbackOut);
  const markdown = buildDoctorFeedbackTemplate(report);

  await fileSystem.ensureDir(path.dirname(feedbackPath));
  await fileSystem.writeFile(feedbackPath, markdown, 'utf8');

  return feedbackPath;
}

function parseSceneDescriptor(rawValue) {
  const value = String(rawValue || '').trim();
  const atIndex = value.lastIndexOf('@');

  if (atIndex <= 0 || atIndex === value.length - 1) {
    return {
      scene_ref: value || null,
      scene_version: null
    };
  }

  return {
    scene_ref: value.slice(0, atIndex).trim() || null,
    scene_version: value.slice(atIndex + 1).trim() || null
  };
}

function normalizeFeedbackStatus(rawStatus) {
  const status = String(rawStatus || '').trim().toLowerCase();

  if (!status || status.includes('|')) {
    return null;
  }

  if (status.startsWith('done')) {
    return 'done';
  }

  if (status.startsWith('in_progress') || status.startsWith('in-progress')) {
    return 'in_progress';
  }

  if (status.startsWith('blocked')) {
    return 'blocked';
  }

  if (status.startsWith('pending')) {
    return 'pending';
  }

  return status;
}

function parseFeedbackNumber(rawValue) {
  const match = String(rawValue || '').match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) ? value : null;
}

function parseDoctorFeedbackTemplate(markdown = '') {
  const lines = String(markdown || '').split(/\r?\n/);
  const feedback = {
    scene_ref: null,
    scene_version: null,
    domain: null,
    mode: null,
    status: null,
    trace_id: null,
    tasks: []
  };

  let currentTask = null;

  const pushTask = () => {
    if (!currentTask) {
      return;
    }

    feedback.tasks.push(currentTask);
    currentTask = null;
  };

  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();

    if (!line) {
      continue;
    }

    if (line.startsWith('Scene:')) {
      const parsed = parseSceneDescriptor(line.slice('Scene:'.length));
      feedback.scene_ref = parsed.scene_ref;
      feedback.scene_version = parsed.scene_version;
      continue;
    }

    if (line.startsWith('Domain:')) {
      feedback.domain = line.slice('Domain:'.length).trim() || null;
      continue;
    }

    if (line.startsWith('Mode:')) {
      feedback.mode = line.slice('Mode:'.length).trim() || null;
      continue;
    }

    if (line.startsWith('Status:')) {
      feedback.status = line.slice('Status:'.length).trim() || null;
      continue;
    }

    if (line.startsWith('Trace:')) {
      const traceId = line.slice('Trace:'.length).trim();
      feedback.trace_id = traceId && traceId !== 'n/a' ? traceId : null;
      continue;
    }

    const taskHeadingMatch = line.match(/^###\s+Task\s+(\d+)\s*:\s*(.+)$/i);
    if (taskHeadingMatch) {
      pushTask();

      const taskId = Number.parseInt(taskHeadingMatch[1], 10);
      currentTask = {
        task_id: Number.isFinite(taskId) ? taskId : null,
        title: taskHeadingMatch[2].trim(),
        priority: null,
        suggestion_code: null,
        trace_id: feedback.trace_id,
        scene_ref: feedback.scene_ref,
        planned_action: null,
        status: null,
        owner: null,
        evidence_paths: null,
        completion_notes: null,
        eval_update: {
          cycle_time_ms: null,
          policy_violation_count: null,
          node_failure_count: null,
          manual_takeover_rate: null
        }
      };
      continue;
    }

    if (!currentTask) {
      continue;
    }

    if (line.startsWith('- Priority:')) {
      currentTask.priority = line.slice('- Priority:'.length).trim() || null;
      continue;
    }

    if (line.startsWith('- Suggestion Code:')) {
      currentTask.suggestion_code = line.slice('- Suggestion Code:'.length).trim() || null;
      continue;
    }

    if (line.startsWith('- Trace ID:')) {
      const traceId = line.slice('- Trace ID:'.length).trim();
      currentTask.trace_id = traceId && traceId !== 'n/a' ? traceId : null;
      continue;
    }

    if (line.startsWith('- Scene Ref:')) {
      currentTask.scene_ref = line.slice('- Scene Ref:'.length).trim() || null;
      continue;
    }

    if (line.startsWith('- Planned Action:')) {
      currentTask.planned_action = line.slice('- Planned Action:'.length).trim() || null;
      continue;
    }

    const normalizedChecklistLine = line.replace(/^-\s*\[[ xX~-]\]\s*/, '- ');

    if (normalizedChecklistLine.startsWith('- Status:')) {
      const statusValue = normalizedChecklistLine.slice('- Status:'.length).trim();
      currentTask.status = normalizeFeedbackStatus(statusValue);
      continue;
    }

    if (normalizedChecklistLine.startsWith('- Owner:')) {
      const ownerValue = normalizedChecklistLine.slice('- Owner:'.length).trim();
      currentTask.owner = ownerValue || null;
      continue;
    }

    if (normalizedChecklistLine.startsWith('- Evidence Paths:')) {
      const evidencePathsValue = normalizedChecklistLine.slice('- Evidence Paths:'.length).trim();
      currentTask.evidence_paths = evidencePathsValue || null;
      continue;
    }

    if (normalizedChecklistLine.startsWith('- Completion Notes:')) {
      const completionNotesValue = normalizedChecklistLine.slice('- Completion Notes:'.length).trim();
      currentTask.completion_notes = completionNotesValue || null;
      continue;
    }

    const cycleMatch = line.match(/^[-*]\s*cycle_time_ms:\s*(.*)$/i);
    if (cycleMatch) {
      currentTask.eval_update.cycle_time_ms = parseFeedbackNumber(cycleMatch[1]);
      continue;
    }

    const policyMatch = line.match(/^[-*]\s*policy_violation_count:\s*(.*)$/i);
    if (policyMatch) {
      currentTask.eval_update.policy_violation_count = parseFeedbackNumber(policyMatch[1]);
      continue;
    }

    const nodeFailureMatch = line.match(/^[-*]\s*node_failure_count:\s*(.*)$/i);
    if (nodeFailureMatch) {
      currentTask.eval_update.node_failure_count = parseFeedbackNumber(nodeFailureMatch[1]);
      continue;
    }

    const manualTakeoverMatch = line.match(/^[-*]\s*manual_takeover_rate:\s*(.*)$/i);
    if (manualTakeoverMatch) {
      currentTask.eval_update.manual_takeover_rate = parseFeedbackNumber(manualTakeoverMatch[1]);
    }
  }

  pushTask();
  return feedback;
}

function averageOrNull(values) {
  const numericValues = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (numericValues.length === 0) {
    return null;
  }

  const sum = numericValues.reduce((acc, current) => acc + current, 0);
  return Number((sum / numericValues.length).toFixed(3));
}

function buildFeedbackTaskSummary(tasks = []) {
  const summary = {
    total: tasks.length,
    done: 0,
    in_progress: 0,
    pending: 0,
    blocked: 0,
    unknown: 0,
    completion_rate: 0,
    blocked_rate: 0,
    evidence_coverage_rate: 0
  };

  if (tasks.length === 0) {
    return summary;
  }

  let evidenceCount = 0;

  for (const task of tasks) {
    const status = task && task.status ? task.status : 'unknown';

    if (Object.prototype.hasOwnProperty.call(summary, status)) {
      summary[status] += 1;
    } else {
      summary.unknown += 1;
    }

    if (task && task.evidence_paths) {
      evidenceCount += 1;
    }
  }

  summary.completion_rate = Number((summary.done / tasks.length).toFixed(3));
  summary.blocked_rate = Number((summary.blocked / tasks.length).toFixed(3));
  summary.evidence_coverage_rate = Number((evidenceCount / tasks.length).toFixed(3));

  return summary;
}

function buildFeedbackMetricSummary(tasks = []) {
  const cycleTimes = [];
  const policyViolations = [];
  const nodeFailures = [];
  const manualTakeoverRates = [];

  for (const task of tasks) {
    if (!task || !task.eval_update) {
      continue;
    }

    cycleTimes.push(task.eval_update.cycle_time_ms);
    policyViolations.push(task.eval_update.policy_violation_count);
    nodeFailures.push(task.eval_update.node_failure_count);
    manualTakeoverRates.push(task.eval_update.manual_takeover_rate);
  }

  return {
    avg_cycle_time_ms: averageOrNull(cycleTimes),
    avg_policy_violation_count: averageOrNull(policyViolations),
    avg_node_failure_count: averageOrNull(nodeFailures),
    avg_manual_takeover_rate: averageOrNull(manualTakeoverRates)
  };
}

function evaluateFeedbackScore(taskSummary, metricSummary, target = {}) {
  if (!taskSummary || taskSummary.total === 0) {
    return {
      score: null,
      recommendations: ['No feedback tasks found. Sync doctor tasks and fill feedback template before evaluation.']
    };
  }

  let score = 1;
  const recommendations = [];

  const minCompletionRate = typeof target.min_completion_rate === 'number' ? target.min_completion_rate : 0.8;
  const maxBlockedRate = typeof target.max_blocked_rate === 'number' ? target.max_blocked_rate : 0;
  const maxPolicyViolationCount = typeof target.max_policy_violation_count === 'number' ? target.max_policy_violation_count : 0;
  const maxNodeFailureCount = typeof target.max_node_failure_count === 'number' ? target.max_node_failure_count : 0;
  const maxManualTakeoverRate = typeof target.max_manual_takeover_rate === 'number' ? target.max_manual_takeover_rate : 0.2;
  const maxCycleTimeMs = typeof target.max_cycle_time_ms === 'number' ? target.max_cycle_time_ms : null;

  if (taskSummary.completion_rate < minCompletionRate) {
    score -= 0.2;
    recommendations.push(`Increase completion rate to at least ${minCompletionRate}.`);
  }

  if (taskSummary.blocked_rate > maxBlockedRate) {
    score -= 0.2;
    recommendations.push(`Reduce blocked task rate to ${maxBlockedRate} or lower.`);
  }

  if (
    typeof metricSummary.avg_policy_violation_count === 'number'
    && metricSummary.avg_policy_violation_count > maxPolicyViolationCount
  ) {
    score -= 0.2;
    recommendations.push('Lower average policy_violation_count in feedback records.');
  }

  if (
    typeof metricSummary.avg_node_failure_count === 'number'
    && metricSummary.avg_node_failure_count > maxNodeFailureCount
  ) {
    score -= 0.2;
    recommendations.push('Lower average node_failure_count in feedback records.');
  }

  if (
    typeof metricSummary.avg_manual_takeover_rate === 'number'
    && metricSummary.avg_manual_takeover_rate > maxManualTakeoverRate
  ) {
    score -= 0.1;
    recommendations.push(`Reduce manual_takeover_rate to ${maxManualTakeoverRate} or lower.`);
  }

  if (
    typeof maxCycleTimeMs === 'number'
    && typeof metricSummary.avg_cycle_time_ms === 'number'
    && metricSummary.avg_cycle_time_ms > maxCycleTimeMs
  ) {
    score -= 0.1;
    recommendations.push(`Reduce cycle_time_ms to ${maxCycleTimeMs} or lower.`);
  }

  return {
    score: Math.max(0, Number(score.toFixed(2))),
    recommendations
  };
}

function classifyEvalGrade(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return 'insufficient_data';
  }

  if (score >= 0.85) {
    return 'good';
  }

  if (score >= 0.7) {
    return 'watch';
  }

  if (score >= 0.5) {
    return 'at_risk';
  }

  return 'critical';
}

function normalizeTaskPriority(priority, fallback = 'medium') {
  const normalized = String(priority || '').trim().toLowerCase();
  if (TASK_PRIORITIES.has(normalized)) {
    return normalized;
  }

  return fallback;
}

function cloneDefaultEvalTaskSyncPolicy() {
  return JSON.parse(JSON.stringify(DEFAULT_EVAL_TASK_SYNC_POLICY));
}

function cloneDefaultEvalProfileInferenceRules() {
  return JSON.parse(JSON.stringify(DEFAULT_EVAL_PROFILE_INFERENCE_RULES));
}

function cloneDefaultSceneRoutePolicy() {
  return JSON.parse(JSON.stringify(DEFAULT_SCENE_ROUTE_POLICY));
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function mergePlainObject(base = {}, override = {}) {
  const next = { ...(isPlainObject(base) ? base : {}) };

  if (!isPlainObject(override)) {
    return next;
  }

  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(next[key])) {
      next[key] = mergePlainObject(next[key], value);
      continue;
    }

    next[key] = value;
  }

  return next;
}

function normalizeRoutePolicyNumber(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return fallback;
}

function normalizeSceneRoutePolicy(policy = {}) {
  const merged = cloneDefaultSceneRoutePolicy();

  if (!isPlainObject(policy)) {
    return merged;
  }

  if (isPlainObject(policy.weights)) {
    for (const [key, fallback] of Object.entries(merged.weights)) {
      if (Object.prototype.hasOwnProperty.call(policy.weights, key)) {
        merged.weights[key] = normalizeRoutePolicyNumber(policy.weights[key], fallback);
      }
    }
  }

  if (isPlainObject(policy.mode_bias) && isPlainObject(policy.mode_bias.commit)) {
    const commitBias = policy.mode_bias.commit;
    for (const [riskLevel, fallback] of Object.entries(merged.mode_bias.commit)) {
      if (Object.prototype.hasOwnProperty.call(commitBias, riskLevel)) {
        merged.mode_bias.commit[riskLevel] = normalizeRoutePolicyNumber(commitBias[riskLevel], fallback);
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(policy, 'max_alternatives')) {
    const normalizedMaxAlternatives = Math.max(0, Math.trunc(normalizeRoutePolicyNumber(policy.max_alternatives, merged.max_alternatives)));
    merged.max_alternatives = normalizedMaxAlternatives;
  }

  return merged;
}

function createSceneRoutePolicyTemplateByProfile(profile = 'default') {
  const normalizedProfile = String(profile || '').trim().toLowerCase();
  const base = cloneDefaultSceneRoutePolicy();

  const profilePatches = {
    erp: {
      weights: {
        query_token_match: 7
      },
      max_alternatives: 5
    },
    hybrid: {
      weights: {
        query_token_match: 10
      },
      mode_bias: {
        commit: {
          high: -8,
          critical: -10
        }
      },
      max_alternatives: 6
    },
    robot: {
      weights: {
        query_token_match: 10
      },
      mode_bias: {
        commit: {
          medium: -2,
          high: -10,
          critical: -12
        }
      },
      max_alternatives: 6
    }
  };

  if (!Object.prototype.hasOwnProperty.call(profilePatches, normalizedProfile)) {
    return base;
  }

  return normalizeSceneRoutePolicy(mergePlainObject(base, profilePatches[normalizedProfile]));
}

async function loadSceneRoutePolicy(options = {}, projectRoot, fileSystem = fs) {
  const defaultPolicy = cloneDefaultSceneRoutePolicy();

  if (!options.routePolicy) {
    return {
      policy: defaultPolicy,
      source: 'default'
    };
  }

  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);

  const routePolicyPath = resolvePath(projectRoot, options.routePolicy);
  const routePolicyRaw = await readJson(routePolicyPath);

  if (!isPlainObject(routePolicyRaw)) {
    throw new Error('route policy file must contain a JSON object');
  }

  return {
    policy: normalizeSceneRoutePolicy(mergePlainObject(defaultPolicy, routePolicyRaw)),
    source: options.routePolicy
  };
}

function incrementCounter(counter, key) {
  if (!counter || typeof counter !== 'object') {
    return;
  }

  counter[key] = (counter[key] || 0) + 1;
}

function normalizeRoutePolicySuggestGrade(rawGrade) {
  const normalized = String(rawGrade || '').trim().toLowerCase();
  switch (normalized) {
    case 'good':
    case 'watch':
    case 'at_risk':
    case 'critical':
    case 'insufficient_data':
      return normalized;
    default:
      return 'unknown';
  }
}

function normalizeRoutePolicySuggestRunStatus(rawStatus) {
  const normalized = String(rawStatus || '').trim().toLowerCase();
  switch (normalized) {
    case 'success':
    case 'denied':
    case 'failed':
    case 'blocked':
      return normalized;
    default:
      return 'unknown';
  }
}

function normalizeRoutePolicySuggestProfileName(rawProfile) {
  const normalized = String(rawProfile || '').trim().toLowerCase();

  if (ROUTE_POLICY_TEMPLATE_PROFILES.has(normalized)) {
    return normalized;
  }

  if (normalized === 'ops') {
    return 'hybrid';
  }

  return null;
}

function inferRoutePolicySuggestProfile(report = {}) {
  const inputProfile = normalizeRoutePolicySuggestProfileName(report && report.inputs ? report.inputs.profile : null);
  if (inputProfile) {
    return inputProfile;
  }

  const sceneRef = String(report.scene_ref || '').trim().toLowerCase();
  if (!sceneRef) {
    return 'default';
  }

  const firstDomain = sceneRef.split(/[.]/).slice(1, 2)[0];
  const inferredFromSceneRef = normalizeRoutePolicySuggestProfileName(firstDomain);
  if (inferredFromSceneRef) {
    return inferredFromSceneRef;
  }

  if (sceneRef.includes('.hybrid.') || sceneRef.includes('.robot.')) {
    return 'hybrid';
  }

  if (sceneRef.includes('.erp.')) {
    return 'erp';
  }

  return 'default';
}

function resolveDominantRoutePolicySuggestProfile(profileCounts = {}) {
  const profileOrder = ['erp', 'hybrid', 'robot', 'default'];
  let selected = 'default';
  let selectedCount = 0;

  for (const profile of profileOrder) {
    const count = Number(profileCounts[profile] || 0);
    if (count > selectedCount) {
      selected = profile;
      selectedCount = count;
    }
  }

  return selected;
}

function summarizeSceneRoutePolicySuggestReports(evalReports = []) {
  const gradeCounts = {
    good: 0,
    watch: 0,
    at_risk: 0,
    critical: 0,
    insufficient_data: 0,
    unknown: 0
  };
  const runStatusCounts = {
    success: 0,
    denied: 0,
    failed: 0,
    blocked: 0,
    unknown: 0
  };
  const profileCounts = {
    default: 0,
    erp: 0,
    hybrid: 0,
    robot: 0
  };
  const recommendationSignals = {
    policy_denial: 0,
    runtime_failure: 0,
    manual_takeover: 0
  };

  for (const item of evalReports) {
    const report = item && item.report && typeof item.report === 'object'
      ? item.report
      : {};

    const grade = normalizeRoutePolicySuggestGrade(report && report.overall ? report.overall.grade : null);
    incrementCounter(gradeCounts, grade);

    const runStatus = normalizeRoutePolicySuggestRunStatus(report && report.run_evaluation ? report.run_evaluation.status : null);
    incrementCounter(runStatusCounts, runStatus);

    const profile = inferRoutePolicySuggestProfile(report);
    incrementCounter(profileCounts, profile);

    const recommendations = report && report.overall && Array.isArray(report.overall.recommendations)
      ? report.overall.recommendations
      : [];

    for (const recommendation of recommendations) {
      const normalized = String(recommendation || '').toLowerCase();
      if (!normalized) {
        continue;
      }

      if (/policy denial|denied/.test(normalized)) {
        recommendationSignals.policy_denial += 1;
      }

      if (/failed runtime|node failure|compensation/.test(normalized)) {
        recommendationSignals.runtime_failure += 1;
      }

      if (/manual takeover|manual_takeover/.test(normalized)) {
        recommendationSignals.manual_takeover += 1;
      }
    }
  }

  const totalReports = evalReports.length;
  const safeDivisor = totalReports > 0 ? totalReports : 1;
  const severeCount = gradeCounts.critical + gradeCounts.at_risk;
  const unstableCount = runStatusCounts.failed + runStatusCounts.denied;

  return {
    total_reports: totalReports,
    grade_counts: gradeCounts,
    run_status_counts: runStatusCounts,
    profile_counts: profileCounts,
    dominant_profile: resolveDominantRoutePolicySuggestProfile(profileCounts),
    recommendation_signals: recommendationSignals,
    rates: {
      severe_rate: Number((severeCount / safeDivisor).toFixed(2)),
      unstable_rate: Number((unstableCount / safeDivisor).toFixed(2)),
      insufficient_rate: Number((gradeCounts.insufficient_data / safeDivisor).toFixed(2)),
      good_rate: Number((gradeCounts.good / safeDivisor).toFixed(2)),
      denied_rate: Number((runStatusCounts.denied / safeDivisor).toFixed(2)),
      failed_rate: Number((runStatusCounts.failed / safeDivisor).toFixed(2))
    }
  };
}

function clampRoutePolicyValue(value, minimum, maximum) {
  let nextValue = value;

  if (Number.isFinite(minimum)) {
    nextValue = Math.max(minimum, nextValue);
  }

  if (Number.isFinite(maximum)) {
    nextValue = Math.min(maximum, nextValue);
  }

  return nextValue;
}

function getObjectValueByPath(target, pathKey) {
  if (!target || typeof target !== 'object' || typeof pathKey !== 'string') {
    return undefined;
  }

  const parts = pathKey.split('.');
  let cursor = target;

  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object' || !Object.prototype.hasOwnProperty.call(cursor, part)) {
      return undefined;
    }

    cursor = cursor[part];
  }

  return cursor;
}

function setObjectValueByPath(target, pathKey, value) {
  if (!target || typeof target !== 'object' || typeof pathKey !== 'string') {
    return;
  }

  const parts = pathKey.split('.');
  let cursor = target;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!cursor[part] || typeof cursor[part] !== 'object') {
      cursor[part] = {};
    }

    cursor = cursor[part];
  }

  cursor[parts[parts.length - 1]] = value;
}

function applyRoutePolicyDelta(policy, pathKey, delta, metadata = {}) {
  if (!Number.isFinite(delta) || delta === 0) {
    return null;
  }

  const fallback = Object.prototype.hasOwnProperty.call(metadata, 'fallback') ? metadata.fallback : 0;
  const currentValue = normalizeRoutePolicyNumber(getObjectValueByPath(policy, pathKey), fallback);
  let nextValue = currentValue + delta;

  if (metadata.integer === true) {
    nextValue = Math.trunc(nextValue);
  }

  nextValue = clampRoutePolicyValue(nextValue, metadata.min, metadata.max);

  if (nextValue === currentValue) {
    return null;
  }

  setObjectValueByPath(policy, pathKey, nextValue);

  return {
    path: pathKey,
    from: currentValue,
    to: nextValue,
    delta: Number((nextValue - currentValue).toFixed(2)),
    rationale: metadata.rationale || null
  };
}

function buildSceneRoutePolicySuggestion(basePolicy, reportSummary, options = {}) {
  const suggestedPolicy = normalizeSceneRoutePolicy(basePolicy);
  const maxAdjustment = Math.max(0, Math.trunc(normalizeRoutePolicyNumber(
    options.maxAdjustment,
    ROUTE_POLICY_SUGGEST_MAX_ADJUSTMENT_DEFAULT
  )));

  const summary = reportSummary && typeof reportSummary === 'object'
    ? reportSummary
    : summarizeSceneRoutePolicySuggestReports([]);

  const rates = summary.rates || {};
  const recommendationSignals = summary.recommendation_signals || {};
  const totalReports = Number(summary.total_reports || 0);

  const deltaByPath = new Map();
  const reasonsByPath = new Map();

  const queueDelta = (pathKey, delta, reason) => {
    if (!Number.isFinite(delta) || delta === 0) {
      return;
    }

    deltaByPath.set(pathKey, (deltaByPath.get(pathKey) || 0) + delta);

    if (reason) {
      const reasons = reasonsByPath.get(pathKey) || [];
      reasons.push(reason);
      reasonsByPath.set(pathKey, reasons);
    }
  };

  const stepFromRate = (rate, multiplier = 1) => {
    if (maxAdjustment <= 0) {
      return 0;
    }

    const normalizedRate = Math.max(0, normalizeRoutePolicyNumber(rate, 0));
    if (normalizedRate <= 0) {
      return 0;
    }

    return Math.max(1, Math.min(maxAdjustment, Math.ceil(normalizedRate * maxAdjustment * multiplier)));
  };

  const severeRate = Math.max(0, normalizeRoutePolicyNumber(rates.severe_rate, 0));
  const unstableRate = Math.max(0, normalizeRoutePolicyNumber(rates.unstable_rate, 0));
  const insufficientRate = Math.max(0, normalizeRoutePolicyNumber(rates.insufficient_rate, 0));
  const goodRate = Math.max(0, normalizeRoutePolicyNumber(rates.good_rate, 0));

  const stressRate = Math.max(severeRate, unstableRate);
  if (stressRate >= 0.2) {
    const stressStep = stepFromRate(stressRate, 1);
    if (stressStep > 0) {
      const rationale = `stress_rate=${stressRate}`;
      queueDelta('mode_bias.commit.high', -stressStep, rationale);
      queueDelta('mode_bias.commit.critical', -Math.min(maxAdjustment, stressStep + 1), rationale);
      queueDelta('weights.scene_ref_mismatch', -Math.max(1, Math.ceil(stressStep / 2)), rationale);
      queueDelta('weights.invalid_manifest', -Math.max(1, Math.ceil(stressStep / 2)), rationale);
    }
  }

  if (insufficientRate >= 0.3) {
    const discoveryStep = stepFromRate(insufficientRate, 0.8);
    if (discoveryStep > 0) {
      const rationale = `insufficient_rate=${insufficientRate}`;
      queueDelta('weights.query_token_match', discoveryStep, rationale);
      queueDelta('max_alternatives', Math.max(1, Math.ceil(discoveryStep / 2)), rationale);
    }
  }

  if (goodRate >= 0.65 && stressRate <= 0.2 && insufficientRate <= 0.25) {
    const precisionStep = stepFromRate(goodRate, 0.6);
    if (precisionStep > 0) {
      const rationale = `good_rate=${goodRate}`;
      queueDelta('weights.scene_ref_exact', precisionStep, rationale);
      queueDelta('weights.scene_ref_contains', Math.max(1, Math.ceil(precisionStep / 2)), rationale);
      queueDelta('max_alternatives', -1, rationale);
    }
  }

  const policyDenialRate = totalReports > 0
    ? Number((recommendationSignals.policy_denial / totalReports).toFixed(2))
    : 0;
  if (policyDenialRate >= 0.15) {
    const denialStep = stepFromRate(policyDenialRate, 0.8);
    if (denialStep > 0) {
      queueDelta('mode_bias.commit.medium', -denialStep, `policy_denial_rate=${policyDenialRate}`);
    }
  }

  const runtimeFailureSignalRate = totalReports > 0
    ? Number((recommendationSignals.runtime_failure / totalReports).toFixed(2))
    : 0;
  if (runtimeFailureSignalRate >= 0.15) {
    const failureStep = stepFromRate(runtimeFailureSignalRate, 0.7);
    if (failureStep > 0) {
      queueDelta('weights.scene_ref_mismatch', -Math.max(1, Math.ceil(failureStep / 2)), `runtime_failure_signal_rate=${runtimeFailureSignalRate}`);
    }
  }

  const boundsByPath = {
    'weights.valid_manifest': { min: -200, max: 200, fallback: 5 },
    'weights.invalid_manifest': { min: -200, max: 200, fallback: -10 },
    'weights.scene_ref_exact': { min: -200, max: 200, fallback: 100 },
    'weights.scene_ref_contains': { min: -200, max: 200, fallback: 45 },
    'weights.scene_ref_mismatch': { min: -200, max: 200, fallback: -20 },
    'weights.query_token_match': { min: -200, max: 200, fallback: 8 },
    'mode_bias.commit.low': { min: -50, max: 50, fallback: 2 },
    'mode_bias.commit.medium': { min: -50, max: 50, fallback: 0 },
    'mode_bias.commit.high': { min: -50, max: 50, fallback: -5 },
    'mode_bias.commit.critical': { min: -50, max: 50, fallback: -5 },
    max_alternatives: { min: 0, max: 12, fallback: 4, integer: true }
  };

  const adjustments = [];
  for (const [pathKey, delta] of deltaByPath.entries()) {
    const reasons = Array.from(new Set(reasonsByPath.get(pathKey) || []));
    const adjustment = applyRoutePolicyDelta(suggestedPolicy, pathKey, delta, {
      ...(boundsByPath[pathKey] || {}),
      rationale: reasons.join('; ') || null
    });

    if (adjustment) {
      adjustments.push(adjustment);
    }
  }

  return {
    max_adjustment: maxAdjustment,
    adjustments,
    suggested_policy: normalizeSceneRoutePolicy(suggestedPolicy)
  };
}

function formatSceneRoutePolicySuggestSourcePath(projectRoot, absolutePath) {
  const normalizedRelative = normalizeRelativePath(path.relative(projectRoot, absolutePath));
  if (normalizedRelative && !normalizedRelative.startsWith('..')) {
    return normalizedRelative;
  }

  return normalizeRelativePath(absolutePath);
}

async function resolveSceneRoutePolicySuggestEvalPaths(options, projectRoot, fileSystem = fs) {
  const readdir = typeof fileSystem.readdir === 'function'
    ? fileSystem.readdir.bind(fileSystem)
    : fs.readdir.bind(fs);

  const collected = [];

  for (const evalPath of options.eval || []) {
    collected.push(resolvePath(projectRoot, evalPath));
  }

  if (options.evalDir) {
    const evalDirPath = resolvePath(projectRoot, options.evalDir);
    let entries = [];

    try {
      entries = await readdir(evalDirPath, { withFileTypes: true });
    } catch (error) {
      throw new Error(`failed to read eval directory: ${evalDirPath} (${error.message})`);
    }

    for (const entry of entries) {
      const entryName = typeof entry === 'string' ? entry : entry && entry.name ? entry.name : null;
      if (!entryName || !entryName.toLowerCase().endsWith('.json')) {
        continue;
      }

      const isFileEntry = typeof entry === 'string'
        ? true
        : (typeof entry.isFile === 'function' ? entry.isFile() : true);

      if (!isFileEntry) {
        continue;
      }

      collected.push(path.join(evalDirPath, entryName));
    }
  }

  const deduped = [];
  const seen = new Set();

  for (const candidate of collected) {
    const normalizedCandidate = normalizeRelativePath(candidate);
    const dedupeKey = process.platform === 'win32'
      ? normalizedCandidate.toLowerCase()
      : normalizedCandidate;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    deduped.push(candidate);
  }

  if (deduped.length === 0) {
    throw new Error('no eval report JSON files resolved from current options');
  }

  return deduped;
}

async function loadSceneRoutePolicySuggestReports(reportPaths, fileSystem = fs) {
  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);

  const reports = [];

  for (const reportPath of reportPaths) {
    const reportPayload = await readJson(reportPath);

    if (!isPlainObject(reportPayload)) {
      throw new Error(`eval report must contain a JSON object: ${reportPath}`);
    }

    reports.push({
      sourcePath: reportPath,
      report: reportPayload
    });
  }

  return reports;
}

async function loadSceneRoutePolicySuggestBaseline(options = {}, projectRoot, reportSummary, fileSystem = fs) {
  if (!options.routePolicy) {
    let resolvedProfile = options.profile || 'default';
    let source = `profile:${resolvedProfile}`;

    if (resolvedProfile === 'default') {
      const dominantProfile = reportSummary && reportSummary.dominant_profile
        ? String(reportSummary.dominant_profile).trim().toLowerCase()
        : 'default';

      if (ROUTE_POLICY_TEMPLATE_PROFILES.has(dominantProfile) && dominantProfile !== 'default') {
        resolvedProfile = dominantProfile;
        source = `profile:auto:${resolvedProfile}`;
      }
    }

    return {
      policy: createSceneRoutePolicyTemplateByProfile(resolvedProfile),
      source,
      profile: resolvedProfile
    };
  }

  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);

  const routePolicyPath = resolvePath(projectRoot, options.routePolicy);
  const routePolicyRaw = await readJson(routePolicyPath);

  if (!isPlainObject(routePolicyRaw)) {
    throw new Error('route policy file must contain a JSON object');
  }

  return {
    policy: normalizeSceneRoutePolicy(mergePlainObject(cloneDefaultSceneRoutePolicy(), routePolicyRaw)),
    source: options.routePolicy,
    profile: options.profile || 'default'
  };
}

function sanitizeSceneRoutePolicyRolloutName(rawName = '') {
  return String(rawName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveSceneRoutePolicyRolloutName(explicitName, generatedAt = new Date().toISOString()) {
  const normalizedExplicit = sanitizeSceneRoutePolicyRolloutName(explicitName || '');
  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  const timestamp = String(generatedAt || '')
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);

  const fallbackTimestamp = timestamp || `${Date.now()}`;
  return `route-policy-${fallbackTimestamp}`;
}

function collectSceneRoutePolicyDiff(baselinePolicy = {}, candidatePolicy = {}) {
  const normalizedBaseline = normalizeSceneRoutePolicy(mergePlainObject(cloneDefaultSceneRoutePolicy(), baselinePolicy));
  const normalizedCandidate = normalizeSceneRoutePolicy(mergePlainObject(cloneDefaultSceneRoutePolicy(), candidatePolicy));

  const changes = [];

  for (const pathKey of SCENE_ROUTE_POLICY_DIFF_KEYS) {
    const baselineValueRaw = getObjectValueByPath(normalizedBaseline, pathKey);
    const candidateValueRaw = getObjectValueByPath(normalizedCandidate, pathKey);

    const fallback = 0;
    const baselineValue = pathKey === 'max_alternatives'
      ? Math.trunc(normalizeRoutePolicyNumber(baselineValueRaw, fallback))
      : normalizeRoutePolicyNumber(baselineValueRaw, fallback);
    const candidateValue = pathKey === 'max_alternatives'
      ? Math.trunc(normalizeRoutePolicyNumber(candidateValueRaw, fallback))
      : normalizeRoutePolicyNumber(candidateValueRaw, fallback);

    if (baselineValue === candidateValue) {
      continue;
    }

    const deltaValue = candidateValue - baselineValue;

    changes.push({
      path: pathKey,
      from: baselineValue,
      to: candidateValue,
      delta: pathKey === 'max_alternatives'
        ? deltaValue
        : Number(deltaValue.toFixed(2))
    });
  }

  return changes;
}

function buildSceneRoutePolicyRolloutCommands(targetPolicyPath, candidatePolicyPath, rollbackPolicyPath) {
  return {
    verify_candidate_route: `sce scene route --query routing --mode dry_run --route-policy ${candidatePolicyPath}`,
    verify_target_route: `sce scene route --query routing --mode dry_run --route-policy ${targetPolicyPath}`,
    apply: `Replace ${targetPolicyPath} with ${candidatePolicyPath} after verification.`,
    rollback: `Replace ${targetPolicyPath} with ${rollbackPolicyPath} if regression appears.`
  };
}

function buildSceneRoutePolicyRolloutRunbook(payload) {
  const lines = [
    '# Scene Route Policy Rollout Runbook',
    '',
    `- Rollout: ${payload.rollout_name}`,
    `- Generated: ${payload.generated_at}`,
    `- Suggestion Source: ${payload.source_suggestion}`,
    `- Target Policy: ${payload.target_policy_path}`,
    `- Changed Fields: ${payload.summary.changed_fields}`,
    '',
    '## Verification Commands',
    '',
    `1. ${payload.commands.verify_target_route}`,
    `2. ${payload.commands.verify_candidate_route}`,
    '',
    '## Apply and Rollback',
    '',
    `- Apply: ${payload.commands.apply}`,
    `- Rollback: ${payload.commands.rollback}`,
    ''
  ];

  if (Array.isArray(payload.changed_fields) && payload.changed_fields.length > 0) {
    lines.push('## Changed Fields', '');

    for (const item of payload.changed_fields) {
      lines.push(`- ${item.path}: ${item.from} -> ${item.to} (delta=${item.delta})`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

function sanitizeScenePackageName(rawValue = '') {
  return String(rawValue || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deriveScenePackageName(options = {}) {
  if (options.name) {
    return sanitizeScenePackageName(options.name);
  }

  if (options.spec) {
    return sanitizeScenePackageName(String(options.spec).replace(/^\d{2}-\d{2}-/, ''));
  }

  if (options.out) {
    const parsed = path.parse(options.out);
    if (parsed.name) {
      return sanitizeScenePackageName(parsed.name.replace(/^scene-package$/, 'scene-template'));
    }
  }

  return 'scene-template';
}

function buildScenePackageCoordinate(contract = {}) {
  const metadata = isPlainObject(contract.metadata) ? contract.metadata : {};
  const group = String(metadata.group || '').trim();
  const name = String(metadata.name || '').trim();
  const version = String(metadata.version || '').trim();

  if (!group || !name || !version) {
    return null;
  }

  return `${group}/${name}@${version}`;
}

function buildScenePackagePublishTemplateManifest(packageContract = {}, context = {}) {
  const artifacts = isPlainObject(packageContract.artifacts) ? packageContract.artifacts : {};
  const compatibility = isPlainObject(packageContract.compatibility) ? packageContract.compatibility : {};
  const minSceVersion = String(compatibility.min_sce_version || '').trim();

  return {
    apiVersion: SCENE_PACKAGE_TEMPLATE_API_VERSION,
    kind: 'scene-package-template',
    metadata: {
      template_id: context.templateId || null,
      source_spec: context.spec || null,
      package_coordinate: buildScenePackageCoordinate(packageContract),
      package_kind: packageContract.kind || null,
      published_at: context.publishedAt || new Date().toISOString()
    },
    compatibility: {
      min_sce_version: minSceVersion || '>=1.24.0',
      scene_api_version: String(compatibility.scene_api_version || '').trim() || 'sce.scene/v0.2'
    },
    parameters: Array.isArray(packageContract.parameters)
      ? JSON.parse(JSON.stringify(packageContract.parameters))
      : [],
    template: {
      package_contract: 'scene-package.json',
      scene_manifest: 'scene.template.yaml'
    },
    artifacts: {
      entry_scene: String(artifacts.entry_scene || 'custom/scene.yaml') || 'custom/scene.yaml',
      generates: Array.isArray(artifacts.generates)
        ? artifacts.generates.filter((item) => typeof item === 'string' && item.trim().length > 0)
        : []
    }
  };
}

function createScenePackageTemplate(options = {}) {
  const packageName = deriveScenePackageName(options);
  const kind = SCENE_PACKAGE_KINDS.has(options.kind) ? options.kind : 'scene-template';
  const group = options.group || 'sce.scene';
  const version = options.version || '0.1.0';

  return {
    apiVersion: SCENE_PACKAGE_API_VERSION,
    kind,
    metadata: {
      group,
      name: packageName || 'scene-template',
      version,
      summary: `Template contract for ${packageName || 'scene-template'}`
    },
    compatibility: {
      min_sce_version: '>=1.24.0',
      scene_api_version: 'sce.scene/v0.2',
      moqui_model_version: '3.x',
      adapter_api_version: 'v1'
    },
    capabilities: {
      provides: [
        `scene.${kind}.core`
      ],
      requires: [
        'binding:http',
        'profile:erp'
      ]
    },
    parameters: [
      {
        id: 'entity_name',
        type: 'string',
        required: true,
        description: 'Primary entity name for generated scene flow'
      },
      {
        id: 'service_name',
        type: 'string',
        required: false,
        default: 'queryService',
        description: 'Optional service binding reference'
      }
    ],
    artifacts: {
      entry_scene: 'custom/scene.yaml',
      generates: [
        'requirements.md',
        'design.md',
        'tasks.md',
        'custom/scene.yaml'
      ]
    },
    governance: {
      risk_level: 'low',
      approval_required: false,
      rollback_supported: true
    }
  };
}

function resolveScenePackageTemplateOutputPath(options = {}, projectRoot = process.cwd()) {
  if (options.spec) {
    return path.join(projectRoot, '.sce', 'specs', options.spec, options.out);
  }

  return resolvePath(projectRoot, options.out);
}

function resolveScenePackageValidateInputPath(options = {}, projectRoot = process.cwd()) {
  if (options.spec) {
    return path.join(projectRoot, '.sce', 'specs', options.spec, options.specPackage);
  }

  return resolvePath(projectRoot, options.packagePath);
}

function deriveScenePackagePublishSourceFromManifestEntry(entry = {}) {
  const extractSpecRelative = (rawPath) => {
    const normalized = normalizeRelativePath(rawPath);
    if (!normalized) {
      return null;
    }
    const marker = '.sce/specs/';
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex < 0) {
      return null;
    }
    const suffix = normalized.slice(markerIndex + marker.length);
    const firstSlash = suffix.indexOf('/');
    if (firstSlash < 0) {
      return null;
    }

    const spec = suffix.slice(0, firstSlash).trim();
    const relativePath = suffix.slice(firstSlash + 1).trim();
    if (!spec || !relativePath) {
      return null;
    }

    return {
      spec,
      relativePath: normalizeRelativePath(relativePath) || relativePath
    };
  };

  const explicitSpec = String(entry.id || entry.spec || '').trim();
  const packageSource = extractSpecRelative(entry.scene_package);
  const manifestSource = extractSpecRelative(entry.scene_manifest);
  const spec = explicitSpec || (packageSource ? packageSource.spec : '') || (manifestSource ? manifestSource.spec : '');

  let specPackage = packageSource ? packageSource.relativePath : null;
  let sceneManifest = manifestSource ? manifestSource.relativePath : null;

  if (spec && packageSource && packageSource.spec !== spec) {
    specPackage = null;
  }
  if (spec && manifestSource && manifestSource.spec !== spec) {
    sceneManifest = null;
  }

  return {
    spec: spec || null,
    specPackage,
    sceneManifest
  };
}

function resolveManifestSpecEntries(manifest = {}, rawSpecPath = 'specs') {
  const specPath = typeof rawSpecPath === 'string' ? rawSpecPath.trim() : '';
  if (!specPath) {
    return null;
  }

  const pathSegments = specPath
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (pathSegments.length === 0) {
    return null;
  }

  let cursor = manifest;
  for (const segment of pathSegments) {
    if (!cursor || typeof cursor !== 'object' || !Object.prototype.hasOwnProperty.call(cursor, segment)) {
      return null;
    }
    cursor = cursor[segment];
  }

  if (!Array.isArray(cursor)) {
    return null;
  }

  return cursor;
}

function resolveScenePackageTemplateLibraryPath(options = {}, projectRoot = process.cwd()) {
  return resolvePath(projectRoot, options.outDir);
}

function resolveScenePackageTemplateManifestPath(options = {}, projectRoot = process.cwd()) {
  return resolvePath(projectRoot, options.template);
}

function resolveScenePackageInstantiateValuesPath(options = {}, projectRoot = process.cwd()) {
  if (!options.values) {
    return null;
  }

  return resolvePath(projectRoot, options.values);
}

function formatScenePackagePath(projectRoot, absolutePath) {
  const normalizedRelative = normalizeRelativePath(path.relative(projectRoot, absolutePath));
  if (normalizedRelative && !normalizedRelative.startsWith('..')) {
    return normalizedRelative;
  }

  return normalizeRelativePath(absolutePath);
}

function validateScenePackageTemplateManifest(templateManifest = {}) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(templateManifest)) {
    return {
      valid: false,
      errors: ['template manifest must be a JSON object'],
      warnings
    };
  }

  if (templateManifest.apiVersion !== SCENE_PACKAGE_TEMPLATE_API_VERSION) {
    errors.push(`apiVersion must be ${SCENE_PACKAGE_TEMPLATE_API_VERSION}`);
  }

  if (String(templateManifest.kind || '').trim() !== 'scene-package-template') {
    errors.push('kind must be scene-package-template');
  }

  const metadata = isPlainObject(templateManifest.metadata) ? templateManifest.metadata : null;
  if (!metadata) {
    errors.push('metadata object is required');
  } else if (!String(metadata.template_id || '').trim()) {
    errors.push('metadata.template_id is required');
  }

  if (!isPlainObject(templateManifest.template)) {
    errors.push('template object is required');
  } else {
    if (!String(templateManifest.template.package_contract || '').trim()) {
      errors.push('template.package_contract is required');
    }

    if (!String(templateManifest.template.scene_manifest || '').trim()) {
      errors.push('template.scene_manifest is required');
    }
  }

  if (!Array.isArray(templateManifest.parameters)) {
    warnings.push('parameters should be an array');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function classifyScenePackageLayer(kind) {
  const normalizedKind = String(kind || '').trim().toLowerCase();
  return SCENE_PACKAGE_KIND_LAYER_MAP[normalizedKind] || 'unknown';
}

function createScenePackageGatePolicyTemplate(profile = 'baseline') {
  const normalizedProfile = String(profile || '').trim().toLowerCase();

  const templates = {
    baseline: {
      apiVersion: SCENE_PACKAGE_GATE_API_VERSION,
      profile: 'baseline',
      rules: {
        max_invalid_templates: 0,
        min_valid_templates: 1,
        required_layers: [],
        forbid_unknown_layer: false
      }
    },
    'three-layer': {
      apiVersion: SCENE_PACKAGE_GATE_API_VERSION,
      profile: 'three-layer',
      rules: {
        max_invalid_templates: 0,
        min_valid_templates: 3,
        required_layers: ['l1-capability', 'l2-domain', 'l3-instance'],
        forbid_unknown_layer: true
      }
    }
  };

  return JSON.parse(JSON.stringify(templates[normalizedProfile] || templates.baseline));
}

function normalizeScenePackageGatePolicy(policy = {}) {
  const baseline = createScenePackageGatePolicyTemplate('baseline');

  const nextPolicy = isPlainObject(policy) ? JSON.parse(JSON.stringify(policy)) : {};
  if (!String(nextPolicy.apiVersion || '').trim()) {
    nextPolicy.apiVersion = baseline.apiVersion;
  }

  if (!String(nextPolicy.profile || '').trim()) {
    nextPolicy.profile = baseline.profile;
  }

  const rules = isPlainObject(nextPolicy.rules) ? nextPolicy.rules : {};

  const maxInvalidTemplates = Number(rules.max_invalid_templates);
  const minValidTemplates = Number(rules.min_valid_templates);

  nextPolicy.rules = {
    max_invalid_templates: Number.isFinite(maxInvalidTemplates) && maxInvalidTemplates >= 0
      ? Math.floor(maxInvalidTemplates)
      : baseline.rules.max_invalid_templates,
    min_valid_templates: Number.isFinite(minValidTemplates) && minValidTemplates >= 0
      ? Math.floor(minValidTemplates)
      : baseline.rules.min_valid_templates,
    required_layers: Array.isArray(rules.required_layers)
      ? rules.required_layers
        .map((item) => String(item || '').trim())
        .filter((item) => item.length > 0)
      : [],
    forbid_unknown_layer: rules.forbid_unknown_layer === true
  };

  return nextPolicy;
}

function evaluateScenePackageGate(registryPayload = {}, policy = {}) {
  const summary = isPlainObject(registryPayload.summary) ? registryPayload.summary : {};
  const layerCounts = isPlainObject(summary.layer_counts) ? summary.layer_counts : {};
  const normalizedPolicy = normalizeScenePackageGatePolicy(policy);

  const metrics = {
    total_templates: Number(summary.total_templates || 0),
    valid_templates: Number(summary.valid_templates || 0),
    invalid_templates: Number(summary.invalid_templates || 0),
    layer_counts: {
      l1_capability: Number(layerCounts.l1_capability || 0),
      l2_domain: Number(layerCounts.l2_domain || 0),
      l3_instance: Number(layerCounts.l3_instance || 0),
      unknown: Number(layerCounts.unknown || 0)
    }
  };

  const checks = [];

  checks.push({
    id: 'max-invalid-templates',
    expected: `<= ${normalizedPolicy.rules.max_invalid_templates}`,
    actual: metrics.invalid_templates,
    passed: metrics.invalid_templates <= normalizedPolicy.rules.max_invalid_templates
  });

  checks.push({
    id: 'min-valid-templates',
    expected: `>= ${normalizedPolicy.rules.min_valid_templates}`,
    actual: metrics.valid_templates,
    passed: metrics.valid_templates >= normalizedPolicy.rules.min_valid_templates
  });

  for (const layer of normalizedPolicy.rules.required_layers) {
    const key = layer.replace(/-/g, '_');
    const count = Number(metrics.layer_counts[key] || 0);

    checks.push({
      id: `required-layer:${layer}`,
      expected: '>= 1',
      actual: count,
      passed: count >= 1
    });
  }

  if (normalizedPolicy.rules.forbid_unknown_layer) {
    checks.push({
      id: 'unknown-layer-forbidden',
      expected: 0,
      actual: metrics.layer_counts.unknown,
      passed: metrics.layer_counts.unknown === 0
    });
  }

  const failedChecks = checks.filter((item) => item.passed === false);

  return {
    policy: normalizedPolicy,
    metrics,
    checks,
    summary: {
      passed: failedChecks.length === 0,
      total_checks: checks.length,
      failed_checks: failedChecks.length
    }
  };
}

function parseScenePackageGateExpectedInteger(expected, fallback = 0) {
  const match = String(expected || '').match(/-?\d+/);
  if (!match) {
    return fallback;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildScenePackageGateRemediationPlan(evaluation = {}) {
  const failedChecks = Array.isArray(evaluation.checks)
    ? evaluation.checks.filter((item) => item && item.passed === false)
    : [];

  const actions = [];
  const seen = new Map();

  const pushAction = (action, sourceCheckId = null) => {
    if (!isPlainObject(action) || !String(action.id || '').trim()) {
      return;
    }

    const actionId = String(action.id).trim();
    const sourceIds = Array.isArray(action.source_check_ids)
      ? action.source_check_ids
        .map((checkId) => String(checkId || '').trim())
        .filter((checkId) => checkId.length > 0)
      : [];

    if (sourceCheckId && !sourceIds.includes(sourceCheckId)) {
      sourceIds.push(sourceCheckId);
    }

    if (seen.has(actionId)) {
      const index = seen.get(actionId);
      const existing = actions[index];
      const mergedIds = new Set([
        ...(Array.isArray(existing.source_check_ids) ? existing.source_check_ids : []),
        ...sourceIds
      ]);
      existing.source_check_ids = Array.from(mergedIds);
      return;
    }

    seen.set(actionId, actions.length);
    actions.push({
      ...action,
      source_check_ids: sourceIds
    });
  };

  for (const check of failedChecks) {
    const checkId = String(check.id || '').trim();

    if (checkId.startsWith('required-layer:')) {
      const layer = checkId.slice('required-layer:'.length);
      const layerKindMap = {
        'l1-capability': 'scene-capability',
        'l2-domain': 'scene-domain-profile',
        'l3-instance': 'scene-template'
      };
      const kind = layerKindMap[layer] || 'scene-template';

      pushAction({
        id: `cover-${layer}`,
        priority: 'medium',
        title: `Add at least one ${layer} template package`,
        recommendation: `Create and publish a ${kind} package to satisfy ${layer} coverage.`,
        command_hint: `sce scene package-template --kind ${kind} --spec <spec-name> && sce scene package-publish --spec <spec-name>`
      }, checkId);
      continue;
    }

    if (checkId === 'min-valid-templates') {
      const expectedCount = parseScenePackageGateExpectedInteger(check.expected, 0);
      const actualCount = Number(check.actual || 0);
      const gap = Math.max(0, expectedCount - actualCount);

      pushAction({
        id: 'increase-valid-templates',
        priority: 'high',
        title: `Increase valid template count by at least ${gap || 1}`,
        recommendation: 'Promote additional template packages via package-publish until gate threshold is met.',
        command_hint: 'sce scene package-registry --template-dir .sce/templates/scene-packages --json'
      }, checkId);
      continue;
    }

    if (checkId === 'max-invalid-templates') {
      pushAction({
        id: 'reduce-invalid-templates',
        priority: 'high',
        title: 'Reduce invalid template count to gate threshold',
        recommendation: 'Repair or deprecate invalid templates and rerun registry validation.',
        command_hint: 'sce scene package-registry --template-dir .sce/templates/scene-packages --strict --json'
      }, checkId);
      continue;
    }

    if (checkId === 'unknown-layer-forbidden') {
      pushAction({
        id: 'remove-unknown-layer-templates',
        priority: 'high',
        title: 'Eliminate unknown-layer template classifications',
        recommendation: 'Align package kind declarations with supported scene layers and republish.',
        command_hint: 'sce scene package-template --kind <scene-capability|scene-domain-profile|scene-template> --spec <spec-name>'
      }, checkId);
      continue;
    }

    pushAction({
      id: `resolve-${sanitizeScenePackageName(checkId) || 'gate-check'}`,
      priority: 'medium',
      title: `Resolve gate check ${checkId || 'unknown'}`,
      recommendation: 'Inspect gate details and apply corrective template actions.',
      command_hint: 'sce scene package-gate --registry <path> --policy <path> --json'
    }, checkId);
  }

  return {
    action_count: actions.length,
    actions
  };
}

function validateScenePackageContract(contract = {}) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(contract)) {
    return {
      valid: false,
      errors: ['scene package contract must be a JSON object'],
      warnings: [],
      summary: {
        coordinate: null,
        kind: null,
        parameter_count: 0,
        provides_count: 0,
        requires_count: 0
      }
    };
  }

  if (contract.apiVersion !== SCENE_PACKAGE_API_VERSION) {
    errors.push(`apiVersion must be ${SCENE_PACKAGE_API_VERSION}`);
  }

  if (!SCENE_PACKAGE_KINDS.has(contract.kind)) {
    errors.push(`kind must be one of ${Array.from(SCENE_PACKAGE_KINDS).join(', ')}`);
  }

  const metadata = isPlainObject(contract.metadata) ? contract.metadata : null;
  if (!metadata) {
    errors.push('metadata object is required');
  }

  const group = metadata ? String(metadata.group || '').trim() : '';
  const name = metadata ? String(metadata.name || '').trim() : '';
  const version = metadata ? String(metadata.version || '').trim() : '';

  if (!group) {
    errors.push('metadata.group is required');
  }

  if (!name) {
    errors.push('metadata.name is required');
  }

  if (!version) {
    errors.push('metadata.version is required');
  } else if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    errors.push('metadata.version must be semantic version (x.y.z)');
  }

  const compatibility = isPlainObject(contract.compatibility) ? contract.compatibility : null;
  if (!compatibility) {
    errors.push('compatibility object is required');
  } else {
    const minSceVersion = String(compatibility.min_sce_version || '').trim();

    if (!minSceVersion) {
      errors.push('compatibility.min_sce_version is required');
    }

    if (!String(compatibility.scene_api_version || '').trim()) {
      errors.push('compatibility.scene_api_version is required');
    }
  }

  const capabilities = isPlainObject(contract.capabilities) ? contract.capabilities : null;
  if (!capabilities) {
    errors.push('capabilities object is required');
  }

  const provides = capabilities && Array.isArray(capabilities.provides) ? capabilities.provides : [];
  const requires = capabilities && Array.isArray(capabilities.requires) ? capabilities.requires : [];

  if (provides.length === 0) {
    warnings.push('capabilities.provides is empty');
  }

  if (provides.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    errors.push('capabilities.provides must contain non-empty strings');
  }

  if (requires.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    errors.push('capabilities.requires must contain non-empty strings');
  }

  const parameters = Array.isArray(contract.parameters) ? contract.parameters : [];
  for (const [index, parameter] of parameters.entries()) {
    if (!isPlainObject(parameter)) {
      errors.push(`parameters[${index}] must be an object`);
      continue;
    }

    if (!String(parameter.id || '').trim()) {
      errors.push(`parameters[${index}].id is required`);
    }

    if (!String(parameter.type || '').trim()) {
      errors.push(`parameters[${index}].type is required`);
    }

    if (Object.prototype.hasOwnProperty.call(parameter, 'required') && typeof parameter.required !== 'boolean') {
      errors.push(`parameters[${index}].required must be boolean when provided`);
    }
  }

  const artifacts = isPlainObject(contract.artifacts) ? contract.artifacts : null;
  if (!artifacts) {
    errors.push('artifacts object is required');
  } else {
    if (!String(artifacts.entry_scene || '').trim()) {
      errors.push('artifacts.entry_scene is required');
    }

    if (!Array.isArray(artifacts.generates) || artifacts.generates.length === 0) {
      errors.push('artifacts.generates must contain at least one output path');
    } else if (artifacts.generates.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
      errors.push('artifacts.generates must contain non-empty strings');
    }
  }

  const governance = isPlainObject(contract.governance) ? contract.governance : null;
  if (!governance) {
    errors.push('governance object is required');
  } else {
    const riskLevel = String(governance.risk_level || '').trim().toLowerCase();
    if (!SCENE_PACKAGE_RISK_LEVELS.has(riskLevel)) {
      errors.push(`governance.risk_level must be one of ${Array.from(SCENE_PACKAGE_RISK_LEVELS).join(', ')}`);
    }

    if (typeof governance.approval_required !== 'boolean') {
      errors.push('governance.approval_required must be boolean');
    }

    if (typeof governance.rollback_supported !== 'boolean') {
      errors.push('governance.rollback_supported must be boolean');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      coordinate: buildScenePackageCoordinate(contract),
      kind: SCENE_PACKAGE_KINDS.has(contract.kind) ? contract.kind : null,
      parameter_count: parameters.length,
      provides_count: provides.length,
      requires_count: requires.length
    }
  };
}

function buildScenePackageTemplateId(packageContract = {}, explicitTemplateId) {
  const explicit = sanitizeScenePackageName(explicitTemplateId || '');
  if (explicit) {
    return explicit;
  }

  const metadata = isPlainObject(packageContract.metadata) ? packageContract.metadata : {};
  const group = sanitizeScenePackageName(metadata.group || 'sce.scene') || 'sce.scene';
  const name = sanitizeScenePackageName(metadata.name || 'scene-template') || 'scene-template';
  const version = sanitizeScenePackageName(metadata.version || '0.1.0') || '0.1.0';

  return `${group}--${name}--${version}`;
}

function normalizeScenePackageTemplateValueMap(values) {
  if (!isPlainObject(values)) {
    return {};
  }

  const normalized = {};
  for (const [key, value] of Object.entries(values)) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) {
      continue;
    }

    normalized[normalizedKey] = value === null || value === undefined
      ? ''
      : String(value);
  }

  return normalized;
}

function renderScenePackageTemplateContent(content, valueMap = {}) {
  let rendered = String(content || '');

  for (const [key, value] of Object.entries(valueMap)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rendered = rendered
      .replace(new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g'), String(value))
      .replace(new RegExp(`\\$\\{${escapedKey}\\}`, 'g'), String(value));
  }

  return rendered;
}

function resolveScenePackageTemplateParameterValues(packageContract = {}, rawValues = {}) {
  const valueMap = normalizeScenePackageTemplateValueMap(rawValues);
  const parameters = Array.isArray(packageContract.parameters) ? packageContract.parameters : [];
  const resolved = {};
  const missing = [];

  for (const parameter of parameters) {
    if (!isPlainObject(parameter)) {
      continue;
    }

    const parameterId = String(parameter.id || '').trim();
    if (!parameterId) {
      continue;
    }

    const hasInput = Object.prototype.hasOwnProperty.call(valueMap, parameterId);
    if (hasInput) {
      resolved[parameterId] = valueMap[parameterId];
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(parameter, 'default')) {
      resolved[parameterId] = parameter.default === null || parameter.default === undefined
        ? ''
        : String(parameter.default);
      continue;
    }

    if (parameter.required === true) {
      missing.push(parameterId);
      continue;
    }

    resolved[parameterId] = '';
  }

  return {
    values: resolved,
    missing
  };
}

function buildScenePackageInstantiateContract(packageContract = {}, targetSpec) {
  const contractCopy = JSON.parse(JSON.stringify(packageContract || {}));

  if (!isPlainObject(contractCopy.metadata)) {
    contractCopy.metadata = {};
  }

  const targetName = sanitizeScenePackageName(String(targetSpec || '').replace(/^\d{2}-\d{2}-/, '')) || 'scene-instance';
  contractCopy.metadata.name = targetName;

  return contractCopy;
}

function buildScenePackageInstantiateManifest(manifestContent, valueMap, targetSpec) {
  if (!manifestContent) {
    const fallbackRef = sanitizeScenePackageName(String(targetSpec || '').replace(/^\d{2}-\d{2}-/, '')) || 'scene-instance';
    return [
      'apiVersion: sce.scene/v0.2',
      'kind: scene',
      'metadata:',
      `  obj_id: scene.erp.${fallbackRef}`,
      '  obj_version: 0.2.0',
      `  title: ${fallbackRef}`,
      'spec:',
      '  domain: erp',
      '  intent:',
      '    goal: Generated from scene package template',
      '  capability_contract:',
      '    bindings:',
      '      - type: query',
      '        ref: spec.erp.generated.query',
      '  governance_contract:',
      '    risk_level: low',
      '    approval:',
      '      required: false',
      '    idempotency:',
      '      required: true',
      '      key: requestId',
      ''
    ].join('\n');
  }

  return renderScenePackageTemplateContent(manifestContent, valueMap);
}

function normalizeProfileName(profile) {
  const normalized = String(profile || '').trim().toLowerCase();
  if (EVAL_CONFIG_TEMPLATE_PROFILES.has(normalized)) {
    return normalized;
  }

  return null;
}

function normalizeEvalProfileInferenceRules(rules = {}) {
  const merged = cloneDefaultEvalProfileInferenceRules();

  if (!isPlainObject(rules)) {
    return merged;
  }

  if (isPlainObject(rules.domain_aliases)) {
    const nextAliases = { ...merged.domain_aliases };

    for (const [rawDomain, rawProfile] of Object.entries(rules.domain_aliases)) {
      const domainKey = String(rawDomain || '').trim().toLowerCase();
      const profileName = normalizeProfileName(rawProfile);

      if (!domainKey || !profileName) {
        continue;
      }

      nextAliases[domainKey] = profileName;
    }

    merged.domain_aliases = nextAliases;
  }

  if (Array.isArray(rules.scene_ref_rules)) {
    const normalizedRules = [];

    for (const item of rules.scene_ref_rules) {
      if (!isPlainObject(item)) {
        continue;
      }

      const pattern = String(item.pattern || '').trim();
      const profileName = normalizeProfileName(item.profile);

      if (!pattern || !profileName) {
        continue;
      }

      try {
        new RegExp(pattern, 'i');
      } catch (error) {
        continue;
      }

      normalizedRules.push({
        pattern,
        profile: profileName
      });
    }

    merged.scene_ref_rules = normalizedRules;
  }

  return merged;
}

function createDefaultSceneEvalProfileRulesTemplate() {
  return cloneDefaultEvalProfileInferenceRules();
}

async function loadSceneEvalProfileRules(options = {}, projectRoot, fileSystem = fs) {
  const pathExists = typeof fileSystem.pathExists === 'function'
    ? fileSystem.pathExists.bind(fileSystem)
    : fs.pathExists.bind(fs);
  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);

  const warnings = [];
  const defaultRules = createDefaultSceneEvalProfileRulesTemplate();

  const explicitRulesPath = options.profileRules ? resolvePath(projectRoot, options.profileRules) : null;
  const implicitRulesPath = path.join(projectRoot, '.sce', 'config', 'scene-eval-profile-rules.json');
  const hasExplicitRulesPath = !!explicitRulesPath;

  let rulesPath = null;
  let rulesSource = 'default';

  if (hasExplicitRulesPath) {
    rulesPath = explicitRulesPath;
    rulesSource = options.profileRules;
  } else {
    try {
      if (await pathExists(implicitRulesPath)) {
        rulesPath = implicitRulesPath;
        rulesSource = '.sce/config/scene-eval-profile-rules.json';
      }
    } catch (error) {
      warnings.push(`profile rules path check failed: ${error.message}`);
    }
  }

  if (!rulesPath) {
    return {
      rules: defaultRules,
      source: rulesSource,
      warnings
    };
  }

  let rawRules = null;

  try {
    rawRules = await readJson(rulesPath);
  } catch (error) {
    if (hasExplicitRulesPath) {
      throw new Error(`failed to load profile rules file: ${rulesPath} (${error.message})`);
    }

    warnings.push(`failed to load implicit profile rules file: ${rulesSource}`);
    return {
      rules: defaultRules,
      source: 'default',
      warnings
    };
  }

  if (!isPlainObject(rawRules)) {
    if (hasExplicitRulesPath) {
      throw new Error(`profile rules file must contain a JSON object: ${rulesPath}`);
    }

    warnings.push(`invalid implicit profile rules file: ${rulesSource}`);
    return {
      rules: defaultRules,
      source: 'default',
      warnings
    };
  }

  return {
    rules: normalizeEvalProfileInferenceRules(rawRules),
    source: rulesSource,
    warnings
  };
}

function resolveSceneEvalConfigProfile(config = {}, envName = null) {
  if (!isPlainObject(config)) {
    throw new Error('eval config must be a JSON object');
  }

  let targetConfig = isPlainObject(config.target) ? mergePlainObject({}, config.target) : {};
  let taskSyncPolicy = isPlainObject(config.task_sync_policy) ? mergePlainObject({}, config.task_sync_policy) : {};

  if (envName) {
    const envs = isPlainObject(config.envs) ? config.envs : {};
    const envConfig = envs[envName];

    if (!isPlainObject(envConfig)) {
      throw new Error(`eval config env profile not found: ${envName}`);
    }

    if (isPlainObject(envConfig.target)) {
      targetConfig = mergePlainObject(targetConfig, envConfig.target);
    }

    if (isPlainObject(envConfig.task_sync_policy)) {
      taskSyncPolicy = mergePlainObject(taskSyncPolicy, envConfig.task_sync_policy);
    }
  }

  return {
    targetConfig,
    taskSyncPolicy
  };
}

function createDefaultSceneEvalConfigTemplate() {
  return {
    target: {
      max_cycle_time_ms: 2500,
      max_manual_takeover_rate: 0.25,
      max_policy_violation_count: 0,
      max_node_failure_count: 0,
      min_completion_rate: 0.8,
      max_blocked_rate: 0.1
    },
    task_sync_policy: cloneDefaultEvalTaskSyncPolicy(),
    envs: {
      dev: {
        target: {
          max_cycle_time_ms: 4000,
          max_manual_takeover_rate: 0.5,
          min_completion_rate: 0.6,
          max_blocked_rate: 0.4
        },
        task_sync_policy: {
          default_priority: 'medium'
        }
      },
      staging: {
        target: {
          max_cycle_time_ms: 2800,
          max_manual_takeover_rate: 0.3,
          min_completion_rate: 0.75,
          max_blocked_rate: 0.2
        },
        task_sync_policy: {
          default_priority: 'medium'
        }
      },
      prod: {
        target: {
          max_cycle_time_ms: 1800,
          max_manual_takeover_rate: 0.15,
          min_completion_rate: 0.9,
          max_blocked_rate: 0.05
        },
        task_sync_policy: {
          default_priority: 'high',
          priority_by_grade: {
            good: 'medium',
            watch: 'high',
            at_risk: 'high',
            critical: 'critical'
          }
        }
      }
    }
  };
}

function createSceneEvalConfigTemplateByProfile(profile = 'default') {
  const normalizedProfile = String(profile || 'default').trim().toLowerCase();
  const base = createDefaultSceneEvalConfigTemplate();

  const profilePatches = {
    erp: {
      target: {
        max_cycle_time_ms: 2000,
        max_manual_takeover_rate: 0.2,
        min_completion_rate: 0.85,
        max_blocked_rate: 0.08
      },
      task_sync_policy: {
        default_priority: 'medium',
        keyword_priority_overrides: [
          {
            pattern: 'invoice|payment|tax|ledger|cost|inventory|order',
            priority: 'high'
          }
        ]
      },
      envs: {
        prod: {
          target: {
            max_cycle_time_ms: 1500,
            max_manual_takeover_rate: 0.12,
            min_completion_rate: 0.92,
            max_blocked_rate: 0.04
          }
        }
      }
    },
    ops: {
      target: {
        max_cycle_time_ms: 1800,
        max_manual_takeover_rate: 0.12,
        max_policy_violation_count: 0,
        max_node_failure_count: 0,
        min_completion_rate: 0.9,
        max_blocked_rate: 0.06
      },
      task_sync_policy: {
        default_priority: 'high',
        priority_by_grade: {
          good: 'medium',
          watch: 'high',
          at_risk: 'high',
          critical: 'critical'
        },
        keyword_priority_overrides: [
          {
            pattern: 'incident|outage|rollback|security|credential|breach|degrade',
            priority: 'critical'
          }
        ]
      },
      envs: {
        prod: {
          target: {
            max_cycle_time_ms: 1200,
            max_manual_takeover_rate: 0.08,
            min_completion_rate: 0.95,
            max_blocked_rate: 0.03
          }
        }
      }
    },
    robot: {
      target: {
        max_cycle_time_ms: 2200,
        max_manual_takeover_rate: 0.1,
        max_policy_violation_count: 0,
        max_node_failure_count: 0,
        min_completion_rate: 0.9,
        max_blocked_rate: 0.05
      },
      task_sync_policy: {
        default_priority: 'high',
        priority_by_grade: {
          good: 'medium',
          watch: 'high',
          at_risk: 'critical',
          critical: 'critical'
        },
        keyword_priority_overrides: [
          {
            pattern: 'safety|collision|emergency|hardware|robot|stop channel|preflight',
            priority: 'critical'
          }
        ]
      },
      envs: {
        prod: {
          target: {
            max_cycle_time_ms: 1500,
            max_manual_takeover_rate: 0.06,
            min_completion_rate: 0.96,
            max_blocked_rate: 0.02
          }
        }
      }
    }
  };

  if (!Object.prototype.hasOwnProperty.call(profilePatches, normalizedProfile)) {
    return base;
  }

  return mergePlainObject(base, profilePatches[normalizedProfile]);
}

function normalizeRelativePath(targetPath = '') {
  return String(targetPath || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');
}

function collectManifestDiscoveryCandidates(preferredPath = 'custom/scene.yaml') {
  const ordered = [];
  const seen = new Set();

  const appendCandidate = (candidate) => {
    const normalized = normalizeRelativePath(candidate || '').trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    ordered.push(normalized);
  };

  appendCandidate(preferredPath);

  for (const candidate of SCENE_MANIFEST_DISCOVERY_CANDIDATES) {
    appendCandidate(candidate);
  }

  return ordered;
}

async function discoverSpecSceneManifestPath(projectRoot, specName, preferredPath = 'custom/scene.yaml', fileSystem = fs) {
  const specRoot = path.join(projectRoot, '.sce', 'specs', specName);
  const pathExists = typeof fileSystem.pathExists === 'function'
    ? fileSystem.pathExists.bind(fileSystem)
    : fs.pathExists.bind(fs);

  const candidates = collectManifestDiscoveryCandidates(preferredPath);

  for (const candidate of candidates) {
    const absolutePath = path.join(specRoot, candidate);

    try {
      if (await pathExists(absolutePath)) {
        return candidate;
      }
    } catch (error) {
      // Ignore path check failures and continue discovery.
    }
  }

  const readDirectory = typeof fileSystem.readdir === 'function'
    ? fileSystem.readdir.bind(fileSystem)
    : fs.readdir.bind(fs);

  const queue = [{ absolutePath: specRoot, relativePath: '', depth: 0 }];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || current.depth > SCENE_MANIFEST_DISCOVERY_MAX_DEPTH) {
      continue;
    }

    if (visited.has(current.absolutePath)) {
      continue;
    }

    visited.add(current.absolutePath);

    let entries = [];

    try {
      entries = await readDirectory(current.absolutePath, { withFileTypes: true });
    } catch (error) {
      continue;
    }

    for (const entry of entries) {
      if (!entry || !entry.name) {
        continue;
      }

      const nextRelativePath = current.relativePath
        ? `${current.relativePath}/${entry.name}`
        : entry.name;

      if (typeof entry.isFile === 'function' && entry.isFile() && /^scene\.(yaml|yml|json)$/i.test(entry.name)) {
        return normalizeRelativePath(nextRelativePath);
      }

      if (typeof entry.isDirectory === 'function' && entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') {
          continue;
        }

        queue.push({
          absolutePath: path.join(current.absolutePath, entry.name),
          relativePath: nextRelativePath,
          depth: current.depth + 1
        });
      }
    }
  }

  return null;
}

async function loadSceneManifestForEvalProfile(options = {}, sceneLoader, projectRoot, fileSystem = fs) {
  if (!options.spec || options.profile) {
    return {
      sceneManifest: null,
      manifestPath: null,
      manifestSource: null,
      warnings: []
    };
  }

  const requestedManifestPath = normalizeRelativePath(options.specManifest || 'custom/scene.yaml');
  const warnings = [];

  try {
    const sceneManifest = await sceneLoader.loadFromSpec(options.spec, requestedManifestPath);

    return {
      sceneManifest,
      manifestPath: requestedManifestPath,
      manifestSource: 'requested',
      warnings
    };
  } catch (error) {
    warnings.push(`requested manifest unavailable: ${requestedManifestPath}`);

    if (options.profileManifestAutoDiscovery === false) {
      return {
        sceneManifest: null,
        manifestPath: null,
        manifestSource: null,
        warnings
      };
    }
  }

  const discoveredManifestPath = await discoverSpecSceneManifestPath(
    projectRoot,
    options.spec,
    requestedManifestPath,
    fileSystem
  );

  if (!discoveredManifestPath || discoveredManifestPath === requestedManifestPath) {
    warnings.push('profile manifest auto-discovery did not find an alternative manifest');

    return {
      sceneManifest: null,
      manifestPath: null,
      manifestSource: null,
      warnings
    };
  }

  try {
    const sceneManifest = await sceneLoader.loadFromSpec(options.spec, discoveredManifestPath);
    warnings.push(`profile manifest auto-discovery selected: ${discoveredManifestPath}`);

    return {
      sceneManifest,
      manifestPath: discoveredManifestPath,
      manifestSource: 'auto-discovered',
      warnings
    };
  } catch (error) {
    warnings.push(`auto-discovered manifest unavailable: ${discoveredManifestPath}`);

    return {
      sceneManifest: null,
      manifestPath: null,
      manifestSource: null,
      warnings
    };
  }
}

function buildSceneCatalogEntry(specName, manifestPath, sceneManifest, errors = []) {
  const metadata = sceneManifest && typeof sceneManifest === 'object' ? sceneManifest.metadata || {} : {};
  const spec = sceneManifest && typeof sceneManifest === 'object' ? sceneManifest.spec || {} : {};
  const governanceContract = spec && typeof spec === 'object' ? spec.governance_contract || {} : {};
  const capabilityContract = spec && typeof spec === 'object' ? spec.capability_contract || {} : {};
  const bindings = Array.isArray(capabilityContract.bindings) ? capabilityContract.bindings : [];

  const entry = {
    spec: specName,
    manifest_path: manifestPath,
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : [],
    kind: typeof sceneManifest.kind === 'string' ? sceneManifest.kind : null,
    api_version: typeof sceneManifest.apiVersion === 'string' ? sceneManifest.apiVersion : null,
    scene_ref: typeof metadata.obj_id === 'string' ? metadata.obj_id : null,
    scene_version: typeof metadata.obj_version === 'string' ? metadata.obj_version : null,
    title: typeof metadata.title === 'string' ? metadata.title : null,
    domain: typeof spec.domain === 'string' ? spec.domain : null,
    risk_level: typeof governanceContract.risk_level === 'string' ? governanceContract.risk_level : null,
    binding_count: bindings.length
  };

  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0).map((tag) => tag.trim())
    : [];

  if (tags.length > 0) {
    entry.tags = tags;
  }

  return entry;
}

function matchesSceneCatalogFilters(entry, options) {
  if (options.domain) {
    const entryDomain = typeof entry.domain === 'string' ? entry.domain.toLowerCase() : '';
    if (entryDomain !== options.domain) {
      return false;
    }
  }

  if (options.kind) {
    const entryKind = typeof entry.kind === 'string' ? entry.kind.toLowerCase() : '';
    if (entryKind !== options.kind) {
      return false;
    }
  }

  return true;
}

async function listSpecDirectoryNames(projectRoot, fileSystem = fs) {
  const specsPath = path.join(projectRoot, '.sce', 'specs');
  const readDirectory = typeof fileSystem.readdir === 'function'
    ? fileSystem.readdir.bind(fileSystem)
    : fs.readdir.bind(fs);

  const entries = await readDirectory(specsPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry && typeof entry.isDirectory === 'function' && entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function buildSceneCatalog(options = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const sceneLoader = dependencies.sceneLoader || new SceneLoader({ projectPath: projectRoot });

  const readFile = typeof fileSystem.readFile === 'function'
    ? fileSystem.readFile.bind(fileSystem)
    : fs.readFile.bind(fs);

  const pathExists = typeof fileSystem.pathExists === 'function'
    ? fileSystem.pathExists.bind(fileSystem)
    : fs.pathExists.bind(fs);

  const specNames = options.spec
    ? [options.spec]
    : await listSpecDirectoryNames(projectRoot, fileSystem);

  if (options.spec) {
    const specPath = path.join(projectRoot, '.sce', 'specs', options.spec);
    if (!await pathExists(specPath)) {
      throw new Error(`target spec not found: ${options.spec}`);
    }
  }

  const entries = [];
  const summary = {
    specs_scanned: specNames.length,
    manifests_discovered: 0,
    skipped_no_manifest: 0,
    filtered_out: 0,
    entries_returned: 0,
    valid_entries: 0,
    invalid_entries: 0
  };

  for (const specName of specNames) {
    const manifestPath = await discoverSpecSceneManifestPath(projectRoot, specName, options.specManifest, fileSystem);

    if (!manifestPath) {
      summary.skipped_no_manifest += 1;

      if (options.includeInvalid) {
        const missingEntry = buildSceneCatalogEntry(specName, null, {}, ['scene manifest not found']);
        if (matchesSceneCatalogFilters(missingEntry, options)) {
          entries.push(missingEntry);
        } else {
          summary.filtered_out += 1;
        }
      }

      continue;
    }

    summary.manifests_discovered += 1;

    const manifestAbsolutePath = path.join(projectRoot, '.sce', 'specs', specName, manifestPath);
    let sceneManifest = {};
    let validationErrors = [];

    try {
      const rawContent = await readFile(manifestAbsolutePath, 'utf8');
      sceneManifest = sceneLoader.parseManifest(rawContent, manifestAbsolutePath);

      const manifestValidation = sceneLoader.validateManifest(sceneManifest);
      if (!manifestValidation.valid) {
        validationErrors = Array.isArray(manifestValidation.errors) ? manifestValidation.errors : ['invalid scene manifest'];
      }
    } catch (error) {
      validationErrors = [error.message || 'failed to parse scene manifest'];
    }

    const catalogEntry = buildSceneCatalogEntry(specName, manifestPath, sceneManifest, validationErrors);

    if (!catalogEntry.valid && !options.includeInvalid) {
      summary.filtered_out += 1;
      continue;
    }

    if (!matchesSceneCatalogFilters(catalogEntry, options)) {
      summary.filtered_out += 1;
      continue;
    }

    entries.push(catalogEntry);
  }

  entries.sort((left, right) => {
    const refCompare = String(left.scene_ref || '').localeCompare(String(right.scene_ref || ''));
    if (refCompare !== 0) {
      return refCompare;
    }

    const specCompare = String(left.spec || '').localeCompare(String(right.spec || ''));
    if (specCompare !== 0) {
      return specCompare;
    }

    return String(left.manifest_path || '').localeCompare(String(right.manifest_path || ''));
  });

  summary.entries_returned = entries.length;
  summary.valid_entries = entries.filter((entry) => entry.valid).length;
  summary.invalid_entries = entries.length - summary.valid_entries;

  return {
    generated_at: new Date().toISOString(),
    filters: {
      spec: options.spec || null,
      spec_manifest: options.specManifest,
      domain: options.domain || null,
      kind: options.kind || null,
      include_invalid: options.includeInvalid === true
    },
    summary,
    entries
  };
}

function tokenizeRouteQuery(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function buildSceneRouteCommands(entry, options) {
  if (!entry || !entry.spec || !entry.manifest_path) {
    return null;
  }

  const runMode = options.mode || 'dry_run';

  return {
    validate: `sce scene validate --spec ${entry.spec} --spec-manifest ${entry.manifest_path}`,
    doctor: `sce scene doctor --spec ${entry.spec} --spec-manifest ${entry.manifest_path} --mode ${runMode}`,
    run: `sce scene run --spec ${entry.spec} --spec-manifest ${entry.manifest_path} --mode ${runMode}`
  };
}

function scoreSceneRouteEntry(entry, options = {}, routePolicy = DEFAULT_SCENE_ROUTE_POLICY) {
  const normalizedPolicy = normalizeSceneRoutePolicy(routePolicy);
  const weights = normalizedPolicy.weights || {};
  const modeBias = normalizedPolicy.mode_bias && normalizedPolicy.mode_bias.commit
    ? normalizedPolicy.mode_bias.commit
    : {};

  let score = 0;
  const reasons = [];
  const sceneRef = String(entry.scene_ref || '').toLowerCase();
  const title = String(entry.title || '').toLowerCase();
  const spec = String(entry.spec || '').toLowerCase();

  if (entry.valid) {
    score += weights.valid_manifest;
    reasons.push('valid_manifest');
  } else {
    score += weights.invalid_manifest;
    reasons.push('invalid_manifest');
  }

  if (options.sceneRef) {
    const targetSceneRef = String(options.sceneRef).toLowerCase();

    if (sceneRef === targetSceneRef) {
      score += weights.scene_ref_exact;
      reasons.push('scene_ref_exact');
    } else if (sceneRef.includes(targetSceneRef)) {
      score += weights.scene_ref_contains;
      reasons.push('scene_ref_contains');
    } else {
      score += weights.scene_ref_mismatch;
      reasons.push('scene_ref_mismatch');
    }
  }

  if (options.query) {
    const tokens = tokenizeRouteQuery(options.query);
    const searchIndex = `${sceneRef} ${title} ${spec}`;

    let matchedTokens = 0;
    for (const token of tokens) {
      if (searchIndex.includes(token)) {
        matchedTokens += 1;
      }
    }

    if (tokens.length > 0) {
      score += matchedTokens * weights.query_token_match;

      if (matchedTokens > 0) {
        reasons.push(`query_tokens:${matchedTokens}/${tokens.length}`);
      } else {
        reasons.push('query_tokens:0');
      }
    }
  }

  if (options.mode === 'commit') {
    const riskLevel = String(entry.risk_level || '').toLowerCase();
    const riskBias = normalizeRoutePolicyNumber(modeBias[riskLevel], 0);

    if (riskBias !== 0) {
      score += riskBias;

      if (riskLevel === 'low' && riskBias > 0) {
        reasons.push('commit_low_risk');
      } else if ((riskLevel === 'high' || riskLevel === 'critical') && riskBias < 0) {
        reasons.push('commit_high_risk');
      } else {
        reasons.push(`commit_risk_bias:${riskLevel}`);
      }
    }
  }

  return { score, reasons };
}

function buildSceneRouteDecision(catalog, options = {}, routePolicy = DEFAULT_SCENE_ROUTE_POLICY) {
  const normalizedPolicy = normalizeSceneRoutePolicy(routePolicy);
  const maxAlternatives = Math.max(0, Math.trunc(normalizeRoutePolicyNumber(normalizedPolicy.max_alternatives, 4)));

  const candidates = Array.isArray(catalog.entries) ? catalog.entries : [];
  const ranked = candidates
    .map((entry) => {
      const scoring = scoreSceneRouteEntry(entry, options, normalizedPolicy);
      return {
        ...entry,
        score: scoring.score,
        route_reasons: scoring.reasons,
        commands: buildSceneRouteCommands(entry, options)
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return String(left.scene_ref || '').localeCompare(String(right.scene_ref || ''));
    });

  const selected = ranked.length > 0 ? ranked[0] : null;
  const second = ranked.length > 1 ? ranked[1] : null;
  const hasTie = Boolean(
    options.requireUnique
    && selected
    && second
    && selected.score === second.score
  );

  return {
    selected,
    alternatives: selected ? ranked.slice(1, 1 + maxAlternatives) : ranked.slice(0, maxAlternatives),
    hasTie,
    tie_with: hasTie ? second.scene_ref : null,
    candidates_scored: ranked.length
  };
}

function inferProfileFromDomain(domain, profileRules = null) {
  const normalizedDomain = String(domain || '').trim().toLowerCase();

  if (!normalizedDomain) {
    return 'default';
  }

  const domainAliases = isPlainObject(profileRules) && isPlainObject(profileRules.domain_aliases)
    ? profileRules.domain_aliases
    : DEFAULT_EVAL_PROFILE_INFERENCE_RULES.domain_aliases;

  const mappedProfile = normalizeProfileName(domainAliases[normalizedDomain]);
  if (mappedProfile) {
    return mappedProfile;
  }

  return 'default';
}

function inferProfileFromSceneRef(sceneRef, profileRules = null) {
  const normalizedSceneRef = String(sceneRef || '').trim().toLowerCase();

  if (!normalizedSceneRef) {
    return 'default';
  }

  const tokens = normalizedSceneRef.split(/[.:/_-]+/).filter(Boolean);

  if (tokens.length >= 2 && tokens[0] === 'scene') {
    const domainToken = tokens[1];
    const domainProfile = inferProfileFromDomain(domainToken, profileRules);

    if (domainProfile !== 'default') {
      return domainProfile;
    }
  }

  const sceneRefRules = isPlainObject(profileRules) && Array.isArray(profileRules.scene_ref_rules)
    ? profileRules.scene_ref_rules
    : DEFAULT_EVAL_PROFILE_INFERENCE_RULES.scene_ref_rules;

  for (const rule of sceneRefRules) {
    if (!isPlainObject(rule)) {
      continue;
    }

    const pattern = String(rule.pattern || '').trim();
    const profile = normalizeProfileName(rule.profile);

    if (!pattern || !profile) {
      continue;
    }

    try {
      if (new RegExp(pattern, 'i').test(normalizedSceneRef)) {
        return profile;
      }
    } catch (error) {
      continue;
    }
  }

  return 'default';
}

function resolveSceneEvalProfile(options = {}, sceneManifest = null, feedbackPayload = null, resultPayload = null, profileRules = null) {
  if (options.profile && EVAL_CONFIG_TEMPLATE_PROFILES.has(options.profile)) {
    return {
      profile: options.profile ? String(options.profile).trim().toLowerCase() : undefined,
      source: 'explicit'
    };
  }

  const sceneDomain = sceneManifest
    && sceneManifest.spec
    && typeof sceneManifest.spec.domain === 'string'
    ? sceneManifest.spec.domain
    : null;

  const sceneProfile = inferProfileFromDomain(sceneDomain, profileRules);
  if (sceneProfile !== 'default') {
    return {
      profile: sceneProfile,
      source: options.spec ? `spec:${options.spec}` : 'spec'
    };
  }

  const feedbackDomain = feedbackPayload && typeof feedbackPayload.domain === 'string'
    ? feedbackPayload.domain
    : null;
  const feedbackProfile = inferProfileFromDomain(feedbackDomain, profileRules);

  if (feedbackProfile !== 'default') {
    return {
      profile: feedbackProfile,
      source: 'feedback'
    };
  }

  const resultDomain = resultPayload && typeof resultPayload.domain === 'string'
    ? resultPayload.domain
    : (resultPayload
      && resultPayload.eval_payload
      && typeof resultPayload.eval_payload.domain === 'string'
        ? resultPayload.eval_payload.domain
        : null);

  const resultDomainProfile = inferProfileFromDomain(resultDomain, profileRules);
  if (resultDomainProfile !== 'default') {
    return {
      profile: resultDomainProfile,
      source: 'result:domain'
    };
  }

  const resultSceneRef = resultPayload && typeof resultPayload.scene_ref === 'string'
    ? resultPayload.scene_ref
    : (resultPayload
      && resultPayload.eval_payload
      && typeof resultPayload.eval_payload.scene_ref === 'string'
        ? resultPayload.eval_payload.scene_ref
        : null);

  const resultSceneRefProfile = inferProfileFromSceneRef(resultSceneRef, profileRules);
  if (resultSceneRefProfile !== 'default') {
    return {
      profile: resultSceneRefProfile,
      source: 'result:scene_ref'
    };
  }

  const feedbackSceneRef = feedbackPayload && typeof feedbackPayload.scene_ref === 'string'
    ? feedbackPayload.scene_ref
    : null;

  const feedbackSceneRefProfile = inferProfileFromSceneRef(feedbackSceneRef, profileRules);
  if (feedbackSceneRefProfile !== 'default') {
    return {
      profile: feedbackSceneRefProfile,
      source: 'feedback:scene_ref'
    };
  }

  return {
    profile: 'default',
    source: 'default'
  };
}

function normalizeEvalTaskSyncPolicy(policy = {}) {
  const merged = cloneDefaultEvalTaskSyncPolicy();

  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return merged;
  }

  merged.default_priority = normalizeTaskPriority(policy.default_priority, merged.default_priority);

  if (policy.priority_by_grade && typeof policy.priority_by_grade === 'object' && !Array.isArray(policy.priority_by_grade)) {
    const nextGradeMap = { ...merged.priority_by_grade };

    for (const [grade, priority] of Object.entries(policy.priority_by_grade)) {
      nextGradeMap[grade] = normalizeTaskPriority(priority, nextGradeMap[grade] || merged.default_priority);
    }

    merged.priority_by_grade = nextGradeMap;
  }

  if (Array.isArray(policy.keyword_priority_overrides)) {
    const overrides = [];

    for (const item of policy.keyword_priority_overrides) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const pattern = String(item.pattern || '').trim();
      if (!pattern) {
        continue;
      }

      overrides.push({
        pattern,
        priority: normalizeTaskPriority(item.priority, merged.default_priority)
      });
    }

    merged.keyword_priority_overrides = overrides;
  }

  return merged;
}

function resolvePriorityWeight(priority) {
  switch (normalizeTaskPriority(priority, 'low')) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    default:
      return 1;
  }
}

function chooseHigherPriority(leftPriority, rightPriority) {
  return resolvePriorityWeight(leftPriority) >= resolvePriorityWeight(rightPriority)
    ? normalizeTaskPriority(leftPriority, 'medium')
    : normalizeTaskPriority(rightPriority, 'medium');
}

function resolveEvalTaskPriority(recommendation, report, policy) {
  const effectivePolicy = normalizeEvalTaskSyncPolicy(policy);
  const grade = report && report.overall ? report.overall.grade : null;
  const byGrade = effectivePolicy.priority_by_grade || {};
  let priority = normalizeTaskPriority(
    grade && byGrade[grade] ? byGrade[grade] : effectivePolicy.default_priority,
    'medium'
  );

  const recommendationText = String(recommendation || '');
  for (const override of effectivePolicy.keyword_priority_overrides || []) {
    try {
      const regex = new RegExp(override.pattern, 'i');
      if (regex.test(recommendationText)) {
        priority = chooseHigherPriority(priority, override.priority);
      }
    } catch (error) {
      continue;
    }
  }

  return priority;
}

function dedupeRecommendations(messages = []) {
  const seen = new Set();
  const ordered = [];

  for (const message of messages) {
    const key = String(message || '').trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    ordered.push(String(message).trim());
  }

  return ordered;
}

function buildSceneEvalReport({ resultPayload, feedbackPayload, targetConfig, inputs }) {
  const runEvaluation = {
    available: false,
    trace_id: null,
    run_mode: null,
    status: null,
    metrics: null,
    score: null
  };

  if (resultPayload && typeof resultPayload === 'object') {
    const evalPayload = resultPayload.eval_payload && typeof resultPayload.eval_payload === 'object'
      ? resultPayload.eval_payload
      : null;

    runEvaluation.available = true;
    runEvaluation.trace_id = resultPayload.trace_id || (evalPayload && evalPayload.trace_id) || null;
    runEvaluation.run_mode = resultPayload.run_mode || (resultPayload.run_result && resultPayload.run_result.run_mode) || null;
    runEvaluation.status = (resultPayload.run_result && resultPayload.run_result.status)
      || (evalPayload && evalPayload.status)
      || null;
    runEvaluation.metrics = evalPayload && evalPayload.metrics ? evalPayload.metrics : null;

    if (runEvaluation.metrics) {
      const evalBridge = new EvalBridge();
      runEvaluation.score = evalBridge.score(evalPayload, targetConfig || {});
    }
  }

  const feedbackTasks = feedbackPayload && Array.isArray(feedbackPayload.tasks)
    ? feedbackPayload.tasks
    : [];

  const feedbackTaskSummary = buildFeedbackTaskSummary(feedbackTasks);
  const feedbackMetricSummary = buildFeedbackMetricSummary(feedbackTasks);
  const feedbackScoreResult = evaluateFeedbackScore(feedbackTaskSummary, feedbackMetricSummary, targetConfig || {});

  const feedbackEvaluation = {
    available: !!feedbackPayload,
    trace_id: feedbackPayload ? feedbackPayload.trace_id || null : null,
    task_summary: feedbackTaskSummary,
    metric_summary: feedbackMetricSummary,
    score: feedbackScoreResult.score,
    recommendations: feedbackScoreResult.recommendations
  };

  const weightedScores = [];
  if (typeof runEvaluation.score === 'number') {
    weightedScores.push({ weight: 0.6, value: runEvaluation.score });
  }

  if (typeof feedbackEvaluation.score === 'number') {
    weightedScores.push({ weight: weightedScores.length === 0 ? 1 : 0.4, value: feedbackEvaluation.score });
  }

  let overallScore = null;
  if (weightedScores.length === 1) {
    overallScore = Number(weightedScores[0].value.toFixed(2));
  } else if (weightedScores.length > 1) {
    const totalWeight = weightedScores.reduce((acc, item) => acc + item.weight, 0);
    const weightedValue = weightedScores.reduce((acc, item) => acc + (item.value * item.weight), 0);
    overallScore = Number((weightedValue / totalWeight).toFixed(2));
  }

  const overallRecommendations = dedupeRecommendations([
    ...(runEvaluation.status === 'denied' ? ['Resolve policy denial causes before commit rerun.'] : []),
    ...(runEvaluation.status === 'failed' ? ['Investigate failed runtime nodes and compensation logs.'] : []),
    ...feedbackEvaluation.recommendations
  ]);

  const sceneRef = (resultPayload && resultPayload.scene_ref)
    || (resultPayload && resultPayload.eval_payload && resultPayload.eval_payload.scene_ref)
    || (feedbackPayload && feedbackPayload.scene_ref)
    || null;

  const sceneVersion = (resultPayload && resultPayload.scene_version)
    || (resultPayload && resultPayload.eval_payload && resultPayload.eval_payload.scene_version)
    || (feedbackPayload && feedbackPayload.scene_version)
    || null;

  const traceId = runEvaluation.trace_id || feedbackEvaluation.trace_id || null;

  return {
    scene_ref: sceneRef,
    scene_version: sceneVersion,
    trace_id: traceId,
    target: targetConfig || {},
    inputs,
    run_evaluation: runEvaluation,
    feedback_evaluation: feedbackEvaluation,
    overall: {
      score: overallScore,
      grade: classifyEvalGrade(overallScore),
      recommendations: overallRecommendations
    }
  };
}

function createSceneEvalTaskLine(taskId, title, priority = 'medium', metadata = {}) {
  const suffixParts = ['eval_source=scene-eval'];

  if (metadata.traceId) {
    suffixParts.push(`trace_id=${metadata.traceId}`);
  }

  if (metadata.sceneRef) {
    suffixParts.push(`scene_ref=${metadata.sceneRef}`);
  }

  if (metadata.policySource) {
    suffixParts.push(`policy_source=${metadata.policySource}`);
  }

  const suffix = suffixParts.length > 0 ? ` [${suffixParts.join(' ')}]` : '';
  return `- [ ] ${taskId} [${normalizeTaskPriority(priority, 'medium')}] ${title}${suffix}`;
}

async function appendSceneEvalRecommendationsToSpecTasks(options, report, projectRoot, fileSystem = fs) {
  if (!options.syncSpecTasks) {
    return null;
  }

  if (!options.spec) {
    throw new Error('--sync-spec-tasks requires --spec source');
  }

  const tasksPath = path.join(projectRoot, '.sce', 'specs', options.spec, 'tasks.md');
  const tasksExists = await fileSystem.pathExists(tasksPath);

  if (!tasksExists) {
    throw new Error(`target spec tasks.md not found: ${tasksPath}`);
  }

  const currentContent = await fileSystem.readFile(tasksPath, 'utf8');
  const registry = collectExistingTaskRegistry(currentContent);
  const recommendations = report && report.overall && Array.isArray(report.overall.recommendations)
    ? report.overall.recommendations
    : [];
  const policy = normalizeEvalTaskSyncPolicy(options.taskSyncPolicy || {});
  const policySource = options.taskSyncPolicySource || (options.taskPolicy ? path.basename(String(options.taskPolicy)) : 'default');

  const lines = [];
  const addedRecommendations = [];
  let nextTaskId = registry.maxTaskId + 1;
  let duplicateCount = 0;

  for (const recommendation of recommendations) {
    const normalizedTitle = String(recommendation || '').trim();
    if (!normalizedTitle) {
      continue;
    }

    const titleKey = normalizedTitle.toLowerCase();
    if (registry.existingTitles.has(titleKey)) {
      duplicateCount += 1;
      continue;
    }

    registry.existingTitles.add(titleKey);

    const priority = resolveEvalTaskPriority(normalizedTitle, report, policy);

    lines.push(createSceneEvalTaskLine(nextTaskId, normalizedTitle, priority, {
      traceId: report.trace_id,
      sceneRef: report.scene_ref,
      policySource
    }));

    addedRecommendations.push({
      task_id: nextTaskId,
      title: normalizedTitle,
      priority,
      trace_id: report.trace_id || null
    });

    nextTaskId += 1;
  }

  if (addedRecommendations.length === 0) {
    return {
      tasks_path: tasksPath,
      trace_id: report.trace_id || null,
      policy_source: policySource,
      added_count: 0,
      skipped_duplicates: duplicateCount,
      skipped_reason: recommendations.length === 0
        ? 'no evaluation recommendations'
        : 'all evaluation recommendations already exist in tasks.md',
      added_tasks: []
    };
  }

  const sectionHeader = `## Scene Eval Suggested Tasks (${new Date().toISOString()})`;
  const prefix = currentContent.trimEnd();
  const chunks = [
    prefix,
    '',
    sectionHeader,
    '',
    ...lines,
    ''
  ];

  const nextContent = chunks.join('\n');
  await fileSystem.writeFile(tasksPath, nextContent, 'utf8');

  return {
    tasks_path: tasksPath,
    trace_id: report.trace_id || null,
    policy_source: policySource,
    added_count: addedRecommendations.length,
    skipped_duplicates: duplicateCount,
    first_task_id: addedRecommendations[0].task_id,
    last_task_id: addedRecommendations[addedRecommendations.length - 1].task_id,
    added_tasks: addedRecommendations
  };
}

function collectExistingTaskRegistry(tasksContent) {
  const taskPattern = /^-\s*\[[ x~-]\]\*?\s+(\d+(?:\.\d+)*)\s+(.+)$/;
  const lines = String(tasksContent || '').split('\n');
  const existingTitles = new Set();
  let maxTaskId = 0;

  for (const line of lines) {
    const match = line.match(taskPattern);
    if (!match) {
      continue;
    }

    const rawId = match[1];
    const rawTitle = match[2];
    const taskId = Number.parseInt(String(rawId).split('.')[0], 10);

    if (Number.isFinite(taskId)) {
      maxTaskId = Math.max(maxTaskId, taskId);
    }

    const normalizedTitle = String(rawTitle || '')
      .replace(/\s+\[[^\]]+\]$/, '')
      .trim()
      .toLowerCase();

    if (normalizedTitle) {
      existingTitles.add(normalizedTitle);
    }
  }

  return {
    maxTaskId,
    existingTitles
  };
}

function createDoctorTaskLine(taskId, suggestion, metadata = {}) {
  const suffixParts = [];

  if (suggestion && suggestion.code) {
    suffixParts.push(`doctor_code=${suggestion.code}`);
  }

  if (metadata.traceId) {
    suffixParts.push(`trace_id=${metadata.traceId}`);
  }

  if (metadata.sceneRef) {
    suffixParts.push(`scene_ref=${metadata.sceneRef}`);
  }

  const suffix = suffixParts.length > 0 ? ` [${suffixParts.join(' ')}]` : '';
  return `- [ ] ${taskId} [${suggestion.priority}] ${suggestion.title}${suffix}`;
}

async function appendDoctorSuggestionsToSpecTasks(options, report, projectRoot, fileSystem = fs) {
  if (!options.syncSpecTasks) {
    return null;
  }

  if (!options.spec) {
    throw new Error('--sync-spec-tasks requires --spec source');
  }

  const tasksPath = path.join(projectRoot, '.sce', 'specs', options.spec, 'tasks.md');
  const tasksExists = await fileSystem.pathExists(tasksPath);

  if (!tasksExists) {
    throw new Error(`target spec tasks.md not found: ${tasksPath}`);
  }

  const currentContent = await fileSystem.readFile(tasksPath, 'utf8');
  const registry = collectExistingTaskRegistry(currentContent);
  const actionableSuggestions = (report.suggestions || []).filter((item) => item && item.code !== 'ready-to-run');

  const lines = [];
  const addedSuggestions = [];
  let nextTaskId = registry.maxTaskId + 1;
  let duplicateCount = 0;

  for (const suggestion of actionableSuggestions) {
    const normalizedTitle = String(suggestion.title || '').trim();
    if (!normalizedTitle) {
      continue;
    }

    const titleKey = normalizedTitle.toLowerCase();
    if (registry.existingTitles.has(titleKey)) {
      duplicateCount += 1;
      continue;
    }

    registry.existingTitles.add(titleKey);

    lines.push(createDoctorTaskLine(nextTaskId, suggestion, {
      traceId: report.trace_id,
      sceneRef: report.scene_ref
    }));
    lines.push(`  - ${suggestion.action}`);

    addedSuggestions.push({
      task_id: nextTaskId,
      title: normalizedTitle,
      priority: suggestion.priority,
      suggestion_code: suggestion.code || null,
      trace_id: report.trace_id || null
    });

    nextTaskId += 1;
  }

  if (addedSuggestions.length === 0) {
    return {
      tasks_path: tasksPath,
      trace_id: report.trace_id || null,
      added_count: 0,
      skipped_duplicates: duplicateCount,
      skipped_reason: actionableSuggestions.length === 0
        ? 'no actionable suggestions'
        : 'all actionable suggestions already exist in tasks.md',
      added_tasks: []
    };
  }

  const sectionHeader = `## Doctor Suggested Tasks (${new Date().toISOString()})`;
  const prefix = currentContent.trimEnd();
  const chunks = [
    prefix,
    '',
    sectionHeader,
    '',
    ...lines,
    ''
  ];

  const nextContent = chunks.join('\n');
  await fileSystem.writeFile(tasksPath, nextContent, 'utf8');

  return {
    tasks_path: tasksPath,
    trace_id: report.trace_id || null,
    added_count: addedSuggestions.length,
    skipped_duplicates: duplicateCount,
    first_task_id: addedSuggestions[0].task_id,
    last_task_id: addedSuggestions[addedSuggestions.length - 1].task_id,
    added_tasks: addedSuggestions
  };
}

function resolveScenePackageGateTaskPriority(check = {}) {
  const checkId = String(check.id || '').trim().toLowerCase();

  if (checkId.startsWith('max-invalid-templates') || checkId.startsWith('unknown-layer-forbidden')) {
    return 'high';
  }

  if (checkId.startsWith('required-layer:')) {
    return 'medium';
  }

  return 'medium';
}

function resolveScenePackageGateRemediationPriority(action = {}, fallback = 'medium') {
  return normalizeTaskPriority(action.priority, fallback);
}

function buildScenePackageGateTaskTitle(check = {}) {
  const checkId = String(check.id || '').trim() || 'unknown-check';
  const actual = Object.prototype.hasOwnProperty.call(check, 'actual') ? check.actual : 'n/a';
  const expected = Object.prototype.hasOwnProperty.call(check, 'expected') ? check.expected : 'n/a';

  return `Resolve gate check '${checkId}' (actual=${actual}, expected=${expected})`;
}

function buildScenePackageGateRemediationTaskTitle(action = {}) {
  const actionId = String(action.id || '').trim() || 'unknown-action';
  const actionTitle = String(action.title || '').trim() || 'Execute gate remediation action';
  return `Execute gate remediation '${actionId}': ${actionTitle}`;
}

function extractScenePackageGateTaskCandidates(payload = {}) {
  const failedChecks = Array.isArray(payload.checks)
    ? payload.checks.filter((item) => item && item.passed === false)
    : [];

  const remediationActions = payload
    && payload.remediation
    && Array.isArray(payload.remediation.actions)
    ? payload.remediation.actions.filter((item) => isPlainObject(item) && String(item.id || '').trim())
    : [];

  if (remediationActions.length > 0) {
    return remediationActions.map((action) => ({
      source: 'remediation',
      title: buildScenePackageGateRemediationTaskTitle(action),
      priority: resolveScenePackageGateRemediationPriority(action, 'medium'),
      action_id: String(action.id || '').trim() || null,
      check_id: null,
      source_check_ids: Array.isArray(action.source_check_ids)
        ? action.source_check_ids
          .map((checkId) => String(checkId || '').trim())
          .filter((checkId) => checkId.length > 0)
        : []
    }));
  }

  return failedChecks.map((check) => ({
    source: 'check',
    title: buildScenePackageGateTaskTitle(check),
    priority: resolveScenePackageGateTaskPriority(check),
    action_id: null,
    check_id: String(check.id || '').trim() || null,
    source_check_ids: []
  }));
}

function createScenePackageGateTaskLine(taskId, candidate = {}, metadata = {}) {
  const suffixParts = ['gate_source=scene-package-gate'];

  if (candidate.action_id) {
    suffixParts.push(`action_id=${candidate.action_id}`);
  }

  if (candidate.check_id) {
    suffixParts.push(`check_id=${candidate.check_id}`);
  }

  if (Array.isArray(candidate.source_check_ids) && candidate.source_check_ids.length > 0) {
    suffixParts.push(`source_checks=${candidate.source_check_ids.join(',')}`);
  }

  if (metadata.policyProfile) {
    suffixParts.push(`policy_profile=${metadata.policyProfile}`);
  }

  const suffix = suffixParts.length > 0 ? ` [${suffixParts.join(' ')}]` : '';
  const priority = normalizeTaskPriority(candidate.priority, 'medium');
  const title = String(candidate.title || '').trim() || 'Resolve gate issue';

  return `- [ ] ${taskId} [${priority}] ${title}${suffix}`;
}

function buildScenePackageGateTaskDraft(payload = {}) {
  const failedChecks = Array.isArray(payload.checks)
    ? payload.checks.filter((item) => item && item.passed === false)
    : [];
  const taskCandidates = extractScenePackageGateTaskCandidates(payload);

  const lines = [
    '# Scene Package Gate Task Draft',
    '',
    `- generated_at: ${new Date().toISOString()}`,
    `- policy_profile: ${payload && payload.policy ? payload.policy.profile || 'unknown' : 'unknown'}`,
    `- summary: ${payload && payload.summary && payload.summary.passed ? 'passed' : 'failed'} (${failedChecks.length} failed checks, ${taskCandidates.length} suggested tasks)`,
    ''
  ];

  if (taskCandidates.length === 0) {
    lines.push('## Suggested Tasks', '', '- No failed checks. No action required.', '');
    return lines.join('\n');
  }

  lines.push('## Suggested Tasks', '');
  for (const candidate of taskCandidates) {
    const traceParts = [];
    if (candidate.action_id) {
      traceParts.push(`action_id=${candidate.action_id}`);
    }
    if (candidate.check_id) {
      traceParts.push(`check_id=${candidate.check_id}`);
    }

    const traceSuffix = traceParts.length > 0 ? ` [${traceParts.join(' ')}]` : '';
    lines.push(`- [ ] [${normalizeTaskPriority(candidate.priority, 'medium')}] ${candidate.title}${traceSuffix}`);
  }

  lines.push('');
  return lines.join('\n');
}

function buildScenePackageGateRemediationRunbook(payload = {}) {
  const actions = payload
    && payload.remediation
    && Array.isArray(payload.remediation.actions)
    ? payload.remediation.actions.filter((item) => isPlainObject(item) && String(item.id || '').trim())
    : [];

  const sortedActions = [...actions].sort((left, right) => {
    const weightDiff = resolvePriorityWeight(right.priority) - resolvePriorityWeight(left.priority);
    if (weightDiff !== 0) {
      return weightDiff;
    }

    return String(left.id || '').localeCompare(String(right.id || ''));
  });

  const lines = [
    '# Scene Package Gate Remediation Runbook',
    '',
    `- generated_at: ${new Date().toISOString()}`,
    `- policy_profile: ${payload && payload.policy ? payload.policy.profile || 'unknown' : 'unknown'}`,
    `- gate_status: ${payload && payload.summary && payload.summary.passed ? 'passed' : 'failed'}`,
    `- remediation_actions: ${sortedActions.length}`,
    ''
  ];

  if (sortedActions.length === 0) {
    lines.push('## Execution Plan', '', '- No remediation actions. Gate already satisfies policy.', '');
    return lines.join('\n');
  }

  lines.push('## Execution Plan', '');

  sortedActions.forEach((action, index) => {
    const actionId = String(action.id || '').trim() || 'unknown-action';
    const priority = normalizeTaskPriority(action.priority, 'medium');
    const title = String(action.title || '').trim() || 'Execute remediation action';
    const recommendation = String(action.recommendation || '').trim() || 'Review gate diagnostics and apply corrective action.';
    const commandHint = String(action.command_hint || '').trim() || 'sce scene package-gate --registry <path> --policy <path> --json';
    const sourceChecks = Array.isArray(action.source_check_ids)
      ? action.source_check_ids.map((checkId) => String(checkId || '').trim()).filter((checkId) => checkId.length > 0)
      : [];

    lines.push(`### ${index + 1}. [${priority}] ${actionId}`);
    lines.push(`- title: ${title}`);
    lines.push(`- recommendation: ${recommendation}`);
    lines.push(`- command: \`${commandHint}\``);

    if (sourceChecks.length > 0) {
      lines.push(`- source_checks: ${sourceChecks.join(', ')}`);
    }

    lines.push('');
  });

  return lines.join('\n');
}

async function writeScenePackageGateRemediationRunbook(options, payload, projectRoot, fileSystem = fs) {
  if (!options.runbookOut) {
    return null;
  }

  const runbookOutPath = resolvePath(projectRoot, options.runbookOut);
  const markdown = buildScenePackageGateRemediationRunbook(payload);

  await fileSystem.ensureDir(path.dirname(runbookOutPath));
  await fileSystem.writeFile(runbookOutPath, markdown, 'utf8');

  return {
    path: runbookOutPath,
    output_path: normalizeRelativePath(options.runbookOut),
    action_count: payload
      && payload.remediation
      && Array.isArray(payload.remediation.actions)
      ? payload.remediation.actions.length
      : 0
  };
}

async function writeScenePackageGateTaskDraft(options, payload, projectRoot, fileSystem = fs) {
  if (!options.taskOut) {
    return null;
  }

  const taskOutPath = resolvePath(projectRoot, options.taskOut);
  const markdown = buildScenePackageGateTaskDraft(payload);

  await fileSystem.ensureDir(path.dirname(taskOutPath));
  await fileSystem.writeFile(taskOutPath, markdown, 'utf8');

  return {
    path: taskOutPath,
    output_path: normalizeRelativePath(options.taskOut),
    failed_checks: payload && payload.summary ? payload.summary.failed_checks : 0,
    suggested_actions: payload
      && payload.remediation
      && Array.isArray(payload.remediation.actions)
      ? payload.remediation.actions.length
      : 0
  };
}

async function appendScenePackageGateChecksToSpecTasks(options, payload, projectRoot, fileSystem = fs) {
  if (!options.syncSpecTasks) {
    return null;
  }

  if (!options.spec) {
    throw new Error('--sync-spec-tasks requires --spec source');
  }

  const tasksPath = path.join(projectRoot, '.sce', 'specs', options.spec, 'tasks.md');
  const tasksExists = await fileSystem.pathExists(tasksPath);

  if (!tasksExists) {
    throw new Error(`target spec tasks.md not found: ${tasksPath}`);
  }

  const currentContent = await fileSystem.readFile(tasksPath, 'utf8');
  const registry = collectExistingTaskRegistry(currentContent);
  const taskCandidates = extractScenePackageGateTaskCandidates(payload);

  const lines = [];
  const addedTasks = [];
  let nextTaskId = registry.maxTaskId + 1;
  let duplicateCount = 0;

  for (const candidate of taskCandidates) {
    const title = String(candidate.title || '').trim() || 'Resolve gate issue';
    const titleKey = title.toLowerCase();

    if (registry.existingTitles.has(titleKey)) {
      duplicateCount += 1;
      continue;
    }

    registry.existingTitles.add(titleKey);

    lines.push(createScenePackageGateTaskLine(nextTaskId, candidate, {
      policyProfile: payload && payload.policy ? payload.policy.profile : undefined
    }));

    addedTasks.push({
      task_id: nextTaskId,
      title,
      priority: normalizeTaskPriority(candidate.priority, 'medium'),
      check_id: candidate.check_id || null,
      action_id: candidate.action_id || null,
      source_check_ids: Array.isArray(candidate.source_check_ids) ? candidate.source_check_ids : []
    });

    nextTaskId += 1;
  }

  if (addedTasks.length === 0) {
    return {
      tasks_path: tasksPath,
      added_count: 0,
      skipped_duplicates: duplicateCount,
      skipped_reason: taskCandidates.length === 0
        ? 'no failed gate checks'
        : 'all failed gate suggestions already exist in tasks.md',
      source_mode: taskCandidates.length > 0 && taskCandidates[0].source === 'remediation'
        ? 'remediation'
        : 'check',
      added_tasks: []
    };
  }

  const sectionHeader = `## Scene Package Gate Suggested Tasks (${new Date().toISOString()})`;
  const prefix = currentContent.trimEnd();
  const chunks = [
    prefix,
    '',
    sectionHeader,
    '',
    ...lines,
    ''
  ];

  const nextContent = chunks.join('\n');
  await fileSystem.writeFile(tasksPath, nextContent, 'utf8');

  return {
    tasks_path: tasksPath,
    added_count: addedTasks.length,
    skipped_duplicates: duplicateCount,
    source_mode: taskCandidates.length > 0 && taskCandidates[0].source === 'remediation'
      ? 'remediation'
      : 'check',
    first_task_id: addedTasks[0].task_id,
    last_task_id: addedTasks[addedTasks.length - 1].task_id,
    added_tasks: addedTasks
  };
}

function printValidationSummary(options, summary) {
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(chalk.blue('Scene Manifest Validation'));
  console.log(`  Status: ${chalk.green('valid')}`);
  console.log(`  Scene: ${chalk.cyan(summary.scene_ref)}@${summary.scene_version}`);
  console.log(`  Domain: ${summary.domain}`);
  console.log(`  Risk: ${summary.risk_level}`);
  console.log(`  Approval Required: ${summary.approval_required ? 'yes' : 'no'}`);
  console.log(`  Bindings: ${summary.binding_count} (side effects: ${summary.side_effect_binding_count})`);
}

function printDoctorSummary(options, report) {
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const statusColor = report.status === 'healthy' ? chalk.green : chalk.red;

  console.log(chalk.blue('Scene Doctor'));
  console.log(`  Status: ${statusColor(report.status)}`);
  console.log(`  Scene: ${chalk.cyan(report.scene_ref)}@${report.scene_version}`);
  console.log(`  Domain: ${report.domain}`);
  console.log(`  Risk: ${report.risk_level}`);
  console.log(`  Mode: ${report.mode}`);
  if (report.trace_id) {
    console.log(`  Trace: ${chalk.gray(report.trace_id)}`);
  }
  console.log(`  Plan: ${report.plan.valid ? chalk.green('valid') : chalk.red('invalid')} (${report.plan.node_count} nodes)`);

  if (report.policy) {
    console.log(`  Policy: ${report.policy.allowed ? chalk.green('allowed') : chalk.red('blocked')}`);
  }

  if (report.adapter_readiness) {
    console.log(`  Adapter Readiness: ${report.adapter_readiness.ready ? chalk.green('ready') : chalk.red('not ready')}`);
  }

  if (report.binding_plugins && (
    report.binding_plugins.handlers_loaded > 0
    || (Array.isArray(report.binding_plugins.warnings) && report.binding_plugins.warnings.length > 0)
    || report.binding_plugins.manifest_path
  )) {
    console.log(`  Binding Plugins: ${report.binding_plugins.handlers_loaded} handler(s)`);

    if (report.binding_plugins.manifest_path) {
      const manifestStatus = report.binding_plugins.manifest_loaded ? 'loaded' : 'not-loaded';
      console.log(`    Manifest: ${chalk.gray(report.binding_plugins.manifest_path)} (${manifestStatus})`);
    }

    if (Array.isArray(report.binding_plugins.warnings) && report.binding_plugins.warnings.length > 0) {
      console.log(chalk.yellow('  Binding Plugin Warnings:'));
      for (const warning of report.binding_plugins.warnings) {
        console.log(`    - ${warning}`);
      }
    }
  }

  if (report.blockers.length > 0) {
    console.log(chalk.yellow('  Blockers:'));
    for (const blocker of report.blockers) {
      console.log(`    - ${blocker}`);
    }
  }

  if (Array.isArray(report.suggestions) && report.suggestions.length > 0) {
    console.log(chalk.blue('  Suggested Actions:'));
    for (const suggestion of report.suggestions) {
      console.log(`    - [${suggestion.priority}] ${suggestion.title}`);
      console.log(`      ${chalk.gray(suggestion.action)}`);
    }
  }

  if (report.todo_output) {
    console.log(`  Todo Output: ${chalk.gray(report.todo_output)}`);
  }

  if (report.task_output) {
    console.log(`  Task Draft: ${chalk.gray(report.task_output)}`);
  }

  if (report.feedback_output) {
    console.log(`  Feedback Template: ${chalk.gray(report.feedback_output)}`);
  }

  if (report.task_sync) {
    console.log(`  Task Sync: +${report.task_sync.added_count} ${chalk.gray(report.task_sync.tasks_path)}`);
    if (report.task_sync.skipped_duplicates > 0) {
      console.log(`    ${chalk.gray(`Skipped duplicates: ${report.task_sync.skipped_duplicates}`)}`);
    }
    if (report.task_sync.skipped_reason) {
      console.log(`    ${chalk.gray(report.task_sync.skipped_reason)}`);
    }
  }
}


function printEvalSummary(options, report, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const overall = report.overall || {};
  const runEvaluation = report.run_evaluation || {};
  const feedbackEvaluation = report.feedback_evaluation || {};
  const overallScore = typeof overall.score === 'number' ? overall.score.toFixed(2) : 'n/a';

  console.log(chalk.blue('Scene Eval'));
  if (report.scene_ref) {
    console.log(`  Scene: ${chalk.cyan(report.scene_ref)}${report.scene_version ? `@${report.scene_version}` : ''}`);
  }
  if (report.trace_id) {
    console.log(`  Trace: ${chalk.gray(report.trace_id)}`);
  }

  const runScore = typeof runEvaluation.score === 'number' ? runEvaluation.score.toFixed(2) : 'n/a';
  const feedbackScore = typeof feedbackEvaluation.score === 'number' ? feedbackEvaluation.score.toFixed(2) : 'n/a';
  console.log(`  Run Score: ${runScore}`);
  console.log(`  Feedback Score: ${feedbackScore}`);

  if (feedbackEvaluation.task_summary) {
    const taskSummary = feedbackEvaluation.task_summary;
    console.log(`  Feedback Tasks: ${taskSummary.done}/${taskSummary.total} done, blocked ${taskSummary.blocked}`);
  }

  if (report.inputs && report.inputs.profile) {
    const profileSource = report.inputs.profile_source ? ` (${report.inputs.profile_source})` : '';
    console.log(`  Profile: ${report.inputs.profile}${profileSource}`);

    if (report.inputs.profile_rules_source && (report.inputs.profile_rules || report.inputs.profile_rules_source !== 'default')) {
      console.log(`  Profile Rules: ${report.inputs.profile_rules_source}`);
    }

    if (Array.isArray(report.inputs.profile_warnings) && report.inputs.profile_warnings.length > 0) {
      console.log(chalk.yellow('  Profile Warnings:'));
      for (const warning of report.inputs.profile_warnings) {
        console.log(`    - ${warning}`);
      }
    }
  }

  console.log(`  Overall Score: ${overallScore}`);
  console.log(`  Grade: ${overall.grade || 'insufficient_data'}`);

  if (Array.isArray(overall.recommendations) && overall.recommendations.length > 0) {
    console.log(chalk.yellow('  Recommendations:'));
    for (const recommendation of overall.recommendations) {
      console.log(`    - ${recommendation}`);
    }
  }

  if (report.task_sync) {
    console.log(`  Task Sync: +${report.task_sync.added_count} ${chalk.gray(report.task_sync.tasks_path)}`);
    if (report.task_sync.policy_source) {
      console.log(`    ${chalk.gray(`Policy Source: ${report.task_sync.policy_source}`)}`);
    }
    if (report.task_sync.skipped_duplicates > 0) {
      console.log(`    ${chalk.gray(`Skipped duplicates: ${report.task_sync.skipped_duplicates}`)}`);
    }
    if (report.task_sync.skipped_reason) {
      console.log(`    ${chalk.gray(report.task_sync.skipped_reason)}`);
    }
  }

  if (report.output_path) {
    console.log(`  Eval Output: ${chalk.gray(resolvePath(projectRoot, report.output_path))}`);
  }
}

function printSceneCatalogSummary(options, catalog, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(catalog, null, 2));
    return;
  }

  console.log(chalk.blue('Scene Catalog'));
  console.log(`  Specs Scanned: ${catalog.summary.specs_scanned}`);
  console.log(`  Manifests: ${catalog.summary.manifests_discovered}`);
  console.log(`  Entries: ${catalog.summary.entries_returned}`);
  console.log(`  Valid: ${catalog.summary.valid_entries}`);

  if (catalog.summary.invalid_entries > 0) {
    console.log(`  Invalid: ${catalog.summary.invalid_entries}`);
  }

  if (catalog.summary.skipped_no_manifest > 0) {
    console.log(`  Missing Manifest: ${catalog.summary.skipped_no_manifest}`);
  }

  if (catalog.output_path) {
    console.log(`  Output: ${chalk.gray(resolvePath(projectRoot, catalog.output_path))}`);
  }

  if (!Array.isArray(catalog.entries) || catalog.entries.length === 0) {
    console.log(chalk.yellow('  No scene entries matched current filters.'));
    return;
  }

  for (const entry of catalog.entries) {
    const statusLabel = entry.valid ? chalk.green('valid') : chalk.red('invalid');
    const domain = entry.domain || 'unknown';
    const reference = entry.scene_ref || '(unknown-scene)';
    const versionSuffix = entry.scene_version ? `@${entry.scene_version}` : '';
    const specName = entry.spec || '(unknown-spec)';
    const manifestPath = entry.manifest_path || '(none)';

    console.log(`  - ${chalk.cyan(reference)}${versionSuffix} [${domain}] ${statusLabel}`);
    console.log(`    Spec: ${specName}`);
    console.log(`    Manifest: ${chalk.gray(manifestPath)}`);

    if (!entry.valid && Array.isArray(entry.errors) && entry.errors.length > 0) {
      console.log(`    Errors: ${entry.errors.join('; ')}`);
    }
  }
}

function printSceneRouteSummary(options, routePayload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(routePayload, null, 2));
    return;
  }

  console.log(chalk.blue('Scene Route'));
  if (routePayload.query && Array.isArray(routePayload.query.selectors) && routePayload.query.selectors.length > 0) {
    console.log(`  Selectors: ${routePayload.query.selectors.join(', ')}`);
  }

  console.log(`  Candidates: ${routePayload.summary.candidates_scored}`);

  if (routePayload.route_policy_source) {
    console.log(`  Route Policy: ${routePayload.route_policy_source}`);
  }

  if (routePayload.output_path) {
    console.log(`  Output: ${chalk.gray(resolvePath(projectRoot, routePayload.output_path))}`);
  }

  if (!routePayload.selected) {
    console.log(chalk.yellow('  No route candidate matched current selectors.'));
    return;
  }

  const selected = routePayload.selected;
  const statusLabel = selected.valid ? chalk.green('valid') : chalk.red('invalid');
  const selectedVersion = selected.scene_version ? `@${selected.scene_version}` : '';

  console.log(`  Selected: ${chalk.cyan(selected.scene_ref || '(unknown-scene)')}${selectedVersion} [${selected.domain || 'unknown'}] ${statusLabel}`);
  console.log(`  Spec: ${selected.spec}`);
  console.log(`  Manifest: ${chalk.gray(selected.manifest_path)}`);
  console.log(`  Score: ${selected.score}`);

  if (Array.isArray(selected.route_reasons) && selected.route_reasons.length > 0) {
    console.log(`  Reasons: ${selected.route_reasons.join(', ')}`);
  }

  if (selected.commands) {
    console.log('  Next Commands:');
    console.log(`    Validate: ${chalk.gray(selected.commands.validate)}`);
    console.log(`    Doctor:   ${chalk.gray(selected.commands.doctor)}`);
    console.log(`    Run:      ${chalk.gray(selected.commands.run)}`);
  }

  if (routePayload.summary.tie_detected) {
    console.log(chalk.yellow(`  Tie detected with: ${routePayload.summary.tie_with}`));
  }

  if (Array.isArray(routePayload.alternatives) && routePayload.alternatives.length > 0) {
    console.log('  Alternatives:');
    for (const candidate of routePayload.alternatives) {
      const versionSuffix = candidate.scene_version ? `@${candidate.scene_version}` : '';
      console.log(`    - ${candidate.scene_ref || '(unknown-scene)'}${versionSuffix} (score=${candidate.score})`);
    }
  }
}

function printSceneRoutePolicySuggestSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.blue('Scene Route Policy Suggest'));
  console.log(`  Eval Reports: ${payload.analysis.total_reports}`);
  console.log(`  Dominant Profile: ${payload.analysis.dominant_profile}`);
  console.log(`  Baseline: ${payload.baseline.source}`);
  console.log(`  Max Adjustment: ${payload.max_adjustment}`);
  console.log(`  Adjustments: ${payload.adjustments.length}`);

  if (payload.output_path) {
    console.log(`  Output: ${chalk.gray(resolvePath(projectRoot, payload.output_path))}`);
  }

  if (payload.policy_output_path) {
    console.log(`  Policy Output: ${chalk.gray(resolvePath(projectRoot, payload.policy_output_path))}`);
  }

  if (!Array.isArray(payload.adjustments) || payload.adjustments.length === 0) {
    console.log(chalk.yellow('  No adjustments suggested under current signals.'));
    return;
  }

  console.log('  Suggested Adjustments:');
  for (const adjustment of payload.adjustments) {
    const reasonSuffix = adjustment.rationale ? ` | ${adjustment.rationale}` : '';
    console.log(`    - ${adjustment.path}: ${adjustment.from} -> ${adjustment.to} (delta=${adjustment.delta})${reasonSuffix}`);
  }
}

function printSceneRoutePolicyRolloutSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.blue('Scene Route Policy Rollout'));
  console.log(`  Rollout: ${payload.rollout_name}`);
  console.log(`  Target Policy: ${payload.target_policy_path}`);
  console.log(`  Changed Fields: ${payload.summary.changed_fields}`);
  console.log(`  Baseline Source: ${payload.baseline_source || 'unknown'}`);

  if (payload.rollout_dir) {
    console.log(`  Output Dir: ${chalk.gray(resolvePath(projectRoot, payload.rollout_dir))}`);
  }

  if (payload.files && payload.files.plan) {
    console.log(`  Plan: ${chalk.gray(resolvePath(projectRoot, payload.files.plan))}`);
  }

  if (payload.files && payload.files.runbook) {
    console.log(`  Runbook: ${chalk.gray(resolvePath(projectRoot, payload.files.runbook))}`);
  }

  if (!Array.isArray(payload.changed_fields) || payload.changed_fields.length === 0) {
    console.log(chalk.yellow('  No policy field changes detected in rollout package.'));
    return;
  }

  console.log('  Changed Fields:');
  for (const change of payload.changed_fields) {
    console.log(`    - ${change.path}: ${change.from} -> ${change.to} (delta=${change.delta})`);
  }
}

function printScenePackageTemplateSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.blue('Scene Package Template'));
  console.log(`  Coordinate: ${payload.summary.coordinate || 'n/a'}`);
  console.log(`  Kind: ${payload.summary.kind}`);
  console.log(`  Output: ${chalk.gray(resolvePath(projectRoot, payload.output_path))}`);
  console.log(`  Overwritten: ${payload.overwritten ? 'yes' : 'no'}`);
}

function printScenePackageValidateSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const statusLabel = payload.valid ? chalk.green('valid') : chalk.red('invalid');
  console.log(chalk.blue('Scene Package Validate'));
  console.log(`  Status: ${statusLabel}`);
  if (payload.strict) {
    console.log(`  Mode: ${chalk.yellow('strict')}`);
  }
  if (payload.input && payload.input.mode) {
    console.log(`  Validation: ${payload.input.mode}`);
  }
  console.log(`  Source: ${chalk.gray(resolvePath(projectRoot, payload.input.path))}`);

  if (payload.summary.coordinate) {
    console.log(`  Coordinate: ${payload.summary.coordinate}`);
  }

  console.log(`  Kind: ${payload.summary.kind || 'unknown'}`);
  console.log(`  Parameters: ${payload.summary.parameter_count}`);

  if (typeof payload.summary.files_checked === 'number') {
    console.log(`  Files checked: ${payload.summary.files_checked}, missing: ${payload.summary.files_missing}`);
  }

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    console.log(chalk.red('  Errors:'));
    for (const error of payload.errors) {
      console.log(`    - ${error}`);
    }
  }

  if (Array.isArray(payload.warnings) && payload.warnings.length > 0) {
    console.log(chalk.yellow('  Warnings:'));
    for (const warning of payload.warnings) {
      console.log(`    - ${warning}`);
    }
  }
}

function printScenePackagePublishSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.blue('Scene Package Publish'));
  console.log(`  Mode: ${payload.mode}`);
  console.log(`  Template ID: ${payload.template.id}`);
  console.log(`  Coordinate: ${payload.template.coordinate || 'n/a'}`);
  console.log(`  Source Spec: ${payload.source.spec}`);
  console.log(`  Output Dir: ${chalk.gray(resolvePath(projectRoot, payload.template.output_dir))}`);
  console.log(`  Manifest: ${chalk.gray(resolvePath(projectRoot, payload.template.manifest_path))}`);
  console.log(`  Overwritten: ${payload.overwritten ? 'yes' : 'no'}`);
  if (payload.ontology_validation) {
    const ontology = payload.ontology_validation;
    const statusLabel = ontology.valid ? chalk.green('valid') : chalk.red('invalid');
    const scoreLabel = Number.isFinite(ontology.score) ? `${ontology.score}` : 'n/a';
    const thresholdLabel = ontology.min_score === null ? 'none' : String(ontology.min_score);
    console.log(`  Ontology: ${statusLabel} (score: ${scoreLabel}, min: ${thresholdLabel})`);
  }
  if (payload.dry_run) {
    console.log(chalk.yellow('  (dry-run: no files written)'));
  }
}

function printScenePackageInstantiateSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.blue('Scene Package Instantiate'));
  console.log(`  Template ID: ${payload.template.id || 'unknown'}`);
  console.log(`  Target Spec: ${payload.target.spec}`);
  console.log(`  Scene Manifest: ${chalk.gray(resolvePath(projectRoot, payload.target.scene_manifest_path))}`);
  console.log(`  Package Contract: ${chalk.gray(resolvePath(projectRoot, payload.target.package_contract_path))}`);
  console.log(`  Overwritten: ${payload.overwritten ? 'yes' : 'no'}`);

  if (Array.isArray(payload.summary.missing_parameters) && payload.summary.missing_parameters.length > 0) {
    console.log(chalk.yellow(`  Missing Parameters: ${payload.summary.missing_parameters.join(', ')}`));
  }
}

function printScenePackageRegistrySummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const invalidLabel = payload.summary.invalid_templates > 0
    ? chalk.yellow(payload.summary.invalid_templates)
    : chalk.green(payload.summary.invalid_templates);

  console.log(chalk.blue('Scene Package Registry'));
  console.log(`  Template Root: ${chalk.gray(resolvePath(projectRoot, payload.template_root))}`);
  console.log(`  Templates: ${payload.summary.total_templates}`);
  console.log(`  Valid: ${chalk.green(payload.summary.valid_templates)}`);
  console.log(`  Invalid: ${invalidLabel}`);
  console.log(`  Layers: L1=${payload.summary.layer_counts.l1_capability}, L2=${payload.summary.layer_counts.l2_domain}, L3=${payload.summary.layer_counts.l3_instance}, Unknown=${payload.summary.layer_counts.unknown}`);

  if (payload.output_path) {
    console.log(`  Output: ${chalk.gray(resolvePath(projectRoot, payload.output_path))}`);
  }

  if (!Array.isArray(payload.templates) || payload.templates.length === 0) {
    return;
  }

  const invalidTemplates = payload.templates.filter((item) => item.valid === false);
  if (invalidTemplates.length > 0) {
    console.log(chalk.yellow('  Invalid Templates:'));
    for (const item of invalidTemplates) {
      const reason = Array.isArray(item.issues) && item.issues.length > 0 ? item.issues[0] : 'unknown';
      console.log(`    - ${item.template_id}: ${reason}`);
    }
  }
}

function printScenePackageGateTemplateSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.blue('Scene Package Gate Template'));
  console.log(`  Profile: ${payload.profile}`);
  console.log(`  Output: ${chalk.gray(resolvePath(projectRoot, payload.output_path))}`);
  console.log(`  Overwritten: ${payload.overwritten ? 'yes' : 'no'}`);
}

function printScenePackageGateSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const statusLabel = payload.summary.passed ? chalk.green('passed') : chalk.red('failed');

  console.log(chalk.blue('Scene Package Gate'));
  console.log(`  Status: ${statusLabel}`);
  console.log(`  Registry: ${chalk.gray(resolvePath(projectRoot, payload.registry_path))}`);
  console.log(`  Policy: ${chalk.gray(resolvePath(projectRoot, payload.policy_path))}`);
  console.log(`  Checks: ${payload.summary.total_checks} (failed: ${payload.summary.failed_checks})`);

  if (payload.output_path) {
    console.log(`  Output: ${chalk.gray(resolvePath(projectRoot, payload.output_path))}`);
  }

  if (payload.task_draft && payload.task_draft.output_path) {
    console.log(`  Task Draft: ${chalk.gray(resolvePath(projectRoot, payload.task_draft.output_path))}`);
  }

  if (payload.runbook && payload.runbook.output_path) {
    console.log(`  Runbook: ${chalk.gray(resolvePath(projectRoot, payload.runbook.output_path))}`);
  }

  if (payload.task_sync) {
    console.log(`  Task Sync: +${payload.task_sync.added_count} ${chalk.gray(payload.task_sync.tasks_path)}`);
    if (payload.task_sync.skipped_duplicates > 0) {
      console.log(`    ${chalk.gray(`Skipped duplicates: ${payload.task_sync.skipped_duplicates}`)}`);
    }
    if (payload.task_sync.skipped_reason) {
      console.log(`    ${chalk.gray(payload.task_sync.skipped_reason)}`);
    }
  }

  if (payload.remediation && Array.isArray(payload.remediation.actions) && payload.remediation.actions.length > 0) {
    console.log(`  Remediation Actions: ${payload.remediation.actions.length}`);
    for (const action of payload.remediation.actions.slice(0, 3)) {
      console.log(`    - [${action.priority}] ${action.title}`);
    }
  }

  const failed = Array.isArray(payload.checks) ? payload.checks.filter((item) => item.passed === false) : [];
  if (failed.length > 0) {
    console.log(chalk.red('  Failed Checks:'));
    for (const item of failed) {
      console.log(`    - ${item.id}: actual=${item.actual}, expected=${item.expected}`);
    }
  }
}

function resolveScaffoldTemplatePath(options, projectRoot) {
  if (options.template) {
    return resolvePath(projectRoot, options.template);
  }

  return BUILTIN_SCAFFOLD_TEMPLATES[options.type];
}

function resolveScaffoldOutputPath(projectRoot, options) {
  return path.join(projectRoot, '.sce', 'specs', options.spec, options.output);
}

function applyScaffoldOverrides(manifest, options) {
  const nextManifest = JSON.parse(JSON.stringify(manifest || {}));

  if (!nextManifest.metadata || typeof nextManifest.metadata !== 'object') {
    nextManifest.metadata = {};
  }

  if (options.objId) {
    nextManifest.metadata.obj_id = options.objId;
  }

  if (options.title) {
    nextManifest.metadata.title = options.title;
  }

  if (!nextManifest.metadata.obj_version) {
    nextManifest.metadata.obj_version = '0.2.0';
  }

  return nextManifest;
}

function printScaffoldSummary(options, summary) {
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(chalk.blue('Scene Scaffold'));
  console.log(`  Spec: ${chalk.cyan(summary.spec)}`);
  console.log(`  Type: ${summary.type}`);
  console.log(`  Template: ${chalk.gray(summary.template_path)}`);
  console.log(`  Output: ${chalk.gray(summary.output_path)}`);
  console.log(`  Scene: ${chalk.cyan(summary.scene_ref)}@${summary.scene_version}`);
  console.log(`  Title: ${summary.title}`);
  console.log(`  Dry Run: ${summary.dry_run ? 'yes' : 'no'}`);
}

async function runSceneValidateCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const sceneLoader = dependencies.sceneLoader || new SceneLoader({ projectPath: projectRoot });

  const options = normalizeValidateOptions(rawOptions);
  const validationError = validateSourceOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene validation failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const sceneManifest = await loadSceneManifest(sceneLoader, options, projectRoot);
    const summary = buildManifestSummary(sceneManifest);
    printValidationSummary(options, summary);
    return summary;
  } catch (error) {
    console.error(chalk.red('Scene validation failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function runSceneDoctorCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const sceneLoader = dependencies.sceneLoader || new SceneLoader({ projectPath: projectRoot });
  const planCompiler = dependencies.planCompiler || new PlanCompiler();
  const policyGate = dependencies.policyGate || new PolicyGate();
  const readJson = dependencies.readJson || fs.readJson;
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeDoctorOptions(rawOptions);
  const validationError = validateDoctorOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene doctor failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const runtimeExecutor = dependencies.runtimeExecutor || new RuntimeExecutor({
    projectRoot,
    moquiConfigPath: options.moquiConfig,
    bindingPluginDir: options.bindingPluginDir,
    bindingPluginManifest: options.bindingPluginManifest,
    bindingPluginAutoDiscovery: options.bindingPluginAutoDiscovery,
    bindingPluginManifestLoad: options.bindingPluginManifestLoad
  });

  try {
    const sceneManifest = await loadSceneManifest(sceneLoader, options, projectRoot);
    const context = await buildRuntimeContext(options, projectRoot, readJson);
    const doctorTraceId = options.traceId || createDoctorTraceId();

    let plan = null;
    let planError = null;
    try {
      plan = planCompiler.compile(sceneManifest, {
        runMode: options.mode,
        traceId: doctorTraceId
      });
    } catch (error) {
      planError = error.message;
    }

    const policy = policyGate.evaluate(sceneManifest, options.mode, context);

    let adapterReadiness = null;
    const domain = ((sceneManifest.spec || {}).domain || 'erp').toLowerCase();
    if (options.checkAdapter && (domain === 'robot' || domain === 'hybrid')) {
      try {
        adapterReadiness = await runtimeExecutor.adapterReadinessChecker(sceneManifest, {
          traceId: doctorTraceId,
          context
        });
      } catch (error) {
        adapterReadiness = {
          ready: false,
          checks: [],
          error: error.message
        };
      }
    }

    const report = buildDoctorSummary(sceneManifest, {
      mode: options.mode,
      plan,
      planError,
      policy,
      adapterReadiness,
      bindingPlugins: runtimeExecutor && runtimeExecutor.bindingPluginLoad
        ? runtimeExecutor.bindingPluginLoad
        : null,
      traceId: doctorTraceId
    });

    report.suggestions = buildDoctorSuggestions(report, sceneManifest);
    const todoOutputPath = await writeDoctorTodo(options, report, projectRoot, fileSystem);
    if (todoOutputPath) {
      report.todo_output = todoOutputPath;
    }

    const taskOutputPath = await writeDoctorTaskDraft(options, report, projectRoot, fileSystem);
    if (taskOutputPath) {
      report.task_output = taskOutputPath;
    }

    const taskSyncResult = await appendDoctorSuggestionsToSpecTasks(options, report, projectRoot, fileSystem);
    if (taskSyncResult) {
      report.task_sync = taskSyncResult;
    }

    const feedbackOutputPath = await writeDoctorFeedbackTemplate(options, report, projectRoot, fileSystem);
    if (feedbackOutputPath) {
      report.feedback_output = feedbackOutputPath;
    }

    printDoctorSummary(options, report);

    if (report.status === 'blocked') {
      process.exitCode = 1;
    }

    return report;
  } catch (error) {
    console.error(chalk.red('Scene doctor failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}


async function runSceneEvalCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const sceneLoader = dependencies.sceneLoader || new SceneLoader({ projectPath: projectRoot });

  const options = normalizeEvalOptions(rawOptions);
  const validationError = validateEvalOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene eval failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    let resultPayload = null;
    let feedbackPayload = null;
    let targetConfig = {};
    let taskSyncPolicy = cloneDefaultEvalTaskSyncPolicy();
    let profileSceneManifest = null;
    let profileManifestPath = null;
    let profileManifestSource = null;
    let profileRules = createDefaultSceneEvalProfileRulesTemplate();
    let profileRulesSource = 'default';
    const profileWarnings = [];

    if (options.result) {
      const resultPath = resolvePath(projectRoot, options.result);
      resultPayload = await fileSystem.readJson(resultPath);
    }

    if (options.feedback) {
      const feedbackPath = resolvePath(projectRoot, options.feedback);
      const feedbackMarkdown = await fileSystem.readFile(feedbackPath, 'utf8');
      feedbackPayload = parseDoctorFeedbackTemplate(feedbackMarkdown);
    }

    const profileRulesResolution = await loadSceneEvalProfileRules(options, projectRoot, fileSystem);
    profileRules = profileRulesResolution.rules;
    profileRulesSource = profileRulesResolution.source;

    if (Array.isArray(profileRulesResolution.warnings) && profileRulesResolution.warnings.length > 0) {
      profileWarnings.push(...profileRulesResolution.warnings);
    }

    const profileManifestResolution = await loadSceneManifestForEvalProfile(
      options,
      sceneLoader,
      projectRoot,
      fileSystem
    );
    profileSceneManifest = profileManifestResolution.sceneManifest;
    profileManifestPath = profileManifestResolution.manifestPath;
    profileManifestSource = profileManifestResolution.manifestSource;

    if (Array.isArray(profileManifestResolution.warnings) && profileManifestResolution.warnings.length > 0) {
      profileWarnings.push(...profileManifestResolution.warnings);
    }

    const profileResolution = resolveSceneEvalProfile(options, profileSceneManifest, feedbackPayload, resultPayload, profileRules);

    if (!options.profile && options.profileInferStrict && profileResolution.profile === 'default') {
      throw new Error('profile inference strict mode failed: resolved default profile (provide --profile or include inferable domain/scene_ref)');
    }
    const inferredProfileTemplate = createSceneEvalConfigTemplateByProfile(profileResolution.profile);
    taskSyncPolicy = normalizeEvalTaskSyncPolicy(mergePlainObject(taskSyncPolicy, inferredProfileTemplate.task_sync_policy));

    if (options.profile) {
      targetConfig = mergePlainObject(targetConfig, inferredProfileTemplate.target || {});
    }

    if (options.evalConfig) {
      const evalConfigPath = resolvePath(projectRoot, options.evalConfig);
      const evalConfigRaw = await fileSystem.readJson(evalConfigPath);
      if (!isPlainObject(evalConfigRaw)) {
        throw new Error('eval config file must contain a JSON object');
      }

      const resolvedConfig = resolveSceneEvalConfigProfile(evalConfigRaw, options.env || null);
      targetConfig = mergePlainObject(targetConfig, resolvedConfig.targetConfig);
      taskSyncPolicy = normalizeEvalTaskSyncPolicy(mergePlainObject(taskSyncPolicy, resolvedConfig.taskSyncPolicy));
    }

    if (options.target) {
      const targetPath = resolvePath(projectRoot, options.target);
      const targetOverride = await fileSystem.readJson(targetPath);
      if (!isPlainObject(targetOverride)) {
        throw new Error('target file must contain a JSON object');
      }
      targetConfig = mergePlainObject(targetConfig, targetOverride);
    }

    if (options.taskPolicy) {
      const taskPolicyPath = resolvePath(projectRoot, options.taskPolicy);
      const taskPolicyRaw = await fileSystem.readJson(taskPolicyPath);
      if (!isPlainObject(taskPolicyRaw)) {
        throw new Error('task policy file must contain a JSON object');
      }
      taskSyncPolicy = normalizeEvalTaskSyncPolicy(mergePlainObject(taskSyncPolicy, taskPolicyRaw));
    }

    const report = buildSceneEvalReport({
      resultPayload,
      feedbackPayload,
      targetConfig,
      inputs: {
        result: options.result || null,
        feedback: options.feedback || null,
        target: options.target || null,
        task_policy: options.taskPolicy || null,
        eval_config: options.evalConfig || null,
        env: options.env || null,
        profile: profileResolution.profile,
        profile_source: profileResolution.source,
        profile_infer_strict: options.profileInferStrict === true,
        profile_manifest_auto_discovery: options.profileManifestAutoDiscovery !== false,
        profile_manifest: profileManifestPath || null,
        profile_manifest_source: profileManifestSource || null,
        profile_rules: options.profileRules || null,
        profile_rules_source: profileRulesSource,
        profile_warnings: profileWarnings
      }
    });

    const policySource = options.taskPolicy
      ? path.basename(String(options.taskPolicy))
      : (options.evalConfig
        ? `eval-config:${path.basename(String(options.evalConfig))}${options.env ? `#${options.env}` : ''}`
        : `profile:${profileResolution.profile}:${profileResolution.source}`);

    const taskSyncResult = await appendSceneEvalRecommendationsToSpecTasks({
      ...options,
      taskSyncPolicy,
      taskSyncPolicySource: policySource
    }, report, projectRoot, fileSystem);
    if (taskSyncResult) {
      report.task_sync = taskSyncResult;
    }

    if (options.out) {
      const outputPath = resolvePath(projectRoot, options.out);
      await fileSystem.ensureDir(path.dirname(outputPath));
      await fileSystem.writeJson(outputPath, report, { spaces: 2 });
      report.output_path = options.out;
      report.output_abs_path = outputPath;
    }

    printEvalSummary(options, report, projectRoot);
    return report;
  } catch (error) {
    console.error(chalk.red('Scene eval failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function runSceneEvalPolicyTemplateCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeEvalPolicyTemplateOptions(rawOptions);
  const validationError = validateEvalPolicyTemplateOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene eval policy template failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const outputPath = resolvePath(projectRoot, options.out);
    const outputExists = await fileSystem.pathExists(outputPath);

    if (outputExists && !options.force) {
      throw new Error(`output file already exists: ${outputPath} (use --force to overwrite)`);
    }

    const payload = cloneDefaultEvalTaskSyncPolicy();
    await fileSystem.ensureDir(path.dirname(outputPath));
    await fileSystem.writeJson(outputPath, payload, { spaces: 2 });

    const summary = {
      created: true,
      overwritten: outputExists,
      output_path: options.out,
      output_abs_path: outputPath,
      policy: payload
    };

    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(chalk.blue('Scene Eval Policy Template'));
      console.log(`  Output: ${chalk.gray(outputPath)}`);
      console.log(`  Overwritten: ${outputExists ? 'yes' : 'no'}`);
    }

    return summary;
  } catch (error) {
    console.error(chalk.red('Scene eval policy template failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function runSceneEvalConfigTemplateCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeEvalConfigTemplateOptions(rawOptions);
  const validationError = validateEvalConfigTemplateOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene eval config template failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const outputPath = resolvePath(projectRoot, options.out);
    const outputExists = await fileSystem.pathExists(outputPath);

    if (outputExists && !options.force) {
      throw new Error(`output file already exists: ${outputPath} (use --force to overwrite)`);
    }

    const payload = createSceneEvalConfigTemplateByProfile(options.profile);
    await fileSystem.ensureDir(path.dirname(outputPath));
    await fileSystem.writeJson(outputPath, payload, { spaces: 2 });

    const summary = {
      created: true,
      overwritten: outputExists,
      profile: options.profile ? String(options.profile).trim().toLowerCase() : undefined,
      output_path: options.out,
      output_abs_path: outputPath,
      config: payload
    };

    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(chalk.blue('Scene Eval Config Template'));
      console.log(`  Profile: ${options.profile}`);
      console.log(`  Output: ${chalk.gray(outputPath)}`);
      console.log(`  Overwritten: ${outputExists ? 'yes' : 'no'}`);
    }

    return summary;
  } catch (error) {
    console.error(chalk.red('Scene eval config template failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function runSceneEvalProfileRulesTemplateCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeEvalProfileRulesTemplateOptions(rawOptions);
  const validationError = validateEvalProfileRulesTemplateOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene eval profile rules template failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const outputPath = resolvePath(projectRoot, options.out);
    const outputExists = await fileSystem.pathExists(outputPath);

    if (outputExists && !options.force) {
      throw new Error(`output file already exists: ${outputPath} (use --force to overwrite)`);
    }

    const payload = createDefaultSceneEvalProfileRulesTemplate();
    await fileSystem.ensureDir(path.dirname(outputPath));
    await fileSystem.writeJson(outputPath, payload, { spaces: 2 });

    const summary = {
      created: true,
      overwritten: outputExists,
      output_path: options.out,
      output_abs_path: outputPath,
      rules: payload
    };

    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(chalk.blue('Scene Eval Profile Rules Template'));
      console.log(`  Output: ${chalk.gray(outputPath)}`);
      console.log(`  Overwritten: ${outputExists ? 'yes' : 'no'}`);
    }

    return summary;
  } catch (error) {
    console.error(chalk.red('Scene eval profile rules template failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function runSceneRoutePolicyTemplateCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeRoutePolicyTemplateOptions(rawOptions);
  const validationError = validateRoutePolicyTemplateOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene route policy template failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const outputPath = resolvePath(projectRoot, options.out);
    const outputExists = await fileSystem.pathExists(outputPath);

    if (outputExists && !options.force) {
      throw new Error(`output file already exists: ${outputPath} (use --force to overwrite)`);
    }

    const payload = createSceneRoutePolicyTemplateByProfile(options.profile);
    await fileSystem.ensureDir(path.dirname(outputPath));
    await fileSystem.writeJson(outputPath, payload, { spaces: 2 });

    const summary = {
      created: true,
      overwritten: outputExists,
      profile: options.profile,
      output_path: options.out,
      output_abs_path: outputPath,
      route_policy: payload
    };

    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(chalk.blue('Scene Route Policy Template'));
      console.log(`  Profile: ${options.profile}`);
      console.log(`  Output: ${chalk.gray(outputPath)}`);
      console.log(`  Overwritten: ${outputExists ? 'yes' : 'no'}`);
    }

    return summary;
  } catch (error) {
    console.error(chalk.red('Scene route policy template failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function runSceneRoutePolicySuggestCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeRoutePolicySuggestOptions(rawOptions);
  const validationError = validateRoutePolicySuggestOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene route policy suggest failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const evalReportPaths = await resolveSceneRoutePolicySuggestEvalPaths(options, projectRoot, fileSystem);
    const evalReports = await loadSceneRoutePolicySuggestReports(evalReportPaths, fileSystem);
    const analysis = summarizeSceneRoutePolicySuggestReports(evalReports);
    const baseline = await loadSceneRoutePolicySuggestBaseline(options, projectRoot, analysis, fileSystem);
    const suggestion = buildSceneRoutePolicySuggestion(baseline.policy, analysis, {
      maxAdjustment: options.maxAdjustment
    });

    const evalReportSummary = evalReports.map((item) => ({
      source_path: formatSceneRoutePolicySuggestSourcePath(projectRoot, item.sourcePath),
      scene_ref: item.report.scene_ref || null,
      overall_grade: item.report.overall ? item.report.overall.grade || null : null,
      run_status: item.report.run_evaluation ? item.report.run_evaluation.status || null : null,
      profile: inferRoutePolicySuggestProfile(item.report)
    }));

    const payload = {
      generated_at: new Date().toISOString(),
      inputs: {
        eval: options.eval,
        eval_dir: options.evalDir || null,
        route_policy: options.routePolicy || null,
        profile: options.profile,
        max_adjustment: suggestion.max_adjustment
      },
      eval_reports: evalReportSummary,
      baseline: {
        source: baseline.source,
        profile: baseline.profile,
        policy: baseline.policy
      },
      analysis,
      max_adjustment: suggestion.max_adjustment,
      adjustments: suggestion.adjustments,
      suggested_policy: suggestion.suggested_policy
    };

    if (options.out) {
      const outputPath = resolvePath(projectRoot, options.out);
      await fileSystem.ensureDir(path.dirname(outputPath));
      await fileSystem.writeJson(outputPath, payload, { spaces: 2 });
      payload.output_path = options.out;
      payload.output_abs_path = outputPath;
    }

    if (options.policyOut) {
      const policyOutputPath = resolvePath(projectRoot, options.policyOut);
      await fileSystem.ensureDir(path.dirname(policyOutputPath));
      await fileSystem.writeJson(policyOutputPath, payload.suggested_policy, { spaces: 2 });
      payload.policy_output_path = options.policyOut;
      payload.policy_output_abs_path = policyOutputPath;
    }

    printSceneRoutePolicySuggestSummary(options, payload, projectRoot);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene route policy suggest failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function runSceneRoutePolicyRolloutCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const nowValue = dependencies.now ? dependencies.now() : new Date();
  const nowDate = nowValue instanceof Date ? nowValue : new Date(nowValue);

  const options = normalizeRoutePolicyRolloutOptions(rawOptions);
  const validationError = validateRoutePolicyRolloutOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene route policy rollout failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);
  const pathExists = typeof fileSystem.pathExists === 'function'
    ? fileSystem.pathExists.bind(fileSystem)
    : fs.pathExists.bind(fs);
  const ensureDir = typeof fileSystem.ensureDir === 'function'
    ? fileSystem.ensureDir.bind(fileSystem)
    : fs.ensureDir.bind(fs);
  const writeJson = typeof fileSystem.writeJson === 'function'
    ? fileSystem.writeJson.bind(fileSystem)
    : fs.writeJson.bind(fs);
  const writeFile = typeof fileSystem.writeFile === 'function'
    ? fileSystem.writeFile.bind(fileSystem)
    : fs.writeFile.bind(fs);

  try {
    const suggestionPath = resolvePath(projectRoot, options.suggestion);
    const suggestionPayload = await readJson(suggestionPath);

    if (!isPlainObject(suggestionPayload)) {
      throw new Error('suggestion file must contain a JSON object');
    }

    const baselineRaw = isPlainObject(suggestionPayload.baseline) && isPlainObject(suggestionPayload.baseline.policy)
      ? suggestionPayload.baseline.policy
      : null;
    const candidateRaw = isPlainObject(suggestionPayload.suggested_policy)
      ? suggestionPayload.suggested_policy
      : null;

    if (!baselineRaw || !candidateRaw) {
      throw new Error('suggestion payload must include baseline.policy and suggested_policy objects');
    }

    const baselinePolicy = normalizeSceneRoutePolicy(mergePlainObject(cloneDefaultSceneRoutePolicy(), baselineRaw));
    const candidatePolicy = normalizeSceneRoutePolicy(mergePlainObject(cloneDefaultSceneRoutePolicy(), candidateRaw));
    const changedFields = collectSceneRoutePolicyDiff(baselinePolicy, candidatePolicy);

    const generatedAt = Number.isNaN(nowDate.getTime()) ? new Date().toISOString() : nowDate.toISOString();
    const rolloutName = resolveSceneRoutePolicyRolloutName(options.name, generatedAt);
    const rolloutRootPath = resolvePath(projectRoot, options.outDir);
    const rolloutPath = path.join(rolloutRootPath, rolloutName);

    if (await pathExists(rolloutPath) && !options.force) {
      throw new Error(`rollout directory already exists: ${rolloutPath} (use --force to overwrite)`);
    }

    const nextPolicyPath = path.join(rolloutPath, 'route-policy.next.json');
    const rollbackPolicyPath = path.join(rolloutPath, 'route-policy.rollback.json');
    const planPath = path.join(rolloutPath, 'rollout-plan.json');
    const runbookPath = path.join(rolloutPath, 'runbook.md');

    const rolloutDirRelative = formatSceneRoutePolicySuggestSourcePath(projectRoot, rolloutPath);
    const nextPolicyRelative = formatSceneRoutePolicySuggestSourcePath(projectRoot, nextPolicyPath);
    const rollbackPolicyRelative = formatSceneRoutePolicySuggestSourcePath(projectRoot, rollbackPolicyPath);
    const planRelative = formatSceneRoutePolicySuggestSourcePath(projectRoot, planPath);
    const runbookRelative = formatSceneRoutePolicySuggestSourcePath(projectRoot, runbookPath);
    const targetPolicyRelative = normalizeRelativePath(options.targetPolicy);

    const commands = buildSceneRoutePolicyRolloutCommands(
      targetPolicyRelative,
      nextPolicyRelative,
      rollbackPolicyRelative
    );

    const payload = {
      generated_at: generatedAt,
      rollout_name: rolloutName,
      source_suggestion: options.suggestion,
      source_suggestion_abs_path: suggestionPath,
      baseline_source: isPlainObject(suggestionPayload.baseline) ? suggestionPayload.baseline.source || null : null,
      target_policy_path: targetPolicyRelative,
      rollout_dir: rolloutDirRelative,
      summary: {
        changed_fields: changedFields.length,
        adjustment_records: Array.isArray(suggestionPayload.adjustments) ? suggestionPayload.adjustments.length : 0
      },
      changed_fields: changedFields,
      commands,
      files: {
        plan: planRelative,
        next_policy: nextPolicyRelative,
        rollback_policy: rollbackPolicyRelative,
        runbook: runbookRelative
      },
      analysis: isPlainObject(suggestionPayload.analysis) ? suggestionPayload.analysis : null
    };

    await ensureDir(rolloutPath);
    await writeJson(nextPolicyPath, candidatePolicy, { spaces: 2 });
    await writeJson(rollbackPolicyPath, baselinePolicy, { spaces: 2 });
    await writeJson(planPath, payload, { spaces: 2 });

    const runbookContent = buildSceneRoutePolicyRolloutRunbook(payload);
    await writeFile(runbookPath, runbookContent, 'utf8');

    printSceneRoutePolicyRolloutSummary(options, payload, projectRoot);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene route policy rollout failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function runScenePackageTemplateCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeScenePackageTemplateOptions(rawOptions);
  const validationError = validateScenePackageTemplateOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene package template failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const outputPath = resolveScenePackageTemplateOutputPath(options, projectRoot);
    const outputExists = await fileSystem.pathExists(outputPath);

    if (outputExists && !options.force) {
      throw new Error(`output file already exists: ${outputPath} (use --force to overwrite)`);
    }

    const payload = createScenePackageTemplate(options);
    await fileSystem.ensureDir(path.dirname(outputPath));
    await fileSystem.writeJson(outputPath, payload, { spaces: 2 });

    const summary = {
      created: true,
      overwritten: outputExists,
      spec: options.spec || null,
      output_path: options.spec
        ? normalizeRelativePath(path.join('.sce', 'specs', options.spec, options.out))
        : normalizeRelativePath(options.out),
      output_abs_path: outputPath,
      package_contract: payload,
      summary: {
        coordinate: buildScenePackageCoordinate(payload),
        kind: payload.kind
      }
    };

    printScenePackageTemplateSummary(options, summary, projectRoot);
    return summary;
  } catch (error) {
    console.error(chalk.red('Scene package template failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function validateScenePackageDirectory(packageDir, fileSystem) {
  const _fs = fileSystem || fs;
  const readJson = typeof _fs.readJson === 'function' ? _fs.readJson.bind(_fs) : fs.readJson.bind(fs);
  const errors = [];
  const warnings = [];
  const fileChecks = { checked: 0, missing: 0 };

  // Read scene-package.json
  const manifestPath = path.join(packageDir, 'scene-package.json');
  let contract;
  try {
    contract = await readJson(manifestPath);
  } catch (err) {
    return {
      valid: false,
      contract: null,
      errors: [`scene-package.json not found or not valid JSON in ${packageDir}: ${err.message}`],
      warnings: [],
      fileChecks: { checked: 0, missing: 0 },
      summary: { coordinate: null, kind: null, parameter_count: 0, provides_count: 0, requires_count: 0, file_count: 0, files_checked: 0, files_missing: 0 }
    };
  }

  // Contract-level validation
  const contractResult = validateScenePackageContract(contract);
  errors.push(...contractResult.errors);
  warnings.push(...contractResult.warnings);

  // Semver validation (more precise than contract regex)
  const metadata = isPlainObject(contract.metadata) ? contract.metadata : {};
  const version = String(metadata.version || '').trim();
  if (version && !semver.valid(version)) {
    const hasSemverError = errors.some(e => e.includes('metadata.version'));
    if (!hasSemverError) {
      errors.push(`metadata.version "${version}" is not valid semver`);
    }
  }

  // File existence checks
  const artifacts = isPlainObject(contract.artifacts) ? contract.artifacts : {};
  const filesToCheck = [];
  if (typeof artifacts.entry_scene === 'string' && artifacts.entry_scene.trim()) {
    filesToCheck.push(artifacts.entry_scene.trim());
  }
  if (Array.isArray(artifacts.generates)) {
    for (const g of artifacts.generates) {
      if (typeof g === 'string' && g.trim()) {
        filesToCheck.push(g.trim());
      }
    }
  }

  for (const filePath of filesToCheck) {
    fileChecks.checked++;
    const fullPath = path.join(packageDir, filePath);
    try {
      const stat = typeof _fs.stat === 'function' ? _fs.stat.bind(_fs) : fs.stat.bind(fs);
      await stat(fullPath);
    } catch (_e) {
      fileChecks.missing++;
      errors.push(`referenced file not found: ${filePath}`);
    }
  }

  // Template variable schema validation
  if (Array.isArray(contract.variables) && contract.variables.length > 0) {
    const varResult = validateTemplateVariableSchema(contract.variables);
    errors.push(...varResult.errors);
    warnings.push(...varResult.warnings);
  }
  if (Array.isArray(contract.parameters)) {
    for (const [index, param] of contract.parameters.entries()) {
      if (!isPlainObject(param)) continue;
      if (!String(param.id || '').trim()) {
        const hasIdError = errors.some(e => e.includes(`parameters[${index}].id`));
        if (!hasIdError) errors.push(`parameters[${index}].id is required`);
      }
      if (!String(param.type || '').trim()) {
        const hasTypeError = errors.some(e => e.includes(`parameters[${index}].type`));
        if (!hasTypeError) errors.push(`parameters[${index}].type is required`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    contract,
    errors,
    warnings,
    fileChecks,
    summary: {
      ...contractResult.summary,
      file_count: filesToCheck.length,
      files_checked: fileChecks.checked,
      files_missing: fileChecks.missing
    }
  };
}

async function runScenePackageValidateCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeScenePackageValidateOptions(rawOptions);
  const validationError = validateScenePackageValidateOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene package validate failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);

  try {
    const inputPath = resolveScenePackageValidateInputPath(options, projectRoot);

    // Detect if input is a directory for comprehensive validation
    let isDirectory = false;
    try {
      const statFn = typeof fileSystem.stat === 'function' ? fileSystem.stat.bind(fileSystem) : fs.stat.bind(fs);
      const stat = await statFn(inputPath);
      isDirectory = stat.isDirectory();
    } catch (_e) {
      // Not a directory or doesn't exist — fall through to file-based validation
    }

    if (isDirectory) {
      const dirResult = await validateScenePackageDirectory(inputPath, fileSystem);

      // Strict mode: promote warnings to errors
      if (options.strict && dirResult.warnings.length > 0) {
        dirResult.errors.push(...dirResult.warnings);
        dirResult.warnings = [];
        dirResult.valid = dirResult.errors.length === 0;
      }

      const payload = {
        valid: dirResult.valid,
        input: {
          spec: options.spec || null,
          path: inputPath,
          spec_package: null,
          mode: 'directory'
        },
        summary: dirResult.summary,
        errors: dirResult.errors,
        warnings: dirResult.warnings,
        strict: options.strict
      };

      printScenePackageValidateSummary(options, payload, projectRoot);

      if (!dirResult.valid) {
        process.exitCode = 1;
      }

      return payload;
    }

    const packageContract = await readJson(inputPath);
    const validation = validateScenePackageContract(packageContract);

    const payload = {
      valid: validation.valid,
      input: {
        spec: options.spec || null,
        path: inputPath,
        spec_package: options.spec ? options.specPackage : null,
        mode: 'file'
      },
      summary: validation.summary,
      errors: validation.errors,
      warnings: validation.warnings
    };

    // Strict mode for file-based validation too
    if (options.strict && payload.warnings.length > 0) {
      payload.errors.push(...payload.warnings);
      payload.warnings = [];
      payload.valid = payload.errors.length === 0;
    }

    printScenePackageValidateSummary(options, payload, projectRoot);

    if (!payload.valid) {
      process.exitCode = 1;
    }

    return payload;
  } catch (error) {
    console.error(chalk.red('Scene package validate failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function runScenePackagePublishCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeScenePackagePublishOptions(rawOptions);
  const validationError = validateScenePackagePublishOptions(options);

  if (validationError) {
    if (!options.silent) {
      console.error(chalk.red(`Scene package publish failed: ${validationError}`));
    }
    process.exitCode = 1;
    if (options.silent) {
      return { published: false, error: validationError };
    }
    return null;
  }

  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);
  const readFile = typeof fileSystem.readFile === 'function'
    ? fileSystem.readFile.bind(fileSystem)
    : fs.readFile.bind(fs);
  const pathExists = typeof fileSystem.pathExists === 'function'
    ? fileSystem.pathExists.bind(fileSystem)
    : fs.pathExists.bind(fs);
  const ensureDir = typeof fileSystem.ensureDir === 'function'
    ? fileSystem.ensureDir.bind(fileSystem)
    : fs.ensureDir.bind(fs);
  const writeJson = typeof fileSystem.writeJson === 'function'
    ? fileSystem.writeJson.bind(fileSystem)
    : fs.writeJson.bind(fs);
  const writeFile = typeof fileSystem.writeFile === 'function'
    ? fileSystem.writeFile.bind(fileSystem)
    : fs.writeFile.bind(fs);

  try {
    const specRoot = path.join(projectRoot, '.sce', 'specs', options.spec);
    const specExists = await pathExists(specRoot);
    if (!specExists) {
      throw new Error(`source spec not found: ${options.spec}`);
    }

    const packagePath = path.join(specRoot, options.specPackage);
    const sceneManifestPath = path.join(specRoot, options.sceneManifest);

    const packageContract = await readJson(packagePath);
    const contractValidation = validateScenePackageContract(packageContract);
    if (!contractValidation.valid) {
      throw new Error(`invalid package contract: ${contractValidation.errors.join('; ')}`);
    }

    const ontologyGraph = buildOntologyFromManifest(packageContract);
    const ontologyValidation = validateOntology(ontologyGraph);
    const ontologySemanticQuality = evaluateOntologySemanticQuality(packageContract);
    const ontologyValidationPayload = {
      required: options.requireOntologyValidation,
      valid: ontologyValidation.valid,
      error_count: ontologyValidation.errors.length,
      error_codes: ontologyValidation.errors.map((item) => item.code),
      score: ontologySemanticQuality.score,
      level: ontologySemanticQuality.level,
      min_score: options.ontologyMinScore,
      min_score_passed: options.ontologyMinScore === null
        ? true
        : Number(ontologySemanticQuality.score) >= options.ontologyMinScore
    };
    if (options.requireOntologyValidation && !ontologyValidation.valid) {
      const ontologyErrorCodes = ontologyValidation.errors.map((item) => item.code).slice(0, 5);
      const ontologyValidationError = `ontology validation failed: ${ontologyErrorCodes.join(', ')}`;
      if (options.silent) {
        return {
          published: false,
          error: ontologyValidationError,
          ontology_validation: ontologyValidationPayload
        };
      }
      throw new Error(ontologyValidationError);
    }
    if (options.ontologyMinScore !== null && Number(ontologySemanticQuality.score) < options.ontologyMinScore) {
      const ontologyScoreError = `ontology semantic quality score ${ontologySemanticQuality.score} is below minimum ${options.ontologyMinScore}`;
      if (options.silent) {
        return {
          published: false,
          error: ontologyScoreError,
          ontology_validation: ontologyValidationPayload
        };
      }
      throw new Error(ontologyScoreError);
    }

    if (!(await pathExists(sceneManifestPath))) {
      throw new Error(`scene manifest not found: ${sceneManifestPath}`);
    }

    const sceneManifestContent = await readFile(sceneManifestPath, 'utf8');

    const templateId = buildScenePackageTemplateId(packageContract, options.templateId);
    const libraryRootPath = resolveScenePackageTemplateLibraryPath(options, projectRoot);
    const templateDirPath = path.join(libraryRootPath, templateId);
    const templateDirExists = await pathExists(templateDirPath);

    if (templateDirExists && !options.force && !options.dryRun) {
      throw new Error(`template already exists: ${templateDirPath} (use --force to overwrite)`);
    }

    const publishedAt = new Date().toISOString();
    const templateManifest = buildScenePackagePublishTemplateManifest(packageContract, {
      templateId,
      spec: options.spec,
      publishedAt
    });

    const templateManifestPath = path.join(templateDirPath, 'template.manifest.json');
    const templatePackagePath = path.join(templateDirPath, 'scene-package.json');
    const templateScenePath = path.join(templateDirPath, 'scene.template.yaml');

    if (!options.dryRun) {
      await ensureDir(templateDirPath);
      await writeJson(templateManifestPath, templateManifest, { spaces: 2 });
      await writeJson(templatePackagePath, packageContract, { spaces: 2 });
      await writeFile(templateScenePath, sceneManifestContent, 'utf8');
    }

    const payload = {
      published: options.dryRun !== true,
      dry_run: options.dryRun === true,
      mode: options.dryRun ? 'dry-run' : 'commit',
      overwritten: templateDirExists,
      source: {
        spec: options.spec,
        package_path: options.specPackage,
        scene_manifest_path: options.sceneManifest
      },
      template: {
        id: templateId,
        coordinate: contractValidation.summary.coordinate,
        kind: packageContract.kind || null,
        output_dir: formatScenePackagePath(projectRoot, templateDirPath),
        manifest_path: formatScenePackagePath(projectRoot, templateManifestPath),
        package_contract_path: formatScenePackagePath(projectRoot, templatePackagePath),
        scene_template_path: formatScenePackagePath(projectRoot, templateScenePath)
      },
      summary: {
        parameter_count: contractValidation.summary.parameter_count,
        provides_count: contractValidation.summary.provides_count,
        requires_count: contractValidation.summary.requires_count
      },
      ontology_validation: ontologyValidationPayload
    };

    if (!options.silent) {
      printScenePackagePublishSummary(options, payload, projectRoot);
    }
    return payload;
  } catch (error) {
    if (!options.silent) {
      console.error(chalk.red('Scene package publish failed:'), error.message);
    }
    process.exitCode = 1;
    if (options.silent) {
      return { published: false, error: error.message };
    }
    return null;
  }
}

function printScenePackagePublishBatchSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.blue('Scene package batch publish'));
  console.log(`  Mode: ${payload.mode}`);
  if (payload.options && payload.options.profile) {
    console.log(`  Profile: ${payload.options.profile}`);
  }
  console.log(`  Manifest: ${payload.manifest}`);
  if (payload.options && payload.options.manifest_spec_path) {
    console.log(`  Manifest Spec Path: ${payload.options.manifest_spec_path}`);
  }
  if (payload.options) {
    const ontologyGate = payload.options.require_ontology_validation ? 'required' : 'optional';
    const minScoreLabel = payload.options.ontology_min_score === null || payload.options.ontology_min_score === undefined
      ? 'none'
      : String(payload.options.ontology_min_score);
    console.log(`  Ontology Gate: ${ontologyGate} (min score: ${minScoreLabel})`);
    const avgScoreLabel = payload.options.ontology_min_average_score === null || payload.options.ontology_min_average_score === undefined
      ? 'none'
      : String(payload.options.ontology_min_average_score);
    const validRateLabel = payload.options.ontology_min_valid_rate === null || payload.options.ontology_min_valid_rate === undefined
      ? 'none'
      : String(payload.options.ontology_min_valid_rate);
    console.log(`  Ontology Batch Gate: avg>=${avgScoreLabel}, valid-rate>=${validRateLabel}%`);
  }
  console.log(`  Selected specs: ${payload.summary.selected}`);
  if (payload.mode === 'dry-run') {
    console.log(`  Planned: ${payload.summary.planned}`);
  } else {
    console.log(`  Published: ${payload.summary.published}`);
  }
  console.log(`  Failed: ${payload.summary.failed}`);
  console.log(`  Skipped: ${payload.summary.skipped}`);

  if (payload.failures.length > 0) {
    console.log(chalk.yellow('\nFailures:'));
    for (const item of payload.failures) {
      console.log(`  - ${item.spec}: ${item.error}`);
    }
  }

  if (payload.batch_ontology_gate && Array.isArray(payload.batch_ontology_gate.failures) && payload.batch_ontology_gate.failures.length > 0) {
    console.log(chalk.yellow('\nBatch ontology gate failures:'));
    for (const item of payload.batch_ontology_gate.failures) {
      console.log(`  - ${item.message}`);
    }
  }

  if (payload.ontology_report_path) {
    console.log(`  Ontology Report: ${payload.ontology_report_path}`);
  }
  if (payload.ontology_task_draft && payload.ontology_task_draft.output_path) {
    console.log(`  Ontology Task Draft: ${payload.ontology_task_draft.output_path}`);
  }
  if (payload.ontology_task_queue && payload.ontology_task_queue.output_path) {
    console.log(`  Ontology Task Queue: ${payload.ontology_task_queue.output_path}`);
  }
}

function buildScenePackagePublishBatchOntologyReport(payload) {
  const ontologyMetrics = summarizeScenePackageBatchOntology(
    Array.isArray(payload.published) ? payload.published : [],
    Array.isArray(payload.failures) ? payload.failures : [],
    payload.mode
  );

  return {
    generated_at: new Date().toISOString(),
    mode: payload.mode,
    manifest: payload.manifest,
    options: payload.options || {},
    summary: payload.summary || {},
    ontology_summary: ontologyMetrics.summary,
    batch_ontology_gate: payload.batch_ontology_gate || null,
    specs: ontologyMetrics.specs
  };
}

function summarizeScenePackageBatchOntology(published = [], failures = [], mode = 'commit') {
  const specs = [];

  for (const item of published) {
    specs.push({
      spec: item.spec,
      status: mode === 'dry-run' ? 'planned' : 'published',
      template_id: item.template_id || null,
      ontology_validation: item.ontology_validation || null
    });
  }

  for (const item of failures) {
    specs.push({
      spec: item.spec,
      status: 'failed',
      error: item.error,
      ontology_validation: item.ontology_validation || null
    });
  }

  let scored = 0;
  let scoreTotal = 0;
  let graphValid = 0;
  let graphInvalid = 0;
  let minScorePassed = 0;
  let minScoreFailed = 0;

  for (const item of specs) {
    const ontology = item.ontology_validation;
    if (!ontology || typeof ontology !== 'object') {
      continue;
    }

    if (ontology.valid === true) {
      graphValid++;
    } else if (ontology.valid === false) {
      graphInvalid++;
    }

    if (Number.isFinite(Number(ontology.score))) {
      scored++;
      scoreTotal += Number(ontology.score);
    }

    if (ontology.min_score_passed === true) {
      minScorePassed++;
    } else if (ontology.min_score_passed === false) {
      minScoreFailed++;
    }
  }

  const totalSpecs = specs.length;
  const validRatePercent = totalSpecs > 0
    ? Number(((graphValid / totalSpecs) * 100).toFixed(2))
    : null;

  return {
    summary: {
      total_specs: totalSpecs,
      scored_specs: scored,
      average_score: scored > 0 ? Number((scoreTotal / scored).toFixed(2)) : null,
      graph_valid: graphValid,
      graph_invalid: graphInvalid,
      valid_rate_percent: validRatePercent,
      min_score_passed: minScorePassed,
      min_score_failed: minScoreFailed
    },
    specs
  };
}

function evaluateScenePackageBatchOntologyGates(ontologySummary = {}, options = {}) {
  const checks = [];
  const failures = [];

  if (options.ontologyMinAverageScore !== null && options.ontologyMinAverageScore !== undefined) {
    const actual = Number.isFinite(Number(ontologySummary.average_score))
      ? Number(ontologySummary.average_score)
      : null;
    const passed = actual !== null && actual >= options.ontologyMinAverageScore;
    const check = {
      id: 'ontology_min_average_score',
      threshold: options.ontologyMinAverageScore,
      actual,
      passed
    };
    checks.push(check);
    if (!passed) {
      failures.push({
        id: check.id,
        message: actual === null
          ? `ontology average score is unavailable (required >= ${options.ontologyMinAverageScore})`
          : `ontology average score ${actual} is below minimum ${options.ontologyMinAverageScore}`
      });
    }
  }

  if (options.ontologyMinValidRate !== null && options.ontologyMinValidRate !== undefined) {
    const actual = Number.isFinite(Number(ontologySummary.valid_rate_percent))
      ? Number(ontologySummary.valid_rate_percent)
      : null;
    const passed = actual !== null && actual >= options.ontologyMinValidRate;
    const check = {
      id: 'ontology_min_valid_rate',
      threshold: options.ontologyMinValidRate,
      actual,
      passed
    };
    checks.push(check);
    if (!passed) {
      failures.push({
        id: check.id,
        message: actual === null
          ? `ontology graph valid-rate is unavailable (required >= ${options.ontologyMinValidRate})`
          : `ontology graph valid-rate ${actual}% is below minimum ${options.ontologyMinValidRate}%`
      });
    }
  }

  return {
    passed: failures.length === 0,
    checks,
    failures
  };
}

function deriveScenePackagePublishBatchOntologyTaskCandidates(payload = {}) {
  const options = payload && payload.options && typeof payload.options === 'object'
    ? payload.options
    : {};
  const failures = Array.isArray(payload.failures) ? payload.failures : [];
  const published = Array.isArray(payload.published) ? payload.published : [];
  const tasks = [];
  const dedupe = new Set();

  const addTask = (priority, title, evidence) => {
    const normalizedTitle = String(title || '').trim();
    if (!normalizedTitle) {
      return;
    }

    const key = normalizedTitle.toLowerCase();
    if (dedupe.has(key)) {
      return;
    }
    dedupe.add(key);

    tasks.push({
      priority: normalizeTaskPriority(priority, 'medium'),
      title: normalizedTitle,
      evidence: String(evidence || '').trim() || null
    });
  };

  for (const item of failures) {
    const spec = String(item && item.spec ? item.spec : '(unknown)').trim();
    const reason = String(item && item.error ? item.error : 'publish failed').trim();
    addTask(
      'high',
      `repair ontology and republish ${spec}`,
      reason
    );
  }

  const avgThreshold = Number.isFinite(Number(options.ontology_min_average_score))
    ? Number(options.ontology_min_average_score)
    : null;
  if (avgThreshold !== null) {
    for (const item of published) {
      const spec = String(item && item.spec ? item.spec : '').trim();
      const ontology = item && item.ontology_validation && typeof item.ontology_validation === 'object'
        ? item.ontology_validation
        : null;
      if (!spec || !ontology || !Number.isFinite(Number(ontology.score))) {
        continue;
      }
      const score = Number(ontology.score);
      if (score < avgThreshold) {
        addTask(
          'medium',
          `raise ontology score for ${spec} to >= ${avgThreshold}`,
          `current score ${score}`
        );
      }
    }
  }

  const batchGateFailures = payload
    && payload.batch_ontology_gate
    && Array.isArray(payload.batch_ontology_gate.failures)
    ? payload.batch_ontology_gate.failures
    : [];
  for (const item of batchGateFailures) {
    const message = String(item && item.message ? item.message : '').trim();
    if (message) {
      addTask('high', 'resolve batch ontology gate failure', message);
    }
  }

  return tasks;
}

function buildScenePackagePublishBatchOntologyTaskDraft(payload = {}) {
  const tasks = deriveScenePackagePublishBatchOntologyTaskCandidates(payload);

  const lines = [
    '# Scene Package Ontology Remediation Task Draft',
    '',
    `- generated_at: ${new Date().toISOString()}`,
    `- mode: ${payload.mode || 'unknown'}`,
    `- manifest: ${payload.manifest || 'unknown'}`,
    `- selected: ${payload && payload.summary ? payload.summary.selected || 0 : 0}`,
    `- planned: ${payload && payload.summary ? payload.summary.planned || 0 : 0}`,
    `- failed: ${payload && payload.summary ? payload.summary.failed || 0 : 0}`,
    `- task_count: ${tasks.length}`,
    ''
  ];

  if (tasks.length === 0) {
    lines.push('## Suggested Tasks', '', '- No ontology remediation task generated.', '');
    return lines.join('\n');
  }

  lines.push('## Suggested Tasks', '');
  for (const task of tasks) {
    const suffix = task.evidence ? ` [evidence: ${task.evidence}]` : '';
    lines.push(`- [ ] [${task.priority}] ${task.title}${suffix}`);
  }
  lines.push('');

  return lines.join('\n');
}

function buildScenePackagePublishBatchOntologyTaskQueueLines(payload = {}) {
  const tasks = deriveScenePackagePublishBatchOntologyTaskCandidates(payload);

  if (tasks.length === 0) {
    return [];
  }

  return tasks.map((task) => {
    const evidence = task.evidence ? ` | evidence: ${task.evidence}` : '';
    return `[ontology-remediation][${task.priority}] ${task.title}${evidence}`;
  });
}

async function writeScenePackagePublishBatchOntologyTaskDraft(options, payload, projectRoot, fileSystem = fs) {
  if (!options.ontologyTaskOut) {
    return null;
  }

  const outputPath = resolvePath(projectRoot, options.ontologyTaskOut);
  const markdown = buildScenePackagePublishBatchOntologyTaskDraft(payload);

  await fileSystem.ensureDir(path.dirname(outputPath));
  await fileSystem.writeFile(outputPath, markdown, 'utf8');

  const suggestedCount = markdown
    .split('\n')
    .filter((line) => /^- \[ \] \[[a-z]+\] /i.test(line))
    .length;

  return {
    path: outputPath,
    output_path: normalizeRelativePath(options.ontologyTaskOut) || options.ontologyTaskOut,
    suggested_tasks: suggestedCount
  };
}

async function writeScenePackagePublishBatchOntologyTaskQueue(options, payload, projectRoot, fileSystem = fs) {
  if (!options.ontologyTaskQueueOut) {
    return null;
  }

  const outputPath = resolvePath(projectRoot, options.ontologyTaskQueueOut);
  const queueLines = buildScenePackagePublishBatchOntologyTaskQueueLines(payload);
  const content = queueLines.length > 0 ? `${queueLines.join('\n')}\n` : '';

  await fileSystem.ensureDir(path.dirname(outputPath));
  await fileSystem.writeFile(outputPath, content, 'utf8');

  return {
    path: outputPath,
    output_path: normalizeRelativePath(options.ontologyTaskQueueOut) || options.ontologyTaskQueueOut,
    queued_tasks: queueLines.length
  };
}

async function runScenePackagePublishBatchCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const publishRunner = dependencies.publishRunner || runScenePackagePublishCommand;

  const options = normalizeScenePackagePublishBatchOptions(rawOptions);
  const validationError = validateScenePackagePublishBatchOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene package publish-batch failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);
  const ensureDir = typeof fileSystem.ensureDir === 'function'
    ? fileSystem.ensureDir.bind(fileSystem)
    : fs.ensureDir.bind(fs);
  const writeJson = typeof fileSystem.writeJson === 'function'
    ? fileSystem.writeJson.bind(fileSystem)
    : fs.writeJson.bind(fs);

  try {
    const manifestPath = resolvePath(projectRoot, options.manifest);
    const manifest = await readJson(manifestPath);
    const manifestSpecs = resolveManifestSpecEntries(manifest, options.manifestSpecPath);
    if (!Array.isArray(manifestSpecs)) {
      throw new Error(`manifest spec array not found at path: ${options.manifestSpecPath}`);
    }
    if (manifestSpecs.length === 0) {
      throw new Error(`manifest spec array is empty at path: ${options.manifestSpecPath}`);
    }

    const includeSet = options.include.length > 0
      ? new Set(options.include.map((item) => String(item).trim()))
      : null;
    const statusFilter = options.status === 'all'
      ? null
      : options.status;

    const selected = [];
    let skippedByFilter = 0;
    for (const entry of manifestSpecs) {
      if (!entry || typeof entry !== 'object') {
        skippedByFilter++;
        continue;
      }

      const specId = String(entry.id || entry.spec || '').trim();
      const entryStatus = String(entry.status || '').trim().toLowerCase();

      if (includeSet && (!specId || !includeSet.has(specId))) {
        skippedByFilter++;
        continue;
      }
      if (statusFilter && entryStatus && entryStatus !== statusFilter) {
        skippedByFilter++;
        continue;
      }

      selected.push(entry);
    }

    const successes = [];
    const failures = [];

    for (const entry of selected) {
      const source = deriveScenePackagePublishSourceFromManifestEntry(entry);
      const spec = source.spec || String(entry.id || entry.spec || '').trim();

      if (!spec) {
        failures.push({
          spec: '(unknown)',
          error: 'unable to derive spec id from manifest entry'
        });
        if (options.strict) {
          break;
        }
        continue;
      }

      const publishOptions = {
        spec,
        specPackage: source.specPackage || options.fallbackSpecPackage,
        sceneManifest: source.sceneManifest || options.fallbackSceneManifest,
        requireOntologyValidation: options.requireOntologyValidation,
        ontologyMinScore: options.ontologyMinScore,
        outDir: options.outDir,
        dryRun: options.dryRun,
        force: options.force,
        silent: true,
        json: false
      };

      const result = await publishRunner(publishOptions, {
        projectRoot,
        fileSystem
      });

      if (result && (result.published || result.dry_run === true)) {
        successes.push({
          spec,
          template_id: result.template && result.template.id ? result.template.id : null,
          ontology_validation: result.ontology_validation || null
        });
      } else {
        const failureMessage = result && typeof result.error === 'string' && result.error.trim().length > 0
          ? result.error.trim()
          : `publish failed (${publishOptions.specPackage}, ${publishOptions.sceneManifest})`;
        failures.push({
          spec,
          error: failureMessage,
          ontology_validation: result && result.ontology_validation ? result.ontology_validation : null
        });
        if (options.strict) {
          break;
        }
      }
    }

    const payload = {
      success: failures.length === 0,
      manifest: normalizeRelativePath(path.relative(projectRoot, manifestPath)) || normalizeRelativePath(manifestPath),
      options: {
        profile: options.from331 ? 'from-331' : 'custom',
        mode: options.dryRun ? 'dry-run' : 'commit',
        manifest_spec_path: options.manifestSpecPath,
        status: statusFilter || 'all',
        include: options.include,
        fallback_spec_package: options.fallbackSpecPackage,
        fallback_scene_manifest: options.fallbackSceneManifest,
        require_ontology_validation: options.requireOntologyValidation,
        ontology_min_score: options.ontologyMinScore,
        ontology_min_average_score: options.ontologyMinAverageScore,
        ontology_min_valid_rate: options.ontologyMinValidRate,
        ontology_task_out: options.ontologyTaskOut || null,
        ontology_task_queue_out: options.ontologyTaskQueueOut || null,
        out_dir: options.outDir,
        dry_run: options.dryRun,
        force: options.force,
        strict: options.strict
      },
      mode: options.dryRun ? 'dry-run' : 'commit',
      summary: {
        selected: selected.length,
        published: options.dryRun ? 0 : successes.length,
        planned: options.dryRun ? successes.length : 0,
        failed: failures.length,
        skipped: skippedByFilter
      },
      published: successes,
      failures
    };

    const ontologyMetrics = summarizeScenePackageBatchOntology(successes, failures, payload.mode);
    payload.ontology_summary = ontologyMetrics.summary;
    payload.batch_ontology_gate = evaluateScenePackageBatchOntologyGates(ontologyMetrics.summary, options);
    payload.success = failures.length === 0 && payload.batch_ontology_gate.passed;

    if (Array.isArray(payload.batch_ontology_gate.failures) && payload.batch_ontology_gate.failures.length > 0) {
      payload.summary.batch_gate_failed = true;
      payload.summary.batch_gate_failure_count = payload.batch_ontology_gate.failures.length;
    }

    if (options.ontologyReportOut) {
      const ontologyReportPath = resolvePath(projectRoot, options.ontologyReportOut);
      const ontologyReportPayload = buildScenePackagePublishBatchOntologyReport(payload);
      await ensureDir(path.dirname(ontologyReportPath));
      await writeJson(ontologyReportPath, ontologyReportPayload, { spaces: 2 });
      payload.ontology_report_path = normalizeRelativePath(options.ontologyReportOut) || options.ontologyReportOut;
      payload.ontology_report_abs_path = ontologyReportPath;
    }

    const ontologyTaskDraft = await writeScenePackagePublishBatchOntologyTaskDraft(options, payload, projectRoot, fileSystem);
    if (ontologyTaskDraft) {
      payload.ontology_task_draft = ontologyTaskDraft;
    }

    const ontologyTaskQueue = await writeScenePackagePublishBatchOntologyTaskQueue(options, payload, projectRoot, fileSystem);
    if (ontologyTaskQueue) {
      payload.ontology_task_queue = ontologyTaskQueue;
    }

    if (!payload.success) {
      process.exitCode = 1;
    }

    printScenePackagePublishBatchSummary(options, payload);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene package publish-batch failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function toOntologyBackfillSlug(value, fallback = 'item') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function buildScenePackageOntologyBackfillModel(contract = {}) {
  const entities = [];
  const relations = [];
  const businessRules = [];
  const decisionLogic = [];

  const entityKeys = new Set();
  const relationKeys = new Set();
  const ruleKeys = new Set();
  const decisionKeys = new Set();

  const addEntity = (rawId, type, metadata = {}) => {
    const id = String(rawId || '').trim();
    if (!id) {
      return;
    }

    const key = id.toLowerCase();
    if (entityKeys.has(key)) {
      return;
    }
    entityKeys.add(key);
    entities.push({
      id,
      type: String(type || 'node').trim() || 'node',
      ...metadata
    });
  };

  const addRelation = (rawSource, rawTarget, rawType, metadata = {}) => {
    const source = String(rawSource || '').trim();
    const target = String(rawTarget || '').trim();
    if (!source || !target || source === target) {
      return;
    }

    const type = VALID_RELATION_TYPES.includes(rawType) ? rawType : 'depends_on';
    const key = `${source.toLowerCase()}|${target.toLowerCase()}|${type}`;
    if (relationKeys.has(key)) {
      return;
    }
    relationKeys.add(key);
    relations.push({
      source,
      target,
      type,
      ...metadata
    });
  };

  const addBusinessRule = (rule = {}) => {
    if (!isPlainObject(rule)) {
      return;
    }

    const candidateId = String(rule.id || rule.rule_id || rule.name || '').trim();
    const id = candidateId || `rule.${toOntologyBackfillSlug(rule.description || 'backfill')}`;
    const key = id.toLowerCase();
    if (ruleKeys.has(key)) {
      return;
    }
    ruleKeys.add(key);
    businessRules.push({
      id,
      mapped: true,
      passed: true,
      ...rule
    });
  };

  const addDecision = (decision = {}) => {
    if (!isPlainObject(decision)) {
      return;
    }

    const candidateId = String(decision.id || decision.decision_id || decision.name || '').trim();
    const id = candidateId || `decision.${toOntologyBackfillSlug(decision.summary || 'backfill')}`;
    const key = id.toLowerCase();
    if (decisionKeys.has(key)) {
      return;
    }
    decisionKeys.add(key);
    decisionLogic.push({
      id,
      resolved: true,
      automated: true,
      status: 'resolved',
      ...decision
    });
  };

  const capabilities = isPlainObject(contract.capabilities) ? contract.capabilities : {};
  const provides = Array.isArray(capabilities.provides) ? capabilities.provides : [];
  const requires = Array.isArray(capabilities.requires) ? capabilities.requires : [];

  const governance = isPlainObject(contract.governance) ? contract.governance : {};
  const governanceContract = isPlainObject(contract.governance_contract) ? contract.governance_contract : {};
  const capabilityContract = isPlainObject(contract.capability_contract) ? contract.capability_contract : {};
  const bindings = Array.isArray(capabilityContract.bindings) ? capabilityContract.bindings.filter((item) => isPlainObject(item)) : [];

  const bindingRefs = [];
  for (const binding of bindings) {
    const ref = String(binding.ref || '').trim();
    if (!ref) {
      continue;
    }

    bindingRefs.push(ref);
    addEntity(ref, binding.type || 'binding', {
      intent: typeof binding.intent === 'string' ? binding.intent : undefined
    });

    if (typeof binding.depends_on === 'string' && binding.depends_on.trim()) {
      const dependencyRef = binding.depends_on.trim();
      addEntity(dependencyRef, 'dependency');
      addRelation(ref, dependencyRef, 'depends_on', { reason: 'binding.depends_on' });
    }
  }

  for (const capability of provides) {
    const value = String(capability || '').trim();
    if (!value) {
      continue;
    }
    const capabilityRef = `capability:${value}`;
    addEntity(capabilityRef, 'capability');
    for (const bindingRef of bindingRefs) {
      addRelation(bindingRef, capabilityRef, 'produces', { reason: 'capabilities.provides' });
    }
  }

  for (const requirement of requires) {
    const value = String(requirement || '').trim();
    if (!value) {
      continue;
    }
    const requirementRef = `dependency:${value}`;
    addEntity(requirementRef, 'dependency');
    for (const bindingRef of bindingRefs) {
      addRelation(bindingRef, requirementRef, 'depends_on', { reason: 'capabilities.requires' });
    }
  }

  const dataLineage = isPlainObject(governanceContract.data_lineage) ? governanceContract.data_lineage : {};
  const sources = Array.isArray(dataLineage.sources) ? dataLineage.sources.filter((item) => isPlainObject(item)) : [];
  const transforms = Array.isArray(dataLineage.transforms) ? dataLineage.transforms.filter((item) => isPlainObject(item)) : [];
  const sinks = Array.isArray(dataLineage.sinks) ? dataLineage.sinks.filter((item) => isPlainObject(item)) : [];

  const sourceRefs = [];
  for (const source of sources) {
    const sourceRef = String(source.ref || '').trim();
    if (!sourceRef) {
      continue;
    }
    sourceRefs.push(sourceRef);
    addEntity(sourceRef, 'lineage_source');
  }

  const transformRefs = [];
  for (const transform of transforms) {
    const operation = String(transform.operation || '').trim();
    if (!operation) {
      continue;
    }
    transformRefs.push(operation);
    addEntity(operation, 'lineage_transform');
  }

  const sinkRefs = [];
  for (const sink of sinks) {
    const sinkRef = String(sink.ref || '').trim();
    if (!sinkRef) {
      continue;
    }
    sinkRefs.push(sinkRef);
    addEntity(sinkRef, 'lineage_sink');
  }

  if (transformRefs.length > 0) {
    for (const transformRef of transformRefs) {
      for (const sourceRef of sourceRefs) {
        addRelation(transformRef, sourceRef, 'depends_on', { reason: 'lineage.source' });
      }
      for (const sinkRef of sinkRefs) {
        addRelation(transformRef, sinkRef, 'produces', { reason: 'lineage.sink' });
      }
    }
  } else if (sourceRefs.length > 0 && sinkRefs.length > 0) {
    for (const sinkRef of sinkRefs) {
      for (const sourceRef of sourceRefs) {
        addRelation(sinkRef, sourceRef, 'depends_on', { reason: 'lineage.direct' });
      }
    }
  }

  const agentHints = isPlainObject(contract.agent_hints) ? contract.agent_hints : {};
  const suggestedSequence = Array.isArray(agentHints.suggested_sequence) ? agentHints.suggested_sequence : [];
  const sequenceRefs = suggestedSequence
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0);

  for (let index = 0; index < sequenceRefs.length; index++) {
    const ref = sequenceRefs[index];
    addEntity(ref, 'agent_sequence');
    addDecision({
      id: `decision.sequence.${index + 1}.${toOntologyBackfillSlug(ref)}`,
      summary: `execute ${ref} in suggested sequence`,
      bind_to: ref
    });

    if (index > 0) {
      addRelation(ref, sequenceRefs[index - 1], 'depends_on', { reason: 'agent_hints.suggested_sequence' });
    }
  }

  const riskLevel = String(governance.risk_level || governanceContract.risk_level || '').trim().toLowerCase();
  if (riskLevel) {
    addBusinessRule({
      id: `rule.governance.risk-level.${toOntologyBackfillSlug(riskLevel)}`,
      description: `governance risk level is ${riskLevel}`,
      status: 'enforced'
    });
  }

  const approvalRequired = typeof governance.approval_required === 'boolean'
    ? governance.approval_required
    : (
      governanceContract.approval && typeof governanceContract.approval.required === 'boolean'
        ? governanceContract.approval.required
        : null
    );
  if (approvalRequired !== null) {
    addBusinessRule({
      id: 'rule.governance.approval-required',
      description: approvalRequired ? 'approval gate required before commit' : 'approval gate not required',
      status: approvalRequired ? 'enforced' : 'active'
    });
    addDecision({
      id: 'decision.governance.approval-path',
      summary: approvalRequired ? 'approval workflow is resolved' : 'approval bypass policy is resolved',
      automated: approvalRequired !== true
    });
  }

  if (governanceContract.idempotency && typeof governanceContract.idempotency.required === 'boolean') {
    addBusinessRule({
      id: 'rule.governance.idempotency',
      description: governanceContract.idempotency.required
        ? 'idempotency guard configured'
        : 'idempotency guard optional',
      status: 'implemented'
    });
  }

  for (const [bindingIndex, binding] of bindings.entries()) {
    const ref = String(binding.ref || '').trim();
    const preconditions = Array.isArray(binding.preconditions) ? binding.preconditions : [];
    if (!ref || preconditions.length === 0) {
      continue;
    }

    const firstPrecondition = String(preconditions[0] || '').trim();
    if (!firstPrecondition) {
      continue;
    }

    addBusinessRule({
      id: `rule.binding.${bindingIndex + 1}.precondition`,
      description: firstPrecondition,
      entity_ref: ref,
      status: 'implemented'
    });
  }

  if (businessRules.length === 0) {
    addBusinessRule({
      id: 'rule.ontology.backfill.minimum',
      description: 'ontology backfill baseline rule',
      status: 'implemented'
    });
  }

  if (decisionLogic.length === 0) {
    const fallbackRef = bindingRefs[0] || sourceRefs[0] || sinkRefs[0] || 'scene.contract';
    addDecision({
      id: 'decision.ontology.backfill.minimum',
      summary: 'baseline decision is resolved and executable',
      bind_to: fallbackRef
    });
  }

  return {
    entities,
    relations,
    business_rules: businessRules,
    decision_logic: decisionLogic
  };
}

function buildOntologyBackfillEntityKey(item) {
  if (!isPlainObject(item)) {
    return null;
  }
  const id = String(item.id || item.ref || item.name || '').trim();
  return id ? `entity:${id.toLowerCase()}` : null;
}

function buildOntologyBackfillRelationKey(item) {
  if (!isPlainObject(item)) {
    return null;
  }
  const source = String(item.source || item.from || '').trim();
  const target = String(item.target || item.to || '').trim();
  const relationType = String(item.type || item.relation || '').trim().toLowerCase();
  if (!source || !target) {
    return null;
  }
  return `relation:${source.toLowerCase()}|${target.toLowerCase()}|${relationType || 'depends_on'}`;
}

function buildOntologyBackfillRuleKey(item) {
  if (!isPlainObject(item)) {
    return null;
  }
  const id = String(item.id || item.rule_id || item.name || item.description || '').trim();
  return id ? `rule:${id.toLowerCase()}` : null;
}

function buildOntologyBackfillDecisionKey(item) {
  if (!isPlainObject(item)) {
    return null;
  }
  const id = String(item.id || item.decision_id || item.name || item.summary || '').trim();
  return id ? `decision:${id.toLowerCase()}` : null;
}

function resolveOntologyBackfillCollectionTarget(ontologyModel, fieldName) {
  if (!isPlainObject(ontologyModel)) {
    return null;
  }

  const collection = ontologyModel[fieldName];
  if (Array.isArray(collection)) {
    return collection;
  }

  if (collection === undefined || collection === null) {
    ontologyModel[fieldName] = [];
    return ontologyModel[fieldName];
  }

  if (!isPlainObject(collection)) {
    return null;
  }

  for (const key of ['items', 'values', 'list', 'nodes']) {
    if (Array.isArray(collection[key])) {
      return collection[key];
    }
  }

  collection.items = [];
  return collection.items;
}

function mergeOntologyBackfillCollection(ontologyModel, fieldName, candidates = [], buildKey) {
  const target = resolveOntologyBackfillCollectionTarget(ontologyModel, fieldName);
  if (!Array.isArray(target) || !Array.isArray(candidates) || candidates.length === 0) {
    return 0;
  }

  const seen = new Set();
  for (const item of target) {
    const key = buildKey(item);
    if (key) {
      seen.add(key);
    }
  }

  let added = 0;
  for (const item of candidates) {
    const key = buildKey(item);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    target.push(isPlainObject(item) ? mergePlainObject({}, item) : item);
    added++;
  }

  return added;
}

function applyScenePackageOntologyBackfill(contract = {}) {
  if (!isPlainObject(contract)) {
    return {
      changed: false,
      contract,
      additions: {
        entities: 0,
        relations: 0,
        business_rules: 0,
        decision_logic: 0
      },
      changed_fields: []
    };
  }

  const nextContract = JSON.parse(JSON.stringify(contract));
  if (!isPlainObject(nextContract.ontology_model)) {
    nextContract.ontology_model = {};
  }

  const generated = buildScenePackageOntologyBackfillModel(nextContract);
  const ontologyModel = nextContract.ontology_model;

  const additions = {
    entities: mergeOntologyBackfillCollection(ontologyModel, 'entities', generated.entities, buildOntologyBackfillEntityKey),
    relations: mergeOntologyBackfillCollection(ontologyModel, 'relations', generated.relations, buildOntologyBackfillRelationKey),
    business_rules: mergeOntologyBackfillCollection(ontologyModel, 'business_rules', generated.business_rules, buildOntologyBackfillRuleKey),
    decision_logic: mergeOntologyBackfillCollection(ontologyModel, 'decision_logic', generated.decision_logic, buildOntologyBackfillDecisionKey)
  };

  const changedFields = Object.entries(additions)
    .filter(([, count]) => count > 0)
    .map(([field]) => field);

  return {
    changed: changedFields.length > 0,
    contract: nextContract,
    additions,
    changed_fields: changedFields
  };
}

function summarizeScenePackageOntologyBackfillDelta(updated = [], unchanged = []) {
  const candidates = [...updated, ...unchanged];
  const withScores = candidates.filter((item) => {
    const before = item && item.ontology_before ? Number(item.ontology_before.score) : Number.NaN;
    const after = item && item.ontology_after ? Number(item.ontology_after.score) : Number.NaN;
    return Number.isFinite(before) && Number.isFinite(after);
  });

  let beforeTotal = 0;
  let afterTotal = 0;
  let improvedCount = 0;
  let regressedCount = 0;

  for (const item of withScores) {
    const before = Number(item.ontology_before.score);
    const after = Number(item.ontology_after.score);
    beforeTotal += before;
    afterTotal += after;
    if (after > before) {
      improvedCount++;
    } else if (after < before) {
      regressedCount++;
    }
  }

  const total = withScores.length;
  const avgBefore = total > 0 ? Number((beforeTotal / total).toFixed(2)) : null;
  const avgAfter = total > 0 ? Number((afterTotal / total).toFixed(2)) : null;

  return {
    scored_specs: total,
    average_before_score: avgBefore,
    average_after_score: avgAfter,
    average_delta: total > 0 ? Number((avgAfter - avgBefore).toFixed(2)) : null,
    improved_specs: improvedCount,
    regressed_specs: regressedCount,
    unchanged_specs: Math.max(0, total - improvedCount - regressedCount)
  };
}

function buildScenePackageOntologyBackfillBatchReport(payload = {}) {
  return {
    generated_at: new Date().toISOString(),
    mode: payload.mode || 'unknown',
    manifest: payload.manifest || null,
    options: payload.options || {},
    summary: payload.summary || {},
    ontology_delta: payload.ontology_delta || {},
    updated: Array.isArray(payload.updated) ? payload.updated : [],
    unchanged: Array.isArray(payload.unchanged) ? payload.unchanged : [],
    failures: Array.isArray(payload.failures) ? payload.failures : []
  };
}

function printScenePackageOntologyBackfillBatchSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.blue('Scene package ontology backfill batch'));
  console.log(`  Mode: ${payload.mode}`);
  if (payload.options && payload.options.profile) {
    console.log(`  Profile: ${payload.options.profile}`);
  }
  console.log(`  Manifest: ${payload.manifest}`);
  if (payload.options && payload.options.manifest_spec_path) {
    console.log(`  Manifest Spec Path: ${payload.options.manifest_spec_path}`);
  }
  if (payload.options && payload.options.spec_package_path) {
    console.log(`  Spec Package Path: ${payload.options.spec_package_path}`);
  }
  console.log(`  Selected specs: ${payload.summary.selected}`);
  if (payload.mode === 'dry-run') {
    console.log(`  Planned updates: ${payload.summary.planned}`);
  } else {
    console.log(`  Updated: ${payload.summary.updated}`);
  }
  console.log(`  Unchanged: ${payload.summary.unchanged}`);
  console.log(`  Failed: ${payload.summary.failed}`);
  console.log(`  Skipped: ${payload.summary.skipped}`);

  if (payload.ontology_delta && payload.ontology_delta.average_before_score !== null) {
    console.log('  Ontology score:');
    console.log(`    Avg before: ${payload.ontology_delta.average_before_score}`);
    console.log(`    Avg after: ${payload.ontology_delta.average_after_score}`);
    console.log(`    Avg delta: ${payload.ontology_delta.average_delta}`);
  }

  if (payload.out_report_path) {
    console.log(`  Report: ${payload.out_report_path}`);
  }

  if (Array.isArray(payload.failures) && payload.failures.length > 0) {
    console.log(chalk.yellow('\nFailures:'));
    for (const item of payload.failures) {
      console.log(`  - ${item.spec}: ${item.error}`);
    }
  }
}

async function runScenePackageOntologyBackfillBatchCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeScenePackageOntologyBackfillBatchOptions(rawOptions);
  const validationError = validateScenePackageOntologyBackfillBatchOptions(options);
  if (validationError) {
    console.error(chalk.red(`Scene package ontology backfill-batch failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);
  const ensureDir = typeof fileSystem.ensureDir === 'function'
    ? fileSystem.ensureDir.bind(fileSystem)
    : fs.ensureDir.bind(fs);
  const writeJson = typeof fileSystem.writeJson === 'function'
    ? fileSystem.writeJson.bind(fileSystem)
    : fs.writeJson.bind(fs);

  try {
    const manifestPath = resolvePath(projectRoot, options.manifest);
    const manifest = await readJson(manifestPath);
    const manifestSpecs = resolveManifestSpecEntries(manifest, options.manifestSpecPath);
    if (!Array.isArray(manifestSpecs)) {
      throw new Error(`manifest spec array not found at path: ${options.manifestSpecPath}`);
    }
    if (manifestSpecs.length === 0) {
      throw new Error(`manifest spec array is empty at path: ${options.manifestSpecPath}`);
    }

    const includeSet = options.include.length > 0
      ? new Set(options.include.map((item) => String(item).trim()))
      : null;
    const statusFilter = options.status === 'all'
      ? null
      : options.status;

    const selected = [];
    let skippedByFilter = 0;
    for (const entry of manifestSpecs) {
      if (!entry || typeof entry !== 'object') {
        skippedByFilter++;
        continue;
      }

      const specId = String(entry.id || entry.spec || '').trim();
      const entryStatus = String(entry.status || '').trim().toLowerCase();

      if (includeSet && (!specId || !includeSet.has(specId))) {
        skippedByFilter++;
        continue;
      }
      if (statusFilter && entryStatus && entryStatus !== statusFilter) {
        skippedByFilter++;
        continue;
      }

      selected.push(entry);
    }

    const updated = [];
    const unchanged = [];
    const failures = [];

    for (const entry of selected) {
      const source = deriveScenePackagePublishSourceFromManifestEntry(entry);
      const spec = source.spec || String(entry.id || entry.spec || '').trim();
      if (!spec) {
        failures.push({
          spec: '(unknown)',
          error: 'unable to derive spec id from manifest entry'
        });
        if (options.strict) {
          break;
        }
        continue;
      }

      const specPackagePath = source.specPackage || options.specPackagePath;
      const packagePath = path.join(projectRoot, '.sce', 'specs', spec, specPackagePath);
      const packagePathDisplay = normalizeRelativePath(path.relative(projectRoot, packagePath)) || normalizeRelativePath(packagePath);

      try {
        const contract = await readJson(packagePath);
        const beforeQuality = evaluateOntologySemanticQuality(contract);
        const backfill = applyScenePackageOntologyBackfill(contract);
        const afterQuality = evaluateOntologySemanticQuality(backfill.contract);

        const resultItem = {
          spec,
          package_path: packagePathDisplay,
          changed_fields: backfill.changed_fields,
          additions: backfill.additions,
          ontology_before: {
            score: beforeQuality.score,
            level: beforeQuality.level
          },
          ontology_after: {
            score: afterQuality.score,
            level: afterQuality.level
          },
          score_delta: Number((afterQuality.score - beforeQuality.score).toFixed(2))
        };

        if (!backfill.changed) {
          unchanged.push(resultItem);
          continue;
        }

        if (!options.dryRun) {
          await ensureDir(path.dirname(packagePath));
          await writeJson(packagePath, backfill.contract, { spaces: 2 });
        }

        updated.push({
          ...resultItem,
          status: options.dryRun ? 'planned' : 'updated'
        });
      } catch (error) {
        failures.push({
          spec,
          package_path: packagePathDisplay,
          error: error.message
        });
        if (options.strict) {
          break;
        }
      }
    }

    const payload = {
      success: failures.length === 0,
      manifest: normalizeRelativePath(path.relative(projectRoot, manifestPath)) || normalizeRelativePath(manifestPath),
      options: {
        profile: options.from331 ? 'from-331' : 'custom',
        mode: options.dryRun ? 'dry-run' : 'commit',
        manifest_spec_path: options.manifestSpecPath,
        status: statusFilter || 'all',
        include: options.include,
        spec_package_path: options.specPackagePath,
        out_report: options.outReport || null,
        dry_run: options.dryRun,
        strict: options.strict
      },
      mode: options.dryRun ? 'dry-run' : 'commit',
      summary: {
        selected: selected.length,
        updated: options.dryRun ? 0 : updated.length,
        planned: options.dryRun ? updated.length : 0,
        unchanged: unchanged.length,
        failed: failures.length,
        skipped: skippedByFilter
      },
      ontology_delta: summarizeScenePackageOntologyBackfillDelta(updated, unchanged),
      updated,
      unchanged,
      failures
    };

    if (options.outReport) {
      const reportPath = resolvePath(projectRoot, options.outReport);
      const reportPayload = buildScenePackageOntologyBackfillBatchReport(payload);
      await ensureDir(path.dirname(reportPath));
      await writeJson(reportPath, reportPayload, { spaces: 2 });
      payload.out_report_path = normalizeRelativePath(options.outReport) || options.outReport;
      payload.out_report_abs_path = reportPath;
    }

    if (!payload.success) {
      process.exitCode = 1;
    }

    printScenePackageOntologyBackfillBatchSummary(options, payload);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene package ontology backfill-batch failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function runScenePackageInstantiateCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeScenePackageInstantiateOptions(rawOptions);
  const validationError = validateScenePackageInstantiateOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene package instantiate failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);
  const readFile = typeof fileSystem.readFile === 'function'
    ? fileSystem.readFile.bind(fileSystem)
    : fs.readFile.bind(fs);
  const pathExists = typeof fileSystem.pathExists === 'function'
    ? fileSystem.pathExists.bind(fileSystem)
    : fs.pathExists.bind(fs);
  const ensureDir = typeof fileSystem.ensureDir === 'function'
    ? fileSystem.ensureDir.bind(fileSystem)
    : fs.ensureDir.bind(fs);
  const writeJson = typeof fileSystem.writeJson === 'function'
    ? fileSystem.writeJson.bind(fileSystem)
    : fs.writeJson.bind(fs);
  const writeFile = typeof fileSystem.writeFile === 'function'
    ? fileSystem.writeFile.bind(fileSystem)
    : fs.writeFile.bind(fs);

  try {
    const templateManifestPath = resolveScenePackageTemplateManifestPath(options, projectRoot);
    const templateManifest = await readJson(templateManifestPath);

    if (!isPlainObject(templateManifest) || templateManifest.apiVersion !== SCENE_PACKAGE_TEMPLATE_API_VERSION) {
      throw new Error(`template manifest apiVersion must be ${SCENE_PACKAGE_TEMPLATE_API_VERSION}`);
    }

    const templateRootPath = path.dirname(templateManifestPath);
    const templateFiles = isPlainObject(templateManifest.template) ? templateManifest.template : {};
    const packageContractRelative = normalizeRelativePath(templateFiles.package_contract || 'scene-package.json') || 'scene-package.json';
    const sceneTemplateRelative = normalizeRelativePath(templateFiles.scene_manifest || 'scene.template.yaml') || 'scene.template.yaml';

    const packageContractPath = path.join(templateRootPath, packageContractRelative);
    const sceneTemplatePath = path.join(templateRootPath, sceneTemplateRelative);

    const packageContract = await readJson(packageContractPath);
    const contractValidation = validateScenePackageContract(packageContract);
    if (!contractValidation.valid) {
      throw new Error(`template package contract is invalid: ${contractValidation.errors.join('; ')}`);
    }

    const valuesPath = resolveScenePackageInstantiateValuesPath(options, projectRoot);
    let inputValues = {};

    if (valuesPath) {
      inputValues = await readJson(valuesPath);
      if (!isPlainObject(inputValues)) {
        throw new Error('values file must contain a JSON object');
      }
    }

    const parameterResolution = resolveScenePackageTemplateParameterValues(packageContract, inputValues);
    if (parameterResolution.missing.length > 0) {
      throw new Error(`missing required template parameter(s): ${parameterResolution.missing.join(', ')}`);
    }

    let sceneTemplateContent = '';
    if (await pathExists(sceneTemplatePath)) {
      sceneTemplateContent = await readFile(sceneTemplatePath, 'utf8');
    }

    const renderedSceneManifest = buildScenePackageInstantiateManifest(
      sceneTemplateContent,
      parameterResolution.values,
      options.targetSpec
    );

    const targetSpecRoot = path.join(projectRoot, '.sce', 'specs', options.targetSpec);
    const artifacts = isPlainObject(packageContract.artifacts) ? packageContract.artifacts : {};
    const targetSceneManifestRelative = normalizeRelativePath(artifacts.entry_scene || 'custom/scene.yaml') || 'custom/scene.yaml';
    const targetPackageContractRelative = 'custom/scene-package.json';

    const targetSceneManifestPath = path.join(targetSpecRoot, targetSceneManifestRelative);
    const targetPackageContractPath = path.join(targetSpecRoot, targetPackageContractRelative);

    const sceneManifestExists = await pathExists(targetSceneManifestPath);
    const packageContractExists = await pathExists(targetPackageContractPath);

    if ((sceneManifestExists || packageContractExists) && !options.force) {
      throw new Error(`target spec files already exist under ${targetSpecRoot} (use --force to overwrite)`);
    }

    await ensureDir(path.dirname(targetSceneManifestPath));
    await writeFile(targetSceneManifestPath, renderedSceneManifest, 'utf8');

    const instantiatedContract = buildScenePackageInstantiateContract(packageContract, options.targetSpec);
    await ensureDir(path.dirname(targetPackageContractPath));
    await writeJson(targetPackageContractPath, instantiatedContract, { spaces: 2 });

    const payload = {
      instantiated: true,
      overwritten: sceneManifestExists || packageContractExists,
      template: {
        id: isPlainObject(templateManifest.metadata) ? templateManifest.metadata.template_id || null : null,
        manifest_path: formatScenePackagePath(projectRoot, templateManifestPath),
        package_contract_path: formatScenePackagePath(projectRoot, packageContractPath),
        scene_template_path: formatScenePackagePath(projectRoot, sceneTemplatePath)
      },
      target: {
        spec: options.targetSpec,
        scene_manifest_path: formatScenePackagePath(projectRoot, targetSceneManifestPath),
        package_contract_path: formatScenePackagePath(projectRoot, targetPackageContractPath)
      },
      parameters: parameterResolution.values,
      summary: {
        missing_parameters: parameterResolution.missing,
        parameter_count: Object.keys(parameterResolution.values).length
      }
    };

    printScenePackageInstantiateSummary(options, payload, projectRoot);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene package instantiate failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function runScenePackageRegistryCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeScenePackageRegistryOptions(rawOptions);
  const validationError = validateScenePackageRegistryOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene package registry failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const pathExists = typeof fileSystem.pathExists === 'function'
    ? fileSystem.pathExists.bind(fileSystem)
    : fs.pathExists.bind(fs);
  const readdir = typeof fileSystem.readdir === 'function'
    ? fileSystem.readdir.bind(fileSystem)
    : fs.readdir.bind(fs);
  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);
  const ensureDir = typeof fileSystem.ensureDir === 'function'
    ? fileSystem.ensureDir.bind(fileSystem)
    : fs.ensureDir.bind(fs);
  const writeJson = typeof fileSystem.writeJson === 'function'
    ? fileSystem.writeJson.bind(fileSystem)
    : fs.writeJson.bind(fs);

  try {
    const templateRootPath = resolveScenePackageTemplateLibraryPath({ outDir: options.templateDir }, projectRoot);
    if (!(await pathExists(templateRootPath))) {
      throw new Error(`template directory not found: ${templateRootPath}`);
    }

    const templateEntries = await readdir(templateRootPath);
    const templates = [];

    for (const rawEntry of templateEntries) {
      const entryName = typeof rawEntry === 'string'
        ? rawEntry
        : String(rawEntry && rawEntry.name ? rawEntry.name : '').trim();

      if (!entryName) {
        continue;
      }

      const templateDirPath = path.join(templateRootPath, entryName);
      const manifestPath = path.join(templateDirPath, 'template.manifest.json');
      const packagePath = path.join(templateDirPath, 'scene-package.json');
      const sceneTemplatePath = path.join(templateDirPath, 'scene.template.yaml');

      const hasManifest = await pathExists(manifestPath);
      const hasPackage = await pathExists(packagePath);

      if (!hasManifest && !hasPackage) {
        continue;
      }

      const issues = [];
      let templateManifest = null;
      let packageContract = null;

      if (hasManifest) {
        try {
          templateManifest = await readJson(manifestPath);
        } catch (error) {
          issues.push(`failed to read template manifest: ${error.message}`);
        }
      } else {
        issues.push('missing template.manifest.json');
      }

      if (hasPackage) {
        try {
          packageContract = await readJson(packagePath);
        } catch (error) {
          issues.push(`failed to read scene-package.json: ${error.message}`);
        }
      } else {
        issues.push('missing scene-package.json');
      }

      const manifestValidation = validateScenePackageTemplateManifest(templateManifest || {});
      for (const item of manifestValidation.errors) {
        issues.push(`manifest: ${item}`);
      }

      const contractValidation = validateScenePackageContract(packageContract || {});
      for (const item of contractValidation.errors) {
        issues.push(`contract: ${item}`);
      }

      const templateMetadata = isPlainObject(templateManifest && templateManifest.metadata)
        ? templateManifest.metadata
        : {};
      const manifestTemplateId = String(templateMetadata.template_id || '').trim();

      const coordinate = contractValidation.summary.coordinate
        || String(templateMetadata.package_coordinate || '').trim()
        || null;
      const kind = contractValidation.summary.kind
        || String(templateMetadata.package_kind || '').trim()
        || null;
      const layer = classifyScenePackageLayer(kind);

      templates.push({
        template_id: manifestTemplateId || entryName,
        template_dir: formatScenePackagePath(projectRoot, templateDirPath),
        coordinate,
        kind,
        layer,
        valid: issues.length === 0,
        issues,
        source_spec: String(templateMetadata.source_spec || '').trim() || null,
        paths: {
          manifest: formatScenePackagePath(projectRoot, manifestPath),
          package_contract: formatScenePackagePath(projectRoot, packagePath),
          scene_template: formatScenePackagePath(projectRoot, sceneTemplatePath)
        }
      });
    }

    templates.sort((a, b) => a.template_id.localeCompare(b.template_id));

    const layerCounts = {
      l1_capability: 0,
      l2_domain: 0,
      l3_instance: 0,
      unknown: 0
    };

    for (const item of templates) {
      if (item.layer === 'l1-capability') {
        layerCounts.l1_capability += 1;
      } else if (item.layer === 'l2-domain') {
        layerCounts.l2_domain += 1;
      } else if (item.layer === 'l3-instance') {
        layerCounts.l3_instance += 1;
      } else {
        layerCounts.unknown += 1;
      }
    }

    const validTemplates = templates.filter((item) => item.valid).length;
    const invalidTemplates = templates.length - validTemplates;

    const payload = {
      generated_at: new Date().toISOString(),
      template_root: formatScenePackagePath(projectRoot, templateRootPath),
      summary: {
        total_templates: templates.length,
        valid_templates: validTemplates,
        invalid_templates: invalidTemplates,
        layer_counts: layerCounts
      },
      templates
    };

    if (options.out) {
      const outputPath = resolvePath(projectRoot, options.out);
      await ensureDir(path.dirname(outputPath));
      await writeJson(outputPath, payload, { spaces: 2 });
      payload.output_path = normalizeRelativePath(options.out);
      payload.output_abs_path = outputPath;
    }

    printScenePackageRegistrySummary(options, payload, projectRoot);

    if (options.strict && invalidTemplates > 0) {
      process.exitCode = 1;
    }

    return payload;
  } catch (error) {
    console.error(chalk.red('Scene package registry failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function runScenePackageGateTemplateCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeScenePackageGateTemplateOptions(rawOptions);
  const validationError = validateScenePackageGateTemplateOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene package gate template failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const outputPath = resolvePath(projectRoot, options.out);
    const outputExists = await fileSystem.pathExists(outputPath);

    if (outputExists && !options.force) {
      throw new Error(`output file already exists: ${outputPath} (use --force to overwrite)`);
    }

    const payload = createScenePackageGatePolicyTemplate(options.profile);

    await fileSystem.ensureDir(path.dirname(outputPath));
    await fileSystem.writeJson(outputPath, payload, { spaces: 2 });

    const summary = {
      created: true,
      overwritten: outputExists,
      profile: payload.profile,
      output_path: normalizeRelativePath(options.out),
      output_abs_path: outputPath,
      policy: payload
    };

    printScenePackageGateTemplateSummary(options, summary, projectRoot);
    return summary;
  } catch (error) {
    console.error(chalk.red('Scene package gate template failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function runScenePackageGateCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeScenePackageGateOptions(rawOptions);
  const validationError = validateScenePackageGateOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene package gate failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);
  const pathExists = typeof fileSystem.pathExists === 'function'
    ? fileSystem.pathExists.bind(fileSystem)
    : fs.pathExists.bind(fs);
  const ensureDir = typeof fileSystem.ensureDir === 'function'
    ? fileSystem.ensureDir.bind(fileSystem)
    : fs.ensureDir.bind(fs);
  const writeJson = typeof fileSystem.writeJson === 'function'
    ? fileSystem.writeJson.bind(fileSystem)
    : fs.writeJson.bind(fs);

  try {
    const registryPath = resolvePath(projectRoot, options.registry);
    const policyPath = resolvePath(projectRoot, options.policy);

    const registryPayload = await readJson(registryPath);

    let policyPayload;
    if (await pathExists(policyPath)) {
      policyPayload = await readJson(policyPath);
    } else {
      policyPayload = createScenePackageGatePolicyTemplate('baseline');
    }

    const evaluation = evaluateScenePackageGate(registryPayload, policyPayload);
    const remediation = buildScenePackageGateRemediationPlan(evaluation);

    const payload = {
      evaluated_at: new Date().toISOString(),
      registry_path: normalizeRelativePath(options.registry),
      policy_path: normalizeRelativePath(options.policy),
      ...evaluation,
      remediation
    };

    if (options.out) {
      const outputPath = resolvePath(projectRoot, options.out);
      await ensureDir(path.dirname(outputPath));
      await writeJson(outputPath, payload, { spaces: 2 });
      payload.output_path = normalizeRelativePath(options.out);
      payload.output_abs_path = outputPath;
    }

    const taskDraftResult = await writeScenePackageGateTaskDraft(options, payload, projectRoot, fileSystem);
    if (taskDraftResult) {
      payload.task_draft = taskDraftResult;
    }

    const runbookResult = await writeScenePackageGateRemediationRunbook(options, payload, projectRoot, fileSystem);
    if (runbookResult) {
      payload.runbook = runbookResult;
    }

    const taskSyncResult = await appendScenePackageGateChecksToSpecTasks(options, payload, projectRoot, fileSystem);
    if (taskSyncResult) {
      payload.task_sync = taskSyncResult;
    }

    printScenePackageGateSummary(options, payload, projectRoot);

    if (options.strict && !payload.summary.passed) {
      process.exitCode = 1;
    }

    return payload;
  } catch (error) {
    console.error(chalk.red('Scene package gate failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function runSceneCatalogCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeCatalogOptions(rawOptions);
  const validationError = validateCatalogOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene catalog failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const catalog = await buildSceneCatalog(options, {
      projectRoot,
      fileSystem,
      sceneLoader: dependencies.sceneLoader
    });

    if (options.out) {
      const outputPath = resolvePath(projectRoot, options.out);
      await fileSystem.ensureDir(path.dirname(outputPath));
      await fileSystem.writeJson(outputPath, catalog, { spaces: 2 });
      catalog.output_path = options.out;
      catalog.output_abs_path = outputPath;
    }

    printSceneCatalogSummary(options, catalog, projectRoot);
    return catalog;
  } catch (error) {
    console.error(chalk.red('Scene catalog failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function runSceneRouteCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeRouteOptions(rawOptions);
  const validationError = validateRouteOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene route failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const routePolicyResolution = await loadSceneRoutePolicy(options, projectRoot, fileSystem);

    const catalog = await buildSceneCatalog({
      spec: options.spec,
      specManifest: options.specManifest,
      domain: options.domain,
      kind: options.kind,
      includeInvalid: options.includeInvalid
    }, {
      projectRoot,
      fileSystem,
      sceneLoader: dependencies.sceneLoader
    });

    const routeDecision = buildSceneRouteDecision(catalog, options, routePolicyResolution.policy);

    if (routeDecision.hasTie) {
      throw new Error(`route resolution is not unique: ${routeDecision.selected.scene_ref} ties with ${routeDecision.tie_with}`);
    }

    const selectors = [];
    if (options.spec) {
      selectors.push(`spec=${options.spec}`);
    }
    if (options.sceneRef) {
      selectors.push(`scene_ref=${options.sceneRef}`);
    }
    if (options.domain) {
      selectors.push(`domain=${options.domain}`);
    }
    if (options.kind) {
      selectors.push(`kind=${options.kind}`);
    }
    if (options.query) {
      selectors.push(`query=${options.query}`);
    }

    const routePayload = {
      generated_at: new Date().toISOString(),
      query: {
        selectors,
        mode: options.mode,
        require_unique: options.requireUnique,
        include_invalid: options.includeInvalid
      },
      route_policy_source: routePolicyResolution.source,
      route_policy: routePolicyResolution.policy,
      catalog_summary: catalog.summary,
      summary: {
        candidates_scored: routeDecision.candidates_scored,
        selected_scene_ref: routeDecision.selected ? routeDecision.selected.scene_ref : null,
        tie_detected: routeDecision.hasTie,
        tie_with: routeDecision.tie_with
      },
      selected: routeDecision.selected,
      alternatives: routeDecision.alternatives
    };

    if (options.out) {
      const outputPath = resolvePath(projectRoot, options.out);
      await fileSystem.ensureDir(path.dirname(outputPath));
      await fileSystem.writeJson(outputPath, routePayload, { spaces: 2 });
      routePayload.output_path = options.out;
      routePayload.output_abs_path = outputPath;
    }

    printSceneRouteSummary(options, routePayload, projectRoot);

    if (!routeDecision.selected) {
      process.exitCode = 1;
    }

    return routePayload;
  } catch (error) {
    console.error(chalk.red('Scene route failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function runSceneScaffoldCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const sceneLoader = dependencies.sceneLoader || new SceneLoader({ projectPath: projectRoot });
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeScaffoldOptions(rawOptions);
  const validationError = validateScaffoldOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene scaffold failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const specPath = path.join(projectRoot, '.sce', 'specs', options.spec);
    const specExists = await fileSystem.pathExists(specPath);
    if (!specExists) {
      throw new Error(`target spec not found: ${options.spec}`);
    }

    const templatePath = resolveScaffoldTemplatePath(options, projectRoot);
    const templateContent = await fileSystem.readFile(templatePath, 'utf8');
    const templateManifest = templatePath.toLowerCase().endsWith('.json')
      ? JSON.parse(templateContent)
      : yaml.load(templateContent);

    const outputPath = resolveScaffoldOutputPath(projectRoot, options);
    const outputExists = await fileSystem.pathExists(outputPath);

    if (outputExists && !options.force) {
      throw new Error(`output manifest already exists: ${outputPath} (use --force to overwrite)`);
    }

    const scaffoldManifest = applyScaffoldOverrides(templateManifest, options);
    const manifestValidation = sceneLoader.validateManifest(scaffoldManifest);

    if (!manifestValidation.valid) {
      throw new Error(`generated manifest is invalid: ${manifestValidation.errors.join('; ')}`);
    }

    const outputContent = yaml.dump(scaffoldManifest, {
      noRefs: true,
      lineWidth: 120,
      sortKeys: false
    });

    if (!options.dryRun) {
      await fileSystem.ensureDir(path.dirname(outputPath));
      await fileSystem.writeFile(outputPath, outputContent, 'utf8');
    }

    const summary = {
      created: !options.dryRun,
      dry_run: options.dryRun,
      overwritten: outputExists,
      spec: options.spec,
      type: options.type,
      template_path: templatePath,
      output_path: outputPath,
      scene_ref: scaffoldManifest.metadata.obj_id,
      scene_version: scaffoldManifest.metadata.obj_version,
      title: scaffoldManifest.metadata.title
    };

    printScaffoldSummary(options, summary);
    return summary;
  } catch (error) {
    console.error(chalk.red('Scene scaffold failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function writeOutputs(options, payload, projectRoot, fileSystem = fs) {
  if (options.planOut) {
    const planPath = resolvePath(projectRoot, options.planOut);
    await fileSystem.ensureDir(path.dirname(planPath));
    await fileSystem.writeJson(planPath, payload.plan, { spaces: 2 });
  }

  if (options.resultOut) {
    const resultPath = resolvePath(projectRoot, options.resultOut);
    await fileSystem.ensureDir(path.dirname(resultPath));
    await fileSystem.writeJson(resultPath, {
      scene_ref: payload.sceneManifest.metadata.obj_id,
      scene_version: payload.sceneManifest.metadata.obj_version,
      plan_id: payload.plan.plan_id,
      trace_id: payload.runResult.trace_id,
      run_mode: payload.runResult.run_mode,
      run_result: payload.runResult,
      eval_payload: payload.evalPayload
    }, { spaces: 2 });
  }
}

function printRunSummary(options, sceneManifest, execution, projectRoot = process.cwd()) {
  const runResult = execution.run_result;
  const plan = execution.plan;

  if (options.json) {
    const output = {
      scene_ref: sceneManifest.metadata.obj_id,
      scene_version: sceneManifest.metadata.obj_version,
      plan_id: plan.plan_id,
      trace_id: runResult.trace_id,
      run_mode: runResult.run_mode,
      status: runResult.status,
      denied_reasons: runResult.policy && runResult.policy.allowed === false ? runResult.policy.reasons : [],
      node_count: plan.nodes.length,
      evidence_count: Array.isArray(runResult.evidence) ? runResult.evidence.length : 0,
      binding_plugins: runResult.binding_plugins || null,
      eval_payload: execution.eval_payload
    };

    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const statusColor = runResult.status === 'success'
    ? chalk.green
    : (runResult.status === 'denied' || runResult.status === 'failed' ? chalk.red : chalk.yellow);

  console.log(chalk.blue('Scene Runtime'));
  console.log(`  Scene: ${chalk.cyan(sceneManifest.metadata.obj_id)}@${sceneManifest.metadata.obj_version}`);
  console.log(`  Mode: ${runResult.run_mode}`);
  console.log(`  Status: ${statusColor(runResult.status)}`);
  console.log(`  Trace: ${chalk.gray(runResult.trace_id)}`);
  console.log(`  Plan: ${plan.plan_id} (${plan.nodes.length} nodes)`);

  if (runResult.binding_plugins && (runResult.binding_plugins.handlers_loaded > 0 || (runResult.binding_plugins.warnings || []).length > 0 || runResult.binding_plugins.manifest_path)) {
    console.log(`  Binding Plugins: ${runResult.binding_plugins.handlers_loaded} handler(s)`);

    if (runResult.binding_plugins.manifest_path) {
      const manifestStatus = runResult.binding_plugins.manifest_loaded ? 'loaded' : 'not-loaded';
      console.log(`    Manifest: ${chalk.gray(runResult.binding_plugins.manifest_path)} (${manifestStatus})`);
    }

    if (Array.isArray(runResult.binding_plugins.warnings) && runResult.binding_plugins.warnings.length > 0) {
      console.log(chalk.yellow('  Binding Plugin Warnings:'));
      for (const warning of runResult.binding_plugins.warnings) {
        console.log(`    - ${warning}`);
      }
    }
  }

  if (runResult.policy && runResult.policy.allowed === false && Array.isArray(runResult.policy.reasons) && runResult.policy.reasons.length > 0) {
    console.log(chalk.yellow('  Policy Reasons:'));
    for (const reason of runResult.policy.reasons) {
      console.log(`    - ${reason}`);
    }
  }

  if (options.planOut) {
    console.log(`  Plan Output: ${chalk.gray(resolvePath(projectRoot, options.planOut))}`);
  }

  if (options.resultOut) {
    console.log(`  Result Output: ${chalk.gray(resolvePath(projectRoot, options.resultOut))}`);
  }
}

async function runSceneCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const sceneLoader = dependencies.sceneLoader || new SceneLoader({ projectPath: projectRoot });
  const readJson = dependencies.readJson || fs.readJson;
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeRunOptions(rawOptions);
  const validationError = validateRunOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene run failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const runtimeExecutor = dependencies.runtimeExecutor || new RuntimeExecutor({
    projectRoot,
    moquiConfigPath: options.moquiConfig,
    bindingPluginDir: options.bindingPluginDir,
    bindingPluginManifest: options.bindingPluginManifest,
    bindingPluginAutoDiscovery: options.bindingPluginAutoDiscovery,
    bindingPluginManifestLoad: options.bindingPluginManifestLoad
  });

  try {
    const sceneManifest = await loadSceneManifest(sceneLoader, options, projectRoot);
    const context = await buildRuntimeContext(options, projectRoot, readJson);

    const execution = await runtimeExecutor.execute(sceneManifest, {
      runMode: options.mode,
      traceId: options.traceId,
      context
    });

    await writeOutputs(options, {
      sceneManifest,
      plan: execution.plan,
      runResult: execution.run_result,
      evalPayload: execution.eval_payload
    }, projectRoot, fileSystem);

    printRunSummary(options, sceneManifest, execution, projectRoot);

    if (execution.run_result.status === 'denied' || execution.run_result.status === 'failed') {
      process.exitCode = 1;
    }

    return execution;
  } catch (error) {
    console.error(chalk.red('Scene run failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function resolvePath(projectRoot, targetPath) {
  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }

  return path.join(projectRoot, targetPath);
}

// ── Scene Instantiate Command ───────────────────────────────────────────────────

function normalizeSceneInstantiateOptions(options = {}) {
  return {
    package: options.package ? String(options.package).trim() : undefined,
    values: options.values ? String(options.values).trim() : undefined,
    out: options.out ? String(options.out).trim() : undefined,
    templateDir: options.templateDir ? String(options.templateDir).trim() : SCENE_PACKAGE_TEMPLATE_DEFAULT_DIR,
    list: options.list === true,
    dryRun: options.dryRun === true,
    interactive: options.interactive === true,
    json: options.json === true
  };
}

function validateSceneInstantiateOptions(options) {
  if (options.list) {
    return null;
  }
  if (!options.package || typeof options.package !== 'string') {
    return '--package is required';
  }
  if (!options.out || typeof options.out !== 'string') {
    return '--out is required';
  }
  if (!options.values && !options.interactive) {
    return '--values is required unless --interactive is set';
  }
  return null;
}

async function buildInstantiateRegistry(templateDir, fileSystem) {
  const fsOps = fileSystem || fs;
  const pathExists = typeof fsOps.pathExists === 'function' ? fsOps.pathExists.bind(fsOps) : fs.pathExists.bind(fs);
  const readdir = typeof fsOps.readdir === 'function' ? fsOps.readdir.bind(fsOps) : fs.readdir.bind(fs);
  const readJson = typeof fsOps.readJson === 'function' ? fsOps.readJson.bind(fsOps) : fs.readJson.bind(fs);

  if (!(await pathExists(templateDir))) {
    return [];
  }

  const entries = await readdir(templateDir);
  const templates = [];

  for (const rawEntry of entries) {
    const entryName = typeof rawEntry === 'string' ? rawEntry : String(rawEntry && rawEntry.name ? rawEntry.name : '').trim();
    if (!entryName) continue;

    const entryDir = path.join(templateDir, entryName);
    const packagePath = path.join(entryDir, 'scene-package.json');
    if (!(await pathExists(packagePath))) continue;

    let contract = null;
    const issues = [];
    try {
      contract = await readJson(packagePath);
    } catch (err) {
      issues.push('failed to read scene-package.json: ' + err.message);
    }

    const contractObj = isPlainObject(contract) ? contract : {};
    const variables = Array.isArray(contractObj.variables) ? contractObj.variables : [];
    const files = Array.isArray(contractObj.files) ? contractObj.files : [];
    const extendsName = contractObj.extends || null;
    const kind = contractObj.kind || null;
    const layer = classifyScenePackageLayer(kind);
    const coordinate = buildScenePackageCoordinate(contractObj);

    const contractValidation = validateScenePackageContract(contractObj);
    for (const item of contractValidation.errors) {
      issues.push('contract: ' + item);
    }

    templates.push({
      name: contractObj.name || entryName,
      contract: contractObj,
      variables,
      files,
      extends: extendsName,
      layer,
      coordinate,
      template_dir: entryDir,
      valid: issues.length === 0,
      issues
    });
  }

  return templates;
}

function buildInstantiationManifest(packageName, chain, resolvedValues, renderedFiles, outputDir) {
  const filesGenerated = Array.isArray(renderedFiles)
    ? renderedFiles.map(function (f) {
        return { path: f.target || f.path || '', size: typeof f.size === 'number' ? f.size : 0 };
      })
    : [];

  return {
    package_name: packageName,
    inheritance_chain: Array.isArray(chain) ? chain.slice() : [],
    variables_used: isPlainObject(resolvedValues) ? Object.assign({}, resolvedValues) : {},
    files_generated: filesGenerated,
    generated_at: new Date().toISOString(),
    output_directory: outputDir || ''
  };
}

async function appendInstantiationLog(logPath, entry, fileSystem) {
  const fsOps = fileSystem || fs;
  const pathExists = typeof fsOps.pathExists === 'function' ? fsOps.pathExists.bind(fsOps) : fs.pathExists.bind(fs);
  const readJson = typeof fsOps.readJson === 'function' ? fsOps.readJson.bind(fsOps) : fs.readJson.bind(fs);
  const writeJson = typeof fsOps.writeJson === 'function' ? fsOps.writeJson.bind(fsOps) : fs.writeJson.bind(fs);
  const ensureDir = typeof fsOps.ensureDir === 'function' ? fsOps.ensureDir.bind(fsOps) : fs.ensureDir.bind(fs);

  let log = [];
  if (await pathExists(logPath)) {
    try {
      const existing = await readJson(logPath);
      if (Array.isArray(existing)) {
        log = existing;
      }
    } catch (_e) {
      // Corrupt log — start fresh
      log = [];
    }
  }

  log.push(entry);
  await ensureDir(path.dirname(logPath));
  await writeJson(logPath, log, { spaces: 2 });
}

function executePostInstantiateHook(hookCommand, workingDir) {
  if (!hookCommand || typeof hookCommand !== 'string' || hookCommand.trim().length === 0) {
    return { executed: false };
  }

  const childProcess = require('child_process');
  try {
    childProcess.execSync(hookCommand, {
      cwd: workingDir || process.cwd(),
      stdio: 'pipe',
      timeout: 30000
    });
    return { executed: true, exit_code: 0 };
  } catch (err) {
    const exitCode = typeof err.status === 'number' ? err.status : 1;
    return { executed: true, exit_code: exitCode, warning: 'post-hook exited with code ' + exitCode };
  }
}

async function promptMissingVariables(schema, currentValues, prompter) {
  const values = isPlainObject(currentValues) ? Object.assign({}, currentValues) : {};
  if (!Array.isArray(schema) || typeof prompter !== 'function') {
    return values;
  }

  const questions = [];
  for (const variable of schema) {
    if (!isPlainObject(variable)) continue;
    const name = variable.name;
    if (typeof name !== 'string' || name.trim().length === 0) continue;

    const isRequired = variable.required === true;
    const hasDefault = Object.prototype.hasOwnProperty.call(variable, 'default') && variable.default !== undefined;
    const hasValue = Object.prototype.hasOwnProperty.call(values, name);

    if (hasValue || (!isRequired && !hasDefault)) continue;
    if (!isRequired && hasDefault && !hasValue) continue;
    if (!isRequired) continue;

    // Required, no value supplied — prompt
    const question = {
      name: name,
      message: (variable.description || name) + ' (' + (variable.type || 'string') + ')',
      type: 'input'
    };
    if (hasDefault) {
      question.default = variable.default;
    }
    questions.push(question);
  }

  if (questions.length === 0) {
    return values;
  }

  const answers = await prompter(questions);
  if (isPlainObject(answers)) {
    for (const key of Object.keys(answers)) {
      values[key] = answers[key];
    }
  }

  return values;
}

async function parseInstantiateValues(rawValues, projectRoot, fileSystem) {
  if (!rawValues || typeof rawValues !== 'string') {
    return {};
  }

  const trimmed = rawValues.trim();
  if (trimmed.length === 0) {
    return {};
  }

  if (trimmed.endsWith('.json')) {
    // File path mode
    const fsOps = fileSystem || fs;
    const readJson = typeof fsOps.readJson === 'function' ? fsOps.readJson.bind(fsOps) : fs.readJson.bind(fs);
    const filePath = path.isAbsolute(trimmed) ? trimmed : path.join(projectRoot || process.cwd(), trimmed);
    const data = await readJson(filePath);
    if (!isPlainObject(data)) {
      throw new Error('values file must contain a JSON object');
    }
    return data;
  }

  // Inline JSON mode
  try {
    const parsed = JSON.parse(trimmed);
    if (!isPlainObject(parsed)) {
      throw new Error('inline values must be a JSON object');
    }
    return parsed;
  } catch (err) {
    if (err.message === 'inline values must be a JSON object') {
      throw err;
    }
    throw new Error('failed to parse inline JSON values: ' + err.message);
  }
}

function printSceneInstantiateSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (payload.mode === 'list') {
    console.log(chalk.blue('Scene Instantiate — Available Templates'));
    if (!Array.isArray(payload.templates) || payload.templates.length === 0) {
      console.log(chalk.yellow('  No template packages found in registry.'));
    } else {
      for (const tpl of payload.templates) {
        const status = tpl.valid ? chalk.green('valid') : chalk.red('invalid');
        console.log(`  ${tpl.name}  ${chalk.gray(tpl.layer || 'unknown')}  ${status}`);
      }
    }
    console.log(`  Total: ${payload.summary.total_templates} (${payload.summary.valid_templates} valid, ${payload.summary.invalid_templates} invalid)`);
    return;
  }

  if (payload.mode === 'dry-run') {
    console.log(chalk.blue('Scene Instantiate — Dry Run'));
    console.log(`  Package: ${payload.package_name}`);
    console.log(`  Chain: ${(payload.inheritance_chain || []).join(' → ')}`);
    console.log(`  Variables: ${JSON.stringify(payload.variables || {})}`);
    if (Array.isArray(payload.files_planned)) {
      console.log(`  Files planned: ${payload.files_planned.length}`);
      for (const f of payload.files_planned) {
        console.log(`    ${chalk.gray(f)}`);
      }
    }
    if (payload.hook_command) {
      console.log(`  Post-hook: ${chalk.gray(payload.hook_command)}`);
    }
    return;
  }

  // Normal mode
  console.log(chalk.blue('Scene Instantiate'));
  console.log(`  Package: ${payload.package_name}`);
  console.log(`  Chain: ${(payload.inheritance_chain || []).join(' → ')}`);
  console.log(`  Files: ${payload.summary.total_files}`);
  console.log(`  Size: ${payload.summary.total_bytes} bytes`);
  console.log(`  Variables: ${payload.summary.variables_used}`);
  if (payload.manifest_path) {
    console.log(`  Manifest: ${chalk.gray(payload.manifest_path)}`);
  }
  if (payload.hook) {
    if (payload.hook.executed && payload.hook.exit_code === 0) {
      console.log(`  Post-hook: ${chalk.green('success')}`);
    } else if (payload.hook.executed) {
      console.log(`  Post-hook: ${chalk.yellow(payload.hook.warning || 'failed')}`);
    }
  }
}

async function runSceneInstantiateCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const prompter = dependencies.prompter || null;

  const options = normalizeSceneInstantiateOptions(rawOptions);
  const validationError = validateSceneInstantiateOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene instantiate failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const pathExists = typeof fileSystem.pathExists === 'function' ? fileSystem.pathExists.bind(fileSystem) : fs.pathExists.bind(fs);
  const ensureDir = typeof fileSystem.ensureDir === 'function' ? fileSystem.ensureDir.bind(fileSystem) : fs.ensureDir.bind(fs);
  const writeJson = typeof fileSystem.writeJson === 'function' ? fileSystem.writeJson.bind(fileSystem) : fs.writeJson.bind(fs);

  try {
    const templateRootPath = resolveScenePackageTemplateLibraryPath({ outDir: options.templateDir }, projectRoot);
    const registry = await buildInstantiateRegistry(templateRootPath, fileSystem);

    // ── List mode ──
    if (options.list) {
      const validTemplates = registry.filter(function (t) { return t.valid; }).length;
      const payload = {
        mode: 'list',
        templates: registry.map(function (t) {
          return { name: t.name, layer: t.layer, coordinate: t.coordinate, valid: t.valid };
        }),
        summary: {
          total_templates: registry.length,
          valid_templates: validTemplates,
          invalid_templates: registry.length - validTemplates
        }
      };
      printSceneInstantiateSummary(options, payload, projectRoot);
      return payload;
    }

    // ── Find package ──
    const pkg = registry.find(function (t) { return t.name === options.package; });
    if (!pkg) {
      console.error(chalk.red(`Scene instantiate failed: package "${options.package}" not found in registry`));
      process.exitCode = 1;
      return null;
    }

    // ── Resolve inheritance ──
    const inheritance = resolveTemplateInheritance(registry, options.package);
    if (!inheritance.resolved) {
      console.error(chalk.red('Scene instantiate failed: ' + (inheritance.errors[0] || 'inheritance resolution failed')));
      process.exitCode = 1;
      return null;
    }

    // ── Parse values ──
    let values = {};
    if (options.values) {
      values = await parseInstantiateValues(options.values, projectRoot, fileSystem);
    }

    // ── Interactive prompting ──
    if (options.interactive && prompter) {
      values = await promptMissingVariables(inheritance.mergedVariables, values, prompter);
    }

    // ── Validate variables ──
    const validation = validateTemplateVariables(inheritance.mergedVariables, values);

    // ── Dry-run mode ──
    if (options.dryRun) {
      if (!validation.valid && !options.interactive) {
        // In dry-run, still show validation errors
      }
      const hookCommand = (pkg.contract && pkg.contract.post_instantiate_hook) || null;
      const payload = {
        instantiated: false,
        mode: 'dry-run',
        package_name: options.package,
        inheritance_chain: inheritance.chain,
        variables: validation.resolved,
        files_planned: inheritance.mergedFiles,
        hook_command: hookCommand,
        errors: validation.errors
      };
      printSceneInstantiateSummary(options, payload, projectRoot);
      if (!validation.valid) {
        process.exitCode = 1;
      }
      return payload;
    }

    // ── Normal mode — validate must pass ──
    if (!validation.valid) {
      for (const err of validation.errors) {
        console.error(chalk.red('  ' + err));
      }
      console.error(chalk.red('Scene instantiate failed: variable validation errors'));
      process.exitCode = 1;
      return null;
    }

    // ── Render files ──
    const outputDir = resolvePath(projectRoot, options.out);
    await ensureDir(outputDir);

    const templateDir = pkg.template_dir;
    const renderResult = await renderTemplateFiles(
      templateDir,
      { schema: inheritance.mergedVariables, values: validation.resolved },
      outputDir,
      fileSystem
    );

    if (!renderResult.rendered) {
      for (const err of renderResult.errors) {
        console.error(chalk.red('  ' + err));
      }
      console.error(chalk.red('Scene instantiate failed: rendering errors'));
      process.exitCode = 1;
      return null;
    }

    // ── Write manifest ──
    const manifest = buildInstantiationManifest(
      options.package,
      inheritance.chain,
      validation.resolved,
      renderResult.files,
      options.out
    );
    const manifestPath = path.join(outputDir, 'instantiation-manifest.json');
    try {
      await writeJson(manifestPath, manifest, { spaces: 2 });
    } catch (err) {
      console.warn(chalk.yellow('Warning: failed to write manifest: ' + err.message));
    }

    // ── Write log ──
    const logPath = path.join(outputDir, 'instantiation-log.json');
    const logEntry = {
      package_name: options.package,
      inheritance_chain: inheritance.chain,
      variables_used: validation.resolved,
      files_generated_count: renderResult.files.length,
      generated_at: manifest.generated_at,
      output_directory: options.out
    };
    try {
      await appendInstantiationLog(logPath, logEntry, fileSystem);
    } catch (err) {
      console.warn(chalk.yellow('Warning: failed to write log: ' + err.message));
    }

    // ── Post-hook ──
    const hookCommand = (pkg.contract && pkg.contract.post_instantiate_hook) || null;
    const hookResult = executePostInstantiateHook(hookCommand, outputDir);
    if (hookResult.warning) {
      console.warn(chalk.yellow('Warning: ' + hookResult.warning));
    }

    // ── Build payload ──
    const payload = {
      instantiated: true,
      mode: 'normal',
      package_name: options.package,
      inheritance_chain: inheritance.chain,
      variables: validation.resolved,
      files: renderResult.files,
      manifest_path: formatScenePackagePath(projectRoot, manifestPath),
      log_path: formatScenePackagePath(projectRoot, logPath),
      hook: hookResult,
      errors: [],
      summary: renderResult.summary
    };

    printSceneInstantiateSummary(options, payload, projectRoot);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene instantiate failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

// ── Template Engine Constants ──────────────────────────────────────────────────
const TEMPLATE_VARIABLE_TYPES = new Set(['string', 'number', 'boolean', 'enum', 'array']);
const TEMPLATE_LAYER_VALUES = new Set(['l1-capability', 'l2-domain', 'l3-instance']);

function validateTemplateVariableSchema(variables) {
  const errors = [];
  const warnings = [];
  const typeBreakdown = {};

  if (!Array.isArray(variables)) {
    return {
      valid: false,
      errors: ['variables must be an array'],
      warnings: [],
      summary: { variable_count: 0, type_breakdown: {} }
    };
  }

  for (const [index, variable] of variables.entries()) {
    if (!isPlainObject(variable)) {
      errors.push(`variables[${index}]: must be an object`);
      continue;
    }

    // name: required, must be non-empty string
    const name = variable.name;
    if (name === undefined || name === null) {
      errors.push(`variables[${index}]: missing required field "name"`);
    } else if (typeof name !== 'string' || name.trim().length === 0) {
      errors.push(`variables[${index}]: "name" must be a non-empty string`);
    }

    // type: required, must be one of TEMPLATE_VARIABLE_TYPES
    const type = variable.type;
    if (type === undefined || type === null) {
      errors.push(`variables[${index}]: missing required field "type"`);
    } else if (typeof type !== 'string') {
      errors.push(`variables[${index}]: "type" must be a string`);
    } else if (!TEMPLATE_VARIABLE_TYPES.has(type)) {
      errors.push(`variables[${index}]: type "${type}" is not supported (must be one of ${Array.from(TEMPLATE_VARIABLE_TYPES).join(', ')})`);
    } else {
      typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
    }

    // required: optional, must be boolean when provided
    if (Object.prototype.hasOwnProperty.call(variable, 'required') && typeof variable.required !== 'boolean') {
      errors.push(`variables[${index}]: "required" must be boolean when provided`);
    }

    // description: optional, warn if missing
    if (!variable.description || (typeof variable.description === 'string' && variable.description.trim().length === 0)) {
      const varLabel = (typeof name === 'string' && name.trim().length > 0) ? name : `index ${index}`;
      warnings.push(`variables[${index}]: no description provided for "${varLabel}"`);
    }

    // validation: optional, must be object when provided
    if (Object.prototype.hasOwnProperty.call(variable, 'validation')) {
      if (!isPlainObject(variable.validation)) {
        errors.push(`variables[${index}]: "validation" must be an object when provided`);
      } else {
        const validation = variable.validation;
        const varType = typeof type === 'string' ? type : null;

        if (Object.prototype.hasOwnProperty.call(validation, 'regex')) {
          if (typeof validation.regex !== 'string') {
            errors.push(`variables[${index}]: "validation.regex" must be a string`);
          } else {
            try {
              new RegExp(validation.regex);
            } catch (_e) {
              errors.push(`variables[${index}]: "validation.regex" is not a valid regular expression`);
            }
          }
        }

        if (Object.prototype.hasOwnProperty.call(validation, 'enum_values')) {
          if (!Array.isArray(validation.enum_values)) {
            errors.push(`variables[${index}]: "validation.enum_values" must be an array`);
          } else if (validation.enum_values.length === 0) {
            errors.push(`variables[${index}]: "validation.enum_values" must not be empty`);
          }
        }

        if (Object.prototype.hasOwnProperty.call(validation, 'min') && typeof validation.min !== 'number') {
          errors.push(`variables[${index}]: "validation.min" must be a number`);
        }

        if (Object.prototype.hasOwnProperty.call(validation, 'max') && typeof validation.max !== 'number') {
          errors.push(`variables[${index}]: "validation.max" must be a number`);
        }

        if (typeof validation.min === 'number' && typeof validation.max === 'number' && validation.min > validation.max) {
          errors.push(`variables[${index}]: "validation.min" (${validation.min}) must not exceed "validation.max" (${validation.max})`);
        }

        // Cross-check: enum type should have enum_values
        if (varType === 'enum' && !Object.prototype.hasOwnProperty.call(validation, 'enum_values')) {
          warnings.push(`variables[${index}]: enum type variable should declare "validation.enum_values"`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      variable_count: variables.length,
      type_breakdown: typeBreakdown
    }
  };
}

/**
 * Validates user-supplied variable values against a template variable schema.
 * Checks required fields, fills defaults, validates types and validation rules.
 * Collects ALL errors before returning (no early exit).
 *
 * @param {Array} schema - Array of variable declarations (same format as validateTemplateVariableSchema input)
 * @param {Object} values - Plain object mapping variable names to their values
 * @returns {{ valid: boolean, errors: string[], resolved: Object }}
 */
function validateTemplateVariables(schema, values) {
  const errors = [];
  const resolved = {};

  if (!Array.isArray(schema)) {
    return { valid: false, errors: ['schema must be an array'], resolved: {} };
  }

  if (!isPlainObject(values)) {
    return { valid: false, errors: ['values must be a plain object'], resolved: {} };
  }

  for (const variable of schema) {
    if (!isPlainObject(variable)) {
      continue;
    }

    const name = variable.name;
    if (typeof name !== 'string' || name.trim().length === 0) {
      continue;
    }

    const type = variable.type;
    const isRequired = variable.required === true;
    const hasDefault = Object.prototype.hasOwnProperty.call(variable, 'default') && variable.default !== undefined;
    const hasValue = Object.prototype.hasOwnProperty.call(values, name);

    // Determine the effective value
    let value;
    if (hasValue) {
      value = values[name];
    } else if (hasDefault) {
      value = variable.default;
    } else if (isRequired) {
      errors.push(`variable "${name}": required but not provided`);
      continue;
    } else {
      // Not required, no value, no default — skip
      continue;
    }

    // Store in resolved
    resolved[name] = value;

    // Type checking
    if (typeof type === 'string' && TEMPLATE_VARIABLE_TYPES.has(type)) {
      let typeValid = true;

      switch (type) {
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`variable "${name}": expected type "string" but got "${typeof value}"`);
            typeValid = false;
          }
          break;
        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            errors.push(`variable "${name}": expected type "number" but got "${typeof value}"`);
            typeValid = false;
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`variable "${name}": expected type "boolean" but got "${typeof value}"`);
            typeValid = false;
          }
          break;
        case 'enum':
          if (typeof value !== 'string') {
            errors.push(`variable "${name}": expected type "enum" (string) but got "${typeof value}"`);
            typeValid = false;
          }
          break;
        case 'array':
          if (!Array.isArray(value)) {
            errors.push(`variable "${name}": expected type "array" but got "${typeof value}"`);
            typeValid = false;
          }
          break;
      }

      // Apply validation rules only if type is valid
      if (typeValid && isPlainObject(variable.validation)) {
        const validation = variable.validation;

        // regex: test string value against regex pattern
        if (type === 'string' && typeof validation.regex === 'string') {
          try {
            const re = new RegExp(validation.regex);
            if (!re.test(value)) {
              errors.push(`variable "${name}": value "${value}" does not match regex pattern "${validation.regex}"`);
            }
          } catch (_e) {
            // Invalid regex — skip validation (schema validator should catch this)
          }
        }

        // enum_values: check value is in the set
        if (type === 'enum' && Array.isArray(validation.enum_values)) {
          if (!validation.enum_values.includes(value)) {
            errors.push(`variable "${name}": value "${value}" is not one of the allowed values (${validation.enum_values.join(', ')})`);
          }
        }

        // min/max: check number is within range
        if (type === 'number') {
          if (typeof validation.min === 'number' && value < validation.min) {
            errors.push(`variable "${name}": value ${value} is less than minimum ${validation.min}`);
          }
          if (typeof validation.max === 'number' && value > validation.max) {
            errors.push(`variable "${name}": value ${value} is greater than maximum ${validation.max}`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    resolved
  };
}

/**
 * Render template content by processing control-flow directives and variable placeholders.
 *
 * Processing order:
 *   1. {{#each items}}...{{/each}} loops
 *   2. {{#if variable}}...{{/if}} conditionals
 *   3. {{variable_name}} placeholder substitution
 *
 * Unresolved placeholders are left unchanged.
 *
 * @param {string} content - Template string content
 * @param {Object} valueMap - Resolved variable map
 * @returns {string} Rendered string
 */
function renderTemplateContent(content, valueMap) {
  if (typeof content !== 'string') {
    return '';
  }
  if (content.length === 0) {
    return '';
  }
  if (!isPlainObject(valueMap)) {
    valueMap = {};
  }

  let result = content;

  // Step 1: Process {{#each items}}...{{/each}} loops
  result = result.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, function (_match, varName, body) {
    const items = valueMap[varName];
    if (!Array.isArray(items)) {
      return '';
    }
    return items.map(function (item) {
      return body.replace(/\{\{this\}\}/g, String(item));
    }).join('');
  });

  // Step 2: Process {{#if variable}}...{{/if}} conditionals
  result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, function (_match, varName, body) {
    const value = valueMap[varName];
    // Truthy check: not null, undefined, false, 0, empty string, empty array
    if (value === null || value === undefined || value === false || value === 0 || value === '') {
      return '';
    }
    if (Array.isArray(value) && value.length === 0) {
      return '';
    }
    return body;
  });

  // Step 3: Process {{variable_name}} placeholder substitution
  // Match {{word}} but NOT {{#...}}, {{/...}}, or {{this}}
  result = result.replace(/\{\{(\w+)\}\}/g, function (match, varName) {
    if (Object.prototype.hasOwnProperty.call(valueMap, varName)) {
      return String(valueMap[varName]);
    }
    return match;
  });

  return result;
}


/**
 * Render all template files from a template directory into an output directory.
 * Validates variables first, then recursively walks the template directory,
 * renders each file using renderTemplateContent, and writes to outputDir
 * preserving the directory structure.
 *
 * @param {string} templateDir - Path to the template directory containing template files
 * @param {object} variables - Object with `schema` (array of variable declarations) and `values` (object of user values)
 * @param {string} outputDir - Path to write rendered files
 * @param {object} [fileSystem] - Optional dependency injection for fs operations (defaults to fs from fs-extra)
 * @returns {Promise<{rendered: boolean, errors: string[], files: Array<{source: string, target: string, size: number}>, summary: {total_files: number, total_bytes: number, variables_used: number}}>}
 */
async function renderTemplateFiles(templateDir, variables, outputDir, fileSystem) {
  const fsOps = fileSystem || fs;
  const errors = [];
  const files = [];

  // Validate variables first — return early if validation fails
  const schema = (variables && variables.schema) || [];
  const values = (variables && variables.values) || {};
  const validation = validateTemplateVariables(schema, values);

  if (!validation.valid) {
    return {
      rendered: false,
      errors: validation.errors,
      files: [],
      summary: {
        total_files: 0,
        total_bytes: 0,
        variables_used: 0
      }
    };
  }

  const resolvedValues = validation.resolved;
  const variablesUsed = Object.keys(resolvedValues).length;

  // Recursive directory walker
  async function walkDir(currentDir, relativeBase) {
    let entries;
    try {
      entries = await fsOps.readdir(currentDir);
    } catch (err) {
      errors.push(`Failed to read directory "${currentDir}": ${err.message}`);
      return;
    }

    for (const entry of entries) {
      const sourcePath = path.join(currentDir, entry);
      const relativePath = relativeBase ? path.join(relativeBase, entry) : entry;

      let stats;
      try {
        stats = await fsOps.stat(sourcePath);
      } catch (err) {
        errors.push(`Failed to stat "${relativePath}": ${err.message}`);
        continue;
      }

      if (stats.isDirectory()) {
        await walkDir(sourcePath, relativePath);
      } else {
        try {
          // Read the template file content
          const content = await fsOps.readFile(sourcePath, 'utf8');

          // Render the content with resolved variable values
          const rendered = renderTemplateContent(content, resolvedValues);

          // Determine the target path in the output directory
          const targetPath = path.join(outputDir, relativePath);
          const targetDir = path.dirname(targetPath);

          // Ensure the target directory exists
          await fsOps.ensureDir(targetDir);

          // Write the rendered content
          await fsOps.writeFile(targetPath, rendered, 'utf8');

          // Track the rendered file
          const size = Buffer.byteLength(rendered, 'utf8');
          files.push({
            source: relativePath,
            target: relativePath,
            size: size
          });
        } catch (err) {
          errors.push(`Failed to render file "${relativePath}": ${err.message}`);
        }
      }
    }
  }

  // Walk the template directory recursively
  try {
    await walkDir(templateDir, '');
  } catch (err) {
    errors.push(`Failed to walk template directory "${templateDir}": ${err.message}`);
  }

  const totalBytes = files.reduce(function (sum, f) { return sum + f.size; }, 0);

  return {
    rendered: errors.length === 0,
    errors: errors,
    files: files,
    summary: {
      total_files: files.length,
      total_bytes: totalBytes,
      variables_used: variablesUsed
    }
  };
}


/**
 * Resolve template inheritance by traversing the extends chain from target to root.
 * Merges variable schemas (child overrides parent by name) and template file lists
 * (child overrides parent at same relative path).
 *
 * @param {Array} registryTemplates - Array of template objects from the package registry
 * @param {string} packageName - Name of the target package to resolve
 * @returns {{ resolved: boolean, chain: string[], mergedVariables: Array, mergedFiles: Array, errors: string[] }}
 */
function resolveTemplateInheritance(registryTemplates, packageName) {
  var errors = [];

  // Build name → template lookup map
  var templateMap = {};
  if (Array.isArray(registryTemplates)) {
    for (var i = 0; i < registryTemplates.length; i++) {
      var tpl = registryTemplates[i];
      if (tpl && tpl.name) {
        templateMap[tpl.name] = tpl;
      }
    }
  }

  // Find the target package
  var target = templateMap[packageName];
  if (!target) {
    return {
      resolved: false,
      chain: [],
      mergedVariables: [],
      mergedFiles: [],
      errors: ['package "' + packageName + '" not found in registry']
    };
  }

  // Traverse the extends chain from target to root
  var chain = [];
  var visited = new Set();
  var current = target;

  while (current) {
    // Check for circular reference
    if (visited.has(current.name)) {
      // Build the cycle path for the error message
      var cyclePath = chain.map(function (name) { return name; }).join(' → ') + ' → ' + current.name;
      return {
        resolved: false,
        chain: chain,
        mergedVariables: [],
        mergedFiles: [],
        errors: ['circular inheritance detected: ' + cyclePath]
      };
    }

    visited.add(current.name);
    chain.push(current.name);

    // Check if this template extends a parent
    var parentName = (current.contract && current.contract.extends) || current.extends;
    if (!parentName) {
      break;
    }

    var parent = templateMap[parentName];
    if (!parent) {
      return {
        resolved: false,
        chain: chain,
        mergedVariables: [],
        mergedFiles: [],
        errors: ['package "' + current.name + '" extends "' + parentName + '" but "' + parentName + '" not found in registry']
      };
    }

    current = parent;
  }

  // Merge variables and files: start from root (last in chain), apply each child on top
  // chain is [target, ..., root], so we reverse to go root → ... → target
  var mergedVariableMap = {};
  var mergedFileMap = {};

  for (var ci = chain.length - 1; ci >= 0; ci--) {
    var pkg = templateMap[chain[ci]];
    if (!pkg) {
      continue;
    }

    // Merge variables — child overrides parent by variable name
    var variables = (pkg.contract && pkg.contract.variables) || pkg.variables || [];
    if (Array.isArray(variables)) {
      for (var vi = 0; vi < variables.length; vi++) {
        var variable = variables[vi];
        if (variable && variable.name) {
          mergedVariableMap[variable.name] = variable;
        }
      }
    }

    // Merge files — child overrides parent at same relative path
    var files = (pkg.contract && pkg.contract.files) || pkg.files || [];
    if (Array.isArray(files)) {
      for (var fi = 0; fi < files.length; fi++) {
        var filePath = files[fi];
        if (typeof filePath === 'string') {
          mergedFileMap[filePath] = filePath;
        }
      }
    }
  }

  // Convert merged maps to arrays
  var mergedVariables = Object.keys(mergedVariableMap).map(function (name) {
    return mergedVariableMap[name];
  });

  var mergedFiles = Object.keys(mergedFileMap).map(function (p) {
    return mergedFileMap[p];
  });

  return {
    resolved: true,
    chain: chain,
    mergedVariables: mergedVariables,
    mergedFiles: mergedFiles,
    errors: errors
  };
}

function normalizeSceneTemplateRenderOptions(options = {}) {
  return {
    package: options.package ? String(options.package).trim() : undefined,
    values: options.values ? String(options.values).trim() : undefined,
    out: options.out ? String(options.out).trim() : undefined,
    templateDir: options.templateDir ? String(options.templateDir).trim() : SCENE_PACKAGE_TEMPLATE_DEFAULT_DIR,
    json: options.json === true
  };
}

function validateSceneTemplateRenderOptions(options) {
  if (!options.package || typeof options.package !== 'string' || options.package.trim().length === 0) {
    return '--package is required';
  }

  if (!options.values || typeof options.values !== 'string' || options.values.trim().length === 0) {
    return '--values is required';
  }

  if (!options.out || typeof options.out !== 'string' || options.out.trim().length === 0) {
    return '--out is required';
  }

  return null;
}

function normalizeSceneTemplateValidateOptions(options = {}) {
  return {
    package: options.package ? String(options.package).trim() : undefined,
    json: options.json === true
  };
}

function validateSceneTemplateValidateOptions(options) {
  if (!options.package || typeof options.package !== 'string' || options.package.trim().length === 0) {
    return '--package is required';
  }

  return null;
}

function normalizeSceneTemplateResolveOptions(options = {}) {
  return {
    package: options.package ? String(options.package).trim() : undefined,
    templateDir: options.templateDir ? String(options.templateDir).trim() : SCENE_PACKAGE_TEMPLATE_DEFAULT_DIR,
    json: options.json === true
  };
}

function validateSceneTemplateResolveOptions(options) {
  if (!options.package || typeof options.package !== 'string' || options.package.trim().length === 0) {
    return '--package is required';
  }

  return null;
}

function normalizeSceneContextBridgeOptions(options = {}) {
  return {
    input: options.input ? String(options.input).trim() : undefined,
    provider: options.provider ? String(options.provider).trim().toLowerCase() : 'moqui',
    outContext: options.outContext ? String(options.outContext).trim() : undefined,
    outReport: options.outReport ? String(options.outReport).trim() : undefined,
    contextContract: options.contextContract ? String(options.contextContract).trim() : undefined,
    strictContract: options.strictContract !== false,
    json: options.json === true
  };
}

function validateSceneContextBridgeOptions(options) {
  if (!options.input || typeof options.input !== 'string' || options.input.trim().length === 0) {
    return '--input is required';
  }
  if (!['moqui', 'generic'].includes(String(options.provider || '').trim().toLowerCase())) {
    return '--provider must be one of: moqui, generic';
  }
  if (options.contextContract !== undefined && (!options.contextContract || options.contextContract.length === 0)) {
    return '--context-contract cannot be empty';
  }
  return null;
}

function normalizeSceneInteractiveFlowOptions(options = {}) {
  const feedbackScore = options.feedbackScore !== undefined ? Number(options.feedbackScore) : null;
  const matrixMinScore = options.matrixMinScore !== undefined ? Number(options.matrixMinScore) : null;
  const matrixMinValidRate = options.matrixMinValidRate !== undefined ? Number(options.matrixMinValidRate) : null;
  return {
    input: options.input ? String(options.input).trim() : undefined,
    provider: options.provider ? String(options.provider).trim().toLowerCase() : 'moqui',
    goal: options.goal ? String(options.goal).trim() : undefined,
    goalFile: options.goalFile ? String(options.goalFile).trim() : undefined,
    userId: options.userId ? String(options.userId).trim() : undefined,
    sessionId: options.sessionId ? String(options.sessionId).trim() : undefined,
    executionMode: options.executionMode ? String(options.executionMode).trim() : 'suggestion',
    businessMode: options.businessMode ? String(options.businessMode).trim().toLowerCase() : undefined,
    businessModePolicy: options.businessModePolicy ? String(options.businessModePolicy).trim() : undefined,
    allowModeOverride: options.allowModeOverride === true,
    policy: options.policy ? String(options.policy).trim() : undefined,
    catalog: options.catalog ? String(options.catalog).trim() : undefined,
    dialoguePolicy: options.dialoguePolicy ? String(options.dialoguePolicy).trim() : undefined,
    dialogueProfile: options.dialogueProfile ? String(options.dialogueProfile).trim().toLowerCase() : 'business-user',
    uiMode: options.uiMode ? String(options.uiMode).trim().toLowerCase() : undefined,
    dialogueOut: options.dialogueOut ? String(options.dialogueOut).trim() : undefined,
    runtimeMode: options.runtimeMode ? String(options.runtimeMode).trim().toLowerCase() : 'ops-fix',
    runtimeEnvironment: options.runtimeEnvironment ? String(options.runtimeEnvironment).trim().toLowerCase() : 'staging',
    runtimePolicy: options.runtimePolicy ? String(options.runtimePolicy).trim() : undefined,
    runtimeOut: options.runtimeOut ? String(options.runtimeOut).trim() : undefined,
    authorizationTierPolicy: options.authorizationTierPolicy ? String(options.authorizationTierPolicy).trim() : undefined,
    authorizationTierOut: options.authorizationTierOut ? String(options.authorizationTierOut).trim() : undefined,
    contextContract: options.contextContract ? String(options.contextContract).trim() : undefined,
    strictContract: options.strictContract !== false,
    moquiConfig: options.moquiConfig ? String(options.moquiConfig).trim() : undefined,
    outDir: options.outDir ? String(options.outDir).trim() : undefined,
    out: options.out ? String(options.out).trim() : undefined,
    loopOut: options.loopOut ? String(options.loopOut).trim() : undefined,
    workOrderOut: options.workOrderOut ? String(options.workOrderOut).trim() : undefined,
    workOrderMarkdownOut: options.workOrderMarkdownOut ? String(options.workOrderMarkdownOut).trim() : undefined,
    bridgeOutContext: options.bridgeOutContext ? String(options.bridgeOutContext).trim() : undefined,
    bridgeOutReport: options.bridgeOutReport ? String(options.bridgeOutReport).trim() : undefined,
    approvalActor: options.approvalActor ? String(options.approvalActor).trim() : undefined,
    approvalActorRole: options.approvalActorRole ? String(options.approvalActorRole).trim().toLowerCase() : undefined,
    approverActor: options.approverActor ? String(options.approverActor).trim() : undefined,
    approverActorRole: options.approverActorRole ? String(options.approverActorRole).trim().toLowerCase() : undefined,
    approvalRolePolicy: options.approvalRolePolicy ? String(options.approvalRolePolicy).trim() : undefined,
    skipSubmit: options.skipSubmit === true,
    autoApproveLowRisk: options.autoApproveLowRisk === true,
    autoExecuteLowRisk: options.autoExecuteLowRisk === true,
    allowSuggestionApply: options.allowSuggestionApply === true,
    liveApply: options.liveApply === true,
    dryRun: options.dryRun !== false,
    feedbackScore,
    feedbackComment: options.feedbackComment ? String(options.feedbackComment).trim() : undefined,
    feedbackTags: options.feedbackTags ? String(options.feedbackTags).trim() : undefined,
    feedbackChannel: options.feedbackChannel ? String(options.feedbackChannel).trim().toLowerCase() : 'ui',
    authPassword: options.authPassword != null ? String(options.authPassword) : undefined,
    authPasswordHash: options.authPasswordHash ? String(options.authPasswordHash).trim().toLowerCase() : undefined,
    authPasswordEnv: options.authPasswordEnv ? String(options.authPasswordEnv).trim() : undefined,
    failOnDialogueDeny: options.failOnDialogueDeny === true,
    failOnGateDeny: options.failOnGateDeny === true,
    failOnGateNonAllow: options.failOnGateNonAllow === true,
    failOnRuntimeNonAllow: options.failOnRuntimeNonAllow === true,
    failOnExecuteBlocked: options.failOnExecuteBlocked === true,
    matrix: options.matrix !== false,
    matrixTemplateDir: options.matrixTemplateDir ? String(options.matrixTemplateDir).trim() : undefined,
    matrixMatch: options.matrixMatch ? String(options.matrixMatch).trim() : undefined,
    matrixIncludeAll: options.matrixIncludeAll === true,
    matrixMinScore,
    matrixMinValidRate,
    matrixCompareWith: options.matrixCompareWith ? String(options.matrixCompareWith).trim() : undefined,
    matrixOut: options.matrixOut ? String(options.matrixOut).trim() : undefined,
    matrixMarkdownOut: options.matrixMarkdownOut ? String(options.matrixMarkdownOut).trim() : undefined,
    matrixSignals: options.matrixSignals ? String(options.matrixSignals).trim() : undefined,
    matrixFailOnPortfolioFail: options.matrixFailOnPortfolioFail === true,
    matrixFailOnRegression: options.matrixFailOnRegression === true,
    matrixFailOnError: options.matrixFailOnError === true,
    json: options.json === true
  };
}

function validateSceneInteractiveFlowOptions(options) {
  if (!options.input || typeof options.input !== 'string' || options.input.trim().length === 0) {
    return '--input is required';
  }
  if (!['moqui', 'generic'].includes(String(options.provider || '').trim().toLowerCase())) {
    return '--provider must be one of: moqui, generic';
  }
  if ((!options.goal || options.goal.length === 0) && (!options.goalFile || options.goalFile.length === 0)) {
    return 'either --goal or --goal-file is required';
  }
  if (!['suggestion', 'apply'].includes(String(options.executionMode || '').trim())) {
    return '--execution-mode must be suggestion or apply';
  }
  if (
    options.businessMode !== undefined &&
    !['user-mode', 'ops-mode', 'dev-mode'].includes(String(options.businessMode).trim().toLowerCase())
  ) {
    return '--business-mode must be one of: user-mode, ops-mode, dev-mode';
  }
  const dialogueProfile = String(options.dialogueProfile || 'business-user').trim().toLowerCase();
  if (!['business-user', 'system-maintainer'].includes(dialogueProfile)) {
    return '--dialogue-profile must be one of: business-user, system-maintainer';
  }
  if (options.uiMode !== undefined && !['user-app', 'ops-console'].includes(String(options.uiMode).trim().toLowerCase())) {
    return '--ui-mode must be one of: user-app, ops-console';
  }
  if (!['user-assist', 'ops-fix', 'feature-dev'].includes(String(options.runtimeMode || '').trim().toLowerCase())) {
    return '--runtime-mode must be one of: user-assist, ops-fix, feature-dev';
  }
  if (!['dev', 'staging', 'prod'].includes(String(options.runtimeEnvironment || '').trim().toLowerCase())) {
    return '--runtime-environment must be one of: dev, staging, prod';
  }
  if (options.contextContract !== undefined && (!options.contextContract || options.contextContract.length === 0)) {
    return '--context-contract cannot be empty';
  }
  if (options.feedbackScore !== null) {
    if (!Number.isFinite(options.feedbackScore) || options.feedbackScore < 0 || options.feedbackScore > 5) {
      return '--feedback-score must be a number between 0 and 5';
    }
  }
  const feedbackChannel = String(options.feedbackChannel || '').trim().toLowerCase();
  if (!['ui', 'cli', 'api', 'other'].includes(feedbackChannel)) {
    return '--feedback-channel must be one of: ui, cli, api, other';
  }
  if (options.authPasswordHash !== undefined && !/^[a-f0-9]{64}$/i.test(options.authPasswordHash)) {
    return '--auth-password-hash must be a sha256 hex string (64 chars)';
  }
  if (options.authPasswordEnv !== undefined && String(options.authPasswordEnv).trim().length === 0) {
    return '--auth-password-env cannot be empty';
  }
  if (options.matrixMinScore != null) {
    if (!Number.isFinite(options.matrixMinScore) || options.matrixMinScore < 0 || options.matrixMinScore > 100) {
      return '--matrix-min-score must be a number between 0 and 100';
    }
  }
  if (options.matrixMinValidRate != null) {
    if (!Number.isFinite(options.matrixMinValidRate) || options.matrixMinValidRate < 0 || options.matrixMinValidRate > 100) {
      return '--matrix-min-valid-rate must be a number between 0 and 100';
    }
  }
  return null;
}

function normalizeSceneInteractiveLoopOptions(options = {}) {
  const feedbackScore = options.feedbackScore !== undefined ? Number(options.feedbackScore) : null;
  return {
    context: options.context ? String(options.context).trim() : undefined,
    goal: options.goal ? String(options.goal).trim() : undefined,
    goalFile: options.goalFile ? String(options.goalFile).trim() : undefined,
    userId: options.userId ? String(options.userId).trim() : undefined,
    sessionId: options.sessionId ? String(options.sessionId).trim() : undefined,
    executionMode: options.executionMode ? String(options.executionMode).trim() : 'suggestion',
    businessMode: options.businessMode ? String(options.businessMode).trim().toLowerCase() : undefined,
    businessModePolicy: options.businessModePolicy ? String(options.businessModePolicy).trim() : undefined,
    allowModeOverride: options.allowModeOverride === true,
    policy: options.policy ? String(options.policy).trim() : undefined,
    catalog: options.catalog ? String(options.catalog).trim() : undefined,
    dialoguePolicy: options.dialoguePolicy ? String(options.dialoguePolicy).trim() : undefined,
    dialogueProfile: options.dialogueProfile ? String(options.dialogueProfile).trim().toLowerCase() : 'business-user',
    uiMode: options.uiMode ? String(options.uiMode).trim().toLowerCase() : undefined,
    dialogueOut: options.dialogueOut ? String(options.dialogueOut).trim() : undefined,
    runtimeMode: options.runtimeMode ? String(options.runtimeMode).trim().toLowerCase() : 'ops-fix',
    runtimeEnvironment: options.runtimeEnvironment ? String(options.runtimeEnvironment).trim().toLowerCase() : 'staging',
    runtimePolicy: options.runtimePolicy ? String(options.runtimePolicy).trim() : undefined,
    runtimeOut: options.runtimeOut ? String(options.runtimeOut).trim() : undefined,
    authorizationTierPolicy: options.authorizationTierPolicy ? String(options.authorizationTierPolicy).trim() : undefined,
    authorizationTierOut: options.authorizationTierOut ? String(options.authorizationTierOut).trim() : undefined,
    contextContract: options.contextContract ? String(options.contextContract).trim() : undefined,
    strictContract: options.strictContract !== false,
    moquiConfig: options.moquiConfig ? String(options.moquiConfig).trim() : undefined,
    outDir: options.outDir ? String(options.outDir).trim() : undefined,
    out: options.out ? String(options.out).trim() : undefined,
    workOrderOut: options.workOrderOut ? String(options.workOrderOut).trim() : undefined,
    workOrderMarkdownOut: options.workOrderMarkdownOut ? String(options.workOrderMarkdownOut).trim() : undefined,
    approvalActor: options.approvalActor ? String(options.approvalActor).trim() : undefined,
    approvalActorRole: options.approvalActorRole ? String(options.approvalActorRole).trim().toLowerCase() : undefined,
    approverActor: options.approverActor ? String(options.approverActor).trim() : undefined,
    approverActorRole: options.approverActorRole ? String(options.approverActorRole).trim().toLowerCase() : undefined,
    approvalRolePolicy: options.approvalRolePolicy ? String(options.approvalRolePolicy).trim() : undefined,
    skipSubmit: options.skipSubmit === true,
    autoApproveLowRisk: options.autoApproveLowRisk === true,
    autoExecuteLowRisk: options.autoExecuteLowRisk === true,
    allowSuggestionApply: options.allowSuggestionApply === true,
    liveApply: options.liveApply === true,
    dryRun: options.dryRun !== false,
    feedbackScore,
    feedbackComment: options.feedbackComment ? String(options.feedbackComment).trim() : undefined,
    feedbackTags: options.feedbackTags ? String(options.feedbackTags).trim() : undefined,
    feedbackChannel: options.feedbackChannel ? String(options.feedbackChannel).trim().toLowerCase() : 'ui',
    authPassword: options.authPassword != null ? String(options.authPassword) : undefined,
    authPasswordHash: options.authPasswordHash ? String(options.authPasswordHash).trim().toLowerCase() : undefined,
    authPasswordEnv: options.authPasswordEnv ? String(options.authPasswordEnv).trim() : undefined,
    failOnDialogueDeny: options.failOnDialogueDeny === true,
    failOnGateDeny: options.failOnGateDeny === true,
    failOnGateNonAllow: options.failOnGateNonAllow === true,
    failOnRuntimeNonAllow: options.failOnRuntimeNonAllow === true,
    failOnExecuteBlocked: options.failOnExecuteBlocked === true,
    json: options.json === true
  };
}

function validateSceneInteractiveLoopOptions(options) {
  if (!options.context || typeof options.context !== 'string' || options.context.trim().length === 0) {
    return '--context is required';
  }
  if ((!options.goal || options.goal.length === 0) && (!options.goalFile || options.goalFile.length === 0)) {
    return 'either --goal or --goal-file is required';
  }
  if (!['suggestion', 'apply'].includes(String(options.executionMode || '').trim())) {
    return '--execution-mode must be suggestion or apply';
  }
  if (
    options.businessMode !== undefined &&
    !['user-mode', 'ops-mode', 'dev-mode'].includes(String(options.businessMode).trim().toLowerCase())
  ) {
    return '--business-mode must be one of: user-mode, ops-mode, dev-mode';
  }
  const dialogueProfile = String(options.dialogueProfile || 'business-user').trim().toLowerCase();
  if (!['business-user', 'system-maintainer'].includes(dialogueProfile)) {
    return '--dialogue-profile must be one of: business-user, system-maintainer';
  }
  if (options.uiMode !== undefined && !['user-app', 'ops-console'].includes(String(options.uiMode).trim().toLowerCase())) {
    return '--ui-mode must be one of: user-app, ops-console';
  }
  if (!['user-assist', 'ops-fix', 'feature-dev'].includes(String(options.runtimeMode || '').trim().toLowerCase())) {
    return '--runtime-mode must be one of: user-assist, ops-fix, feature-dev';
  }
  if (!['dev', 'staging', 'prod'].includes(String(options.runtimeEnvironment || '').trim().toLowerCase())) {
    return '--runtime-environment must be one of: dev, staging, prod';
  }
  if (options.contextContract !== undefined && (!options.contextContract || options.contextContract.length === 0)) {
    return '--context-contract cannot be empty';
  }
  if (options.feedbackScore !== null) {
    if (!Number.isFinite(options.feedbackScore) || options.feedbackScore < 0 || options.feedbackScore > 5) {
      return '--feedback-score must be a number between 0 and 5';
    }
  }
  const feedbackChannel = String(options.feedbackChannel || '').trim().toLowerCase();
  if (!['ui', 'cli', 'api', 'other'].includes(feedbackChannel)) {
    return '--feedback-channel must be one of: ui, cli, api, other';
  }
  if (options.authPasswordHash !== undefined && !/^[a-f0-9]{64}$/i.test(options.authPasswordHash)) {
    return '--auth-password-hash must be a sha256 hex string (64 chars)';
  }
  if (options.authPasswordEnv !== undefined && String(options.authPasswordEnv).trim().length === 0) {
    return '--auth-password-env cannot be empty';
  }
  return null;
}

function normalizeSceneMoquiBaselineOptions(options = {}) {
  const minScore = Number(options.minScore);
  const minValidRate = Number(options.minValidRate);
  return {
    templateDir: options.templateDir ? String(options.templateDir).trim() : SCENE_PACKAGE_TEMPLATE_DEFAULT_DIR,
    out: options.out ? String(options.out).trim() : '.sce/reports/moqui-template-baseline.json',
    markdownOut: options.markdownOut ? String(options.markdownOut).trim() : '.sce/reports/moqui-template-baseline.md',
    match: options.match ? String(options.match).trim() : SCENE_MOQUI_BASELINE_DEFAULT_MATCH,
    includeAll: options.includeAll === true,
    minScore: Number.isFinite(minScore) ? minScore : SCENE_MOQUI_BASELINE_DEFAULT_MIN_SCORE,
    minValidRate: Number.isFinite(minValidRate) ? minValidRate : SCENE_MOQUI_BASELINE_DEFAULT_MIN_VALID_RATE,
    compareWith: options.compareWith ? String(options.compareWith).trim() : undefined,
    failOnPortfolioFail: options.failOnPortfolioFail === true,
    json: options.json === true
  };
}

function validateSceneMoquiBaselineOptions(options) {
  if (!options.templateDir || typeof options.templateDir !== 'string' || options.templateDir.trim().length === 0) {
    return '--template-dir is required';
  }
  if (!options.out || typeof options.out !== 'string' || options.out.trim().length === 0) {
    return '--out is required';
  }
  if (!options.markdownOut || typeof options.markdownOut !== 'string' || options.markdownOut.trim().length === 0) {
    return '--markdown-out is required';
  }
  if (!options.match || typeof options.match !== 'string' || options.match.trim().length === 0) {
    return '--match is required';
  }
  if (!Number.isFinite(Number(options.minScore)) || Number(options.minScore) < 0 || Number(options.minScore) > 100) {
    return '--min-score must be a number between 0 and 100';
  }
  if (!Number.isFinite(Number(options.minValidRate)) || Number(options.minValidRate) < 0 || Number(options.minValidRate) > 100) {
    return '--min-valid-rate must be a number between 0 and 100';
  }
  if (options.compareWith !== undefined && (!options.compareWith || options.compareWith.length === 0)) {
    return '--compare-with cannot be empty';
  }
  return null;
}

// --- Print functions for template commands ---

function printSceneTemplateValidateSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const statusLabel = payload.valid ? chalk.green('valid') : chalk.red('invalid');
  console.log(chalk.blue('Scene Template Validate'));
  console.log(`  Status: ${statusLabel}`);
  console.log(`  Package: ${chalk.gray(payload.package_path || 'unknown')}`);

  if (payload.summary) {
    console.log(`  Variables: ${payload.summary.variable_count}`);
    if (payload.summary.type_breakdown) {
      const breakdown = Object.entries(payload.summary.type_breakdown)
        .map(([type, count]) => `${type}=${count}`)
        .join(', ');
      if (breakdown) {
        console.log(`  Types: ${breakdown}`);
      }
    }
  }

  if (Array.isArray(payload.contract_errors) && payload.contract_errors.length > 0) {
    console.log(chalk.red('  Contract Errors:'));
    for (const error of payload.contract_errors) {
      console.log(`    - ${error}`);
    }
  }

  if (Array.isArray(payload.schema_errors) && payload.schema_errors.length > 0) {
    console.log(chalk.red('  Schema Errors:'));
    for (const error of payload.schema_errors) {
      console.log(`    - ${error}`);
    }
  }

  if (Array.isArray(payload.warnings) && payload.warnings.length > 0) {
    console.log(chalk.yellow('  Warnings:'));
    for (const warning of payload.warnings) {
      console.log(`    - ${warning}`);
    }
  }
}

function printSceneTemplateResolveSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const statusLabel = payload.resolved ? chalk.green('resolved') : chalk.red('failed');
  console.log(chalk.blue('Scene Template Resolve'));
  console.log(`  Status: ${statusLabel}`);
  console.log(`  Package: ${payload.package_name || 'unknown'}`);

  if (Array.isArray(payload.chain) && payload.chain.length > 0) {
    console.log(`  Chain: ${payload.chain.join(' → ')}`);
  }

  if (Array.isArray(payload.mergedVariables)) {
    console.log(`  Merged Variables: ${payload.mergedVariables.length}`);
  }

  if (Array.isArray(payload.mergedFiles)) {
    console.log(`  Merged Files: ${payload.mergedFiles.length}`);
  }

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    console.log(chalk.red('  Errors:'));
    for (const error of payload.errors) {
      console.log(`    - ${error}`);
    }
  }
}

function printSceneTemplateRenderSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const statusLabel = payload.rendered ? chalk.green('rendered') : chalk.red('failed');
  console.log(chalk.blue('Scene Template Render'));
  console.log(`  Status: ${statusLabel}`);
  console.log(`  Package: ${payload.package_name || 'unknown'}`);

  if (payload.output_dir) {
    console.log(`  Output: ${chalk.gray(resolvePath(projectRoot, payload.output_dir))}`);
  }

  if (payload.summary) {
    console.log(`  Files: ${payload.summary.total_files}`);
    console.log(`  Bytes: ${payload.summary.total_bytes}`);
    console.log(`  Variables: ${payload.summary.variables_used}`);
  }

  if (Array.isArray(payload.files) && payload.files.length > 0) {
    console.log('  Rendered Files:');
    for (const file of payload.files) {
      console.log(`    - ${file.source} (${file.size} bytes)`);
    }
  }

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    console.log(chalk.red('  Errors:'));
    for (const error of payload.errors) {
      console.log(`    - ${error}`);
    }
  }
}

// --- Command runners for template commands ---

async function runSceneContextBridgeCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneContextBridgeOptions(rawOptions);
  const validationError = validateSceneContextBridgeOptions(options);
  if (validationError) {
    console.error(chalk.red(`Scene context-bridge failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const scriptPath = path.join(projectRoot, 'scripts', 'interactive-context-bridge.js');
  const scriptExists = await fileSystem.pathExists(scriptPath);
  if (!scriptExists) {
    console.error(chalk.red(`Scene context-bridge failed: script not found at ${scriptPath}`));
    process.exitCode = 1;
    return null;
  }

  const args = [scriptPath, '--input', options.input, '--provider', options.provider];
  if (options.outContext) {
    args.push('--out-context', options.outContext);
  }
  if (options.outReport) {
    args.push('--out-report', options.outReport);
  }
  if (options.contextContract) {
    args.push('--context-contract', options.contextContract);
  }
  if (!options.strictContract) {
    args.push('--no-strict-contract');
  }
  if (options.json) {
    args.push('--json');
  }

  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    encoding: 'utf8'
  });

  if (typeof result.stdout === 'string' && result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }
  if (typeof result.stderr === 'string' && result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    console.error(chalk.red(`Scene context-bridge failed: ${result.error.message}`));
    process.exitCode = 1;
    return null;
  }

  const exitCode = Number.isInteger(result.status) ? result.status : 1;
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }

  if (options.json && typeof result.stdout === 'string' && result.stdout.trim().length > 0) {
    try {
      return JSON.parse(result.stdout);
    } catch (_error) {
      return null;
    }
  }

  return null;
}

async function runSceneInteractiveFlowCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneInteractiveFlowOptions(rawOptions);
  const validationError = validateSceneInteractiveFlowOptions(options);
  if (validationError) {
    console.error(chalk.red(`Scene interactive-flow failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const scriptPath = path.join(projectRoot, 'scripts', 'interactive-flow.js');
  const scriptExists = await fileSystem.pathExists(scriptPath);
  if (!scriptExists) {
    console.error(chalk.red(`Scene interactive-flow failed: script not found at ${scriptPath}`));
    process.exitCode = 1;
    return null;
  }

  const args = [scriptPath, '--input', options.input, '--provider', options.provider];
  if (options.goal) {
    args.push('--goal', options.goal);
  } else if (options.goalFile) {
    args.push('--goal-file', options.goalFile);
  }
  args.push('--execution-mode', options.executionMode);
  if (options.businessMode) {
    args.push('--business-mode', options.businessMode);
  }
  if (options.businessModePolicy) {
    args.push('--business-mode-policy', options.businessModePolicy);
  }
  if (options.allowModeOverride) {
    args.push('--allow-mode-override');
  }
  if (options.userId) {
    args.push('--user-id', options.userId);
  }
  if (options.sessionId) {
    args.push('--session-id', options.sessionId);
  }
  if (options.policy) {
    args.push('--policy', options.policy);
  }
  if (options.catalog) {
    args.push('--catalog', options.catalog);
  }
  if (options.dialoguePolicy) {
    args.push('--dialogue-policy', options.dialoguePolicy);
  }
  if (options.dialogueProfile) {
    args.push('--dialogue-profile', options.dialogueProfile);
  }
  if (options.uiMode) {
    args.push('--ui-mode', options.uiMode);
  }
  if (options.dialogueOut) {
    args.push('--dialogue-out', options.dialogueOut);
  }
  if (options.runtimeMode) {
    args.push('--runtime-mode', options.runtimeMode);
  }
  if (options.runtimeEnvironment) {
    args.push('--runtime-environment', options.runtimeEnvironment);
  }
  if (options.runtimePolicy) {
    args.push('--runtime-policy', options.runtimePolicy);
  }
  if (options.runtimeOut) {
    args.push('--runtime-out', options.runtimeOut);
  }
  if (options.authorizationTierPolicy) {
    args.push('--authorization-tier-policy', options.authorizationTierPolicy);
  }
  if (options.authorizationTierOut) {
    args.push('--authorization-tier-out', options.authorizationTierOut);
  }
  if (options.contextContract) {
    args.push('--context-contract', options.contextContract);
  }
  if (!options.strictContract) {
    args.push('--no-strict-contract');
  }
  if (options.moquiConfig) {
    args.push('--moqui-config', options.moquiConfig);
  }
  if (options.outDir) {
    args.push('--out-dir', options.outDir);
  }
  if (options.bridgeOutContext) {
    args.push('--bridge-out-context', options.bridgeOutContext);
  }
  if (options.bridgeOutReport) {
    args.push('--bridge-out-report', options.bridgeOutReport);
  }
  if (options.loopOut) {
    args.push('--loop-out', options.loopOut);
  }
  if (options.workOrderOut) {
    args.push('--work-order-out', options.workOrderOut);
  }
  if (options.workOrderMarkdownOut) {
    args.push('--work-order-markdown-out', options.workOrderMarkdownOut);
  }
  if (options.out) {
    args.push('--out', options.out);
  }
  if (options.approvalActor) {
    args.push('--approval-actor', options.approvalActor);
  }
  if (options.approvalActorRole) {
    args.push('--approval-actor-role', options.approvalActorRole);
  }
  if (options.approverActor) {
    args.push('--approver-actor', options.approverActor);
  }
  if (options.approverActorRole) {
    args.push('--approver-actor-role', options.approverActorRole);
  }
  if (options.approvalRolePolicy) {
    args.push('--approval-role-policy', options.approvalRolePolicy);
  }
  if (options.skipSubmit) {
    args.push('--skip-submit');
  }
  if (options.autoApproveLowRisk) {
    args.push('--auto-approve-low-risk');
  }
  if (options.autoExecuteLowRisk) {
    args.push('--auto-execute-low-risk');
  }
  if (options.allowSuggestionApply) {
    args.push('--allow-suggestion-apply');
  }
  if (options.liveApply) {
    args.push('--live-apply');
  }
  if (!options.dryRun) {
    args.push('--no-dry-run');
  }
  if (options.feedbackScore !== null) {
    args.push('--feedback-score', String(options.feedbackScore));
  }
  if (options.feedbackComment) {
    args.push('--feedback-comment', options.feedbackComment);
  }
  if (options.feedbackTags) {
    args.push('--feedback-tags', options.feedbackTags);
  }
  if (options.feedbackChannel) {
    args.push('--feedback-channel', options.feedbackChannel);
  }
  if (options.authPassword) {
    args.push('--auth-password', options.authPassword);
  }
  if (options.authPasswordHash) {
    args.push('--auth-password-hash', options.authPasswordHash);
  }
  if (options.authPasswordEnv) {
    args.push('--auth-password-env', options.authPasswordEnv);
  }
  if (options.failOnDialogueDeny) {
    args.push('--fail-on-dialogue-deny');
  }
  if (options.failOnGateDeny) {
    args.push('--fail-on-gate-deny');
  }
  if (options.failOnGateNonAllow) {
    args.push('--fail-on-gate-non-allow');
  }
  if (options.failOnRuntimeNonAllow) {
    args.push('--fail-on-runtime-non-allow');
  }
  if (options.failOnExecuteBlocked) {
    args.push('--fail-on-execute-blocked');
  }
  if (!options.matrix) {
    args.push('--no-matrix');
  }
  if (options.matrixTemplateDir) {
    args.push('--matrix-template-dir', options.matrixTemplateDir);
  }
  if (options.matrixMatch) {
    args.push('--matrix-match', options.matrixMatch);
  }
  if (options.matrixIncludeAll) {
    args.push('--matrix-include-all');
  }
  if (options.matrixMinScore !== null) {
    args.push('--matrix-min-score', String(options.matrixMinScore));
  }
  if (options.matrixMinValidRate !== null) {
    args.push('--matrix-min-valid-rate', String(options.matrixMinValidRate));
  }
  if (options.matrixCompareWith) {
    args.push('--matrix-compare-with', options.matrixCompareWith);
  }
  if (options.matrixOut) {
    args.push('--matrix-out', options.matrixOut);
  }
  if (options.matrixMarkdownOut) {
    args.push('--matrix-markdown-out', options.matrixMarkdownOut);
  }
  if (options.matrixSignals) {
    args.push('--matrix-signals', options.matrixSignals);
  }
  if (options.matrixFailOnPortfolioFail) {
    args.push('--matrix-fail-on-portfolio-fail');
  }
  if (options.matrixFailOnRegression) {
    args.push('--matrix-fail-on-regression');
  }
  if (options.matrixFailOnError) {
    args.push('--matrix-fail-on-error');
  }
  if (options.json) {
    args.push('--json');
  }

  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    encoding: 'utf8'
  });

  if (typeof result.stdout === 'string' && result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }
  if (typeof result.stderr === 'string' && result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    console.error(chalk.red(`Scene interactive-flow failed: ${result.error.message}`));
    process.exitCode = 1;
    return null;
  }

  const exitCode = Number.isInteger(result.status) ? result.status : 1;
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }

  if (options.json && typeof result.stdout === 'string' && result.stdout.trim().length > 0) {
    try {
      return JSON.parse(result.stdout);
    } catch (_error) {
      return null;
    }
  }

  return null;
}

async function runSceneInteractiveLoopCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneInteractiveLoopOptions(rawOptions);
  const validationError = validateSceneInteractiveLoopOptions(options);
  if (validationError) {
    console.error(chalk.red(`Scene interactive-loop failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const scriptPath = path.join(projectRoot, 'scripts', 'interactive-customization-loop.js');
  const scriptExists = await fileSystem.pathExists(scriptPath);
  if (!scriptExists) {
    console.error(chalk.red(`Scene interactive-loop failed: script not found at ${scriptPath}`));
    process.exitCode = 1;
    return null;
  }

  const args = [scriptPath];
  args.push('--context', options.context);
  if (options.goal) {
    args.push('--goal', options.goal);
  } else if (options.goalFile) {
    args.push('--goal-file', options.goalFile);
  }
  args.push('--execution-mode', options.executionMode);
  if (options.businessMode) {
    args.push('--business-mode', options.businessMode);
  }
  if (options.businessModePolicy) {
    args.push('--business-mode-policy', options.businessModePolicy);
  }
  if (options.allowModeOverride) {
    args.push('--allow-mode-override');
  }
  if (options.userId) {
    args.push('--user-id', options.userId);
  }
  if (options.sessionId) {
    args.push('--session-id', options.sessionId);
  }
  if (options.policy) {
    args.push('--policy', options.policy);
  }
  if (options.catalog) {
    args.push('--catalog', options.catalog);
  }
  if (options.dialoguePolicy) {
    args.push('--dialogue-policy', options.dialoguePolicy);
  }
  if (options.dialogueProfile) {
    args.push('--dialogue-profile', options.dialogueProfile);
  }
  if (options.uiMode) {
    args.push('--ui-mode', options.uiMode);
  }
  if (options.dialogueOut) {
    args.push('--dialogue-out', options.dialogueOut);
  }
  if (options.runtimeMode) {
    args.push('--runtime-mode', options.runtimeMode);
  }
  if (options.runtimeEnvironment) {
    args.push('--runtime-environment', options.runtimeEnvironment);
  }
  if (options.runtimePolicy) {
    args.push('--runtime-policy', options.runtimePolicy);
  }
  if (options.runtimeOut) {
    args.push('--runtime-out', options.runtimeOut);
  }
  if (options.authorizationTierPolicy) {
    args.push('--authorization-tier-policy', options.authorizationTierPolicy);
  }
  if (options.authorizationTierOut) {
    args.push('--authorization-tier-out', options.authorizationTierOut);
  }
  if (options.contextContract) {
    args.push('--context-contract', options.contextContract);
  }
  if (!options.strictContract) {
    args.push('--no-strict-contract');
  }
  if (options.moquiConfig) {
    args.push('--moqui-config', options.moquiConfig);
  }
  if (options.outDir) {
    args.push('--out-dir', options.outDir);
  }
  if (options.out) {
    args.push('--out', options.out);
  }
  if (options.workOrderOut) {
    args.push('--work-order-out', options.workOrderOut);
  }
  if (options.workOrderMarkdownOut) {
    args.push('--work-order-markdown-out', options.workOrderMarkdownOut);
  }
  if (options.approvalActor) {
    args.push('--approval-actor', options.approvalActor);
  }
  if (options.approvalActorRole) {
    args.push('--approval-actor-role', options.approvalActorRole);
  }
  if (options.approverActor) {
    args.push('--approver-actor', options.approverActor);
  }
  if (options.approverActorRole) {
    args.push('--approver-actor-role', options.approverActorRole);
  }
  if (options.approvalRolePolicy) {
    args.push('--approval-role-policy', options.approvalRolePolicy);
  }
  if (options.skipSubmit) {
    args.push('--skip-submit');
  }
  if (options.autoApproveLowRisk) {
    args.push('--auto-approve-low-risk');
  }
  if (options.autoExecuteLowRisk) {
    args.push('--auto-execute-low-risk');
  }
  if (options.allowSuggestionApply) {
    args.push('--allow-suggestion-apply');
  }
  if (options.liveApply) {
    args.push('--live-apply');
  }
  if (!options.dryRun) {
    args.push('--no-dry-run');
  }
  if (options.feedbackScore !== null) {
    args.push('--feedback-score', String(options.feedbackScore));
  }
  if (options.feedbackComment) {
    args.push('--feedback-comment', options.feedbackComment);
  }
  if (options.feedbackTags) {
    args.push('--feedback-tags', options.feedbackTags);
  }
  if (options.feedbackChannel) {
    args.push('--feedback-channel', options.feedbackChannel);
  }
  if (options.authPassword) {
    args.push('--auth-password', options.authPassword);
  }
  if (options.authPasswordHash) {
    args.push('--auth-password-hash', options.authPasswordHash);
  }
  if (options.authPasswordEnv) {
    args.push('--auth-password-env', options.authPasswordEnv);
  }
  if (options.failOnDialogueDeny) {
    args.push('--fail-on-dialogue-deny');
  }
  if (options.failOnGateDeny) {
    args.push('--fail-on-gate-deny');
  }
  if (options.failOnGateNonAllow) {
    args.push('--fail-on-gate-non-allow');
  }
  if (options.failOnRuntimeNonAllow) {
    args.push('--fail-on-runtime-non-allow');
  }
  if (options.failOnExecuteBlocked) {
    args.push('--fail-on-execute-blocked');
  }
  if (options.json) {
    args.push('--json');
  }

  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    encoding: 'utf8'
  });

  if (typeof result.stdout === 'string' && result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }
  if (typeof result.stderr === 'string' && result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    console.error(chalk.red(`Scene interactive-loop failed: ${result.error.message}`));
    process.exitCode = 1;
    return null;
  }

  const exitCode = Number.isInteger(result.status) ? result.status : 1;
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }

  if (options.json && typeof result.stdout === 'string' && result.stdout.trim().length > 0) {
    try {
      return JSON.parse(result.stdout);
    } catch (_error) {
      return null;
    }
  }

  return null;
}

async function runSceneMoquiBaselineCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneMoquiBaselineOptions(rawOptions);
  const validationError = validateSceneMoquiBaselineOptions(options);
  if (validationError) {
    console.error(chalk.red(`Scene moqui-baseline failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const scriptPath = path.join(projectRoot, 'scripts', 'moqui-template-baseline-report.js');
  const scriptExists = await fileSystem.pathExists(scriptPath);
  if (!scriptExists) {
    console.error(chalk.red(`Scene moqui-baseline failed: script not found at ${scriptPath}`));
    process.exitCode = 1;
    return null;
  }

  const args = [scriptPath];
  args.push('--template-dir', options.templateDir);
  args.push('--out', options.out);
  args.push('--markdown-out', options.markdownOut);
  args.push('--match', options.match);
  args.push('--min-score', String(options.minScore));
  args.push('--min-valid-rate', String(options.minValidRate));
  if (options.includeAll) {
    args.push('--include-all');
  }
  if (options.compareWith) {
    args.push('--compare-with', options.compareWith);
  }
  if (options.failOnPortfolioFail) {
    args.push('--fail-on-portfolio-fail');
  }
  if (options.json) {
    args.push('--json');
  }

  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    encoding: 'utf8'
  });

  if (typeof result.stdout === 'string' && result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }
  if (typeof result.stderr === 'string' && result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    console.error(chalk.red(`Scene moqui-baseline failed: ${result.error.message}`));
    process.exitCode = 1;
    return null;
  }

  const exitCode = Number.isInteger(result.status) ? result.status : 1;
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }

  if (options.json && typeof result.stdout === 'string' && result.stdout.trim().length > 0) {
    try {
      return JSON.parse(result.stdout);
    } catch (_error) {
      return null;
    }
  }

  return null;
}

async function runSceneTemplateValidateCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneTemplateValidateOptions(rawOptions);
  const validationError = validateSceneTemplateValidateOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene template validate failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);

  try {
    // Resolve the package path — if it's a directory, append scene-package.json
    let packagePath = resolvePath(projectRoot, options.package);
    try {
      const stats = await fileSystem.stat(packagePath);
      if (stats.isDirectory()) {
        packagePath = path.join(packagePath, 'scene-package.json');
      }
    } catch (_e) {
      // If stat fails, try as-is (readJson will throw a better error)
    }

    const packageContract = await readJson(packagePath);

    // Run contract validation first (reuse existing infrastructure per Req 9.2)
    const contractValidation = validateScenePackageContract(packageContract);

    // Run schema validation on the variables field
    const variables = (packageContract.contract && packageContract.contract.variables)
      || packageContract.variables
      || [];
    const schemaValidation = validateTemplateVariableSchema(variables);

    const allValid = contractValidation.valid && schemaValidation.valid;

    const payload = {
      valid: allValid,
      package_path: formatScenePackagePath(projectRoot, packagePath),
      contract_valid: contractValidation.valid,
      contract_errors: contractValidation.errors,
      schema_valid: schemaValidation.valid,
      schema_errors: schemaValidation.errors,
      warnings: schemaValidation.warnings,
      summary: schemaValidation.summary
    };

    printSceneTemplateValidateSummary(options, payload, projectRoot);

    if (!allValid) {
      process.exitCode = 1;
    }

    return payload;
  } catch (error) {
    console.error(chalk.red('Scene template validate failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function runSceneTemplateResolveCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneTemplateResolveOptions(rawOptions);
  const validationError = validateSceneTemplateResolveOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene template resolve failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const pathExists = typeof fileSystem.pathExists === 'function'
    ? fileSystem.pathExists.bind(fileSystem)
    : fs.pathExists.bind(fs);
  const readdir = typeof fileSystem.readdir === 'function'
    ? fileSystem.readdir.bind(fileSystem)
    : fs.readdir.bind(fs);
  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);

  try {
    // Build registry from templateDir (reuse the same logic as runScenePackageRegistryCommand)
    const templateRootPath = resolveScenePackageTemplateLibraryPath({ outDir: options.templateDir }, projectRoot);
    if (!(await pathExists(templateRootPath))) {
      throw new Error(`template directory not found: ${templateRootPath}`);
    }

    const templateEntries = await readdir(templateRootPath);
    const registryTemplates = [];

    for (const rawEntry of templateEntries) {
      const entryName = typeof rawEntry === 'string'
        ? rawEntry
        : String(rawEntry && rawEntry.name ? rawEntry.name : '').trim();

      if (!entryName) {
        continue;
      }

      const templateDirPath = path.join(templateRootPath, entryName);
      const packagePath = path.join(templateDirPath, 'scene-package.json');

      if (!(await pathExists(packagePath))) {
        continue;
      }

      try {
        const packageContract = await readJson(packagePath);
        registryTemplates.push({
          name: entryName,
          contract: packageContract.contract || packageContract,
          variables: (packageContract.contract && packageContract.contract.variables) || packageContract.variables || [],
          files: (packageContract.contract && packageContract.contract.files) || packageContract.files || [],
          extends: (packageContract.contract && packageContract.contract.extends) || packageContract.extends || null
        });
      } catch (_e) {
        // Skip entries with unreadable package files
      }
    }

    // Resolve inheritance
    const resolution = resolveTemplateInheritance(registryTemplates, options.package);

    const payload = {
      resolved: resolution.resolved,
      package_name: options.package,
      chain: resolution.chain,
      mergedVariables: resolution.mergedVariables,
      mergedFiles: resolution.mergedFiles,
      errors: resolution.errors
    };

    printSceneTemplateResolveSummary(options, payload, projectRoot);

    if (!resolution.resolved) {
      process.exitCode = 1;
    }

    return payload;
  } catch (error) {
    console.error(chalk.red('Scene template resolve failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

async function runSceneTemplateRenderCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneTemplateRenderOptions(rawOptions);
  const validationError = validateSceneTemplateRenderOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene template render failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const pathExists = typeof fileSystem.pathExists === 'function'
    ? fileSystem.pathExists.bind(fileSystem)
    : fs.pathExists.bind(fs);
  const readdir = typeof fileSystem.readdir === 'function'
    ? fileSystem.readdir.bind(fileSystem)
    : fs.readdir.bind(fs);
  const readJson = typeof fileSystem.readJson === 'function'
    ? fileSystem.readJson.bind(fileSystem)
    : fs.readJson.bind(fs);
  const readFile = typeof fileSystem.readFile === 'function'
    ? fileSystem.readFile.bind(fileSystem)
    : fs.readFile.bind(fs);
  const ensureDir = typeof fileSystem.ensureDir === 'function'
    ? fileSystem.ensureDir.bind(fileSystem)
    : fs.ensureDir.bind(fs);
  const writeFile = typeof fileSystem.writeFile === 'function'
    ? fileSystem.writeFile.bind(fileSystem)
    : fs.writeFile.bind(fs);
  const stat = typeof fileSystem.stat === 'function'
    ? fileSystem.stat.bind(fileSystem)
    : fs.stat.bind(fs);

  try {
    // Parse values: if it looks like a file path (ends with .json), read it; otherwise parse as JSON string
    let valuesObj;
    const rawValues = options.values;
    if (rawValues.endsWith('.json')) {
      const valuesPath = resolvePath(projectRoot, rawValues);
      valuesObj = await readJson(valuesPath);
    } else {
      try {
        valuesObj = JSON.parse(rawValues);
      } catch (_e) {
        throw new Error(`failed to parse --values as JSON: ${_e.message}`);
      }
    }

    // Build registry from templateDir to find the target package
    const templateRootPath = resolveScenePackageTemplateLibraryPath({ outDir: options.templateDir }, projectRoot);
    if (!(await pathExists(templateRootPath))) {
      throw new Error(`template directory not found: ${templateRootPath}`);
    }

    // Locate the target package directory
    const packageDirPath = path.join(templateRootPath, options.package);
    if (!(await pathExists(packageDirPath))) {
      throw new Error(`package "${options.package}" not found in template directory`);
    }

    // Load the package contract to get the variable schema
    const packageJsonPath = path.join(packageDirPath, 'scene-package.json');
    if (!(await pathExists(packageJsonPath))) {
      throw new Error(`scene-package.json not found for package "${options.package}"`);
    }

    const packageContract = await readJson(packageJsonPath);
    const schema = (packageContract.contract && packageContract.contract.variables)
      || packageContract.variables
      || [];

    // Resolve output directory
    const outputDir = resolvePath(projectRoot, options.out);

    // Render template files using the core renderTemplateFiles function
    const renderResult = await renderTemplateFiles(
      packageDirPath,
      { schema, values: valuesObj },
      outputDir,
      { readdir, stat, readFile, ensureDir, writeFile }
    );

    const payload = {
      rendered: renderResult.rendered,
      package_name: options.package,
      output_dir: formatScenePackagePath(projectRoot, outputDir),
      files: renderResult.files,
      errors: renderResult.errors,
      summary: renderResult.summary
    };

    printSceneTemplateRenderSummary(options, payload, projectRoot);

    if (!renderResult.rendered) {
      process.exitCode = 1;
    }

    return payload;
  } catch (error) {
    console.error(chalk.red('Scene template render failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tar buffer creation and tarball bundling (Spec 77-00)
// ---------------------------------------------------------------------------

/**
 * Create a POSIX ustar tar archive buffer from an array of files.
 * Each file entry has a 512-byte header followed by content padded to 512-byte boundary.
 * The archive ends with two 512-byte zero blocks.
 *
 * @param {Array<{ relativePath: string, content: Buffer }>} files
 * @returns {Buffer}
 */
function createTarBuffer(files) {
  const BLOCK_SIZE = 512;
  const blocks = [];

  for (const file of files) {
    const header = Buffer.alloc(BLOCK_SIZE, 0);
    const fileName = String(file.relativePath || '');
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(String(file.content || ''));
    const fileSize = content.length;

    // name (0, 100)
    header.write(fileName, 0, Math.min(fileName.length, 100), 'utf8');

    // mode (100, 8) - octal, default 0o644
    header.write('0000644\0', 100, 8, 'utf8');

    // uid (108, 8)
    header.write('0000000\0', 108, 8, 'utf8');

    // gid (116, 8)
    header.write('0000000\0', 116, 8, 'utf8');

    // size (124, 12) - octal
    const sizeOctal = fileSize.toString(8).padStart(11, '0');
    header.write(sizeOctal + '\0', 124, 12, 'utf8');

    // mtime (136, 12) - octal, use 0
    header.write('00000000000\0', 136, 12, 'utf8');

    // checksum placeholder (148, 8) - fill with spaces for checksum calculation
    header.write('        ', 148, 8, 'utf8');

    // typeflag (156, 1) - '0' = regular file
    header.write('0', 156, 1, 'utf8');

    // linkname (157, 100) - empty
    // magic (257, 6) - "ustar\0"
    header.write('ustar\0', 257, 6, 'utf8');

    // version (263, 2) - "00"
    header.write('00', 263, 2, 'utf8');

    // uname (265, 32)
    header.write('root', 265, 4, 'utf8');

    // gname (297, 32)
    header.write('root', 297, 4, 'utf8');

    // Compute checksum: sum of all unsigned bytes in header (with checksum field as spaces)
    let checksum = 0;
    for (let i = 0; i < BLOCK_SIZE; i++) {
      checksum += header[i];
    }
    const checksumOctal = checksum.toString(8).padStart(6, '0');
    header.write(checksumOctal + '\0 ', 148, 8, 'utf8');

    blocks.push(header);

    // File content
    if (fileSize > 0) {
      const paddedSize = Math.ceil(fileSize / BLOCK_SIZE) * BLOCK_SIZE;
      const contentBlock = Buffer.alloc(paddedSize, 0);
      content.copy(contentBlock, 0, 0, fileSize);
      blocks.push(contentBlock);
    }
  }

  // End-of-archive: two 512-byte zero blocks
  blocks.push(Buffer.alloc(BLOCK_SIZE, 0));
  blocks.push(Buffer.alloc(BLOCK_SIZE, 0));

  return Buffer.concat(blocks);
}

/**
 * Extract files from a tar buffer back into an array of { relativePath, content }.
 * Skips zero-block end markers.
 *
 * @param {Buffer} buffer
 * @returns {Array<{ relativePath: string, content: Buffer }>}
 */
function extractTarBuffer(buffer) {
  const BLOCK_SIZE = 512;
  const files = [];
  let offset = 0;

  while (offset + BLOCK_SIZE <= buffer.length) {
    const header = buffer.slice(offset, offset + BLOCK_SIZE);

    // Check for zero block (end-of-archive marker)
    let isZero = true;
    for (let i = 0; i < BLOCK_SIZE; i++) {
      if (header[i] !== 0) {
        isZero = false;
        break;
      }
    }

    if (isZero) {
      break;
    }

    // Parse file name (0, 100) - null-terminated
    let nameEnd = 0;
    while (nameEnd < 100 && header[nameEnd] !== 0) {
      nameEnd++;
    }
    const relativePath = header.slice(0, nameEnd).toString('utf8');

    // Parse file size (124, 12) - octal, null-terminated
    let sizeStr = '';
    for (let i = 124; i < 136; i++) {
      const ch = header[i];
      if (ch === 0 || ch === 0x20) {
        break;
      }
      sizeStr += String.fromCharCode(ch);
    }
    const fileSize = parseInt(sizeStr, 8) || 0;

    offset += BLOCK_SIZE;

    // Read file content
    const content = Buffer.alloc(fileSize);
    if (fileSize > 0 && offset + fileSize <= buffer.length) {
      buffer.copy(content, 0, offset, offset + fileSize);
    }

    files.push({ relativePath, content });

    // Advance past content blocks (padded to 512-byte boundary)
    const paddedSize = Math.ceil(fileSize / BLOCK_SIZE) * BLOCK_SIZE;
    offset += paddedSize;
  }

  return files;
}

/**
 * Bundle files into a gzip-compressed tarball with SHA-256 integrity hash.
 *
 * @param {Array<{ relativePath: string, content: Buffer }>} files
 * @returns {{ tarball: Buffer, integrity: string, fileCount: number, size: number }}
 */
function bundlePackageTarball(files) {
  const tarBuffer = createTarBuffer(files);
  const tarball = zlib.gzipSync(tarBuffer);
  const hash = crypto.createHash('sha256').update(tarball).digest('hex');

  return {
    tarball,
    integrity: `sha256-${hash}`,
    fileCount: files.length,
    size: tarball.length
  };
}

function buildRegistryTarballPath(name, version) {
  return `packages/${name}/${version}/${name}-${version}.tgz`;
}

function buildTarballFilename(name, version) {
  return `${name}-${version}.tgz`;
}

function resolveLatestVersion(versions) {
  const keys = Object.keys(versions || {});
  if (keys.length === 0) {
    return null;
  }
  const sorted = keys.slice().sort(semver.rcompare);
  return sorted[0];
}

async function validatePackageForPublish(packageDir, fileSystem) {
  const fsSys = fileSystem || fs;
  const readJson = typeof fsSys.readJson === 'function'
    ? fsSys.readJson.bind(fsSys)
    : fs.readJson.bind(fs);
  const pathExists = typeof fsSys.pathExists === 'function'
    ? fsSys.pathExists.bind(fsSys)
    : fs.pathExists.bind(fs);

  const errors = [];
  const files = [];

  // 1. Read scene-package.json from packageDir
  const contractPath = path.join(packageDir, 'scene-package.json');
  let contract;
  try {
    contract = await readJson(contractPath);
  } catch (err) {
    return {
      valid: false,
      contract: null,
      errors: [`failed to read scene-package.json: ${err.message}`],
      files: []
    };
  }

  // 2. Run validateScenePackageContract() (existing function)
  const contractValidation = validateScenePackageContract(contract);
  if (!contractValidation.valid) {
    errors.push(...contractValidation.errors);
  }

  // 3. Validate metadata.version is valid semver
  const metadata = contract && typeof contract === 'object' && typeof contract.metadata === 'object' ? contract.metadata : null;
  const version = metadata ? String(metadata.version || '').trim() : '';
  if (version && !semver.valid(version)) {
    errors.push(`metadata.version "${version}" is not valid semver`);
  }

  // 4. Verify artifacts.entry_scene file exists
  const artifacts = contract && typeof contract === 'object' && typeof contract.artifacts === 'object' ? contract.artifacts : null;
  const entryScene = artifacts ? String(artifacts.entry_scene || '').trim() : '';
  if (entryScene) {
    const entryAbsPath = path.join(packageDir, entryScene);
    const entryExists = await pathExists(entryAbsPath);
    if (entryExists) {
      files.push({ relativePath: entryScene, absolutePath: entryAbsPath });
    } else {
      errors.push(`artifacts.entry_scene file not found: ${entryScene}`);
    }
  }

  // 5. Verify all artifacts.generates files exist
  const generates = artifacts && Array.isArray(artifacts.generates) ? artifacts.generates : [];
  for (const filePath of generates) {
    const trimmed = String(filePath || '').trim();
    if (!trimmed) continue;
    const absPath = path.join(packageDir, trimmed);
    const fileExists = await pathExists(absPath);
    if (fileExists) {
      files.push({ relativePath: trimmed, absolutePath: absPath });
    } else {
      errors.push(`artifacts.generates file not found: ${trimmed}`);
    }
  }

  return {
    valid: errors.length === 0,
    contract,
    errors,
    files
  };
}

// ---------------------------------------------------------------------------
// Registry Index Management (Spec 77-00, Task 5)
// ---------------------------------------------------------------------------

async function loadRegistryIndex(registryRoot, fileSystem) {
  const fsSys = fileSystem || fs;
  const indexPath = path.join(registryRoot, 'registry-index.json');

  const pathExists = typeof fsSys.pathExists === 'function'
    ? fsSys.pathExists.bind(fsSys)
    : fs.pathExists.bind(fs);
  const readJson = typeof fsSys.readJson === 'function'
    ? fsSys.readJson.bind(fsSys)
    : fs.readJson.bind(fs);

  const exists = await pathExists(indexPath);
  if (!exists) {
    return { apiVersion: 'sce.scene.registry/v0.1', packages: {} };
  }

  let index;
  try {
    index = await readJson(indexPath);
  } catch (err) {
    throw new Error(`failed to parse registry-index.json: ${err.message}`);
  }

  if (!index || typeof index !== 'object' || typeof index.packages !== 'object') {
    throw new Error('registry-index.json is missing required "packages" object');
  }

  return index;
}

async function saveRegistryIndex(registryRoot, index, fileSystem) {
  const fsSys = fileSystem || fs;
  const indexPath = path.join(registryRoot, 'registry-index.json');

  const writeJson = typeof fsSys.writeJson === 'function'
    ? fsSys.writeJson.bind(fsSys)
    : fs.writeJson.bind(fs);

  await writeJson(indexPath, index, { spaces: 2 });
}

function addVersionToIndex(index, contract, integrity, publishedAt) {
  const metadata = contract && typeof contract === 'object' && typeof contract.metadata === 'object'
    ? contract.metadata : {};
  const name = String(metadata.name || '').trim();
  const group = String(metadata.group || '').trim();
  const description = String(metadata.description || '').trim();
  const version = String(metadata.version || '').trim();

  if (!index.packages) {
    index.packages = {};
  }

  if (!index.packages[name]) {
    index.packages[name] = {
      name,
      group,
      description,
      latest: null,
      versions: {}
    };
  }

  const pkg = index.packages[name];
  // Update metadata in case it changed
  pkg.name = name;
  pkg.group = group;
  pkg.description = description;

  const tarball = buildRegistryTarballPath(name, version);

  pkg.versions[version] = {
    published_at: publishedAt,
    integrity,
    tarball
  };

  pkg.latest = resolveLatestVersion(pkg.versions);

  return index;
}

function removeVersionFromIndex(index, name, version) {
  if (!index.packages || !index.packages[name]) {
    return { index, removed: false };
  }

  const pkg = index.packages[name];
  if (!pkg.versions || !pkg.versions[version]) {
    return { index, removed: false };
  }

  delete pkg.versions[version];

  const remainingKeys = Object.keys(pkg.versions);
  if (remainingKeys.length === 0) {
    delete index.packages[name];
  } else {
    pkg.latest = resolveLatestVersion(pkg.versions);
  }

  return { index, removed: true };
}

// ---------------------------------------------------------------------------
// Registry Storage (Spec 77-00, Task 6)
// ---------------------------------------------------------------------------

async function storeToRegistry(name, version, tarball, registryRoot, options, fileSystem) {
  const fsSys = fileSystem || fs;
  const ensureDir = typeof fsSys.ensureDir === 'function'
    ? fsSys.ensureDir.bind(fsSys)
    : fs.ensureDir.bind(fs);
  const writeFile = typeof fsSys.writeFile === 'function'
    ? fsSys.writeFile.bind(fsSys)
    : fs.writeFile.bind(fs);
  const pathExists = typeof fsSys.pathExists === 'function'
    ? fsSys.pathExists.bind(fsSys)
    : fs.pathExists.bind(fs);

  const relativeTarballPath = buildRegistryTarballPath(name, version);
  const absoluteTarballPath = path.join(registryRoot, relativeTarballPath);
  const targetDir = path.dirname(absoluteTarballPath);

  const exists = await pathExists(targetDir);
  let overwritten = false;

  if (exists && !(options && options.force)) {
    throw new Error(`version ${version} of "${name}" already exists in registry (use --force to overwrite)`);
  }

  if (exists) {
    overwritten = true;
  }

  await ensureDir(targetDir);
  await writeFile(absoluteTarballPath, tarball);

  return { path: absoluteTarballPath, overwritten };
}

async function removeFromRegistry(name, version, registryRoot, fileSystem) {
  const fsSys = fileSystem || fs;
  const remove = typeof fsSys.remove === 'function'
    ? fsSys.remove.bind(fsSys)
    : fs.remove.bind(fs);
  const readdir = typeof fsSys.readdir === 'function'
    ? fsSys.readdir.bind(fsSys)
    : fs.readdir.bind(fs);

  const relativeTarballPath = buildRegistryTarballPath(name, version);
  const absoluteTarballPath = path.join(registryRoot, relativeTarballPath);
  const versionDir = path.dirname(absoluteTarballPath);
  const packageDir = path.dirname(versionDir);

  try {
    await remove(absoluteTarballPath);
  } catch (err) {
    return { removed: false };
  }

  // Attempt to remove empty version directory
  try {
    const versionEntries = await readdir(versionDir);
    if (versionEntries.length === 0) {
      await remove(versionDir);
    }
  } catch (_err) {
    // directory may not exist or not be empty, ignore
  }

  // Attempt to remove empty package directory
  try {
    const packageEntries = await readdir(packageDir);
    if (packageEntries.length === 0) {
      await remove(packageDir);
    }
  } catch (_err) {
    // directory may not exist or not be empty, ignore
  }

  return { removed: true };
}

// ---------------------------------------------------------------------------
// Registry Publish Command (Spec 77-00, Task 8)
// ---------------------------------------------------------------------------

function normalizeScenePackageRegistryPublishOptions(options = {}) {
  return {
    package: options.package ? String(options.package).trim() : undefined,
    registry: options.registry ? String(options.registry).trim() : '.sce/registry',
    dryRun: options.dryRun === true,
    force: options.force === true,
    json: options.json === true
  };
}

function validateScenePackageRegistryPublishOptions(options) {
  if (!options.package || typeof options.package !== 'string') {
    return '--package is required';
  }
  return null;
}

function printScenePackageRegistryPublishSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const dryRunLabel = payload.dry_run ? chalk.yellow(' [dry-run]') : '';
  console.log(chalk.blue('Scene Package Publish') + dryRunLabel);
  console.log(`  Coordinate: ${payload.coordinate}`);
  console.log(`  Tarball: ${chalk.gray(formatScenePackagePath(projectRoot, payload.tarball.path))}`);
  console.log(`  Files: ${payload.tarball.file_count}`);
  console.log(`  Size: ${payload.tarball.size} bytes`);
  console.log(`  Integrity: ${payload.tarball.integrity}`);
  if (payload.overwritten) {
    console.log(`  Overwritten: ${chalk.yellow('yes')}`);
  }
}

async function runScenePackageRegistryPublishCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeScenePackageRegistryPublishOptions(rawOptions);
  const validationError = validateScenePackageRegistryPublishOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene package publish failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const readFile = typeof fileSystem.readFile === 'function'
    ? fileSystem.readFile.bind(fileSystem)
    : fs.readFile.bind(fs);

  try {
    // 1. Resolve package directory
    const packageDir = path.isAbsolute(options.package)
      ? options.package
      : path.join(projectRoot, options.package);

    // 2. Validate package for publish
    const validation = await validatePackageForPublish(packageDir, fileSystem);
    if (!validation.valid) {
      throw new Error(`package validation failed: ${validation.errors.join('; ')}`);
    }

    const contract = validation.contract;
    const metadata = contract.metadata || {};
    const name = String(metadata.name || '').trim();
    const version = String(metadata.version || '').trim();
    const group = String(metadata.group || '').trim();

    // 3. Read all referenced files into buffers (include scene-package.json itself)
    const files = [];

    // Add scene-package.json itself
    const contractPath = path.join(packageDir, 'scene-package.json');
    const contractBuffer = await readFile(contractPath);
    files.push({ relativePath: 'scene-package.json', content: contractBuffer });

    // Add all validated files (entry_scene + generates)
    for (const fileRef of validation.files) {
      const buffer = await readFile(fileRef.absolutePath);
      files.push({ relativePath: fileRef.relativePath, content: buffer });
    }

    // 4. Bundle tarball
    const bundle = bundlePackageTarball(files);

    // 5. Resolve registry root
    const registryRoot = path.isAbsolute(options.registry)
      ? options.registry
      : path.join(projectRoot, options.registry);

    const coordinate = buildScenePackageCoordinate(contract);
    const tarballRelativePath = buildRegistryTarballPath(name, version);
    const tarballAbsolutePath = path.join(registryRoot, tarballRelativePath);

    // 6. Dry-run: build payload without writing, print, return
    if (options.dryRun) {
      const payload = {
        published: false,
        dry_run: true,
        overwritten: false,
        coordinate,
        package: {
          name,
          group,
          version,
          kind: contract.kind || 'scene-template'
        },
        tarball: {
          path: formatScenePackagePath(projectRoot, tarballAbsolutePath),
          size: bundle.size,
          file_count: bundle.fileCount,
          integrity: bundle.integrity
        },
        registry: {
          index_path: formatScenePackagePath(projectRoot, path.join(registryRoot, 'registry-index.json')),
          total_packages: 0,
          total_versions: 0
        }
      };

      printScenePackageRegistryPublishSummary(options, payload, projectRoot);
      return payload;
    }

    // 7. Store tarball to registry
    const storeResult = await storeToRegistry(name, version, bundle.tarball, registryRoot, options, fileSystem);

    // 8. Update registry index
    const publishedAt = new Date().toISOString();
    const index = await loadRegistryIndex(registryRoot, fileSystem);
    addVersionToIndex(index, contract, bundle.integrity, publishedAt);
    await saveRegistryIndex(registryRoot, index, fileSystem);

    // 9. Count totals from index
    let totalPackages = 0;
    let totalVersions = 0;
    if (index.packages) {
      const pkgNames = Object.keys(index.packages);
      totalPackages = pkgNames.length;
      for (const pkgName of pkgNames) {
        const pkg = index.packages[pkgName];
        if (pkg && pkg.versions) {
          totalVersions += Object.keys(pkg.versions).length;
        }
      }
    }

    // 10. Build payload
    const payload = {
      published: true,
      dry_run: false,
      overwritten: storeResult.overwritten,
      coordinate,
      package: {
        name,
        group,
        version,
        kind: contract.kind || 'scene-template'
      },
      tarball: {
        path: formatScenePackagePath(projectRoot, storeResult.path),
        size: bundle.size,
        file_count: bundle.fileCount,
        integrity: bundle.integrity
      },
      registry: {
        index_path: formatScenePackagePath(projectRoot, path.join(registryRoot, 'registry-index.json')),
        total_packages: totalPackages,
        total_versions: totalVersions
      }
    };

    printScenePackageRegistryPublishSummary(options, payload, projectRoot);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene package publish failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function normalizeSceneUnpublishOptions(options = {}) {
  return {
    name: options.name ? String(options.name).trim() : undefined,
    version: options.version ? String(options.version).trim() : undefined,
    registry: options.registry ? String(options.registry).trim() : '.sce/registry',
    json: options.json === true
  };
}

function validateSceneUnpublishOptions(options) {
  if (!options.name || typeof options.name !== 'string') {
    return '--name is required';
  }
  if (!options.version || typeof options.version !== 'string') {
    return '--version is required';
  }
  if (!semver.valid(options.version)) {
    return `--version "${options.version}" is not valid semver`;
  }
  return null;
}

function normalizeSceneInstallOptions(options = {}) {
  return {
    name: options.name ? String(options.name).trim() : undefined,
    version: options.version ? String(options.version).trim() : undefined,
    out: options.out ? String(options.out).trim() : undefined,
    registry: options.registry ? String(options.registry).trim() : '.sce/registry',
    force: options.force === true,
    dryRun: options.dryRun === true,
    json: options.json === true
  };
}

function validateSceneInstallOptions(options) {
  if (!options.name || typeof options.name !== 'string') {
    return '--name is required';
  }
  if (options.version && options.version !== 'latest' && !semver.valid(options.version)) {
    return `--version "${options.version}" is not valid semver`;
  }
  return null;
}

function buildInstallManifest(packageName, version, registryDir, integrity, files) {
  return {
    packageName,
    version,
    installedAt: new Date().toISOString(),
    registryDir,
    integrity,
    files
  };
}

function printSceneInstallSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const dryRunLabel = payload.dry_run ? chalk.yellow(' [dry-run]') : '';
  console.log(chalk.blue('Scene Package Install') + dryRunLabel);
  console.log(`  Package: ${payload.coordinate}`);
  console.log(`  Target: ${chalk.gray(payload.target_dir)}`);
  console.log(`  Files: ${payload.file_count}`);
  console.log(`  Integrity: ${payload.integrity}`);
  if (payload.overwritten) {
    console.log(`  Overwritten: ${chalk.yellow('yes')}`);
  }
}

async function runSceneInstallCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneInstallOptions(rawOptions);
  const validationError = validateSceneInstallOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene package install failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const readFile = typeof fileSystem.readFile === 'function'
    ? fileSystem.readFile.bind(fileSystem)
    : fs.readFile.bind(fs);

  try {
    // 1. Resolve registry root
    const registryRoot = path.isAbsolute(options.registry)
      ? options.registry
      : path.join(projectRoot, options.registry);

    // 2. Load registry index
    const index = await loadRegistryIndex(registryRoot, fileSystem);

    // 3. Resolve package in index
    if (!index.packages || !index.packages[options.name]) {
      throw new Error(`package "${options.name}" not found in registry`);
    }
    const pkg = index.packages[options.name];

    // 4. Resolve version (default to latest)
    const version = (!options.version || options.version === 'latest')
      ? pkg.latest
      : options.version;

    if (!version) {
      throw new Error(`no latest version found for package "${options.name}"`);
    }

    if (!pkg.versions || !pkg.versions[version]) {
      throw new Error(`version "${version}" not found for package "${options.name}"`);
    }
    const versionEntry = pkg.versions[version];

    // Deprecation warning
    if (versionEntry.deprecated) {
      console.log(chalk.yellow(`WARNING: ${options.name}@${version} is deprecated: ${versionEntry.deprecated}`));
    }
    const tarballRelativePath = buildRegistryTarballPath(options.name, version);
    const tarballAbsolutePath = path.join(registryRoot, tarballRelativePath);
    const tarballBuffer = await readFile(tarballAbsolutePath);

    // 6. Verify integrity
    const computedHash = 'sha256-' + crypto.createHash('sha256').update(tarballBuffer).digest('hex');
    if (computedHash !== versionEntry.integrity) {
      throw new Error(`integrity verification failed: expected ${versionEntry.integrity}, got ${computedHash}`);
    }

    // 7. Resolve target directory
    const targetDir = options.out
      ? (path.isAbsolute(options.out) ? options.out : path.join(projectRoot, options.out))
      : path.join(projectRoot, options.name);

    // 8. Decompress and extract tarball
    const decompressed = zlib.gunzipSync(tarballBuffer);
    const files = extractTarBuffer(decompressed);
    const fileNames = files.map(f => f.relativePath);

    // 9. Build coordinate
    const coordinate = `sce.scene/${options.name}@${version}`;

    // 10. Dry-run: build payload without writing, print, return
    if (options.dryRun) {
      const payload = {
        installed: false,
        dry_run: true,
        overwritten: false,
        coordinate,
        package: {
          name: options.name,
          version
        },
        target_dir: formatScenePackagePath(projectRoot, targetDir),
        file_count: fileNames.length,
        files: fileNames,
        integrity: computedHash,
        registry: {
          index_path: formatScenePackagePath(projectRoot, path.join(registryRoot, 'registry-index.json'))
        }
      };

      printSceneInstallSummary(options, payload, projectRoot);
      return payload;
    }

    // 11. Check target dir conflict (unless --force)
    const ensureDirSync = typeof fileSystem.ensureDirSync === 'function'
      ? fileSystem.ensureDirSync.bind(fileSystem)
      : fs.ensureDirSync.bind(fs);
    const writeFileSync = typeof fileSystem.writeFileSync === 'function'
      ? fileSystem.writeFileSync.bind(fileSystem)
      : fs.writeFileSync.bind(fs);
    const pathExistsSync = typeof fileSystem.pathExistsSync === 'function'
      ? fileSystem.pathExistsSync.bind(fileSystem)
      : fs.pathExistsSync.bind(fs);

    const targetExists = pathExistsSync(targetDir);
    if (targetExists && !options.force) {
      throw new Error(`target directory already exists: ${formatScenePackagePath(projectRoot, targetDir)} (use --force to overwrite)`);
    }

    // 12. Write extracted files preserving relative paths
    ensureDirSync(targetDir);
    for (const file of files) {
      const filePath = path.join(targetDir, file.relativePath);
      ensureDirSync(path.dirname(filePath));
      writeFileSync(filePath, file.content);
    }

    // 13. Write install manifest
    const manifest = buildInstallManifest(options.name, version, options.registry, computedHash, fileNames);
    const manifestPath = path.join(targetDir, 'scene-install-manifest.json');
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // 14. Build payload
    const payload = {
      installed: true,
      dry_run: false,
      overwritten: targetExists && options.force,
      coordinate,
      package: {
        name: options.name,
        version
      },
      target_dir: formatScenePackagePath(projectRoot, targetDir),
      file_count: fileNames.length,
      files: fileNames,
      integrity: computedHash,
      registry: {
        index_path: formatScenePackagePath(projectRoot, path.join(registryRoot, 'registry-index.json'))
      }
    };

    printSceneInstallSummary(options, payload, projectRoot);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene package install failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

// --- Scene Registry Query Helpers ---

function buildRegistryPackageList(registryPackages) {
  return Object.values(registryPackages || {})
    .map(pkg => ({
      name: pkg.name || '',
      group: pkg.group || '',
      description: pkg.description || '',
      latest: pkg.latest || '',
      version_count: Object.keys(pkg.versions || {}).length
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function filterRegistryPackages(packageList, query) {
  if (!query) return packageList;
  const lowerQuery = query.toLowerCase();
  return packageList.filter(pkg =>
    pkg.name.toLowerCase().includes(lowerQuery) ||
    pkg.description.toLowerCase().includes(lowerQuery) ||
    pkg.group.toLowerCase().includes(lowerQuery)
  );
}

// --- Scene List Command ---

function normalizeSceneListOptions(options = {}) {
  return {
    registry: options.registry ? String(options.registry).trim() : '.sce/registry',
    json: options.json === true
  };
}

function validateSceneListOptions(options) {
  return null;
}

async function runSceneListCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneListOptions(rawOptions);
  const validationError = validateSceneListOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene list failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const registryRoot = path.isAbsolute(options.registry)
      ? options.registry
      : path.join(projectRoot, options.registry);

    const index = await loadRegistryIndex(registryRoot, fileSystem);
    const packages = buildRegistryPackageList(index.packages);
    const payload = { packages, total: packages.length };

    printSceneListSummary(options, payload, projectRoot);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene list failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function printSceneListSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (payload.total === 0) {
    console.log('No packages found');
    return;
  }

  console.log(chalk.blue(`Scene Registry (${payload.total} package${payload.total !== 1 ? 's' : ''})`));
  for (const pkg of payload.packages) {
    console.log(`  ${pkg.name.padEnd(20)} ${pkg.latest.padEnd(10)} ${String(pkg.version_count).padEnd(10)} ${pkg.description}`);
  }
}

function normalizeSceneSearchOptions(options = {}) {
  return {
    query: options.query ? String(options.query).trim() : '',
    registry: options.registry ? String(options.registry).trim() : '.sce/registry',
    json: options.json === true
  };
}

function validateSceneSearchOptions(options) {
  return null; // Empty query is valid (returns all)
}

async function runSceneSearchCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneSearchOptions(rawOptions);
  const validationError = validateSceneSearchOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene search failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const registryRoot = path.isAbsolute(options.registry)
      ? options.registry
      : path.join(projectRoot, options.registry);

    const index = await loadRegistryIndex(registryRoot, fileSystem);
    const allPackages = buildRegistryPackageList(index.packages);
    const packages = filterRegistryPackages(allPackages, options.query);
    const payload = { query: options.query, packages, total: packages.length };

    printSceneSearchSummary(options, payload, projectRoot);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene search failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function printSceneSearchSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (payload.total === 0) {
    if (payload.query) {
      console.log(`No packages matching '${payload.query}'`);
    } else {
      console.log('No packages found');
    }
    return;
  }

  const matchLabel = payload.total === 1 ? 'match' : 'matches';
  console.log(chalk.blue(`Scene Search: "${payload.query}" (${payload.total} ${matchLabel})`));
  for (const pkg of payload.packages) {
    console.log(`  ${pkg.name.padEnd(20)} ${pkg.latest.padEnd(10)} ${String(pkg.version_count).padEnd(10)} ${pkg.description}`);
  }
}

function printSceneUnpublishSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.blue('Scene Package Unpublish'));
  console.log(`  Removed: ${payload.coordinate}`);
  console.log(`  Remaining versions: ${payload.remaining_versions}`);
  if (payload.new_latest) {
    console.log(`  New latest: ${payload.new_latest}`);
  }
}

async function runSceneUnpublishCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneUnpublishOptions(rawOptions);
  const validationError = validateSceneUnpublishOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene package unpublish failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    // 1. Resolve registry root
    const registryRoot = path.isAbsolute(options.registry)
      ? options.registry
      : path.join(projectRoot, options.registry);

    // 2. Load registry index
    const index = await loadRegistryIndex(registryRoot, fileSystem);

    // 3. Check package/version exists in index
    if (!index.packages || !index.packages[options.name]) {
      throw new Error(`package "${options.name}" not found in registry`);
    }
    const pkg = index.packages[options.name];
    if (!pkg.versions || !pkg.versions[options.version]) {
      throw new Error(`version "${options.version}" not found for package "${options.name}"`);
    }

    // 4. Remove tarball from disk
    await removeFromRegistry(options.name, options.version, registryRoot, fileSystem);

    // 5. Remove version from index and save
    const result = removeVersionFromIndex(index, options.name, options.version);
    await saveRegistryIndex(registryRoot, result.index, fileSystem);

    // 6. Determine remaining versions and new latest
    const pkgEntry = result.index.packages ? result.index.packages[options.name] : null;
    const remainingVersions = pkgEntry && pkgEntry.versions
      ? Object.keys(pkgEntry.versions).length
      : 0;
    const newLatest = pkgEntry ? (pkgEntry.latest || null) : null;

    // 7. Build coordinate
    const coordinate = `sce.scene/${options.name}@${options.version}`;

    // 8. Build payload
    const payload = {
      unpublished: true,
      coordinate,
      package: {
        name: options.name,
        version: options.version
      },
      remaining_versions: remainingVersions,
      new_latest: newLatest,
      registry: {
        index_path: formatScenePackagePath(projectRoot, path.join(registryRoot, 'registry-index.json'))
      }
    };

    printSceneUnpublishSummary(options, payload, projectRoot);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene package unpublish failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function normalizeSceneVersionOptions(options = {}) {
  return {
    package: options.package ? String(options.package).trim() : '.',
    bump: options.bump ? String(options.bump).trim().toLowerCase() : undefined,
    dryRun: options.dryRun === true,
    json: options.json === true
  };
}

function validateSceneVersionOptions(options) {
  if (!options.bump) {
    return '--bump is required (major, minor, patch, or explicit semver)';
  }
  const validTypes = ['major', 'minor', 'patch'];
  if (!validTypes.includes(options.bump) && !semver.valid(options.bump)) {
    return `--bump "${options.bump}" is not a valid bump type or semver version`;
  }
  return null;
}

function printSceneVersionSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const dryRunLabel = payload.dryRun ? chalk.yellow(' [dry-run]') : '';
  console.log(chalk.blue('Scene Version Bump') + dryRunLabel);
  console.log(`  Package: ${payload.name}`);
  console.log(`  Version: ${payload.oldVersion} → ${payload.newVersion}`);
  console.log(`  Directory: ${chalk.gray(payload.packageDir)}`);
}

async function runSceneVersionCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneVersionOptions(rawOptions);
  const validationError = validateSceneVersionOptions(options);
  if (validationError) {
    console.error(chalk.red(`Scene version bump failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const packageDir = path.isAbsolute(options.package)
      ? options.package
      : path.join(projectRoot, options.package);

    const packageJsonPath = path.join(packageDir, 'scene-package.json');
    const readJson = typeof fileSystem.readJson === 'function'
      ? fileSystem.readJson.bind(fileSystem) : fs.readJson.bind(fs);

    let packageData;
    try {
      packageData = await readJson(packageJsonPath);
    } catch (err) {
      throw new Error(`failed to read scene-package.json: ${err.message}`);
    }

    const metadata = packageData && typeof packageData.metadata === 'object'
      ? packageData.metadata : null;
    const currentVersion = metadata ? String(metadata.version || '').trim() : '';
    if (!currentVersion || !semver.valid(currentVersion)) {
      throw new Error(`invalid or missing metadata.version: "${currentVersion}"`);
    }

    const validTypes = ['major', 'minor', 'patch'];
    let newVersion;
    if (validTypes.includes(options.bump)) {
      newVersion = semver.inc(currentVersion, options.bump);
    } else {
      if (!semver.gt(options.bump, currentVersion)) {
        throw new Error(
          `explicit version "${options.bump}" must be greater than current "${currentVersion}"`
        );
      }
      newVersion = options.bump;
    }

    if (!options.dryRun) {
      const writeJson = typeof fileSystem.writeJson === 'function'
        ? fileSystem.writeJson.bind(fileSystem) : fs.writeJson.bind(fs);
      packageData.metadata.version = newVersion;
      await writeJson(packageJsonPath, packageData, { spaces: 2 });
    }

    const name = (metadata && metadata.name) || '';
    const payload = {
      success: true,
      name,
      oldVersion: currentVersion,
      newVersion,
      packageDir: formatScenePackagePath(projectRoot, packageDir),
      dryRun: options.dryRun
    };

    printSceneVersionSummary(options, payload, projectRoot);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene version bump failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function buildPackageDiff(fromFiles, toFiles) {
  const fromMap = new Map();
  for (const f of (fromFiles || [])) {
    fromMap.set(f.relativePath, f.content);
  }
  const toMap = new Map();
  for (const f of (toFiles || [])) {
    toMap.set(f.relativePath, f.content);
  }

  const added = [];
  const removed = [];
  const modified = [];
  const unchanged = [];

  for (const [filePath, content] of fromMap) {
    if (!toMap.has(filePath)) {
      removed.push(filePath);
    } else {
      const toContent = toMap.get(filePath);
      if (Buffer.compare(content, toContent) === 0) {
        unchanged.push(filePath);
      } else {
        let changedLines = 0;
        try {
          const oldLines = content.toString('utf8').split('\n');
          const newLines = toContent.toString('utf8').split('\n');
          const maxLen = Math.max(oldLines.length, newLines.length);
          for (let i = 0; i < maxLen; i++) {
            if ((oldLines[i] || '') !== (newLines[i] || '')) {
              changedLines++;
            }
          }
        } catch (_e) {
          changedLines = -1;
        }
        modified.push({ path: filePath, changedLines });
      }
    }
  }

  for (const filePath of toMap.keys()) {
    if (!fromMap.has(filePath)) {
      added.push(filePath);
    }
  }

  return {
    added: added.sort(),
    removed: removed.sort(),
    modified: modified.sort((a, b) => a.path.localeCompare(b.path)),
    unchanged: unchanged.sort()
  };
}

function normalizeSceneDiffOptions(options = {}) {
  return {
    name: options.name ? String(options.name).trim() : undefined,
    from: options.from ? String(options.from).trim() : undefined,
    to: options.to ? String(options.to).trim() : undefined,
    registry: options.registry ? String(options.registry).trim() : '.sce/registry',
    json: options.json === true,
    stat: options.stat === true
  };
}

function validateSceneDiffOptions(options) {
  if (!options.name) return '--name is required';
  if (!options.from) return '--from is required';
  if (!options.to) return '--to is required';
  if (options.from === options.to) return '--from and --to must be different versions';
  return null;
}

function printSceneDiffSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.blue(`Scene Package Diff: ${payload.name} ${payload.fromVersion} → ${payload.toVersion}`));
  console.log(`  Added:     ${payload.summary.added} file(s)`);
  console.log(`  Removed:   ${payload.summary.removed} file(s)`);
  console.log(`  Modified:  ${payload.summary.modified} file(s)`);
  console.log(`  Unchanged: ${payload.summary.unchanged} file(s)`);

  if (payload.files.added.length > 0 || payload.files.removed.length > 0 || payload.files.modified.length > 0) {
    console.log('');
    for (const f of payload.files.added) {
      console.log(chalk.green(`  + ${f}`));
    }
    for (const f of payload.files.removed) {
      console.log(chalk.red(`  - ${f}`));
    }
    for (const f of payload.files.modified) {
      const detail = f.changedLines >= 0 ? ` (${f.changedLines} lines changed)` : ' (binary content differs)';
      console.log(chalk.yellow(`  ~ ${f.path}${detail}`));
    }
  }
}

async function runSceneDiffCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneDiffOptions(rawOptions);
  const validationError = validateSceneDiffOptions(options);
  if (validationError) {
    console.error(chalk.red(`Scene diff failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const registryRoot = path.isAbsolute(options.registry)
      ? options.registry
      : path.join(projectRoot, options.registry);

    const index = await loadRegistryIndex(registryRoot, fileSystem);

    if (!index.packages || !index.packages[options.name]) {
      throw new Error(`package "${options.name}" not found in registry`);
    }

    const pkg = index.packages[options.name];
    if (!pkg.versions || !pkg.versions[options.from]) {
      throw new Error(`version "${options.from}" not found for package "${options.name}"`);
    }
    if (!pkg.versions[options.to]) {
      throw new Error(`version "${options.to}" not found for package "${options.name}"`);
    }

    const readFile = typeof fileSystem.readFile === 'function'
      ? fileSystem.readFile.bind(fileSystem) : fs.readFile.bind(fs);

    const fromTarballPath = path.join(registryRoot, pkg.versions[options.from].tarball);
    const toTarballPath = path.join(registryRoot, pkg.versions[options.to].tarball);

    const fromGz = await readFile(fromTarballPath);
    const toGz = await readFile(toTarballPath);

    const fromTar = zlib.gunzipSync(fromGz);
    const toTar = zlib.gunzipSync(toGz);

    const fromFiles = extractTarBuffer(fromTar);
    const toFiles = extractTarBuffer(toTar);

    const diff = buildPackageDiff(fromFiles, toFiles);

    const payload = {
      success: true,
      name: options.name,
      fromVersion: options.from,
      toVersion: options.to,
      summary: {
        added: diff.added.length,
        removed: diff.removed.length,
        modified: diff.modified.length,
        unchanged: diff.unchanged.length
      },
      files: {
        added: diff.added,
        removed: diff.removed,
        modified: diff.modified,
        unchanged: options.stat ? diff.unchanged : diff.unchanged
      }
    };

    printSceneDiffSummary(options, payload, projectRoot);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene diff failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function normalizeSceneInfoOptions(options = {}) {
  return {
    name: options.name ? String(options.name).trim() : undefined,
    registry: options.registry ? String(options.registry).trim() : '.sce/registry',
    json: options.json === true,
    versionsOnly: options.versionsOnly === true
  };
}

function validateSceneInfoOptions(options) {
  if (!options.name) return '--name is required';
  return null;
}

function printSceneInfoSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (options.versionsOnly) {
    for (const v of payload.versions) {
      console.log(`${v.version}  ${v.publishedAt}`);
    }
    return;
  }

  console.log(chalk.blue(`Scene Package: ${payload.name}`));
  console.log(`  Group:       ${payload.group || '(none)'}`);
  console.log(`  Description: ${payload.description || '(none)'}`);
  console.log(`  Latest:      ${payload.latest}`);
  console.log(`  Versions:    ${payload.versionCount}`);
  console.log('');
  console.log('  ' + 'VERSION'.padEnd(14) + 'PUBLISHED'.padEnd(26) + 'INTEGRITY');
  for (const v of payload.versions) {
    let line = '  ' + v.version.padEnd(14) + (v.publishedAt || '').padEnd(26) + (v.integrity || '');
    if (v.deprecated) {
      line += ' ' + chalk.yellow(`[DEPRECATED: ${v.deprecated}]`);
    }
    console.log(line);
  }
}

async function runSceneInfoCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneInfoOptions(rawOptions);
  const validationError = validateSceneInfoOptions(options);
  if (validationError) {
    console.error(chalk.red(`Scene info failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const registryRoot = path.isAbsolute(options.registry)
      ? options.registry
      : path.join(projectRoot, options.registry);

    const index = await loadRegistryIndex(registryRoot, fileSystem);

    if (!index.packages || !index.packages[options.name]) {
      throw new Error(`package "${options.name}" not found in registry`);
    }

    const pkg = index.packages[options.name];
    const versionKeys = Object.keys(pkg.versions || {});
    const sortedVersions = versionKeys.slice().sort(semver.rcompare);

    const versions = sortedVersions.map(v => ({
      version: v,
      publishedAt: (pkg.versions[v] && pkg.versions[v].published_at) || '',
      integrity: (pkg.versions[v] && pkg.versions[v].integrity) || '',
      deprecated: (pkg.versions[v] && pkg.versions[v].deprecated) || undefined
    }));

    const payload = {
      success: true,
      name: pkg.name || options.name,
      group: pkg.group || '',
      description: pkg.description || '',
      latest: pkg.latest || resolveLatestVersion(pkg.versions) || '',
      versionCount: versionKeys.length,
      versions
    };

    printSceneInfoSummary(options, payload, projectRoot);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene info failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function normalizeSceneDeprecateOptions(options = {}) {
  return {
    name: options.name ? String(options.name).trim() : undefined,
    version: options.version ? String(options.version).trim() : undefined,
    message: options.message ? String(options.message).trim() : undefined,
    registry: options.registry ? String(options.registry).trim() : '.sce/registry',
    json: options.json === true,
    undo: options.undo === true
  };
}

function validateSceneDeprecateOptions(options) {
  if (!options.name) return '--name is required';
  if (!options.undo && !options.message) return '--message is required (unless --undo is used)';
  return null;
}

function printSceneDeprecateSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const actionLabel = payload.action === 'undeprecate'
    ? chalk.green('un-deprecated')
    : chalk.yellow('deprecated');

  console.log(chalk.blue('Scene Package Deprecate'));
  console.log(`  Package: ${payload.package}`);
  console.log(`  Action:  ${actionLabel}`);
  console.log(`  Versions affected: ${payload.versions.length}`);
  if (payload.message) {
    console.log(`  Message: ${payload.message}`);
  }
  if (payload.versions.length > 0) {
    for (const v of payload.versions) {
      console.log(`    - ${v}`);
    }
  }
}

async function runSceneDeprecateCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneDeprecateOptions(rawOptions);
  const validationError = validateSceneDeprecateOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene deprecate failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const registryRoot = path.isAbsolute(options.registry)
      ? options.registry
      : path.join(projectRoot, options.registry);

    const index = await loadRegistryIndex(registryRoot, fileSystem);

    if (!index.packages || !index.packages[options.name]) {
      throw new Error(`package "${options.name}" not found in registry`);
    }

    const pkg = index.packages[options.name];
    const versions = pkg.versions || {};
    const affectedVersions = [];

    if (options.version) {
      if (!versions[options.version]) {
        throw new Error(`version "${options.version}" not found for package "${options.name}"`);
      }
      if (options.undo) {
        delete versions[options.version].deprecated;
      } else {
        versions[options.version].deprecated = options.message;
      }
      affectedVersions.push(options.version);
    } else {
      for (const v of Object.keys(versions)) {
        if (options.undo) {
          delete versions[v].deprecated;
        } else {
          versions[v].deprecated = options.message;
        }
        affectedVersions.push(v);
      }
    }

    await saveRegistryIndex(registryRoot, index, fileSystem);

    const payload = {
      success: true,
      action: options.undo ? 'undeprecate' : 'deprecate',
      package: options.name,
      versions: affectedVersions,
      message: options.undo ? null : options.message,
      registry: options.registry
    };

    printSceneDeprecateSummary(options, payload);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene deprecate failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scene Audit (Spec 85-00)
// ---------------------------------------------------------------------------

function normalizeSceneAuditOptions(options = {}) {
  return {
    registry: options.registry ? String(options.registry).trim() : '.sce/registry',
    json: options.json === true,
    fix: options.fix === true
  };
}

function validateSceneAuditOptions(options) {
  return null;
}

async function collectTgzFiles(packagesDir, fileSystem) {
  const fsSys = fileSystem || fs;
  const pathExists = typeof fsSys.pathExists === 'function'
    ? fsSys.pathExists.bind(fsSys)
    : fs.pathExists.bind(fs);

  const exists = await pathExists(packagesDir);
  if (!exists) {
    return [];
  }

  const results = [];

  async function walk(dir) {
    const readdir = typeof fsSys.readdir === 'function'
      ? fsSys.readdir.bind(fsSys)
      : fs.readdir.bind(fs);
    const stat = typeof fsSys.stat === 'function'
      ? fsSys.stat.bind(fsSys)
      : fs.stat.bind(fs);

    let entries;
    try {
      entries = await readdir(dir);
    } catch (err) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      let fileStat;
      try {
        fileStat = await stat(fullPath);
      } catch (err) {
        continue;
      }
      if (fileStat.isDirectory()) {
        await walk(fullPath);
      } else if (entry.endsWith('.tgz')) {
        results.push(fullPath);
      }
    }
  }

  await walk(packagesDir);
  return results;
}

async function computeFileIntegrity(filePath, fileSystem) {
  const fsSys = fileSystem || fs;
  const readFile = typeof fsSys.readFile === 'function'
    ? fsSys.readFile.bind(fsSys)
    : fs.readFile.bind(fs);

  const content = await readFile(filePath);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return `sha256-${hash}`;
}

async function runSceneAuditCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneAuditOptions(rawOptions);
  const validationError = validateSceneAuditOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene audit failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const registryRoot = path.isAbsolute(options.registry)
      ? options.registry
      : path.join(projectRoot, options.registry);

    const index = await loadRegistryIndex(registryRoot, fileSystem);
    const packages = index.packages || {};

    const missing = [];
    const integrityMismatches = [];
    const deprecated = [];
    const referencedTarballs = new Set();
    let totalVersions = 0;

    const pathExists = typeof fileSystem.pathExists === 'function'
      ? fileSystem.pathExists.bind(fileSystem)
      : fs.pathExists.bind(fs);

    for (const [pkgName, pkg] of Object.entries(packages)) {
      const versions = pkg.versions || {};
      for (const [ver, entry] of Object.entries(versions)) {
        totalVersions++;
        const tarballRel = entry.tarball || buildRegistryTarballPath(pkgName, ver);
        const tarballAbs = path.join(registryRoot, tarballRel);
        referencedTarballs.add(path.normalize(tarballAbs));

        const exists = await pathExists(tarballAbs);
        if (!exists) {
          missing.push({ package: pkgName, version: ver, tarball: tarballRel });
        } else {
          try {
            const actual = await computeFileIntegrity(tarballAbs, fileSystem);
            const expected = entry.integrity || '';
            if (expected && actual !== expected) {
              integrityMismatches.push({ package: pkgName, version: ver, expected, actual });
            }
          } catch (err) {
            integrityMismatches.push({ package: pkgName, version: ver, expected: entry.integrity || '', actual: `error: ${err.message}` });
          }
        }

        if (entry.deprecated) {
          deprecated.push({ package: pkgName, version: ver, message: entry.deprecated });
        }
      }
    }

    // Scan disk for orphaned tarballs
    const packagesDir = path.join(registryRoot, 'packages');
    const diskFiles = await collectTgzFiles(packagesDir, fileSystem);
    const orphanedTarballs = [];
    for (const absFile of diskFiles) {
      if (!referencedTarballs.has(path.normalize(absFile))) {
        const rel = path.relative(registryRoot, absFile).split(path.sep).join('/');
        orphanedTarballs.push(rel);
      }
    }

    // Fix mode
    let fixes = null;
    if (options.fix) {
      let orphansRemoved = 0;
      let entriesRemoved = 0;

      // Delete orphaned tarballs
      const unlink = typeof fileSystem.unlink === 'function'
        ? fileSystem.unlink.bind(fileSystem)
        : (typeof fileSystem.remove === 'function' ? fileSystem.remove.bind(fileSystem) : fs.unlink.bind(fs));

      for (const orphanRel of orphanedTarballs) {
        const orphanAbs = path.join(registryRoot, orphanRel);
        try {
          await unlink(orphanAbs);
          orphansRemoved++;
        } catch (err) {
          // Log warning but continue
        }
      }

      // Remove missing-tarball version entries from index
      for (const item of missing) {
        const pkg = packages[item.package];
        if (pkg && pkg.versions && pkg.versions[item.version]) {
          delete pkg.versions[item.version];
          entriesRemoved++;
          // Clean up empty package entry
          if (Object.keys(pkg.versions).length === 0) {
            delete packages[item.package];
          }
        }
      }

      if (entriesRemoved > 0) {
        await saveRegistryIndex(registryRoot, index, fileSystem);
      }

      fixes = { orphansRemoved, entriesRemoved };
    }

    const healthyVersions = totalVersions - missing.length - integrityMismatches.length;
    const issues = missing.length + integrityMismatches.length + orphanedTarballs.length;

    const payload = {
      success: true,
      registry: options.registry,
      summary: {
        totalPackages: Object.keys(packages).length,
        totalVersions,
        healthyVersions,
        issues
      },
      missing,
      integrityMismatches,
      orphanedTarballs,
      deprecated,
      fixes
    };

    printSceneAuditSummary(options, payload);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene audit failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function printSceneAuditSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const s = payload.summary;
  console.log(chalk.bold(`\nScene Registry Audit: ${payload.registry}`));
  console.log(`  Packages: ${s.totalPackages}  Versions: ${s.totalVersions}  Healthy: ${s.healthyVersions}  Issues: ${s.issues}`);

  if (payload.missing.length > 0) {
    console.log(chalk.yellow(`\n  Missing Tarballs (${payload.missing.length}):`));
    for (const m of payload.missing) {
      console.log(`    - ${m.package}@${m.version}  ${m.tarball}`);
    }
  }

  if (payload.integrityMismatches.length > 0) {
    console.log(chalk.yellow(`\n  Integrity Mismatches (${payload.integrityMismatches.length}):`));
    for (const m of payload.integrityMismatches) {
      console.log(`    - ${m.package}@${m.version}  expected=${m.expected}  actual=${m.actual}`);
    }
  }

  if (payload.orphanedTarballs.length > 0) {
    console.log(chalk.yellow(`\n  Orphaned Tarballs (${payload.orphanedTarballs.length}):`));
    for (const o of payload.orphanedTarballs) {
      console.log(`    - ${o}`);
    }
  }

  if (payload.deprecated.length > 0) {
    console.log(chalk.cyan(`\n  Deprecated Versions (${payload.deprecated.length}):`));
    for (const d of payload.deprecated) {
      console.log(`    - ${d.package}@${d.version}  ${d.message}`);
    }
  }

  if (payload.fixes) {
    console.log(chalk.green(`\n  Fixes Applied:`));
    console.log(`    Orphans removed: ${payload.fixes.orphansRemoved}`);
    console.log(`    Index entries removed: ${payload.fixes.entriesRemoved}`);
  }

  if (s.issues === 0) {
    console.log(chalk.green('\n  Registry is healthy.'));
  }
}

// ---------------------------------------------------------------------------
// Scene Owner (Spec 86-00)
// ---------------------------------------------------------------------------

function normalizeSceneOwnerOptions(options = {}) {
  return {
    action: options.action ? String(options.action).trim() : undefined,
    name: options.name ? String(options.name).trim() : undefined,
    owner: options.owner !== undefined ? String(options.owner).trim() : undefined,
    from: options.from ? String(options.from).trim() : undefined,
    to: options.to ? String(options.to).trim() : undefined,
    remove: options.remove === true,
    registry: options.registry ? String(options.registry).trim() : '.sce/registry',
    json: options.json === true
  };
}

function validateSceneOwnerOptions(options) {
  if (!options.action) return '--action is required';
  const validActions = ['set', 'show', 'list', 'transfer'];
  if (!validActions.includes(options.action)) return `invalid action "${options.action}"`;

  if (options.action === 'set') {
    if (!options.name) return '--name is required';
    if (options.owner === undefined && !options.remove) return '--owner or --remove is required';
  }
  if (options.action === 'show') {
    if (!options.name) return '--name is required';
  }
  if (options.action === 'list') {
    if (options.owner === undefined) return '--owner is required';
  }
  if (options.action === 'transfer') {
    if (!options.name) return '--name is required';
    if (!options.from) return '--from is required';
    if (!options.to) return '--to is required';
  }
  return null;
}

async function runSceneOwnerCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneOwnerOptions(rawOptions);
  const validationError = validateSceneOwnerOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene owner failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const registryRoot = path.isAbsolute(options.registry)
      ? options.registry
      : path.join(projectRoot, options.registry);

    const index = await loadRegistryIndex(registryRoot, fileSystem);
    const packages = index.packages || {};
    let payload;

    if (options.action === 'set') {
      if (!packages[options.name]) {
        throw new Error(`package "${options.name}" not found in registry`);
      }
      const pkg = packages[options.name];
      const removed = options.remove || options.owner === '';
      if (removed) {
        delete pkg.owner;
      } else {
        pkg.owner = options.owner;
      }
      await saveRegistryIndex(registryRoot, index, fileSystem);
      payload = {
        success: true,
        action: 'set',
        package: options.name,
        owner: removed ? null : options.owner,
        removed,
        registry: options.registry
      };
    } else if (options.action === 'show') {
      if (!packages[options.name]) {
        throw new Error(`package "${options.name}" not found in registry`);
      }
      const pkg = packages[options.name];
      payload = {
        success: true,
        action: 'show',
        package: options.name,
        owner: pkg.owner || null,
        registry: options.registry
      };
    } else if (options.action === 'list') {
      const ownerLower = options.owner.toLowerCase();
      const matched = [];
      for (const [pkgName, pkg] of Object.entries(packages)) {
        if (pkg.owner && pkg.owner.toLowerCase() === ownerLower) {
          matched.push(pkgName);
        }
      }
      payload = {
        success: true,
        action: 'list',
        owner: options.owner,
        packages: matched,
        registry: options.registry
      };
    } else if (options.action === 'transfer') {
      if (!packages[options.name]) {
        throw new Error(`package "${options.name}" not found in registry`);
      }
      const pkg = packages[options.name];
      if (!pkg.owner) {
        throw new Error(`package "${options.name}" has no current owner set`);
      }
      if (pkg.owner.toLowerCase() !== options.from.toLowerCase()) {
        throw new Error(`ownership mismatch: current owner is "${pkg.owner}", expected "${options.from}"`);
      }
      pkg.owner = options.to;
      await saveRegistryIndex(registryRoot, index, fileSystem);
      payload = {
        success: true,
        action: 'transfer',
        package: options.name,
        from: options.from,
        to: options.to,
        registry: options.registry
      };
    }

    printSceneOwnerSummary(options, payload);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene owner failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function printSceneOwnerSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (payload.action === 'set') {
    if (payload.removed) {
      console.log(chalk.green(`Owner removed from package "${payload.package}"`));
    } else {
      console.log(chalk.green(`Owner of "${payload.package}" set to "${payload.owner}"`));
    }
  } else if (payload.action === 'show') {
    if (payload.owner) {
      console.log(`Package "${payload.package}" owner: ${payload.owner}`);
    } else {
      console.log(`Package "${payload.package}" has no owner set`);
    }
  } else if (payload.action === 'list') {
    if (payload.packages.length === 0) {
      console.log(`No packages found for owner "${payload.owner}"`);
    } else {
      console.log(`Packages owned by "${payload.owner}" (${payload.packages.length}):`);
      for (const pkg of payload.packages) {
        console.log(`  - ${pkg}`);
      }
    }
  } else if (payload.action === 'transfer') {
    console.log(chalk.green(`Ownership of "${payload.package}" transferred from "${payload.from}" to "${payload.to}"`));
  }
}

// ── Scene Tag ──────────────────────────────────────────────────────────────

function normalizeSceneTagOptions(options = {}) {
  return {
    action: options.action ? String(options.action).trim() : undefined,
    name: options.name ? String(options.name).trim() : undefined,
    tag: options.tag ? String(options.tag).trim() : undefined,
    version: options.version ? String(options.version).trim() : undefined,
    registry: options.registry ? String(options.registry).trim() : '.sce/registry',
    json: options.json === true
  };
}

function validateSceneTagOptions(options) {
  if (!options.action) return '--action is required';
  const validActions = ['add', 'rm', 'ls'];
  if (!validActions.includes(options.action)) return `invalid action "${options.action}"`;

  if (options.action === 'add') {
    if (!options.name) return '--name is required';
    if (!options.tag) return '--tag is required';
    if (!options.version) return '--version is required';
    if (options.tag === 'latest') return '"latest" tag is managed automatically by publish';
  }
  if (options.action === 'rm') {
    if (!options.name) return '--name is required';
    if (!options.tag) return '--tag is required';
    if (options.tag === 'latest') return '"latest" tag is managed automatically by publish';
  }
  if (options.action === 'ls') {
    if (!options.name) return '--name is required';
  }
  return null;
}

async function runSceneTagCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneTagOptions(rawOptions);
  const validationError = validateSceneTagOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene tag failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const registryRoot = path.isAbsolute(options.registry)
      ? options.registry
      : path.join(projectRoot, options.registry);

    const index = await loadRegistryIndex(registryRoot, fileSystem);
    const packages = index.packages || {};
    let payload;

    if (options.action === 'add') {
      if (!packages[options.name]) {
        throw new Error(`package "${options.name}" not found in registry`);
      }
      const pkg = packages[options.name];
      if (!pkg.versions || !pkg.versions[options.version]) {
        throw new Error(`version "${options.version}" not found for package "${options.name}"`);
      }
      if (!pkg.tags) pkg.tags = {};
      pkg.tags[options.tag] = options.version;
      await saveRegistryIndex(registryRoot, index, fileSystem);
      payload = {
        success: true,
        action: 'add',
        package: options.name,
        tag: options.tag,
        version: options.version,
        registry: options.registry
      };
    } else if (options.action === 'rm') {
      if (!packages[options.name]) {
        throw new Error(`package "${options.name}" not found in registry`);
      }
      const pkg = packages[options.name];
      if (!pkg.tags || !pkg.tags[options.tag]) {
        throw new Error(`tag "${options.tag}" not found for package "${options.name}"`);
      }
      delete pkg.tags[options.tag];
      await saveRegistryIndex(registryRoot, index, fileSystem);
      payload = {
        success: true,
        action: 'rm',
        package: options.name,
        tag: options.tag,
        registry: options.registry
      };
    } else if (options.action === 'ls') {
      if (!packages[options.name]) {
        throw new Error(`package "${options.name}" not found in registry`);
      }
      const pkg = packages[options.name];
      const tags = { ...(pkg.tags || {}) };
      payload = {
        success: true,
        action: 'ls',
        package: options.name,
        latest: pkg.latest || null,
        tags,
        registry: options.registry
      };
    }

    printSceneTagSummary(options, payload);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene tag failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function printSceneTagSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (payload.action === 'add') {
    console.log(chalk.green(`Tag "${payload.tag}" set to version "${payload.version}" for package "${payload.package}"`));
  } else if (payload.action === 'rm') {
    console.log(chalk.green(`Tag "${payload.tag}" removed from package "${payload.package}"`));
  } else if (payload.action === 'ls') {
    const tagEntries = Object.entries(payload.tags);
    if (tagEntries.length === 0 && !payload.latest) {
      console.log(`No tags set for package "${payload.package}"`);
    } else {
      console.log(`Tags for package "${payload.package}":`);
      if (payload.latest) {
        console.log(`  latest: ${payload.latest}`);
      }
      for (const [tag, version] of tagEntries) {
        console.log(`  ${tag}: ${version}`);
      }
    }
  }
}

// ── Scene Stats ───────────────────────────────────────────────────────────

function normalizeSceneStatsOptions(options = {}) {
  return {
    registry: options.registry ? String(options.registry).trim() : '.sce/registry',
    json: options.json === true
  };
}

function validateSceneStatsOptions(options) {
  return null;
}

async function runSceneStatsCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneStatsOptions(rawOptions);
  const validationError = validateSceneStatsOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene stats failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const registryRoot = path.isAbsolute(options.registry)
      ? options.registry
      : path.join(projectRoot, options.registry);

    const index = await loadRegistryIndex(registryRoot, fileSystem);
    const packages = index.packages || {};
    const packageNames = Object.keys(packages);

    let totalVersions = 0;
    let totalTags = 0;
    let packagesWithOwner = 0;
    let deprecatedPackages = 0;
    let mostRecent = null;

    for (const name of packageNames) {
      const pkg = packages[name];
      const versions = pkg.versions || {};
      const versionKeys = Object.keys(versions);
      totalVersions += versionKeys.length;
      totalTags += Object.keys(pkg.tags || {}).length;

      if (pkg.owner && String(pkg.owner).trim() !== '') {
        packagesWithOwner++;
      }
      if (pkg.deprecated) {
        deprecatedPackages++;
      }

      for (const ver of versionKeys) {
        const publishedAt = versions[ver].published_at;
        if (publishedAt && (!mostRecent || publishedAt > mostRecent.publishedAt)) {
          mostRecent = { package: name, version: ver, publishedAt };
        }
      }
    }

    const payload = {
      success: true,
      totalPackages: packageNames.length,
      totalVersions,
      totalTags,
      packagesWithOwner,
      packagesWithoutOwner: packageNames.length - packagesWithOwner,
      deprecatedPackages,
      mostRecentlyPublished: mostRecent,
      registry: options.registry
    };

    printSceneStatsSummary(options, payload);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene stats failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function printSceneStatsSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.bold('Registry Statistics'));
  console.log(`  Packages:    ${payload.totalPackages}`);
  console.log(`  Versions:    ${payload.totalVersions}`);
  console.log(`  Tags:        ${payload.totalTags}`);
  console.log(`  With owner:  ${payload.packagesWithOwner}`);
  console.log(`  No owner:    ${payload.packagesWithoutOwner}`);
  console.log(`  Deprecated:  ${payload.deprecatedPackages}`);

  if (payload.mostRecentlyPublished) {
    const mr = payload.mostRecentlyPublished;
    console.log(`  Last publish: ${mr.package}@${mr.version} (${mr.publishedAt})`);
  } else {
    console.log('  Last publish: (none)');
  }
}

// ── Scene Lock ────────────────────────────────────────────────────────────

function normalizeSceneLockOptions(options = {}) {
  return {
    action: options.action ? String(options.action).trim() : undefined,
    name: options.name ? String(options.name).trim() : undefined,
    version: options.version ? String(options.version).trim() : undefined,
    registry: options.registry ? String(options.registry).trim() : '.sce/registry',
    json: options.json === true
  };
}

function validateSceneLockOptions(options) {
  if (!options.action) return '--action is required';
  const validActions = ['set', 'rm', 'ls'];
  if (!validActions.includes(options.action)) return `invalid action "${options.action}"`;

  if (options.action === 'set') {
    if (!options.name) return '--name is required';
    if (!options.version) return '--version is required';
  }
  if (options.action === 'rm') {
    if (!options.name) return '--name is required';
    if (!options.version) return '--version is required';
  }
  if (options.action === 'ls') {
    if (!options.name) return '--name is required';
  }
  return null;
}

async function runSceneLockCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneLockOptions(rawOptions);
  const validationError = validateSceneLockOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene lock failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const registryRoot = path.isAbsolute(options.registry)
      ? options.registry
      : path.join(projectRoot, options.registry);

    const index = await loadRegistryIndex(registryRoot, fileSystem);
    const packages = index.packages || {};
    let payload;

    if (options.action === 'set') {
      if (!packages[options.name]) {
        throw new Error(`package "${options.name}" not found in registry`);
      }
      const pkg = packages[options.name];
      if (!pkg.versions || !pkg.versions[options.version]) {
        throw new Error(`version "${options.version}" not found for package "${options.name}"`);
      }
      const versionEntry = pkg.versions[options.version];
      if (versionEntry.locked === true) {
        throw new Error(`version "${options.version}" of package "${options.name}" is already locked`);
      }
      versionEntry.locked = true;
      await saveRegistryIndex(registryRoot, index, fileSystem);
      payload = {
        success: true,
        action: 'set',
        package: options.name,
        version: options.version,
        registry: options.registry
      };
    } else if (options.action === 'rm') {
      if (!packages[options.name]) {
        throw new Error(`package "${options.name}" not found in registry`);
      }
      const pkg = packages[options.name];
      if (!pkg.versions || !pkg.versions[options.version]) {
        throw new Error(`version "${options.version}" not found for package "${options.name}"`);
      }
      const versionEntry = pkg.versions[options.version];
      if (!versionEntry.locked) {
        throw new Error(`version "${options.version}" of package "${options.name}" is not locked`);
      }
      delete versionEntry.locked;
      await saveRegistryIndex(registryRoot, index, fileSystem);
      payload = {
        success: true,
        action: 'rm',
        package: options.name,
        version: options.version,
        registry: options.registry
      };
    } else if (options.action === 'ls') {
      if (!packages[options.name]) {
        throw new Error(`package "${options.name}" not found in registry`);
      }
      const pkg = packages[options.name];
      const versions = pkg.versions || {};
      const lockedVersions = Object.keys(versions).filter(v => versions[v].locked === true);
      payload = {
        success: true,
        action: 'ls',
        package: options.name,
        lockedVersions,
        registry: options.registry
      };
    }

    printSceneLockSummary(options, payload);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene lock failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function printSceneLockSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (payload.action === 'set') {
    console.log(chalk.green(`Version "${payload.version}" of package "${payload.package}" is now locked`));
  } else if (payload.action === 'rm') {
    console.log(chalk.green(`Version "${payload.version}" of package "${payload.package}" is now unlocked`));
  } else if (payload.action === 'ls') {
    if (payload.lockedVersions.length === 0) {
      console.log(`No locked versions for package "${payload.package}"`);
    } else {
      console.log(`Locked versions for package "${payload.package}":`);
      for (const version of payload.lockedVersions) {
        console.log(`  ${version}`);
      }
    }
  }
}

// ── Scene Connect ─────────────────────────────────────────────────────────

function normalizeSceneConnectOptions(options = {}) {
  return {
    config: options.config ? String(options.config).trim() : undefined,
    registry: options.registry ? String(options.registry).trim() : '.sce/registry',
    json: options.json === true
  };
}

function validateSceneConnectOptions(options) {
  return null;
}

async function runSceneConnectCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneConnectOptions(rawOptions);
  const validationError = validateSceneConnectOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene connect failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  let client = null;
  try {
    const configResult = loadAdapterConfig(options.config, projectRoot);
    if (configResult.error) {
      throw new Error(configResult.error);
    }

    const validation = validateAdapterConfig(configResult.config);
    if (!validation.valid) {
      throw new Error(`config validation failed: ${validation.errors.join(', ')}`);
    }

    const config = configResult.config;
    client = new MoquiClient(config);
    const loginResult = await client.login();

    let payload;
    if (loginResult.success) {
      payload = {
        success: true,
        baseUrl: config.baseUrl,
        authStatus: 'authenticated'
      };
    } else {
      payload = {
        success: false,
        baseUrl: config.baseUrl,
        error: { code: 'AUTH_FAILED', message: loginResult.error || 'authentication failed' }
      };
    }

    printSceneConnectSummary(options, payload);
    return payload;
  } catch (error) {
    const payload = {
      success: false,
      baseUrl: rawOptions.config || 'unknown',
      error: { code: 'CONNECT_FAILED', message: error.message }
    };
    printSceneConnectSummary(options, payload);
    process.exitCode = 1;
    return payload;
  } finally {
    if (client) {
      try { await client.dispose(); } catch (_) { /* ignore dispose errors */ }
    }
  }
}

function printSceneConnectSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (payload.success) {
    console.log(chalk.green(`Connected to Moqui ERP at ${payload.baseUrl}`));
    console.log(`  Auth status: ${payload.authStatus}`);
  } else {
    console.error(chalk.red(`Connection failed: ${payload.error.message}`));
    if (payload.baseUrl && payload.baseUrl !== 'unknown') {
      console.error(`  Target: ${payload.baseUrl}`);
    }
  }
}

// ── Scene Discover ────────────────────────────────────────────────────────

function normalizeSceneDiscoverOptions(options = {}) {
  return {
    config: options.config ? String(options.config).trim() : undefined,
    type: options.type ? String(options.type).trim() : undefined,
    json: options.json === true
  };
}

function validateSceneDiscoverOptions(options) {
  if (options.type && !['entities', 'services', 'screens'].includes(options.type)) {
    return `invalid --type "${options.type}", must be entities, services, or screens`;
  }
  return null;
}

async function runSceneDiscoverCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneDiscoverOptions(rawOptions);
  const validationError = validateSceneDiscoverOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene discover failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  let client = null;
  try {
    const configResult = loadAdapterConfig(options.config, projectRoot);
    if (configResult.error) {
      throw new Error(configResult.error);
    }

    const validation = validateAdapterConfig(configResult.config);
    if (!validation.valid) {
      throw new Error(`config validation failed: ${validation.errors.join(', ')}`);
    }

    const config = configResult.config;
    client = new MoquiClient(config);
    const loginResult = await client.login();

    if (!loginResult.success) {
      throw new Error(loginResult.error || 'authentication failed');
    }

    let payload;

    if (options.type) {
      // Query specific catalog type
      const endpoint = options.type === 'entities'
        ? '/api/v1/entities'
        : options.type === 'services'
          ? '/api/v1/services'
          : '/api/v1/screens';

      const response = await client.request('GET', endpoint);
      const rawData = (response && response.data) || {};
      const items = Array.isArray(rawData) ? rawData : (rawData[options.type] || rawData.items || []);
      payload = {
        success: true,
        type: options.type,
        [options.type]: Array.isArray(items) ? items : [],
        count: Array.isArray(items) ? items.length : 0
      };
    } else {
      // Query all catalog types for summary
      const [entitiesRes, servicesRes, screensRes] = await Promise.all([
        client.request('GET', '/api/v1/entities').catch(() => null),
        client.request('GET', '/api/v1/services').catch(() => null),
        client.request('GET', '/api/v1/screens').catch(() => null)
      ]);

      const entitiesRaw = (entitiesRes && entitiesRes.data) || {};
      const servicesRaw = (servicesRes && servicesRes.data) || {};
      const screensRaw = (screensRes && screensRes.data) || {};
      const entitiesData = Array.isArray(entitiesRaw) ? entitiesRaw : (entitiesRaw.entities || entitiesRaw.items || []);
      const servicesData = Array.isArray(servicesRaw) ? servicesRaw : (servicesRaw.services || servicesRaw.items || []);
      const screensData = Array.isArray(screensRaw) ? screensRaw : (screensRaw.screens || screensRaw.items || []);

      payload = {
        success: true,
        summary: {
          entities: { count: Array.isArray(entitiesData) ? entitiesData.length : 0 },
          services: { count: Array.isArray(servicesData) ? servicesData.length : 0 },
          screens: { count: Array.isArray(screensData) ? screensData.length : 0 }
        }
      };
    }

    printSceneDiscoverSummary(options, payload);
    return payload;
  } catch (error) {
    const payload = {
      success: false,
      error: { code: 'DISCOVER_FAILED', message: error.message }
    };
    printSceneDiscoverSummary(options, payload);
    process.exitCode = 1;
    return payload;
  } finally {
    if (client) {
      try { await client.dispose(); } catch (_) { /* ignore dispose errors */ }
    }
  }
}

function printSceneDiscoverSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (!payload.success) {
    console.error(chalk.red(`Discovery failed: ${payload.error.message}`));
    return;
  }

  if (payload.summary) {
    console.log(chalk.green('Moqui ERP catalog summary:'));
    console.log(`  Entities: ${payload.summary.entities.count}`);
    console.log(`  Services: ${payload.summary.services.count}`);
    console.log(`  Screens:  ${payload.summary.screens.count}`);
  } else {
    console.log(chalk.green(`Discovered ${payload.count} ${payload.type}:`));
    const items = payload[payload.type] || [];
    for (const item of items.slice(0, 50)) {
      const name = typeof item === 'string' ? item : (item.name || item.entityName || JSON.stringify(item));
      console.log(`  ${name}`);
    }
    if (items.length > 50) {
      console.log(`  ... and ${items.length - 50} more`);
    }
  }
}

// ─── Scene Extract CLI Functions ──────────────────────────────────

function normalizeSceneExtractOptions(options = {}) {
  return {
    config: options.config ? String(options.config).trim() : undefined,
    type: options.type ? String(options.type).trim() : undefined,
    pattern: options.pattern ? String(options.pattern).trim() : undefined,
    out: options.out ? String(options.out).trim() : '.sce/templates/extracted',
    dryRun: options.dryRun === true,
    json: options.json === true
  };
}

function validateSceneExtractOptions(options) {
  if (options.type && !['entities', 'services', 'screens'].includes(options.type)) {
    return `invalid --type "${options.type}", must be entities, services, or screens`;
  }
  if (options.pattern && !EXTRACTOR_SUPPORTED_PATTERNS.includes(options.pattern)) {
    return `invalid --pattern "${options.pattern}", must be one of: ${EXTRACTOR_SUPPORTED_PATTERNS.join(', ')}`;
  }
  return null;
}

function printSceneExtractSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (!payload.success) {
    console.error(chalk.red(`Extraction failed: ${payload.error.message}`));
    return;
  }

  const summary = payload.summary || {};
  const patterns = summary.patterns || {};

  console.log(chalk.green(`Extracted ${summary.totalTemplates || 0} template(s):`));
  console.log(`  CRUD:     ${patterns.crud || 0}`);
  console.log(`  Query:    ${patterns.query || 0}`);
  console.log(`  Workflow: ${patterns.workflow || 0}`);

  if (options.dryRun) {
    console.log(chalk.yellow('  (dry-run — no files written)'));
  } else {
    console.log(`  Output:   ${summary.outputDir || options.out}`);
  }

  if (payload.warnings && payload.warnings.length > 0) {
    console.log(chalk.yellow(`  Warnings: ${payload.warnings.length}`));
    for (const w of payload.warnings) {
      console.log(chalk.yellow(`    - ${w}`));
    }
  }
}

async function runSceneExtractCommand(rawOptions = {}, dependencies = {}) {
  const options = normalizeSceneExtractOptions(rawOptions);
  const validationError = validateSceneExtractOptions(options);

  if (validationError) {
    console.error(chalk.red(validationError));
    process.exitCode = 1;
    return null;
  }

  try {
    const payload = await runExtraction({
      config: options.config,
      type: options.type,
      pattern: options.pattern,
      out: options.out,
      dryRun: options.dryRun
    }, dependencies);

    if (!payload.success) {
      process.exitCode = 1;
    }

    printSceneExtractSummary(options, payload);
    return payload;
  } catch (error) {
    const payload = {
      success: false,
      templates: [],
      summary: { totalTemplates: 0, patterns: { crud: 0, query: 0, workflow: 0 }, outputDir: options.out },
      warnings: [],
      error: { code: 'EXTRACT_FAILED', message: error.message }
    };
    printSceneExtractSummary(options, payload);
    process.exitCode = 1;
    return payload;
  }
}

// ── scene lint ──────────────────────────────────────────────────

function normalizeSceneLintOptions(options = {}) {
  return {
    package: options.package ? String(options.package).trim() : '.',
    json: options.json === true,
    strict: options.strict === true
  };
}

function validateSceneLintOptions(options) {
  // package directory existence checked at runtime
  return null;
}

async function runSceneLintCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneLintOptions(rawOptions);
  const validationError = validateSceneLintOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene lint failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    // 1. Resolve package directory
    const packageDir = path.isAbsolute(options.package)
      ? options.package
      : path.join(projectRoot, options.package);

    // 2. Run lint checks
    const lintResult = await lintScenePackage(packageDir, { fileSystem });

    // 3. Determine success
    let success = lintResult.valid;

    // 4. Strict mode: treat warnings as errors
    if (options.strict && lintResult.warnings.length > 0) {
      success = false;
    }

    // 5. Build payload
    const payload = {
      success,
      strict: options.strict,
      packageDir: formatScenePackagePath(projectRoot, packageDir),
      lintResult
    };

    if (!success) {
      process.exitCode = 1;
    }

    // 6. Print summary
    printSceneLintSummary(options, payload, projectRoot);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene lint failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function printSceneLintSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const lintResult = payload.lintResult;
  const strictLabel = payload.strict ? chalk.yellow(' [strict]') : '';
  console.log(chalk.blue('Scene Lint: ') + payload.packageDir + strictLabel);
  console.log(`  Errors:   ${lintResult.summary.error_count}`);
  console.log(`  Warnings: ${lintResult.summary.warning_count}`);
  console.log(`  Info:     ${lintResult.summary.info_count}`);

  const items = [].concat(lintResult.errors, lintResult.warnings, lintResult.info);
  if (items.length > 0) {
    console.log('');
    for (const item of items) {
      const icon = item.level === 'error' ? chalk.red('✖')
        : item.level === 'warning' ? chalk.yellow('⚠')
          : chalk.blue('ℹ');
      console.log(`  ${icon} [${item.code}] ${item.message}`);
    }
  }

  console.log('');
  if (payload.success) {
    console.log(chalk.green('  ✔ Lint passed'));
  } else {
    console.log(chalk.red('  ✖ Lint failed'));
  }
}

// ── scene score ──────────────────────────────────────────────────

function normalizeSceneScoreOptions(options = {}) {
  return {
    package: options.package ? String(options.package).trim() : '.',
    json: options.json === true,
    threshold: typeof options.threshold === 'number' ? options.threshold : 60
  };
}

function validateSceneScoreOptions(options) {
  if (typeof options.threshold !== 'number' || options.threshold < 0 || options.threshold > 100) {
    return 'threshold must be a number between 0 and 100';
  }
  return null;
}

async function runSceneScoreCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneScoreOptions(rawOptions);
  const validationError = validateSceneScoreOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene score failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    // 1. Resolve package directory
    const packageDir = path.isAbsolute(options.package)
      ? options.package
      : path.join(projectRoot, options.package);

    // 2. Run lint checks
    const lintResult = await lintScenePackage(packageDir, { fileSystem });

    // 3. Calculate quality score
    const scoreResult = calculateQualityScore(lintResult, { threshold: options.threshold });

    // 4. Build payload
    const payload = {
      success: scoreResult.pass,
      packageDir: formatScenePackagePath(projectRoot, packageDir),
      scoreResult,
      lintResult
    };

    if (!payload.success) {
      process.exitCode = 1;
    }

    // 5. Print summary
    printSceneScoreSummary(options, payload, projectRoot);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene score failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function printSceneScoreSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const scoreResult = payload.scoreResult;
  const dims = scoreResult.dimensions;
  const scoreColor = scoreResult.pass ? chalk.green : chalk.red;

  console.log(chalk.blue('Scene Score: ') + payload.packageDir);
  console.log(`  Total:     ${scoreColor(scoreResult.score + '/100')}`);
  console.log(`  Threshold: ${scoreResult.threshold}`);
  console.log(`  Status:    ${scoreResult.pass ? chalk.green('PASS') : chalk.red('FAIL')}`);
  console.log('');
  console.log('  Dimensions:');
  console.log(`    Contract Validity:        ${dims.contract_validity.score}/${dims.contract_validity.max}`);
  console.log(`    Lint Pass Rate:           ${dims.lint_pass_rate.score}/${dims.lint_pass_rate.max}`);
  console.log(`    Documentation Quality:    ${dims.documentation_quality.score}/${dims.documentation_quality.max}`);
  console.log(`    Governance Completeness:  ${dims.governance_completeness.score}/${dims.governance_completeness.max}`);
}

// ── scene contribute ──────────────────────────────────────────────────

function normalizeSceneContributeOptions(options = {}) {
  return {
    package: options.package ? String(options.package).trim() : '.',
    registry: options.registry ? String(options.registry).trim() : '.sce/registry',
    dryRun: options.dryRun === true,
    strict: options.strict === true,
    json: options.json === true,
    skipLint: options.skipLint === true,
    force: options.force === true
  };
}

function validateSceneContributeOptions(options) {
  return null;
}

async function runSceneContributeCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeSceneContributeOptions(rawOptions);
  const validationError = validateSceneContributeOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene contribute failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  const readFile = typeof fileSystem.readFile === 'function'
    ? fileSystem.readFile.bind(fileSystem)
    : fs.readFile.bind(fs);

  try {
    // Resolve paths
    const packageDir = path.isAbsolute(options.package)
      ? options.package
      : path.join(projectRoot, options.package);
    const registryRoot = path.isAbsolute(options.registry)
      ? options.registry
      : path.join(projectRoot, options.registry);

    // Initialize result structure
    const result = {
      success: false,
      published: false,
      dry_run: options.dryRun,
      stages: {
        validation: { passed: false, errors: [], warnings: [] },
        lint: { passed: false, skipped: false, result: null },
        score: { passed: false, skipped: false, result: null },
        publish: { completed: false, skipped: false, overwritten: false, coordinate: null, tarball: null }
      }
    };

    // ── Stage 1: Validate contract ──
    const pkgValidation = await validatePackageForPublish(packageDir, fileSystem);
    if (!pkgValidation.valid) {
      result.stages.validation.errors = pkgValidation.errors || [];
      process.exitCode = 1;
      printSceneContributeSummary(options, result, projectRoot);
      return result;
    }
    result.stages.validation.passed = true;
    result.stages.validation.warnings = pkgValidation.warnings || [];

    const contract = pkgValidation.contract;

    // ── Stage 2: Lint (unless --skip-lint) ──
    if (options.skipLint) {
      result.stages.lint.skipped = true;
      result.stages.score.skipped = true;
    } else {
      const lintResult = await lintScenePackage(packageDir, { fileSystem });
      result.stages.lint.result = lintResult;

      let lintPassed = lintResult.valid;
      if (options.strict && lintResult.warnings.length > 0) {
        lintPassed = false;
      }
      result.stages.lint.passed = lintPassed;

      if (!lintPassed) {
        process.exitCode = 1;
        printSceneContributeSummary(options, result, projectRoot);
        return result;
      }

      // ── Stage 3: Score ──
      const scoreResult = calculateQualityScore(lintResult, { threshold: 60 });
      result.stages.score.result = scoreResult;
      result.stages.score.passed = scoreResult.pass;
    }

    // ── Stage 4: Preview (always happens — info is in the print) ──
    // (Preview is handled by printSceneContributeSummary)

    // ── Stage 5: Publish (unless --dry-run) ──
    if (options.dryRun) {
      result.stages.publish.skipped = true;
      result.success = true;
      printSceneContributeSummary(options, result, projectRoot);
      return result;
    }

    const metadata = contract.metadata || {};
    const name = String(metadata.name || '').trim();
    const version = String(metadata.version || '').trim();

    // Read all files for tarball
    const files = [];
    const contractPath = path.join(packageDir, 'scene-package.json');
    const contractBuffer = await readFile(contractPath);
    files.push({ relativePath: 'scene-package.json', content: contractBuffer });

    for (const fileRef of pkgValidation.files) {
      const buffer = await readFile(fileRef.absolutePath);
      files.push({ relativePath: fileRef.relativePath, content: buffer });
    }

    // Bundle and store
    const bundle = bundlePackageTarball(files);
    const storeResult = await storeToRegistry(name, version, bundle.tarball, registryRoot, options, fileSystem);

    // Update registry index
    const publishedAt = new Date().toISOString();
    const index = await loadRegistryIndex(registryRoot, fileSystem);
    addVersionToIndex(index, contract, bundle.integrity, publishedAt);
    await saveRegistryIndex(registryRoot, index, fileSystem);

    const coordinate = buildScenePackageCoordinate(contract);
    const tarballRelativePath = buildRegistryTarballPath(name, version);
    const tarballAbsolutePath = path.join(registryRoot, tarballRelativePath);

    result.stages.publish.completed = true;
    result.stages.publish.overwritten = storeResult.overwritten;
    result.stages.publish.coordinate = coordinate;
    result.stages.publish.tarball = {
      path: formatScenePackagePath(projectRoot, tarballAbsolutePath),
      size: bundle.size,
      file_count: bundle.fileCount,
      integrity: bundle.integrity
    };

    result.success = true;
    result.published = true;

    printSceneContributeSummary(options, result, projectRoot);
    return result;
  } catch (error) {
    console.error(chalk.red('Scene contribute failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function printSceneContributeSummary(options, payload, projectRoot = process.cwd()) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.blue('Scene Contribute Pipeline'));

  // Stage 1: Validation
  if (payload.stages.validation.passed) {
    console.log(chalk.green('  ✔ Validation passed'));
  } else {
    console.log(chalk.red('  ✖ Validation failed'));
    for (const err of payload.stages.validation.errors) {
      console.log(chalk.red(`    - ${err}`));
    }
    return;
  }

  // Stage 2: Lint
  if (payload.stages.lint.skipped) {
    console.log(chalk.gray('  ⊘ Lint skipped (--skip-lint)'));
  } else if (payload.stages.lint.passed) {
    const lr = payload.stages.lint.result;
    console.log(chalk.green(`  ✔ Lint passed (${lr.summary.error_count} errors, ${lr.summary.warning_count} warnings)`));
  } else {
    const lr = payload.stages.lint.result;
    console.log(chalk.red(`  ✖ Lint failed (${lr.summary.error_count} errors, ${lr.summary.warning_count} warnings)`));
    return;
  }

  // Stage 3: Score
  if (payload.stages.score.skipped) {
    console.log(chalk.gray('  ⊘ Score skipped'));
  } else if (payload.stages.score.result) {
    const sr = payload.stages.score.result;
    const scoreColor = sr.pass ? chalk.green : chalk.yellow;
    console.log(scoreColor(`  ${sr.pass ? '✔' : '⚠'} Score: ${sr.score}/100 (threshold: ${sr.threshold})`));
  }

  // Stage 4/5: Publish
  if (payload.stages.publish.skipped) {
    console.log(chalk.gray('  ⊘ Publish skipped (--dry-run)'));
  } else if (payload.stages.publish.completed) {
    console.log(chalk.green(`  ✔ Published: ${payload.stages.publish.coordinate}`));
    if (payload.stages.publish.tarball) {
      console.log(`    Size: ${payload.stages.publish.tarball.size} bytes, Files: ${payload.stages.publish.tarball.file_count}`);
    }
  }

  // Final status
  console.log('');
  if (payload.success) {
    console.log(chalk.green('  ✔ Contribute pipeline completed successfully'));
  } else {
    console.log(chalk.red('  ✖ Contribute pipeline failed'));
  }
}

// ── scene ontology ──────────────────────────────────────────────────

function normalizeOntologyOptions(options = {}) {
  return {
    package: options.package ? String(options.package).trim() : '.',
    json: options.json === true,
    ref: options.ref ? String(options.ref).trim() : null
  };
}

function validateOntologyOptions(options, requireRef = false) {
  if (requireRef && !options.ref) {
    return '--ref is required';
  }
  return null;
}

function normalizeOntologyRelationTypes(rawValue, defaults = []) {
  const fallback = Array.isArray(defaults) ? defaults.slice() : [];

  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }

  if (Array.isArray(rawValue)) {
    return rawValue
      .flatMap((entry) => normalizeOntologyRelationTypes(entry, []))
      .filter((entry, index, all) => all.indexOf(entry) === index);
  }

  return String(rawValue)
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry, index, all) => entry.length > 0 && all.indexOf(entry) === index);
}

function validateOntologyRelationTypes(relationTypes) {
  if (!Array.isArray(relationTypes) || relationTypes.length === 0) {
    return '--relation must include at least one relation type';
  }

  const invalidTypes = relationTypes.filter((type) => !VALID_RELATION_TYPES.includes(type));
  if (invalidTypes.length > 0) {
    return `--relation contains invalid type(s): ${invalidTypes.join(', ')}`;
  }

  return null;
}

function validateScenePackagePublishBatchOptions(options) {
  if (!options.manifest || typeof options.manifest !== 'string') {
    return '--manifest is required';
  }

  if (!options.manifestSpecPath || typeof options.manifestSpecPath !== 'string') {
    return '--manifest-spec-path must be a non-empty path selector';
  }

  if (!options.outDir || typeof options.outDir !== 'string') {
    return '--out-dir must be a non-empty path';
  }

  if (!options.fallbackSpecPackage || typeof options.fallbackSpecPackage !== 'string' || path.isAbsolute(options.fallbackSpecPackage)) {
    return '--fallback-spec-package must be a non-empty relative path';
  }

  if (!options.fallbackSceneManifest || typeof options.fallbackSceneManifest !== 'string' || path.isAbsolute(options.fallbackSceneManifest)) {
    return '--fallback-scene-manifest must be a non-empty relative path';
  }

  if (options.status && typeof options.status !== 'string') {
    return '--status must be a string';
  }

  if (options.ontologyReportOut !== undefined && (typeof options.ontologyReportOut !== 'string' || options.ontologyReportOut.trim().length === 0)) {
    return '--ontology-report-out must be a non-empty path';
  }

  if (options.ontologyTaskOut !== undefined && (typeof options.ontologyTaskOut !== 'string' || options.ontologyTaskOut.trim().length === 0)) {
    return '--ontology-task-out must be a non-empty path';
  }

  if (options.ontologyTaskQueueOut !== undefined && (typeof options.ontologyTaskQueueOut !== 'string' || options.ontologyTaskQueueOut.trim().length === 0)) {
    return '--ontology-task-queue-out must be a non-empty path';
  }

  if (options.ontologyMinScore !== undefined && options.ontologyMinScore !== null
    && (!Number.isFinite(options.ontologyMinScore) || options.ontologyMinScore < 0 || options.ontologyMinScore > 100)) {
    return '--ontology-min-score must be a number between 0 and 100';
  }

  if (options.ontologyMinAverageScore !== undefined && options.ontologyMinAverageScore !== null
    && (!Number.isFinite(options.ontologyMinAverageScore) || options.ontologyMinAverageScore < 0 || options.ontologyMinAverageScore > 100)) {
    return '--ontology-min-average-score must be a number between 0 and 100';
  }

  if (options.ontologyMinValidRate !== undefined && options.ontologyMinValidRate !== null
    && (!Number.isFinite(options.ontologyMinValidRate) || options.ontologyMinValidRate < 0 || options.ontologyMinValidRate > 100)) {
    return '--ontology-min-valid-rate must be a number between 0 and 100';
  }

  return null;
}

function validateScenePackageOntologyBackfillBatchOptions(options) {
  if (!options.manifest || typeof options.manifest !== 'string') {
    return '--manifest is required';
  }

  if (!options.manifestSpecPath || typeof options.manifestSpecPath !== 'string') {
    return '--manifest-spec-path must be a non-empty path selector';
  }

  if (!options.specPackagePath || typeof options.specPackagePath !== 'string' || path.isAbsolute(options.specPackagePath)) {
    return '--spec-package-path must be a non-empty relative path';
  }

  if (options.status && typeof options.status !== 'string') {
    return '--status must be a string';
  }

  if (options.outReport !== undefined && (typeof options.outReport !== 'string' || options.outReport.trim().length === 0)) {
    return '--out-report must be a non-empty path';
  }

  return null;
}

function normalizeOntologyImpactOptions(options = {}) {
  const base = normalizeOntologyOptions(options);
  return {
    ...base,
    relationTypes: normalizeOntologyRelationTypes(options.relation, ['depends_on']),
    maxDepth: options.maxDepth === undefined || options.maxDepth === null || options.maxDepth === ''
      ? null
      : Number(options.maxDepth)
  };
}

function validateOntologyImpactOptions(options) {
  const baseError = validateOntologyOptions(options, true);
  if (baseError) return baseError;

  const relationError = validateOntologyRelationTypes(options.relationTypes);
  if (relationError) return relationError;

  if (options.maxDepth !== null && (!Number.isInteger(options.maxDepth) || options.maxDepth < 1)) {
    return '--max-depth must be an integer >= 1';
  }

  return null;
}

function normalizeOntologyPathOptions(options = {}) {
  return {
    package: options.package ? String(options.package).trim() : '.',
    json: options.json === true,
    from: options.from ? String(options.from).trim() : null,
    to: options.to ? String(options.to).trim() : null,
    relationTypes: normalizeOntologyRelationTypes(options.relation, VALID_RELATION_TYPES),
    undirected: options.undirected === true
  };
}

function validateOntologyPathOptions(options) {
  if (!options.from) {
    return '--from is required';
  }
  if (!options.to) {
    return '--to is required';
  }

  return validateOntologyRelationTypes(options.relationTypes);
}

async function runSceneOntologyShowCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeOntologyOptions(rawOptions);
  const validationError = validateOntologyOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene ontology show failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const packageDir = path.isAbsolute(options.package)
      ? options.package
      : path.join(projectRoot, options.package);

    const contract = await fileSystem.readJson(path.resolve(packageDir, 'scene-package.json'));
    const graph = buildOntologyFromManifest(contract);
    const payload = { success: true, packageDir, graph: graph.toJSON() };

    printSceneOntologyShowSummary(options, payload);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene ontology show failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function printSceneOntologyShowSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const graph = payload.graph;
  console.log(chalk.blue('Ontology Graph: ') + payload.packageDir);
  console.log(`  Nodes: ${graph.nodes.length}`);
  console.log(`  Edges: ${graph.edges.length}`);

  if (graph.nodes.length > 0) {
    console.log('');
    console.log(chalk.blue('  Nodes:'));
    for (const node of graph.nodes) {
      const typeLabel = node.metadata && node.metadata.type ? ` (${node.metadata.type})` : '';
      console.log(`    ${chalk.white(node.ref)}${typeLabel}`);
    }
  }

  if (graph.edges.length > 0) {
    console.log('');
    console.log(chalk.blue('  Edges:'));
    for (const edge of graph.edges) {
      console.log(`    ${edge.source} --[${edge.type}]--> ${edge.target}`);
    }
  }
}

async function runSceneOntologyDepsCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeOntologyOptions(rawOptions);
  const validationError = validateOntologyOptions(options, true);

  if (validationError) {
    console.error(chalk.red(`Scene ontology deps failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const packageDir = path.isAbsolute(options.package)
      ? options.package
      : path.join(projectRoot, options.package);

    const contract = await fileSystem.readJson(path.resolve(packageDir, 'scene-package.json'));
    const graph = buildOntologyFromManifest(contract);
    const result = queryDependencyChain(graph, options.ref);
    const payload = { success: !result.error, packageDir, result };

    if (result.error) {
      process.exitCode = 1;
    }

    printSceneOntologyDepsSummary(options, payload);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene ontology deps failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function printSceneOntologyDepsSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const result = payload.result;
  if (result.error) {
    console.log(chalk.red('Dependency chain error: ') + result.error);
    return;
  }

  console.log(chalk.blue('Dependency Chain: ') + result.ref);
  if (result.hasCycle) {
    console.log(chalk.yellow('  ⚠ Cycle detected in dependency chain'));
  }

  if (result.chain.length === 0) {
    console.log('  No dependencies');
  } else {
    for (const dep of result.chain) {
      console.log(`  → ${dep}`);
    }
  }
}

async function runSceneOntologyImpactCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeOntologyImpactOptions(rawOptions);
  const validationError = validateOntologyImpactOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene ontology impact failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const packageDir = path.isAbsolute(options.package)
      ? options.package
      : path.join(projectRoot, options.package);

    const contract = await fileSystem.readJson(path.resolve(packageDir, 'scene-package.json'));
    const graph = buildOntologyFromManifest(contract);
    const result = findImpactRadius(graph, options.ref, {
      relationTypes: options.relationTypes,
      maxDepth: options.maxDepth
    });
    const payload = {
      success: !result.error,
      packageDir,
      criteria: {
        ref: options.ref,
        relationTypes: options.relationTypes,
        maxDepth: options.maxDepth
      },
      result
    };

    if (result.error) {
      process.exitCode = 1;
    }

    printSceneOntologyImpactSummary(options, payload);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene ontology impact failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function printSceneOntologyImpactSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const result = payload.result;
  if (result.error) {
    console.log(chalk.red('Impact analysis error: ') + result.error);
    return;
  }

  console.log(chalk.blue('Impact Radius: ') + result.ref);
  console.log(`  Relation Types: ${result.relationTypes.join(', ')}`);
  if (result.maxDepth !== null) {
    console.log(`  Max Depth: ${result.maxDepth}`);
  }
  console.log(`  Impacted Refs: ${result.total}`);

  if (result.details.length === 0) {
    console.log('  No impacted refs found');
    return;
  }

  for (const entry of result.details) {
    console.log(`  [d${entry.depth}] ${entry.ref} <=[${entry.via}]= ${entry.through}`);
  }
}

async function runSceneOntologyPathCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeOntologyPathOptions(rawOptions);
  const validationError = validateOntologyPathOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene ontology path failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const packageDir = path.isAbsolute(options.package)
      ? options.package
      : path.join(projectRoot, options.package);

    const contract = await fileSystem.readJson(path.resolve(packageDir, 'scene-package.json'));
    const graph = buildOntologyFromManifest(contract);
    const result = findRelationPath(graph, options.from, options.to, {
      relationTypes: options.relationTypes,
      undirected: options.undirected
    });
    const payload = {
      success: result.found && !result.error,
      packageDir,
      criteria: {
        from: options.from,
        to: options.to,
        relationTypes: options.relationTypes,
        undirected: options.undirected
      },
      result
    };

    if (result.error || !result.found) {
      process.exitCode = 1;
    }

    printSceneOntologyPathSummary(options, payload);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene ontology path failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function printSceneOntologyPathSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const result = payload.result;
  if (result.error) {
    console.log(chalk.red('Path query error: ') + result.error);
    return;
  }

  console.log(chalk.blue('Relation Path: ') + `${result.from} -> ${result.to}`);
  console.log(`  Relation Types: ${result.relationTypes.join(', ')}`);
  console.log(`  Undirected: ${result.undirected ? 'yes' : 'no'}`);

  if (!result.found) {
    console.log('  No path found');
    return;
  }

  console.log(`  Hops: ${result.hops}`);
  console.log(`  Node Path: ${result.nodes.join(' -> ')}`);
  if (result.edges.length > 0) {
    console.log(chalk.blue('  Edge Path:'));
    for (const edge of result.edges) {
      console.log(`    ${edge.source} --[${edge.type}|${edge.direction}]--> ${edge.target}`);
    }
  }
}

async function runSceneOntologyValidateCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeOntologyOptions(rawOptions);
  const validationError = validateOntologyOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene ontology validate failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const packageDir = path.isAbsolute(options.package)
      ? options.package
      : path.join(projectRoot, options.package);

    const contract = await fileSystem.readJson(path.resolve(packageDir, 'scene-package.json'));
    const graph = buildOntologyFromManifest(contract);
    const result = validateOntology(graph);
    const semanticQuality = evaluateOntologySemanticQuality(contract);
    const payload = { success: result.valid, packageDir, result, semantic_quality: semanticQuality };

    if (!result.valid) {
      process.exitCode = 1;
    }

    printSceneOntologyValidateSummary(options, payload);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene ontology validate failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function printSceneOntologyValidateSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const result = payload.result;
  console.log(chalk.blue('Ontology Validation: ') + payload.packageDir);

  if (result.valid) {
    console.log(chalk.green('  ✔ Ontology graph is consistent'));
  } else {
    console.log(chalk.red(`  ✖ ${result.errors.length} issue(s) found`));
    for (const err of result.errors) {
      console.log(`    ${chalk.red('✖')} [${err.code}] ${err.message}`);
    }
  }

  if (payload.semantic_quality && Number.isFinite(Number(payload.semantic_quality.score))) {
    console.log(`  Semantic quality score: ${payload.semantic_quality.score} (${payload.semantic_quality.level})`);
  }
}

async function runSceneOntologyActionsCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeOntologyOptions(rawOptions);
  const validationError = validateOntologyOptions(options, true);

  if (validationError) {
    console.error(chalk.red(`Scene ontology actions failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const packageDir = path.isAbsolute(options.package)
      ? options.package
      : path.join(projectRoot, options.package);

    const contract = await fileSystem.readJson(path.resolve(packageDir, 'scene-package.json'));
    const graph = buildOntologyFromManifest(contract);
    const result = getActionInfo(graph, options.ref);
    const payload = { success: true, packageDir, result };

    printSceneOntologyActionsSummary(options, payload);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene ontology actions failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function printSceneOntologyActionsSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const result = payload.result;
  console.log(chalk.blue('Action Abstraction: ') + result.ref);
  console.log(`  Intent:         ${result.intent || chalk.gray('(none)')}`);
  console.log(`  Preconditions:  ${result.preconditions.length > 0 ? result.preconditions.join(', ') : chalk.gray('(none)')}`);
  console.log(`  Postconditions: ${result.postconditions.length > 0 ? result.postconditions.join(', ') : chalk.gray('(none)')}`);
}

async function runSceneOntologyLineageCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeOntologyOptions(rawOptions);
  const validationError = validateOntologyOptions(options, true);

  if (validationError) {
    console.error(chalk.red(`Scene ontology lineage failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const packageDir = path.isAbsolute(options.package)
      ? options.package
      : path.join(projectRoot, options.package);

    const contract = await fileSystem.readJson(path.resolve(packageDir, 'scene-package.json'));
    const result = getLineageInfo(contract, options.ref);
    const payload = { success: true, packageDir, result };

    printSceneOntologyLineageSummary(options, payload);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene ontology lineage failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function printSceneOntologyLineageSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const result = payload.result;
  console.log(chalk.blue('Data Lineage: ') + result.ref);

  if (result.asSource.length === 0 && result.asSink.length === 0) {
    console.log('  No lineage data found for this ref');
    return;
  }

  if (result.asSource.length > 0) {
    console.log(chalk.blue('  As Source:'));
    for (const entry of result.asSource) {
      const fields = entry.fields ? entry.fields.join(', ') : '';
      console.log(`    ${entry.ref} [${fields}]`);
    }
  }

  if (result.asSink.length > 0) {
    console.log(chalk.blue('  As Sink:'));
    for (const entry of result.asSink) {
      const fields = entry.fields ? entry.fields.join(', ') : '';
      console.log(`    ${entry.ref} [${fields}]`);
    }
  }
}

async function runSceneOntologyAgentInfoCommand(rawOptions = {}, dependencies = {}) {
  const projectRoot = dependencies.projectRoot || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;

  const options = normalizeOntologyOptions(rawOptions);
  const validationError = validateOntologyOptions(options);

  if (validationError) {
    console.error(chalk.red(`Scene ontology agent-info failed: ${validationError}`));
    process.exitCode = 1;
    return null;
  }

  try {
    const packageDir = path.isAbsolute(options.package)
      ? options.package
      : path.join(projectRoot, options.package);

    const contract = await fileSystem.readJson(path.resolve(packageDir, 'scene-package.json'));
    const result = getAgentHints(contract);
    const payload = { success: true, packageDir, result };

    printSceneOntologyAgentInfoSummary(options, payload);
    return payload;
  } catch (error) {
    console.error(chalk.red('Scene ontology agent-info failed:'), error.message);
    process.exitCode = 1;
    return null;
  }
}

function printSceneOntologyAgentInfoSummary(options, payload) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const result = payload.result;
  console.log(chalk.blue('Agent Hints: ') + payload.packageDir);

  if (!result) {
    console.log('  No agent_hints defined');
    return;
  }

  console.log(`  Summary:            ${result.summary || chalk.gray('(none)')}`);
  console.log(`  Complexity:         ${result.complexity || chalk.gray('(none)')}`);
  console.log(`  Est. Duration (ms): ${result.estimated_duration_ms != null ? result.estimated_duration_ms : chalk.gray('(none)')}`);
  console.log(`  Permissions:        ${result.required_permissions && result.required_permissions.length > 0 ? result.required_permissions.join(', ') : chalk.gray('(none)')}`);
  console.log(`  Sequence:           ${result.suggested_sequence && result.suggested_sequence.length > 0 ? result.suggested_sequence.join(' → ') : chalk.gray('(none)')}`);
  console.log(`  Rollback:           ${result.rollback_strategy || chalk.gray('(none)')}`);
}

module.exports = {
  RUN_MODES,
  SCAFFOLD_TYPES,
  TEMPLATE_VARIABLE_TYPES,
  TEMPLATE_LAYER_VALUES,
  registerSceneCommands,
  normalizeSourceOptions,
  normalizeContextOptions,
  normalizeRunOptions,
  normalizeValidateOptions,
  normalizeDoctorOptions,
  normalizeScaffoldOptions,
  normalizeEvalOptions,
  normalizeEvalPolicyTemplateOptions,
  normalizeEvalConfigTemplateOptions,
  normalizeEvalProfileRulesTemplateOptions,
  normalizeCatalogOptions,
  normalizeRouteOptions,
  normalizeRoutePolicyTemplateOptions,
  normalizeRoutePolicySuggestOptions,
  normalizeRoutePolicyRolloutOptions,
  normalizeScenePackageTemplateOptions,
  normalizeScenePackageValidateOptions,
  normalizeScenePackagePublishOptions,
  normalizeScenePackagePublishBatchOptions,
  normalizeScenePackageOntologyBackfillBatchOptions,
  normalizeScenePackageInstantiateOptions,
  normalizeScenePackageRegistryOptions,
  normalizeScenePackageGateTemplateOptions,
  normalizeScenePackageGateOptions,
  normalizeEvalTaskSyncPolicy,
  resolveSceneEvalConfigProfile,
  resolveSceneEvalProfile,
  normalizeEvalProfileInferenceRules,
  createDefaultSceneEvalConfigTemplate,
  createDefaultSceneEvalProfileRulesTemplate,
  createSceneEvalConfigTemplateByProfile,
  createSceneRoutePolicyTemplateByProfile,
  createScenePackageGatePolicyTemplate,
  evaluateScenePackageGate,
  validateSourceOptions,
  validateRunMode,
  validateRunOptions,
  validateDoctorOptions,
  validateScaffoldOptions,
  validateEvalOptions,
  validateEvalPolicyTemplateOptions,
  validateEvalConfigTemplateOptions,
  validateEvalProfileRulesTemplateOptions,
  validateCatalogOptions,
  validateRouteOptions,
  validateRoutePolicyTemplateOptions,
  validateRoutePolicySuggestOptions,
  validateRoutePolicyRolloutOptions,
  validateScenePackageTemplateOptions,
  validateScenePackageValidateOptions,
  validateScenePackagePublishOptions,
  validateScenePackagePublishBatchOptions,
  validateScenePackageOntologyBackfillBatchOptions,
  validateScenePackageInstantiateOptions,
  validateScenePackageRegistryOptions,
  validateScenePackageGateTemplateOptions,
  validateScenePackageGateOptions,
  buildRuntimeContext,
  buildDoctorSuggestions,
  buildDoctorTodoMarkdown,
  buildDoctorTaskDraft,
  buildDoctorFeedbackTemplate,
  parseDoctorFeedbackTemplate,
  resolveEvalTaskPriority,
  buildSceneEvalReport,
  summarizeSceneRoutePolicySuggestReports,
  buildSceneRoutePolicySuggestion,
  validateScenePackageContract,
  runSceneValidateCommand,
  runSceneDoctorCommand,
  runSceneEvalCommand,
  runSceneEvalPolicyTemplateCommand,
  runSceneEvalConfigTemplateCommand,
  runSceneEvalProfileRulesTemplateCommand,
  runSceneRoutePolicyTemplateCommand,
  runSceneRoutePolicySuggestCommand,
  runSceneRoutePolicyRolloutCommand,
  runScenePackageTemplateCommand,
  runScenePackageValidateCommand,
  runScenePackagePublishCommand,
  runScenePackagePublishBatchCommand,
  runScenePackageOntologyBackfillBatchCommand,
  runScenePackageInstantiateCommand,
  runScenePackageRegistryCommand,
  runScenePackageGateTemplateCommand,
  runScenePackageGateCommand,
  runSceneCatalogCommand,
  runSceneRouteCommand,
  runSceneScaffoldCommand,
  runSceneCommand,
  validateTemplateVariableSchema,
  validateTemplateVariables,
  renderTemplateContent,
  renderTemplateFiles,
  resolveTemplateInheritance,
  normalizeSceneTemplateRenderOptions,
  validateSceneTemplateRenderOptions,
  normalizeSceneTemplateValidateOptions,
  validateSceneTemplateValidateOptions,
  normalizeSceneTemplateResolveOptions,
  validateSceneTemplateResolveOptions,
  normalizeSceneContextBridgeOptions,
  validateSceneContextBridgeOptions,
  normalizeSceneInteractiveFlowOptions,
  validateSceneInteractiveFlowOptions,
  normalizeSceneInteractiveLoopOptions,
  validateSceneInteractiveLoopOptions,
  normalizeSceneMoquiBaselineOptions,
  validateSceneMoquiBaselineOptions,
  runSceneContextBridgeCommand,
  runSceneInteractiveFlowCommand,
  runSceneInteractiveLoopCommand,
  runSceneMoquiBaselineCommand,
  runSceneTemplateValidateCommand,
  runSceneTemplateResolveCommand,
  runSceneTemplateRenderCommand,
  normalizeSceneInstantiateOptions,
  validateSceneInstantiateOptions,
  buildInstantiateRegistry,
  buildInstantiationManifest,
  appendInstantiationLog,
  executePostInstantiateHook,
  promptMissingVariables,
  parseInstantiateValues,
  printSceneInstantiateSummary,
  runSceneInstantiateCommand,
  printSceneTemplateValidateSummary,
  printSceneTemplateResolveSummary,
  printSceneTemplateRenderSummary,
  printScenePackagePublishBatchSummary,
  printScenePackageOntologyBackfillBatchSummary,
  createTarBuffer,
  extractTarBuffer,
  bundlePackageTarball,
  buildRegistryTarballPath,
  buildTarballFilename,
  resolveLatestVersion,
  validatePackageForPublish,
  loadRegistryIndex,
  saveRegistryIndex,
  addVersionToIndex,
  removeVersionFromIndex,
  storeToRegistry,
  removeFromRegistry,
  normalizeScenePackageRegistryPublishOptions,
  validateScenePackageRegistryPublishOptions,
  printScenePackageRegistryPublishSummary,
  runScenePackageRegistryPublishCommand,
  normalizeSceneUnpublishOptions,
  validateSceneUnpublishOptions,
  printSceneUnpublishSummary,
  runSceneUnpublishCommand,
  buildInstallManifest,
  normalizeSceneInstallOptions,
  printSceneInstallSummary,
  runSceneInstallCommand,
  validateSceneInstallOptions,
  buildRegistryPackageList,
  filterRegistryPackages,
  normalizeSceneListOptions,
  validateSceneListOptions,
  runSceneListCommand,
  printSceneListSummary,
  normalizeSceneSearchOptions,
  validateSceneSearchOptions,
  runSceneSearchCommand,
  printSceneSearchSummary,
  normalizeSceneVersionOptions,
  validateSceneVersionOptions,
  runSceneVersionCommand,
  printSceneVersionSummary,
  buildPackageDiff,
  normalizeSceneDiffOptions,
  validateSceneDiffOptions,
  runSceneDiffCommand,
  printSceneDiffSummary,
  normalizeSceneInfoOptions,
  validateSceneInfoOptions,
  runSceneInfoCommand,
  printSceneInfoSummary,
  validateScenePackageDirectory,
  normalizeSceneDeprecateOptions,
  validateSceneDeprecateOptions,
  runSceneDeprecateCommand,
  printSceneDeprecateSummary,
  normalizeSceneAuditOptions,
  validateSceneAuditOptions,
  collectTgzFiles,
  computeFileIntegrity,
  runSceneAuditCommand,
  printSceneAuditSummary,
  normalizeSceneOwnerOptions,
  validateSceneOwnerOptions,
  runSceneOwnerCommand,
  printSceneOwnerSummary,
  normalizeSceneTagOptions,
  validateSceneTagOptions,
  runSceneTagCommand,
  printSceneTagSummary,
  normalizeSceneStatsOptions,
  validateSceneStatsOptions,
  runSceneStatsCommand,
  printSceneStatsSummary,
  normalizeSceneLockOptions,
  validateSceneLockOptions,
  runSceneLockCommand,
  printSceneLockSummary,
  normalizeSceneConnectOptions,
  validateSceneConnectOptions,
  runSceneConnectCommand,
  printSceneConnectSummary,
  normalizeSceneDiscoverOptions,
  validateSceneDiscoverOptions,
  runSceneDiscoverCommand,
  printSceneDiscoverSummary,
  normalizeSceneExtractOptions,
  validateSceneExtractOptions,
  runSceneExtractCommand,
  printSceneExtractSummary,
  normalizeSceneLintOptions,
  validateSceneLintOptions,
  runSceneLintCommand,
  printSceneLintSummary,
  normalizeSceneScoreOptions,
  validateSceneScoreOptions,
  runSceneScoreCommand,
  printSceneScoreSummary,
  normalizeSceneContributeOptions,
  validateSceneContributeOptions,
  runSceneContributeCommand,
  printSceneContributeSummary,
  normalizeOntologyOptions,
  validateOntologyOptions,
  normalizeOntologyImpactOptions,
  validateOntologyImpactOptions,
  normalizeOntologyPathOptions,
  validateOntologyPathOptions,
  runSceneOntologyShowCommand,
  runSceneOntologyDepsCommand,
  runSceneOntologyImpactCommand,
  runSceneOntologyPathCommand,
  runSceneOntologyValidateCommand,
  runSceneOntologyActionsCommand,
  runSceneOntologyLineageCommand,
  runSceneOntologyAgentInfoCommand,
  printSceneOntologyShowSummary,
  printSceneOntologyDepsSummary,
  printSceneOntologyImpactSummary,
  printSceneOntologyPathSummary,
  printSceneOntologyValidateSummary,
  printSceneOntologyActionsSummary,
  printSceneOntologyLineageSummary,
  printSceneOntologyAgentInfoSummary
};
