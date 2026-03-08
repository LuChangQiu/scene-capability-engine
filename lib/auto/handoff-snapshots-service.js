async function buildAutoHandoffMoquiBaselineSnapshot(projectPath, dependencies = {}) {
  const { fs, path, spawnSync, toAutoHandoffCliPath, buildAutoHandoffMoquiCoverageRegressions, AUTO_HANDOFF_MOQUI_BASELINE_JSON_FILE, AUTO_HANDOFF_MOQUI_BASELINE_MARKDOWN_FILE } = dependencies;
  const scriptPath = path.join(projectPath, 'scripts', 'moqui-template-baseline-report.js');
  if (!(await fs.pathExists(scriptPath))) {
    return {
      status: 'skipped',
      generated: false,
      reason: `baseline script missing: ${toAutoHandoffCliPath(projectPath, scriptPath)}`
    };
  }

  const outputJsonPath = path.join(projectPath, AUTO_HANDOFF_MOQUI_BASELINE_JSON_FILE);
  const outputMarkdownPath = path.join(projectPath, AUTO_HANDOFF_MOQUI_BASELINE_MARKDOWN_FILE);
  await fs.ensureDir(path.dirname(outputJsonPath));

  const scriptArgs = [
    scriptPath,
    '--out', outputJsonPath,
    '--markdown-out', outputMarkdownPath,
    '--json'
  ];

  if (await fs.pathExists(outputJsonPath)) {
    scriptArgs.push('--compare-with', outputJsonPath);
  }

  const execution = spawnSync(process.execPath, scriptArgs, {
    cwd: projectPath,
    encoding: 'utf8'
  });

  const stdout = typeof execution.stdout === 'string' ? execution.stdout.trim() : '';
  const stderr = typeof execution.stderr === 'string' ? execution.stderr.trim() : '';

  if (execution.error) {
    return {
      status: 'error',
      generated: false,
      error: execution.error.message
    };
  }

  if (execution.status !== 0) {
    return {
      status: 'error',
      generated: false,
      error: stderr || stdout || `baseline script exited with code ${execution.status}`
    };
  }

  let reportPayload = null;
  try {
    reportPayload = stdout ? JSON.parse(stdout) : await fs.readJson(outputJsonPath);
  } catch (error) {
    return {
      status: 'error',
      generated: false,
      error: `failed to parse baseline payload: ${error.message}`
    };
  }

  const summary = reportPayload && reportPayload.summary && typeof reportPayload.summary === 'object'
    ? reportPayload.summary
    : {};
  const compare = reportPayload && reportPayload.compare && typeof reportPayload.compare === 'object'
    ? reportPayload.compare
    : null;
  const failedTemplates = compare && compare.failed_templates && typeof compare.failed_templates === 'object'
    ? compare.failed_templates
    : {};
  const scopeBreakdown = summary && summary.scope_breakdown && typeof summary.scope_breakdown === 'object'
    ? summary.scope_breakdown
    : {};
  const coverageMatrix = summary && summary.coverage_matrix && typeof summary.coverage_matrix === 'object'
    ? summary.coverage_matrix
    : {};
  const gapFrequency = summary && Array.isArray(summary.gap_frequency)
    ? summary.gap_frequency
    : [];

  return {
    status: summary.portfolio_passed === true ? 'passed' : 'failed',
    generated: true,
    summary: {
      total_templates: Number(summary.total_templates) || 0,
      scoped_templates: Number(summary.scoped_templates) || 0,
      avg_score: Number.isFinite(Number(summary.avg_score)) ? Number(summary.avg_score) : null,
      valid_rate_percent: Number.isFinite(Number(summary.valid_rate_percent)) ? Number(summary.valid_rate_percent) : null,
      baseline_passed: Number(summary.baseline_passed) || 0,
      baseline_failed: Number(summary.baseline_failed) || 0,
      portfolio_passed: summary.portfolio_passed === true,
      scope_breakdown: {
        moqui_erp: Number(scopeBreakdown.moqui_erp) || 0,
        scene_orchestration: Number(scopeBreakdown.scene_orchestration) || 0,
        other: Number(scopeBreakdown.other) || 0
      },
      coverage_matrix: coverageMatrix,
      gap_frequency: gapFrequency
    },
    compare: compare
      ? {
        previous_generated_at: compare.previous_generated_at || null,
        previous_template_root: compare.previous_template_root || null,
        deltas: compare.deltas || null,
        coverage_matrix_deltas: compare.coverage_matrix_deltas || null,
        coverage_matrix_regressions: buildAutoHandoffMoquiCoverageRegressions(compare),
        failed_templates: {
          previous: Array.isArray(failedTemplates.previous) ? failedTemplates.previous : [],
          current: Array.isArray(failedTemplates.current) ? failedTemplates.current : [],
          newly_failed: Array.isArray(failedTemplates.newly_failed) ? failedTemplates.newly_failed : [],
          recovered: Array.isArray(failedTemplates.recovered) ? failedTemplates.recovered : []
        }
      }
      : null,
    output: {
      json: toAutoHandoffCliPath(projectPath, outputJsonPath),
      markdown: toAutoHandoffCliPath(projectPath, outputMarkdownPath)
    },
    warnings: stderr ? [stderr] : []
  };
}

