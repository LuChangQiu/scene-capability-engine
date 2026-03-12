#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs-extra');

const DEFAULT_METADATA = 'docs/moqui/metadata-catalog.json';
const DEFAULT_OUT = '.sce/reports/recovery/moqui-standard-rebuild.json';
const DEFAULT_MARKDOWN_OUT = '.sce/reports/recovery/moqui-standard-rebuild.md';
const DEFAULT_BUNDLE_OUT = '.sce/reports/recovery/moqui-standard-bundle';

function parseArgs(argv) {
  const options = {
    metadata: DEFAULT_METADATA,
    out: DEFAULT_OUT,
    markdownOut: DEFAULT_MARKDOWN_OUT,
    bundleOut: DEFAULT_BUNDLE_OUT,
    json: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--metadata' && next) {
      options.metadata = next;
      i += 1;
    } else if (token === '--out' && next) {
      options.out = next;
      i += 1;
    } else if (token === '--markdown-out' && next) {
      options.markdownOut = next;
      i += 1;
    } else if (token === '--bundle-out' && next) {
      options.bundleOut = next;
      i += 1;
    } else if (token === '--json') {
      options.json = true;
    } else if (token === '--help' || token === '-h') {
      printHelpAndExit(0);
    }
  }

  return options;
}

function printHelpAndExit(code) {
  const lines = [
    'Usage: node scripts/moqui-standard-rebuild.js [options]',
    '',
    'Options:',
    `  --metadata <path>      Moqui metadata JSON path (default: ${DEFAULT_METADATA})`,
    `  --out <path>           Rebuild JSON report path (default: ${DEFAULT_OUT})`,
    `  --markdown-out <path>  Rebuild markdown summary path (default: ${DEFAULT_MARKDOWN_OUT})`,
    `  --bundle-out <path>    Generated bundle directory (default: ${DEFAULT_BUNDLE_OUT})`,
    '  --json                 Print JSON payload to stdout',
    '  -h, --help             Show this help'
  ];
  console.log(lines.join('\n'));
  process.exit(code);
}

function readPathValue(payload, pathText) {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const segments = `${pathText || ''}`
    .split('.')
    .map(token => token.trim())
    .filter(Boolean);
  let cursor = payload;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== 'object') {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function normalizeText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = `${value}`.trim();
  return text.length > 0 ? text : null;
}

function normalizeIdentifier(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
}

function collectArrayFromPaths(payload, paths) {
  for (const pathText of paths) {
    const raw = readPathValue(payload, pathText);
    if (Array.isArray(raw)) {
      return raw;
    }
  }
  return [];
}

function pickField(source, candidates) {
  for (const candidate of candidates) {
    const value = readPathValue(source, candidate);
    const text = normalizeText(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function inferServiceVerbNoun(name) {
  const text = normalizeText(name);
  if (!text) {
    return { verb: null, noun: null };
  }
  const tokenList = text
    .split(/[^a-zA-Z0-9]+/)
    .map(token => token.trim())
    .filter(Boolean);
  if (tokenList.length === 0) {
    return { verb: null, noun: null };
  }
  const lowerTokens = tokenList.map(token => token.toLowerCase());
  const knownVerbs = new Set([
    'get', 'list', 'query', 'read', 'fetch', 'search',
    'create', 'add', 'insert', 'upsert', 'update', 'edit',
    'delete', 'remove', 'cancel',
    'sync', 'export', 'import',
    'run', 'execute', 'invoke',
    'approve', 'reject', 'close', 'open',
    'validate', 'audit', 'prepare'
  ]);
  let verb = null;
  let noun = null;
  for (let i = 0; i < lowerTokens.length; i += 1) {
    if (knownVerbs.has(lowerTokens[i])) {
      verb = lowerTokens[i];
      noun = tokenList[Math.min(i + 1, tokenList.length - 1)] || tokenList[tokenList.length - 1];
      break;
    }
  }
  if (!verb) {
    if (lowerTokens.length >= 2) {
      verb = lowerTokens[lowerTokens.length - 2];
      noun = tokenList[lowerTokens.length - 1];
    } else {
      verb = 'execute';
      noun = tokenList[0];
    }
  }
  return {
    verb: normalizeText(verb),
    noun: normalizeText(noun)
  };
}

function isGovernanceLikeService(name) {
  const text = normalizeText(name);
  if (!text) {
    return false;
  }
  return /(governance|scene|suite|platform|spec\.|playbook|runbook|audit|observability|closure|program|orchestration)/i.test(text);
}

function collectEntityModels(payload) {
  const entries = collectArrayFromPaths(payload, [
    'entities',
    'entity_catalog',
    'entity_catalog.entities',
    'catalog.entities'
  ]);
  const models = [];
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const name = pickField(entry, ['name', 'entity', 'entity_name', 'id']);
    if (!name) {
      continue;
    }
    const normalized = normalizeIdentifier(name);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    const relations = toArray(entry.relations || entry.relationships || entry.relation_refs)
      .map(item => {
        if (typeof item === 'string') {
          return normalizeText(item);
        }
        if (item && typeof item === 'object') {
          return pickField(item, ['target', 'target_entity', 'entity', 'name', 'id']);
        }
        return null;
      })
      .filter(Boolean);
    models.push({
      name,
      package: pickField(entry, ['package', 'package_name', 'group', 'module']),
      relations,
      source_file: pickField(entry, ['source_file', 'source', 'file'])
    });
  }
  return models;
}

function collectServiceModels(payload) {
  const entries = collectArrayFromPaths(payload, [
    'services',
    'service_catalog',
    'service_catalog.services',
    'catalog.services'
  ]);
  const models = [];
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const name = pickField(entry, ['name', 'service', 'service_name', 'id']);
    if (!name) {
      continue;
    }
    const normalized = normalizeIdentifier(name);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    const entityRefs = toArray(entry.entities || entry.entity_refs || entry.uses_entities)
      .map(item => (typeof item === 'string' ? normalizeText(item) : pickField(item, ['name', 'entity', 'id'])))
      .filter(Boolean);
    const inferred = inferServiceVerbNoun(name);
    const verb = pickField(entry, ['verb']) || inferred.verb;
    const noun = pickField(entry, ['noun']) || inferred.noun;
    models.push({
      name,
      verb,
      noun,
      entities: entityRefs,
      source_file: pickField(entry, ['source_file', 'source', 'file'])
    });
  }
  return models;
}

function collectScreenModels(payload) {
  const entries = collectArrayFromPaths(payload, [
    'screens',
    'screen_catalog',
    'screen_catalog.screens',
    'catalog.screens'
  ]);
  const models = [];
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const screenPath = pickField(entry, ['path', 'screen_path', 'name', 'id']);
    if (!screenPath) {
      continue;
    }
    const normalized = normalizeIdentifier(screenPath);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    const services = toArray(entry.services || entry.service_refs)
      .map(item => (typeof item === 'string' ? normalizeText(item) : pickField(item, ['name', 'service', 'id'])))
      .filter(Boolean);
    const entities = toArray(entry.entities || entry.entity_refs)
      .map(item => (typeof item === 'string' ? normalizeText(item) : pickField(item, ['name', 'entity', 'id'])))
      .filter(Boolean);
    models.push({
      path: screenPath,
      services,
      entities,
      source_file: pickField(entry, ['source_file', 'source', 'file'])
    });
  }
  return models;
}

