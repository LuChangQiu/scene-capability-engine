'use strict';

const DEFAULT_STATE_STORAGE_POLICY = Object.freeze({
  schema_version: '1.0',
  strategy: 'selective-sqlite-advancement',
  tiers: {
    'file-source': {
      description: 'Canonical file-backed storage for low-cardinality config, raw evidence, audit streams, and recovery-oriented payloads.'
    },
    'sqlite-index': {
      description: 'SQLite index/registry layer for file-backed resources that need high-frequency filtering, sorting, and cross-run aggregation.'
    },
    'derived-sqlite-projection': {
      description: 'Disposable SQLite projection rebuilt from canonical files for append-only streams with query pressure.'
    }
  },
  admission: {
    required_signals: [
      'cross-run or cross-session query pressure is proven',
      'file scans are materially weaker than indexed filtering/sorting',
      'sqlite content remains rebuildable from a canonical source',
      'operator diagnostics and reconcile path are defined before rollout'
    ],
    deny_if_any: [
      'resource is the only copy of raw audit or evidence payload',
      'resource is low-cardinality personal workspace or preference state',
      'human-readable diff and manual recovery are more valuable than query speed',
      'migration would introduce silent source-of-truth cutover'
    ],
    future_candidate_checklist: [
      'identify canonical source path or stream',
      'document expected query patterns and consumers',
      'define rebuild and reconcile semantics',
      'define release gate or audit behavior for drift states',
      'document why existing file-only storage is insufficient'
    ]
  },
  component_scope: [
    {
      component_id: 'collab.agent-registry',
      tier: 'sqlite-index',
      canonical_source: 'file',
      source_path: '.sce/config/agent-registry.json',
      sqlite_tables: ['agent_runtime_registry'],
      rationale: 'Registry-style lookup with repeated status and capability queries.'
    },
    {
      component_id: 'runtime.timeline-index',
      tier: 'sqlite-index',
      canonical_source: 'file',
      source_path: '.sce/timeline/index.json',
      sqlite_tables: ['timeline_snapshot_registry'],
      rationale: 'Timeline index benefits from filtered and cross-session reads while file snapshots remain recoverable source artifacts.'
    },
    {
      component_id: 'runtime.scene-session-index',
      tier: 'sqlite-index',
      canonical_source: 'file',
      source_path: '.sce/session-governance/scene-index.json',
      sqlite_tables: ['scene_session_cycle_registry'],
      rationale: 'Scene/session lookups have query pressure and consistency checks but still rely on file session payloads.'
    },
    {
      component_id: 'errorbook.entry-index',
      tier: 'sqlite-index',
      canonical_source: 'file',
      source_path: '.sce/errorbook/index.json',
      sqlite_tables: ['errorbook_entry_index_registry'],
      rationale: 'Promoted errorbook registry queries benefit from indexed status and quality filtering.'
    },
    {
      component_id: 'errorbook.incident-index',
      tier: 'sqlite-index',
      canonical_source: 'file',
      source_path: '.sce/errorbook/staging/index.json',
      sqlite_tables: ['errorbook_incident_index_registry'],
      rationale: 'Incident staging state requires queryable triage views without replacing raw incident artifacts.'
    },
    {
      component_id: 'governance.spec-scene-overrides',
      tier: 'sqlite-index',
      canonical_source: 'file',
      source_path: '.sce/spec-governance/spec-scene-overrides.json',
      sqlite_tables: ['governance_spec_scene_override_registry'],
      rationale: 'Override lookups are registry-like and join naturally with other governance indexes.'
    },
    {
      component_id: 'governance.scene-index',
      tier: 'sqlite-index',
      canonical_source: 'file',
      source_path: '.sce/spec-governance/scene-index.json',
      sqlite_tables: ['governance_scene_index_registry'],
      rationale: 'Scene governance summaries are better served by indexed counts and status filters.'
    },
    {
      component_id: 'release.evidence-runs-index',
      tier: 'sqlite-index',
      canonical_source: 'file',
      source_path: '.sce/reports/release-evidence/handoff-runs.json',
      sqlite_tables: ['release_evidence_run_registry'],
      rationale: 'Release evidence run summaries need fast historical querying while release assets remain file-backed.'
    },
    {
      component_id: 'release.gate-history-index',
      tier: 'sqlite-index',
      canonical_source: 'file',
      source_path: '.sce/reports/release-evidence/release-gate-history.json',
      sqlite_tables: ['release_gate_history_registry'],
      rationale: 'Gate history is registry-shaped and queried by tag, pass/fail, and drift metrics.'
    }
  ],
  resource_rules: [
    {
      rule_id: 'workspace-personal-state',
      tier: 'file-source',
      explicit_paths: ['~/.sce/workspace-state.json'],
      derived_projection_allowed: false,
      source_replacement_allowed: false,
      rationale: 'Personal workspace selection and preferences are low-cardinality, atomic, and not worth migrating into SQLite.'
    },
    {
      rule_id: 'append-only-report-streams',
      tier: 'file-source',
      path_patterns: ['.sce/reports/**/*.jsonl'],
      derived_projection_allowed: true,
      source_replacement_allowed: false,
      rationale: 'Raw governance and evidence streams must stay append-only files; projection is allowed only for query acceleration.'
    },
    {
      rule_id: 'append-only-audit-streams',
      tier: 'file-source',
      path_patterns: ['.sce/audit/**/*.jsonl'],
      derived_projection_allowed: true,
      source_replacement_allowed: false,
      rationale: 'Audit streams remain canonical evidence and should never become SQLite-only write paths.'
    },
    {
      rule_id: 'timeline-snapshot-payloads',
      tier: 'file-source',
      path_patterns: ['.sce/timeline/snapshots/**'],
      derived_projection_allowed: false,
      source_replacement_allowed: false,
      rationale: 'Timeline snapshots are recovery-oriented payload artifacts, not registry data.'
    },
    {
      rule_id: 'session-payload-artifacts',
      tier: 'file-source',
      path_patterns: ['.sce/session-governance/sessions/**'],
      derived_projection_allowed: false,
      source_replacement_allowed: false,
      rationale: 'Session payloads must stay file-backed for recovery, archive, and manual debugging.'
    },
    {
      rule_id: 'release-evidence-assets',
      tier: 'file-source',
      path_patterns: [
        '.sce/reports/release-evidence/**/*.json',
        '.sce/reports/release-evidence/**/*.md',
        '.sce/reports/release-evidence/**/*.jsonl',
        '.sce/reports/release-evidence/**/*.lines'
      ],
      derived_projection_allowed: true,
      source_replacement_allowed: false,
      rationale: 'Release evidence assets remain portable files even when selected summary indexes are mirrored into SQLite.'
    }
  ]
});

const REQUIRED_COMPONENT_IDS = Object.freeze(DEFAULT_STATE_STORAGE_POLICY.component_scope.map((item) => item.component_id));

function cloneStateStoragePolicyDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE_STORAGE_POLICY));
}

module.exports = {
  DEFAULT_STATE_STORAGE_POLICY,
  REQUIRED_COMPONENT_IDS,
  cloneStateStoragePolicyDefaults
};
