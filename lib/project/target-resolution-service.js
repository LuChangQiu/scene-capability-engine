const path = require('path');
const { buildProjectPortfolioProjection } = require('./portfolio-projection-service');

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeText(value) {
  return normalizeString(value).toLowerCase();
}

function collectProjectAliases(project = {}) {
  const aliases = [];
  const fields = [
    project.projectId,
    project.workspaceId,
    project.projectName,
    project.appKey,
    project.projectRoot ? path.basename(project.projectRoot) : null
  ];
  for (const field of fields) {
    const normalized = normalizeText(field);
    if (!normalized || aliases.includes(normalized)) {
      continue;
    }
    aliases.push(normalized);
  }
  return aliases;
}

function scoreProjectMatch(requestText, project = {}) {
  const normalizedRequest = normalizeText(requestText);
  if (!normalizedRequest) {
    return null;
  }

  const aliases = collectProjectAliases(project);
  let bestScore = 0;
  let reasonCode = 'target.request_match';

  for (const alias of aliases) {
    if (normalizedRequest === alias) {
      bestScore = Math.max(bestScore, 1);
      reasonCode = 'target.alias_exact_match';
      continue;
    }
    if (normalizedRequest.includes(alias) && alias.length >= 2) {
      bestScore = Math.max(bestScore, 0.96);
      reasonCode = 'target.alias_contained_match';
      continue;
    }
    if (alias.includes(normalizedRequest) && normalizedRequest.length >= 3) {
      bestScore = Math.max(bestScore, 0.84);
      reasonCode = 'target.alias_prefix_match';
    }
  }

  if (bestScore <= 0) {
    return null;
  }

  return {
    projectId: project.projectId,
    workspaceId: project.workspaceId || null,
    projectName: project.projectName || null,
    appKey: project.appKey || null,
    confidence: Number(bestScore.toFixed(2)),
    reasonCode
  };
}

function buildResolutionCallerContext(options = {}, portfolio = {}) {
  const portfolioContext = portfolio && portfolio.callerContext && typeof portfolio.callerContext === 'object'
    ? portfolio.callerContext
    : {};
  const explicitCurrentProject = normalizeString(options.currentProject);
  const explicitDeviceId = normalizeString(options.device);
  const explicitToolInstanceId = normalizeString(options.toolInstanceId);

  return {
    ...(explicitCurrentProject || portfolioContext.projectId
      ? { currentProjectId: explicitCurrentProject || portfolioContext.projectId }
      : {}),
    ...(portfolioContext.workspaceId ? { workspaceId: portfolioContext.workspaceId } : {}),
    ...(explicitDeviceId || portfolioContext.deviceId
      ? { deviceId: explicitDeviceId || portfolioContext.deviceId }
      : {}),
    ...(explicitToolInstanceId ? { toolInstanceId: explicitToolInstanceId } : {})
  };
}

async function resolveProjectTarget(options = {}, dependencies = {}) {
  const requestText = normalizeString(options.request);
  const portfolio = await buildProjectPortfolioProjection({
    workspace: options.workspace
  }, dependencies);
  const callerContext = buildResolutionCallerContext(options, portfolio);
  const currentProjectId = normalizeString(callerContext.currentProjectId);
  const visibleProjects = Array.isArray(portfolio.projects) ? portfolio.projects : [];
  const currentProject = visibleProjects.find((project) => project.projectId === currentProjectId) || null;

  if (!requestText) {
    if (currentProject) {
      return {
        resolvedAt: new Date().toISOString(),
        callerContext,
        status: 'current-project',
        currentProjectId,
        resolvedProjectId: currentProjectId,
        confidence: 1,
        reasonCode: 'target.current_project'
      };
    }
    return {
      resolvedAt: new Date().toISOString(),
      callerContext,
      status: 'unresolved',
      ...(currentProjectId ? { currentProjectId } : {}),
      reasonCode: currentProjectId
        ? 'target.current_project_unavailable'
        : 'target.no_request_or_current_project'
    };
  }

  const matches = visibleProjects
    .map((project) => scoreProjectMatch(requestText, project))
    .filter(Boolean)
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }
      return `${left.projectId}`.localeCompare(`${right.projectId}`);
    });

  if (matches.length === 0) {
    return {
      resolvedAt: new Date().toISOString(),
      callerContext,
      status: 'unresolved',
      ...(currentProjectId ? { currentProjectId } : {}),
      reasonCode: 'target.no_match'
    };
  }

  const best = matches[0];
  const second = matches[1];
  const ambiguous = second && Math.abs(best.confidence - second.confidence) < 0.05;

  if (ambiguous) {
    return {
      resolvedAt: new Date().toISOString(),
      callerContext,
      status: 'ambiguous',
      ...(currentProjectId ? { currentProjectId } : {}),
      confidence: best.confidence,
      reasonCode: 'target.ambiguous',
      candidates: matches.slice(0, 5)
    };
  }

  return {
    resolvedAt: new Date().toISOString(),
    callerContext,
    status: currentProjectId && best.projectId === currentProjectId
      ? 'current-project'
      : 'resolved-other-project',
    ...(currentProjectId ? { currentProjectId } : {}),
    resolvedProjectId: best.projectId,
    confidence: best.confidence,
    reasonCode: best.reasonCode,
    candidates: [best]
  };
}

module.exports = {
  resolveProjectTarget
};