function collectFormModels(payload) {
  const entries = collectArrayFromPaths(payload, [
    'forms',
    'form_catalog',
    'form_catalog.forms',
    'catalog.forms'
  ]);
  const models = [];
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const name = pickField(entry, ['name', 'form', 'form_name', 'id']);
    if (!name) {
      continue;
    }
    const normalized = normalizeIdentifier(name);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    const explicitFieldCount = Number(readPathValue(entry, 'field_count'));
    const fieldCount = Number.isFinite(explicitFieldCount) && explicitFieldCount >= 0
      ? explicitFieldCount
      : toArray(entry.fields || entry.field_defs || entry.columns).length;
    models.push({
      name,
      screen: pickField(entry, ['screen', 'screen_path', 'screen_ref']),
      field_count: fieldCount,
      source_file: pickField(entry, ['source_file', 'source', 'file'])
    });
  }
  return models;
}

function collectNamedItems(payload, paths, itemLabel) {
  const entries = collectArrayFromPaths(payload, paths);
  const items = [];
  const seen = new Set();
  for (const entry of entries) {
    const name = typeof entry === 'string'
      ? normalizeText(entry)
      : pickField(entry, ['name', itemLabel, `${itemLabel}_name`, 'id']);
    if (!name) {
      continue;
    }
    const normalized = normalizeIdentifier(name);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    items.push(name);
  }
  return items;
}

function detectDomains(entities) {
  const domainSet = new Set();
  for (const entity of entities) {
    const packageName = normalizeText(entity && entity.package);
    if (!packageName) {
      continue;
    }
    const token = packageName.split('.')[0];
    const normalized = normalizeIdentifier(token);
    if (normalized) {
      domainSet.add(normalized);
    }
  }
  return Array.from(domainSet).sort();
}

function toPercent(numerator, denominator) {
  const num = Number(numerator);
  const den = Number(denominator);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) {
    return 0;
  }
  return Number(((num / den) * 100).toFixed(2));
}

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (numeric < 0) {
    return 0;
  }
  if (numeric > 100) {
    return 100;
  }
  return Number(numeric.toFixed(2));
}

function isInferredSource(sourceFile) {
  const source = normalizeText(sourceFile);
  if (!source) {
    return false;
  }
  return /#inferred$/i.test(source) || /[\\/]inferred([\\/]?)/i.test(source);
}

function preferNonInferred(items) {
  const list = Array.isArray(items) ? items : [];
  const filtered = list.filter(item => !isInferredSource(item && item.source_file));
  return filtered.length > 0 ? filtered : list;
}

function scoreStatus(score) {
  if (score >= 70) {
    return 'ready';
  }
  if (score >= 40) {
    return 'partial';
  }
  return 'gap';
}

