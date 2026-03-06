const { buildMagicballStatusLanguage } = require('./status-language');

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function buildCapabilityInventorySceneAdvice(entry = {}) {
  const sceneId = String(entry && entry.scene_id || 'scene.unknown');
  const releaseUi = entry && entry.release_readiness_ui ? entry.release_readiness_ui : { publish_ready: true, blocking_missing: [] };
  const missing = Array.isArray(releaseUi.blocking_missing) ? releaseUi.blocking_missing : [];
  const valueScore = Number(entry && entry.score_preview && entry.score_preview.value_score || 0);

  let attentionLevel = 'low';
  let recommendedAction = '可直接发布';
  let blockingSummary = '已满足发布前置条件';
  let nextAction = 'publish';

  if (!releaseUi.publish_ready) {
    if (missing.includes('decision_strategy')) {
      attentionLevel = 'critical';
      recommendedAction = '补齐决策策略';
      blockingSummary = '缺决策策略，暂不可发布';
      nextAction = 'fill_decision_strategy';
    } else if (missing.includes('business_rules')) {
      attentionLevel = 'high';
      recommendedAction = '补齐业务规则';
      blockingSummary = '缺业务规则，暂不可发布';
      nextAction = 'fill_business_rules';
    } else if (missing.includes('entity_relation')) {
      attentionLevel = 'medium';
      recommendedAction = '补齐实体关系';
      blockingSummary = '缺实体关系，暂不可发布';
      nextAction = 'fill_entity_relation';
    } else {
      attentionLevel = 'medium';
      recommendedAction = '补齐本体能力';
      blockingSummary = '本体能力不完整，暂不可发布';
      nextAction = 'repair_ontology_core';
    }
  } else if (valueScore >= 70) {
    attentionLevel = 'low';
    recommendedAction = '进入模板构建';
    blockingSummary = '能力成熟度较高，可进入模板构建/发布';
    nextAction = 'build_template';
  } else {
    attentionLevel = 'medium';
    recommendedAction = '继续补充任务证据';
    blockingSummary = '已可发布，但建议先补强任务与验证证据';
    nextAction = 'strengthen_evidence';
  }

  return {
    attention_level: attentionLevel,
    recommended_action: recommendedAction,
    blocking_summary: blockingSummary,
    next_action: nextAction,
    next_command: 'sce capability extract --scene ' + sceneId + ' --json',
    mb_status: buildMagicballStatusLanguage({
      attention_level: attentionLevel,
      status_label: releaseUi.publish_ready ? 'publish_ready' : 'blocked',
      blocking_summary: blockingSummary,
      recommended_action: recommendedAction
    })
  };
}

function buildCapabilityInventorySummaryStats(entries) {
  const items = Array.isArray(entries) ? entries : [];
  const summary = {
    publish_ready_count: 0,
    blocked_count: 0,
    missing_triads: {
      decision_strategy: 0,
      business_rules: 0,
      entity_relation: 0
    }
  };

  for (const entry of items) {
    const ready = Boolean(entry && entry.release_readiness_ui && entry.release_readiness_ui.publish_ready);
    if (ready) {
      summary.publish_ready_count += 1;
    } else {
      summary.blocked_count += 1;
    }

    const missing = Array.isArray(entry && entry.release_readiness_ui && entry.release_readiness_ui.blocking_missing)
      ? entry.release_readiness_ui.blocking_missing
      : [];
    for (const triad of Object.keys(summary.missing_triads)) {
      if (missing.includes(triad)) {
        summary.missing_triads[triad] += 1;
      }
    }
  }

  return summary;
}

