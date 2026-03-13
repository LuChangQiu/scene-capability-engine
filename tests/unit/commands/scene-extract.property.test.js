const fc = require('fast-check');

const { validateSceneExtractOptions } = require('../../../lib/commands/scene');

describe('Scene extract option properties', () => {
  test('validateSceneExtractOptions rejects invalid type and pattern strings', async () => {
    const invalidTypeArb = fc.stringMatching(/^[a-z]{1,12}$/)
      .filter((value) => !['entities', 'services', 'screens'].includes(value));
    const invalidPatternArb = fc.stringMatching(/^[a-z]{1,12}$/)
      .filter((value) => !['crud', 'query', 'workflow'].includes(value));

    await fc.assert(
      fc.property(invalidTypeArb, invalidPatternArb, (invalidType, invalidPattern) => {
        expect(validateSceneExtractOptions({ type: invalidType })).toContain('invalid --type');
        expect(validateSceneExtractOptions({ pattern: invalidPattern })).toContain('invalid --pattern');
      }),
      { numRuns: 100 }
    );
  });
});