function buildReadinessMatrix(context) {
  const scoringEntities = preferNonInferred(context.entities);
  const scoringServices = preferNonInferred(context.services);
  const scoringScreens = preferNonInferred(context.screens);
  const scoringForms = preferNonInferred(context.forms);

  const entityCount = scoringEntities.length;
  const serviceCount = scoringServices.length;
  const screenCount = scoringScreens.length;
  const formCount = scoringForms.length;
  const ruleCount = context.businessRules.length;
  const decisionCount = context.decisions.length;

  const entityRelationCount = scoringEntities.reduce(
    (sum, item) => sum + toArray(item && item.relations).length,
    0
  );
  const entityPackageCount = new Set(
    scoringEntities.map(item => normalizeText(item && item.package)).filter(Boolean)
  ).size;

  const servicesBoundToEntityCount = scoringServices.filter(item => toArray(item && item.entities).length > 0).length;
  const serviceVerbNounCount = scoringServices.filter(item => normalizeText(item && item.verb) || normalizeText(item && item.noun)).length;
  const governanceLikeServiceCount = scoringServices.filter(item => isGovernanceLikeService(item && item.name)).length;
  const businessLikeServiceCount = Math.max(0, serviceCount - governanceLikeServiceCount);
  const businessServiceShare = serviceCount > 0
    ? Number((businessLikeServiceCount / serviceCount).toFixed(4))
    : 0;
  const serviceStructuredNameCount = scoringServices.filter((item) => {
    const text = normalizeText(item && item.name) || '';
    return /[.#:_-]/.test(text) && text.length >= 12;
  }).length;

  const screensWithServiceCount = scoringScreens.filter(item => toArray(item && item.services).length > 0).length;
  const screensWithEntityCount = scoringScreens.filter(item => toArray(item && item.entities).length > 0).length;

  const formsWithFieldsCount = scoringForms.filter(item => Number(item && item.field_count) > 0).length;
  const formsLinkedScreenCount = scoringForms.filter(item => normalizeText(item && item.screen)).length;
  const totalFormFields = scoringForms.reduce((sum, item) => sum + (Number(item && item.field_count) || 0), 0);
  const averageFormFields = formCount > 0 ? Number((totalFormFields / formCount).toFixed(2)) : 0;
  const formScreenSet = new Set(
    scoringForms
      .map(item => normalizeText(item && item.screen))
      .filter(Boolean)
  );

  const matrix = [];
  const pushMatrixItem = (item) => {
    const status = scoreStatus(item.score);
    matrix.push({
      ...item,
      score: clampScore(item.score),
      status
    });
  };

  let entityScore = 0;
  entityScore += entityCount > 0 ? 50 : 0;
  entityScore += entityRelationCount > 0 ? 25 : 0;
  entityScore += entityPackageCount > 0 ? 25 : 0;
  const entityActions = [];
  if (entityCount === 0) entityActions.push('补齐实体清单（name/package）');
  if (entityRelationCount === 0) entityActions.push('补齐实体关系（relationship/relations）');
  if (entityPackageCount === 0) entityActions.push('补齐实体 package/domain 标注');
  pushMatrixItem({
    template_id: 'sce.scene--moqui-entity-model-core--0.1.0',
    capability: 'moqui-entity-model-core',
    reason: 'Recover entity catalog and relationship baseline.',
    score: entityScore,
    evidence: {
      entities: entityCount,
      relation_edges: entityRelationCount,
      package_count: entityPackageCount
    },
    next_actions: entityActions
  });

  const serviceEntityBindingRate = toPercent(servicesBoundToEntityCount, serviceCount);
  const serviceVerbNounRate = toPercent(serviceVerbNounCount, serviceCount);
  const serviceStructuredRate = toPercent(serviceStructuredNameCount, serviceCount);
  let serviceScore = 0;
  serviceScore += serviceCount > 0 ? 40 : 0;
  serviceScore += Number((serviceVerbNounRate * 0.35).toFixed(2));
  serviceScore += Number((serviceStructuredRate * 0.25).toFixed(2));
  serviceScore += Number((serviceEntityBindingRate * 0.25 * businessServiceShare).toFixed(2));
  const serviceActions = [];
  if (serviceCount === 0) serviceActions.push('补齐服务契约（service/ref）');
  if (serviceCount > 0 && businessLikeServiceCount > 0 && servicesBoundToEntityCount === 0) serviceActions.push('补齐服务到实体的绑定');
  if (serviceCount > 0 && serviceVerbNounCount === 0) serviceActions.push('补齐服务 verb/noun 或动作语义');
  pushMatrixItem({
    template_id: 'sce.scene--moqui-service-contract-core--0.1.0',
    capability: 'moqui-service-contract-core',
    reason: 'Recover service contracts and entity/service bindings.',
    score: serviceScore,
    evidence: {
      services: serviceCount,
      services_with_entity_binding: servicesBoundToEntityCount,
      service_entity_binding_rate_percent: serviceEntityBindingRate,
      services_with_verb_or_noun: serviceVerbNounCount,
      service_semantic_rate_percent: serviceVerbNounRate,
      services_with_structured_name: serviceStructuredNameCount,
      service_structured_rate_percent: serviceStructuredRate,
      governance_like_services: governanceLikeServiceCount,
      business_like_services: businessLikeServiceCount
    },
    next_actions: serviceActions
  });

  const screenServiceRate = toPercent(screensWithServiceCount, screenCount);
  const screenEntityRate = toPercent(screensWithEntityCount, screenCount);
  const screenFormLinkRate = toPercent(
    scoringScreens.filter(item => formScreenSet.has(normalizeText(item && item.path))).length,
    screenCount
  );
  let screenScore = 0;
  screenScore += screenCount > 0 ? 35 : 0;
  screenScore += Number((screenServiceRate * 0.4).toFixed(2));
  screenScore += Number((screenEntityRate * 0.1).toFixed(2));
  screenScore += Number((screenFormLinkRate * 0.2).toFixed(2));
  // Governance-oriented scene specs may not carry direct entity refs but still
  // provide complete flow semantics via service links + form/context coupling.
  if (screenServiceRate >= 40 && screenFormLinkRate >= 50) {
    screenScore += 5;
  }
  const screenActions = [];
  if (screenCount === 0) screenActions.push('补齐页面/场景路径');
  if (screenCount > 0 && screensWithServiceCount === 0) screenActions.push('补齐页面到服务调用映射');
  if (screenCount > 0 && screensWithEntityCount === 0 && screensWithServiceCount < Math.max(1, Math.floor(screenCount * 0.6))) {
    screenActions.push('补齐页面到实体读写映射');
  }
  pushMatrixItem({
    template_id: 'sce.scene--moqui-screen-flow-core--0.1.0',
    capability: 'moqui-screen-flow-core',
    reason: 'Recover screen flow and screen/service references.',
    score: screenScore,
    evidence: {
      screens: screenCount,
      screens_with_service_refs: screensWithServiceCount,
      screen_service_link_rate_percent: screenServiceRate,
      screens_with_entity_refs: screensWithEntityCount,
      screen_entity_link_rate_percent: screenEntityRate,
      screen_form_link_rate_percent: screenFormLinkRate
    },
    next_actions: screenActions
  });

  const formFieldRate = toPercent(formsWithFieldsCount, formCount);
  const formScreenLinkRate = toPercent(formsLinkedScreenCount, formCount);
  let formScore = 0;
  formScore += formCount > 0 ? 35 : 0;
  formScore += Number((formFieldRate * 0.35).toFixed(2));
  formScore += Number((formScreenLinkRate * 0.2).toFixed(2));
  formScore += averageFormFields >= 3 ? 10 : 0;
  const formActions = [];
  if (formCount === 0) formActions.push('补齐表单定义');
  if (formCount > 0 && formsWithFieldsCount === 0) formActions.push('补齐表单字段定义');
  if (formCount > 0 && formsLinkedScreenCount === 0) formActions.push('补齐表单到页面映射');
  if (formCount > 0 && averageFormFields < 3) formActions.push('提升表单字段完备度（平均字段数>=3）');
  pushMatrixItem({
    template_id: 'sce.scene--moqui-form-interaction-core--0.1.0',
    capability: 'moqui-form-interaction-core',
    reason: 'Recover form schema and page interaction fields.',
    score: formScore,
    evidence: {
      forms: formCount,
      forms_with_fields: formsWithFieldsCount,
      form_field_rate_percent: formFieldRate,
      forms_with_screen_link: formsLinkedScreenCount,
      form_screen_link_rate_percent: formScreenLinkRate,
      average_form_fields: averageFormFields
    },
    next_actions: formActions
  });

  const decisionBalanceRate = (ruleCount > 0 && decisionCount > 0)
    ? toPercent(Math.min(ruleCount, decisionCount), Math.max(ruleCount, decisionCount))
    : 0;
  let ruleDecisionScore = 0;
  ruleDecisionScore += ruleCount > 0 ? 30 : 0;
  ruleDecisionScore += decisionCount > 0 ? 30 : 0;
  ruleDecisionScore += Number((decisionBalanceRate * 0.4).toFixed(2));
  const ruleDecisionActions = [];
  if (ruleCount === 0) ruleDecisionActions.push('补齐业务规则清单');
  if (decisionCount === 0) ruleDecisionActions.push('补齐决策策略/decision_logic');
  if (ruleCount > 0 && decisionCount > 0 && decisionBalanceRate < 60) {
    ruleDecisionActions.push('提升规则与决策配平度（rule/decision 数量比）');
  }
  pushMatrixItem({
    template_id: 'sce.scene--moqui-rule-decision-core--0.1.0',
    capability: 'moqui-rule-decision-core',
    reason: 'Recover business rules and decision policies.',
    score: ruleDecisionScore,
    evidence: {
      business_rules: ruleCount,
      decisions: decisionCount,
      rule_decision_balance_rate_percent: decisionBalanceRate
    },
    next_actions: ruleDecisionActions
  });

  const copilotReadinessRate = toPercent(
    Number(screenCount > 0) + Number(serviceCount > 0) + Number(formCount > 0) + Number(ruleCount + decisionCount > 0),
    4
  );
  let copilotScore = 0;
  copilotScore += screenCount > 0 ? 35 : 0;
  copilotScore += serviceCount > 0 ? 20 : 0;
  copilotScore += formCount > 0 ? 20 : 0;
  copilotScore += (ruleCount + decisionCount) > 0 ? 15 : 0;
  copilotScore += Number((screenServiceRate * 0.1).toFixed(2));
  const copilotActions = [];
  if (screenCount === 0) copilotActions.push('补齐页面上下文（screen_path/route/module）');
  if (serviceCount === 0) copilotActions.push('补齐页面服务引用，支持诊断链路');
  if (formCount === 0) copilotActions.push('补齐表单交互上下文，支持页面修复建议');
  if ((ruleCount + decisionCount) === 0) copilotActions.push('补齐规则与决策语义，提升 AI 建议可靠性');
  pushMatrixItem({
    template_id: 'sce.scene--moqui-page-copilot-dialog--0.1.0',
    capability: 'moqui-page-copilot-context-fix',
    reason: 'Inject page-level human/AI copilot dialog for in-context fix guidance.',
    score: copilotScore,
    evidence: {
      screens: screenCount,
      services: serviceCount,
      forms: formCount,
      semantics: ruleCount + decisionCount,
      readiness_rate_percent: copilotReadinessRate
    },
    next_actions: copilotActions
  });

  matrix.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    return a.template_id.localeCompare(b.template_id);
  });
  return matrix;
}

