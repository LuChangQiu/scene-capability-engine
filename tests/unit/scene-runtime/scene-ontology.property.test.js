const fc = require('fast-check');

const {
  OntologyGraph,
  VALID_RELATION_TYPES,
  buildOntologyFromManifest,
  validateOntology,
  queryDependencyChain,
  getActionInfo
} = require('../../../lib/scene-runtime/scene-ontology');

const segmentArb = fc.stringMatching(/^[a-z]{1,8}$/);
const refArb = fc.array(segmentArb, { minLength: 1, maxLength: 4 }).map((segments) => segments.join('.'));
const metadataArb = fc.record({
  type: fc.constantFrom('query', 'mutation', 'workflow'),
  timeout_ms: fc.integer({ min: 1, max: 20000 }),
  intent: fc.option(fc.string({ maxLength: 24 }), { nil: null }),
  preconditions: fc.array(fc.string({ maxLength: 16 }), { maxLength: 3 }),
  postconditions: fc.array(fc.string({ maxLength: 16 }), { maxLength: 3 })
});

const nodeEntriesArb = fc.uniqueArray(
  fc.record({
    ref: refArb,
    metadata: metadataArb
  }),
  {
    selector: (entry) => entry.ref,
    minLength: 1,
    maxLength: 6
  }
);

const graphFixtureArb = nodeEntriesArb.chain((nodes) => {
  const refs = nodes.map((node) => node.ref);
  return fc.record({
    nodes: fc.constant(nodes),
    edges: fc.uniqueArray(
      fc.record({
        source: fc.constantFrom(...refs),
        target: fc.constantFrom(...refs),
        type: fc.constantFrom(...VALID_RELATION_TYPES)
      }),
      {
        selector: (edge) => `${edge.source}->${edge.target}:${edge.type}`,
        maxLength: Math.min(16, refs.length * refs.length * VALID_RELATION_TYPES.length)
      }
    )
  });
});

const bindingFixtureArb = fc.uniqueArray(refArb, {
  minLength: 1,
  maxLength: 6
}).chain((refs) => fc.record({
  refs: fc.constant(refs),
  types: fc.array(fc.constantFrom('query', 'mutation', 'workflow'), { minLength: refs.length, maxLength: refs.length }),
  timeouts: fc.array(fc.integer({ min: 1, max: 20000 }), { minLength: refs.length, maxLength: refs.length }),
  intents: fc.array(fc.option(fc.string({ maxLength: 24 }), { nil: null }), { minLength: refs.length, maxLength: refs.length }),
  preconditions: fc.array(fc.array(fc.string({ maxLength: 16 }), { maxLength: 3 }), { minLength: refs.length, maxLength: refs.length }),
  postconditions: fc.array(fc.array(fc.string({ maxLength: 16 }), { maxLength: 3 }), { minLength: refs.length, maxLength: refs.length }),
  dependsOnIndexes: fc.array(fc.option(fc.integer({ min: 0, max: refs.length - 1 }), { nil: null }), { minLength: refs.length, maxLength: refs.length })
}).map((fixture) => ({
  bindings: fixture.refs.map((ref, index) => {
    const binding = {
      ref,
      type: fixture.types[index],
      timeout_ms: fixture.timeouts[index],
      preconditions: fixture.preconditions[index],
      postconditions: fixture.postconditions[index]
    };
    if (fixture.intents[index] !== null) {
      binding.intent = fixture.intents[index];
    }
    if (fixture.dependsOnIndexes[index] !== null) {
      binding.depends_on = fixture.refs[fixture.dependsOnIndexes[index]];
    }
    return binding;
  })
})));

function sortNodes(nodes) {
  return nodes
    .slice()
    .sort((left, right) => left.ref.localeCompare(right.ref));
}

function sortEdges(edges) {
  return edges
    .slice()
    .sort((left, right) => {
      const sourceOrder = left.source.localeCompare(right.source);
      if (sourceOrder !== 0) return sourceOrder;
      const targetOrder = left.target.localeCompare(right.target);
      if (targetOrder !== 0) return targetOrder;
      return left.type.localeCompare(right.type);
    });
}

function sharedPrefix(ref) {
  const segments = ref.split('.');
  if (segments.length < 2) {
    return null;
  }
  return segments.slice(0, -1).join('.');
}

