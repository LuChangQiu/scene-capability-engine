function buildStudioTaskKey(stageName = '') {
  const normalizedStage = (typeof stageName === 'string' ? stageName.trim() : '') || 'task';
  return 'studio:' + normalizedStage;
}

async function resolveTaskReference(mode, job, options = {}, dependencies = {}) {
  const normalizeString = dependencies.normalizeString;
  const resolveTaskStage = dependencies.resolveTaskStage;
  const TaskRefRegistry = dependencies.TaskRefRegistry;
  const fileSystem = dependencies.fileSystem;
  const explicitTaskRef = normalizeString(options.taskRef);
  if (explicitTaskRef) {
    return explicitTaskRef;
  }

  const sceneId = normalizeString(job && job.scene && job.scene.id);
  const specId = normalizeString(job && job.scene && job.scene.spec_id) || normalizeString(job && job.source && job.source.spec_id);
  if (!sceneId || !specId) {
    return null;
  }

  const stageName = resolveTaskStage(mode, job, options.stageName);
  const taskKey = normalizeString(options.taskKey) || buildStudioTaskKey(stageName);
  const projectPath = normalizeString(options.projectPath) || process.cwd();
  const taskRefRegistry = options.taskRefRegistry || new TaskRefRegistry(projectPath, { fileSystem });

  try {
    const taskRef = await taskRefRegistry.resolveOrCreateRef({
      sceneId,
      specId,
      taskKey,
      source: 'studio-stage',
      metadata: {
        mode: normalizeString(mode) || null,
        stage: stageName || null,
        job_id: normalizeString(job && job.job_id) || null
      }
    });
    return taskRef.task_ref;
  } catch (_error) {
    return null;
  }
}

function collectTaskFileChanges(job = {}, stageName = '', stageMetadata = {}, dependencies = {}) {
  const normalizeString = dependencies.normalizeString;
  const normalizeTaskFileChanges = dependencies.normalizeTaskFileChanges;
  const fileChanges = [];
  if (Array.isArray(stageMetadata && stageMetadata.file_changes)) {
    fileChanges.push(...stageMetadata.file_changes);
  }

  const createdSpec = job && job.source && job.source.intake && job.source.intake.created_spec;
  const createdSpecId = createdSpec && createdSpec.created
    ? normalizeString(createdSpec.spec_id)
    : '';
  if (stageName === 'plan' && createdSpecId) {
    fileChanges.push(
      { path: '.sce/specs/' + createdSpecId + '/requirements.md', line: 1 },
      { path: '.sce/specs/' + createdSpecId + '/design.md', line: 1 },
      { path: '.sce/specs/' + createdSpecId + '/tasks.md', line: 1 },
      { path: '.sce/specs/' + createdSpecId + '/custom/problem-domain-chain.json', line: 1 },
      { path: '.sce/specs/' + createdSpecId + '/custom/problem-contract.json', line: 1 }
    );
  }

  const artifacts = job && job.artifacts ? job.artifacts : {};
  if (stageName === 'plan') {
    if (normalizeString(artifacts.spec_portfolio_report)) {
      fileChanges.push({ path: artifacts.spec_portfolio_report, line: 1 });
    }
    if (normalizeString(artifacts.spec_scene_index)) {
      fileChanges.push({ path: artifacts.spec_scene_index, line: 1 });
    }
  }
  if (stageName === 'generate' && normalizeString(artifacts.generate_report)) {
    fileChanges.push({ path: artifacts.generate_report, line: 1 });
  }
  if (stageName === 'verify' && normalizeString(artifacts.verify_report)) {
    fileChanges.push({ path: artifacts.verify_report, line: 1 });
  }
  if (stageName === 'release' && normalizeString(artifacts.release_report)) {
    fileChanges.push({ path: artifacts.release_report, line: 1 });
  }
  return normalizeTaskFileChanges(fileChanges);
}

function collectTaskEvidence(job = {}, stageName = '', stageMetadata = {}, dependencies = {}) {
  const normalizeString = dependencies.normalizeString;
  const normalizeTaskEvidence = dependencies.normalizeTaskEvidence;
  const evidence = [];
  const stageReport = normalizeString(stageMetadata && stageMetadata.report);
  if (stageReport) {
    evidence.push({ type: 'stage-report', ref: stageReport, detail: stageName });
  }

  const artifacts = job && job.artifacts ? job.artifacts : {};
  if (stageName && artifacts.problem_eval_reports && artifacts.problem_eval_reports[stageName]) {
    evidence.push({
      type: 'problem-evaluation-report',
      ref: artifacts.problem_eval_reports[stageName],
      detail: stageName
    });
  }

  if (normalizeString(job && job.source && job.source.domain_chain && job.source.domain_chain.chain_path)) {
    evidence.push({
      type: 'domain-chain',
      ref: job.source.domain_chain.chain_path,
      detail: stageName
    });
  }
  if (normalizeString(job && job.source && job.source.problem_contract_path)) {
    evidence.push({
      type: 'problem-contract',
      ref: job.source.problem_contract_path,
      detail: stageName
    });
  }
  if (Array.isArray(stageMetadata && stageMetadata.auto_errorbook_records)) {
    for (const item of stageMetadata.auto_errorbook_records) {
      const entryId = normalizeString(item && item.entry_id);
      if (!entryId) {
        continue;
      }
      evidence.push({
        type: 'errorbook-entry',
        ref: entryId,
        detail: normalizeString(item && item.step_id) || null
      });
    }
  }

  if (normalizeString(job && job.job_id)) {
    evidence.push({
      type: 'event-log',
      ref: '.sce/state/sce-state.sqlite',
      detail: 'studio_event_stream:job_id=' + job.job_id
    });
  }

  return normalizeTaskEvidence(evidence);
}

