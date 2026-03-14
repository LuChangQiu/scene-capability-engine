const fs = require('fs-extra');
const path = require('path');
const { mergeConfigs } = require('../auto/config-schema');
const {
  SteeringContract,
  DEFAULT_LAYER_FILES,
  MANIFEST_FILENAME,
  SCE_STEERING_DIR,
} = require('../runtime/steering-contract');
const {
  cloneStateStoragePolicyDefaults
} = require('../state/state-storage-policy');
const {
  DEFAULT_CONFIG: MULTI_AGENT_CONFIG_DEFAULTS
} = require('../collab/multi-agent-config');

const TAKEOVER_BASELINE_SCHEMA_VERSION = '1.0';
const CLARIFICATION_FIRST_CORE_PRINCIPLE_HEADING = '## 11. 业务场景未知时必须先澄清，禁止直接彻底禁用';
const CLARIFICATION_FIRST_CORE_PRINCIPLE_SECTION = [
  CLARIFICATION_FIRST_CORE_PRINCIPLE_HEADING,
  '',
  '- 不了解业务场景、模块、页面、实体或业务约束时，默认动作是先补上下文、缩小范围、生成澄清问题。',
  '- 禁止把“未知业务场景”直接等同于 `deny`、`disable`、answer-only 或其他一刀切兜底禁用。',
  '- 只有在明确命中安全/权限/合规/破坏性规则后，才允许进入阻断；否则必须先完成业务范围澄清。',
  '- 这条规则适用于所有接入 SCE 的项目、模式和交互面，不允许按项目例外绕过。'
].join('\n');
const NO_BLIND_FIX_CORE_PRINCIPLE_HEADING = '## 12. 禁止盲改问题，必须先建立问题契约和证据';
const NO_BLIND_FIX_CORE_PRINCIPLE_SECTION = [
  NO_BLIND_FIX_CORE_PRINCIPLE_HEADING,
  '',
  '- 修改问题前，必须先明确现象、复现条件、影响范围、预期行为和验证方式。',
  '- 缺少日志、数据、接口样本、最小复现或问题契约时，应先补证据，不得靠猜测连续改代码碰运气。',
  '- 若两轮修改仍未收敛，必须回到调试、定位和根因分析，禁止在未理解问题前盲目扩大改动面。'
].join('\n');
const STEERING_CHANGE_EVALUATION_CORE_PRINCIPLE_HEADING = '## 13. Steering 条目变更必须先评估，禁止随意增删';
const STEERING_CHANGE_EVALUATION_CORE_PRINCIPLE_SECTION = [
  STEERING_CHANGE_EVALUATION_CORE_PRINCIPLE_HEADING,
  '',
  '- 新增、删除或重写 steering 条目前，必须先评估它是否真属于长期原则，是否与现有条目重复，是否应迁移到 `CURRENT_CONTEXT.md`、Spec 或项目文档。',
  '- steering 变更必须说明触发原因、适用范围以及与现有规则的关系；未经评估，不得把临时偏好、短期任务或偶发结论直接固化进去。',
  '- 接管、升级和治理脚本只能补齐基线、修复漂移，不能把未经评估的项目习惯直接塞进 steering。'
].join('\n');
const BACKEND_API_PRECEDENCE_CORE_PRINCIPLE_HEADING = '## 14. 问题修复时前后端接口不一致默认以后端契约为准';
const BACKEND_API_PRECEDENCE_CORE_PRINCIPLE_SECTION = [
  BACKEND_API_PRECEDENCE_CORE_PRINCIPLE_HEADING,
  '',
  '- 在修改问题的场景下，若前端调用后端 API 出现路径、方法、字段、状态码或响应结构不匹配，默认以后端现有接口契约为准。',
  '- 除非明确要求新建接口或修改后端接口，否则禁止为了迁就前端错误调用去随意改后端实现或契约。',
  '- 默认优先修正前端请求、映射、类型和兼容处理，使其与后端接口保持一致；若怀疑后端契约错误，应先确认再改。'
].join('\n');
const DELIVERY_SYNC_CORE_PRINCIPLE_HEADING = '## 6. 测试、文档、代码必须同步闭环';
const DELIVERY_SYNC_REQUIRED_LINES = Object.freeze([
  '- 代码变更必须跑相关验证；发布前不得忽略失败。',
  '- 重要功能、命令、配置变化必须同步更新 README、用户文档或发布说明。',
  '- 功能修改、UI 重写、模块替换时，已失效的旧实现、旧样式、死分支、失效适配层和无效引用必须在同一轮变更中清理，不得继续留作“保险”。',
  '- 若因兼容、灰度或回滚必须暂时保留旧实现，必须明确保留理由、适用边界、退出条件和后续清理计划。'
]);
const DELIVERY_SYNC_CORE_PRINCIPLE_SECTION = [
  DELIVERY_SYNC_CORE_PRINCIPLE_HEADING,
  '',
  ...DELIVERY_SYNC_REQUIRED_LINES
].join('\n');
const LARGE_FILE_REFACTOR_CORE_PRINCIPLE_HEADING = '## 15. 单文件规模过大必须触发重构评估，禁止无限堆积';
const LARGE_FILE_REFACTOR_CORE_PRINCIPLE_SECTION = [
  LARGE_FILE_REFACTOR_CORE_PRINCIPLE_HEADING,
  '',
  '- SCE 应为每个项目定期评估代码规模分布，并给出项目级的重构参考节点；禁止假设所有项目都适用同一个固定行数阈值。',
  '- 若项目尚未建立自己的阈值，默认参考源文件 `2000 / 4000 / 10000` 行三档触发：分别对应“必须评估”“必须发起重构收敛”“进入红线区”。',
  '- 达到项目级或默认阈值后，后续改动必须优先评估拆分模块、服务、命令面或数据职责；超过重构/红线阈值时，不得继续无计划堆积复杂度。',
  '- 项目开始较小时，阈值应更早触发；项目进入长期演进后，也必须按周或发布前重新评估，而不是让早期设定永久失效。',
  '- 行数阈值只是强触发信号，不代表低于阈值就可以忽略耦合、职责混杂、测试失控和理解成本问题；若复杂度已明显失控，应提前启动重构。'
].join('\n');
const REQUIRED_CORE_PRINCIPLE_SECTIONS = Object.freeze([
  {
    heading: DELIVERY_SYNC_CORE_PRINCIPLE_HEADING,
    section: DELIVERY_SYNC_CORE_PRINCIPLE_SECTION
  },
  {
    heading: CLARIFICATION_FIRST_CORE_PRINCIPLE_HEADING,
    section: CLARIFICATION_FIRST_CORE_PRINCIPLE_SECTION
  },
  {
    heading: NO_BLIND_FIX_CORE_PRINCIPLE_HEADING,
    section: NO_BLIND_FIX_CORE_PRINCIPLE_SECTION
  },
  {
    heading: STEERING_CHANGE_EVALUATION_CORE_PRINCIPLE_HEADING,
    section: STEERING_CHANGE_EVALUATION_CORE_PRINCIPLE_SECTION
  },
  {
    heading: BACKEND_API_PRECEDENCE_CORE_PRINCIPLE_HEADING,
    section: BACKEND_API_PRECEDENCE_CORE_PRINCIPLE_SECTION
  },
  {
    heading: LARGE_FILE_REFACTOR_CORE_PRINCIPLE_HEADING,
    section: LARGE_FILE_REFACTOR_CORE_PRINCIPLE_SECTION
  }
]);