function buildRecommendedTemplates(readinessMatrix) {
  return readinessMatrix
    .filter(item => item.status !== 'gap')
    .map(item => ({
      id: item.template_id,
      reason: item.reason
    }));
}

function buildCapabilities(readinessMatrix) {
  return readinessMatrix
    .filter(item => item.status !== 'gap')
    .map(item => item.capability);
}

function buildSpecPlan(readinessMatrix) {
  const specs = [];
  const pushSpec = (specId, goal, dependencies = []) => {
    specs.push({
      spec_id: specId,
      goal,
      depends_on: dependencies
    });
  };

  const statusByCapability = {};
  for (const item of readinessMatrix) {
    statusByCapability[item.capability] = item.status;
  }
  const hasCapability = (capability) => statusByCapability[capability] && statusByCapability[capability] !== 'gap';

  if (hasCapability('moqui-entity-model-core')) {
    pushSpec('moqui-01-entity-model-recovery', 'Recover entity model and relations.');
  }
  if (hasCapability('moqui-service-contract-core')) {
    pushSpec(
      'moqui-02-service-contract-recovery',
      'Recover service contracts and entity bindings.',
      hasCapability('moqui-entity-model-core') ? ['moqui-01-entity-model-recovery'] : []
    );
  }
  if (hasCapability('moqui-screen-flow-core')) {
    pushSpec(
      'moqui-03-screen-flow-recovery',
      'Recover screens and navigation/service linkage.',
      hasCapability('moqui-service-contract-core') ? ['moqui-02-service-contract-recovery'] : []
    );
  }
  if (hasCapability('moqui-form-interaction-core')) {
    pushSpec(
      'moqui-04-form-interaction-recovery',
      'Recover form schema and page actions.',
      hasCapability('moqui-screen-flow-core') ? ['moqui-03-screen-flow-recovery'] : []
    );
  }
  if (hasCapability('moqui-rule-decision-core')) {
    pushSpec(
      'moqui-05-rule-decision-recovery',
      'Recover business rules and decision strategy mapping.',
      hasCapability('moqui-service-contract-core') ? ['moqui-02-service-contract-recovery'] : []
    );
  }
  if (hasCapability('moqui-page-copilot-context-fix')) {
    pushSpec(
      'moqui-06-page-copilot-integration',
      'Integrate page-level copilot dialog for contextual fix guidance.',
      hasCapability('moqui-screen-flow-core') ? ['moqui-03-screen-flow-recovery'] : []
    );
  }
  return specs;
}

