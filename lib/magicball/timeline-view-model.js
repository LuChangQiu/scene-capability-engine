function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function summarizeTimelineAttention(entry = {}) {
  const trigger = normalizeText(entry.trigger).toLowerCase();
  const git = entry && typeof entry.git === 'object' ? entry.git : {};
  if (trigger === 'restore') {
    return 'high';
  }
  if (trigger === 'push') {
    return 'medium';
  }
  if (Number(git.dirty_count || 0) > 0) {
    return 'medium';
  }
  return 'low';
}

function buildTimelineEntryViewModel(entry = {}) {
  const title = normalizeText(entry.summary) || ((normalizeText(entry.trigger) || 'timeline') + ' checkpoint');
  const subtitleParts = [
    normalizeText(entry.event),
    entry.scene_id ? ('scene=' + entry.scene_id) : '',
    Number.isFinite(Number(entry.file_count)) ? ('files=' + Number(entry.file_count)) : ''
  ].filter(Boolean);
  return {
    snapshot_id: normalizeText(entry.snapshot_id) || null,
    title,
    subtitle: subtitleParts.join(' | '),
    trigger: normalizeText(entry.trigger) || null,
    event: normalizeText(entry.event) || null,
    created_at: normalizeText(entry.created_at) || null,
    scene_id: normalizeText(entry.scene_id) || null,
    session_id: normalizeText(entry.session_id) || null,
    file_count: Number.isFinite(Number(entry.file_count)) ? Number(entry.file_count) : 0,
    branch: entry && entry.git ? normalizeText(entry.git.branch) || null : null,
    head: entry && entry.git ? normalizeText(entry.git.head) || null : null,
    dirty_count: entry && entry.git && Number.isFinite(Number(entry.git.dirty_count)) ? Number(entry.git.dirty_count) : 0,
    attention_level: summarizeTimelineAttention(entry),
    show_command: normalizeText(entry.snapshot_id) ? ('sce timeline show ' + entry.snapshot_id + ' --json') : null,
    restore_command: normalizeText(entry.snapshot_id) ? ('sce timeline restore ' + entry.snapshot_id + ' --json') : null
  };
}

function buildTimelineListViewModel(payload = {}) {
  const snapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];
  const trigger_counts = {};
  let dirty_snapshot_count = 0;
  const sceneIds = new Set();
  for (const item of snapshots) {
    const trigger = normalizeText(item.trigger) || 'unknown';
    trigger_counts[trigger] = Number(trigger_counts[trigger] || 0) + 1;
    if (item.scene_id) {
      sceneIds.add(item.scene_id);
    }
    if (item.git && item.git.dirty) {
      dirty_snapshot_count += 1;
    }
  }
  return {
    summary: {
      total: Number(payload.total || snapshots.length || 0),
      latest_snapshot_id: snapshots[0] ? normalizeText(snapshots[0].snapshot_id) || null : null,
      latest_created_at: snapshots[0] ? normalizeText(snapshots[0].created_at) || null : null,
      dirty_snapshot_count,
      scene_count: sceneIds.size,
      trigger_counts
    },
    entries: snapshots.map((item) => buildTimelineEntryViewModel(item))
  };
}

function buildTimelineShowViewModel(payload = {}) {
  const snapshot = payload.snapshot && typeof payload.snapshot === 'object' ? payload.snapshot : {};
  const filesPayload = payload.files && typeof payload.files === 'object' ? payload.files : {};
  const files = Array.isArray(filesPayload.files) ? filesPayload.files : [];
  return {
    snapshot: buildTimelineEntryViewModel(snapshot),
    files_preview: files.slice(0, 20),
    file_preview_count: Math.min(files.length, 20),
    file_total: Number(filesPayload.file_count || files.length || 0),
    restore_command: snapshot.snapshot_id ? ('sce timeline restore ' + snapshot.snapshot_id + ' --json') : null
  };
}

module.exports = {
  summarizeTimelineAttention,
  buildTimelineEntryViewModel,
  buildTimelineListViewModel,
  buildTimelineShowViewModel
};