const ERRORBOOK_REGISTRY_DEFAULTS = Object.freeze({
  enabled: true,
  search_mode: 'remote',
  cache_file: '.sce/errorbook/registry-cache.json',
  sources: [
    {
      name: 'central',
      enabled: true,
      url: 'https://raw.githubusercontent.com/heguangyong/sce-errorbook-registry/main/registry/errorbook-registry.json',
      index_url: 'https://raw.githubusercontent.com/heguangyong/sce-errorbook-registry/main/registry/errorbook-registry.index.json'
    }
  ]
});

const ERRORBOOK_CONVERGENCE_DEFAULTS = Object.freeze({
  enabled: true,
  canonical_mechanism: 'errorbook',
  absorb_project_defined_mechanisms: true,
  disallow_parallel_mechanisms: true,
  intake_inventory_path: '.sce/errorbook/project-intake/custom-mechanism-inventory.json',
  strategy: 'absorb_into_sce_errorbook'
});

const ERRORBOOK_PARALLEL_MECHANISM_KEYWORDS = Object.freeze([
  '错题本',
  '错题',
  '故障复盘',
  '事故复盘',
  '问题复盘',
  '复盘册',
  'mistake-book',
  'mistake_book',
  'mistakebook',
  'fault-book',
  'fault_book',
  'postmortem',
  'post-mortem',
  'lessons-learned',
  'lessons_learned',
  'defect-ledger',
  'defect_ledger',
  'issue-ledger',
  'issue_ledger',
  'incident-review',
  'incident_review'
]);

const ERRORBOOK_SCAN_IGNORED_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  '.sce',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.idea',
  '.vscode',
  'tmp',
  'temp',
  '.tmp'
]);

const SESSION_GOVERNANCE_DEFAULTS = Object.freeze({
  schema_version: '1.0',
  scene_primary_session_required: true,
  one_scene_one_primary_session: true,
  spec_runs_bind_child_session: true,
  scene_completion_auto_rollover: true,
  auto_archive_spec_sessions: true
});

const SPEC_DOMAIN_POLICY_DEFAULTS = Object.freeze({
  schema_version: '1.0',
  closed_loop_research_required: true,
  coverage_validation_required: true,
  fail_on_gap_default: true,
  problem_contract_required: true,
  ontology_axes_required: ['entity', 'relation', 'business_rule', 'decision_policy', 'execution_flow']
});

