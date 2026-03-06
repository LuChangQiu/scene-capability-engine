const path = require('path');
const fsExtra = require('fs-extra');
const TemplateManager = require('../templates/template-manager');

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = normalizeText(String(value || '')).toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

async function listCapabilityCatalogService(options = {}, dependencies = {}) {
  const manager = dependencies.manager || new TemplateManager();
  const templates = dependencies.filterCapabilityCatalogEntries((await manager.listTemplates({
    category: options.category,
    source: options.source,
    templateType: 'capability-template',
    compatibleWith: options.compatibleWith,
    riskLevel: options.risk
  })).map((template) => dependencies.enrichCapabilityTemplateForUi(template)), options);
  return {
    mode: 'capability-catalog-list',
    templates
  };
}

async function searchCapabilityCatalogService(keyword, options = {}, dependencies = {}) {
  const manager = dependencies.manager || new TemplateManager();
  const templates = dependencies.filterCapabilityCatalogEntries((await manager.searchTemplates(keyword, {
    category: options.category,
    source: options.source,
    templateType: 'capability-template',
    compatibleWith: options.compatibleWith,
    riskLevel: options.risk
  })).map((template) => dependencies.enrichCapabilityTemplateForUi(template)), options);
  return {
    mode: 'capability-catalog-search',
    keyword,
    templates
  };
}

async function showCapabilityTemplateService(templatePath, options = {}, dependencies = {}) {
  const manager = dependencies.manager || new TemplateManager();
  const template = dependencies.enrichCapabilityTemplateForUi(await manager.showTemplate(templatePath));
  const parsed = dependencies.parseTemplatePath(templatePath);
  await manager.ensureCached(parsed.sourceName);
  const sourcePath = manager.cacheManager.getSourceCachePath(parsed.sourceName);
  const templateDir = path.join(sourcePath, parsed.templateId);
  const capabilityFile = path.join(templateDir, 'capability-template.json');
  let templatePayload = null;
  if (await fsExtra.pathExists(capabilityFile)) {
    try {
      templatePayload = await fsExtra.readJson(capabilityFile);
    } catch (_error) {
      templatePayload = null;
    }
  }
  return {
    mode: 'capability-catalog-show',
    template,
    template_file: await fsExtra.pathExists(capabilityFile) ? capabilityFile : null,
    payload: templatePayload
  };
}

async function matchCapabilityTemplatesService(options = {}, dependencies = {}) {
  const projectPath = options.projectPath || process.cwd();
  const fileSystem = options.fileSystem || fsExtra;
  const specId = normalizeText(options.spec || options.specId);
  if (!specId) {
    throw new Error('spec is required for capability match');
  }
  const chain = await dependencies.loadSpecDomainChain(projectPath, specId, fileSystem);
  if (!chain.exists && normalizeBoolean(options.strict, false)) {
    throw new Error('problem-domain-chain missing for spec ' + specId);
  }
  if (chain.error && normalizeBoolean(options.strict, false)) {
    throw new Error('problem-domain-chain invalid: ' + chain.error);
  }
  const domainChain = chain.payload || {};
  const specScope = dependencies.buildOntologyScopeFromChain(domainChain);
  const queryTokens = dependencies.normalizeTokenList(options.query)
    .concat(dependencies.normalizeTokenList(domainChain.problem && domainChain.problem.statement))
    .concat(dependencies.normalizeTokenList(domainChain.scene_id));
  const manager = dependencies.manager || new TemplateManager();
  const templates = await manager.listTemplates({
    source: options.source,
    templateType: 'capability-template',
    compatibleWith: options.compatibleWith,
    riskLevel: options.risk
  });
  const matches = templates.map((template) => {
    const overlap = dependencies.buildOntologyOverlap(specScope, template.ontology_scope || {});
    const scenarioScore = template.applicable_scenarios && domainChain.scene_id
      ? (template.applicable_scenarios.includes(domainChain.scene_id) ? 1 : 0)
      : 0;
    const keywordScore = dependencies.buildKeywordScore(template, queryTokens);
    const totalScore = (overlap.score * 0.6) + (scenarioScore * 0.2) + (keywordScore * 0.2);
    const ontologyCore = template.ontology_core || dependencies.buildCoreOntologySummary(template.ontology_scope || {});
    return {
      template_id: template.id,
      source: template.source,
      name: template.name,
      description: template.description,
      category: template.category,
      risk_level: template.risk_level,
      ontology_core: ontologyCore,
      ontology_core_ui: dependencies.buildOntologyCoreUiState(ontologyCore),
      score: Math.round(totalScore * 100),
      score_components: {
        ontology: Number(overlap.score.toFixed(3)),
        scenario: scenarioScore,
        keyword: Number(keywordScore.toFixed(3))
      },
      overlap
    };
  }).sort((a, b) => b.score - a.score);

  const limit = toPositiveInteger(options.limit, 10);
  return {
    mode: 'capability-match',
    spec_id: specId,
    scene_id: domainChain.scene_id || null,
    query: normalizeText(options.query) || null,
    ontology_source: chain.exists ? chain.path : null,
    match_count: matches.length,
    matches: matches.slice(0, limit),
    warnings: chain.exists ? [] : ['problem-domain-chain missing; ontology-based match unavailable']
  };
}