function buildOntologySeed(context) {
  const nodes = [];
  const edges = [];
  const nodeSet = new Set();
  const edgeSet = new Set();

  const addNode = (kind, id, metadata = {}) => {
    const normalized = normalizeIdentifier(id);
    if (!normalized) {
      return null;
    }
    const key = `${kind}:${normalized}`;
    if (!nodeSet.has(key)) {
      nodeSet.add(key);
      nodes.push({
        id: key,
        kind,
        label: id,
        metadata
      });
    }
    return key;
  };

  const addEdge = (from, to, relation) => {
    if (!from || !to || !relation) {
      return;
    }
    const key = `${from}|${relation}|${to}`;
    if (edgeSet.has(key)) {
      return;
    }
    edgeSet.add(key);
    edges.push({
      from,
      to,
      relation
    });
  };

  for (const entity of context.entities) {
    addNode('entity', entity.name, { package: entity.package || null });
  }
  for (const service of context.services) {
    const serviceNode = addNode('service', service.name, { verb: service.verb || null, noun: service.noun || null });
    for (const entityName of service.entities) {
      const entityNode = addNode('entity', entityName);
      addEdge(serviceNode, entityNode, 'uses_entity');
    }
  }
  for (const screen of context.screens) {
    const screenNode = addNode('screen', screen.path);
    for (const serviceName of screen.services) {
      const serviceNode = addNode('service', serviceName);
      addEdge(screenNode, serviceNode, 'invokes_service');
    }
    for (const entityName of screen.entities) {
      const entityNode = addNode('entity', entityName);
      addEdge(screenNode, entityNode, 'reads_entity');
    }
  }
  for (const form of context.forms) {
    const formNode = addNode('form', form.name, { field_count: form.field_count || 0 });
    if (form.screen) {
      const screenNode = addNode('screen', form.screen);
      addEdge(formNode, screenNode, 'belongs_screen');
    }
  }
  for (const rule of context.businessRules) {
    addNode('business_rule', rule);
  }
  for (const decision of context.decisions) {
    addNode('decision', decision);
  }

  return {
    version: '1.0',
    generated_at: new Date().toISOString(),
    summary: {
      nodes: nodes.length,
      edges: edges.length
    },
    nodes,
    edges
  };
}

function buildCopilotContract(context) {
  return {
    mode: 'moqui-page-copilot-context-fix',
    version: '1.0',
    description: (
      'Page-level human/AI copilot contract. ' +
      'Keep original Moqui stack, generate advisory/patch responses bound to current page context.'
    ),
    context: {
      page: {
        required: ['screen_path', 'route', 'module'],
        optional: ['form_name', 'widget_id', 'entity_refs', 'service_refs']
      },
      user_action: {
        required: ['intent', 'expected_outcome'],
        optional: ['last_operation', 'selection', 'filters']
      },
      runtime: {
        required: ['timestamp'],
        optional: ['error_message', 'error_stack', 'request_id', 'session_user']
      }
    },
    response: {
      policy: ['advisory', 'patch-proposal'],
      required: ['diagnosis', 'change_plan', 'risk_notes'],
      optional: ['patch_preview', 'validation_steps']
    },
    guardrails: {
      stack_policy: 'preserve-original-stack',
      write_policy: 'no-auto-apply-without-confirm',
      target_scope: 'current-page-and-direct-dependencies'
    },
    starter_prompts: [
      '这个页面为什么报错？请基于当前上下文定位根因并给出修复方案。',
      '不改变现有技术栈，给出最小修复补丁和验证步骤。',
      '如果涉及实体/服务/页面联动，请列出影响面和回滚点。'
    ],
    sample_page_refs: context.screens.slice(0, 5).map(item => item.path)
  };
}

