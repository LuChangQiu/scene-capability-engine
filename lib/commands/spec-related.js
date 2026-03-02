const chalk = require('chalk');
const { findRelatedSpecs } = require('../spec/related-specs');

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

async function runSpecRelatedCommand(options = {}, dependencies = {}) {
  const query = normalizeText(options.query);
  const sceneId = normalizeText(options.scene);
  const specId = normalizeText(options.spec);

  if (!query && !sceneId && !specId) {
    throw new Error('At least one selector is required: --query or --scene or --spec');
  }

  const payload = await findRelatedSpecs({
    query,
    sceneId,
    sourceSpecId: specId,
    limit: options.limit
  }, dependencies);

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(chalk.blue('Related Specs'));
    console.log(`  Query: ${payload.query || '(none)'}`);
    console.log(`  Scene: ${payload.scene_id || '(none)'}`);
    console.log(`  Source Spec: ${payload.source_spec_id || '(none)'}`);
    console.log(`  Candidates: ${payload.total_candidates}`);
    for (const item of payload.related_specs) {
      console.log(`  - ${item.spec_id} | score=${item.score} | scene=${item.scene_id || 'n/a'}`);
    }
  }

  return payload;
}

function registerSpecRelatedCommand(program) {
  program
    .command('spec-related')
    .description('Find previously related Specs by query/scene context')
    .option('--query <text>', 'Problem statement or search query')
    .option('--scene <scene-id>', 'Scene id for scene-aligned lookup')
    .option('--spec <spec-id>', 'Use existing spec as query seed')
    .option('--limit <n>', 'Maximum related specs to return', '5')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
      try {
        await runSpecRelatedCommand(options);
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: error.message }, null, 2));
        } else {
          console.error(chalk.red('❌ spec-related failed:'), error.message);
        }
        process.exit(1);
      }
    });
}

module.exports = {
  runSpecRelatedCommand,
  registerSpecRelatedCommand
};

