const path = require('path');
const crypto = require('crypto');
const fs = require('fs-extra');

const DEFAULT_BACKEND = 'sqlite';
const DEFAULT_DB_RELATIVE_PATH = path.join('.sce', 'state', 'sce-state.sqlite');
const SUPPORTED_BACKENDS = new Set(['sqlite']);

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(`${value}`, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeBooleanValue(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = normalizeString(`${value || ''}`).toLowerCase();
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

function normalizeNonNegativeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(`${value}`, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function parseJsonSafe(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function normalizeStringArray(value, fallback = []) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  return value
    .map((item) => normalizeString(item))
    .filter(Boolean);
}

function normalizeIsoTimestamp(value, fallback = '') {
  const normalized = normalizeString(value);
  if (!normalized) {
    return normalizeString(fallback);
  }
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    return normalizeString(fallback);
  }
  return new Date(parsed).toISOString();
}

function formatSegment(value) {
  const normalized = normalizeInteger(value, 0);
  if (normalized <= 0) {
    return '00';
  }
  return `${normalized}`.padStart(2, '0');
}

function buildTaskRef(sceneNo, specNo, taskNo) {
  return `${formatSegment(sceneNo)}.${formatSegment(specNo)}.${formatSegment(taskNo)}`;
}

function resolveBackend(explicitBackend = '', env = process.env) {
  const backendFromEnv = normalizeString(env && env.SCE_STATE_BACKEND);
  const normalized = normalizeString(explicitBackend || backendFromEnv || DEFAULT_BACKEND).toLowerCase();
  if (!SUPPORTED_BACKENDS.has(normalized)) {
    return DEFAULT_BACKEND;
  }
  return normalized;
}

function loadNodeSqlite(sqliteModule) {
  if (sqliteModule) {
    return sqliteModule;
  }
  try {
    return require('node:sqlite');
  } catch (_error) {
    return null;
  }
}

class SceStateStore {
  constructor(projectPath = process.cwd(), options = {}) {
    this.projectPath = projectPath;
    this.fileSystem = options.fileSystem || fs;
    this.env = options.env || process.env;
    this.backend = resolveBackend(options.backend, this.env);
    this.dbPath = options.dbPath || path.join(projectPath, DEFAULT_DB_RELATIVE_PATH);
    this.now = typeof options.now === 'function'
      ? options.now
      : () => new Date().toISOString();

    const sqlite = loadNodeSqlite(options.sqliteModule);
    this.DatabaseSync = sqlite && sqlite.DatabaseSync ? sqlite.DatabaseSync : null;
    this._db = null;
    this._ready = false;
    this._memory = {
      app_bundles: {},
      runtime_releases: {},
      runtime_installations: {},
      ontology_bundles: {},
      engineering_projects: {},
      app_bundle_scene_bindings: {},
      app_bundle_projection_cache: {},
      pm_requirements: {},
      pm_tracking: {},
      pm_plans: {},
      pm_changes: {},
      pm_issues: {},
      ontology_er_assets: {},
      ontology_br_rules: {},
      ontology_dl_chains: {},
      assurance_resource_snapshots: {},
      assurance_log_views: {},
      assurance_backup_records: {},
      assurance_config_switches: {},
      scenes: {},
      specs: {},
      tasks: {},
      refs: {},
      timeline_snapshots: {},
      scene_session_cycles: {},
      agent_runtime: {},
      errorbook_entry_index: {},
      errorbook_incident_index: {},
      governance_spec_scene_override: {},
      governance_scene_index: {},
      release_evidence_run: {},
      release_gate_history: {},
      runtime_installations: {},
      migration_records: {},
      auth_leases: {},
      auth_events: [],
      interactive_approval_events: {},
      sequences: {
        scene_next: 1,
        spec_next_by_scene: {},
        task_next_by_scene_spec: {}
      },
      events_by_job: {}
    };
  }

  isSqliteConfigured() {
    return this.backend === 'sqlite';
  }

  isSqliteAvailable() {
    return this.isSqliteConfigured() && Boolean(this.DatabaseSync);
  }

  getStoreRelativePath() {
    if (!this.isSqliteConfigured()) {
      return null;
    }
    return path.relative(this.projectPath, this.dbPath).replace(/\\/g, '/');
  }

  async ensureReady() {
    if (!this.isSqliteAvailable()) {
      return false;
    }
    if (this._ready && this._db) {
      return true;
    }

    await this.fileSystem.ensureDir(path.dirname(this.dbPath));
    this._db = new this.DatabaseSync(this.dbPath);
    this._initializeSchema();
    this._ready = true;
    return true;
  }

  _useMemoryBackend() {
    if (this.isSqliteAvailable()) {
      return false;
    }
    const memoryFallbackFlag = normalizeString(this.env && this.env.SCE_STATE_ALLOW_MEMORY_FALLBACK) === '1';
    const isTestEnv = normalizeString(this.env && this.env.NODE_ENV).toLowerCase() === 'test';
    return memoryFallbackFlag || isTestEnv;
  }

  _initializeSchema() {
    this._db.exec('PRAGMA journal_mode = WAL;');
    this._db.exec('PRAGMA foreign_keys = ON;');
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS scene_registry (
        scene_id TEXT PRIMARY KEY,
        scene_no INTEGER NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS spec_registry (
        scene_id TEXT NOT NULL,
        spec_id TEXT NOT NULL,
        spec_no INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (scene_id, spec_id),
        UNIQUE (scene_id, spec_no),
        FOREIGN KEY (scene_id) REFERENCES scene_registry(scene_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS task_ref_registry (
        task_ref TEXT PRIMARY KEY,
        scene_id TEXT NOT NULL,
        spec_id TEXT NOT NULL,
        task_key TEXT NOT NULL,
        task_no INTEGER NOT NULL,
        source TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (scene_id, spec_id, task_key),
        UNIQUE (scene_id, spec_id, task_no),
        FOREIGN KEY (scene_id, spec_id) REFERENCES spec_registry(scene_id, spec_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS studio_event_stream (
        event_id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_timestamp TEXT NOT NULL,
        scene_id TEXT,
        spec_id TEXT,
        created_at TEXT NOT NULL,
        raw_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_studio_event_stream_job_ts
        ON studio_event_stream(job_id, event_timestamp);

      CREATE TABLE IF NOT EXISTS auth_lease_registry (
        lease_id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        role TEXT NOT NULL,
        scope_json TEXT NOT NULL,
        reason TEXT,
        metadata_json TEXT,
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_auth_lease_registry_expires
        ON auth_lease_registry(expires_at);

      CREATE TABLE IF NOT EXISTS auth_event_stream (
        event_id TEXT PRIMARY KEY,
        event_timestamp TEXT NOT NULL,
        event_type TEXT NOT NULL,
        action TEXT,
        actor TEXT,
        lease_id TEXT,
        result TEXT,
        target TEXT,
        detail_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_auth_event_stream_ts
        ON auth_event_stream(event_timestamp);

      CREATE TABLE IF NOT EXISTS interactive_approval_event_projection (
        event_id TEXT PRIMARY KEY,
        workflow_id TEXT,
        event_timestamp TEXT NOT NULL,
        event_type TEXT NOT NULL,
        action TEXT,
        actor TEXT,
        actor_role TEXT,
        from_status TEXT,
        to_status TEXT,
        blocked INTEGER,
        reason TEXT,
        audit_file TEXT,
        line_no INTEGER,
        raw_json TEXT NOT NULL,
        source TEXT,
        indexed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_interactive_approval_event_projection_workflow_ts
        ON interactive_approval_event_projection(workflow_id, event_timestamp DESC);

      CREATE INDEX IF NOT EXISTS idx_interactive_approval_event_projection_actor_action_ts
        ON interactive_approval_event_projection(actor, action, event_timestamp DESC);

      CREATE INDEX IF NOT EXISTS idx_interactive_approval_event_projection_blocked_ts
        ON interactive_approval_event_projection(blocked, event_timestamp DESC);

      CREATE TABLE IF NOT EXISTS timeline_snapshot_registry (
        snapshot_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        trigger TEXT,
        event TEXT,
        summary TEXT,
        scene_id TEXT,
        session_id TEXT,
        command TEXT,
        file_count INTEGER,
        total_bytes INTEGER,
        snapshot_path TEXT,
        git_json TEXT,
        source TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_timeline_snapshot_registry_created
        ON timeline_snapshot_registry(created_at DESC);

      CREATE TABLE IF NOT EXISTS scene_session_cycle_registry (
        scene_id TEXT NOT NULL,
        cycle INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        status TEXT,
        started_at TEXT,
        completed_at TEXT,
        source TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (scene_id, cycle)
      );

      CREATE INDEX IF NOT EXISTS idx_scene_session_cycle_registry_session
        ON scene_session_cycle_registry(session_id);

      CREATE TABLE IF NOT EXISTS agent_runtime_registry (
        agent_id TEXT PRIMARY KEY,
        machine_id TEXT,
        instance_index INTEGER,
        hostname TEXT,
        registered_at TEXT,
        last_heartbeat TEXT,
        status TEXT,
        current_task_json TEXT,
        source TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_agent_runtime_registry_status
        ON agent_runtime_registry(status);

      CREATE TABLE IF NOT EXISTS state_migration_registry (
        migration_id TEXT PRIMARY KEY,
        component_id TEXT NOT NULL,
        source_path TEXT,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        metrics_json TEXT,
        detail_json TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_state_migration_registry_component_started
        ON state_migration_registry(component_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS errorbook_entry_index_registry (
        entry_id TEXT PRIMARY KEY,
        fingerprint TEXT,
        title TEXT,
        status TEXT,
        quality_score INTEGER,
        tags_json TEXT,
        ontology_tags_json TEXT,
        temporary_mitigation_active INTEGER,
        temporary_mitigation_deadline_at TEXT,
        occurrences INTEGER,
        created_at TEXT,
        updated_at TEXT,
        source TEXT,
        indexed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_errorbook_entry_index_registry_status_updated
        ON errorbook_entry_index_registry(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS errorbook_incident_index_registry (
        incident_id TEXT PRIMARY KEY,
        fingerprint TEXT,
        title TEXT,
        symptom TEXT,
        state TEXT,
        attempt_count INTEGER,
        created_at TEXT,
        updated_at TEXT,
        last_attempt_at TEXT,
        resolved_at TEXT,
        linked_entry_id TEXT,
        source TEXT,
        indexed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_errorbook_incident_index_registry_state_updated
        ON errorbook_incident_index_registry(state, updated_at DESC);

      CREATE TABLE IF NOT EXISTS governance_spec_scene_override_registry (
        spec_id TEXT PRIMARY KEY,
        scene_id TEXT NOT NULL,
        source TEXT,
        rule_id TEXT,
        updated_at TEXT,
        indexed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_governance_spec_scene_override_registry_scene
        ON governance_spec_scene_override_registry(scene_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS governance_scene_index_registry (
        scene_id TEXT PRIMARY KEY,
        total_specs INTEGER,
        active_specs INTEGER,
        completed_specs INTEGER,
        stale_specs INTEGER,
        spec_ids_json TEXT,
        active_spec_ids_json TEXT,
        stale_spec_ids_json TEXT,
        generated_at TEXT,
        scene_filter TEXT,
        source TEXT,
        indexed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_governance_scene_index_registry_counts
        ON governance_scene_index_registry(total_specs DESC, active_specs DESC);

      CREATE TABLE IF NOT EXISTS release_evidence_run_registry (
        session_id TEXT PRIMARY KEY,
        merged_at TEXT,
        status TEXT,
        gate_passed INTEGER,
        spec_success_rate_percent REAL,
        risk_level TEXT,
        ontology_quality_score REAL,
        capability_coverage_percent REAL,
        capability_coverage_passed INTEGER,
        scene_package_batch_passed INTEGER,
        scene_package_batch_failure_count INTEGER,
        failed_goals INTEGER,
        release_gate_preflight_available INTEGER,
        release_gate_preflight_blocked INTEGER,
        source_updated_at TEXT,
        source TEXT,
        indexed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_release_evidence_run_registry_status_merged
        ON release_evidence_run_registry(status, merged_at DESC);

      CREATE TABLE IF NOT EXISTS release_gate_history_registry (
        tag TEXT PRIMARY KEY,
        evaluated_at TEXT,
        gate_passed INTEGER,
        enforce INTEGER,
        risk_level TEXT,
        spec_success_rate_percent REAL,
        scene_package_batch_passed INTEGER,
        scene_package_batch_failure_count INTEGER,
        capability_expected_unknown_count INTEGER,
        capability_provided_unknown_count INTEGER,
        release_gate_preflight_available INTEGER,
        release_gate_preflight_blocked INTEGER,
        require_release_gate_preflight INTEGER,
        drift_alert_count INTEGER,
        drift_blocked INTEGER,
        weekly_ops_blocked INTEGER,
        source_updated_at TEXT,
        source TEXT,
        indexed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_release_gate_history_registry_eval
        ON release_gate_history_registry(evaluated_at DESC);

      CREATE TABLE IF NOT EXISTS app_bundle_registry (
        app_id TEXT PRIMARY KEY,
        app_key TEXT NOT NULL UNIQUE,
        app_name TEXT NOT NULL,
        app_slug TEXT,
        workspace_id TEXT,
        runtime_release_id TEXT,
        ontology_bundle_id TEXT,
        engineering_project_id TEXT,
        default_scene_id TEXT,
        environment TEXT,
        status TEXT NOT NULL,
        source_origin TEXT,
        tags_json TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_app_bundle_registry_status_updated
        ON app_bundle_registry(status, updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_app_bundle_registry_workspace
        ON app_bundle_registry(workspace_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS runtime_release_registry (
        release_id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        runtime_version TEXT NOT NULL,
        release_channel TEXT,
        release_status TEXT NOT NULL,
        entrypoint TEXT,
        runtime_status TEXT,
        release_notes_file TEXT,
        release_evidence_file TEXT,
        published_at TEXT,
        source_updated_at TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (app_id) REFERENCES app_bundle_registry(app_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_runtime_release_registry_app_published
        ON runtime_release_registry(app_id, published_at DESC);

      CREATE INDEX IF NOT EXISTS idx_runtime_release_registry_status
        ON runtime_release_registry(release_status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS runtime_installation_registry (
        installation_id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        release_id TEXT,
        machine_id TEXT,
        install_root TEXT,
        install_status TEXT NOT NULL,
        installed_at TEXT,
        last_opened_at TEXT,
        current_environment TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (app_id) REFERENCES app_bundle_registry(app_id) ON DELETE CASCADE,
        FOREIGN KEY (release_id) REFERENCES runtime_release_registry(release_id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_runtime_installation_registry_app_updated
        ON runtime_installation_registry(app_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS ontology_bundle_registry (
        ontology_bundle_id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        ontology_version TEXT,
        template_version TEXT,
        capability_catalog_version TEXT,
        triad_revision TEXT,
        triad_status TEXT,
        publish_readiness TEXT,
        template_source TEXT,
        capability_set_json TEXT,
        summary_json TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (app_id) REFERENCES app_bundle_registry(app_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_ontology_bundle_registry_app_updated
        ON ontology_bundle_registry(app_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS engineering_project_registry (
        engineering_project_id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        project_key TEXT,
        project_name TEXT,
        repo_url TEXT,
        repo_provider TEXT,
        default_branch TEXT,
        current_branch TEXT,
        commit_sha TEXT,
        workspace_path TEXT,
        code_version TEXT,
        synced_runtime_release_id TEXT,
        dirty_state INTEGER NOT NULL DEFAULT 0,
        auth_policy_json TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (app_id) REFERENCES app_bundle_registry(app_id) ON DELETE CASCADE,
        FOREIGN KEY (synced_runtime_release_id) REFERENCES runtime_release_registry(release_id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_engineering_project_registry_app_updated
        ON engineering_project_registry(app_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS app_bundle_scene_binding_registry (
        app_id TEXT NOT NULL,
        scene_id TEXT NOT NULL,
        binding_role TEXT NOT NULL,
        source TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (app_id, scene_id, binding_role),
        FOREIGN KEY (app_id) REFERENCES app_bundle_registry(app_id) ON DELETE CASCADE,
        FOREIGN KEY (scene_id) REFERENCES scene_registry(scene_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_app_bundle_scene_binding_registry_scene
        ON app_bundle_scene_binding_registry(scene_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS app_bundle_projection_cache_registry (
        app_id TEXT NOT NULL,
        projection_mode TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        source_updated_at TEXT,
        PRIMARY KEY (app_id, projection_mode),
        FOREIGN KEY (app_id) REFERENCES app_bundle_registry(app_id) ON DELETE CASCADE
      );


      CREATE INDEX IF NOT EXISTS idx_app_bundle_projection_cache_registry_generated
        ON app_bundle_projection_cache_registry(generated_at DESC);

      CREATE TABLE IF NOT EXISTS pm_requirement_registry (
        requirement_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        source_request TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        owner TEXT,
        scene_ref TEXT,
        spec_ref TEXT,
        tracking_stage TEXT,
        plan_ref TEXT,
        acceptance_summary TEXT,
        acceptance_details_json TEXT,
        domain_tags_json TEXT,
        risk_level TEXT,
        change_count INTEGER NOT NULL DEFAULT 0,
        issue_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_pm_requirement_registry_status_updated
        ON pm_requirement_registry(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS pm_tracking_registry (
        tracking_id TEXT PRIMARY KEY,
        requirement_id TEXT NOT NULL UNIQUE,
        current_stage TEXT NOT NULL,
        status TEXT NOT NULL,
        owner TEXT,
        latest_action TEXT,
        blocking_summary TEXT,
        next_action TEXT NOT NULL,
        risk_level TEXT,
        plan_ref TEXT,
        issue_count INTEGER NOT NULL DEFAULT 0,
        change_count INTEGER NOT NULL DEFAULT 0,
        eta TEXT,
        scene_ref TEXT,
        spec_ref TEXT,
        updated_at TEXT NOT NULL,
        updated_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_pm_tracking_registry_status_updated
        ON pm_tracking_registry(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS pm_plan_registry (
        plan_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        scope TEXT NOT NULL,
        status TEXT NOT NULL,
        owner TEXT,
        start_date TEXT,
        due_date TEXT,
        milestone TEXT,
        risk_level TEXT,
        change_count INTEGER NOT NULL DEFAULT 0,
        issue_count INTEGER NOT NULL DEFAULT 0,
        progress_summary TEXT,
        next_checkpoint TEXT,
        updated_at TEXT NOT NULL,
        updated_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_pm_plan_registry_status_updated
        ON pm_plan_registry(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS pm_change_request_registry (
        change_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        change_type TEXT NOT NULL,
        impact_scope TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT,
        owner TEXT,
        decision TEXT,
        decision_reason TEXT,
        risk_level TEXT,
        affected_modules_json TEXT,
        affected_entities_json TEXT,
        updated_at TEXT NOT NULL,
        updated_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_pm_change_request_registry_status_updated
        ON pm_change_request_registry(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS pm_issue_registry (
        issue_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        source TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT NOT NULL,
        requirement_id TEXT,
        tracking_id TEXT,
        owner TEXT,
        latest_action TEXT,
        expected_result TEXT,
        actual_result TEXT,
        fix_summary TEXT,
        verify_result TEXT,
        root_cause TEXT,
        reported_by TEXT,
        updated_by TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pm_issue_registry_status_updated
        ON pm_issue_registry(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS ontology_er_asset_registry (
        entity_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        display_name TEXT,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        key_fields_json TEXT,
        attributes_json TEXT,
        relations_json TEXT,
        domain_scope TEXT,
        owner TEXT,
        source_refs_json TEXT,
        rule_refs_json TEXT,
        decision_refs_json TEXT,
        risk_level TEXT,
        updated_at TEXT NOT NULL,
        updated_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_ontology_er_asset_registry_status_updated
        ON ontology_er_asset_registry(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS ontology_br_rule_registry (
        rule_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        scope TEXT NOT NULL,
        rule_type TEXT,
        condition TEXT NOT NULL,
        consequence TEXT NOT NULL,
        severity TEXT,
        status TEXT NOT NULL,
        owner TEXT,
        entity_refs_json TEXT,
        decision_refs_json TEXT,
        evidence_refs_json TEXT,
        updated_at TEXT NOT NULL,
        updated_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_ontology_br_rule_registry_status_updated
        ON ontology_br_rule_registry(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS ontology_dl_chain_registry (
        chain_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        trigger TEXT NOT NULL,
        decision_nodes_json TEXT NOT NULL,
        outputs_json TEXT NOT NULL,
        status TEXT NOT NULL,
        entity_refs_json TEXT,
        rule_refs_json TEXT,
        owner TEXT,
        input_schema_ref TEXT,
        output_schema_ref TEXT,
        risk_level TEXT,
        updated_at TEXT NOT NULL,
        updated_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_ontology_dl_chain_registry_status_updated
        ON ontology_dl_chain_registry(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS assurance_resource_snapshot_registry (
        snapshot_id TEXT PRIMARY KEY,
        scope TEXT,
        status TEXT NOT NULL,
        resource_type TEXT,
        resource_name TEXT NOT NULL,
        summary TEXT,
        metric_json TEXT,
        source TEXT,
        updated_at TEXT NOT NULL,
        updated_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_assurance_resource_snapshot_registry_status_updated
        ON assurance_resource_snapshot_registry(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS assurance_log_view_registry (
        view_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        source TEXT,
        status TEXT NOT NULL,
        summary TEXT,
        path_ref TEXT,
        filter_json TEXT,
        updated_at TEXT NOT NULL,
        updated_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_assurance_log_view_registry_status_updated
        ON assurance_log_view_registry(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS assurance_backup_record_registry (
        backup_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        backup_type TEXT,
        scope TEXT,
        status TEXT NOT NULL,
        summary TEXT,
        storage_ref TEXT,
        recoverable INTEGER NOT NULL DEFAULT 0,
        generated_at TEXT,
        updated_at TEXT NOT NULL,
        updated_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_assurance_backup_record_registry_status_updated
        ON assurance_backup_record_registry(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS assurance_config_switch_registry (
        switch_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        scope TEXT,
        switch_key TEXT NOT NULL,
        desired_state TEXT,
        actual_state TEXT,
        status TEXT NOT NULL,
        summary TEXT,
        owner TEXT,
        updated_at TEXT NOT NULL,
        updated_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_assurance_config_switch_registry_status_updated
        ON assurance_config_switch_registry(status, updated_at DESC);
    `);
  }

  _withTransaction(callback) {
    this._db.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      this._db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this._db.exec('ROLLBACK');
      } catch (_rollbackError) {
        // Ignore rollback failure.
      }
      throw error;
    }
  }

  _isRetryableReadError(error) {
    const message = normalizeString(error && error.message).toLowerCase();
    return message.includes('database is locked') || message.includes('sqlite_busy');
  }

  async _withReadRetry(callback, options = {}) {
    const maxAttempts = normalizeInteger(options.maxAttempts, 4);
    const baseDelayMs = normalizeInteger(options.baseDelayMs, 25);
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return callback();
      } catch (error) {
        attempt += 1;
        if (!this._isRetryableReadError(error) || attempt >= maxAttempts) {
          throw error;
        }
        const delayMs = baseDelayMs * attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  _ensureSceneRow(sceneId, nowIso) {
    const existing = this._db
      .prepare('SELECT scene_no FROM scene_registry WHERE scene_id = ?')
      .get(sceneId);
    if (existing && Number.isFinite(existing.scene_no)) {
      this._db
        .prepare('UPDATE scene_registry SET updated_at = ? WHERE scene_id = ?')
        .run(nowIso, sceneId);
      return Number(existing.scene_no);
    }

    const next = this._db
      .prepare('SELECT COALESCE(MAX(scene_no), 0) + 1 AS next_no FROM scene_registry')
      .get();
    const sceneNo = normalizeInteger(next && next.next_no, 1);
    this._db
      .prepare('INSERT INTO scene_registry(scene_id, scene_no, created_at, updated_at) VALUES(?, ?, ?, ?)')
      .run(sceneId, sceneNo, nowIso, nowIso);
    return sceneNo;
  }

  _ensureSpecRow(sceneId, specId, nowIso) {
    const existing = this._db
      .prepare('SELECT spec_no FROM spec_registry WHERE scene_id = ? AND spec_id = ?')
      .get(sceneId, specId);
    if (existing && Number.isFinite(existing.spec_no)) {
      this._db
        .prepare('UPDATE spec_registry SET updated_at = ? WHERE scene_id = ? AND spec_id = ?')
        .run(nowIso, sceneId, specId);
      return Number(existing.spec_no);
    }

    const next = this._db
      .prepare('SELECT COALESCE(MAX(spec_no), 0) + 1 AS next_no FROM spec_registry WHERE scene_id = ?')
      .get(sceneId);
    const specNo = normalizeInteger(next && next.next_no, 1);
    this._db
      .prepare('INSERT INTO spec_registry(scene_id, spec_id, spec_no, created_at, updated_at) VALUES(?, ?, ?, ?, ?)')
      .run(sceneId, specId, specNo, nowIso, nowIso);
    return specNo;
  }

  _mapTaskRefRow(row) {
    if (!row) {
      return null;
    }

    const sceneNo = normalizeInteger(row.scene_no, 0);
    const specNo = normalizeInteger(row.spec_no, 0);
    const taskNo = normalizeInteger(row.task_no, 0);

    return {
      task_ref: normalizeString(row.task_ref),
      scene_id: normalizeString(row.scene_id),
      spec_id: normalizeString(row.spec_id),
      task_key: normalizeString(row.task_key),
      scene_no: sceneNo,
      spec_no: specNo,
      task_no: taskNo,
      source: normalizeString(row.source) || 'unknown',
      metadata: parseJsonSafe(row.metadata_json, {}) || {}
    };
  }

  _mapAuthLeaseRow(row) {
    if (!row) {
      return null;
    }
    return {
      lease_id: normalizeString(row.lease_id),
      subject: normalizeString(row.subject),
      role: normalizeString(row.role),
      scope: normalizeStringArray(parseJsonSafe(row.scope_json, []), ['project:*']),
      reason: normalizeString(row.reason) || null,
      metadata: parseJsonSafe(row.metadata_json, {}) || {},
      issued_at: normalizeIsoTimestamp(row.issued_at) || null,
      expires_at: normalizeIsoTimestamp(row.expires_at) || null,
      revoked_at: normalizeIsoTimestamp(row.revoked_at) || null,
      created_at: normalizeIsoTimestamp(row.created_at) || null,
      updated_at: normalizeIsoTimestamp(row.updated_at) || null
    };
  }

  _mapAuthEventRow(row) {
    if (!row) {
      return null;
    }
    return {
      event_id: normalizeString(row.event_id),
      event_timestamp: normalizeIsoTimestamp(row.event_timestamp) || null,
      event_type: normalizeString(row.event_type),
      action: normalizeString(row.action) || null,
      actor: normalizeString(row.actor) || null,
      lease_id: normalizeString(row.lease_id) || null,
      result: normalizeString(row.result) || null,
      target: normalizeString(row.target) || null,
      detail: parseJsonSafe(row.detail_json, {}) || {},
      created_at: normalizeIsoTimestamp(row.created_at) || null
    };
  }

  _mapInteractiveApprovalEventProjectionRow(row) {
    if (!row) {
      return null;
    }
    return {
      event_id: normalizeString(row.event_id),
      workflow_id: normalizeString(row.workflow_id) || null,
      event_timestamp: normalizeIsoTimestamp(row.event_timestamp) || null,
      event_type: normalizeString(row.event_type),
      action: normalizeString(row.action) || null,
      actor: normalizeString(row.actor) || null,
      actor_role: normalizeString(row.actor_role) || null,
      from_status: normalizeString(row.from_status) || null,
      to_status: normalizeString(row.to_status) || null,
      blocked: normalizeBooleanValue(row.blocked, false),
      reason: normalizeString(row.reason) || null,
      audit_file: normalizeString(row.audit_file) || null,
      line_no: normalizeNonNegativeInteger(row.line_no, 0),
      raw: parseJsonSafe(row.raw_json, null),
      source: normalizeString(row.source) || null,
      indexed_at: normalizeIsoTimestamp(row.indexed_at) || null
    };
  }

  _mapTimelineSnapshotRow(row) {
    if (!row) {
      return null;
    }
    return {
      snapshot_id: normalizeString(row.snapshot_id),
      created_at: normalizeIsoTimestamp(row.created_at) || null,
      trigger: normalizeString(row.trigger) || null,
      event: normalizeString(row.event) || null,
      summary: normalizeString(row.summary) || null,
      scene_id: normalizeString(row.scene_id) || null,
      session_id: normalizeString(row.session_id) || null,
      command: normalizeString(row.command) || null,
      file_count: normalizeNonNegativeInteger(row.file_count, 0),
      total_bytes: normalizeNonNegativeInteger(row.total_bytes, 0),
      snapshot_path: normalizeString(row.snapshot_path) || null,
      git: parseJsonSafe(row.git_json, {}) || {},
      source: normalizeString(row.source) || null,
      updated_at: normalizeIsoTimestamp(row.updated_at) || null
    };
  }

  _mapSceneSessionCycleRow(row) {
    if (!row) {
      return null;
    }
    return {
      scene_id: normalizeString(row.scene_id),
      cycle: normalizeNonNegativeInteger(row.cycle, 0),
      session_id: normalizeString(row.session_id),
      status: normalizeString(row.status) || null,
      started_at: normalizeIsoTimestamp(row.started_at) || null,
      completed_at: normalizeIsoTimestamp(row.completed_at) || null,
      source: normalizeString(row.source) || null,
      updated_at: normalizeIsoTimestamp(row.updated_at) || null
    };
  }

  _mapAgentRuntimeRow(row) {
    if (!row) {
      return null;
    }
    return {
      agent_id: normalizeString(row.agent_id),
      machine_id: normalizeString(row.machine_id) || null,
      instance_index: normalizeNonNegativeInteger(row.instance_index, 0),
      hostname: normalizeString(row.hostname) || null,
      registered_at: normalizeIsoTimestamp(row.registered_at) || null,
      last_heartbeat: normalizeIsoTimestamp(row.last_heartbeat) || null,
      status: normalizeString(row.status) || null,
      current_task: parseJsonSafe(row.current_task_json, null),
      source: normalizeString(row.source) || null,
      updated_at: normalizeIsoTimestamp(row.updated_at) || null
    };
  }

  _mapStateMigrationRow(row) {
    if (!row) {
      return null;
    }
    return {
      migration_id: normalizeString(row.migration_id),
      component_id: normalizeString(row.component_id),
      source_path: normalizeString(row.source_path) || null,
      mode: normalizeString(row.mode) || null,
      status: normalizeString(row.status) || null,
      metrics: parseJsonSafe(row.metrics_json, {}) || {},
      detail: parseJsonSafe(row.detail_json, {}) || {},
      started_at: normalizeIsoTimestamp(row.started_at) || null,
      completed_at: normalizeIsoTimestamp(row.completed_at) || null,
      updated_at: normalizeIsoTimestamp(row.updated_at) || null
    };
  }

  _mapErrorbookEntryIndexRow(row) {
    if (!row) {
      return null;
    }
    return {
      entry_id: normalizeString(row.entry_id),
      fingerprint: normalizeString(row.fingerprint) || null,
      title: normalizeString(row.title) || null,
      status: normalizeString(row.status) || null,
      quality_score: normalizeNonNegativeInteger(row.quality_score, 0),
      tags: normalizeStringArray(parseJsonSafe(row.tags_json, []), []),
      ontology_tags: normalizeStringArray(parseJsonSafe(row.ontology_tags_json, []), []),
      temporary_mitigation_active: Number(row.temporary_mitigation_active) === 1,
      temporary_mitigation_deadline_at: normalizeIsoTimestamp(row.temporary_mitigation_deadline_at, '') || null,
      occurrences: normalizeNonNegativeInteger(row.occurrences, 0),
      created_at: normalizeIsoTimestamp(row.created_at, '') || null,
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null,
      source: normalizeString(row.source) || null,
      indexed_at: normalizeIsoTimestamp(row.indexed_at, '') || null
    };
  }

  _mapErrorbookIncidentIndexRow(row) {
    if (!row) {
      return null;
    }
    return {
      incident_id: normalizeString(row.incident_id),
      fingerprint: normalizeString(row.fingerprint) || null,
      title: normalizeString(row.title) || null,
      symptom: normalizeString(row.symptom) || null,
      state: normalizeString(row.state) || null,
      attempt_count: normalizeNonNegativeInteger(row.attempt_count, 0),
      created_at: normalizeIsoTimestamp(row.created_at, '') || null,
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null,
      last_attempt_at: normalizeIsoTimestamp(row.last_attempt_at, '') || null,
      resolved_at: normalizeIsoTimestamp(row.resolved_at, '') || null,
      linked_entry_id: normalizeString(row.linked_entry_id) || null,
      source: normalizeString(row.source) || null,
      indexed_at: normalizeIsoTimestamp(row.indexed_at, '') || null
    };
  }

  _mapGovernanceSpecSceneOverrideRow(row) {
    if (!row) {
      return null;
    }
    return {
      spec_id: normalizeString(row.spec_id),
      scene_id: normalizeString(row.scene_id),
      source: normalizeString(row.source) || null,
      rule_id: normalizeString(row.rule_id) || null,
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null,
      indexed_at: normalizeIsoTimestamp(row.indexed_at, '') || null
    };
  }

  _mapGovernanceSceneIndexRow(row) {
    if (!row) {
      return null;
    }
    return {
      scene_id: normalizeString(row.scene_id),
      total_specs: normalizeNonNegativeInteger(row.total_specs, 0),
      active_specs: normalizeNonNegativeInteger(row.active_specs, 0),
      completed_specs: normalizeNonNegativeInteger(row.completed_specs, 0),
      stale_specs: normalizeNonNegativeInteger(row.stale_specs, 0),
      spec_ids: normalizeStringArray(parseJsonSafe(row.spec_ids_json, []), []),
      active_spec_ids: normalizeStringArray(parseJsonSafe(row.active_spec_ids_json, []), []),
      stale_spec_ids: normalizeStringArray(parseJsonSafe(row.stale_spec_ids_json, []), []),
      generated_at: normalizeIsoTimestamp(row.generated_at, '') || null,
      scene_filter: normalizeString(row.scene_filter) || null,
      source: normalizeString(row.source) || null,
      indexed_at: normalizeIsoTimestamp(row.indexed_at, '') || null
    };
  }

  _mapReleaseEvidenceRunRow(row) {
    if (!row) {
      return null;
    }
    return {
      session_id: normalizeString(row.session_id),
      merged_at: normalizeIsoTimestamp(row.merged_at, '') || null,
      status: normalizeString(row.status) || null,
      gate_passed: normalizeBooleanValue(row.gate_passed, false),
      spec_success_rate_percent: Number.isFinite(Number(row.spec_success_rate_percent))
        ? Number(row.spec_success_rate_percent)
        : null,
      risk_level: normalizeString(row.risk_level) || null,
      ontology_quality_score: Number.isFinite(Number(row.ontology_quality_score))
        ? Number(row.ontology_quality_score)
        : null,
      capability_coverage_percent: Number.isFinite(Number(row.capability_coverage_percent))
        ? Number(row.capability_coverage_percent)
        : null,
      capability_coverage_passed: normalizeBooleanValue(row.capability_coverage_passed, false),
      scene_package_batch_passed: normalizeBooleanValue(row.scene_package_batch_passed, false),
      scene_package_batch_failure_count: normalizeNonNegativeInteger(row.scene_package_batch_failure_count, 0),
      failed_goals: normalizeNonNegativeInteger(row.failed_goals, 0),
      release_gate_preflight_available: normalizeBooleanValue(row.release_gate_preflight_available, false),
      release_gate_preflight_blocked: normalizeBooleanValue(row.release_gate_preflight_blocked, false),
      source_updated_at: normalizeIsoTimestamp(row.source_updated_at, '') || null,
      source: normalizeString(row.source) || null,
      indexed_at: normalizeIsoTimestamp(row.indexed_at, '') || null
    };
  }

  _mapReleaseGateHistoryRow(row) {
    if (!row) {
      return null;
    }
    return {
      tag: normalizeString(row.tag),
      evaluated_at: normalizeIsoTimestamp(row.evaluated_at, '') || null,
      gate_passed: normalizeBooleanValue(row.gate_passed, false),
      enforce: normalizeBooleanValue(row.enforce, false),
      risk_level: normalizeString(row.risk_level) || null,
      spec_success_rate_percent: Number.isFinite(Number(row.spec_success_rate_percent))
        ? Number(row.spec_success_rate_percent)
        : null,
      scene_package_batch_passed: normalizeBooleanValue(row.scene_package_batch_passed, false),
      scene_package_batch_failure_count: normalizeNonNegativeInteger(row.scene_package_batch_failure_count, 0),
      capability_expected_unknown_count: normalizeNonNegativeInteger(row.capability_expected_unknown_count, 0),
      capability_provided_unknown_count: normalizeNonNegativeInteger(row.capability_provided_unknown_count, 0),
      release_gate_preflight_available: normalizeBooleanValue(row.release_gate_preflight_available, false),
      release_gate_preflight_blocked: normalizeBooleanValue(row.release_gate_preflight_blocked, false),
      require_release_gate_preflight: normalizeBooleanValue(row.require_release_gate_preflight, false),
      drift_alert_count: normalizeNonNegativeInteger(row.drift_alert_count, 0),
      drift_blocked: normalizeBooleanValue(row.drift_blocked, false),
      weekly_ops_blocked: normalizeBooleanValue(row.weekly_ops_blocked, false),
      source_updated_at: normalizeIsoTimestamp(row.source_updated_at, '') || null,
      source: normalizeString(row.source) || null,
      indexed_at: normalizeIsoTimestamp(row.indexed_at, '') || null
    };
  }

  _mapAppBundleRow(row) {
    if (!row) {
      return null;
    }
    return {
      app_id: normalizeString(row.app_id),
      app_key: normalizeString(row.app_key),
      app_name: normalizeString(row.app_name),
      app_slug: normalizeString(row.app_slug) || null,
      workspace_id: normalizeString(row.workspace_id) || null,
      runtime_release_id: normalizeString(row.runtime_release_id) || null,
      ontology_bundle_id: normalizeString(row.ontology_bundle_id) || null,
      engineering_project_id: normalizeString(row.engineering_project_id) || null,
      default_scene_id: normalizeString(row.default_scene_id) || null,
      environment: normalizeString(row.environment) || null,
      status: normalizeString(row.status) || null,
      source_origin: normalizeString(row.source_origin) || null,
      tags: normalizeStringArray(parseJsonSafe(row.tags_json, []), []),
      metadata: parseJsonSafe(row.metadata_json, {}) || {},
      created_at: normalizeIsoTimestamp(row.created_at, '') || null,
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null
    };
  }

  _mapRuntimeReleaseRow(row) {
    if (!row) {
      return null;
    }
    return {
      release_id: normalizeString(row.release_id),
      app_id: normalizeString(row.app_id),
      runtime_version: normalizeString(row.runtime_version),
      release_channel: normalizeString(row.release_channel) || null,
      release_status: normalizeString(row.release_status) || null,
      entrypoint: normalizeString(row.entrypoint) || null,
      runtime_status: normalizeString(row.runtime_status) || null,
      release_notes_file: normalizeString(row.release_notes_file) || null,
      release_evidence_file: normalizeString(row.release_evidence_file) || null,
      published_at: normalizeIsoTimestamp(row.published_at, '') || null,
      source_updated_at: normalizeIsoTimestamp(row.source_updated_at, '') || null,
      metadata: parseJsonSafe(row.metadata_json, {}) || {},
      created_at: normalizeIsoTimestamp(row.created_at, '') || null,
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null
    };
  }

  _mapRuntimeInstallationRow(row) {
    if (!row) {
      return null;
    }
    return {
      installation_id: normalizeString(row.installation_id),
      app_id: normalizeString(row.app_id),
      release_id: normalizeString(row.release_id) || null,
      machine_id: normalizeString(row.machine_id) || null,
      install_root: normalizeString(row.install_root) || null,
      install_status: normalizeString(row.install_status) || null,
      installed_at: normalizeIsoTimestamp(row.installed_at, '') || null,
      last_opened_at: normalizeIsoTimestamp(row.last_opened_at, '') || null,
      current_environment: normalizeString(row.current_environment) || null,
      metadata: parseJsonSafe(row.metadata_json, {}) || {},
      created_at: normalizeIsoTimestamp(row.created_at, '') || null,
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null
    };
  }

  _mapOntologyBundleRow(row) {
    if (!row) {
      return null;
    }
    return {
      ontology_bundle_id: normalizeString(row.ontology_bundle_id),
      app_id: normalizeString(row.app_id),
      ontology_version: normalizeString(row.ontology_version) || null,
      template_version: normalizeString(row.template_version) || null,
      capability_catalog_version: normalizeString(row.capability_catalog_version) || null,
      triad_revision: normalizeString(row.triad_revision) || null,
      triad_status: normalizeString(row.triad_status) || null,
      publish_readiness: normalizeString(row.publish_readiness) || null,
      template_source: normalizeString(row.template_source) || null,
      capability_set: parseJsonSafe(row.capability_set_json, []) || [],
      summary: parseJsonSafe(row.summary_json, {}) || {},
      metadata: parseJsonSafe(row.metadata_json, {}) || {},
      created_at: normalizeIsoTimestamp(row.created_at, '') || null,
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null
    };
  }

  _mapEngineeringProjectRow(row) {
    if (!row) {
      return null;
    }
    return {
      engineering_project_id: normalizeString(row.engineering_project_id),
      app_id: normalizeString(row.app_id),
      project_key: normalizeString(row.project_key) || null,
      project_name: normalizeString(row.project_name) || null,
      repo_url: normalizeString(row.repo_url) || null,
      repo_provider: normalizeString(row.repo_provider) || null,
      default_branch: normalizeString(row.default_branch) || null,
      current_branch: normalizeString(row.current_branch) || null,
      commit_sha: normalizeString(row.commit_sha) || null,
      workspace_path: normalizeString(row.workspace_path) || null,
      code_version: normalizeString(row.code_version) || null,
      synced_runtime_release_id: normalizeString(row.synced_runtime_release_id) || null,
      dirty_state: normalizeBooleanValue(row.dirty_state, false),
      auth_policy: parseJsonSafe(row.auth_policy_json, {}) || {},
      metadata: parseJsonSafe(row.metadata_json, {}) || {},
      created_at: normalizeIsoTimestamp(row.created_at, '') || null,
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null
    };
  }

  _mapAppBundleSceneBindingRow(row) {
    if (!row) {
      return null;
    }
    return {
      app_id: normalizeString(row.app_id),
      scene_id: normalizeString(row.scene_id),
      binding_role: normalizeString(row.binding_role),
      source: normalizeString(row.source) || null,
      metadata: parseJsonSafe(row.metadata_json, {}) || {},
      created_at: normalizeIsoTimestamp(row.created_at, '') || null,
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null
    };
  }

  _mapAppBundleProjectionCacheRow(row) {
    if (!row) {
      return null;
    }
    return {
      app_id: normalizeString(row.app_id),
      projection_mode: normalizeString(row.projection_mode),
      payload: parseJsonSafe(row.payload_json, {}) || {},
      generated_at: normalizeIsoTimestamp(row.generated_at, '') || null,
      source_updated_at: normalizeIsoTimestamp(row.source_updated_at, '') || null
    };
  }

  _mapPmRequirementRow(row) {
    if (!row) {
      return null;
    }
    return {
      requirement_id: normalizeString(row.requirement_id),
      title: normalizeString(row.title),
      source_request: normalizeString(row.source_request),
      status: normalizeString(row.status) || null,
      priority: normalizeString(row.priority) || null,
      owner: normalizeString(row.owner) || null,
      scene_ref: normalizeString(row.scene_ref) || null,
      spec_ref: normalizeString(row.spec_ref) || null,
      tracking_stage: normalizeString(row.tracking_stage) || null,
      plan_ref: normalizeString(row.plan_ref) || null,
      acceptance_summary: normalizeString(row.acceptance_summary) || null,
      acceptance_details: parseJsonSafe(row.acceptance_details_json, []) || [],
      domain_tags: normalizeStringArray(parseJsonSafe(row.domain_tags_json, []), []),
      risk_level: normalizeString(row.risk_level) || null,
      change_count: normalizeNonNegativeInteger(row.change_count, 0),
      issue_count: normalizeNonNegativeInteger(row.issue_count, 0),
      created_at: normalizeIsoTimestamp(row.created_at, '') || null,
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null,
      created_by: normalizeString(row.created_by) || null,
      updated_by: normalizeString(row.updated_by) || null
    };
  }

  _mapPmTrackingRow(row) {
    if (!row) {
      return null;
    }
    return {
      tracking_id: normalizeString(row.tracking_id),
      requirement_id: normalizeString(row.requirement_id),
      current_stage: normalizeString(row.current_stage) || null,
      status: normalizeString(row.status) || null,
      owner: normalizeString(row.owner) || null,
      latest_action: normalizeString(row.latest_action) || null,
      blocking_summary: normalizeString(row.blocking_summary) || null,
      next_action: normalizeString(row.next_action) || null,
      risk_level: normalizeString(row.risk_level) || null,
      plan_ref: normalizeString(row.plan_ref) || null,
      issue_count: normalizeNonNegativeInteger(row.issue_count, 0),
      change_count: normalizeNonNegativeInteger(row.change_count, 0),
      eta: normalizeString(row.eta) || null,
      scene_ref: normalizeString(row.scene_ref) || null,
      spec_ref: normalizeString(row.spec_ref) || null,
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null,
      updated_by: normalizeString(row.updated_by) || null
    };
  }

  _mapPmPlanRow(row) {
    if (!row) {
      return null;
    }
    return {
      plan_id: normalizeString(row.plan_id),
      title: normalizeString(row.title),
      scope: normalizeString(row.scope),
      status: normalizeString(row.status) || null,
      owner: normalizeString(row.owner) || null,
      start_date: normalizeString(row.start_date) || null,
      due_date: normalizeString(row.due_date) || null,
      milestone: normalizeString(row.milestone) || null,
      risk_level: normalizeString(row.risk_level) || null,
      change_count: normalizeNonNegativeInteger(row.change_count, 0),
      issue_count: normalizeNonNegativeInteger(row.issue_count, 0),
      progress_summary: normalizeString(row.progress_summary) || null,
      next_checkpoint: normalizeString(row.next_checkpoint) || null,
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null,
      updated_by: normalizeString(row.updated_by) || null
    };
  }

  _mapPmChangeRow(row) {
    if (!row) {
      return null;
    }
    return {
      change_id: normalizeString(row.change_id),
      title: normalizeString(row.title),
      change_type: normalizeString(row.change_type) || null,
      impact_scope: normalizeString(row.impact_scope) || null,
      status: normalizeString(row.status) || null,
      source: normalizeString(row.source) || null,
      owner: normalizeString(row.owner) || null,
      decision: normalizeString(row.decision) || null,
      decision_reason: normalizeString(row.decision_reason) || null,
      risk_level: normalizeString(row.risk_level) || null,
      affected_modules: normalizeStringArray(parseJsonSafe(row.affected_modules_json, []), []),
      affected_entities: normalizeStringArray(parseJsonSafe(row.affected_entities_json, []), []),
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null,
      updated_by: normalizeString(row.updated_by) || null
    };
  }

  _mapPmIssueRow(row) {
    if (!row) {
      return null;
    }
    return {
      issue_id: normalizeString(row.issue_id),
      title: normalizeString(row.title),
      source: normalizeString(row.source) || null,
      severity: normalizeString(row.severity) || null,
      status: normalizeString(row.status) || null,
      requirement_id: normalizeString(row.requirement_id) || null,
      tracking_id: normalizeString(row.tracking_id) || null,
      owner: normalizeString(row.owner) || null,
      latest_action: normalizeString(row.latest_action) || null,
      expected_result: normalizeString(row.expected_result) || null,
      actual_result: normalizeString(row.actual_result) || null,
      fix_summary: normalizeString(row.fix_summary) || null,
      verify_result: normalizeString(row.verify_result) || null,
      root_cause: normalizeString(row.root_cause) || null,
      reported_by: normalizeString(row.reported_by) || null,
      updated_by: normalizeString(row.updated_by) || null,
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null
    };
  }

  _mapOntologyErAssetRow(row) {
    if (!row) {
      return null;
    }
    return {
      entity_id: normalizeString(row.entity_id),
      name: normalizeString(row.name),
      display_name: normalizeString(row.display_name) || null,
      description: normalizeString(row.description),
      status: normalizeString(row.status) || null,
      key_fields: normalizeStringArray(parseJsonSafe(row.key_fields_json, []), []),
      attributes: parseJsonSafe(row.attributes_json, []) || [],
      relations: parseJsonSafe(row.relations_json, []) || [],
      domain_scope: normalizeString(row.domain_scope) || null,
      owner: normalizeString(row.owner) || null,
      source_refs: normalizeStringArray(parseJsonSafe(row.source_refs_json, []), []),
      rule_refs: normalizeStringArray(parseJsonSafe(row.rule_refs_json, []), []),
      decision_refs: normalizeStringArray(parseJsonSafe(row.decision_refs_json, []), []),
      risk_level: normalizeString(row.risk_level) || null,
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null,
      updated_by: normalizeString(row.updated_by) || null
    };
  }

  _mapOntologyBrRuleRow(row) {
    if (!row) {
      return null;
    }
    return {
      rule_id: normalizeString(row.rule_id),
      title: normalizeString(row.title),
      scope: normalizeString(row.scope),
      rule_type: normalizeString(row.rule_type) || null,
      condition: normalizeString(row.condition),
      consequence: normalizeString(row.consequence),
      severity: normalizeString(row.severity) || null,
      status: normalizeString(row.status) || null,
      owner: normalizeString(row.owner) || null,
      entity_refs: normalizeStringArray(parseJsonSafe(row.entity_refs_json, []), []),
      decision_refs: normalizeStringArray(parseJsonSafe(row.decision_refs_json, []), []),
      evidence_refs: normalizeStringArray(parseJsonSafe(row.evidence_refs_json, []), []),
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null,
      updated_by: normalizeString(row.updated_by) || null
    };
  }

  _mapOntologyDlChainRow(row) {
    if (!row) {
      return null;
    }
    return {
      chain_id: normalizeString(row.chain_id),
      title: normalizeString(row.title),
      description: normalizeString(row.description) || null,
      trigger: normalizeString(row.trigger),
      decision_nodes: parseJsonSafe(row.decision_nodes_json, []) || [],
      outputs: parseJsonSafe(row.outputs_json, []) || [],
      status: normalizeString(row.status) || null,
      entity_refs: normalizeStringArray(parseJsonSafe(row.entity_refs_json, []), []),
      rule_refs: normalizeStringArray(parseJsonSafe(row.rule_refs_json, []), []),
      owner: normalizeString(row.owner) || null,
      input_schema_ref: normalizeString(row.input_schema_ref) || null,
      output_schema_ref: normalizeString(row.output_schema_ref) || null,
      risk_level: normalizeString(row.risk_level) || null,
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null,
      updated_by: normalizeString(row.updated_by) || null
    };
  }

  _mapAssuranceResourceSnapshotRow(row) {
    if (!row) {
      return null;
    }
    return {
      snapshot_id: normalizeString(row.snapshot_id),
      scope: normalizeString(row.scope) || null,
      status: normalizeString(row.status) || null,
      resource_type: normalizeString(row.resource_type) || null,
      resource_name: normalizeString(row.resource_name),
      summary: normalizeString(row.summary) || null,
      metric: parseJsonSafe(row.metric_json, {}) || {},
      source: normalizeString(row.source) || null,
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null,
      updated_by: normalizeString(row.updated_by) || null
    };
  }

  _mapAssuranceLogViewRow(row) {
    if (!row) {
      return null;
    }
    return {
      view_id: normalizeString(row.view_id),
      title: normalizeString(row.title),
      source: normalizeString(row.source) || null,
      status: normalizeString(row.status) || null,
      summary: normalizeString(row.summary) || null,
      path_ref: normalizeString(row.path_ref) || null,
      filter: parseJsonSafe(row.filter_json, {}) || {},
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null,
      updated_by: normalizeString(row.updated_by) || null
    };
  }

  _mapAssuranceBackupRecordRow(row) {
    if (!row) {
      return null;
    }
    return {
      backup_id: normalizeString(row.backup_id),
      title: normalizeString(row.title),
      backup_type: normalizeString(row.backup_type) || null,
      scope: normalizeString(row.scope) || null,
      status: normalizeString(row.status) || null,
      summary: normalizeString(row.summary) || null,
      storage_ref: normalizeString(row.storage_ref) || null,
      recoverable: normalizeBooleanValue(row.recoverable, false),
      generated_at: normalizeString(row.generated_at) || null,
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null,
      updated_by: normalizeString(row.updated_by) || null
    };
  }

  _mapAssuranceConfigSwitchRow(row) {
    if (!row) {
      return null;
    }
    return {
      switch_id: normalizeString(row.switch_id),
      title: normalizeString(row.title),
      scope: normalizeString(row.scope) || null,
      switch_key: normalizeString(row.switch_key),
      desired_state: normalizeString(row.desired_state) || null,
      actual_state: normalizeString(row.actual_state) || null,
      status: normalizeString(row.status) || null,
      summary: normalizeString(row.summary) || null,
      owner: normalizeString(row.owner) || null,
      updated_at: normalizeIsoTimestamp(row.updated_at, '') || null,
      updated_by: normalizeString(row.updated_by) || null
    };
  }

  async resolveOrCreateTaskRef(options = {}) {
    const sceneId = normalizeString(options.sceneId);
    const specId = normalizeString(options.specId);
    const taskKey = normalizeString(options.taskKey);
    if (!sceneId || !specId || !taskKey) {
      throw new Error('sceneId/specId/taskKey are required for sqlite task ref assignment');
    }

    const source = normalizeString(options.source) || 'unknown';
    const metadata = options.metadata && typeof options.metadata === 'object'
      ? options.metadata
      : {};

    if (this._useMemoryBackend()) {
      return this._resolveOrCreateTaskRefInMemory({
        sceneId,
        specId,
        taskKey,
        source,
        metadata
      });
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const result = this._withTransaction(() => {
      const existing = this._db
        .prepare(`
          SELECT t.task_ref, t.scene_id, t.spec_id, t.task_key, t.task_no, t.source, t.metadata_json,
                 s.scene_no, p.spec_no
          FROM task_ref_registry t
          INNER JOIN scene_registry s ON s.scene_id = t.scene_id
          INNER JOIN spec_registry p ON p.scene_id = t.scene_id AND p.spec_id = t.spec_id
          WHERE t.scene_id = ? AND t.spec_id = ? AND t.task_key = ?
        `)
        .get(sceneId, specId, taskKey);

      if (existing) {
        const nowIso = this.now();
        const mergedMetadata = {
          ...(parseJsonSafe(existing.metadata_json, {}) || {}),
          ...metadata
        };
        this._db
          .prepare('UPDATE task_ref_registry SET source = ?, metadata_json = ?, updated_at = ? WHERE task_ref = ?')
          .run(source, JSON.stringify(mergedMetadata), nowIso, existing.task_ref);

        return this._db
          .prepare(`
            SELECT t.task_ref, t.scene_id, t.spec_id, t.task_key, t.task_no, t.source, t.metadata_json,
                   s.scene_no, p.spec_no
            FROM task_ref_registry t
            INNER JOIN scene_registry s ON s.scene_id = t.scene_id
            INNER JOIN spec_registry p ON p.scene_id = t.scene_id AND p.spec_id = t.spec_id
            WHERE t.task_ref = ?
          `)
          .get(existing.task_ref);
      }

      const nowIso = this.now();
      const sceneNo = this._ensureSceneRow(sceneId, nowIso);
      const specNo = this._ensureSpecRow(sceneId, specId, nowIso);

      const nextTask = this._db
        .prepare('SELECT COALESCE(MAX(task_no), 0) + 1 AS next_no FROM task_ref_registry WHERE scene_id = ? AND spec_id = ?')
        .get(sceneId, specId);
      const taskNo = normalizeInteger(nextTask && nextTask.next_no, 1);
      const taskRef = buildTaskRef(sceneNo, specNo, taskNo);

      this._db
        .prepare(`
          INSERT INTO task_ref_registry(task_ref, scene_id, spec_id, task_key, task_no, source, metadata_json, created_at, updated_at)
          VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(taskRef, sceneId, specId, taskKey, taskNo, source, JSON.stringify(metadata), nowIso, nowIso);

      return this._db
        .prepare(`
          SELECT t.task_ref, t.scene_id, t.spec_id, t.task_key, t.task_no, t.source, t.metadata_json,
                 s.scene_no, p.spec_no
          FROM task_ref_registry t
          INNER JOIN scene_registry s ON s.scene_id = t.scene_id
          INNER JOIN spec_registry p ON p.scene_id = t.scene_id AND p.spec_id = t.spec_id
          WHERE t.task_ref = ?
        `)
        .get(taskRef);
    });

    return this._mapTaskRefRow(result);
  }

  async lookupTaskRef(taskRef) {
    const normalizedTaskRef = normalizeString(taskRef);
    if (!normalizedTaskRef) {
      return null;
    }

    if (this._useMemoryBackend()) {
      const row = this._memory.refs[normalizedTaskRef];
      return row ? { ...row, metadata: { ...(row.metadata || {}) } } : null;
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const row = this._db
      .prepare(`
        SELECT t.task_ref, t.scene_id, t.spec_id, t.task_key, t.task_no, t.source, t.metadata_json,
               s.scene_no, p.spec_no
        FROM task_ref_registry t
        INNER JOIN scene_registry s ON s.scene_id = t.scene_id
        INNER JOIN spec_registry p ON p.scene_id = t.scene_id AND p.spec_id = t.spec_id
        WHERE t.task_ref = ?
      `)
      .get(normalizedTaskRef);

    return this._mapTaskRefRow(row);
  }

  async lookupTaskTuple(options = {}) {
    const sceneId = normalizeString(options.sceneId);
    const specId = normalizeString(options.specId);
    const taskKey = normalizeString(options.taskKey);
    if (!sceneId || !specId || !taskKey) {
      return null;
    }

    if (this._useMemoryBackend()) {
      const tupleKey = `${sceneId}::${specId}::${taskKey}`;
      const row = this._memory.tasks[tupleKey];
      return row ? { ...row, metadata: { ...(row.metadata || {}) } } : null;
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const row = this._db
      .prepare(`
        SELECT t.task_ref, t.scene_id, t.spec_id, t.task_key, t.task_no, t.source, t.metadata_json,
               s.scene_no, p.spec_no
        FROM task_ref_registry t
        INNER JOIN scene_registry s ON s.scene_id = t.scene_id
        INNER JOIN spec_registry p ON p.scene_id = t.scene_id AND p.spec_id = t.spec_id
        WHERE t.scene_id = ? AND t.spec_id = ? AND t.task_key = ?
      `)
      .get(sceneId, specId, taskKey);

    return this._mapTaskRefRow(row);
  }

  async appendStudioEvent(event = {}) {
    const eventId = normalizeString(event.event_id);
    const jobId = normalizeString(event.job_id);
    const eventType = normalizeString(event.event_type);
    const timestamp = normalizeString(event.timestamp) || this.now();
    if (!eventId || !jobId || !eventType) {
      return false;
    }

    if (this._useMemoryBackend()) {
      if (!this._memory.events_by_job[jobId]) {
        this._memory.events_by_job[jobId] = [];
      }
      const existingIndex = this._memory.events_by_job[jobId]
        .findIndex((item) => normalizeString(item.event_id) === eventId);
      const normalized = {
        ...event,
        event_id: eventId,
        job_id: jobId,
        event_type: eventType,
        timestamp: timestamp
      };
      if (existingIndex >= 0) {
        this._memory.events_by_job[jobId][existingIndex] = normalized;
      } else {
        this._memory.events_by_job[jobId].push(normalized);
      }
      this._memory.events_by_job[jobId].sort((left, right) => {
        const l = Date.parse(left.timestamp || '') || 0;
        const r = Date.parse(right.timestamp || '') || 0;
        return l - r;
      });
      return true;
    }

    if (!await this.ensureReady()) {
      return false;
    }

    const sceneId = normalizeString(event.scene_id) || null;
    const specId = normalizeString(event.spec_id) || null;
    const rawJson = JSON.stringify(event);

    this._db
      .prepare(`
        INSERT OR REPLACE INTO studio_event_stream(event_id, job_id, event_type, event_timestamp, scene_id, spec_id, created_at, raw_json)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(eventId, jobId, eventType, timestamp, sceneId, specId, this.now(), rawJson);

    return true;
  }

  async listStudioEvents(jobId, options = {}) {
    const normalizedJobId = normalizeString(jobId);
    if (!normalizedJobId) {
      return [];
    }

    if (this._useMemoryBackend()) {
      const events = Array.isArray(this._memory.events_by_job[normalizedJobId])
        ? [...this._memory.events_by_job[normalizedJobId]]
        : [];
      const limit = normalizeInteger(options.limit, 50);
      if (limit <= 0) {
        return events;
      }
      return events.slice(-limit);
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const limit = normalizeInteger(options.limit, 50);
    const query = limit > 0
      ? 'SELECT raw_json FROM studio_event_stream WHERE job_id = ? ORDER BY event_timestamp DESC LIMIT ?'
      : 'SELECT raw_json FROM studio_event_stream WHERE job_id = ? ORDER BY event_timestamp DESC';

    const statement = this._db.prepare(query);
    const rows = limit > 0
      ? statement.all(normalizedJobId, limit)
      : statement.all(normalizedJobId);

    const events = rows
      .map((row) => parseJsonSafe(row.raw_json, null))
      .filter(Boolean)
      .reverse();

    return events;
  }

  async issueAuthLease(options = {}) {
    const subject = normalizeString(options.subject) || 'unknown';
    const role = normalizeString(options.role) || 'maintainer';
    const scope = normalizeStringArray(options.scope, ['project:*']);
    const reason = normalizeString(options.reason) || null;
    const metadata = options.metadata && typeof options.metadata === 'object'
      ? options.metadata
      : {};
    const issuedAt = normalizeIsoTimestamp(options.issued_at || options.issuedAt, this.now()) || this.now();
    const ttlMinutes = normalizeInteger(options.ttl_minutes || options.ttlMinutes, 15);
    const fallbackExpiresAt = new Date(
      (Date.parse(issuedAt) || Date.now()) + (Math.max(ttlMinutes, 1) * 60 * 1000)
    ).toISOString();
    const expiresAt = normalizeIsoTimestamp(options.expires_at || options.expiresAt, fallbackExpiresAt) || fallbackExpiresAt;
    const leaseId = normalizeString(options.lease_id || options.leaseId)
      || `lease-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const nowIso = this.now();

    if (this._useMemoryBackend()) {
      return this._issueAuthLeaseInMemory({
        leaseId,
        subject,
        role,
        scope,
        reason,
        metadata,
        issuedAt,
        expiresAt,
        nowIso
      });
    }

    if (!await this.ensureReady()) {
      return null;
    }

    this._db
      .prepare(`
        INSERT OR REPLACE INTO auth_lease_registry(
          lease_id, subject, role, scope_json, reason, metadata_json, issued_at, expires_at, revoked_at, created_at, updated_at
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `)
      .run(
        leaseId,
        subject,
        role,
        JSON.stringify(scope),
        reason,
        JSON.stringify(metadata),
        issuedAt,
        expiresAt,
        nowIso,
        nowIso
      );

    return this.getAuthLease(leaseId);
  }

  async getAuthLease(leaseId) {
    const normalizedLeaseId = normalizeString(leaseId);
    if (!normalizedLeaseId) {
      return null;
    }

    if (this._useMemoryBackend()) {
      const row = this._memory.auth_leases[normalizedLeaseId];
      return row
        ? {
          ...row,
          scope: normalizeStringArray(row.scope, ['project:*']),
          metadata: { ...(row.metadata || {}) }
        }
        : null;
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const row = this._db
      .prepare(`
        SELECT lease_id, subject, role, scope_json, reason, metadata_json, issued_at, expires_at, revoked_at, created_at, updated_at
        FROM auth_lease_registry
        WHERE lease_id = ?
      `)
      .get(normalizedLeaseId);
    return this._mapAuthLeaseRow(row);
  }

  async listAuthLeases(options = {}) {
    const activeOnly = options.activeOnly !== false;
    const limit = normalizeInteger(options.limit, 20);
    const nowIso = this.now();

    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.auth_leases || {}).map((item) => ({
        ...item,
        scope: normalizeStringArray(item.scope, ['project:*']),
        metadata: { ...(item.metadata || {}) }
      }));
      if (activeOnly) {
        const nowTime = Date.parse(nowIso) || Date.now();
        rows = rows.filter((item) => {
          const revokedAt = normalizeString(item.revoked_at);
          if (revokedAt) {
            return false;
          }
          const expiresAt = Date.parse(item.expires_at || '') || 0;
          return expiresAt > nowTime;
        });
      }
      rows.sort((left, right) => (Date.parse(right.created_at || '') || 0) - (Date.parse(left.created_at || '') || 0));
      return limit > 0 ? rows.slice(0, limit) : rows;
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const query = activeOnly
      ? `
        SELECT lease_id, subject, role, scope_json, reason, metadata_json, issued_at, expires_at, revoked_at, created_at, updated_at
        FROM auth_lease_registry
        WHERE revoked_at IS NULL AND expires_at > ?
        ORDER BY created_at DESC
        LIMIT ?
      `
      : `
        SELECT lease_id, subject, role, scope_json, reason, metadata_json, issued_at, expires_at, revoked_at, created_at, updated_at
        FROM auth_lease_registry
        ORDER BY created_at DESC
        LIMIT ?
      `;

    const statement = this._db.prepare(query);
    const rows = activeOnly
      ? statement.all(nowIso, limit)
      : statement.all(limit);
    return rows
      .map((row) => this._mapAuthLeaseRow(row))
      .filter(Boolean);
  }

  async revokeAuthLease(leaseId, options = {}) {
    const normalizedLeaseId = normalizeString(leaseId);
    if (!normalizedLeaseId) {
      return null;
    }
    const revokedAt = normalizeIsoTimestamp(options.revoked_at || options.revokedAt, this.now()) || this.now();

    if (this._useMemoryBackend()) {
      const existing = this._memory.auth_leases[normalizedLeaseId];
      if (!existing) {
        return null;
      }
      existing.revoked_at = revokedAt;
      existing.updated_at = revokedAt;
      this._memory.auth_leases[normalizedLeaseId] = existing;
      return {
        ...existing,
        scope: normalizeStringArray(existing.scope, ['project:*']),
        metadata: { ...(existing.metadata || {}) }
      };
    }

    if (!await this.ensureReady()) {
      return null;
    }

    this._db
      .prepare('UPDATE auth_lease_registry SET revoked_at = ?, updated_at = ? WHERE lease_id = ?')
      .run(revokedAt, revokedAt, normalizedLeaseId);
    return this.getAuthLease(normalizedLeaseId);
  }

  async appendAuthEvent(event = {}) {
    const eventType = normalizeString(event.event_type || event.eventType);
    if (!eventType) {
      return false;
    }
    const eventId = normalizeString(event.event_id || event.eventId)
      || `auth-evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const timestamp = normalizeIsoTimestamp(event.event_timestamp || event.timestamp, this.now()) || this.now();
    const normalizedEvent = {
      event_id: eventId,
      event_timestamp: timestamp,
      event_type: eventType,
      action: normalizeString(event.action) || null,
      actor: normalizeString(event.actor) || null,
      lease_id: normalizeString(event.lease_id || event.leaseId) || null,
      result: normalizeString(event.result) || null,
      target: normalizeString(event.target) || null,
      detail: event.detail && typeof event.detail === 'object'
        ? event.detail
        : {}
    };

    if (this._useMemoryBackend()) {
      const existingIndex = this._memory.auth_events
        .findIndex((item) => normalizeString(item.event_id) === eventId);
      const row = {
        ...normalizedEvent,
        created_at: this.now()
      };
      if (existingIndex >= 0) {
        this._memory.auth_events[existingIndex] = row;
      } else {
        this._memory.auth_events.push(row);
      }
      this._memory.auth_events.sort((left, right) => {
        const l = Date.parse(left.event_timestamp || '') || 0;
        const r = Date.parse(right.event_timestamp || '') || 0;
        return l - r;
      });
      return true;
    }

    if (!await this.ensureReady()) {
      return false;
    }

    this._db
      .prepare(`
        INSERT OR REPLACE INTO auth_event_stream(
          event_id, event_timestamp, event_type, action, actor, lease_id, result, target, detail_json, created_at
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        normalizedEvent.event_id,
        normalizedEvent.event_timestamp,
        normalizedEvent.event_type,
        normalizedEvent.action,
        normalizedEvent.actor,
        normalizedEvent.lease_id,
        normalizedEvent.result,
        normalizedEvent.target,
        JSON.stringify(normalizedEvent.detail || {}),
        this.now()
      );
    return true;
  }

  async listAuthEvents(options = {}) {
    const limit = normalizeInteger(options.limit, 50);

    if (this._useMemoryBackend()) {
      const rows = [...this._memory.auth_events]
        .sort((left, right) => (Date.parse(right.event_timestamp || '') || 0) - (Date.parse(left.event_timestamp || '') || 0))
        .map((row) => ({
          ...row,
          detail: row.detail && typeof row.detail === 'object' ? row.detail : {}
        }));
      return limit > 0 ? rows.slice(0, limit) : rows;
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const query = limit > 0
      ? `
        SELECT event_id, event_timestamp, event_type, action, actor, lease_id, result, target, detail_json, created_at
        FROM auth_event_stream
        ORDER BY event_timestamp DESC
        LIMIT ?
      `
      : `
        SELECT event_id, event_timestamp, event_type, action, actor, lease_id, result, target, detail_json, created_at
        FROM auth_event_stream
        ORDER BY event_timestamp DESC
      `;

    const statement = this._db.prepare(query);
    const rows = limit > 0 ? statement.all(limit) : statement.all();
    return rows
      .map((row) => this._mapAuthEventRow(row))
      .filter(Boolean);
  }

  async clearInteractiveApprovalEventProjection(options = {}) {
    const auditFileFilter = normalizeString(options.auditFile || options.audit_file);

    if (this._useMemoryBackend()) {
      if (!auditFileFilter) {
        this._memory.interactive_approval_events = {};
        return { success: true, removed: 0 };
      }
      let removed = 0;
      for (const [eventId, item] of Object.entries(this._memory.interactive_approval_events || {})) {
        if (normalizeString(item.audit_file) === auditFileFilter) {
          delete this._memory.interactive_approval_events[eventId];
          removed += 1;
        }
      }
      return { success: true, removed };
    }

    if (!await this.ensureReady()) {
      return null;
    }

    if (auditFileFilter) {
      const info = this._db
        .prepare('DELETE FROM interactive_approval_event_projection WHERE audit_file = ?')
        .run(auditFileFilter);
      return {
        success: true,
        removed: normalizeNonNegativeInteger(info && info.changes, 0)
      };
    }

    const info = this._db
      .prepare('DELETE FROM interactive_approval_event_projection')
      .run();
    return {
      success: true,
      removed: normalizeNonNegativeInteger(info && info.changes, 0)
    };
  }

  async upsertInteractiveApprovalEventProjection(records = [], options = {}) {
    const source = normalizeString(options.source) || 'jsonl.interactive-approval-events';
    const auditFile = normalizeString(options.auditFile || options.audit_file) || null;
    const nowIso = this.now();
    const normalizedRecords = Array.isArray(records)
      ? records.map((item, index) => ({
        event_id: normalizeString(item && item.event_id),
        workflow_id: normalizeString(item && item.workflow_id) || null,
        event_timestamp: normalizeIsoTimestamp(item && (item.event_timestamp || item.timestamp), nowIso) || nowIso,
        event_type: normalizeString(item && item.event_type),
        action: normalizeString(item && item.action) || null,
        actor: normalizeString(item && item.actor) || null,
        actor_role: normalizeString(item && item.actor_role) || null,
        from_status: normalizeString(item && item.from_status) || null,
        to_status: normalizeString(item && item.to_status) || null,
        blocked: normalizeBooleanValue(item && item.blocked, false),
        reason: normalizeString(item && item.reason) || null,
        audit_file: normalizeString(item && (item.audit_file || item.auditFile)) || auditFile,
        line_no: normalizeNonNegativeInteger(item && (item.line_no || item.lineNo), index + 1),
        raw_json: JSON.stringify(item && typeof item === 'object' ? item : {}),
        source,
        indexed_at: nowIso
      }))
        .filter((item) => item.event_id && item.event_type)
      : [];

    if (this._useMemoryBackend()) {
      for (const item of normalizedRecords) {
        this._memory.interactive_approval_events[item.event_id] = { ...item };
      }
      return {
        success: true,
        written: normalizedRecords.length,
        total: Object.keys(this._memory.interactive_approval_events || {}).length
      };
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const statement = this._db.prepare(`
      INSERT OR REPLACE INTO interactive_approval_event_projection(
        event_id, workflow_id, event_timestamp, event_type, action, actor, actor_role,
        from_status, to_status, blocked, reason, audit_file, line_no, raw_json, source, indexed_at
      )
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this._withTransaction(() => {
      for (const item of normalizedRecords) {
        statement.run(
          item.event_id,
          item.workflow_id,
          item.event_timestamp,
          item.event_type,
          item.action,
          item.actor,
          item.actor_role,
          item.from_status,
          item.to_status,
          item.blocked ? 1 : 0,
          item.reason,
          item.audit_file,
          item.line_no,
          item.raw_json,
          item.source,
          item.indexed_at
        );
      }
    });

    const totalRow = this._db
      .prepare('SELECT COUNT(*) AS total FROM interactive_approval_event_projection')
      .get();

    return {
      success: true,
      written: normalizedRecords.length,
      total: normalizeNonNegativeInteger(totalRow && totalRow.total, 0)
    };
  }

  async listInteractiveApprovalEventProjection(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const workflowId = normalizeString(options.workflowId || options.workflow_id);
    const actor = normalizeString(options.actor);
    const action = normalizeString(options.action);
    const eventType = normalizeString(options.eventType || options.event_type);
    const auditFile = normalizeString(options.auditFile || options.audit_file);
    const blockedFilter = options.blocked === undefined || options.blocked === null
      ? null
      : normalizeBooleanValue(options.blocked, false);

    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.interactive_approval_events || {}).map((item) => ({ ...item }));
      if (workflowId) {
        rows = rows.filter((item) => normalizeString(item.workflow_id) === workflowId);
      }
      if (actor) {
        rows = rows.filter((item) => normalizeString(item.actor) === actor);
      }
      if (action) {
        rows = rows.filter((item) => normalizeString(item.action) === action);
      }
      if (eventType) {
        rows = rows.filter((item) => normalizeString(item.event_type) === eventType);
      }
      if (auditFile) {
        rows = rows.filter((item) => normalizeString(item.audit_file) === auditFile);
      }
      if (blockedFilter !== null) {
        rows = rows.filter((item) => normalizeBooleanValue(item.blocked, false) === blockedFilter);
      }
      rows.sort((left, right) => (Date.parse(right.event_timestamp || '') || 0) - (Date.parse(left.event_timestamp || '') || 0));
      if (limit > 0) {
        rows = rows.slice(0, limit);
      }
      return rows.map((row) => this._mapInteractiveApprovalEventProjectionRow(row)).filter(Boolean);
    }

    if (!await this.ensureReady()) {
      return null;
    }

    let query = `
      SELECT event_id, workflow_id, event_timestamp, event_type, action, actor, actor_role,
             from_status, to_status, blocked, reason, audit_file, line_no, raw_json, source, indexed_at
      FROM interactive_approval_event_projection
    `;
    const clauses = [];
    const params = [];
    if (workflowId) {
      clauses.push('workflow_id = ?');
      params.push(workflowId);
    }
    if (actor) {
      clauses.push('actor = ?');
      params.push(actor);
    }
    if (action) {
      clauses.push('action = ?');
      params.push(action);
    }
    if (eventType) {
      clauses.push('event_type = ?');
      params.push(eventType);
    }
    if (auditFile) {
      clauses.push('audit_file = ?');
      params.push(auditFile);
    }
    if (blockedFilter !== null) {
      clauses.push('blocked = ?');
      params.push(blockedFilter ? 1 : 0);
    }
    if (clauses.length > 0) {
      query += ` WHERE ${clauses.join(' AND ')}`;
    }
    query += ' ORDER BY event_timestamp DESC, line_no DESC';
    if (limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this._db.prepare(query).all(...params);
    return rows
      .map((row) => this._mapInteractiveApprovalEventProjectionRow(row))
      .filter(Boolean);
  }

  async upsertTimelineSnapshotIndex(records = [], options = {}) {
    const source = normalizeString(options.source) || 'file.timeline.index';
    const nowIso = this.now();
    const normalizedRecords = Array.isArray(records)
      ? records.map((item) => ({
        snapshot_id: normalizeString(item && item.snapshot_id),
        created_at: normalizeIsoTimestamp(item && item.created_at, nowIso) || nowIso,
        trigger: normalizeString(item && item.trigger) || null,
        event: normalizeString(item && item.event) || null,
        summary: normalizeString(item && item.summary) || null,
        scene_id: normalizeString(item && item.scene_id) || null,
        session_id: normalizeString(item && item.session_id) || null,
        command: normalizeString(item && item.command) || null,
        file_count: normalizeNonNegativeInteger(item && item.file_count, 0),
        total_bytes: normalizeNonNegativeInteger(item && item.total_bytes, 0),
        snapshot_path: normalizeString(item && (item.snapshot_path || item.path)) || null,
        git: item && item.git && typeof item.git === 'object' ? item.git : {},
        source,
        updated_at: nowIso
      }))
        .filter((item) => item.snapshot_id)
      : [];

    if (this._useMemoryBackend()) {
      for (const item of normalizedRecords) {
        this._memory.timeline_snapshots[item.snapshot_id] = { ...item };
      }
      return {
        success: true,
        written: normalizedRecords.length,
        total: Object.keys(this._memory.timeline_snapshots || {}).length
      };
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const statement = this._db.prepare(`
      INSERT OR REPLACE INTO timeline_snapshot_registry(
        snapshot_id, created_at, trigger, event, summary, scene_id, session_id, command,
        file_count, total_bytes, snapshot_path, git_json, source, updated_at
      )
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this._withTransaction(() => {
      for (const item of normalizedRecords) {
        statement.run(
          item.snapshot_id,
          item.created_at,
          item.trigger,
          item.event,
          item.summary,
          item.scene_id,
          item.session_id,
          item.command,
          item.file_count,
          item.total_bytes,
          item.snapshot_path,
          JSON.stringify(item.git || {}),
          item.source,
          item.updated_at
        );
      }
    });

    const totalRow = this._db
      .prepare('SELECT COUNT(*) AS total FROM timeline_snapshot_registry')
      .get();

    return {
      success: true,
      written: normalizedRecords.length,
      total: normalizeNonNegativeInteger(totalRow && totalRow.total, 0)
    };
  }

  async listTimelineSnapshotIndex(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const triggerFilter = normalizeString(options.trigger);
    const snapshotIdFilter = normalizeString(options.snapshotId);

    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.timeline_snapshots || {}).map((item) => ({ ...item }));
      if (triggerFilter) {
        rows = rows.filter((item) => normalizeString(item.trigger) === triggerFilter);
      }
      if (snapshotIdFilter) {
        rows = rows.filter((item) => normalizeString(item.snapshot_id) === snapshotIdFilter);
      }
      rows.sort((left, right) => (Date.parse(right.created_at || '') || 0) - (Date.parse(left.created_at || '') || 0));
      if (limit > 0) {
        rows = rows.slice(0, limit);
      }
      return rows.map((row) => this._mapTimelineSnapshotRow({
        ...row,
        git_json: JSON.stringify(row.git || {})
      }));
    }

    if (!await this.ensureReady()) {
      return null;
    }

    let query = `
      SELECT snapshot_id, created_at, trigger, event, summary, scene_id, session_id, command,
             file_count, total_bytes, snapshot_path, git_json, source, updated_at
      FROM timeline_snapshot_registry
    `;
    const clauses = [];
    const params = [];
    if (triggerFilter) {
      clauses.push('trigger = ?');
      params.push(triggerFilter);
    }
    if (snapshotIdFilter) {
      clauses.push('snapshot_id = ?');
      params.push(snapshotIdFilter);
    }
    if (clauses.length > 0) {
      query += ` WHERE ${clauses.join(' AND ')}`;
    }
    query += ' ORDER BY created_at DESC';
    if (limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this._db.prepare(query).all(...params);
    return rows
      .map((row) => this._mapTimelineSnapshotRow(row))
      .filter(Boolean);
  }

  async upsertSceneSessionCycles(records = [], options = {}) {
    const source = normalizeString(options.source) || 'file.session.scene-index';
    const nowIso = this.now();
    const normalizedRecords = Array.isArray(records)
      ? records.map((item) => ({
        scene_id: normalizeString(item && item.scene_id),
        cycle: normalizeNonNegativeInteger(item && item.cycle, 0),
        session_id: normalizeString(item && item.session_id),
        status: normalizeString(item && item.status) || null,
        started_at: normalizeIsoTimestamp(item && item.started_at, nowIso) || nowIso,
        completed_at: normalizeIsoTimestamp(item && item.completed_at, '') || null,
        source,
        updated_at: nowIso
      }))
        .filter((item) => item.scene_id && item.cycle > 0 && item.session_id)
      : [];

    if (this._useMemoryBackend()) {
      for (const item of normalizedRecords) {
        const key = `${item.scene_id}::${item.cycle}`;
        this._memory.scene_session_cycles[key] = { ...item };
      }
      return {
        success: true,
        written: normalizedRecords.length,
        total: Object.keys(this._memory.scene_session_cycles || {}).length
      };
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const statement = this._db.prepare(`
      INSERT OR REPLACE INTO scene_session_cycle_registry(
        scene_id, cycle, session_id, status, started_at, completed_at, source, updated_at
      )
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this._withTransaction(() => {
      for (const item of normalizedRecords) {
        statement.run(
          item.scene_id,
          item.cycle,
          item.session_id,
          item.status,
          item.started_at,
          item.completed_at,
          item.source,
          item.updated_at
        );
      }
    });

    const totalRow = this._db
      .prepare('SELECT COUNT(*) AS total FROM scene_session_cycle_registry')
      .get();

    return {
      success: true,
      written: normalizedRecords.length,
      total: normalizeNonNegativeInteger(totalRow && totalRow.total, 0)
    };
  }

  async listSceneSessionCycles(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const sceneId = normalizeString(options.sceneId);

    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.scene_session_cycles || {}).map((item) => ({ ...item }));
      if (sceneId) {
        rows = rows.filter((item) => normalizeString(item.scene_id) === sceneId);
      }
      rows.sort((left, right) => {
        const sceneCompare = `${left.scene_id}`.localeCompare(`${right.scene_id}`);
        if (sceneCompare !== 0) {
          return sceneCompare;
        }
        return right.cycle - left.cycle;
      });
      if (limit > 0) {
        rows = rows.slice(0, limit);
      }
      return rows.map((row) => this._mapSceneSessionCycleRow(row));
    }

    if (!await this.ensureReady()) {
      return null;
    }

    let query = `
      SELECT scene_id, cycle, session_id, status, started_at, completed_at, source, updated_at
      FROM scene_session_cycle_registry
    `;
    const params = [];
    if (sceneId) {
      query += ' WHERE scene_id = ?';
      params.push(sceneId);
    }
    query += ' ORDER BY scene_id ASC, cycle DESC';
    if (limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this._db.prepare(query).all(...params);
    return rows
      .map((row) => this._mapSceneSessionCycleRow(row))
      .filter(Boolean);
  }

  async upsertAgentRuntimeRecords(records = [], options = {}) {
    const source = normalizeString(options.source) || 'file.agent-registry';
    const nowIso = this.now();
    const normalizedRecords = Array.isArray(records)
      ? records.map((item) => ({
        agent_id: normalizeString(item && item.agent_id),
        machine_id: normalizeString(item && item.machine_id) || null,
        instance_index: normalizeNonNegativeInteger(item && item.instance_index, 0),
        hostname: normalizeString(item && item.hostname) || null,
        registered_at: normalizeIsoTimestamp(item && item.registered_at, nowIso) || nowIso,
        last_heartbeat: normalizeIsoTimestamp(item && item.last_heartbeat, nowIso) || nowIso,
        status: normalizeString(item && item.status) || null,
        current_task: item && item.current_task && typeof item.current_task === 'object'
          ? item.current_task
          : null,
        source,
        updated_at: nowIso
      }))
        .filter((item) => item.agent_id)
      : [];

    if (this._useMemoryBackend()) {
      for (const item of normalizedRecords) {
        this._memory.agent_runtime[item.agent_id] = { ...item };
      }
      return {
        success: true,
        written: normalizedRecords.length,
        total: Object.keys(this._memory.agent_runtime || {}).length
      };
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const statement = this._db.prepare(`
      INSERT OR REPLACE INTO agent_runtime_registry(
        agent_id, machine_id, instance_index, hostname, registered_at, last_heartbeat, status, current_task_json, source, updated_at
      )
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this._withTransaction(() => {
      for (const item of normalizedRecords) {
        statement.run(
          item.agent_id,
          item.machine_id,
          item.instance_index,
          item.hostname,
          item.registered_at,
          item.last_heartbeat,
          item.status,
          JSON.stringify(item.current_task),
          item.source,
          item.updated_at
        );
      }
    });

    const totalRow = this._db
      .prepare('SELECT COUNT(*) AS total FROM agent_runtime_registry')
      .get();

    return {
      success: true,
      written: normalizedRecords.length,
      total: normalizeNonNegativeInteger(totalRow && totalRow.total, 0)
    };
  }

  async listAgentRuntimeRecords(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const status = normalizeString(options.status);

    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.agent_runtime || {}).map((item) => ({ ...item }));
      if (status) {
        rows = rows.filter((item) => normalizeString(item.status) === status);
      }
      rows.sort((left, right) => (Date.parse(right.last_heartbeat || '') || 0) - (Date.parse(left.last_heartbeat || '') || 0));
      if (limit > 0) {
        rows = rows.slice(0, limit);
      }
      return rows.map((row) => this._mapAgentRuntimeRow({
        ...row,
        current_task_json: JSON.stringify(row.current_task || null)
      }));
    }

    if (!await this.ensureReady()) {
      return null;
    }

    let query = `
      SELECT agent_id, machine_id, instance_index, hostname, registered_at, last_heartbeat, status, current_task_json, source, updated_at
      FROM agent_runtime_registry
    `;
    const params = [];
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    query += ' ORDER BY last_heartbeat DESC';
    if (limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this._db.prepare(query).all(...params);
    return rows
      .map((row) => this._mapAgentRuntimeRow(row))
      .filter(Boolean);
  }

  async appendStateMigrationRecord(record = {}) {
    const componentId = normalizeString(record.component_id || record.componentId);
    if (!componentId) {
      return null;
    }
    const migrationId = normalizeString(record.migration_id || record.migrationId)
      || `migration-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const startedAt = normalizeIsoTimestamp(record.started_at || record.startedAt, this.now()) || this.now();
    const completedAt = normalizeIsoTimestamp(record.completed_at || record.completedAt, '') || null;
    const nowIso = this.now();
    const normalized = {
      migration_id: migrationId,
      component_id: componentId,
      source_path: normalizeString(record.source_path || record.sourcePath) || null,
      mode: normalizeString(record.mode) || 'unknown',
      status: normalizeString(record.status) || 'completed',
      metrics: record.metrics && typeof record.metrics === 'object' ? record.metrics : {},
      detail: record.detail && typeof record.detail === 'object' ? record.detail : {},
      started_at: startedAt,
      completed_at: completedAt,
      updated_at: nowIso
    };

    if (this._useMemoryBackend()) {
      this._memory.migration_records[normalized.migration_id] = { ...normalized };
      return { ...normalized };
    }

    if (!await this.ensureReady()) {
      return null;
    }

    this._db
      .prepare(`
        INSERT OR REPLACE INTO state_migration_registry(
          migration_id, component_id, source_path, mode, status, metrics_json, detail_json, started_at, completed_at, updated_at
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        normalized.migration_id,
        normalized.component_id,
        normalized.source_path,
        normalized.mode,
        normalized.status,
        JSON.stringify(normalized.metrics || {}),
        JSON.stringify(normalized.detail || {}),
        normalized.started_at,
        normalized.completed_at,
        normalized.updated_at
      );

    return this.listStateMigrations({ migrationId: normalized.migration_id, limit: 1 })
      .then((rows) => (Array.isArray(rows) && rows.length > 0 ? rows[0] : null));
  }

  async listStateMigrations(options = {}) {
    const limit = normalizeInteger(options.limit, 50);
    const componentId = normalizeString(options.componentId);
    const migrationId = normalizeString(options.migrationId);

    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.migration_records || {}).map((item) => ({ ...item }));
      if (componentId) {
        rows = rows.filter((item) => normalizeString(item.component_id) === componentId);
      }
      if (migrationId) {
        rows = rows.filter((item) => normalizeString(item.migration_id) === migrationId);
      }
      rows.sort((left, right) => (Date.parse(right.started_at || '') || 0) - (Date.parse(left.started_at || '') || 0));
      if (limit > 0) {
        rows = rows.slice(0, limit);
      }
      return rows.map((row) => this._mapStateMigrationRow({
        ...row,
        metrics_json: JSON.stringify(row.metrics || {}),
        detail_json: JSON.stringify(row.detail || {})
      }));
    }

    if (!await this.ensureReady()) {
      return null;
    }

    let query = `
      SELECT migration_id, component_id, source_path, mode, status, metrics_json, detail_json, started_at, completed_at, updated_at
      FROM state_migration_registry
    `;
    const clauses = [];
    const params = [];
    if (componentId) {
      clauses.push('component_id = ?');
      params.push(componentId);
    }
    if (migrationId) {
      clauses.push('migration_id = ?');
      params.push(migrationId);
    }
    if (clauses.length > 0) {
      query += ` WHERE ${clauses.join(' AND ')}`;
    }
    query += ' ORDER BY started_at DESC';
    if (limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this._db.prepare(query).all(...params);
    return rows
      .map((row) => this._mapStateMigrationRow(row))
      .filter(Boolean);
  }

  async upsertErrorbookEntryIndexRecords(records = [], options = {}) {
    const source = normalizeString(options.source) || 'file.errorbook.index';
    const nowIso = this.now();
    const normalizedRecords = Array.isArray(records)
      ? records.map((item) => ({
        entry_id: normalizeString(item && (item.entry_id || item.id)),
        fingerprint: normalizeString(item && item.fingerprint) || null,
        title: normalizeString(item && item.title) || null,
        status: normalizeString(item && item.status) || null,
        quality_score: normalizeNonNegativeInteger(item && item.quality_score, 0),
        tags: normalizeStringArray(item && item.tags, []),
        ontology_tags: normalizeStringArray(item && item.ontology_tags, []),
        temporary_mitigation_active: normalizeBooleanValue(item && item.temporary_mitigation_active, false),
        temporary_mitigation_deadline_at: normalizeIsoTimestamp(item && item.temporary_mitigation_deadline_at, '') || null,
        occurrences: normalizeNonNegativeInteger(item && item.occurrences, 0),
        created_at: normalizeIsoTimestamp(item && item.created_at, '') || null,
        updated_at: normalizeIsoTimestamp(item && item.updated_at, nowIso) || nowIso,
        source,
        indexed_at: nowIso
      }))
        .filter((item) => item.entry_id)
      : [];

    if (this._useMemoryBackend()) {
      for (const item of normalizedRecords) {
        this._memory.errorbook_entry_index[item.entry_id] = { ...item };
      }
      return {
        success: true,
        written: normalizedRecords.length,
        total: Object.keys(this._memory.errorbook_entry_index || {}).length
      };
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const statement = this._db.prepare(`
      INSERT OR REPLACE INTO errorbook_entry_index_registry(
        entry_id, fingerprint, title, status, quality_score, tags_json, ontology_tags_json,
        temporary_mitigation_active, temporary_mitigation_deadline_at, occurrences, created_at, updated_at, source, indexed_at
      )
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this._withTransaction(() => {
      for (const item of normalizedRecords) {
        statement.run(
          item.entry_id,
          item.fingerprint,
          item.title,
          item.status,
          item.quality_score,
          JSON.stringify(item.tags || []),
          JSON.stringify(item.ontology_tags || []),
          item.temporary_mitigation_active ? 1 : 0,
          item.temporary_mitigation_deadline_at,
          item.occurrences,
          item.created_at,
          item.updated_at,
          item.source,
          item.indexed_at
        );
      }
    });

    const totalRow = this._db
      .prepare('SELECT COUNT(*) AS total FROM errorbook_entry_index_registry')
      .get();

    return {
      success: true,
      written: normalizedRecords.length,
      total: normalizeNonNegativeInteger(totalRow && totalRow.total, 0)
    };
  }

  async listErrorbookEntryIndexRecords(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const status = normalizeString(options.status);

    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.errorbook_entry_index || {}).map((item) => ({ ...item }));
      if (status) {
        rows = rows.filter((item) => normalizeString(item.status) === status);
      }
      rows.sort((left, right) => (Date.parse(right.updated_at || '') || 0) - (Date.parse(left.updated_at || '') || 0));
      if (limit > 0) {
        rows = rows.slice(0, limit);
      }
      return rows.map((row) => this._mapErrorbookEntryIndexRow({
        ...row,
        tags_json: JSON.stringify(row.tags || []),
        ontology_tags_json: JSON.stringify(row.ontology_tags || [])
      }));
    }

    if (!await this.ensureReady()) {
      return null;
    }

    let query = `
      SELECT entry_id, fingerprint, title, status, quality_score, tags_json, ontology_tags_json,
             temporary_mitigation_active, temporary_mitigation_deadline_at, occurrences, created_at, updated_at, source, indexed_at
      FROM errorbook_entry_index_registry
    `;
    const params = [];
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    query += ' ORDER BY updated_at DESC';
    if (limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this._db.prepare(query).all(...params);
    return rows
      .map((row) => this._mapErrorbookEntryIndexRow(row))
      .filter(Boolean);
  }

  async upsertErrorbookIncidentIndexRecords(records = [], options = {}) {
    const source = normalizeString(options.source) || 'file.errorbook.incident-index';
    const nowIso = this.now();
    const normalizedRecords = Array.isArray(records)
      ? records.map((item) => ({
        incident_id: normalizeString(item && (item.incident_id || item.id)),
        fingerprint: normalizeString(item && item.fingerprint) || null,
        title: normalizeString(item && item.title) || null,
        symptom: normalizeString(item && item.symptom) || null,
        state: normalizeString(item && item.state) || null,
        attempt_count: normalizeNonNegativeInteger(item && item.attempt_count, 0),
        created_at: normalizeIsoTimestamp(item && item.created_at, '') || null,
        updated_at: normalizeIsoTimestamp(item && item.updated_at, nowIso) || nowIso,
        last_attempt_at: normalizeIsoTimestamp(item && item.last_attempt_at, '') || null,
        resolved_at: normalizeIsoTimestamp(item && item.resolved_at, '') || null,
        linked_entry_id: normalizeString(item && item.linked_entry_id) || null,
        source,
        indexed_at: nowIso
      }))
        .filter((item) => item.incident_id)
      : [];

    if (this._useMemoryBackend()) {
      for (const item of normalizedRecords) {
        this._memory.errorbook_incident_index[item.incident_id] = { ...item };
      }
      return {
        success: true,
        written: normalizedRecords.length,
        total: Object.keys(this._memory.errorbook_incident_index || {}).length
      };
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const statement = this._db.prepare(`
      INSERT OR REPLACE INTO errorbook_incident_index_registry(
        incident_id, fingerprint, title, symptom, state, attempt_count,
        created_at, updated_at, last_attempt_at, resolved_at, linked_entry_id, source, indexed_at
      )
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this._withTransaction(() => {
      for (const item of normalizedRecords) {
        statement.run(
          item.incident_id,
          item.fingerprint,
          item.title,
          item.symptom,
          item.state,
          item.attempt_count,
          item.created_at,
          item.updated_at,
          item.last_attempt_at,
          item.resolved_at,
          item.linked_entry_id,
          item.source,
          item.indexed_at
        );
      }
    });

    const totalRow = this._db
      .prepare('SELECT COUNT(*) AS total FROM errorbook_incident_index_registry')
      .get();

    return {
      success: true,
      written: normalizedRecords.length,
      total: normalizeNonNegativeInteger(totalRow && totalRow.total, 0)
    };
  }

  async listErrorbookIncidentIndexRecords(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const state = normalizeString(options.state);

    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.errorbook_incident_index || {}).map((item) => ({ ...item }));
      if (state) {
        rows = rows.filter((item) => normalizeString(item.state) === state);
      }
      rows.sort((left, right) => (Date.parse(right.updated_at || '') || 0) - (Date.parse(left.updated_at || '') || 0));
      if (limit > 0) {
        rows = rows.slice(0, limit);
      }
      return rows.map((row) => this._mapErrorbookIncidentIndexRow(row));
    }

    if (!await this.ensureReady()) {
      return null;
    }

    let query = `
      SELECT incident_id, fingerprint, title, symptom, state, attempt_count,
             created_at, updated_at, last_attempt_at, resolved_at, linked_entry_id, source, indexed_at
      FROM errorbook_incident_index_registry
    `;
    const params = [];
    if (state) {
      query += ' WHERE state = ?';
      params.push(state);
    }
    query += ' ORDER BY updated_at DESC';
    if (limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this._db.prepare(query).all(...params);
    return rows
      .map((row) => this._mapErrorbookIncidentIndexRow(row))
      .filter(Boolean);
  }

  async upsertGovernanceSpecSceneOverrideRecords(records = [], options = {}) {
    const source = normalizeString(options.source) || 'file.spec-governance.spec-scene-overrides';
    const nowIso = this.now();
    const normalizedRecords = Array.isArray(records)
      ? records.map((item) => ({
        spec_id: normalizeString(item && item.spec_id),
        scene_id: normalizeString(item && item.scene_id),
        source: normalizeString(item && item.source) || source,
        rule_id: normalizeString(item && item.rule_id) || null,
        updated_at: normalizeIsoTimestamp(item && item.updated_at, nowIso) || nowIso,
        indexed_at: nowIso
      }))
        .filter((item) => item.spec_id && item.scene_id)
      : [];

    if (this._useMemoryBackend()) {
      for (const item of normalizedRecords) {
        this._memory.governance_spec_scene_override[item.spec_id] = { ...item };
      }
      return {
        success: true,
        written: normalizedRecords.length,
        total: Object.keys(this._memory.governance_spec_scene_override || {}).length
      };
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const statement = this._db.prepare(`
      INSERT OR REPLACE INTO governance_spec_scene_override_registry(
        spec_id, scene_id, source, rule_id, updated_at, indexed_at
      )
      VALUES(?, ?, ?, ?, ?, ?)
    `);

    this._withTransaction(() => {
      for (const item of normalizedRecords) {
        statement.run(
          item.spec_id,
          item.scene_id,
          item.source,
          item.rule_id,
          item.updated_at,
          item.indexed_at
        );
      }
    });

    const totalRow = this._db
      .prepare('SELECT COUNT(*) AS total FROM governance_spec_scene_override_registry')
      .get();

    return {
      success: true,
      written: normalizedRecords.length,
      total: normalizeNonNegativeInteger(totalRow && totalRow.total, 0)
    };
  }

  async listGovernanceSpecSceneOverrideRecords(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const sceneId = normalizeString(options.sceneId);
    const specId = normalizeString(options.specId);

    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.governance_spec_scene_override || {}).map((item) => ({ ...item }));
      if (sceneId) {
        rows = rows.filter((item) => normalizeString(item.scene_id) === sceneId);
      }
      if (specId) {
        rows = rows.filter((item) => normalizeString(item.spec_id) === specId);
      }
      rows.sort((left, right) => (Date.parse(right.updated_at || '') || 0) - (Date.parse(left.updated_at || '') || 0));
      if (limit > 0) {
        rows = rows.slice(0, limit);
      }
      return rows.map((row) => this._mapGovernanceSpecSceneOverrideRow(row));
    }

    if (!await this.ensureReady()) {
      return null;
    }

    let query = `
      SELECT spec_id, scene_id, source, rule_id, updated_at, indexed_at
      FROM governance_spec_scene_override_registry
    `;
    const clauses = [];
    const params = [];
    if (sceneId) {
      clauses.push('scene_id = ?');
      params.push(sceneId);
    }
    if (specId) {
      clauses.push('spec_id = ?');
      params.push(specId);
    }
    if (clauses.length > 0) {
      query += ` WHERE ${clauses.join(' AND ')}`;
    }
    query += ' ORDER BY updated_at DESC, spec_id ASC';
    if (limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this._db.prepare(query).all(...params);
    return rows
      .map((row) => this._mapGovernanceSpecSceneOverrideRow(row))
      .filter(Boolean);
  }

  async upsertGovernanceSceneIndexRecords(records = [], options = {}) {
    const source = normalizeString(options.source) || 'file.spec-governance.scene-index';
    const nowIso = this.now();
    const normalizedRecords = Array.isArray(records)
      ? records.map((item) => ({
        scene_id: normalizeString(item && item.scene_id),
        total_specs: normalizeNonNegativeInteger(item && item.total_specs, 0),
        active_specs: normalizeNonNegativeInteger(item && item.active_specs, 0),
        completed_specs: normalizeNonNegativeInteger(item && item.completed_specs, 0),
        stale_specs: normalizeNonNegativeInteger(item && item.stale_specs, 0),
        spec_ids: normalizeStringArray(item && item.spec_ids, []),
        active_spec_ids: normalizeStringArray(item && item.active_spec_ids, []),
        stale_spec_ids: normalizeStringArray(item && item.stale_spec_ids, []),
        generated_at: normalizeIsoTimestamp(item && item.generated_at, nowIso) || nowIso,
        scene_filter: normalizeString(item && item.scene_filter) || null,
        source: normalizeString(item && item.source) || source,
        indexed_at: nowIso
      }))
        .filter((item) => item.scene_id)
      : [];

    if (this._useMemoryBackend()) {
      for (const item of normalizedRecords) {
        this._memory.governance_scene_index[item.scene_id] = { ...item };
      }
      return {
        success: true,
        written: normalizedRecords.length,
        total: Object.keys(this._memory.governance_scene_index || {}).length
      };
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const statement = this._db.prepare(`
      INSERT OR REPLACE INTO governance_scene_index_registry(
        scene_id, total_specs, active_specs, completed_specs, stale_specs,
        spec_ids_json, active_spec_ids_json, stale_spec_ids_json, generated_at,
        scene_filter, source, indexed_at
      )
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this._withTransaction(() => {
      for (const item of normalizedRecords) {
        statement.run(
          item.scene_id,
          item.total_specs,
          item.active_specs,
          item.completed_specs,
          item.stale_specs,
          JSON.stringify(item.spec_ids || []),
          JSON.stringify(item.active_spec_ids || []),
          JSON.stringify(item.stale_spec_ids || []),
          item.generated_at,
          item.scene_filter,
          item.source,
          item.indexed_at
        );
      }
    });

    const totalRow = this._db
      .prepare('SELECT COUNT(*) AS total FROM governance_scene_index_registry')
      .get();

    return {
      success: true,
      written: normalizedRecords.length,
      total: normalizeNonNegativeInteger(totalRow && totalRow.total, 0)
    };
  }

  async listGovernanceSceneIndexRecords(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const sceneId = normalizeString(options.sceneId);

    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.governance_scene_index || {}).map((item) => ({ ...item }));
      if (sceneId) {
        rows = rows.filter((item) => normalizeString(item.scene_id) === sceneId);
      }
      rows.sort((left, right) => {
        if (right.total_specs !== left.total_specs) {
          return right.total_specs - left.total_specs;
        }
        return `${left.scene_id}`.localeCompare(`${right.scene_id}`);
      });
      if (limit > 0) {
        rows = rows.slice(0, limit);
      }
      return rows.map((row) => this._mapGovernanceSceneIndexRow({
        ...row,
        spec_ids_json: JSON.stringify(row.spec_ids || []),
        active_spec_ids_json: JSON.stringify(row.active_spec_ids || []),
        stale_spec_ids_json: JSON.stringify(row.stale_spec_ids || [])
      }));
    }

    if (!await this.ensureReady()) {
      return null;
    }

    let query = `
      SELECT scene_id, total_specs, active_specs, completed_specs, stale_specs,
             spec_ids_json, active_spec_ids_json, stale_spec_ids_json, generated_at,
             scene_filter, source, indexed_at
      FROM governance_scene_index_registry
    `;
    const params = [];
    if (sceneId) {
      query += ' WHERE scene_id = ?';
      params.push(sceneId);
    }
    query += ' ORDER BY total_specs DESC, active_specs DESC, scene_id ASC';
    if (limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this._db.prepare(query).all(...params);
    return rows
      .map((row) => this._mapGovernanceSceneIndexRow(row))
      .filter(Boolean);
  }

  async upsertReleaseEvidenceRunRecords(records = [], options = {}) {
    const source = normalizeString(options.source) || 'file.release-evidence.handoff-runs';
    const nowIso = this.now();
    const normalizedRecords = Array.isArray(records)
      ? records.map((item) => ({
        session_id: normalizeString(item && item.session_id),
        merged_at: normalizeIsoTimestamp(item && item.merged_at, '') || null,
        status: normalizeString(item && item.status) || null,
        gate_passed: normalizeBooleanValue(item && item.gate_passed, false),
        spec_success_rate_percent: Number.isFinite(Number(item && item.spec_success_rate_percent))
          ? Number(item.spec_success_rate_percent)
          : null,
        risk_level: normalizeString(item && item.risk_level) || null,
        ontology_quality_score: Number.isFinite(Number(item && item.ontology_quality_score))
          ? Number(item.ontology_quality_score)
          : null,
        capability_coverage_percent: Number.isFinite(Number(item && item.capability_coverage_percent))
          ? Number(item.capability_coverage_percent)
          : null,
        capability_coverage_passed: normalizeBooleanValue(item && item.capability_coverage_passed, false),
        scene_package_batch_passed: normalizeBooleanValue(item && item.scene_package_batch_passed, false),
        scene_package_batch_failure_count: normalizeNonNegativeInteger(item && item.scene_package_batch_failure_count, 0),
        failed_goals: normalizeNonNegativeInteger(item && item.failed_goals, 0),
        release_gate_preflight_available: normalizeBooleanValue(item && item.release_gate_preflight_available, false),
        release_gate_preflight_blocked: normalizeBooleanValue(item && item.release_gate_preflight_blocked, false),
        source_updated_at: normalizeIsoTimestamp(item && item.source_updated_at, '') || null,
        source: normalizeString(item && item.source) || source,
        indexed_at: nowIso
      }))
        .filter((item) => item.session_id)
      : [];

    if (this._useMemoryBackend()) {
      for (const item of normalizedRecords) {
        this._memory.release_evidence_run[item.session_id] = { ...item };
      }
      return {
        success: true,
        written: normalizedRecords.length,
        total: Object.keys(this._memory.release_evidence_run || {}).length
      };
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const statement = this._db.prepare(`
      INSERT OR REPLACE INTO release_evidence_run_registry(
        session_id, merged_at, status, gate_passed, spec_success_rate_percent, risk_level,
        ontology_quality_score, capability_coverage_percent, capability_coverage_passed,
        scene_package_batch_passed, scene_package_batch_failure_count, failed_goals,
        release_gate_preflight_available, release_gate_preflight_blocked,
        source_updated_at, source, indexed_at
      )
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this._withTransaction(() => {
      for (const item of normalizedRecords) {
        statement.run(
          item.session_id,
          item.merged_at,
          item.status,
          item.gate_passed ? 1 : 0,
          item.spec_success_rate_percent,
          item.risk_level,
          item.ontology_quality_score,
          item.capability_coverage_percent,
          item.capability_coverage_passed ? 1 : 0,
          item.scene_package_batch_passed ? 1 : 0,
          item.scene_package_batch_failure_count,
          item.failed_goals,
          item.release_gate_preflight_available ? 1 : 0,
          item.release_gate_preflight_blocked ? 1 : 0,
          item.source_updated_at,
          item.source,
          item.indexed_at
        );
      }
    });

    const totalRow = this._db
      .prepare('SELECT COUNT(*) AS total FROM release_evidence_run_registry')
      .get();

    return {
      success: true,
      written: normalizedRecords.length,
      total: normalizeNonNegativeInteger(totalRow && totalRow.total, 0)
    };
  }

  async listReleaseEvidenceRunRecords(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const status = normalizeString(options.status);
    const riskLevel = normalizeString(options.riskLevel || options.risk_level);

    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.release_evidence_run || {}).map((item) => ({ ...item }));
      if (status) {
        rows = rows.filter((item) => normalizeString(item.status) === status);
      }
      if (riskLevel) {
        rows = rows.filter((item) => normalizeString(item.risk_level) === riskLevel);
      }
      rows.sort((left, right) => {
        const leftTs = Date.parse(left.merged_at || '') || 0;
        const rightTs = Date.parse(right.merged_at || '') || 0;
        if (rightTs !== leftTs) {
          return rightTs - leftTs;
        }
        return `${right.session_id}`.localeCompare(`${left.session_id}`);
      });
      if (limit > 0) {
        rows = rows.slice(0, limit);
      }
      return rows.map((row) => this._mapReleaseEvidenceRunRow(row));
    }

    if (!await this.ensureReady()) {
      return null;
    }

    let query = `
      SELECT session_id, merged_at, status, gate_passed, spec_success_rate_percent, risk_level,
             ontology_quality_score, capability_coverage_percent, capability_coverage_passed,
             scene_package_batch_passed, scene_package_batch_failure_count, failed_goals,
             release_gate_preflight_available, release_gate_preflight_blocked, source_updated_at,
             source, indexed_at
      FROM release_evidence_run_registry
    `;
    const clauses = [];
    const params = [];
    if (status) {
      clauses.push('status = ?');
      params.push(status);
    }
    if (riskLevel) {
      clauses.push('risk_level = ?');
      params.push(riskLevel);
    }
    if (clauses.length > 0) {
      query += ` WHERE ${clauses.join(' AND ')}`;
    }
    query += ' ORDER BY merged_at DESC, session_id DESC';
    if (limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this._db.prepare(query).all(...params);
    return rows
      .map((row) => this._mapReleaseEvidenceRunRow(row))
      .filter(Boolean);
  }

  async upsertReleaseGateHistoryRecords(records = [], options = {}) {
    const source = normalizeString(options.source) || 'file.release-evidence.gate-history';
    const nowIso = this.now();
    const normalizedRecords = Array.isArray(records)
      ? records.map((item) => ({
        tag: normalizeString(item && item.tag),
        evaluated_at: normalizeIsoTimestamp(item && item.evaluated_at, '') || null,
        gate_passed: normalizeBooleanValue(item && item.gate_passed, false),
        enforce: normalizeBooleanValue(item && item.enforce, false),
        risk_level: normalizeString(item && item.risk_level) || null,
        spec_success_rate_percent: Number.isFinite(Number(item && item.spec_success_rate_percent))
          ? Number(item.spec_success_rate_percent)
          : null,
        scene_package_batch_passed: normalizeBooleanValue(item && item.scene_package_batch_passed, false),
        scene_package_batch_failure_count: normalizeNonNegativeInteger(item && item.scene_package_batch_failure_count, 0),
        capability_expected_unknown_count: normalizeNonNegativeInteger(item && item.capability_expected_unknown_count, 0),
        capability_provided_unknown_count: normalizeNonNegativeInteger(item && item.capability_provided_unknown_count, 0),
        release_gate_preflight_available: normalizeBooleanValue(item && item.release_gate_preflight_available, false),
        release_gate_preflight_blocked: normalizeBooleanValue(item && item.release_gate_preflight_blocked, false),
        require_release_gate_preflight: normalizeBooleanValue(item && item.require_release_gate_preflight, false),
        drift_alert_count: normalizeNonNegativeInteger(item && item.drift_alert_count, 0),
        drift_blocked: normalizeBooleanValue(item && item.drift_blocked, false),
        weekly_ops_blocked: normalizeBooleanValue(item && item.weekly_ops_blocked, false),
        source_updated_at: normalizeIsoTimestamp(item && item.source_updated_at, '') || null,
        source: normalizeString(item && item.source) || source,
        indexed_at: nowIso
      }))
        .filter((item) => item.tag)
      : [];

    if (this._useMemoryBackend()) {
      for (const item of normalizedRecords) {
        this._memory.release_gate_history[item.tag] = { ...item };
      }
      return {
        success: true,
        written: normalizedRecords.length,
        total: Object.keys(this._memory.release_gate_history || {}).length
      };
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const statement = this._db.prepare(`
      INSERT OR REPLACE INTO release_gate_history_registry(
        tag, evaluated_at, gate_passed, enforce, risk_level, spec_success_rate_percent,
        scene_package_batch_passed, scene_package_batch_failure_count,
        capability_expected_unknown_count, capability_provided_unknown_count,
        release_gate_preflight_available, release_gate_preflight_blocked,
        require_release_gate_preflight, drift_alert_count, drift_blocked,
        weekly_ops_blocked, source_updated_at, source, indexed_at
      )
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this._withTransaction(() => {
      for (const item of normalizedRecords) {
        statement.run(
          item.tag,
          item.evaluated_at,
          item.gate_passed ? 1 : 0,
          item.enforce ? 1 : 0,
          item.risk_level,
          item.spec_success_rate_percent,
          item.scene_package_batch_passed ? 1 : 0,
          item.scene_package_batch_failure_count,
          item.capability_expected_unknown_count,
          item.capability_provided_unknown_count,
          item.release_gate_preflight_available ? 1 : 0,
          item.release_gate_preflight_blocked ? 1 : 0,
          item.require_release_gate_preflight ? 1 : 0,
          item.drift_alert_count,
          item.drift_blocked ? 1 : 0,
          item.weekly_ops_blocked ? 1 : 0,
          item.source_updated_at,
          item.source,
          item.indexed_at
        );
      }
    });

    const totalRow = this._db
      .prepare('SELECT COUNT(*) AS total FROM release_gate_history_registry')
      .get();

    return {
      success: true,
      written: normalizedRecords.length,
      total: normalizeNonNegativeInteger(totalRow && totalRow.total, 0)
    };
  }

  async listReleaseGateHistoryRecords(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const tag = normalizeString(options.tag);
    const riskLevel = normalizeString(options.riskLevel || options.risk_level);

    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.release_gate_history || {}).map((item) => ({ ...item }));
      if (tag) {
        rows = rows.filter((item) => normalizeString(item.tag) === tag);
      }
      if (riskLevel) {
        rows = rows.filter((item) => normalizeString(item.risk_level) === riskLevel);
      }
      rows.sort((left, right) => {
        const leftTs = Date.parse(left.evaluated_at || '') || 0;
        const rightTs = Date.parse(right.evaluated_at || '') || 0;
        if (rightTs !== leftTs) {
          return rightTs - leftTs;
        }
        return `${right.tag}`.localeCompare(`${left.tag}`);
      });
      if (limit > 0) {
        rows = rows.slice(0, limit);
      }
      return rows.map((row) => this._mapReleaseGateHistoryRow(row));
    }

    if (!await this.ensureReady()) {
      return null;
    }

    let query = `
      SELECT tag, evaluated_at, gate_passed, enforce, risk_level, spec_success_rate_percent,
             scene_package_batch_passed, scene_package_batch_failure_count,
             capability_expected_unknown_count, capability_provided_unknown_count,
             release_gate_preflight_available, release_gate_preflight_blocked,
             require_release_gate_preflight, drift_alert_count, drift_blocked,
             weekly_ops_blocked, source_updated_at, source, indexed_at
      FROM release_gate_history_registry
    `;
    const clauses = [];
    const params = [];
    if (tag) {
      clauses.push('tag = ?');
      params.push(tag);
    }
    if (riskLevel) {
      clauses.push('risk_level = ?');
      params.push(riskLevel);
    }
    if (clauses.length > 0) {
      query += ` WHERE ${clauses.join(' AND ')}`;
    }
    query += ' ORDER BY evaluated_at DESC, tag DESC';
    if (limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this._db.prepare(query).all(...params);
    return rows
      .map((row) => this._mapReleaseGateHistoryRow(row))
      .filter(Boolean);
  }

  async registerAppBundle(payload = {}) {
    const appId = normalizeString(payload.app_id || payload.appId);
    const appKey = normalizeString(payload.app_key || payload.appKey);
    const appName = normalizeString(payload.app_name || payload.appName);
    if (!appId || !appKey || !appName) {
      throw new Error('app_id, app_key, and app_name are required');
    }

    const nowIso = this.now();
    const runtime = payload.runtime && typeof payload.runtime === 'object' ? payload.runtime : {};
    const ontology = payload.ontology && typeof payload.ontology === 'object' ? payload.ontology : {};
    const engineering = payload.engineering && typeof payload.engineering === 'object' ? payload.engineering : {};
    const runtimeReleaseId = normalizeString(payload.runtime_release_id || runtime.release_id);
    const ontologyBundleId = normalizeString(payload.ontology_bundle_id || ontology.ontology_bundle_id);
    const engineeringProjectId = normalizeString(payload.engineering_project_id || engineering.engineering_project_id);
    const defaultSceneId = normalizeString(payload.default_scene_id || payload.defaultSceneId);
    const bundleRow = {
      app_id: appId,
      app_key: appKey,
      app_name: appName,
      app_slug: normalizeString(payload.app_slug || payload.appSlug) || null,
      workspace_id: normalizeString(payload.workspace_id || payload.workspaceId) || null,
      runtime_release_id: runtimeReleaseId || null,
      ontology_bundle_id: ontologyBundleId || null,
      engineering_project_id: engineeringProjectId || null,
      default_scene_id: defaultSceneId || null,
      environment: normalizeString(payload.environment) || null,
      status: normalizeString(payload.status) || 'draft',
      source_origin: normalizeString(payload.source_origin || payload.sourceOrigin) || null,
      tags_json: JSON.stringify(normalizeStringArray(payload.tags, [])),
      metadata_json: JSON.stringify(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}),
      created_at: normalizeIsoTimestamp(payload.created_at, nowIso) || nowIso,
      updated_at: nowIso
    };

    const runtimeRow = runtimeReleaseId && normalizeString(runtime.runtime_version)
      ? {
        release_id: runtimeReleaseId,
        app_id: appId,
        runtime_version: normalizeString(runtime.runtime_version),
        release_channel: normalizeString(runtime.release_channel) || null,
        release_status: normalizeString(runtime.release_status) || 'draft',
        entrypoint: normalizeString(runtime.entrypoint) || null,
        runtime_status: normalizeString(runtime.runtime_status) || null,
        release_notes_file: normalizeString(runtime.release_notes_file) || null,
        release_evidence_file: normalizeString(runtime.release_evidence_file) || null,
        published_at: normalizeIsoTimestamp(runtime.published_at, '') || null,
        source_updated_at: normalizeIsoTimestamp(runtime.source_updated_at, '') || null,
        metadata_json: JSON.stringify(runtime.metadata && typeof runtime.metadata === 'object' ? runtime.metadata : {}),
        created_at: normalizeIsoTimestamp(runtime.created_at, nowIso) || nowIso,
        updated_at: nowIso
      }
      : null;

    const ontologyRow = ontologyBundleId
      ? {
        ontology_bundle_id: ontologyBundleId,
        app_id: appId,
        ontology_version: normalizeString(ontology.ontology_version) || null,
        template_version: normalizeString(ontology.template_version) || null,
        capability_catalog_version: normalizeString(ontology.capability_catalog_version) || null,
        triad_revision: normalizeString(ontology.triad_revision) || null,
        triad_status: normalizeString(ontology.triad_status) || null,
        publish_readiness: normalizeString(ontology.publish_readiness) || null,
        template_source: normalizeString(ontology.template_source) || null,
        capability_set_json: JSON.stringify(Array.isArray(ontology.capability_set) ? ontology.capability_set : []),
        summary_json: JSON.stringify(ontology.summary && typeof ontology.summary === 'object' ? ontology.summary : {}),
        metadata_json: JSON.stringify(ontology.metadata && typeof ontology.metadata === 'object' ? ontology.metadata : {}),
        created_at: normalizeIsoTimestamp(ontology.created_at, nowIso) || nowIso,
        updated_at: nowIso
      }
      : null;

    const engineeringRow = engineeringProjectId
      ? {
        engineering_project_id: engineeringProjectId,
        app_id: appId,
        project_key: normalizeString(engineering.project_key) || null,
        project_name: normalizeString(engineering.project_name) || null,
        repo_url: normalizeString(engineering.repo_url) || null,
        repo_provider: normalizeString(engineering.repo_provider) || null,
        default_branch: normalizeString(engineering.default_branch) || null,
        current_branch: normalizeString(engineering.current_branch) || null,
        commit_sha: normalizeString(engineering.commit_sha) || null,
        workspace_path: normalizeString(engineering.workspace_path) || null,
        code_version: normalizeString(engineering.code_version) || null,
        synced_runtime_release_id: normalizeString(engineering.synced_runtime_release_id) || null,
        dirty_state: normalizeBooleanValue(engineering.dirty_state, false),
        auth_policy_json: JSON.stringify(engineering.auth_policy && typeof engineering.auth_policy === 'object' ? engineering.auth_policy : {}),
        metadata_json: JSON.stringify(engineering.metadata && typeof engineering.metadata === 'object' ? engineering.metadata : {}),
        created_at: normalizeIsoTimestamp(engineering.created_at, nowIso) || nowIso,
        updated_at: nowIso
      }
      : null;

    const sceneBindingsInput = Array.isArray(payload.scene_bindings) ? payload.scene_bindings : [];
    const sceneBindingMap = new Map();
    for (const item of sceneBindingsInput) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const sceneId = normalizeString(item.scene_id || item.sceneId);
      const bindingRole = normalizeString(item.binding_role || item.bindingRole) || 'default';
      if (!sceneId) {
        continue;
      }
      const key = `${sceneId}::${bindingRole}`;
      sceneBindingMap.set(key, {
        app_id: appId,
        scene_id: sceneId,
        binding_role: bindingRole,
        source: normalizeString(item.source) || null,
        metadata_json: JSON.stringify(item.metadata && typeof item.metadata === 'object' ? item.metadata : {}),
        created_at: normalizeIsoTimestamp(item.created_at, nowIso) || nowIso,
        updated_at: nowIso
      });
    }
    if (defaultSceneId && !sceneBindingMap.has(`${defaultSceneId}::default`)) {
      sceneBindingMap.set(`${defaultSceneId}::default`, {
        app_id: appId,
        scene_id: defaultSceneId,
        binding_role: 'default',
        source: 'app-bundle-register',
        metadata_json: JSON.stringify({ auto_bound: true }),
        created_at: nowIso,
        updated_at: nowIso
      });
    }
    const sceneBindings = [...sceneBindingMap.values()];

    if (this._useMemoryBackend()) {
      this._memory.app_bundles[appId] = { ...bundleRow };
      if (runtimeRow) {
        this._memory.runtime_releases[runtimeRow.release_id] = { ...runtimeRow };
      }
      if (ontologyRow) {
        this._memory.ontology_bundles[ontologyRow.ontology_bundle_id] = { ...ontologyRow };
      }
      if (engineeringRow) {
        this._memory.engineering_projects[engineeringRow.engineering_project_id] = { ...engineeringRow };
      }
      Object.keys(this._memory.app_bundle_scene_bindings || {}).forEach((key) => {
        if (key.startsWith(`${appId}::`)) {
          delete this._memory.app_bundle_scene_bindings[key];
        }
      });
      for (const binding of sceneBindings) {
        if (!this._memory.scenes[binding.scene_id]) {
          this._memory.scenes[binding.scene_id] = normalizeInteger(this._memory.sequences.scene_next, 1);
          this._memory.sequences.scene_next = this._memory.scenes[binding.scene_id] + 1;
        }
        this._memory.app_bundle_scene_bindings[`${appId}::${binding.scene_id}::${binding.binding_role}`] = { ...binding };
      }
      return this.getAppBundleGraph(appId);
    }

    if (!await this.ensureReady()) {
      return null;
    }

    this._withTransaction(() => {
      this._db.prepare(`
        INSERT OR REPLACE INTO app_bundle_registry(
          app_id, app_key, app_name, app_slug, workspace_id, runtime_release_id, ontology_bundle_id,
          engineering_project_id, default_scene_id, environment, status, source_origin, tags_json,
          metadata_json, created_at, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        bundleRow.app_id,
        bundleRow.app_key,
        bundleRow.app_name,
        bundleRow.app_slug,
        bundleRow.workspace_id,
        bundleRow.runtime_release_id,
        bundleRow.ontology_bundle_id,
        bundleRow.engineering_project_id,
        bundleRow.default_scene_id,
        bundleRow.environment,
        bundleRow.status,
        bundleRow.source_origin,
        bundleRow.tags_json,
        bundleRow.metadata_json,
        bundleRow.created_at,
        bundleRow.updated_at
      );

      if (runtimeRow) {
        this._db.prepare(`
          INSERT OR REPLACE INTO runtime_release_registry(
            release_id, app_id, runtime_version, release_channel, release_status, entrypoint, runtime_status,
            release_notes_file, release_evidence_file, published_at, source_updated_at, metadata_json,
            created_at, updated_at
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          runtimeRow.release_id, runtimeRow.app_id, runtimeRow.runtime_version, runtimeRow.release_channel,
          runtimeRow.release_status, runtimeRow.entrypoint, runtimeRow.runtime_status, runtimeRow.release_notes_file,
          runtimeRow.release_evidence_file, runtimeRow.published_at, runtimeRow.source_updated_at, runtimeRow.metadata_json,
          runtimeRow.created_at, runtimeRow.updated_at
        );
      }

      if (ontologyRow) {
        this._db.prepare(`
          INSERT OR REPLACE INTO ontology_bundle_registry(
            ontology_bundle_id, app_id, ontology_version, template_version, capability_catalog_version,
            triad_revision, triad_status, publish_readiness, template_source, capability_set_json,
            summary_json, metadata_json, created_at, updated_at
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          ontologyRow.ontology_bundle_id, ontologyRow.app_id, ontologyRow.ontology_version, ontologyRow.template_version,
          ontologyRow.capability_catalog_version, ontologyRow.triad_revision, ontologyRow.triad_status,
          ontologyRow.publish_readiness, ontologyRow.template_source, ontologyRow.capability_set_json,
          ontologyRow.summary_json, ontologyRow.metadata_json, ontologyRow.created_at, ontologyRow.updated_at
        );
      }

      if (engineeringRow) {
        this._db.prepare(`
          INSERT OR REPLACE INTO engineering_project_registry(
            engineering_project_id, app_id, project_key, project_name, repo_url, repo_provider, default_branch,
            current_branch, commit_sha, workspace_path, code_version, synced_runtime_release_id, dirty_state,
            auth_policy_json, metadata_json, created_at, updated_at
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          engineeringRow.engineering_project_id, engineeringRow.app_id, engineeringRow.project_key, engineeringRow.project_name,
          engineeringRow.repo_url, engineeringRow.repo_provider, engineeringRow.default_branch, engineeringRow.current_branch,
          engineeringRow.commit_sha, engineeringRow.workspace_path, engineeringRow.code_version,
          engineeringRow.synced_runtime_release_id, engineeringRow.dirty_state ? 1 : 0, engineeringRow.auth_policy_json,
          engineeringRow.metadata_json, engineeringRow.created_at, engineeringRow.updated_at
        );
      }

      this._db.prepare('DELETE FROM app_bundle_scene_binding_registry WHERE app_id = ?').run(appId);
      for (const binding of sceneBindings) {
        this._ensureSceneRow(binding.scene_id, nowIso);
        this._db.prepare(`
          INSERT OR REPLACE INTO app_bundle_scene_binding_registry(
            app_id, scene_id, binding_role, source, metadata_json, created_at, updated_at
          ) VALUES(?, ?, ?, ?, ?, ?, ?)
        `).run(
          binding.app_id, binding.scene_id, binding.binding_role, binding.source, binding.metadata_json, binding.created_at, binding.updated_at
        );
      }
    });

    return this.getAppBundleGraph(appId);
  }

  async listAppBundles(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const status = normalizeString(options.status);
    const environment = normalizeString(options.environment);
    const workspaceId = normalizeString(options.workspaceId || options.workspace_id);
    const query = normalizeString(options.query).toLowerCase();

    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.app_bundles || {}).map((item) => ({ ...item }));
      if (status) {
        rows = rows.filter((item) => normalizeString(item.status) === status);
      }
      if (environment) {
        rows = rows.filter((item) => normalizeString(item.environment) === environment);
      }
      if (workspaceId) {
        rows = rows.filter((item) => normalizeString(item.workspace_id) === workspaceId);
      }
      if (query) {
        rows = rows.filter((item) => [item.app_id, item.app_key, item.app_name].some((value) => `${value || ''}`.toLowerCase().includes(query)));
      }
      rows.sort((left, right) => (Date.parse(right.updated_at || '') || 0) - (Date.parse(left.updated_at || '') || 0));
      return rows.slice(0, limit).map((row) => this._mapAppBundleRow(row));
    }

    if (!await this.ensureReady()) {
      return null;
    }

    let sql = 'SELECT * FROM app_bundle_registry';
    const clauses = [];
    const params = [];
    if (status) { clauses.push('status = ?'); params.push(status); }
    if (environment) { clauses.push('environment = ?'); params.push(environment); }
    if (workspaceId) { clauses.push('workspace_id = ?'); params.push(workspaceId); }
    if (query) {
      clauses.push('(LOWER(app_id) LIKE ? OR LOWER(app_key) LIKE ? OR LOWER(app_name) LIKE ?)');
      params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }
    if (clauses.length > 0) {
      sql += ` WHERE ${clauses.join(' AND ')}`;
    }
    sql += ' ORDER BY updated_at DESC, app_id ASC LIMIT ?';
    params.push(limit);
    return this._db.prepare(sql).all(...params).map((row) => this._mapAppBundleRow(row));
  }

  async getAppBundleRecord(appRef) {
    const normalizedRef = normalizeString(appRef);
    if (!normalizedRef) {
      return null;
    }

    if (this._useMemoryBackend()) {
      const direct = this._memory.app_bundles[normalizedRef];
      if (direct) {
        return this._mapAppBundleRow(direct);
      }
      const byKey = Object.values(this._memory.app_bundles || {}).find((item) => normalizeString(item.app_key) === normalizedRef);
      return this._mapAppBundleRow(byKey);
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const row = await this._withReadRetry(() => this._db.prepare('SELECT * FROM app_bundle_registry WHERE app_id = ? OR app_key = ? LIMIT 1').get(normalizedRef, normalizedRef));
    return this._mapAppBundleRow(row);
  }

  async getRuntimeReleaseRecord(releaseId) {
    const normalizedId = normalizeString(releaseId);
    if (!normalizedId) {
      return null;
    }
    if (this._useMemoryBackend()) {
      return this._mapRuntimeReleaseRow(this._memory.runtime_releases[normalizedId]);
    }
    if (!await this.ensureReady()) {
      return null;
    }
    return this._mapRuntimeReleaseRow(await this._withReadRetry(() => this._db.prepare('SELECT * FROM runtime_release_registry WHERE release_id = ?').get(normalizedId)));
  }

  async getOntologyBundleRecord(ontologyBundleId) {
    const normalizedId = normalizeString(ontologyBundleId);
    if (!normalizedId) {
      return null;
    }
    if (this._useMemoryBackend()) {
      return this._mapOntologyBundleRow(this._memory.ontology_bundles[normalizedId]);
    }
    if (!await this.ensureReady()) {
      return null;
    }
    return this._mapOntologyBundleRow(await this._withReadRetry(() => this._db.prepare('SELECT * FROM ontology_bundle_registry WHERE ontology_bundle_id = ?').get(normalizedId)));
  }

  async getEngineeringProjectRecord(engineeringProjectId) {
    const normalizedId = normalizeString(engineeringProjectId);
    if (!normalizedId) {
      return null;
    }
    if (this._useMemoryBackend()) {
      return this._mapEngineeringProjectRow(this._memory.engineering_projects[normalizedId]);
    }
    if (!await this.ensureReady()) {
      return null;
    }
    return this._mapEngineeringProjectRow(await this._withReadRetry(() => this._db.prepare('SELECT * FROM engineering_project_registry WHERE engineering_project_id = ?').get(normalizedId)));
  }

  async listAppBundleSceneBindings(appId, options = {}) {
    const normalizedAppId = normalizeString(appId);
    const bindingRole = normalizeString(options.bindingRole || options.binding_role);
    if (!normalizedAppId) {
      return [];
    }

    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.app_bundle_scene_bindings || {}).filter((item) => normalizeString(item.app_id) === normalizedAppId);
      if (bindingRole) {
        rows = rows.filter((item) => normalizeString(item.binding_role) === bindingRole);
      }
      rows.sort((left, right) => `${left.binding_role}`.localeCompare(`${right.binding_role}`) || `${left.scene_id}`.localeCompare(`${right.scene_id}`));
      return rows.map((row) => this._mapAppBundleSceneBindingRow(row));
    }

    if (!await this.ensureReady()) {
      return null;
    }
    let sql = 'SELECT * FROM app_bundle_scene_binding_registry WHERE app_id = ?';
    const params = [normalizedAppId];
    if (bindingRole) {
      sql += ' AND binding_role = ?';
      params.push(bindingRole);
    }
    sql += ' ORDER BY binding_role ASC, scene_id ASC';
    return (await this._withReadRetry(() => this._db.prepare(sql).all(...params))).map((row) => this._mapAppBundleSceneBindingRow(row));
  }

  async getAppBundleGraph(appRef) {
    const bundle = await this.getAppBundleRecord(appRef);
    if (!bundle) {
      return null;
    }
    const [runtime_release, ontology_bundle, engineering_project, scene_bindings] = await Promise.all([
      bundle.runtime_release_id ? this.getRuntimeReleaseRecord(bundle.runtime_release_id) : Promise.resolve(null),
      bundle.ontology_bundle_id ? this.getOntologyBundleRecord(bundle.ontology_bundle_id) : Promise.resolve(null),
      bundle.engineering_project_id ? this.getEngineeringProjectRecord(bundle.engineering_project_id) : Promise.resolve(null),
      this.listAppBundleSceneBindings(bundle.app_id)
    ]);
    return {
      bundle,
      runtime_release,
      ontology_bundle,
      engineering_project,
      scene_bindings: Array.isArray(scene_bindings) ? scene_bindings : []
    };
  }

  async getAppBundleProjectionCache(appRef, projectionMode) {
    const normalizedProjectionMode = normalizeString(projectionMode);
    const normalizedRef = normalizeString(appRef);
    if (!normalizedProjectionMode || !normalizedRef) {
      return null;
    }

    if (this._useMemoryBackend()) {
      const direct = this._memory.app_bundle_projection_cache[`${normalizedRef}::${normalizedProjectionMode}`];
      if (direct) {
        return this._mapAppBundleProjectionCacheRow(direct);
      }
      const bundle = await this.getAppBundleRecord(normalizedRef);
      if (!bundle) {
        return null;
      }
      return this._mapAppBundleProjectionCacheRow(this._memory.app_bundle_projection_cache[`${bundle.app_id}::${normalizedProjectionMode}`]);
    }

    if (!await this.ensureReady()) {
      return null;
    }

    const row = await this._withReadRetry(() => this._db.prepare(`
      SELECT c.app_id, c.projection_mode, c.payload_json, c.generated_at, c.source_updated_at
      FROM app_bundle_projection_cache_registry c
      INNER JOIN app_bundle_registry b ON b.app_id = c.app_id
      WHERE c.projection_mode = ? AND (b.app_id = ? OR b.app_key = ?)
      LIMIT 1
    `).get(normalizedProjectionMode, normalizedRef, normalizedRef));
    return this._mapAppBundleProjectionCacheRow(row);
  }

  async saveAppBundleProjectionCache(appId, projectionMode, payload = {}, sourceUpdatedAt = null) {
    const normalizedAppId = normalizeString(appId);
    const normalizedProjectionMode = normalizeString(projectionMode);
    if (!normalizedAppId || !normalizedProjectionMode) {
      throw new Error('appId and projectionMode are required for projection cache');
    }
    const nowIso = this.now();
    const normalized = {
      app_id: normalizedAppId,
      projection_mode: normalizedProjectionMode,
      payload_json: JSON.stringify(payload && typeof payload === 'object' ? payload : {}),
      generated_at: nowIso,
      source_updated_at: normalizeIsoTimestamp(sourceUpdatedAt, '') || null
    };

    if (this._useMemoryBackend()) {
      this._memory.app_bundle_projection_cache[`${normalizedAppId}::${normalizedProjectionMode}`] = { ...normalized };
      return this._mapAppBundleProjectionCacheRow(normalized);
    }

    if (!await this.ensureReady()) {
      return null;
    }

    this._db.prepare(`
      INSERT OR REPLACE INTO app_bundle_projection_cache_registry(
        app_id, projection_mode, payload_json, generated_at, source_updated_at
      ) VALUES(?, ?, ?, ?, ?)
    `).run(
      normalized.app_id,
      normalized.projection_mode,
      normalized.payload_json,
      normalized.generated_at,
      normalized.source_updated_at
    );

    return this._mapAppBundleProjectionCacheRow(normalized);
  }


  async upsertPmRequirement(record = {}) {
    const nowIso = this.now();
    const normalized = {
      requirement_id: normalizeString(record.requirement_id),
      title: normalizeString(record.title),
      source_request: normalizeString(record.source_request),
      status: normalizeString(record.status) || 'draft',
      priority: normalizeString(record.priority) || 'P2',
      owner: normalizeString(record.owner) || null,
      scene_ref: normalizeString(record.scene_ref) || null,
      spec_ref: normalizeString(record.spec_ref) || null,
      tracking_stage: normalizeString(record.tracking_stage) || null,
      plan_ref: normalizeString(record.plan_ref) || null,
      acceptance_summary: normalizeString(record.acceptance_summary) || null,
      acceptance_details_json: JSON.stringify(Array.isArray(record.acceptance_details) ? record.acceptance_details : []),
      domain_tags_json: JSON.stringify(normalizeStringArray(record.domain_tags, [])),
      risk_level: normalizeString(record.risk_level) || null,
      change_count: normalizeNonNegativeInteger(record.change_count, 0),
      issue_count: normalizeNonNegativeInteger(record.issue_count, 0),
      created_at: normalizeIsoTimestamp(record.created_at, nowIso) || nowIso,
      updated_at: normalizeIsoTimestamp(record.updated_at, nowIso) || nowIso,
      created_by: normalizeString(record.created_by) || null,
      updated_by: normalizeString(record.updated_by) || null
    };
    if (!normalized.requirement_id || !normalized.title || !normalized.source_request) {
      throw new Error('requirement_id, title, and source_request are required');
    }
    if (this._useMemoryBackend()) {
      this._memory.pm_requirements[normalized.requirement_id] = { ...normalized };
      return this._mapPmRequirementRow(normalized);
    }
    if (!await this.ensureReady()) {
      return null;
    }
    this._db.prepare(`
      INSERT OR REPLACE INTO pm_requirement_registry(
        requirement_id, title, source_request, status, priority, owner, scene_ref, spec_ref,
        tracking_stage, plan_ref, acceptance_summary, acceptance_details_json, domain_tags_json,
        risk_level, change_count, issue_count, created_at, updated_at, created_by, updated_by
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.requirement_id, normalized.title, normalized.source_request, normalized.status,
      normalized.priority, normalized.owner, normalized.scene_ref, normalized.spec_ref,
      normalized.tracking_stage, normalized.plan_ref, normalized.acceptance_summary,
      normalized.acceptance_details_json, normalized.domain_tags_json, normalized.risk_level,
      normalized.change_count, normalized.issue_count, normalized.created_at, normalized.updated_at,
      normalized.created_by, normalized.updated_by
    );
    return this.getPmRequirement(normalized.requirement_id);
  }

  async listPmRequirements(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const status = normalizeString(options.status);
    const priority = normalizeString(options.priority);
    const query = normalizeString(options.query).toLowerCase();
    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.pm_requirements || {}).map((item) => ({ ...item }));
      if (status) rows = rows.filter((item) => normalizeString(item.status) === status);
      if (priority) rows = rows.filter((item) => normalizeString(item.priority) === priority);
      if (query) rows = rows.filter((item) => [item.requirement_id, item.title, item.source_request].some((value) => `${value || ''}`.toLowerCase().includes(query)));
      rows.sort((left, right) => (Date.parse(right.updated_at || '') || 0) - (Date.parse(left.updated_at || '') || 0));
      return rows.slice(0, limit).map((row) => this._mapPmRequirementRow(row));
    }
    if (!await this.ensureReady()) return null;
    let sql = 'SELECT * FROM pm_requirement_registry';
    const clauses = [];
    const params = [];
    if (status) { clauses.push('status = ?'); params.push(status); }
    if (priority) { clauses.push('priority = ?'); params.push(priority); }
    if (query) { clauses.push('(LOWER(requirement_id) LIKE ? OR LOWER(title) LIKE ? OR LOWER(source_request) LIKE ?)'); params.push(`%${query}%`, `%${query}%`, `%${query}%`); }
    if (clauses.length > 0) sql += ` WHERE ${clauses.join(' AND ')}`;
    sql += ' ORDER BY updated_at DESC, requirement_id ASC LIMIT ?';
    params.push(limit);
    return (await this._withReadRetry(() => this._db.prepare(sql).all(...params))).map((row) => this._mapPmRequirementRow(row));
  }

  async getPmRequirement(requirementId) {
    const normalizedId = normalizeString(requirementId);
    if (!normalizedId) return null;
    if (this._useMemoryBackend()) return this._mapPmRequirementRow(this._memory.pm_requirements[normalizedId]);
    if (!await this.ensureReady()) return null;
    return this._mapPmRequirementRow(await this._withReadRetry(() => this._db.prepare('SELECT * FROM pm_requirement_registry WHERE requirement_id = ?').get(normalizedId)));
  }

  async upsertPmTracking(record = {}) {
    const nowIso = this.now();
    const normalized = {
      tracking_id: normalizeString(record.tracking_id),
      requirement_id: normalizeString(record.requirement_id),
      current_stage: normalizeString(record.current_stage) || 'clarifying',
      status: normalizeString(record.status) || 'normal',
      owner: normalizeString(record.owner) || null,
      latest_action: normalizeString(record.latest_action) || null,
      blocking_summary: normalizeString(record.blocking_summary) || null,
      next_action: normalizeString(record.next_action),
      risk_level: normalizeString(record.risk_level) || null,
      plan_ref: normalizeString(record.plan_ref) || null,
      issue_count: normalizeNonNegativeInteger(record.issue_count, 0),
      change_count: normalizeNonNegativeInteger(record.change_count, 0),
      eta: normalizeString(record.eta) || null,
      scene_ref: normalizeString(record.scene_ref) || null,
      spec_ref: normalizeString(record.spec_ref) || null,
      updated_at: normalizeIsoTimestamp(record.updated_at, nowIso) || nowIso,
      updated_by: normalizeString(record.updated_by) || null
    };
    if (!normalized.tracking_id || !normalized.requirement_id || !normalized.next_action) {
      throw new Error('tracking_id, requirement_id, and next_action are required');
    }
    if (this._useMemoryBackend()) {
      this._memory.pm_tracking[normalized.tracking_id] = { ...normalized };
      return this._mapPmTrackingRow(normalized);
    }
    if (!await this.ensureReady()) return null;
    this._db.prepare(`
      INSERT OR REPLACE INTO pm_tracking_registry(
        tracking_id, requirement_id, current_stage, status, owner, latest_action, blocking_summary,
        next_action, risk_level, plan_ref, issue_count, change_count, eta, scene_ref, spec_ref, updated_at, updated_by
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.tracking_id, normalized.requirement_id, normalized.current_stage, normalized.status,
      normalized.owner, normalized.latest_action, normalized.blocking_summary, normalized.next_action,
      normalized.risk_level, normalized.plan_ref, normalized.issue_count, normalized.change_count,
      normalized.eta, normalized.scene_ref, normalized.spec_ref, normalized.updated_at, normalized.updated_by
    );
    return this.getPmTracking(normalized.tracking_id);
  }

  async listPmTracking(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const status = normalizeString(options.status);
    const stage = normalizeString(options.currentStage || options.current_stage);
    const query = normalizeString(options.query).toLowerCase();
    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.pm_tracking || {}).map((item) => ({ ...item }));
      if (status) rows = rows.filter((item) => normalizeString(item.status) === status);
      if (stage) rows = rows.filter((item) => normalizeString(item.current_stage) === stage);
      if (query) rows = rows.filter((item) => [item.tracking_id, item.requirement_id, item.next_action].some((value) => `${value || ''}`.toLowerCase().includes(query)));
      rows.sort((left, right) => (Date.parse(right.updated_at || '') || 0) - (Date.parse(left.updated_at || '') || 0));
      return rows.slice(0, limit).map((row) => this._mapPmTrackingRow(row));
    }
    if (!await this.ensureReady()) return null;
    let sql = 'SELECT * FROM pm_tracking_registry';
    const clauses = [];
    const params = [];
    if (status) { clauses.push('status = ?'); params.push(status); }
    if (stage) { clauses.push('current_stage = ?'); params.push(stage); }
    if (query) { clauses.push('(LOWER(tracking_id) LIKE ? OR LOWER(requirement_id) LIKE ? OR LOWER(next_action) LIKE ?)'); params.push(`%${query}%`, `%${query}%`, `%${query}%`); }
    if (clauses.length > 0) sql += ` WHERE ${clauses.join(' AND ')}`;
    sql += ' ORDER BY updated_at DESC, tracking_id ASC LIMIT ?';
    params.push(limit);
    return (await this._withReadRetry(() => this._db.prepare(sql).all(...params))).map((row) => this._mapPmTrackingRow(row));
  }

  async getPmTracking(trackingId) {
    const normalizedId = normalizeString(trackingId);
    if (!normalizedId) return null;
    if (this._useMemoryBackend()) return this._mapPmTrackingRow(this._memory.pm_tracking[normalizedId]);
    if (!await this.ensureReady()) return null;
    return this._mapPmTrackingRow(await this._withReadRetry(() => this._db.prepare('SELECT * FROM pm_tracking_registry WHERE tracking_id = ?').get(normalizedId)));
  }

  async upsertPmPlan(record = {}) {
    const nowIso = this.now();
    const normalized = {
      plan_id: normalizeString(record.plan_id),
      title: normalizeString(record.title),
      scope: normalizeString(record.scope),
      status: normalizeString(record.status) || 'draft',
      owner: normalizeString(record.owner) || null,
      start_date: normalizeString(record.start_date) || null,
      due_date: normalizeString(record.due_date) || null,
      milestone: normalizeString(record.milestone) || null,
      risk_level: normalizeString(record.risk_level) || null,
      change_count: normalizeNonNegativeInteger(record.change_count, 0),
      issue_count: normalizeNonNegativeInteger(record.issue_count, 0),
      progress_summary: normalizeString(record.progress_summary) || null,
      next_checkpoint: normalizeString(record.next_checkpoint) || null,
      updated_at: normalizeIsoTimestamp(record.updated_at, nowIso) || nowIso,
      updated_by: normalizeString(record.updated_by) || null
    };
    if (!normalized.plan_id || !normalized.title || !normalized.scope) {
      throw new Error('plan_id, title, and scope are required');
    }
    if (this._useMemoryBackend()) {
      this._memory.pm_plans[normalized.plan_id] = { ...normalized };
      return this._mapPmPlanRow(normalized);
    }
    if (!await this.ensureReady()) return null;
    this._db.prepare(`
      INSERT OR REPLACE INTO pm_plan_registry(
        plan_id, title, scope, status, owner, start_date, due_date, milestone, risk_level,
        change_count, issue_count, progress_summary, next_checkpoint, updated_at, updated_by
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.plan_id, normalized.title, normalized.scope, normalized.status, normalized.owner,
      normalized.start_date, normalized.due_date, normalized.milestone, normalized.risk_level,
      normalized.change_count, normalized.issue_count, normalized.progress_summary,
      normalized.next_checkpoint, normalized.updated_at, normalized.updated_by
    );
    return this.getPmPlan(normalized.plan_id);
  }

  async listPmPlans(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const status = normalizeString(options.status);
    const query = normalizeString(options.query).toLowerCase();
    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.pm_plans || {}).map((item) => ({ ...item }));
      if (status) rows = rows.filter((item) => normalizeString(item.status) === status);
      if (query) rows = rows.filter((item) => [item.plan_id, item.title, item.scope].some((value) => `${value || ''}`.toLowerCase().includes(query)));
      rows.sort((left, right) => (Date.parse(right.updated_at || '') || 0) - (Date.parse(left.updated_at || '') || 0));
      return rows.slice(0, limit).map((row) => this._mapPmPlanRow(row));
    }
    if (!await this.ensureReady()) return null;
    let sql = 'SELECT * FROM pm_plan_registry';
    const clauses = [];
    const params = [];
    if (status) { clauses.push('status = ?'); params.push(status); }
    if (query) { clauses.push('(LOWER(plan_id) LIKE ? OR LOWER(title) LIKE ? OR LOWER(scope) LIKE ?)'); params.push(`%${query}%`, `%${query}%`, `%${query}%`); }
    if (clauses.length > 0) sql += ` WHERE ${clauses.join(' AND ')}`;
    sql += ' ORDER BY updated_at DESC, plan_id ASC LIMIT ?';
    params.push(limit);
    return (await this._withReadRetry(() => this._db.prepare(sql).all(...params))).map((row) => this._mapPmPlanRow(row));
  }

  async getPmPlan(planId) {
    const normalizedId = normalizeString(planId);
    if (!normalizedId) return null;
    if (this._useMemoryBackend()) return this._mapPmPlanRow(this._memory.pm_plans[normalizedId]);
    if (!await this.ensureReady()) return null;
    return this._mapPmPlanRow(await this._withReadRetry(() => this._db.prepare('SELECT * FROM pm_plan_registry WHERE plan_id = ?').get(normalizedId)));
  }

  async upsertPmChange(record = {}) {
    const nowIso = this.now();
    const normalized = {
      change_id: normalizeString(record.change_id),
      title: normalizeString(record.title),
      change_type: normalizeString(record.change_type),
      impact_scope: normalizeString(record.impact_scope),
      status: normalizeString(record.status) || 'draft',
      source: normalizeString(record.source) || null,
      owner: normalizeString(record.owner) || null,
      decision: normalizeString(record.decision) || null,
      decision_reason: normalizeString(record.decision_reason) || null,
      risk_level: normalizeString(record.risk_level) || null,
      affected_modules_json: JSON.stringify(normalizeStringArray(record.affected_modules, [])),
      affected_entities_json: JSON.stringify(normalizeStringArray(record.affected_entities, [])),
      updated_at: normalizeIsoTimestamp(record.updated_at, nowIso) || nowIso,
      updated_by: normalizeString(record.updated_by) || null
    };
    if (!normalized.change_id || !normalized.title || !normalized.change_type || !normalized.impact_scope) {
      throw new Error('change_id, title, change_type, and impact_scope are required');
    }
    if (this._useMemoryBackend()) {
      this._memory.pm_changes[normalized.change_id] = { ...normalized };
      return this._mapPmChangeRow(normalized);
    }
    if (!await this.ensureReady()) return null;
    this._db.prepare(`
      INSERT OR REPLACE INTO pm_change_request_registry(
        change_id, title, change_type, impact_scope, status, source, owner, decision,
        decision_reason, risk_level, affected_modules_json, affected_entities_json, updated_at, updated_by
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.change_id, normalized.title, normalized.change_type, normalized.impact_scope,
      normalized.status, normalized.source, normalized.owner, normalized.decision,
      normalized.decision_reason, normalized.risk_level, normalized.affected_modules_json,
      normalized.affected_entities_json, normalized.updated_at, normalized.updated_by
    );
    return this.getPmChange(normalized.change_id);
  }

  async listPmChanges(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const status = normalizeString(options.status);
    const query = normalizeString(options.query).toLowerCase();
    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.pm_changes || {}).map((item) => ({ ...item }));
      if (status) rows = rows.filter((item) => normalizeString(item.status) === status);
      if (query) rows = rows.filter((item) => [item.change_id, item.title, item.impact_scope].some((value) => `${value || ''}`.toLowerCase().includes(query)));
      rows.sort((left, right) => (Date.parse(right.updated_at || '') || 0) - (Date.parse(left.updated_at || '') || 0));
      return rows.slice(0, limit).map((row) => this._mapPmChangeRow(row));
    }
    if (!await this.ensureReady()) return null;
    let sql = 'SELECT * FROM pm_change_request_registry';
    const clauses = [];
    const params = [];
    if (status) { clauses.push('status = ?'); params.push(status); }
    if (query) { clauses.push('(LOWER(change_id) LIKE ? OR LOWER(title) LIKE ? OR LOWER(impact_scope) LIKE ?)'); params.push(`%${query}%`, `%${query}%`, `%${query}%`); }
    if (clauses.length > 0) sql += ` WHERE ${clauses.join(' AND ')}`;
    sql += ' ORDER BY updated_at DESC, change_id ASC LIMIT ?';
    params.push(limit);
    return (await this._withReadRetry(() => this._db.prepare(sql).all(...params))).map((row) => this._mapPmChangeRow(row));
  }

  async getPmChange(changeId) {
    const normalizedId = normalizeString(changeId);
    if (!normalizedId) return null;
    if (this._useMemoryBackend()) return this._mapPmChangeRow(this._memory.pm_changes[normalizedId]);
    if (!await this.ensureReady()) return null;
    return this._mapPmChangeRow(await this._withReadRetry(() => this._db.prepare('SELECT * FROM pm_change_request_registry WHERE change_id = ?').get(normalizedId)));
  }

  async upsertPmIssue(record = {}) {
    const nowIso = this.now();
    const normalized = {
      issue_id: normalizeString(record.issue_id),
      title: normalizeString(record.title),
      source: normalizeString(record.source),
      severity: normalizeString(record.severity),
      status: normalizeString(record.status) || 'new',
      requirement_id: normalizeString(record.requirement_id) || null,
      tracking_id: normalizeString(record.tracking_id) || null,
      owner: normalizeString(record.owner) || null,
      latest_action: normalizeString(record.latest_action) || null,
      expected_result: normalizeString(record.expected_result) || null,
      actual_result: normalizeString(record.actual_result) || null,
      fix_summary: normalizeString(record.fix_summary) || null,
      verify_result: normalizeString(record.verify_result) || null,
      root_cause: normalizeString(record.root_cause) || null,
      reported_by: normalizeString(record.reported_by) || null,
      updated_by: normalizeString(record.updated_by) || null,
      updated_at: normalizeIsoTimestamp(record.updated_at, nowIso) || nowIso
    };
    if (!normalized.issue_id || !normalized.title || !normalized.source || !normalized.severity) {
      throw new Error('issue_id, title, source, and severity are required');
    }
    if (this._useMemoryBackend()) {
      this._memory.pm_issues[normalized.issue_id] = { ...normalized };
      return this._mapPmIssueRow(normalized);
    }
    if (!await this.ensureReady()) return null;
    this._db.prepare(`
      INSERT OR REPLACE INTO pm_issue_registry(
        issue_id, title, source, severity, status, requirement_id, tracking_id, owner,
        latest_action, expected_result, actual_result, fix_summary, verify_result, root_cause,
        reported_by, updated_by, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.issue_id, normalized.title, normalized.source, normalized.severity, normalized.status,
      normalized.requirement_id, normalized.tracking_id, normalized.owner, normalized.latest_action,
      normalized.expected_result, normalized.actual_result, normalized.fix_summary, normalized.verify_result,
      normalized.root_cause, normalized.reported_by, normalized.updated_by, normalized.updated_at
    );
    return this.getPmIssue(normalized.issue_id);
  }

  async listPmIssues(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const status = normalizeString(options.status);
    const severity = normalizeString(options.severity);
    const query = normalizeString(options.query).toLowerCase();
    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.pm_issues || {}).map((item) => ({ ...item }));
      if (status) rows = rows.filter((item) => normalizeString(item.status) === status);
      if (severity) rows = rows.filter((item) => normalizeString(item.severity) === severity);
      if (query) rows = rows.filter((item) => [item.issue_id, item.title, item.requirement_id].some((value) => `${value || ''}`.toLowerCase().includes(query)));
      rows.sort((left, right) => (Date.parse(right.updated_at || '') || 0) - (Date.parse(left.updated_at || '') || 0));
      return rows.slice(0, limit).map((row) => this._mapPmIssueRow(row));
    }
    if (!await this.ensureReady()) return null;
    let sql = 'SELECT * FROM pm_issue_registry';
    const clauses = [];
    const params = [];
    if (status) { clauses.push('status = ?'); params.push(status); }
    if (severity) { clauses.push('severity = ?'); params.push(severity); }
    if (query) { clauses.push("(LOWER(issue_id) LIKE ? OR LOWER(title) LIKE ? OR LOWER(COALESCE(requirement_id, '')) LIKE ?)"); params.push(`%${query}%`, `%${query}%`, `%${query}%`); }
    if (clauses.length > 0) sql += ` WHERE ${clauses.join(' AND ')}`;
    sql += ' ORDER BY updated_at DESC, issue_id ASC LIMIT ?';
    params.push(limit);
    return (await this._withReadRetry(() => this._db.prepare(sql).all(...params))).map((row) => this._mapPmIssueRow(row));
  }

  async getPmIssue(issueId) {
    const normalizedId = normalizeString(issueId);
    if (!normalizedId) return null;
    if (this._useMemoryBackend()) return this._mapPmIssueRow(this._memory.pm_issues[normalizedId]);
    if (!await this.ensureReady()) return null;
    return this._mapPmIssueRow(await this._withReadRetry(() => this._db.prepare('SELECT * FROM pm_issue_registry WHERE issue_id = ?').get(normalizedId)));
  }


  async upsertOntologyErAsset(record = {}) {
    const nowIso = this.now();
    const normalized = {
      entity_id: normalizeString(record.entity_id),
      name: normalizeString(record.name),
      display_name: normalizeString(record.display_name) || null,
      description: normalizeString(record.description),
      status: normalizeString(record.status) || 'draft',
      key_fields_json: JSON.stringify(normalizeStringArray(record.key_fields, [])),
      attributes_json: JSON.stringify(Array.isArray(record.attributes) ? record.attributes : []),
      relations_json: JSON.stringify(Array.isArray(record.relations) ? record.relations : []),
      domain_scope: normalizeString(record.domain_scope) || null,
      owner: normalizeString(record.owner) || null,
      source_refs_json: JSON.stringify(normalizeStringArray(record.source_refs, [])),
      rule_refs_json: JSON.stringify(normalizeStringArray(record.rule_refs, [])),
      decision_refs_json: JSON.stringify(normalizeStringArray(record.decision_refs, [])),
      risk_level: normalizeString(record.risk_level) || null,
      updated_at: normalizeIsoTimestamp(record.updated_at, nowIso) || nowIso,
      updated_by: normalizeString(record.updated_by) || null
    };
    if (!normalized.entity_id || !normalized.name || !normalized.description) {
      throw new Error('entity_id, name, and description are required');
    }
    if (this._useMemoryBackend()) {
      this._memory.ontology_er_assets[normalized.entity_id] = { ...normalized };
      return this._mapOntologyErAssetRow(normalized);
    }
    if (!await this.ensureReady()) return null;
    this._db.prepare(`
      INSERT OR REPLACE INTO ontology_er_asset_registry(
        entity_id, name, display_name, description, status, key_fields_json, attributes_json,
        relations_json, domain_scope, owner, source_refs_json, rule_refs_json, decision_refs_json,
        risk_level, updated_at, updated_by
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.entity_id, normalized.name, normalized.display_name, normalized.description,
      normalized.status, normalized.key_fields_json, normalized.attributes_json, normalized.relations_json,
      normalized.domain_scope, normalized.owner, normalized.source_refs_json, normalized.rule_refs_json,
      normalized.decision_refs_json, normalized.risk_level, normalized.updated_at, normalized.updated_by
    );
    return this.getOntologyErAsset(normalized.entity_id);
  }

  async listOntologyErAssets(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const status = normalizeString(options.status);
    const query = normalizeString(options.query).toLowerCase();
    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.ontology_er_assets || {}).map((item) => ({ ...item }));
      if (status) rows = rows.filter((item) => normalizeString(item.status) === status);
      if (query) rows = rows.filter((item) => [item.entity_id, item.name, item.description].some((value) => `${value || ''}`.toLowerCase().includes(query)));
      rows.sort((left, right) => (Date.parse(right.updated_at || '') || 0) - (Date.parse(left.updated_at || '') || 0));
      return rows.slice(0, limit).map((row) => this._mapOntologyErAssetRow(row));
    }
    if (!await this.ensureReady()) return null;
    let sql = 'SELECT * FROM ontology_er_asset_registry';
    const clauses = [];
    const params = [];
    if (status) { clauses.push('status = ?'); params.push(status); }
    if (query) { clauses.push('(LOWER(entity_id) LIKE ? OR LOWER(name) LIKE ? OR LOWER(description) LIKE ?)'); params.push(`%${query}%`, `%${query}%`, `%${query}%`); }
    if (clauses.length > 0) sql += ` WHERE ${clauses.join(' AND ')}`;
    sql += ' ORDER BY updated_at DESC, entity_id ASC LIMIT ?';
    params.push(limit);
    return (await this._withReadRetry(() => this._db.prepare(sql).all(...params))).map((row) => this._mapOntologyErAssetRow(row));
  }

  async getOntologyErAsset(entityId) {
    const normalizedId = normalizeString(entityId);
    if (!normalizedId) return null;
    if (this._useMemoryBackend()) return this._mapOntologyErAssetRow(this._memory.ontology_er_assets[normalizedId]);
    if (!await this.ensureReady()) return null;
    return this._mapOntologyErAssetRow(await this._withReadRetry(() => this._db.prepare('SELECT * FROM ontology_er_asset_registry WHERE entity_id = ?').get(normalizedId)));
  }

  async upsertOntologyBrRule(record = {}) {
    const nowIso = this.now();
    const normalized = {
      rule_id: normalizeString(record.rule_id),
      title: normalizeString(record.title),
      scope: normalizeString(record.scope),
      rule_type: normalizeString(record.rule_type) || null,
      condition: normalizeString(record.condition),
      consequence: normalizeString(record.consequence),
      severity: normalizeString(record.severity) || null,
      status: normalizeString(record.status) || 'draft',
      owner: normalizeString(record.owner) || null,
      entity_refs_json: JSON.stringify(normalizeStringArray(record.entity_refs, [])),
      decision_refs_json: JSON.stringify(normalizeStringArray(record.decision_refs, [])),
      evidence_refs_json: JSON.stringify(normalizeStringArray(record.evidence_refs, [])),
      updated_at: normalizeIsoTimestamp(record.updated_at, nowIso) || nowIso,
      updated_by: normalizeString(record.updated_by) || null
    };
    if (!normalized.rule_id || !normalized.title || !normalized.scope || !normalized.condition || !normalized.consequence) {
      throw new Error('rule_id, title, scope, condition, and consequence are required');
    }
    if (this._useMemoryBackend()) {
      this._memory.ontology_br_rules[normalized.rule_id] = { ...normalized };
      return this._mapOntologyBrRuleRow(normalized);
    }
    if (!await this.ensureReady()) return null;
    this._db.prepare(`
      INSERT OR REPLACE INTO ontology_br_rule_registry(
        rule_id, title, scope, rule_type, condition, consequence, severity, status,
        owner, entity_refs_json, decision_refs_json, evidence_refs_json, updated_at, updated_by
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.rule_id, normalized.title, normalized.scope, normalized.rule_type,
      normalized.condition, normalized.consequence, normalized.severity, normalized.status,
      normalized.owner, normalized.entity_refs_json, normalized.decision_refs_json,
      normalized.evidence_refs_json, normalized.updated_at, normalized.updated_by
    );
    return this.getOntologyBrRule(normalized.rule_id);
  }

  async listOntologyBrRules(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const status = normalizeString(options.status);
    const query = normalizeString(options.query).toLowerCase();
    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.ontology_br_rules || {}).map((item) => ({ ...item }));
      if (status) rows = rows.filter((item) => normalizeString(item.status) === status);
      if (query) rows = rows.filter((item) => [item.rule_id, item.title, item.scope].some((value) => `${value || ''}`.toLowerCase().includes(query)));
      rows.sort((left, right) => (Date.parse(right.updated_at || '') || 0) - (Date.parse(left.updated_at || '') || 0));
      return rows.slice(0, limit).map((row) => this._mapOntologyBrRuleRow(row));
    }
    if (!await this.ensureReady()) return null;
    let sql = 'SELECT * FROM ontology_br_rule_registry';
    const clauses = [];
    const params = [];
    if (status) { clauses.push('status = ?'); params.push(status); }
    if (query) { clauses.push('(LOWER(rule_id) LIKE ? OR LOWER(title) LIKE ? OR LOWER(scope) LIKE ?)'); params.push(`%${query}%`, `%${query}%`, `%${query}%`); }
    if (clauses.length > 0) sql += ` WHERE ${clauses.join(' AND ')}`;
    sql += ' ORDER BY updated_at DESC, rule_id ASC LIMIT ?';
    params.push(limit);
    return (await this._withReadRetry(() => this._db.prepare(sql).all(...params))).map((row) => this._mapOntologyBrRuleRow(row));
  }

  async getOntologyBrRule(ruleId) {
    const normalizedId = normalizeString(ruleId);
    if (!normalizedId) return null;
    if (this._useMemoryBackend()) return this._mapOntologyBrRuleRow(this._memory.ontology_br_rules[normalizedId]);
    if (!await this.ensureReady()) return null;
    return this._mapOntologyBrRuleRow(await this._withReadRetry(() => this._db.prepare('SELECT * FROM ontology_br_rule_registry WHERE rule_id = ?').get(normalizedId)));
  }

  async upsertOntologyDlChain(record = {}) {
    const nowIso = this.now();
    const normalized = {
      chain_id: normalizeString(record.chain_id),
      title: normalizeString(record.title),
      description: normalizeString(record.description) || null,
      trigger: normalizeString(record.trigger),
      decision_nodes_json: JSON.stringify(Array.isArray(record.decision_nodes) ? record.decision_nodes : []),
      outputs_json: JSON.stringify(Array.isArray(record.outputs) ? record.outputs : []),
      status: normalizeString(record.status) || 'draft',
      entity_refs_json: JSON.stringify(normalizeStringArray(record.entity_refs, [])),
      rule_refs_json: JSON.stringify(normalizeStringArray(record.rule_refs, [])),
      owner: normalizeString(record.owner) || null,
      input_schema_ref: normalizeString(record.input_schema_ref) || null,
      output_schema_ref: normalizeString(record.output_schema_ref) || null,
      risk_level: normalizeString(record.risk_level) || null,
      updated_at: normalizeIsoTimestamp(record.updated_at, nowIso) || nowIso,
      updated_by: normalizeString(record.updated_by) || null
    };
    if (!normalized.chain_id || !normalized.title || !normalized.trigger) {
      throw new Error('chain_id, title, and trigger are required');
    }
    if (this._useMemoryBackend()) {
      this._memory.ontology_dl_chains[normalized.chain_id] = { ...normalized };
      return this._mapOntologyDlChainRow(normalized);
    }
    if (!await this.ensureReady()) return null;
    this._db.prepare(`
      INSERT OR REPLACE INTO ontology_dl_chain_registry(
        chain_id, title, description, trigger, decision_nodes_json, outputs_json, status,
        entity_refs_json, rule_refs_json, owner, input_schema_ref, output_schema_ref,
        risk_level, updated_at, updated_by
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.chain_id, normalized.title, normalized.description, normalized.trigger,
      normalized.decision_nodes_json, normalized.outputs_json, normalized.status,
      normalized.entity_refs_json, normalized.rule_refs_json, normalized.owner,
      normalized.input_schema_ref, normalized.output_schema_ref, normalized.risk_level,
      normalized.updated_at, normalized.updated_by
    );
    return this.getOntologyDlChain(normalized.chain_id);
  }

  async listOntologyDlChains(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const status = normalizeString(options.status);
    const query = normalizeString(options.query).toLowerCase();
    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.ontology_dl_chains || {}).map((item) => ({ ...item }));
      if (status) rows = rows.filter((item) => normalizeString(item.status) === status);
      if (query) rows = rows.filter((item) => [item.chain_id, item.title, item.trigger].some((value) => `${value || ''}`.toLowerCase().includes(query)));
      rows.sort((left, right) => (Date.parse(right.updated_at || '') || 0) - (Date.parse(left.updated_at || '') || 0));
      return rows.slice(0, limit).map((row) => this._mapOntologyDlChainRow(row));
    }
    if (!await this.ensureReady()) return null;
    let sql = 'SELECT * FROM ontology_dl_chain_registry';
    const clauses = [];
    const params = [];
    if (status) { clauses.push('status = ?'); params.push(status); }
    if (query) { clauses.push('(LOWER(chain_id) LIKE ? OR LOWER(title) LIKE ? OR LOWER(trigger) LIKE ?)'); params.push(`%${query}%`, `%${query}%`, `%${query}%`); }
    if (clauses.length > 0) sql += ` WHERE ${clauses.join(' AND ')}`;
    sql += ' ORDER BY updated_at DESC, chain_id ASC LIMIT ?';
    params.push(limit);
    return (await this._withReadRetry(() => this._db.prepare(sql).all(...params))).map((row) => this._mapOntologyDlChainRow(row));
  }

  async getOntologyDlChain(chainId) {
    const normalizedId = normalizeString(chainId);
    if (!normalizedId) return null;
    if (this._useMemoryBackend()) return this._mapOntologyDlChainRow(this._memory.ontology_dl_chains[normalizedId]);
    if (!await this.ensureReady()) return null;
    return this._mapOntologyDlChainRow(await this._withReadRetry(() => this._db.prepare('SELECT * FROM ontology_dl_chain_registry WHERE chain_id = ?').get(normalizedId)));
  }

  async buildOntologyTriadSummary(options = {}) {
    const [erItems, brItems, dlItems] = await Promise.all([
      this.listOntologyErAssets({ limit: normalizeInteger(options.limit, 1000) }),
      this.listOntologyBrRules({ limit: normalizeInteger(options.limit, 1000) }),
      this.listOntologyDlChains({ limit: normalizeInteger(options.limit, 1000) })
    ]);
    const safeEr = Array.isArray(erItems) ? erItems : [];
    const safeBr = Array.isArray(brItems) ? brItems : [];
    const safeDl = Array.isArray(dlItems) ? dlItems : [];
    const triads = {
      entity_relation: safeEr.length > 0,
      business_rules: safeBr.length > 0,
      decision_strategy: safeDl.length > 0
    };
    const readyCount = Object.values(triads).filter(Boolean).length;
    const missing = Object.entries(triads).filter(([, value]) => value !== true).map(([key]) => key);
    return {
      ontology_core: {
        entity_relation: safeEr.map((item) => item.entity_id),
        business_rules: safeBr.map((item) => item.rule_id),
        decision_strategy: safeDl.map((item) => item.chain_id)
      },
      ontology_core_ui: {
        ready: readyCount === 3,
        coverage_percent: Number(((readyCount / 3) * 100).toFixed(2)),
        missing,
        triads
      },
      counts: {
        entity_relation: safeEr.length,
        business_rules: safeBr.length,
        decision_strategy: safeDl.length
      }
    };
  }


  async upsertAssuranceResourceSnapshot(record = {}) {
    const nowIso = this.now();
    const normalized = {
      snapshot_id: normalizeString(record.snapshot_id),
      scope: normalizeString(record.scope) || null,
      status: normalizeString(record.status) || 'unknown',
      resource_type: normalizeString(record.resource_type) || null,
      resource_name: normalizeString(record.resource_name),
      summary: normalizeString(record.summary) || null,
      metric_json: JSON.stringify(record.metric && typeof record.metric === 'object' ? record.metric : {}),
      source: normalizeString(record.source) || null,
      updated_at: normalizeIsoTimestamp(record.updated_at, nowIso) || nowIso,
      updated_by: normalizeString(record.updated_by) || null
    };
    if (!normalized.snapshot_id || !normalized.resource_name) {
      throw new Error('snapshot_id and resource_name are required');
    }
    if (this._useMemoryBackend()) {
      this._memory.assurance_resource_snapshots[normalized.snapshot_id] = { ...normalized };
      return this._mapAssuranceResourceSnapshotRow(normalized);
    }
    if (!await this.ensureReady()) return null;
    this._db.prepare(`
      INSERT OR REPLACE INTO assurance_resource_snapshot_registry(
        snapshot_id, scope, status, resource_type, resource_name, summary, metric_json, source, updated_at, updated_by
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.snapshot_id, normalized.scope, normalized.status, normalized.resource_type,
      normalized.resource_name, normalized.summary, normalized.metric_json, normalized.source,
      normalized.updated_at, normalized.updated_by
    );
    return this._mapAssuranceResourceSnapshotRow(normalized);
  }

  async listAssuranceResourceSnapshots(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const status = normalizeString(options.status);
    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.assurance_resource_snapshots || {}).map((item) => ({ ...item }));
      if (status) rows = rows.filter((item) => normalizeString(item.status) === status);
      rows.sort((left, right) => (Date.parse(right.updated_at || '') || 0) - (Date.parse(left.updated_at || '') || 0));
      return rows.slice(0, limit).map((row) => this._mapAssuranceResourceSnapshotRow(row));
    }
    if (!await this.ensureReady()) return null;
    let sql = 'SELECT * FROM assurance_resource_snapshot_registry';
    const params = [];
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY updated_at DESC, snapshot_id ASC LIMIT ?';
    params.push(limit);
    return (await this._withReadRetry(() => this._db.prepare(sql).all(...params))).map((row) => this._mapAssuranceResourceSnapshotRow(row));
  }

  async upsertAssuranceLogView(record = {}) {
    const nowIso = this.now();
    const normalized = {
      view_id: normalizeString(record.view_id),
      title: normalizeString(record.title),
      source: normalizeString(record.source) || null,
      status: normalizeString(record.status) || 'ready',
      summary: normalizeString(record.summary) || null,
      path_ref: normalizeString(record.path_ref) || null,
      filter_json: JSON.stringify(record.filter && typeof record.filter === 'object' ? record.filter : {}),
      updated_at: normalizeIsoTimestamp(record.updated_at, nowIso) || nowIso,
      updated_by: normalizeString(record.updated_by) || null
    };
    if (!normalized.view_id || !normalized.title) {
      throw new Error('view_id and title are required');
    }
    if (this._useMemoryBackend()) {
      this._memory.assurance_log_views[normalized.view_id] = { ...normalized };
      return this._mapAssuranceLogViewRow(normalized);
    }
    if (!await this.ensureReady()) return null;
    this._db.prepare(`
      INSERT OR REPLACE INTO assurance_log_view_registry(
        view_id, title, source, status, summary, path_ref, filter_json, updated_at, updated_by
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.view_id, normalized.title, normalized.source, normalized.status,
      normalized.summary, normalized.path_ref, normalized.filter_json, normalized.updated_at, normalized.updated_by
    );
    return this._mapAssuranceLogViewRow(normalized);
  }

  async listAssuranceLogViews(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const status = normalizeString(options.status);
    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.assurance_log_views || {}).map((item) => ({ ...item }));
      if (status) rows = rows.filter((item) => normalizeString(item.status) === status);
      rows.sort((left, right) => (Date.parse(right.updated_at || '') || 0) - (Date.parse(left.updated_at || '') || 0));
      return rows.slice(0, limit).map((row) => this._mapAssuranceLogViewRow(row));
    }
    if (!await this.ensureReady()) return null;
    let sql = 'SELECT * FROM assurance_log_view_registry';
    const params = [];
    if (status) { sql += ' WHERE status = ?'; params.push(status); }
    sql += ' ORDER BY updated_at DESC, view_id ASC LIMIT ?';
    params.push(limit);
    return (await this._withReadRetry(() => this._db.prepare(sql).all(...params))).map((row) => this._mapAssuranceLogViewRow(row));
  }

  async upsertAssuranceBackupRecord(record = {}) {
    const nowIso = this.now();
    const normalized = {
      backup_id: normalizeString(record.backup_id),
      title: normalizeString(record.title),
      backup_type: normalizeString(record.backup_type) || null,
      scope: normalizeString(record.scope) || null,
      status: normalizeString(record.status) || 'ready',
      summary: normalizeString(record.summary) || null,
      storage_ref: normalizeString(record.storage_ref) || null,
      recoverable: normalizeBooleanValue(record.recoverable, false),
      generated_at: normalizeString(record.generated_at) || null,
      updated_at: normalizeIsoTimestamp(record.updated_at, nowIso) || nowIso,
      updated_by: normalizeString(record.updated_by) || null
    };
    if (!normalized.backup_id || !normalized.title) {
      throw new Error('backup_id and title are required');
    }
    if (this._useMemoryBackend()) {
      this._memory.assurance_backup_records[normalized.backup_id] = { ...normalized };
      return this._mapAssuranceBackupRecordRow(normalized);
    }
    if (!await this.ensureReady()) return null;
    this._db.prepare(`
      INSERT OR REPLACE INTO assurance_backup_record_registry(
        backup_id, title, backup_type, scope, status, summary, storage_ref, recoverable, generated_at, updated_at, updated_by
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.backup_id, normalized.title, normalized.backup_type, normalized.scope,
      normalized.status, normalized.summary, normalized.storage_ref, normalized.recoverable ? 1 : 0,
      normalized.generated_at, normalized.updated_at, normalized.updated_by
    );
    return this._mapAssuranceBackupRecordRow(normalized);
  }

  async listAssuranceBackupRecords(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const status = normalizeString(options.status);
    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.assurance_backup_records || {}).map((item) => ({ ...item }));
      if (status) rows = rows.filter((item) => normalizeString(item.status) === status);
      rows.sort((left, right) => (Date.parse(right.updated_at || '') || 0) - (Date.parse(left.updated_at || '') || 0));
      return rows.slice(0, limit).map((row) => this._mapAssuranceBackupRecordRow(row));
    }
    if (!await this.ensureReady()) return null;
    let sql = 'SELECT * FROM assurance_backup_record_registry';
    const params = [];
    if (status) { sql += ' WHERE status = ?'; params.push(status); }
    sql += ' ORDER BY updated_at DESC, backup_id ASC LIMIT ?';
    params.push(limit);
    return (await this._withReadRetry(() => this._db.prepare(sql).all(...params))).map((row) => this._mapAssuranceBackupRecordRow(row));
  }

  async upsertAssuranceConfigSwitch(record = {}) {
    const nowIso = this.now();
    const normalized = {
      switch_id: normalizeString(record.switch_id),
      title: normalizeString(record.title),
      scope: normalizeString(record.scope) || null,
      switch_key: normalizeString(record.switch_key),
      desired_state: normalizeString(record.desired_state) || null,
      actual_state: normalizeString(record.actual_state) || null,
      status: normalizeString(record.status) || 'ready',
      summary: normalizeString(record.summary) || null,
      owner: normalizeString(record.owner) || null,
      updated_at: normalizeIsoTimestamp(record.updated_at, nowIso) || nowIso,
      updated_by: normalizeString(record.updated_by) || null
    };
    if (!normalized.switch_id || !normalized.title || !normalized.switch_key) {
      throw new Error('switch_id, title, and switch_key are required');
    }
    if (this._useMemoryBackend()) {
      this._memory.assurance_config_switches[normalized.switch_id] = { ...normalized };
      return this._mapAssuranceConfigSwitchRow(normalized);
    }
    if (!await this.ensureReady()) return null;
    this._db.prepare(`
      INSERT OR REPLACE INTO assurance_config_switch_registry(
        switch_id, title, scope, switch_key, desired_state, actual_state, status, summary, owner, updated_at, updated_by
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.switch_id, normalized.title, normalized.scope, normalized.switch_key,
      normalized.desired_state, normalized.actual_state, normalized.status, normalized.summary,
      normalized.owner, normalized.updated_at, normalized.updated_by
    );
    return this._mapAssuranceConfigSwitchRow(normalized);
  }

  async listAssuranceConfigSwitches(options = {}) {
    const limit = normalizeInteger(options.limit, 100);
    const status = normalizeString(options.status);
    if (this._useMemoryBackend()) {
      let rows = Object.values(this._memory.assurance_config_switches || {}).map((item) => ({ ...item }));
      if (status) rows = rows.filter((item) => normalizeString(item.status) === status);
      rows.sort((left, right) => (Date.parse(right.updated_at || '') || 0) - (Date.parse(left.updated_at || '') || 0));
      return rows.slice(0, limit).map((row) => this._mapAssuranceConfigSwitchRow(row));
    }
    if (!await this.ensureReady()) return null;
    let sql = 'SELECT * FROM assurance_config_switch_registry';
    const params = [];
    if (status) { sql += ' WHERE status = ?'; params.push(status); }
    sql += ' ORDER BY updated_at DESC, switch_id ASC LIMIT ?';
    params.push(limit);
    return (await this._withReadRetry(() => this._db.prepare(sql).all(...params))).map((row) => this._mapAssuranceConfigSwitchRow(row));
  }

  _resolveOrCreateTaskRefInMemory(options = {}) {
    const sceneId = normalizeString(options.sceneId);
    const specId = normalizeString(options.specId);
    const taskKey = normalizeString(options.taskKey);
    const source = normalizeString(options.source) || 'unknown';
    const metadata = options.metadata && typeof options.metadata === 'object'
      ? options.metadata
      : {};
    const nowIso = this.now();

    if (!this._memory.scenes[sceneId]) {
      this._memory.scenes[sceneId] = normalizeInteger(this._memory.sequences.scene_next, 1);
      this._memory.sequences.scene_next = this._memory.scenes[sceneId] + 1;
    }
    const sceneNo = this._memory.scenes[sceneId];

    const sceneSpecKey = `${sceneId}::${specId}`;
    if (!this._memory.specs[sceneSpecKey]) {
      const nextSpec = normalizeInteger(this._memory.sequences.spec_next_by_scene[sceneId], 1);
      this._memory.specs[sceneSpecKey] = nextSpec;
      this._memory.sequences.spec_next_by_scene[sceneId] = nextSpec + 1;
    }
    const specNo = this._memory.specs[sceneSpecKey];

    const tupleKey = `${sceneId}::${specId}::${taskKey}`;
    if (this._memory.tasks[tupleKey]) {
      const existing = this._memory.tasks[tupleKey];
      existing.source = source;
      existing.metadata = { ...(existing.metadata || {}), ...metadata };
      existing.updated_at = nowIso;
      this._memory.refs[existing.task_ref] = existing;
      return { ...existing, metadata: { ...(existing.metadata || {}) } };
    }

    const nextTask = normalizeInteger(this._memory.sequences.task_next_by_scene_spec[sceneSpecKey], 1);
    const taskNo = nextTask;
    this._memory.sequences.task_next_by_scene_spec[sceneSpecKey] = nextTask + 1;
    const taskRef = buildTaskRef(sceneNo, specNo, taskNo);

    const row = {
      task_ref: taskRef,
      scene_id: sceneId,
      spec_id: specId,
      task_key: taskKey,
      scene_no: sceneNo,
      spec_no: specNo,
      task_no: taskNo,
      source,
      metadata: { ...metadata },
      created_at: nowIso,
      updated_at: nowIso
    };
    this._memory.tasks[tupleKey] = row;
    this._memory.refs[taskRef] = row;
    return { ...row, metadata: { ...(row.metadata || {}) } };
  }

  _issueAuthLeaseInMemory(options = {}) {
    const leaseId = normalizeString(options.leaseId)
      || `lease-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const row = {
      lease_id: leaseId,
      subject: normalizeString(options.subject) || 'unknown',
      role: normalizeString(options.role) || 'maintainer',
      scope: normalizeStringArray(options.scope, ['project:*']),
      reason: normalizeString(options.reason) || null,
      metadata: options.metadata && typeof options.metadata === 'object' ? { ...options.metadata } : {},
      issued_at: normalizeIsoTimestamp(options.issuedAt, this.now()) || this.now(),
      expires_at: normalizeIsoTimestamp(options.expiresAt, this.now()) || this.now(),
      revoked_at: null,
      created_at: normalizeIsoTimestamp(options.nowIso, this.now()) || this.now(),
      updated_at: normalizeIsoTimestamp(options.nowIso, this.now()) || this.now()
    };
    this._memory.auth_leases[leaseId] = row;
    return {
      ...row,
      scope: normalizeStringArray(row.scope, ['project:*']),
      metadata: { ...(row.metadata || {}) }
    };
  }
}

const STORE_CACHE = new Map();

function getSceStateStore(projectPath = process.cwd(), options = {}) {
  const normalizedRoot = path.resolve(projectPath);
  if (options.noCache === true) {
    return new SceStateStore(normalizedRoot, options);
  }

  if (!STORE_CACHE.has(normalizedRoot)) {
    STORE_CACHE.set(normalizedRoot, new SceStateStore(normalizedRoot, options));
  }

  return STORE_CACHE.get(normalizedRoot);
}

module.exports = {
  DEFAULT_BACKEND,
  DEFAULT_DB_RELATIVE_PATH,
  SceStateStore,
  getSceStateStore,
  resolveBackend,
  buildTaskRef,
  formatSegment
};
