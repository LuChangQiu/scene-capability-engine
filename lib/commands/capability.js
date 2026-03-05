/**
 * Capability Iteration Commands
 *
 * Extracts capability candidates from scene/spec/task history,
 * scores candidates, maps them to ontology scope, and exports
 * registry-ready capability template packages.
 */

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const TaskClaimer = require('../task/task-claimer');
const { runStudioSpecGovernance } = require('../studio/spec-intake-governor');
const { SceStateStore } = require('../state/sce-state-store');
const packageJson = require('../../package.json');

const DEFAULT_ITERATION_DIR = '.sce/reports/capability-iteration';
const DEFAULT_EXPORT_ROOT = '.sce/templates/exports';

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = normalizeText(`${value || ''}`).toLowerCase();
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
  const parsed = Number.parseInt(`${value}`, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function buildDefaultCandidatePath(sceneId) {
  const safeScene = normalizeText(sceneId).replace(/[^\w.-]+/g, '_') || 'scene';
  return path.join(DEFAULT_ITERATION_DIR, `${safeScene}.candidate.json`);
}

function buildDefaultScorePath(sceneId) {
  const safeScene = normalizeText(sceneId).replace(/[^\w.-]+/g, '_') || 'scene';
  return path.join(DEFAULT_ITERATION_DIR, `${safeScene}.score.json`);
}

function buildDefaultTemplatePath(sceneId) {
  const safeScene = normalizeText(sceneId).replace(/[^\w.-]+/g, '_') || 'scene';
  return path.join(DEFAULT_ITERATION_DIR, `${safeScene}.template.json`);
}

function buildDefaultExportDir(templateId) {
  const safeId = normalizeText(templateId).replace(/[^\w.-]+/g, '_') || 'capability';
  return path.join(DEFAULT_EXPORT_ROOT, `capability-${safeId}`);
}

function buildSceneIdFromCandidate(candidate) {
  return normalizeText(candidate && candidate.scene_id) || 'scene.unknown';
}

async function loadSceneIndexFromFile(projectPath, fileSystem) {
  const indexPath = path.join(projectPath, '.sce', 'spec-governance', 'scene-index.json');
  if (!await fileSystem.pathExists(indexPath)) {
    return null;
  }
  try {
    const data = await fileSystem.readJson(indexPath);
    return {
      source: indexPath,
      data
    };
  } catch (_error) {
    return null;
  }
}

async function loadSceneIndexFromState(projectPath, fileSystem, env) {
  try {
    const stateStore = new SceStateStore(projectPath, {
      fileSystem,
      env
    });
    const records = await stateStore.listGovernanceSceneIndexRecords({ limit: 500 });
    if (!Array.isArray(records)) {
      return null;
    }
    const scenes = {};
    for (const record of records) {
      if (!record || !record.scene_id) {
        continue;
      }
      scenes[record.scene_id] = {
        total_specs: record.total_specs,
        active_specs: record.active_specs,
        completed_specs: record.completed_specs,
        stale_specs: record.stale_specs,
        spec_ids: Array.isArray(record.spec_ids) ? record.spec_ids : [],
        active_spec_ids: Array.isArray(record.active_spec_ids) ? record.active_spec_ids : [],
        stale_spec_ids: Array.isArray(record.stale_spec_ids) ? record.stale_spec_ids : []
      };
    }
    return {
      source: 'sqlite:governance_scene_index_registry',
      data: {
        schema_version: '1.0',
        generated_at: new Date().toISOString(),
        scene_filter: null,
        scenes
      }
    };
  } catch (_error) {
    return null;
  }
}

async function resolveSceneSpecs(sceneId, options, dependencies) {
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const env = dependencies.env || process.env;

  const explicitSpecs = normalizeStringArray(options && options.specs);
  if (explicitSpecs.length > 0) {
    return {
      scene_id: sceneId,
      spec_ids: explicitSpecs,
      source: 'options.specs'
    };
  }

  const indexFile = await loadSceneIndexFromFile(projectPath, fileSystem);
  if (indexFile && indexFile.data && indexFile.data.scenes && indexFile.data.scenes[sceneId]) {
    const record = indexFile.data.scenes[sceneId];
    return {
      scene_id: sceneId,
      spec_ids: Array.isArray(record.spec_ids) ? record.spec_ids : [],
      source: indexFile.source
    };
  }

  const indexState = await loadSceneIndexFromState(projectPath, fileSystem, env);
  if (indexState && indexState.data && indexState.data.scenes && indexState.data.scenes[sceneId]) {
    const record = indexState.data.scenes[sceneId];
    return {
      scene_id: sceneId,
      spec_ids: Array.isArray(record.spec_ids) ? record.spec_ids : [],
      source: indexState.source
    };
  }

  const governanceReport = await runStudioSpecGovernance({
    apply: false,
    scene: sceneId
  }, {
    projectPath,
    fileSystem
  });
  if (governanceReport && Array.isArray(governanceReport.scenes)) {
    const target = governanceReport.scenes.find((scene) => normalizeText(scene.scene_id) === sceneId);
    if (target) {
      return {
        scene_id: sceneId,
        spec_ids: Array.isArray(target.specs)
          ? target.specs.map((item) => normalizeText(item.spec_id)).filter(Boolean)
          : [],
        source: 'studio-spec-governance'
      };
    }
  }

  return {
    scene_id: sceneId,
    spec_ids: [],
    source: 'unknown'
  };
}

function summarizeTasks(tasks) {
  const summary = {
    total: 0,
    completed: 0,
    in_progress: 0,
    queued: 0,
    not_started: 0,
    unknown: 0
  };

  if (!Array.isArray(tasks)) {
    return summary;
  }

  summary.total = tasks.length;
  tasks.forEach((task) => {
    const status = normalizeText(task && task.status);
    if (status === 'completed') {
      summary.completed += 1;
    } else if (status === 'in-progress') {
      summary.in_progress += 1;
    } else if (status === 'queued') {
      summary.queued += 1;
    } else if (status === 'not-started') {
      summary.not_started += 1;
    } else {
      summary.unknown += 1;
    }
  });

  return summary;
}

function buildCandidateSummary(specs) {
  const summary = {
    spec_count: specs.length,
    task_total: 0,
    task_completed: 0,
    task_pending: 0
  };
  specs.forEach((spec) => {
    const taskSummary = spec.task_summary || {};
    summary.task_total += Number(taskSummary.total || 0);
    summary.task_completed += Number(taskSummary.completed || 0);
  });
  summary.task_pending = Math.max(0, summary.task_total - summary.task_completed);
  return summary;
}

function buildScoreFromCandidate(candidate) {
  const summary = candidate && candidate.summary ? candidate.summary : {};
  const taskTotal = Number(summary.task_total || 0);
  const taskCompleted = Number(summary.task_completed || 0);
  const specCount = Number(summary.spec_count || 0);
  const completionRate = taskTotal > 0 ? taskCompleted / taskTotal : 0;
  const reuseScore = Math.min(100, Math.round((specCount / 3) * 100));
  const stabilityScore = Math.round(completionRate * 100);
  const riskScore = Math.min(100, Math.round((1 - completionRate) * 100));
  const valueScore = Math.round((stabilityScore * 0.5) + (reuseScore * 0.3) + ((100 - riskScore) * 0.2));

  return {
    completion_rate: Number(completionRate.toFixed(3)),
    reuse_score: reuseScore,
    stability_score: stabilityScore,
    risk_score: riskScore,
    value_score: valueScore
  };
}

function buildTemplateCandidate(candidate, mapping, options) {
  const sceneId = buildSceneIdFromCandidate(candidate);
  const templateId = normalizeText(options && options.template_id)
    || normalizeText(options && options.id)
    || sceneId.replace(/[^\w.-]+/g, '_');
  const name = normalizeText(options && options.name)
    || `Capability template: ${sceneId}`;
  const description = normalizeText(options && options.description)
    || `Capability template derived from ${sceneId}`;
  const category = normalizeText(options && options.category) || 'capability';
  const tags = normalizeStringArray(options && options.tags);
  const ontologyScope = (mapping && mapping.ontology_scope && typeof mapping.ontology_scope === 'object')
    ? mapping.ontology_scope
    : {
        domains: [],
        entities: [],
        relations: [],
        business_rules: [],
        decisions: []
      };

  return {
    mode: 'capability-template',
    template_id: templateId,
    name,
    description,
    category,
    template_type: 'capability-template',
    scene_id: sceneId,
    source_candidate: candidate,
    ontology_scope: ontologyScope,
    tags,
    created_at: new Date().toISOString()
  };
}

function buildRegistryEntry(templateCandidate, options) {
  const riskLevel = normalizeText(options && options.risk_level) || 'medium';
  const difficulty = normalizeText(options && options.difficulty) || 'intermediate';
  const applicable = normalizeStringArray(options && options.applicable_scenarios);
  const tags = normalizeStringArray(options && options.tags);
  const sceneId = buildSceneIdFromCandidate(templateCandidate);
  const safeTags = tags.length > 0 ? tags : ['capability', sceneId];
  const safeApplicable = applicable.length > 0 ? applicable : [sceneId];

  return {
    id: templateCandidate.template_id,
    name: templateCandidate.name,
    category: templateCandidate.category,
    description: templateCandidate.description,
    difficulty,
    tags: safeTags,
    applicable_scenarios: safeApplicable,
    files: ['capability-template.json'],
    template_type: 'capability-template',
    min_sce_version: packageJson.version,
    max_sce_version: null,
    risk_level: riskLevel,
    rollback_contract: {
      supported: false,
      strategy: 'n/a'
    },
    ontology_scope: templateCandidate.ontology_scope
  };
}

async function runCapabilityExtractCommand(options = {}, dependencies = {}) {
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const env = dependencies.env || process.env;
  const sceneId = normalizeText(options.scene || options.sceneId || options.scene_id);
  const writeOutput = normalizeBoolean(options.write, true);

  if (!sceneId) {
    throw new Error('scene is required for capability extract');
  }

  const specResolution = await resolveSceneSpecs(sceneId, {
    specs: options.specs
  }, { projectPath, fileSystem, env });
  const specIds = Array.isArray(specResolution.spec_ids) ? specResolution.spec_ids : [];

  const taskClaimer = new TaskClaimer();
  const specs = [];

  for (const specId of specIds) {
    const tasksPath = path.join(projectPath, '.sce', 'specs', specId, 'tasks.md');
    let tasks = [];
    let taskError = null;
    if (await fileSystem.pathExists(tasksPath)) {
      try {
        tasks = await taskClaimer.parseTasks(tasksPath, { preferStatusMarkers: true });
      } catch (error) {
        taskError = error.message;
      }
    } else {
      taskError = 'tasks.md missing';
    }
    const taskSummary = summarizeTasks(tasks);
    specs.push({
      spec_id: specId,
      tasks_path: path.relative(projectPath, tasksPath),
      task_summary: taskSummary,
      task_sample: tasks.slice(0, toPositiveInteger(options.sample_limit, 5)).map((task) => ({
        id: task.taskId,
        title: task.title,
        status: task.status
      })),
      task_error: taskError
    });
  }

  const payload = {
    mode: 'capability-extract',
    scene_id: sceneId,
    generated_at: new Date().toISOString(),
    source: {
      scene_index_source: specResolution.source || 'unknown',
      spec_count: specIds.length
    },
    specs,
    summary: buildCandidateSummary(specs)
  };

  const outputPath = normalizeText(options.out) || buildDefaultCandidatePath(sceneId);
  if (writeOutput) {
    await fileSystem.ensureDir(path.dirname(path.join(projectPath, outputPath)));
    await fileSystem.writeJson(path.join(projectPath, outputPath), payload, { spaces: 2 });
    payload.output_file = outputPath;
  }

  if (!normalizeBoolean(options.json, false)) {
    console.log(chalk.green('✅ Capability candidate extracted'));
    console.log(chalk.gray(`  Scene: ${sceneId}`));
    console.log(chalk.gray(`  Specs: ${payload.summary.spec_count}`));
    console.log(chalk.gray(`  Tasks: ${payload.summary.task_total}`));
    if (payload.output_file) {
      console.log(chalk.gray(`  Output: ${payload.output_file}`));
    }
  }

  return payload;
}

async function runCapabilityScoreCommand(options = {}, dependencies = {}) {
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const inputPath = normalizeText(options.input || options.file);
  if (!inputPath) {
    throw new Error('input candidate file is required for capability score');
  }

  const candidate = await fileSystem.readJson(path.join(projectPath, inputPath));
  const sceneId = buildSceneIdFromCandidate(candidate);
  const scores = buildScoreFromCandidate(candidate);
  const payload = {
    mode: 'capability-score',
    scene_id: sceneId,
    generated_at: new Date().toISOString(),
    input: inputPath,
    scores,
    summary: candidate && candidate.summary ? candidate.summary : null
  };

  const outputPath = normalizeText(options.out) || buildDefaultScorePath(sceneId);
  if (normalizeBoolean(options.write, true)) {
    await fileSystem.ensureDir(path.dirname(path.join(projectPath, outputPath)));
    await fileSystem.writeJson(path.join(projectPath, outputPath), payload, { spaces: 2 });
    payload.output_file = outputPath;
  }

  if (!normalizeBoolean(options.json, false)) {
    console.log(chalk.green('✅ Capability score generated'));
    console.log(chalk.gray(`  Scene: ${sceneId}`));
    console.log(chalk.gray(`  Value score: ${scores.value_score}`));
    if (payload.output_file) {
      console.log(chalk.gray(`  Output: ${payload.output_file}`));
    }
  }

  return payload;
}

async function runCapabilityMapCommand(options = {}, dependencies = {}) {
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const inputPath = normalizeText(options.input || options.file);
  if (!inputPath) {
    throw new Error('input candidate file is required for capability map');
  }

  const mappingPath = normalizeText(options.mapping);
  const candidate = await fileSystem.readJson(path.join(projectPath, inputPath));
  const mapping = mappingPath
    ? await fileSystem.readJson(path.join(projectPath, mappingPath))
    : { ontology_scope: { domains: [], entities: [], relations: [], business_rules: [], decisions: [] } };

  const templateCandidate = buildTemplateCandidate(candidate, mapping, options);
  const sceneId = buildSceneIdFromCandidate(candidate);
  const payload = {
    mode: 'capability-map',
    scene_id: sceneId,
    generated_at: new Date().toISOString(),
    input: inputPath,
    mapping: mappingPath || null,
    template: templateCandidate
  };

  const outputPath = normalizeText(options.out) || buildDefaultTemplatePath(sceneId);
  if (normalizeBoolean(options.write, true)) {
    await fileSystem.ensureDir(path.dirname(path.join(projectPath, outputPath)));
    await fileSystem.writeJson(path.join(projectPath, outputPath), payload, { spaces: 2 });
    payload.output_file = outputPath;
  }

  if (!normalizeBoolean(options.json, false)) {
    console.log(chalk.green('✅ Capability ontology mapping prepared'));
    console.log(chalk.gray(`  Scene: ${sceneId}`));
    if (payload.output_file) {
      console.log(chalk.gray(`  Output: ${payload.output_file}`));
    }
  }

  return payload;
}

async function runCapabilityRegisterCommand(options = {}, dependencies = {}) {
  const projectPath = dependencies.projectPath || process.cwd();
  const fileSystem = dependencies.fileSystem || fs;
  const inputPath = normalizeText(options.input || options.file);
  if (!inputPath) {
    throw new Error('input template file is required for capability register');
  }

  const payload = await fileSystem.readJson(path.join(projectPath, inputPath));
  const templateCandidate = payload.template || payload;
  if (!templateCandidate || !templateCandidate.template_id) {
    throw new Error('template_id missing in capability template candidate');
  }

  const exportDir = normalizeText(options.out) || buildDefaultExportDir(templateCandidate.template_id);
  const outputDirAbs = path.join(projectPath, exportDir);
  await fileSystem.ensureDir(outputDirAbs);

  const registryEntry = buildRegistryEntry(templateCandidate, options);
  const registryPayload = {
    version: '1.0',
    templates: [registryEntry]
  };

  await fileSystem.writeJson(path.join(outputDirAbs, 'capability-template.json'), templateCandidate, { spaces: 2 });
  await fileSystem.writeJson(path.join(outputDirAbs, 'template-registry.json'), registryPayload, { spaces: 2 });

  const result = {
    mode: 'capability-register',
    template_id: templateCandidate.template_id,
    output_dir: exportDir,
    files: [
      path.join(exportDir, 'capability-template.json'),
      path.join(exportDir, 'template-registry.json')
    ]
  };

  if (!normalizeBoolean(options.json, false)) {
    console.log(chalk.green('✅ Capability template package exported'));
    console.log(chalk.gray(`  Template: ${templateCandidate.template_id}`));
    console.log(chalk.gray(`  Output: ${exportDir}`));
  }

  return result;
}

function registerCapabilityCommands(program) {
  const capabilityCmd = program
    .command('capability')
    .description('Extract and manage capability templates from scene/spec/task history');

  capabilityCmd
    .command('extract')
    .description('Extract capability candidate from a scene')
    .requiredOption('--scene <scene-id>', 'Scene identifier')
    .option('--specs <spec-ids>', 'Comma-separated spec identifiers')
    .option('--out <path>', 'Output JSON path')
    .option('--sample-limit <n>', 'Max tasks per spec in sample', '5')
    .option('--no-write', 'Skip writing output file')
    .option('--json', 'Output JSON to stdout')
    .action(async (options) => {
      const specs = normalizeText(options.specs)
        ? normalizeText(options.specs).split(',').map((item) => normalizeText(item)).filter(Boolean)
        : [];
      await runCapabilityExtractCommand({
        scene: options.scene,
        specs,
        out: options.out,
        sample_limit: options.sampleLimit,
        write: options.write,
        json: options.json
      });
    });

  capabilityCmd
    .command('score')
    .description('Score a capability candidate')
    .requiredOption('--input <path>', 'Input candidate JSON')
    .option('--out <path>', 'Output JSON path')
    .option('--no-write', 'Skip writing output file')
    .option('--json', 'Output JSON to stdout')
    .action(async (options) => {
      await runCapabilityScoreCommand(options);
    });

  capabilityCmd
    .command('map')
    .description('Attach ontology mapping to a capability candidate')
    .requiredOption('--input <path>', 'Input candidate JSON')
    .option('--mapping <path>', 'Ontology mapping JSON')
    .option('--template-id <id>', 'Template identifier')
    .option('--name <name>', 'Template name')
    .option('--description <desc>', 'Template description')
    .option('--category <category>', 'Template category')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--out <path>', 'Output JSON path')
    .option('--no-write', 'Skip writing output file')
    .option('--json', 'Output JSON to stdout')
    .action(async (options) => {
      const tags = normalizeText(options.tags)
        ? normalizeText(options.tags).split(',').map((item) => normalizeText(item)).filter(Boolean)
        : [];
      await runCapabilityMapCommand({
        ...options,
        tags
      });
    });

  capabilityCmd
    .command('register')
    .description('Export a registry-ready capability template package')
    .requiredOption('--input <path>', 'Input template JSON (output of capability map)')
    .option('--out <path>', 'Output directory')
    .option('--difficulty <level>', 'Difficulty (beginner|intermediate|advanced)')
    .option('--risk-level <level>', 'Risk level (low|medium|high|critical)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--applicable-scenarios <scenes>', 'Comma-separated applicable scenarios')
    .option('--json', 'Output JSON to stdout')
    .action(async (options) => {
      const tags = normalizeText(options.tags)
        ? normalizeText(options.tags).split(',').map((item) => normalizeText(item)).filter(Boolean)
        : [];
      const applicable = normalizeText(options.applicableScenarios)
        ? normalizeText(options.applicableScenarios).split(',').map((item) => normalizeText(item)).filter(Boolean)
        : [];
      await runCapabilityRegisterCommand({
        ...options,
        risk_level: options.riskLevel,
        applicable_scenarios: applicable,
        tags
      });
    });
}

module.exports = {
  registerCapabilityCommands,
  runCapabilityExtractCommand,
  runCapabilityScoreCommand,
  runCapabilityMapCommand,
  runCapabilityRegisterCommand
};