function buildMarkdownReport(report) {
  const lines = [];
  lines.push('# Moqui Standard Rebuild Plan');
  lines.push('');
  lines.push(`- Generated at: ${report.generated_at}`);
  lines.push(`- Metadata file: ${report.metadata_file}`);
  lines.push(`- Bundle output: ${report.output.bundle_dir}`);
  lines.push('');
  lines.push('## Inventory');
  lines.push('');
  lines.push(`- Entities: ${report.inventory.entities}`);
  lines.push(`- Services: ${report.inventory.services}`);
  lines.push(`- Screens: ${report.inventory.screens}`);
  lines.push(`- Forms: ${report.inventory.forms}`);
  lines.push(`- Business rules: ${report.inventory.business_rules}`);
  lines.push(`- Decisions: ${report.inventory.decisions}`);
  lines.push(`- Domains: ${report.inventory.domains.length > 0 ? report.inventory.domains.join(', ') : 'none'}`);
  lines.push('');
  lines.push('## Template Readiness Matrix');
  lines.push('');
  lines.push('| Template | Capability | Score | Status |');
  lines.push('| --- | --- | ---: | --- |');
  for (const item of report.recovery.readiness_matrix || []) {
    lines.push(`| ${item.template_id} | ${item.capability} | ${item.score} | ${item.status} |`);
  }
  lines.push('');
  lines.push('## Prioritized Gaps');
  lines.push('');
  const prioritizedGaps = report.recovery.prioritized_gaps || [];
  if (prioritizedGaps.length === 0) {
    lines.push('- none');
  } else {
    for (const gap of prioritizedGaps) {
      const actions = Array.isArray(gap.next_actions) && gap.next_actions.length > 0
        ? gap.next_actions.join(' | ')
        : 'none';
      lines.push(`- ${gap.template_id} (${gap.score}, ${gap.status}): ${actions}`);
    }
  }
  lines.push('');
  lines.push('## Recommended Templates');
  lines.push('');
  if (report.recovery.recommended_templates.length === 0) {
    lines.push('- none');
  } else {
    for (const item of report.recovery.recommended_templates) {
      lines.push(`- ${item.id}: ${item.reason}`);
    }
  }
  lines.push('');
  lines.push('## Spec Plan');
  lines.push('');
  if (report.recovery.spec_plan.length === 0) {
    lines.push('- none');
  } else {
    for (const item of report.recovery.spec_plan) {
      const deps = Array.isArray(item.depends_on) && item.depends_on.length > 0
        ? item.depends_on.join(', ')
        : 'none';
      lines.push(`- ${item.spec_id}: ${item.goal} (depends_on: ${deps})`);
    }
  }
  lines.push('');
  lines.push('## Output');
  lines.push('');
  lines.push(`- Handoff manifest: ${report.output.handoff_manifest}`);
  lines.push(`- Ontology seed: ${report.output.ontology_seed}`);
  lines.push(`- Copilot contract: ${report.output.copilot_contract}`);
  lines.push(`- Copilot playbook: ${report.output.copilot_playbook}`);
  lines.push(`- Remediation queue: ${report.output.remediation_queue}`);
  lines.push(`- Remediation plan: ${report.output.remediation_plan_json}`);
  return `${lines.join('\n')}\n`;
}

function buildRemediationQueueLines(prioritizedGaps) {
  const lines = [];
  for (const gap of prioritizedGaps) {
    const templateId = normalizeText(gap && gap.template_id) || 'unknown-template';
    const actions = Array.isArray(gap && gap.next_actions) && gap.next_actions.length > 0
      ? gap.next_actions
      : ['补齐模板语义输入'];
    for (const action of actions) {
      lines.push(`[${templateId}] ${action}`);
    }
  }
  return lines;
}