const PROBLEM_EVAL_POLICY_DEFAULTS = Object.freeze({
  schema_version: '1.0',
  enabled: true,
  mode: 'required',
  enforce_on_stages: ['plan', 'generate', 'apply', 'verify', 'release'],
  block_on_stages: ['apply', 'release'],
  min_confidence_by_stage: {
    plan: 20,
    generate: 25,
    apply: 30,
    verify: 35,
    release: 40
  },
  high_risk_requires_debug_evidence: true,
  high_risk_keywords: [
    'auth',
    'payment',
    'security',
    'delete',
    'rollback',
    'production',
    'migrate',
    'compliance',
    'data-loss'
  ],
  recommendation_limit: 6,
  max_failed_rounds_before_debug: 2,
  problem_contract_required_stages: ['plan', 'generate', 'apply', 'verify', 'release'],
  problem_contract_block_stages: ['plan', 'apply', 'release'],
  ontology_alignment_required_stages: ['plan', 'generate', 'apply', 'verify', 'release'],
  ontology_alignment_block_stages: ['apply', 'release'],
  ontology_required_axes: ['entity', 'relation', 'business_rule', 'decision_policy', 'execution_flow'],
  require_ontology_evidence_binding: true,
  ontology_evidence_min_bindings: 1,
  convergence_required_stages: ['verify', 'release'],
  convergence_block_stages: ['release'],
  release_block_on_high_alerts: true,
  release_require_governance_report: false
});

const PROBLEM_CLOSURE_POLICY_DEFAULTS = Object.freeze({
  schema_version: '1.0',
  enabled: true,
  governance_report_path: '.sce/reports/interactive-governance-report.json',
  verify: {
    require_problem_contract: true,
    require_domain_validation: true,
    require_domain_coverage: true
  },
  release: {
    require_problem_contract: true,
    require_domain_validation: true,
    require_domain_coverage: true,
    require_verify_report: true,
    require_governance_report: false,
    block_on_high_governance_alerts: true
  }
});

const STUDIO_INTAKE_POLICY_DEFAULTS = Object.freeze({
  schema_version: '1.0',
  enabled: true,
  auto_create_spec: true,
  force_spec_for_studio_plan: true,
  allow_manual_spec_override: false,
  prefer_existing_scene_spec: true,
  related_spec_min_score: 45,
  allow_new_spec_when_goal_diverges: true,
  divergence_similarity_threshold: 0.2,
  goal_missing_strategy: 'create_for_tracking',
  question_only_patterns: [
    'how', 'what', 'why', 'when', 'where', 'which', 'can', 'could', 'should', 'would',
    '是否', '怎么', '如何', '为什么', '吗', '么'
  ],
  change_intent_patterns: [
    'implement', 'build', 'create', 'add', 'update', 'upgrade', 'refactor', 'fix', 'stabilize',
    'optimize', 'deliver', 'release', 'bootstrap', 'repair', 'patch',
    '新增', '增加', '实现', '构建', '开发', '修复', '优化', '重构', '发布', '改造', '完善', '增强'
  ],
  spec_id: {
    prefix: 'auto',
    max_goal_slug_tokens: 6
  },
  governance: {
    auto_run_on_plan: true,
    require_auto_on_plan: true,
    max_active_specs_per_scene: 3,
    stale_days: 14,
    duplicate_similarity_threshold: 0.66,
    duplicate_detection_scope: 'non_completed'
  },
  backfill: {
    enabled: true,
    active_only_default: true,
    default_scene_id: 'scene.sce-core',
    override_file: '.sce/spec-governance/spec-scene-overrides.json',
    rules: [
      { id: 'moqui-core', scene_id: 'scene.moqui-core', keywords: ['moqui'] },
      { id: 'orchestration', scene_id: 'scene.sce-orchestration', keywords: ['orchestrate', 'runtime', 'controller', 'batch', 'parallel'] },
      { id: 'template-registry', scene_id: 'scene.sce-template-registry', keywords: ['template', 'scene-package', 'registry', 'catalog', 'scene-template'] },
      { id: 'spec-governance', scene_id: 'scene.sce-spec-governance', keywords: ['spec', 'gate', 'ontology', 'governance', 'policy'] },
      { id: 'quality', scene_id: 'scene.sce-quality', keywords: ['test', 'quality', 'stability', 'jest', 'coverage'] },
      { id: 'docs', scene_id: 'scene.sce-docs', keywords: ['document', 'documentation', 'onboarding', 'guide'] },
      { id: 'platform', scene_id: 'scene.sce-platform', keywords: ['adopt', 'upgrade', 'workspace', 'repo', 'environment', 'devops', 'release', 'github', 'npm'] }
    ]
  }
});