function buildCapabilityInventorySummaryRecommendations(entries) {
  const items = Array.isArray(entries) ? entries : [];
  const recommendations = [];
  const blocked = items.filter((item) => !(item && item.release_readiness_ui && item.release_readiness_ui.publish_ready));
  const missingDecision = blocked.filter((item) => Array.isArray(item.release_readiness_ui && item.release_readiness_ui.blocking_missing) && item.release_readiness_ui.blocking_missing.includes('decision_strategy'));
  const missingRules = blocked.filter((item) => Array.isArray(item.release_readiness_ui && item.release_readiness_ui.blocking_missing) && item.release_readiness_ui.blocking_missing.includes('business_rules'));
  const readyScenes = items.filter((item) => item && item.release_readiness_ui && item.release_readiness_ui.publish_ready);

  if (missingDecision.length > 0) {
    recommendations.push('优先处理缺决策策略的 scene（' + missingDecision.length + '）');
  }
  if (missingRules.length > 0) {
    recommendations.push('其次处理缺业务规则的 scene（' + missingRules.length + '）');
  }
  if (readyScenes.length > 0) {
    recommendations.push('可优先推进可发布 scene 进入模板构建（' + readyScenes.length + '）');
  }
  if (blocked.length === 0 && readyScenes.length === 0 && items.length > 0) {
    recommendations.push('当前 scene 已基本稳定，可继续补强验证证据');
  }

  return recommendations;
}

function buildCapabilityInventoryQuickFilters(summaryStats) {
  const stats = summaryStats || { blocked_count: 0, missing_triads: {} };
  const filters = [];
  if (Number(stats.blocked_count || 0) > 0) {
    filters.push({ id: 'blocked', label: '不可发布', query: { release_ready: false, missing_triad: null } });
  }
  for (const triad of ['decision_strategy', 'business_rules', 'entity_relation']) {
    if (Number(stats.missing_triads && stats.missing_triads[triad] || 0) > 0) {
      filters.push({ id: 'missing_' + triad, label: '缺' + triad, query: { release_ready: false, missing_triad: triad } });
    }
  }
  if (Number(stats.publish_ready_count || 0) > 0) {
    filters.push({ id: 'ready', label: '可发布', query: { release_ready: true, missing_triad: null } });
  }
  return filters;
}

function resolveCapabilityTriadPriority(entry = {}) {
  const missing = Array.isArray(entry && entry.release_readiness_ui && entry.release_readiness_ui.blocking_missing)
    ? entry.release_readiness_ui.blocking_missing
    : [];
  if (missing.includes('decision_strategy')) {
    return 0;
  }
  if (missing.includes('business_rules')) {
    return 1;
  }
  if (missing.includes('entity_relation')) {
    return 2;
  }
  return 3;
}

function sortCapabilityInventoryEntries(entries) {
  return [...(Array.isArray(entries) ? entries : [])].sort((left, right) => {
    const leftReady = Boolean(left && left.release_readiness_ui && left.release_readiness_ui.publish_ready);
    const rightReady = Boolean(right && right.release_readiness_ui && right.release_readiness_ui.publish_ready);
    if (leftReady !== rightReady) {
      return leftReady ? 1 : -1;
    }

    const triadDelta = resolveCapabilityTriadPriority(left) - resolveCapabilityTriadPriority(right);
    if (triadDelta !== 0) {
      return triadDelta;
    }

    const leftValue = Number(left && left.score_preview && left.score_preview.value_score || 0);
    const rightValue = Number(right && right.score_preview && right.score_preview.value_score || 0);
    if (leftValue !== rightValue) {
      return rightValue - leftValue;
    }

    return String(left && left.scene_id || '').localeCompare(String(right && right.scene_id || ''));
  });
}

function filterCapabilityInventoryEntries(entries, options = {}) {
  const normalizedMissingTriad = normalizeText(options.missingTriad || options.missing_triad).toLowerCase();
  const releaseReadyFilter = normalizeText(options.releaseReady || options.release_ready).toLowerCase();
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    if (releaseReadyFilter) {
      const expected = ['1', 'true', 'yes', 'ready'].includes(releaseReadyFilter);
      if (Boolean(entry.release_readiness_ui && entry.release_readiness_ui.publish_ready) !== expected) {
        return false;
      }
    }
    if (normalizedMissingTriad) {
      const missing = Array.isArray(entry.release_readiness_ui && entry.release_readiness_ui.blocking_missing)
        ? entry.release_readiness_ui.blocking_missing
        : [];
      if (!missing.includes(normalizedMissingTriad)) {
        return false;
      }
    }
    return true;
  });
}

module.exports = {
  buildCapabilityInventorySceneAdvice,
  buildCapabilityInventorySummaryStats,
  buildCapabilityInventorySummaryRecommendations,
  buildCapabilityInventoryQuickFilters,
  resolveCapabilityTriadPriority,
  sortCapabilityInventoryEntries,
  filterCapabilityInventoryEntries
};