async function buildAutoHandoffScenePackageBatchSnapshot(projectPath, manifestPath, dependencies = {}) {
  const { fs, path, spawnSync, normalizeHandoffText, toAutoHandoffCliPath, parseAutoHandoffJsonFromCommandStdout, AUTO_HANDOFF_CLI_SCRIPT_FILE, AUTO_HANDOFF_SCENE_PACKAGE_BATCH_JSON_FILE, AUTO_HANDOFF_SCENE_PACKAGE_BATCH_TASK_QUEUE_FILE } = dependencies;
  const manifestFile = normalizeHandoffText(manifestPath);
  if (!manifestFile) {
    return {
      status: 'skipped',
      generated: false,
      reason: 'manifest path unavailable for scene package batch gate'
    };
  }
  if (!(await fs.pathExists(AUTO_HANDOFF_CLI_SCRIPT_FILE))) {
    return {
      status: 'skipped',
      generated: false,
      reason: `sce cli script missing: ${toAutoHandoffCliPath(projectPath, AUTO_HANDOFF_CLI_SCRIPT_FILE)}`
    };
  }

  const outputJsonPath = path.join(projectPath, AUTO_HANDOFF_SCENE_PACKAGE_BATCH_JSON_FILE);
  const taskQueuePath = path.join(projectPath, AUTO_HANDOFF_SCENE_PACKAGE_BATCH_TASK_QUEUE_FILE);
  await fs.ensureDir(path.dirname(outputJsonPath));

  const execution = spawnSync(
    process.execPath,
    [
      AUTO_HANDOFF_CLI_SCRIPT_FILE,
      'scene',
      'package-publish-batch',
      '--manifest', manifestFile,
      '--dry-run',
      '--ontology-report-out', outputJsonPath,
      '--ontology-task-queue-out', taskQueuePath,
      '--json'
    ],
    {
      cwd: projectPath,
      encoding: 'utf8'
    }
  );

  const stdout = typeof execution.stdout === 'string' ? execution.stdout.trim() : '';
  const stderr = typeof execution.stderr === 'string' ? execution.stderr.trim() : '';

  if (execution.error) {
    return {
      status: 'error',
      generated: false,
      error: execution.error.message
    };
  }

  const payload = parseAutoHandoffJsonFromCommandStdout(stdout);
  if (!payload || typeof payload !== 'object') {
    const missingSpecArray = /manifest spec array (not found|is empty)/i.test(stderr);
    if (missingSpecArray) {
      return {
        status: 'skipped',
        generated: false,
        reason: 'manifest specs are not scene package batch compatible',
        warnings: stderr ? [stderr] : []
      };
    }
    return {
      status: 'error',
      generated: false,
      error: stderr || stdout || `scene package publish-batch exited with code ${execution.status}`,
      warnings: stderr ? [stderr] : []
    };
  }

  const summary = payload.summary && typeof payload.summary === 'object'
    ? payload.summary
    : {};
  const ontologySummary = payload.ontology_summary && typeof payload.ontology_summary === 'object'
    ? payload.ontology_summary
    : {};
  const batchGate = payload.batch_ontology_gate && typeof payload.batch_ontology_gate === 'object'
    ? payload.batch_ontology_gate
    : {};
  const batchGateFailures = Array.isArray(batchGate.failures) ? batchGate.failures : [];
  const selected = Number(summary.selected) || 0;
  const failed = Number(summary.failed) || 0;

  if (selected <= 0 && failed <= 0) {
    return {
      status: 'skipped',
      generated: false,
      reason: 'no scene package publish candidates were selected from handoff manifest',
      summary: {
        selected,
        published: Number(summary.published) || 0,
        planned: Number(summary.planned) || 0,
        failed,
        skipped: Number(summary.skipped) || 0,
        batch_gate_passed: batchGate.passed === true,
        batch_gate_failure_count: batchGateFailures.length
      },
      output: {
        json: toAutoHandoffCliPath(projectPath, outputJsonPath)
      },
      warnings: stderr ? [stderr] : []
    };
  }

  return {
    status: payload.success === true ? 'passed' : 'failed',
    generated: true,
    mode: payload.mode || 'dry-run',
    success: payload.success === true,
    manifest: normalizeHandoffText(payload.manifest),
    summary: {
      selected,
      published: Number(summary.published) || 0,
      planned: Number(summary.planned) || 0,
      failed,
      skipped: Number(summary.skipped) || 0,
      batch_gate_passed: batchGate.passed === true,
      batch_gate_failure_count: batchGateFailures.length,
      ontology_average_score: Number.isFinite(Number(ontologySummary.average_score))
        ? Number(ontologySummary.average_score)
        : null,
      ontology_valid_rate_percent: Number.isFinite(Number(ontologySummary.valid_rate_percent))
        ? Number(ontologySummary.valid_rate_percent)
        : null
    },
    failures: Array.isArray(payload.failures)
      ? payload.failures.map(item => ({
        spec: normalizeHandoffText(item && item.spec),
        error: normalizeHandoffText(item && item.error)
      }))
      : [],
    batch_ontology_gate: {
      passed: batchGate.passed === true,
      failures: batchGateFailures.map(item => ({
        id: normalizeHandoffText(item && item.id),
        message: normalizeHandoffText(item && item.message)
      }))
    },
    task_queue: payload.ontology_task_queue && typeof payload.ontology_task_queue === 'object'
      ? {
        output_path: normalizeHandoffText(payload.ontology_task_queue.output_path),
        task_count: Number(payload.ontology_task_queue.task_count) || 0
      }
      : null,
    output: {
      json: toAutoHandoffCliPath(projectPath, outputJsonPath)
    },
    warnings: stderr ? [stderr] : []
  };
}