function buildRemediationPlanMarkdown(plan) {
  const lines = [];
  lines.push('# Matrix Remediation Plan');
  lines.push('');
  lines.push(`- Generated at: ${plan.generated_at}`);
  lines.push(`- Coverage summary: ${plan.summary.total_gaps} gap items`);
  lines.push('');
  lines.push('## Items');
  lines.push('');
  if (!Array.isArray(plan.items) || plan.items.length === 0) {
    lines.push('- none');
    return `${lines.join('\n')}\n`;
  }
  for (const item of plan.items) {
    lines.push(`### ${item.template_id}`);
    lines.push('');
    lines.push(`- Status: ${item.status}`);
    lines.push(`- Score: ${item.score}`);
    lines.push(`- Summary: ${item.summary}`);
    lines.push(`- Suggested fields: ${(item.suggested_fields || []).join(', ') || 'none'}`);
    lines.push(`- Source files: ${(item.source_files || []).length}`);
    const files = Array.isArray(item.source_files) ? item.source_files.slice(0, 10) : [];
    for (const file of files) {
      lines.push(
        `  - ${file.source_file}: ${file.missing_count} issue(s), missing=${(file.missing_types || []).join('|') || 'unknown'}`
      );
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function buildSourceIssueSummary(issues, limit = 20) {
  const preferredSourcePattern = /^\.sce\/specs\/[^/]+\/docs\/scene-package\.json$/i;
  const allIssues = Array.isArray(issues) ? issues : [];
  const preferredIssues = allIssues.filter((issue) => {
    const sourceFile = normalizeText(issue && issue.source_file);
    return Boolean(sourceFile && preferredSourcePattern.test(sourceFile.replace(/\\/g, '/')));
  });
  const selectedIssues = preferredIssues.length > 0 ? preferredIssues : allIssues;

  const bucket = new Map();
  for (const issue of selectedIssues) {
    const sourceFile = normalizeText(issue && issue.source_file) || '(unknown-source)';
    const key = sourceFile;
    const current = bucket.get(key) || {
      source_file: sourceFile,
      missing_count: 0,
      missing_types: new Set(),
      sample_items: []
    };
    current.missing_count += 1;
    for (const missingType of toArray(issue && issue.missing_types)) {
      const text = normalizeText(missingType);
      if (text) {
        current.missing_types.add(text);
      }
    }
    const sampleName = normalizeText(issue && issue.name);
    if (sampleName && current.sample_items.length < 5) {
      current.sample_items.push(sampleName);
    }
    bucket.set(key, current);
  }

  return Array.from(bucket.values())
    .map(item => ({
      source_file: item.source_file,
      missing_count: item.missing_count,
      missing_types: Array.from(item.missing_types).sort(),
      sample_items: item.sample_items
    }))
    .sort((a, b) => {
      if (b.missing_count !== a.missing_count) {
        return b.missing_count - a.missing_count;
      }
      return a.source_file.localeCompare(b.source_file);
    })
    .slice(0, limit);
}

function buildMatrixRemediationPlan(context, prioritizedGaps) {
  const items = [];
  const addItem = (item) => {
    if (!item) {
      return;
    }
    items.push(item);
  };

  for (const gap of prioritizedGaps) {
    const templateId = normalizeText(gap && gap.template_id);
    if (!templateId) {
      continue;
    }

    if (templateId === 'sce.scene--moqui-service-contract-core--0.1.0') {
      const issues = [];
      for (const service of context.services) {
        const missingTypes = [];
        if (toArray(service && service.entities).length === 0) {
          missingTypes.push('service.entities');
        }
        if (!normalizeText(service && service.verb) && !normalizeText(service && service.noun)) {
          missingTypes.push('service.verb_noun');
        }
        if (missingTypes.length > 0) {
          issues.push({
            source_file: service.source_file,
            name: service.name,
            missing_types: missingTypes
          });
        }
      }
      addItem({
        template_id: templateId,
        status: gap.status,
        score: gap.score,
        summary: '补齐服务契约语义与实体绑定。',
        suggested_fields: ['services[].entities', 'services[].verb', 'services[].noun'],
        source_files: buildSourceIssueSummary(issues)
      });
      continue;
    }

    if (templateId === 'sce.scene--moqui-screen-flow-core--0.1.0') {
      const issues = [];
      for (const screen of context.screens) {
        const missingTypes = [];
        if (toArray(screen && screen.services).length === 0) {
          missingTypes.push('screens[].services');
        }
        if (toArray(screen && screen.entities).length === 0) {
          missingTypes.push('screens[].entities');
        }
        if (missingTypes.length > 0) {
          issues.push({
            source_file: screen.source_file,
            name: screen.path,
            missing_types: missingTypes
          });
        }
      }
      addItem({
        template_id: templateId,
        status: gap.status,
        score: gap.score,
        summary: '补齐页面流转中的服务与实体映射。',
        suggested_fields: ['screens[].services', 'screens[].entities'],
        source_files: buildSourceIssueSummary(issues)
      });
      continue;
    }

    if (templateId === 'sce.scene--moqui-form-interaction-core--0.1.0') {
      const issues = [];
      for (const form of context.forms) {
        const missingTypes = [];
        if ((Number(form && form.field_count) || 0) <= 0) {
          missingTypes.push('forms[].fields');
        }
        if (!normalizeText(form && form.screen)) {
          missingTypes.push('forms[].screen');
        }
        if (missingTypes.length > 0) {
          issues.push({
            source_file: form.source_file,
            name: form.name,
            missing_types: missingTypes
          });
        }
      }
      addItem({
        template_id: templateId,
        status: gap.status,
        score: gap.score,
        summary: '补齐表单字段与页面交互上下文。',
        suggested_fields: ['forms[].fields', 'forms[].field_count', 'forms[].screen'],
        source_files: buildSourceIssueSummary(issues)
      });
      continue;
    }

    if (templateId === 'sce.scene--moqui-rule-decision-core--0.1.0') {
      addItem({
        template_id: templateId,
        status: gap.status,
        score: gap.score,
        summary: '补齐业务规则与决策策略语义映射。',
        suggested_fields: ['business_rules[]', 'decisions[]', 'governance_contract.business_rules', 'governance_contract.decision_logic'],
        source_files: []
      });
      continue;
    }

    if (templateId === 'sce.scene--moqui-page-copilot-dialog--0.1.0') {
      addItem({
        template_id: templateId,
        status: gap.status,
        score: gap.score,
        summary: '补齐页面级 copilot 所需上下文。',
        suggested_fields: ['screens[].services', 'screens[].entities', 'forms[].field_count', 'decisions[]'],
        source_files: []
      });
      continue;
    }
  }

  return {
    mode: 'moqui-matrix-remediation-plan',
    generated_at: new Date().toISOString(),
    summary: {
      total_gaps: items.length
    },
    items
  };
}

async function writeBundle(bundleDir, payload) {
  const handoffDir = path.join(bundleDir, 'handoff');
  const ontologyDir = path.join(bundleDir, 'ontology');
  const copilotDir = path.join(bundleDir, 'copilot');
  const rebuildDir = path.join(bundleDir, 'rebuild');

  const handoffManifestPath = path.join(handoffDir, 'handoff-manifest.json');
  const ontologySeedPath = path.join(ontologyDir, 'moqui-ontology-seed.json');
  const copilotContractPath = path.join(copilotDir, 'page-context-contract.json');
  const copilotPlaybookPath = path.join(copilotDir, 'conversation-playbook.md');
  const recoverySpecPath = path.join(rebuildDir, 'recovery-spec-plan.json');
  const remediationQueuePath = path.join(rebuildDir, 'matrix-remediation.lines');
  const remediationPlanJsonPath = path.join(rebuildDir, 'matrix-remediation-plan.json');
  const remediationPlanMarkdownPath = path.join(rebuildDir, 'matrix-remediation-plan.md');

  await fs.ensureDir(handoffDir);
  await fs.ensureDir(ontologyDir);
  await fs.ensureDir(copilotDir);
  await fs.ensureDir(rebuildDir);

  await fs.writeJson(handoffManifestPath, payload.handoff_manifest, { spaces: 2 });
  await fs.writeJson(ontologySeedPath, payload.ontology_seed, { spaces: 2 });
  await fs.writeJson(copilotContractPath, payload.copilot_contract, { spaces: 2 });
  await fs.writeJson(recoverySpecPath, payload.recovery_spec_plan, { spaces: 2 });
  await fs.writeJson(remediationPlanJsonPath, payload.remediation_plan, { spaces: 2 });
  await fs.writeFile(
    remediationPlanMarkdownPath,
    buildRemediationPlanMarkdown(payload.remediation_plan),
    'utf8'
  );
  await fs.writeFile(
    remediationQueuePath,
    buildRemediationQueueLines(payload.prioritized_gaps).join('\n') + '\n',
    'utf8'
  );
  await fs.writeFile(
    copilotPlaybookPath,
    [
      '# Page Copilot Conversation Playbook',
      '',
      '1. Capture current page context (screen path, form, user action, error).',
      '2. Ask for diagnosis first, then ask for minimum patch proposal.',
      '3. Keep response in advisory/patch-proposal mode.',
      '4. Apply patch only after human confirmation and run validation checks.',
      '',
      'This playbook keeps original Moqui technology stack unchanged.'
    ].join('\n'),
    'utf8'
  );

  return {
    handoffManifestPath,
    ontologySeedPath,
    copilotContractPath,
    copilotPlaybookPath,
    recoverySpecPath,
    remediationQueuePath,
    remediationPlanJsonPath,
    remediationPlanMarkdownPath
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const metadataPath = path.resolve(process.cwd(), options.metadata);
  const outPath = path.resolve(process.cwd(), options.out);
  const markdownPath = path.resolve(process.cwd(), options.markdownOut);
  const bundleDir = path.resolve(process.cwd(), options.bundleOut);

  if (!(await fs.pathExists(metadataPath))) {
    throw new Error(`metadata file not found: ${path.relative(process.cwd(), metadataPath)}`);
  }

  const metadata = await fs.readJson(metadataPath);

  const entities = collectEntityModels(metadata);
  const services = collectServiceModels(metadata);
  const screens = collectScreenModels(metadata);
  const forms = collectFormModels(metadata);
  const businessRules = collectNamedItems(metadata, ['business_rules', 'rules', 'rule_catalog'], 'rule');
  const decisions = collectNamedItems(metadata, ['decisions', 'decision_points', 'decision_catalog'], 'decision');
  const domains = detectDomains(entities);

  const context = {
    entities,
    services,
    screens,
    forms,
    businessRules,
    decisions
  };

  const readinessMatrix = buildReadinessMatrix(context);
  const prioritizedGaps = readinessMatrix
    .filter(item => item.status !== 'ready')
    .sort((a, b) => a.score - b.score);
  const remediationPlan = buildMatrixRemediationPlan(context, prioritizedGaps);
  const readinessSummary = {
    average_score: Number((
      readinessMatrix.reduce((sum, item) => sum + Number(item.score || 0), 0) / Math.max(1, readinessMatrix.length)
    ).toFixed(2)),
    ready: readinessMatrix.filter(item => item.status === 'ready').length,
    partial: readinessMatrix.filter(item => item.status === 'partial').length,
    gap: readinessMatrix.filter(item => item.status === 'gap').length
  };

  const recommendedTemplates = buildRecommendedTemplates(readinessMatrix);
  const capabilities = buildCapabilities(readinessMatrix);
  const specPlan = buildSpecPlan(readinessMatrix);
  const ontologySeed = buildOntologySeed(context);
  const copilotContract = buildCopilotContract(context);

  const handoffManifest = {
    timestamp: new Date().toISOString(),
    source_project: normalizeText(metadata.source_project) || normalizeText(metadata.project) || 'moqui-standard-rebuild',
    specs: specPlan.map(item => item.spec_id),
    templates: recommendedTemplates.map(item => item.id),
    capabilities,
    ontology_validation: {
      status: 'pending',
      source: 'moqui-standard-rebuild',
      generated_at: new Date().toISOString()
    },
    known_gaps: prioritizedGaps.map(item => ({
      template: item.template_id,
      score: item.score,
      status: item.status,
      next_actions: item.next_actions
    }))
  };

  const bundleFiles = await writeBundle(bundleDir, {
    handoff_manifest: handoffManifest,
    ontology_seed: ontologySeed,
    copilot_contract: copilotContract,
    recovery_spec_plan: specPlan,
    prioritized_gaps: prioritizedGaps,
    remediation_plan: remediationPlan
  });

  const report = {
    mode: 'moqui-standard-rebuild',
    generated_at: new Date().toISOString(),
    metadata_file: path.relative(process.cwd(), metadataPath),
    inventory: {
      entities: entities.length,
      services: services.length,
      screens: screens.length,
      forms: forms.length,
      business_rules: businessRules.length,
      decisions: decisions.length,
      domains
    },
    recovery: {
      readiness_summary: readinessSummary,
      readiness_matrix: readinessMatrix,
      prioritized_gaps: prioritizedGaps,
      remediation_plan: remediationPlan,
      recommended_templates: recommendedTemplates,
      capabilities,
      spec_plan: specPlan
    },
    output: {
      bundle_dir: path.relative(process.cwd(), bundleDir),
      handoff_manifest: path.relative(process.cwd(), bundleFiles.handoffManifestPath),
      ontology_seed: path.relative(process.cwd(), bundleFiles.ontologySeedPath),
      copilot_contract: path.relative(process.cwd(), bundleFiles.copilotContractPath),
      copilot_playbook: path.relative(process.cwd(), bundleFiles.copilotPlaybookPath),
      recovery_spec_plan: path.relative(process.cwd(), bundleFiles.recoverySpecPath),
      remediation_queue: path.relative(process.cwd(), bundleFiles.remediationQueuePath),
      remediation_plan_json: path.relative(process.cwd(), bundleFiles.remediationPlanJsonPath),
      remediation_plan_markdown: path.relative(process.cwd(), bundleFiles.remediationPlanMarkdownPath)
    }
  };

  await fs.ensureDir(path.dirname(outPath));
  await fs.writeJson(outPath, report, { spaces: 2 });
  await fs.ensureDir(path.dirname(markdownPath));
  await fs.writeFile(markdownPath, buildMarkdownReport(report), 'utf8');

  const stdoutPayload = {
    ...report,
    report_files: {
      json: path.relative(process.cwd(), outPath),
      markdown: path.relative(process.cwd(), markdownPath)
    }
  };

  if (options.json) {
    console.log(JSON.stringify(stdoutPayload, null, 2));
  } else {
    console.log('Moqui standard rebuild plan generated.');
    console.log(`  JSON: ${path.relative(process.cwd(), outPath)}`);
    console.log(`  Markdown: ${path.relative(process.cwd(), markdownPath)}`);
    console.log(`  Bundle: ${path.relative(process.cwd(), bundleDir)}`);
  }
}

main().catch((error) => {
  console.error(`Failed to build Moqui standard rebuild plan: ${error.message}`);
  process.exitCode = 1;
});
