function buildStatusCounts(entries = [], normalizeStatusToken = (value) => value) {
  const counts = {};
  const safeEntries = Array.isArray(entries) ? entries : [];
  for (const entry of safeEntries) {
    const status = normalizeStatusToken(entry && entry.status) || 'unknown';
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function buildQueueFormatCounts(entries = []) {
  const counts = {};
  const safeEntries = Array.isArray(entries) ? entries : [];
  for (const entry of safeEntries) {
    const format = String(entry && entry.queue_format ? entry.queue_format : '').trim().toLowerCase() || 'unknown';
    counts[format] = (counts[format] || 0) + 1;
  }
  return counts;
}

function buildMasterSpecCounts(entries = []) {
  const counts = {};
  const safeEntries = Array.isArray(entries) ? entries : [];
  for (const entry of safeEntries) {
    const masterSpec = String(entry && entry.master_spec ? entry.master_spec : '').trim();
    if (!masterSpec) {
      continue;
    }
    counts[masterSpec] = (counts[masterSpec] || 0) + 1;
  }
  return counts;
}

function buildTopCountEntries(counterMap, limit = 10) {
  const source = counterMap && typeof counterMap === 'object' ? counterMap : {};
  const maxItems = Number.isInteger(limit) && limit > 0 ? limit : 10;
  return Object.entries(source)
    .map(([key, count]) => ({ key, count: Number(count) || 0 }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.key.localeCompare(right.key);
    })
    .slice(0, maxItems);
}

module.exports = {
  buildStatusCounts,
  buildQueueFormatCounts,
  buildMasterSpecCounts,
  buildTopCountEntries
};
