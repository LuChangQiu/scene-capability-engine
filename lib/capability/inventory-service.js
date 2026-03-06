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

async function runCapabilityInventoryService(options = {}, dependencies = {}) {
  const sceneIds = Array.isArray(dependencies.sceneIds) ? dependencies.sceneIds : [];
  const limit = toPositiveInteger(options.limit, sceneIds.length || 20);
  const scenes = [];

  for (const sceneId of sceneIds.slice(0, limit)) {
    const candidate = await dependencies.buildCandidatePayload(sceneId, {
      specs: options.specs,
      sample_limit: options.sample_limit
    }, dependencies.runtime || {});
    const score = dependencies.buildScoreFromCandidate(candidate);
    const releaseReadiness = dependencies.buildCapabilityReleaseReadiness({
      scene_id: sceneId,
      ontology_scope: candidate.ontology_scope,
      ontology_core: candidate.ontology_core
    });
    const sceneEntry = {
      scene_id: sceneId,
      summary: candidate.summary,
      source: candidate.source,
      ontology_scope: candidate.ontology_scope,
      ontology_core: candidate.ontology_core,
      ontology_core_ui: dependencies.buildOntologyCoreUiState(candidate.ontology_core),
      release_readiness: releaseReadiness,
      release_readiness_ui: dependencies.buildCapabilityReleaseReadinessUi(releaseReadiness),
      score_preview: score
    };
    scenes.push({
      ...sceneEntry,
      ...dependencies.buildCapabilityInventorySceneAdvice(sceneEntry)
    });
  }

  const filteredScenes = dependencies.sortCapabilityInventoryEntries(
    dependencies.filterCapabilityInventoryEntries(scenes, options)
  );
  const summaryStats = dependencies.buildCapabilityInventorySummaryStats(filteredScenes);
  const releaseReadyFilterRaw = normalizeText(options.releaseReady || options.release_ready).toLowerCase();

  return {
    mode: 'capability-inventory',
    generated_at: new Date().toISOString(),
    query: {
      protocol_version: '1.0',
      scene_id: normalizeText(options.scene || options.sceneId || options.scene_id) || null,
      limit,
      sample_limit: toPositiveInteger(options.sample_limit, 5),
      filters: {
        release_ready: releaseReadyFilterRaw ? ['1', 'true', 'yes', 'ready'].includes(releaseReadyFilterRaw) : null,
        missing_triad: normalizeText(options.missingTriad || options.missing_triad) || null
      }
    },
    scene_total: scenes.length,
    scene_count: filteredScenes.length,
    summary_stats: summaryStats,
    summary_recommendations: dependencies.buildCapabilityInventorySummaryRecommendations(filteredScenes),
    quick_filters: dependencies.buildCapabilityInventoryQuickFilters(summaryStats),
    sort: {
      strategy: 'publish_ready -> missing_triad_priority -> value_score_desc -> scene_id',
      triad_priority: ['decision_strategy', 'business_rules', 'entity_relation']
    },
    scenes: filteredScenes
  };
}

module.exports = {
  runCapabilityInventoryService
};
