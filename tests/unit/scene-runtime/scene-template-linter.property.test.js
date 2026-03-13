const fc = require('fast-check');

const {
  checkActionAbstraction,
  checkDataLineage,
  checkAgentHints,
  scoreAgentReadiness
} = require('../../../lib/scene-runtime/scene-template-linter');

const segmentArb = fc.stringMatching(/^[a-z]{1,8}$/);
const refArb = fc.array(segmentArb, { minLength: 1, maxLength: 4 }).map((segments) => segments.join('.'));
const stringListArb = fc.array(fc.string({ maxLength: 12 }), { maxLength: 3 });

function sortedCodes(items) {
  return items.map((item) => item.code).sort();
}

describe('Scene template linter properties', () => {
  test('checkActionAbstraction emits exactly the warnings and errors implied by generated bindings', async () => {
    const bindingSpecArb = fc.uniqueArray(
      fc.record({
        ref: refArb,
        intentMode: fc.constantFrom('absent', 'empty', 'value'),
        preconditionsMode: fc.constantFrom('absent', 'valid', 'invalid'),
        postconditionsMode: fc.constantFrom('absent', 'valid', 'invalid'),
        preconditions: stringListArb,
        postconditions: stringListArb
      }),
      {
        selector: (binding) => binding.ref,
        maxLength: 8
      }
    );

    await fc.assert(
      fc.property(bindingSpecArb, (bindingSpecs) => {
        const bindings = bindingSpecs.map((spec) => {
          const binding = { ref: spec.ref };
          if (spec.intentMode === 'empty') {
            binding.intent = '';
          } else if (spec.intentMode === 'value') {
            binding.intent = 'described';
          }

          if (spec.preconditionsMode === 'valid') {
            binding.preconditions = spec.preconditions;
          } else if (spec.preconditionsMode === 'invalid') {
            binding.preconditions = ['ok', 1];
          }

          if (spec.postconditionsMode === 'valid') {
            binding.postconditions = spec.postconditions;
          } else if (spec.postconditionsMode === 'invalid') {
            binding.postconditions = [null];
          }

          return binding;
        });

        const result = checkActionAbstraction({
          capability_contract: {
            bindings
          }
        });

        const expectedCodes = [];
        bindingSpecs.forEach((spec) => {
          if (spec.intentMode === 'empty') {
            expectedCodes.push('EMPTY_INTENT');
          }
          if (spec.preconditionsMode === 'invalid') {
            expectedCodes.push('INVALID_PRECONDITIONS');
          }
          if (spec.postconditionsMode === 'invalid') {
            expectedCodes.push('INVALID_POSTCONDITIONS');
          }
        });

        expect(sortedCodes(result)).toEqual(expectedCodes.sort());
      }),
      { numRuns: 100 }
    );
  });

  test('checkDataLineage reports missing source and sink refs exactly when they are absent from bindings', async () => {
    const lineageEntryArb = fc.record({
      ref: refArb,
      fields: stringListArb
    });

    await fc.assert(
      fc.property(
        fc.uniqueArray(refArb, { maxLength: 6 }),
        fc.array(lineageEntryArb, { maxLength: 6 }),
        fc.array(lineageEntryArb, { maxLength: 6 }),
        (bindingRefs, sources, sinks) => {
          const result = checkDataLineage({
            capability_contract: {
              bindings: bindingRefs.map((ref) => ({ ref }))
            },
            governance_contract: {
              data_lineage: {
                sources,
                sinks
              }
            }
          });

          const bindingSet = new Set(bindingRefs);
          const expectedSourceWarnings = sources.filter((source) => !bindingSet.has(source.ref)).length;
          const expectedSinkWarnings = sinks.filter((sink) => !bindingSet.has(sink.ref)).length;

          expect(result.filter((item) => item.code === 'LINEAGE_SOURCE_NOT_IN_BINDINGS')).toHaveLength(expectedSourceWarnings);
          expect(result.filter((item) => item.code === 'LINEAGE_SINK_NOT_IN_BINDINGS')).toHaveLength(expectedSinkWarnings);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('checkAgentHints emits only the summary, complexity, and duration issues present in generated hints', async () => {
    const hintsSpecArb = fc.record({
      summaryMode: fc.constantFrom('absent', 'empty', 'value'),
      complexityMode: fc.constantFrom('absent', 'valid', 'invalid'),
      durationMode: fc.constantFrom('absent', 'valid', 'zero', 'negative', 'float', 'string')
    });

    await fc.assert(
      fc.property(hintsSpecArb, (spec) => {
        const hints = {};

        if (spec.summaryMode === 'empty') {
          hints.summary = '';
        } else if (spec.summaryMode === 'value') {
          hints.summary = 'workflow';
        }

        if (spec.complexityMode === 'valid') {
          hints.complexity = 'medium';
        } else if (spec.complexityMode === 'invalid') {
          hints.complexity = 'extreme';
        }

        if (spec.durationMode === 'valid') {
          hints.estimated_duration_ms = 1000;
        } else if (spec.durationMode === 'zero') {
          hints.estimated_duration_ms = 0;
        } else if (spec.durationMode === 'negative') {
          hints.estimated_duration_ms = -10;
        } else if (spec.durationMode === 'float') {
          hints.estimated_duration_ms = 3.14;
        } else if (spec.durationMode === 'string') {
          hints.estimated_duration_ms = 'fast';
        }

        const result = checkAgentHints({ agent_hints: hints });
        const expectedCodes = [];

        if (spec.summaryMode === 'empty') {
          expectedCodes.push('EMPTY_AGENT_SUMMARY');
        }
        if (spec.complexityMode === 'invalid') {
          expectedCodes.push('INVALID_AGENT_COMPLEXITY');
        }
        if (['zero', 'negative', 'float', 'string'].includes(spec.durationMode)) {
          expectedCodes.push('INVALID_AGENT_DURATION');
        }

        expect(sortedCodes(result)).toEqual(expectedCodes.sort());
      }),
      { numRuns: 100 }
    );
  });

  test('scoreAgentReadiness follows the documented 4/3/3 scoring contract', async () => {
    const readinessSpecArb = fc.record({
      hasHints: fc.boolean(),
      summaryMode: fc.constantFrom('absent', 'empty', 'value'),
      complexityMode: fc.constantFrom('absent', 'valid', 'invalid'),
      sequenceMode: fc.constantFrom('absent', 'empty', 'valid', 'invalid')
    });

    await fc.assert(
      fc.property(readinessSpecArb, (spec) => {
        const contract = {};

        if (spec.hasHints) {
          contract.agent_hints = {};
          if (spec.summaryMode === 'empty') {
            contract.agent_hints.summary = '';
          } else if (spec.summaryMode === 'value') {
            contract.agent_hints.summary = 'workflow';
          }

          if (spec.complexityMode === 'valid') {
            contract.agent_hints.complexity = 'high';
          } else if (spec.complexityMode === 'invalid') {
            contract.agent_hints.complexity = 'extreme';
          }

          if (spec.sequenceMode === 'empty') {
            contract.agent_hints.suggested_sequence = [];
          } else if (spec.sequenceMode === 'valid') {
            contract.agent_hints.suggested_sequence = ['step-1'];
          } else if (spec.sequenceMode === 'invalid') {
            contract.agent_hints.suggested_sequence = 'step-1';
          }
        }

        const result = scoreAgentReadiness({ _context: { contract } });

        if (!spec.hasHints) {
          expect(result).toEqual({ score: 0, details: {} });
          return;
        }

        const expectedSummary = spec.summaryMode === 'value' ? 4 : 0;
        const expectedComplexity = spec.complexityMode === 'valid' ? 3 : 0;
        const expectedSequence = spec.sequenceMode === 'valid' ? 3 : 0;

        expect(result).toEqual({
          score: expectedSummary + expectedComplexity + expectedSequence,
          details: {
            summary: expectedSummary,
            complexity: expectedComplexity,
            suggested_sequence: expectedSequence
          }
        });
      }),
      { numRuns: 100 }
    );
  });
});