function buildTaskEnvelope(mode, job, options = {}, dependencies = {}) {
  const resolveTaskStage = dependencies.resolveTaskStage;
  const resolveNextAction = dependencies.resolveNextAction;
  const normalizeString = dependencies.normalizeString;
  const normalizeTaskCommands = dependencies.normalizeTaskCommands;
  const normalizeTaskErrors = dependencies.normalizeTaskErrors;
  const extractCommandsFromStageMetadata = dependencies.extractCommandsFromStageMetadata;
  const extractErrorsFromStageMetadata = dependencies.extractErrorsFromStageMetadata;
  const deriveTaskIntentShape = dependencies.deriveTaskIntentShape;
  const buildTaskSummaryLines = dependencies.buildTaskSummaryLines;
  const buildTaskAcceptanceCriteria = dependencies.buildTaskAcceptanceCriteria;

  const stageName = resolveTaskStage(mode, job, options.stageName);
  const stageState = stageName && job && job.stages && job.stages[stageName]
    ? job.stages[stageName]
    : {};
  const stageMetadata = stageState && typeof stageState.metadata === 'object' && stageState.metadata
    ? stageState.metadata
    : {};
  const nextAction = resolveNextAction(job);

  const events = Array.isArray(options.events)
    ? options.events
    : (options.event ? [options.event] : []);
  const latestEvent = events.length > 0 ? events[events.length - 1] : null;

  const taskStatus = normalizeString(stageState && stageState.status)
    || (stageName === 'rollback' && normalizeString(job && job.status) === 'rolled_back'
      ? 'completed'
      : normalizeString(job && job.status) || 'unknown');
  const taskId = normalizeString(options.taskId)
    || (normalizeString(job && job.job_id)
      ? job.job_id + ':' + (stageName || 'task')
      : null);
  const rawRequest = normalizeString(job && job.source && job.source.goal);
  const goal = rawRequest || ('Studio ' + (stageName || 'task') + ' execution');
  const taskIntent = deriveTaskIntentShape(rawRequest, stageName);
  const sessionId = normalizeString(job && job.session && job.session.scene_session_id) || null;
  const sceneId = normalizeString(job && job.scene && job.scene.id) || null;
  const specId = normalizeString(job && job.scene && job.scene.spec_id) || normalizeString(job && job.source && job.source.spec_id) || null;
  const taskRef = normalizeString(options.taskRef) || null;

  const commands = normalizeTaskCommands([
    ...(Array.isArray(stageMetadata.commands) ? stageMetadata.commands : []),
    ...extractCommandsFromStageMetadata(stageMetadata)
  ]);
  const errors = normalizeTaskErrors(
    extractErrorsFromStageMetadata(stageState, stageMetadata)
  );
  const fileChanges = collectTaskFileChanges(job, stageName, stageMetadata, dependencies);
  const evidence = collectTaskEvidence(job, stageName, stageMetadata, dependencies);

  const handoff = stageMetadata.handoff && typeof stageMetadata.handoff === 'object'
    ? stageMetadata.handoff
    : {
      stage: stageName,
      status: taskStatus,
      completed_at: normalizeString(stageState && stageState.completed_at) || null,
      report: normalizeString(stageMetadata.report) || null,
      release_ref: normalizeString(stageMetadata.release_ref) || normalizeString(job && job.artifacts && job.artifacts.release_ref) || null
    };

  const normalizedHandoff = {
    ...handoff,
    task_ref: taskRef
  };

  return {
    sessionId,
    sceneId,
    specId,
    taskId,
    taskRef,
    eventId: normalizeString(latestEvent && latestEvent.event_id) || null,
    task: {
      ref: taskRef,
      task_ref: taskRef,
      title_norm: taskIntent.title_norm,
      raw_request: taskIntent.raw_request,
      goal,
      sub_goals: taskIntent.sub_goals,
      acceptance_criteria: buildTaskAcceptanceCriteria(stageName, job, nextAction),
      needs_split: taskIntent.needs_split,
      confidence: taskIntent.confidence,
      status: taskStatus,
      summary: buildTaskSummaryLines(job, stageName, taskStatus, nextAction, taskRef, dependencies.buildProgress),
      handoff: normalizedHandoff,
      next_action: nextAction,
      file_changes: fileChanges,
      commands,
      errors,
      evidence
    },
    event: events
  };
}

async function buildCommandPayload(mode, job, options = {}, dependencies = {}) {
  const taskRef = await resolveTaskReference(mode, job, options, dependencies);
  const base = {
    mode,
    success: true,
    job_id: job.job_id,
    status: job.status,
    progress: dependencies.buildProgress(job),
    next_action: dependencies.resolveNextAction(job),
    artifacts: { ...job.artifacts }
  };
  return dependencies.attachTaskFeedbackModel({
    ...base,
    ...buildTaskEnvelope(mode, job, {
      ...options,
      taskRef
    }, dependencies)
  });
}

module.exports = {
  buildStudioTaskKey,
  resolveTaskReference,
  collectTaskFileChanges,
  collectTaskEvidence,
  buildTaskEnvelope,
  buildCommandPayload
};