async function buildAutoHandoffCapabilityCoverageSnapshot(projectPath, handoff = null, policy = {}, dependencies = {}) {
  const { fs, path, normalizeHandoffText, toAutoHandoffCliPath, resolveMoquiCapabilityDescriptor, MOQUI_CAPABILITY_LEXICON_INDEX, moquiCapabilityMatch, AUTO_HANDOFF_MOQUI_CAPABILITY_COVERAGE_JSON_FILE, AUTO_HANDOFF_MOQUI_CAPABILITY_COVERAGE_MARKDOWN_FILE, renderMoquiCapabilityCoverageMarkdown } = dependencies;
  const loadLatestMoquiCapabilityCoverageReport = dependencies.loadLatestMoquiCapabilityCoverageReport || (async () => null);
  const buildCapabilityCoverageComparison = dependencies.buildCapabilityCoverageComparison || (() => null);
  const expectedRaw = Array.isArray(handoff && handoff.capabilities)
    ? handoff.capabilities
    : [];
  const normalization = {
    lexicon_version: MOQUI_CAPABILITY_LEXICON_INDEX && MOQUI_CAPABILITY_LEXICON_INDEX.version
      ? MOQUI_CAPABILITY_LEXICON_INDEX.version
      : null,
    expected_alias_mapped: [],
    expected_deprecated_aliases: [],
    expected_unknown: [],
    provided_alias_mapped: [],
    provided_deprecated_aliases: [],
    provided_unknown: []
  };
  const warnings = [];
  const minRequiredPercentPolicy = Number(policy.min_capability_coverage_percent);
  const minRequiredPercentValue = Number.isFinite(minRequiredPercentPolicy)
    ? Number(minRequiredPercentPolicy.toFixed(2))
    : 100;
  const minSemanticRequiredPolicy = Number(policy.min_capability_semantic_percent);
  const minSemanticRequiredValue = Number.isFinite(minSemanticRequiredPolicy)
    ? Number(minSemanticRequiredPolicy.toFixed(2))
    : 100;
  const addNormalizationRecord = (target, descriptor) => {
    const list = Array.isArray(normalization[target]) ? normalization[target] : [];
    const item = {
      raw: descriptor.raw,
      normalized: descriptor.normalized,
      canonical: descriptor.canonical
    };
    const key = `${item.raw}|${item.normalized}|${item.canonical}`;
    if (!list.some(existing => `${existing.raw}|${existing.normalized}|${existing.canonical}` === key)) {
      list.push(item);
    }
    normalization[target] = list;
  };
  const expectedMap = new Map();
  for (const rawCapability of expectedRaw) {
    const descriptor = resolveMoquiCapabilityDescriptor(rawCapability, MOQUI_CAPABILITY_LEXICON_INDEX);
    if (!descriptor) {
      continue;
    }
    if (descriptor.is_alias) {
      addNormalizationRecord('expected_alias_mapped', descriptor);
    }
    if (descriptor.is_deprecated_alias) {
      addNormalizationRecord('expected_deprecated_aliases', descriptor);
      warnings.push(
        `manifest capability "${descriptor.raw}" is deprecated; use "${descriptor.deprecated_replacement || descriptor.canonical}" instead`
      );
    }
    if (!descriptor.is_known) {
      addNormalizationRecord('expected_unknown', descriptor);
      warnings.push(`manifest capability "${descriptor.raw}" is unknown to Moqui lexicon`);
    }
    if (!expectedMap.has(descriptor.canonical)) {
      expectedMap.set(descriptor.canonical, {
        capability: descriptor.canonical,
        source_values: [descriptor.normalized]
      });
    } else {
      const existing = expectedMap.get(descriptor.canonical);
      if (!existing.source_values.includes(descriptor.normalized)) {
        existing.source_values.push(descriptor.normalized);
      }
    }
  }
  const expected = Array.from(expectedMap.keys());
  if (expected.length === 0) {
    return {
      status: 'skipped',
      generated: false,
      reason: 'manifest capabilities not declared',
      summary: {
        total_capabilities: 0,
        covered_capabilities: 0,
        uncovered_capabilities: 0,
        coverage_percent: null,
        min_required_percent: minRequiredPercentValue,
        semantic_complete_capabilities: 0,
        semantic_incomplete_capabilities: 0,
        semantic_complete_percent: null,
        min_semantic_required_percent: minSemanticRequiredValue,
        semantic_passed: true,
        passed: true
      },
      coverage: [],
      gaps: [],
      normalization,
      warnings
    };
  }

  const templateRoot = path.join(projectPath, '.sce', 'templates', 'scene-packages');
  if (!(await fs.pathExists(templateRoot))) {
    return {
      status: 'skipped',
      generated: false,
      reason: `template library not found: ${toAutoHandoffCliPath(projectPath, templateRoot)}`,
      summary: {
        total_capabilities: expected.length,
        covered_capabilities: 0,
        uncovered_capabilities: expected.length,
        coverage_percent: 0,
        min_required_percent: minRequiredPercentValue,
        semantic_complete_capabilities: 0,
        semantic_incomplete_capabilities: expected.length,
        semantic_complete_percent: 0,
        min_semantic_required_percent: minSemanticRequiredValue,
        semantic_passed: false,
        passed: false
      },
      coverage: expected.map(item => ({
        capability: item,
        covered: false,
        matched_templates: [],
        matched_provides: [],
        matched_template_semantics: [],
        semantic_complete: false,
        semantic_missing_dimensions: [
          'ontology.entities',
          'ontology.relations',
          'governance.business_rules',
          'governance.decision_logic'
        ],
        source_values: expectedMap.get(item).source_values
      })),
      gaps: expected,
      normalization,
      warnings
    };
  }

  const templateEntries = await fs.readdir(templateRoot);
  const templates = [];
  for (const entry of templateEntries) {
    const templateDir = path.join(templateRoot, entry);
    let stat = null;
    try {
      stat = await fs.stat(templateDir);
    } catch (_error) {
      stat = null;
    }
    if (!stat || !stat.isDirectory()) {
      continue;
    }
    const contractFile = path.join(templateDir, 'scene-package.json');
    if (!(await fs.pathExists(contractFile))) {
      continue;
    }
    try {
      const payload = await fs.readJson(contractFile);
      const providesRaw = [];
      const contractProvides = payload && payload.contract && payload.contract.capabilities && payload.contract.capabilities.provides;
      const rootProvides = payload && payload.capabilities && payload.capabilities.provides;
      if (Array.isArray(contractProvides)) {
        providesRaw.push(...contractProvides);
      }
      if (Array.isArray(rootProvides)) {
        providesRaw.push(...rootProvides);
      }
      const provides = [];
      for (const providedCapability of providesRaw) {
        const descriptor = resolveMoquiCapabilityDescriptor(providedCapability, MOQUI_CAPABILITY_LEXICON_INDEX);
        if (!descriptor) {
          continue;
        }
        if (descriptor.is_alias) {
          addNormalizationRecord('provided_alias_mapped', descriptor);
        }
        if (descriptor.is_deprecated_alias) {
          addNormalizationRecord('provided_deprecated_aliases', descriptor);
          warnings.push(
            `template "${entry}" uses deprecated capability "${descriptor.raw}" (canonical "${descriptor.deprecated_replacement || descriptor.canonical}")`
          );
        }
        if (!descriptor.is_known) {
          addNormalizationRecord('provided_unknown', descriptor);
        }
        provides.push(descriptor.canonical);
      }
      const governanceContract = payload && payload.governance_contract && typeof payload.governance_contract === 'object'
        ? payload.governance_contract
        : {};
      const ontologyModel = payload && payload.ontology_model && typeof payload.ontology_model === 'object'
        ? payload.ontology_model
        : {};
      const businessRules = Array.isArray(governanceContract.business_rules)
        ? governanceContract.business_rules
        : [];
      const decisionLogic = Array.isArray(governanceContract.decision_logic)
        ? governanceContract.decision_logic
        : [];
      const ontologyEntities = Array.isArray(ontologyModel.entities)
        ? ontologyModel.entities
        : [];
      const ontologyRelations = Array.isArray(ontologyModel.relations)
        ? ontologyModel.relations
        : [];
      const semanticMissingDimensions = [];
      if (ontologyEntities.length <= 0) {
        semanticMissingDimensions.push('ontology.entities');
      }
      if (ontologyRelations.length <= 0) {
        semanticMissingDimensions.push('ontology.relations');
      }
      if (businessRules.length <= 0) {
        semanticMissingDimensions.push('governance.business_rules');
      }
      if (decisionLogic.length <= 0) {
        semanticMissingDimensions.push('governance.decision_logic');
      }
      const uniqueProvides = Array.from(new Set(provides));
      if (uniqueProvides.length > 0 && semanticMissingDimensions.length > 0) {
        warnings.push(
          `template "${entry}" semantic coverage missing: ${semanticMissingDimensions.join(', ')}`
        );
      }
      templates.push({
        template_id: entry,
        provides: uniqueProvides,
        semantic: {
          ontology_entities_count: ontologyEntities.length,
          ontology_relations_count: ontologyRelations.length,
          business_rules_count: businessRules.length,
          decision_logic_count: decisionLogic.length,
          missing_dimensions: semanticMissingDimensions,
          complete: semanticMissingDimensions.length === 0
        }
      });
    } catch (_error) {
      // Ignore malformed template package entries.
    }
  }

  const coverage = expected.map(capability => {
    const matchedTemplates = [];
    const matchedProvides = [];
    const matchedTemplateSemantics = [];
    let hasOntologyEntities = false;
    let hasOntologyRelations = false;
    let hasBusinessRules = false;
    let hasDecisionLogic = false;
    for (const template of templates) {
      const providedMatched = template.provides.filter(item => moquiCapabilityMatch(capability, item));
      if (providedMatched.length > 0) {
        matchedTemplates.push(template.template_id);
        matchedProvides.push(...providedMatched);
        const semantic = template.semantic && typeof template.semantic === 'object'
          ? template.semantic
          : {};
        const templateSemantic = {
          template_id: template.template_id,
          ontology_entities_count: Number(semantic.ontology_entities_count) || 0,
          ontology_relations_count: Number(semantic.ontology_relations_count) || 0,
          business_rules_count: Number(semantic.business_rules_count) || 0,
          decision_logic_count: Number(semantic.decision_logic_count) || 0,
          missing_dimensions: Array.isArray(semantic.missing_dimensions) ? semantic.missing_dimensions : [],
          complete: semantic.complete === true
        };
        matchedTemplateSemantics.push(templateSemantic);
        hasOntologyEntities = hasOntologyEntities || templateSemantic.ontology_entities_count > 0;
        hasOntologyRelations = hasOntologyRelations || templateSemantic.ontology_relations_count > 0;
        hasBusinessRules = hasBusinessRules || templateSemantic.business_rules_count > 0;
        hasDecisionLogic = hasDecisionLogic || templateSemantic.decision_logic_count > 0;
      }
    }
    const semanticMissingDimensions = [];
    if (!hasOntologyEntities) {
      semanticMissingDimensions.push('ontology.entities');
    }
    if (!hasOntologyRelations) {
      semanticMissingDimensions.push('ontology.relations');
    }
    if (!hasBusinessRules) {
      semanticMissingDimensions.push('governance.business_rules');
    }
    if (!hasDecisionLogic) {
      semanticMissingDimensions.push('governance.decision_logic');
    }
    const uniqueProvides = Array.from(new Set(matchedProvides)).sort();
    return {
      capability,
      covered: matchedTemplates.length > 0,
      source_values: expectedMap.has(capability) ? expectedMap.get(capability).source_values : [],
      matched_templates: Array.from(new Set(matchedTemplates)).sort(),
      matched_provides: uniqueProvides,
      matched_template_semantics: matchedTemplateSemantics,
      semantic_complete: semanticMissingDimensions.length === 0,
      semantic_missing_dimensions: semanticMissingDimensions
    };
  });

  const coveredCount = coverage.filter(item => item.covered).length;
  const semanticCompleteCount = coverage.filter(item => item.semantic_complete).length;
  const uncovered = coverage.filter(item => !item.covered).map(item => item.capability);
  const coveragePercent = expected.length > 0
    ? Number(((coveredCount / expected.length) * 100).toFixed(2))
    : null;
  const semanticCompletePercent = expected.length > 0
    ? Number(((semanticCompleteCount / expected.length) * 100).toFixed(2))
    : null;
  const minRequiredPercent = minRequiredPercentValue;
  const minSemanticRequiredPercent = minSemanticRequiredValue;
  const passed = Number.isFinite(coveragePercent) && Number.isFinite(minRequiredPercent)
    ? coveragePercent >= minRequiredPercent
    : false;
  const semanticPassed = Number.isFinite(semanticCompletePercent) && Number.isFinite(minSemanticRequiredPercent)
    ? semanticCompletePercent >= minSemanticRequiredPercent
    : false;

  const payload = {
    mode: 'moqui-capability-coverage',
    generated_at: new Date().toISOString(),
    expected_capabilities: expected,
    summary: {
      total_capabilities: expected.length,
      covered_capabilities: coveredCount,
      uncovered_capabilities: expected.length - coveredCount,
      coverage_percent: coveragePercent,
      min_required_percent: minRequiredPercent,
      semantic_complete_capabilities: semanticCompleteCount,
      semantic_incomplete_capabilities: expected.length - semanticCompleteCount,
      semantic_complete_percent: semanticCompletePercent,
      min_semantic_required_percent: minSemanticRequiredPercent,
      semantic_passed: semanticPassed,
      passed
    },
    coverage,
    gaps: uncovered,
    normalization,
    warnings: Array.from(new Set(warnings))
  };

  const previousPayload = await loadLatestMoquiCapabilityCoverageReport(projectPath);
  if (previousPayload) {
    payload.compare = buildCapabilityCoverageComparison(payload, previousPayload);
  }

  const outputJsonPath = path.join(projectPath, AUTO_HANDOFF_MOQUI_CAPABILITY_COVERAGE_JSON_FILE);
  const outputMarkdownPath = path.join(projectPath, AUTO_HANDOFF_MOQUI_CAPABILITY_COVERAGE_MARKDOWN_FILE);
  await fs.ensureDir(path.dirname(outputJsonPath));
  await fs.writeJson(outputJsonPath, payload, { spaces: 2 });
  await fs.writeFile(outputMarkdownPath, renderMoquiCapabilityCoverageMarkdown(payload), 'utf8');

  return {
    status: 'evaluated',
    generated: true,
    summary: payload.summary,
    coverage: payload.coverage,
    gaps: payload.gaps,
    normalization: payload.normalization,
    warnings: payload.warnings,
    compare: payload.compare || null,
    output: {
      json: toAutoHandoffCliPath(projectPath, outputJsonPath),
      markdown: toAutoHandoffCliPath(projectPath, outputMarkdownPath)
    }
  };
}

module.exports = {
  buildAutoHandoffMoquiBaselineSnapshot,
  buildAutoHandoffScenePackageBatchSnapshot,
  buildAutoHandoffCapabilityCoverageSnapshot
};