describe('Scene ontology properties', () => {
  test('OntologyGraph preserves addNode/getNode round-trips for unique refs', async () => {
    await fc.assert(
      fc.property(nodeEntriesArb, (nodes) => {
        const graph = new OntologyGraph();
        nodes.forEach((node) => graph.addNode(node.ref, node.metadata));

        expect(sortNodes(graph.getAllNodes())).toEqual(sortNodes(nodes));
        nodes.forEach((node) => {
          expect(graph.getNode(node.ref)).toEqual(node);
        });
      }),
      { numRuns: 100 }
    );
  });

  test('OntologyGraph edge storage matches inserted valid edges and rejects invalid types', async () => {
    const invalidRelationTypeArb = fc.string({ minLength: 1, maxLength: 16 }).filter(
      (value) => !VALID_RELATION_TYPES.includes(value)
    );

    await fc.assert(
      fc.property(graphFixtureArb, invalidRelationTypeArb, (fixture, invalidType) => {
        const graph = new OntologyGraph();
        fixture.nodes.forEach((node) => graph.addNode(node.ref, node.metadata));
        fixture.edges.forEach((edge) => graph.addEdge(edge.source, edge.target, edge.type));

        fixture.nodes.forEach((node) => {
          const expectedEdges = fixture.edges.filter((edge) => edge.source === node.ref);
          expect(graph.getEdges(node.ref)).toEqual(expectedEdges);
        });
        expect(sortEdges(graph.getAllEdges())).toEqual(sortEdges(fixture.edges));

        if (fixture.nodes.length >= 1) {
          const ref = fixture.nodes[0].ref;
          expect(() => graph.addEdge(ref, ref, invalidType)).toThrow('Invalid relation type');
        }
      }),
      { numRuns: 100 }
    );
  });

  test('OntologyGraph serialization round-trips nodes and edges losslessly', async () => {
    await fc.assert(
      fc.property(graphFixtureArb, (fixture) => {
        const graph = new OntologyGraph();
        fixture.nodes.forEach((node) => graph.addNode(node.ref, node.metadata));
        fixture.edges.forEach((edge) => graph.addEdge(edge.source, edge.target, edge.type));

        const restored = OntologyGraph.fromJSON(graph.toJSON());
        expect(sortNodes(restored.getAllNodes())).toEqual(sortNodes(graph.getAllNodes()));
        expect(sortEdges(restored.getAllEdges())).toEqual(sortEdges(graph.getAllEdges()));
      }),
      { numRuns: 100 }
    );
  });

  test('buildOntologyFromManifest creates the expected nodes, composes edges, and depends_on edges', async () => {
    await fc.assert(
      fc.property(bindingFixtureArb, ({ bindings }) => {
        const graph = buildOntologyFromManifest({
          capability_contract: {
            bindings
          }
        });

        const expectedRefs = bindings.map((binding) => binding.ref);
        expect(sortNodes(graph.getAllNodes()).map((node) => node.ref)).toEqual(expectedRefs.slice().sort());

        const expectedDependsOnEdges = bindings
          .filter((binding) => typeof binding.depends_on === 'string' && expectedRefs.includes(binding.depends_on))
          .map((binding) => ({
            source: binding.ref,
            target: binding.depends_on,
            type: 'depends_on'
          }));

        const actualDependsOnEdges = graph.getAllEdges().filter((edge) => edge.type === 'depends_on');
        expect(sortEdges(actualDependsOnEdges)).toEqual(sortEdges(expectedDependsOnEdges));

        const actualComposesEdges = graph.getAllEdges().filter((edge) => edge.type === 'composes');
        const expectedComposesEdges = [];
        for (let i = 0; i < expectedRefs.length; i++) {
          for (let j = i + 1; j < expectedRefs.length; j++) {
            if (sharedPrefix(expectedRefs[i]) && sharedPrefix(expectedRefs[i]) === sharedPrefix(expectedRefs[j])) {
              expectedComposesEdges.push(
                { source: expectedRefs[i], target: expectedRefs[j], type: 'composes' },
                { source: expectedRefs[j], target: expectedRefs[i], type: 'composes' }
              );
            }
          }
        }
        expect(sortEdges(actualComposesEdges)).toEqual(sortEdges(expectedComposesEdges));
      }),
      { numRuns: 100 }
    );
  });

  test('validateOntology reports one dangling-edge error per edge whose target node was removed', async () => {
    const danglingFixtureArb = nodeEntriesArb.chain((nodes) => {
      const refs = nodes.map((node) => node.ref);
      return fc.uniqueArray(
        fc.record({
          source: fc.constantFrom(...refs),
          target: fc.constantFrom(...refs),
          type: fc.constantFrom('composes', 'extends', 'produces')
        }),
        {
          selector: (edge) => `${edge.source}->${edge.target}:${edge.type}`,
          minLength: 1,
          maxLength: Math.min(12, refs.length * refs.length * 3)
        }
      ).chain((edges) => {
        const targetRefs = Array.from(new Set(edges.map((edge) => edge.target)));
        return fc.record({
          nodes: fc.constant(nodes),
          edges: fc.constant(edges),
          removedTargets: fc.subarray(targetRefs, { minLength: 1 })
        });
      });
    });

    await fc.assert(
      fc.property(danglingFixtureArb, (fixture) => {
        const graph = new OntologyGraph();
        fixture.nodes.forEach((node) => graph.addNode(node.ref, node.metadata));
        fixture.edges.forEach((edge) => graph.addEdge(edge.source, edge.target, edge.type));
        fixture.removedTargets.forEach((ref) => graph._nodes.delete(ref));

        const result = validateOntology(graph);
        const expectedCount = fixture.edges.filter((edge) => fixture.removedTargets.includes(edge.target)).length;
        const danglingErrors = result.errors.filter((error) => error.code === 'DANGLING_EDGE_TARGET');

        expect(result.valid).toBe(false);
        expect(danglingErrors).toHaveLength(expectedCount);
      }),
      { numRuns: 100 }
    );
  });

  test('validateOntology flags depends_on cycles for generated cyclic graphs', async () => {
    await fc.assert(
      fc.property(fc.uniqueArray(refArb, { minLength: 1, maxLength: 6 }), (refs) => {
        const graph = new OntologyGraph();
        refs.forEach((ref) => graph.addNode(ref));

        if (refs.length === 1) {
          graph.addEdge(refs[0], refs[0], 'depends_on');
        } else {
          refs.forEach((ref, index) => {
            const nextRef = refs[(index + 1) % refs.length];
            graph.addEdge(ref, nextRef, 'depends_on');
          });
        }

        const result = validateOntology(graph);
        const cycleError = result.errors.find((error) => error.code === 'CYCLE_DETECTED');

        expect(result.valid).toBe(false);
        expect(cycleError).toBeDefined();
        expect(cycleError.details.cycle[0]).toBe(cycleError.details.cycle[cycleError.details.cycle.length - 1]);
        refs.forEach((ref) => {
          expect(cycleError.details.cycle).toContain(ref);
        });
      }),
      { numRuns: 100 }
    );
  });

  test('queryDependencyChain returns the full transitive depends_on chain for linear dependency graphs', async () => {
    await fc.assert(
      fc.property(fc.uniqueArray(refArb, { minLength: 1, maxLength: 6 }), (refs) => {
        const graph = new OntologyGraph();
        refs.forEach((ref) => graph.addNode(ref));
        for (let index = 0; index < refs.length - 1; index++) {
          graph.addEdge(refs[index], refs[index + 1], 'depends_on');
        }

        const result = queryDependencyChain(graph, refs[0]);
        expect(result).toEqual({
          ref: refs[0],
          chain: refs.slice(1),
          hasCycle: false
        });
      }),
      { numRuns: 100 }
    );
  });

  test('buildOntologyFromManifest and getActionInfo preserve action abstraction fields', async () => {
    await fc.assert(
      fc.property(bindingFixtureArb, ({ bindings }) => {
        const graph = buildOntologyFromManifest({
          capability_contract: {
            bindings
          }
        });

        bindings.forEach((binding) => {
          expect(getActionInfo(graph, binding.ref)).toEqual({
            ref: binding.ref,
            intent: typeof binding.intent === 'string' && binding.intent.length > 0 ? binding.intent : null,
            preconditions: Array.isArray(binding.preconditions) ? binding.preconditions : [],
            postconditions: Array.isArray(binding.postconditions) ? binding.postconditions : []
          });
        });
      }),
      { numRuns: 100 }
    );
  });
});