const TAKEOVER_DEFAULTS = Object.freeze({
  autonomous: {
    enabled: true,
    mode: 'aggressive',
    require_step_confirmation: false,
    apply_all_work_by_default: true
  },
  session_governance: {
    scene_primary_session_required: true,
    one_scene_one_primary_session: true,
    spec_runs_bind_child_session: true,
    scene_completion_auto_rollover: true
  },
  spec_domain_policy: {
    closed_loop_research_required: true,
    coverage_validation_required: true,
    fail_on_gap_default: true,
    problem_contract_required: true,
    ontology_axes_required: ['entity', 'relation', 'business_rule', 'decision_policy', 'execution_flow']
  },
  problem_evaluation: {
    enabled: true,
    mode: 'required',
    enforce_on_stages: ['plan', 'generate', 'apply', 'verify', 'release'],
    block_on_stages: ['apply', 'release'],
    problem_contract_required_stages: ['plan', 'generate', 'apply', 'verify', 'release'],
    problem_contract_block_stages: ['plan', 'apply', 'release'],
    ontology_alignment_required_stages: ['plan', 'generate', 'apply', 'verify', 'release'],
    ontology_alignment_block_stages: ['apply', 'release'],
    convergence_required_stages: ['verify', 'release'],
    convergence_block_stages: ['release'],
    max_failed_rounds_before_debug: 2
  },
  problem_closure: {
    enabled: true,
    governance_report_path: '.sce/reports/interactive-governance-report.json',
    verify: {
      require_problem_contract: true,
      require_domain_validation: true,
      require_domain_coverage: true
    },
    release: {
      require_problem_contract: true,
      require_domain_validation: true,
      require_domain_coverage: true,
      require_verify_report: true,
      require_governance_report: false,
      block_on_high_governance_alerts: true
    }
  },
  studio_intake: {
    enabled: true,
    auto_create_spec: true,
    force_spec_for_studio_plan: true,
    allow_manual_spec_override: false,
    prefer_existing_scene_spec: true,
    related_spec_min_score: 45,
    allow_new_spec_when_goal_diverges: true,
    divergence_similarity_threshold: 0.2,
    goal_missing_strategy: 'create_for_tracking',
    governance: {
      auto_run_on_plan: true,
      require_auto_on_plan: true,
      max_active_specs_per_scene: 3,
      stale_days: 14,
      duplicate_similarity_threshold: 0.66,
      duplicate_detection_scope: 'non_completed'
    },
    backfill: {
      enabled: true,
      active_only_default: true,
      default_scene_id: 'scene.sce-core',
      override_file: '.sce/spec-governance/spec-scene-overrides.json'
    }
  },
  debug_policy: {
    prioritize_root_cause_fix: true,
    max_direct_fix_rounds_before_debug: 2,
    forbid_bypass_workarounds: true
  },
  collaboration: {
    multi_user_mode: true,
    multi_agent: _clone(MULTI_AGENT_CONFIG_DEFAULTS)
  },
  errorbook_convergence: _clone(ERRORBOOK_CONVERGENCE_DEFAULTS),
  migration_policy: {
    legacy_kiro_supported: false,
    require_manual_legacy_migration_confirmation: true
  }
});

function _toRelativePosix(projectPath, absolutePath) {
  return path.relative(projectPath, absolutePath).replace(/\\/g, '/');
}

