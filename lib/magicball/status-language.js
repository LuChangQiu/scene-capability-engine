const TONE_BY_ATTENTION = Object.freeze({
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'success'
});

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function buildMagicballStatusLanguage(input = {}) {
  const attention = normalizeText(input.attention_level) || 'medium';
  return {
    attention_level: attention,
    status_tone: TONE_BY_ATTENTION[attention] || 'info',
    status_label: normalizeText(input.status_label) || null,
    blocking_summary: normalizeText(input.blocking_summary) || null,
    recommended_action: normalizeText(input.recommended_action) || null
  };
}

module.exports = {
  buildMagicballStatusLanguage,
  TONE_BY_ATTENTION
};