async function useCapabilityTemplateService(options = {}, dependencies = {}) {
  const projectPath = options.projectPath || process.cwd();
  const fileSystem = options.fileSystem || fsExtra;
  const templateId = normalizeText(options.template || options.id);
  if (!templateId) {
    throw new Error('template is required for capability use');
  }
  if (normalizeBoolean(options.apply, false) && normalizeBoolean(options.write, true) === false) {
    throw new Error('cannot use --apply with --no-write');
  }
  const specId = normalizeText(options.spec || options.specId) || null;
  const manager = dependencies.manager || new TemplateManager();
  const template = await manager.showTemplate(templateId);
  const parsed = dependencies.parseTemplatePath(templateId);
  await manager.ensureCached(parsed.sourceName);
  const sourcePath = manager.cacheManager.getSourceCachePath(parsed.sourceName);
  const templateDir = path.join(sourcePath, parsed.templateId);
  const capabilityFile = path.join(templateDir, 'capability-template.json');
  let templatePayload = null;
  if (await fileSystem.pathExists(capabilityFile)) {
    try {
      templatePayload = await fileSystem.readJson(capabilityFile);
    } catch (_error) {
      templatePayload = null;
    }
  }

  const recommendedTasks = [];
  if (templatePayload && templatePayload.source_candidate && Array.isArray(templatePayload.source_candidate.specs)) {
    templatePayload.source_candidate.specs.forEach((spec) => {
      const sample = Array.isArray(spec.task_sample) ? spec.task_sample : [];
      sample.forEach((task) => {
        if (task && task.title) {
          recommendedTasks.push({
            title: task.title,
            source_spec_id: spec.spec_id || null,
            source_task_id: task.id || null
          });
        }
      });
    });
  }
  if (recommendedTasks.length === 0) {
    recommendedTasks.push({ title: 'Implement capability scope: ' + (template.name || parsed.templateId) });
  }

  const ontologyCore = template.ontology_core || dependencies.buildCoreOntologySummary(template.ontology_scope || {});
  const plan = {
    mode: 'capability-use-plan',
    generated_at: new Date().toISOString(),
    template: {
      id: template.id,
      name: template.name,
      source: template.source,
      description: template.description,
      ontology_scope: template.ontology_scope || {},
      ontology_core: ontologyCore,
      ontology_core_ui: dependencies.buildOntologyCoreUiState(ontologyCore)
    },
    spec_id: specId,
    recommended_tasks: recommendedTasks
  };

  const outputPath = normalizeText(options.out) || dependencies.buildDefaultUsePlanPath(specId || 'spec', template.id);
  if (normalizeBoolean(options.write, true)) {
    await fileSystem.ensureDir(path.dirname(path.join(projectPath, outputPath)));
    await fileSystem.writeJson(path.join(projectPath, outputPath), plan, { spaces: 2 });
    plan.output_file = outputPath;
  }

  if (normalizeBoolean(options.apply, false)) {
    if (!specId) {
      throw new Error('spec is required for --apply');
    }
    plan.apply = await dependencies.appendCapabilityPlanToSpecTasks({
      projectPath,
      spec: specId,
      sectionTitle: options.sectionTitle
    }, plan, fileSystem);
  }

  return plan;
}

module.exports = {
  listCapabilityCatalogService,
  searchCapabilityCatalogService,
  showCapabilityTemplateService,
  matchCapabilityTemplatesService,
  useCapabilityTemplateService
};