function _isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function _clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function _deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function _deepMerge(base, patch) {
  const output = _isObject(base) ? _clone(base) : {};
  if (!_isObject(patch)) {
    return output;
  }

  for (const [key, value] of Object.entries(patch)) {
    if (_isObject(value)) {
      output[key] = _deepMerge(output[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

async function _readJsonSafe(filePath, fileSystem) {
  if (!await fileSystem.pathExists(filePath)) {
    return null;
  }
  try {
    return await fileSystem.readJson(filePath);
  } catch (_error) {
    return null;
  }
}

function _buildAutoConfig(existing) {
  const merged = mergeConfigs({}, _isObject(existing) ? existing : {});
  merged.mode = 'aggressive';
  merged.checkpoints = {
    ...(merged.checkpoints || {}),
    requirementsReview: false,
    designReview: false,
    tasksReview: false,
    phaseCompletion: false,
    finalReview: false
  };
  merged.errorRecovery = {
    ...(merged.errorRecovery || {}),
    enabled: true,
    maxAttempts: Math.max(3, Number(merged?.errorRecovery?.maxAttempts || 0) || 0)
  };
  merged.performance = {
    ...(merged.performance || {}),
    maxConcurrentTasks: Math.max(1, Number(merged?.performance?.maxConcurrentTasks || 0) || 1)
  };
  merged.takeover = {
    managed: true,
    require_step_confirmation: false,
    apply_all_work_by_default: true
  };
  return merged;
}

function _buildAdoptionConfig(existing, nowIso, sceVersion) {
  const base = _isObject(existing) ? _clone(existing) : {};
  const adoptedAt = typeof base.adoptedAt === 'string' && base.adoptedAt.trim()
    ? base.adoptedAt
    : nowIso;

  return {
    ...base,
    version: typeof base.version === 'string' && base.version.trim() ? base.version : '1.0.0',
    adoptedAt,
    steeringStrategy: typeof base.steeringStrategy === 'string' && base.steeringStrategy.trim()
      ? base.steeringStrategy
      : 'use-sce',
    multiUserMode: typeof base.multiUserMode === 'boolean' ? base.multiUserMode : true,
    runtimePolicy: {
      agent_parity_permissions: true,
      autonomous_default: true
    },
    takeover: {
      managed: true,
      schema_version: TAKEOVER_BASELINE_SCHEMA_VERSION,
      auto_detect_on_startup: true,
      legacy_kiro_supported: false
    },
    defaults: _clone(TAKEOVER_DEFAULTS),
    lastAlignedSceVersion: sceVersion
  };
}

function _buildMultiAgentConfig(existing) {
  const base = _isObject(existing) ? _clone(existing) : {};
  return {
    ..._clone(MULTI_AGENT_CONFIG_DEFAULTS),
    ...base
  };
}

function _buildTakeoverBaselineConfig(existing, sceVersion) {
  const base = _isObject(existing) ? _clone(existing) : {};
  return {
    ...base,
    schema_version: TAKEOVER_BASELINE_SCHEMA_VERSION,
    engine: 'sce',
    managed: true,
    last_aligned_sce_version: sceVersion,
    defaults: _clone(TAKEOVER_DEFAULTS)
  };
}

function _buildErrorbookRegistryConfig(existing) {
  const base = _isObject(existing) ? _clone(existing) : {};
  return {
    ..._clone(ERRORBOOK_REGISTRY_DEFAULTS),
    ...base,
    sources: Array.isArray(base.sources) && base.sources.length > 0
      ? _clone(base.sources)
      : _clone(ERRORBOOK_REGISTRY_DEFAULTS.sources)
  };
}

function _normalizeRelativePath(value) {
  return `${value || ''}`.replace(/\\/g, '/');
}

function _findParallelErrorbookKeyword(relativePath) {
  const normalized = _normalizeRelativePath(relativePath).toLowerCase();
  return ERRORBOOK_PARALLEL_MECHANISM_KEYWORDS.find((keyword) => normalized.includes(keyword.toLowerCase())) || null;
}

function _shouldSkipErrorbookScanDir(dirName) {
  return ERRORBOOK_SCAN_IGNORED_DIRS.has(`${dirName || ''}`.trim());
}

async function _scanProjectDefinedErrorbookMechanisms(projectPath, fileSystem, currentDir = projectPath, depth = 0, findings = []) {
  let entries = [];
  try {
    entries = await fileSystem.readdir(currentDir, { withFileTypes: true });
  } catch (_error) {
    return findings;
  }

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = _toRelativePosix(projectPath, absolutePath);

    if (entry.isDirectory()) {
      if (_shouldSkipErrorbookScanDir(entry.name)) {
        continue;
      }

      const keyword = _findParallelErrorbookKeyword(relativePath);
      if (keyword) {
        findings.push({
          path: relativePath,
          kind: 'directory',
          keyword,
          action: 'absorb_into_sce_errorbook'
        });
      }

      if (depth < 5) {
        await _scanProjectDefinedErrorbookMechanisms(projectPath, fileSystem, absolutePath, depth + 1, findings);
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const keyword = _findParallelErrorbookKeyword(relativePath);
    if (!keyword) {
      continue;
    }

    findings.push({
      path: relativePath,
      kind: 'file',
      keyword,
      action: 'absorb_into_sce_errorbook'
    });
  }

  return findings;
}

function _dedupeFindings(findings = []) {
  const seen = new Set();
  return findings.filter((item) => {
    const key = `${item.kind}:${item.path}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).sort((left, right) => `${left.path}`.localeCompare(`${right.path}`));
}

function _buildErrorbookConvergenceInventory(sceVersion, findings = []) {
  const dedupedFindings = _dedupeFindings(findings);
  return {
    schema_version: TAKEOVER_BASELINE_SCHEMA_VERSION,
    canonical_mechanism: 'errorbook',
    strategy: 'absorb_into_sce_errorbook',
    last_aligned_sce_version: sceVersion,
    summary: {
      detected_custom_mechanisms: dedupedFindings.length
    },
    guidance: [
      'Absorb reusable failure-remediation knowledge into .sce/errorbook instead of keeping project-defined parallel mistake-book flows.',
      'Use `sce errorbook record` for curated entries and `sce errorbook incident *` for short trial-and-error loops before curation.'
    ],
    findings: dedupedFindings
  };
}

async function _reconcileJsonFile(filePath, desired, options = {}) {
  const {
    projectPath,
    apply,
    fileSystem,
    managedBy = 'takeover-baseline'
  } = options;
  const existing = await _readJsonSafe(filePath, fileSystem);
  const existed = existing !== null;
  const changed = !existed || !_deepEqual(existing, desired);

  if (apply && changed) {
    await fileSystem.ensureDir(path.dirname(filePath));
    await fileSystem.writeJson(filePath, desired, { spaces: 2 });
  }

  return {
    path: _toRelativePosix(projectPath, filePath),
    existed,
    changed,
    status: existed ? (changed ? 'updated' : 'unchanged') : (changed ? 'created' : 'unchanged'),
    managed_by: managedBy
  };
}

async function _inspectSteeringState(projectPath, fileSystem) {
  const steeringDir = path.join(projectPath, SCE_STEERING_DIR);
  const manifestPath = path.join(steeringDir, MANIFEST_FILENAME);
  const layers = Object.values(DEFAULT_LAYER_FILES).map((filename) => path.join(steeringDir, filename));
  const files = [manifestPath, ...layers];
  let missing = 0;
  for (const filePath of files) {
    if (!await fileSystem.pathExists(filePath)) {
      missing += 1;
    }
  }
  return {
    steeringDir,
    manifestPath,
    layerFiles: layers,
    missing
  };
}

async function _reconcileSteeringContract(projectPath, options = {}) {
  const { apply, fileSystem } = options;
  const before = await _inspectSteeringState(projectPath, fileSystem);
  let ensureResult = null;
  if (apply) {
    const contract = new SteeringContract(projectPath);
    ensureResult = await contract.ensureContract();
  }
  const after = await _inspectSteeringState(projectPath, fileSystem);
  const changed = before.missing !== after.missing;

  return {
    path: _toRelativePosix(projectPath, before.steeringDir),
    changed,
    status: changed ? 'updated' : 'unchanged',
    managed_by: 'steering-contract',
    details: {
      missing_before: before.missing,
      missing_after: after.missing,
      ensure_result: ensureResult
    }
  };
}

function _appendLinesToSection(content, heading, lines) {
  if (!content || !heading || !Array.isArray(lines) || lines.length === 0) {
    return content;
  }

  const startIndex = content.indexOf(heading);
  if (startIndex === -1) {
    return content;
  }

  const sectionBodyStart = startIndex + heading.length;
  const nextHeadingIndex = content.indexOf('\n## ', sectionBodyStart);
  const sectionEnd = nextHeadingIndex === -1 ? content.length : nextHeadingIndex;
  const section = content.slice(startIndex, sectionEnd).trimEnd();
  const missingLines = lines.filter((line) => !section.includes(line));

  if (missingLines.length === 0) {
    return content;
  }

  const updatedSection = `${section}\n${missingLines.join('\n')}`;
  return `${content.slice(0, startIndex)}${updatedSection}${content.slice(sectionEnd)}`;
}

async function _reconcileCorePrinciplesBaseline(projectPath, options = {}) {
  const { apply, fileSystem } = options;
  const corePrinciplesPath = path.join(projectPath, SCE_STEERING_DIR, DEFAULT_LAYER_FILES.core_principles);
  const exists = await fileSystem.pathExists(corePrinciplesPath);
  const existingContent = exists ? await fileSystem.readFile(corePrinciplesPath, 'utf8') : '';
  const missingSections = REQUIRED_CORE_PRINCIPLE_SECTIONS.filter(({ heading }) => !existingContent.includes(heading));
  const missingDeliverySyncLines = existingContent.includes(DELIVERY_SYNC_CORE_PRINCIPLE_HEADING)
    ? DELIVERY_SYNC_REQUIRED_LINES.filter((line) => !existingContent.includes(line))
    : [];
  const changed = missingSections.length > 0 || missingDeliverySyncLines.length > 0;

  if (apply && changed) {
    let nextContent = `${existingContent || ''}`.trimEnd();
    const appendedSections = missingSections.map((item) => item.section).join('\n\n');
    if (appendedSections) {
      nextContent = nextContent
        ? `${nextContent}\n\n${appendedSections}`
        : appendedSections;
    }
    if (missingDeliverySyncLines.length > 0) {
      nextContent = _appendLinesToSection(nextContent, DELIVERY_SYNC_CORE_PRINCIPLE_HEADING, missingDeliverySyncLines);
    }
    await fileSystem.ensureDir(path.dirname(corePrinciplesPath));
    await fileSystem.writeFile(corePrinciplesPath, `${nextContent}\n`, 'utf8');
  }

  return {
    path: _toRelativePosix(projectPath, corePrinciplesPath),
    existed: exists,
    changed,
    status: !exists ? (changed ? 'created' : 'unchanged') : (changed ? 'updated' : 'unchanged'),
    managed_by: 'takeover-baseline',
    details: {
      missing_required_headings_before: missingSections.map((item) => item.heading),
      missing_delivery_sync_lines_before: missingDeliverySyncLines,
      required_headings: REQUIRED_CORE_PRINCIPLE_SECTIONS.map((item) => item.heading)
    }
  };
}

function _summarize(items) {
  const summary = {
    created: 0,
    updated: 0,
    unchanged: 0,
    pending: 0
  };

  for (const item of items) {
    if (!item) {
      continue;
    }
    if (item.status === 'created') {
      summary.created += 1;
    } else if (item.status === 'updated') {
      summary.updated += 1;
    } else if (item.status === 'pending') {
      summary.pending += 1;
    } else {
      summary.unchanged += 1;
    }
  }
  return summary;
}

function _toAuditStatus(items, apply) {
  if (apply) {
    return items.map((item) => item);
  }
  return items.map((item) => {
    if (item.status === 'created' || item.status === 'updated') {
      return {
        ...item,
        status: 'pending',
        changed: true
      };
    }
    return item;
  });
}

async function applyTakeoverBaseline(projectPath = process.cwd(), options = {}) {
  const fileSystem = options.fileSystem || fs;
  const apply = options.apply !== false;
  const writeReport = options.writeReport === true;
  const now = options.now || new Date();
  const nowIso = typeof now.toISOString === 'function' ? now.toISOString() : new Date().toISOString();
  const sceVersion = typeof options.sceVersion === 'string' && options.sceVersion.trim()
    ? options.sceVersion.trim()
    : 'unknown';

  const sceRoot = path.join(projectPath, '.sce');
  if (!await fileSystem.pathExists(sceRoot)) {
    return {
      mode: 'workspace-takeover-baseline',
      detected_project: false,
      apply,
      passed: true,
      project_path: projectPath,
      drift_count: 0,
      files: [],
      summary: {
        created: 0,
        updated: 0,
        unchanged: 0,
        pending: 0
      },
      message: 'No .sce directory found; takeover baseline skipped.'
    };
  }

  const adoptionPath = path.join(sceRoot, 'adoption-config.json');
  const autoConfigPath = path.join(sceRoot, 'auto', 'config.json');
  const takeoverConfigPath = path.join(sceRoot, 'config', 'takeover-baseline.json');
  const errorbookRegistryPath = path.join(sceRoot, 'config', 'errorbook-registry.json');
  const multiAgentConfigPath = path.join(sceRoot, 'config', 'multi-agent.json');
  const sessionGovernancePath = path.join(sceRoot, 'config', 'session-governance.json');
  const specDomainPolicyPath = path.join(sceRoot, 'config', 'spec-domain-policy.json');
  const problemEvalPolicyPath = path.join(sceRoot, 'config', 'problem-eval-policy.json');
  const problemClosurePolicyPath = path.join(sceRoot, 'config', 'problem-closure-policy.json');
  const studioIntakePolicyPath = path.join(sceRoot, 'config', 'studio-intake-policy.json');
  const stateStoragePolicyPath = path.join(sceRoot, 'config', 'state-storage-policy.json');
  const errorbookInventoryPath = path.join(sceRoot, 'errorbook', 'project-intake', 'custom-mechanism-inventory.json');
  const reportPath = path.join(sceRoot, 'reports', 'takeover-baseline-latest.json');

  const existingAdoption = await _readJsonSafe(adoptionPath, fileSystem);
  const existingAuto = await _readJsonSafe(autoConfigPath, fileSystem);
  const existingTakeover = await _readJsonSafe(takeoverConfigPath, fileSystem);
  const existingErrorbookRegistry = await _readJsonSafe(errorbookRegistryPath, fileSystem);
  const existingMultiAgentConfig = await _readJsonSafe(multiAgentConfigPath, fileSystem);
  const existingSessionGovernance = await _readJsonSafe(sessionGovernancePath, fileSystem);
  const existingSpecDomainPolicy = await _readJsonSafe(specDomainPolicyPath, fileSystem);
  const existingProblemEvalPolicy = await _readJsonSafe(problemEvalPolicyPath, fileSystem);
  const existingProblemClosurePolicy = await _readJsonSafe(problemClosurePolicyPath, fileSystem);
  const existingStudioIntakePolicy = await _readJsonSafe(studioIntakePolicyPath, fileSystem);
  const existingStateStoragePolicy = await _readJsonSafe(stateStoragePolicyPath, fileSystem);
  const desiredAdoption = _buildAdoptionConfig(existingAdoption, nowIso, sceVersion);
  const desiredAutoConfig = _buildAutoConfig(existingAuto);
  const desiredTakeover = _buildTakeoverBaselineConfig(existingTakeover, sceVersion);
  const desiredErrorbookRegistry = _buildErrorbookRegistryConfig(existingErrorbookRegistry);
  const desiredMultiAgentConfig = _buildMultiAgentConfig(existingMultiAgentConfig);
  const desiredSessionGovernance = _deepMerge(existingSessionGovernance || {}, SESSION_GOVERNANCE_DEFAULTS);
  const desiredSpecDomainPolicy = _deepMerge(existingSpecDomainPolicy || {}, SPEC_DOMAIN_POLICY_DEFAULTS);
  const desiredProblemEvalPolicy = _deepMerge(existingProblemEvalPolicy || {}, PROBLEM_EVAL_POLICY_DEFAULTS);
  const desiredProblemClosurePolicy = _deepMerge(existingProblemClosurePolicy || {}, PROBLEM_CLOSURE_POLICY_DEFAULTS);
  const desiredStudioIntakePolicy = _deepMerge(existingStudioIntakePolicy || {}, STUDIO_INTAKE_POLICY_DEFAULTS);
  const desiredStateStoragePolicy = _deepMerge(existingStateStoragePolicy || {}, cloneStateStoragePolicyDefaults());
  const customErrorbookFindings = await _scanProjectDefinedErrorbookMechanisms(projectPath, fileSystem);
  const desiredErrorbookInventory = _buildErrorbookConvergenceInventory(sceVersion, customErrorbookFindings);

  const fileResults = [];
  fileResults.push(await _reconcileJsonFile(adoptionPath, desiredAdoption, {
    projectPath,
    apply,
    fileSystem
  }));
  fileResults.push(await _reconcileJsonFile(autoConfigPath, desiredAutoConfig, {
    projectPath,
    apply,
    fileSystem
  }));
  fileResults.push(await _reconcileJsonFile(takeoverConfigPath, desiredTakeover, {
    projectPath,
    apply,
    fileSystem
  }));
  fileResults.push(await _reconcileJsonFile(errorbookRegistryPath, desiredErrorbookRegistry, {
    projectPath,
    apply,
    fileSystem
  }));
  fileResults.push(await _reconcileJsonFile(multiAgentConfigPath, desiredMultiAgentConfig, {
    projectPath,
    apply,
    fileSystem
  }));
  fileResults.push(await _reconcileJsonFile(sessionGovernancePath, desiredSessionGovernance, {
    projectPath,
    apply,
    fileSystem
  }));
  fileResults.push(await _reconcileJsonFile(specDomainPolicyPath, desiredSpecDomainPolicy, {
    projectPath,
    apply,
    fileSystem
  }));
  fileResults.push(await _reconcileJsonFile(problemEvalPolicyPath, desiredProblemEvalPolicy, {
    projectPath,
    apply,
    fileSystem
  }));
  fileResults.push(await _reconcileJsonFile(problemClosurePolicyPath, desiredProblemClosurePolicy, {
    projectPath,
    apply,
    fileSystem
  }));
  fileResults.push(await _reconcileJsonFile(studioIntakePolicyPath, desiredStudioIntakePolicy, {
    projectPath,
    apply,
    fileSystem
  }));
  fileResults.push(await _reconcileJsonFile(stateStoragePolicyPath, desiredStateStoragePolicy, {
    projectPath,
    apply,
    fileSystem
  }));
  fileResults.push(await _reconcileJsonFile(errorbookInventoryPath, desiredErrorbookInventory, {
    projectPath,
    apply,
    fileSystem,
    managedBy: 'errorbook-convergence'
  }));
  fileResults.push(await _reconcileSteeringContract(projectPath, {
    apply,
    fileSystem
  }));
  fileResults.push(await _reconcileCorePrinciplesBaseline(projectPath, {
    apply,
    fileSystem
  }));

  const auditFiles = _toAuditStatus(fileResults, apply);
  const summary = _summarize(auditFiles);
  const driftCount = summary.pending;
  const passed = driftCount === 0;

  const report = {
    mode: 'workspace-takeover-baseline',
    generated_at: nowIso,
    detected_project: true,
    apply,
    passed,
    project_path: projectPath,
    sce_version: sceVersion,
    drift_count: driftCount,
    enforced_defaults: _clone(TAKEOVER_DEFAULTS),
    errorbook_convergence: {
      canonical_mechanism: 'errorbook',
      strategy: 'absorb_into_sce_errorbook',
      detected_custom_mechanism_count: desiredErrorbookInventory.summary.detected_custom_mechanisms,
      inventory_file: _toRelativePosix(projectPath, errorbookInventoryPath)
    },
    files: auditFiles,
    summary
  };

  if (apply && writeReport) {
    const reportExists = await fileSystem.pathExists(reportPath);
    const shouldWriteReport = options.forceWriteReport === true
      || !reportExists
      || summary.created > 0
      || summary.updated > 0;

    if (shouldWriteReport) {
      await fileSystem.ensureDir(path.dirname(reportPath));
      await fileSystem.writeJson(reportPath, report, { spaces: 2 });
    }
    if (reportExists || shouldWriteReport) {
      report.report_file = _toRelativePosix(projectPath, reportPath);
    }
  }

  return report;
}

module.exports = {
  CLARIFICATION_FIRST_CORE_PRINCIPLE_HEADING,
  CLARIFICATION_FIRST_CORE_PRINCIPLE_SECTION,
  NO_BLIND_FIX_CORE_PRINCIPLE_HEADING,
  NO_BLIND_FIX_CORE_PRINCIPLE_SECTION,
  STEERING_CHANGE_EVALUATION_CORE_PRINCIPLE_HEADING,
  STEERING_CHANGE_EVALUATION_CORE_PRINCIPLE_SECTION,
  BACKEND_API_PRECEDENCE_CORE_PRINCIPLE_HEADING,
  BACKEND_API_PRECEDENCE_CORE_PRINCIPLE_SECTION,
  DELIVERY_SYNC_CORE_PRINCIPLE_HEADING,
  DELIVERY_SYNC_REQUIRED_LINES,
  LARGE_FILE_REFACTOR_CORE_PRINCIPLE_HEADING,
  LARGE_FILE_REFACTOR_CORE_PRINCIPLE_SECTION,
  REQUIRED_CORE_PRINCIPLE_SECTIONS,
  ERRORBOOK_REGISTRY_DEFAULTS,
  ERRORBOOK_CONVERGENCE_DEFAULTS,
  TAKEOVER_BASELINE_SCHEMA_VERSION,
  TAKEOVER_DEFAULTS,
  SESSION_GOVERNANCE_DEFAULTS,
  SPEC_DOMAIN_POLICY_DEFAULTS,
  PROBLEM_CLOSURE_POLICY_DEFAULTS,
  PROBLEM_EVAL_POLICY_DEFAULTS,
  STUDIO_INTAKE_POLICY_DEFAULTS,
  applyTakeoverBaseline
};
