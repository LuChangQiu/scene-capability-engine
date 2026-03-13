const fc = require('fast-check');

const {
  validateTemplateVariableSchema,
  validateTemplateVariables,
  renderTemplateContent,
  resolveTemplateInheritance,
  validateScenePackageContract
} = require('../../../lib/commands/scene');

const safeTokenArb = fc.stringMatching(/^[a-z][a-z0-9]{0,10}$/);
const textArb = fc.stringMatching(/^[A-Za-z0-9 _.-]{1,20}$/);
const variableNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/);

function truthyAccordingToRenderer(value) {
  if (value === null || value === undefined || value === false || value === 0 || value === '') {
    return false;
  }
  if (Array.isArray(value) && value.length === 0) {
    return false;
  }
  return true;
}

const validSchemaEntryArb = fc.oneof(
  fc.record({
    name: variableNameArb,
    type: fc.constant('string'),
    required: fc.boolean(),
    description: textArb,
    validation: fc.option(fc.record({ regex: fc.constant('^[a-z]+$') }), { nil: undefined })
  }).map((schema) => ({
    schema: schema.validation === undefined
      ? {
        name: schema.name,
        type: schema.type,
        required: schema.required,
        description: schema.description
      }
      : schema,
    value: schema.validation ? 'alpha' : 'text'
  })),
  fc.record({
    name: variableNameArb,
    type: fc.constant('number'),
    required: fc.boolean(),
    description: textArb,
    validation: fc.option(
      fc.record({
        min: fc.integer({ min: 0, max: 50 }),
        max: fc.integer({ min: 51, max: 100 })
      }),
      { nil: undefined }
    )
  }).map((schema) => ({
    schema: schema.validation === undefined
      ? {
        name: schema.name,
        type: schema.type,
        required: schema.required,
        description: schema.description
      }
      : schema,
    value: schema.validation ? schema.validation.min : 42
  })),
  fc.record({
    name: variableNameArb,
    type: fc.constant('boolean'),
    required: fc.boolean(),
    description: textArb
  }).map((schema) => ({ schema, value: true })),
  fc.record({
    name: variableNameArb,
    type: fc.constant('enum'),
    required: fc.boolean(),
    description: textArb,
    validation: fc.record({
      enum_values: fc.uniqueArray(safeTokenArb, { minLength: 1, maxLength: 4 })
    })
  }).map((schema) => ({ schema, value: schema.validation.enum_values[0] })),
  fc.record({
    name: variableNameArb,
    type: fc.constant('array'),
    required: fc.boolean(),
    description: textArb
  }).map((schema) => ({ schema, value: ['a', 'b'] }))
);

describe('Scene template engine foundation properties', () => {
  test('validateTemplateVariableSchema accepts valid schema declarations', async () => {
    await fc.assert(
      fc.property(
        fc.uniqueArray(validSchemaEntryArb, { selector: (entry) => entry.schema.name, maxLength: 8 }),
        (entries) => {
          const result = validateTemplateVariableSchema(entries.map((entry) => entry.schema));
          expect(result.valid).toBe(true);
          expect(result.errors).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('validateTemplateVariableSchema rejects unsupported variable types', async () => {
    await fc.assert(
      fc.property(
        variableNameArb,
        fc.string({ minLength: 1, maxLength: 12 }).filter((type) => !['string', 'number', 'boolean', 'enum', 'array'].includes(type)),
        (name, type) => {
          const result = validateTemplateVariableSchema([
            { name, type, description: 'invalid type example' }
          ]);

          expect(result.valid).toBe(false);
          expect(result.errors.some((error) => error.includes(`type "${type}" is not supported`))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('validateTemplateVariables accepts valid schema and values', async () => {
    await fc.assert(
      fc.property(
        fc.uniqueArray(validSchemaEntryArb, { selector: (entry) => entry.schema.name, maxLength: 8 }),
        (entries) => {
          const schema = entries.map((entry) => entry.schema);
          const values = Object.fromEntries(entries.map((entry) => [entry.schema.name, entry.value]));
          const result = validateTemplateVariables(schema, values);

          expect(result.valid).toBe(true);
          expect(result.errors).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('validateTemplateVariables fills defaults for required variables when values are omitted', async () => {
    await fc.assert(
      fc.property(variableNameArb, textArb, (name, defaultValue) => {
        const schema = [{
          name,
          type: 'string',
          required: true,
          default: defaultValue,
          description: 'Defaulted string'
        }];
        const result = validateTemplateVariables(schema, {});

        expect(result.valid).toBe(true);
        expect(result.resolved[name]).toBe(defaultValue);
      }),
      { numRuns: 100 }
    );
  });

  test('validateTemplateVariables reports missing required variables without defaults', async () => {
    await fc.assert(
      fc.property(variableNameArb, (name) => {
        const result = validateTemplateVariables([{
          name,
          type: 'string',
          required: true,
          description: 'Required string'
        }], {});

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(`variable "${name}": required but not provided`);
      }),
      { numRuns: 100 }
    );
  });

  test('validateTemplateVariables enforces regex, enum, and number range rules', async () => {
    const invalidRuleFixtureArb = fc.oneof(
      variableNameArb.map((name) => ({
        schema: [{ name, type: 'string', required: true, description: 'Regex rule', validation: { regex: '^[a-z]+$' } }],
        values: { [name]: '123' },
        expectedFragment: `variable "${name}": value "123" does not match regex pattern "^[a-z]+$"`
      })),
      variableNameArb.map((name) => ({
        schema: [{ name, type: 'enum', required: true, description: 'Enum rule', validation: { enum_values: ['red', 'blue'] } }],
        values: { [name]: 'green' },
        expectedFragment: `variable "${name}": value "green" is not one of the allowed values (red, blue)`
      })),
      variableNameArb.map((name) => ({
        schema: [{ name, type: 'number', required: true, description: 'Range rule', validation: { min: 10, max: 20 } }],
        values: { [name]: 5 },
        expectedFragment: `variable "${name}": value 5 is less than minimum 10`
      }))
    );

    await fc.assert(
      fc.property(invalidRuleFixtureArb, (fixture) => {
        const result = validateTemplateVariables(fixture.schema, fixture.values);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(fixture.expectedFragment);
      }),
      { numRuns: 100 }
    );
  });

  test('validateTemplateVariables collects every missing-required error instead of stopping early', async () => {
    await fc.assert(
      fc.property(
        fc.uniqueArray(variableNameArb, { minLength: 1, maxLength: 8 }),
        (names) => {
          const schema = names.map((name) => ({
            name,
            type: 'string',
            required: true,
            description: 'Required variable'
          }));
          const result = validateTemplateVariables(schema, {});

          expect(result.valid).toBe(false);
          expect(result.errors).toHaveLength(names.length);
          names.forEach((name) => {
            expect(result.errors).toContain(`variable "${name}": required but not provided`);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  test('renderTemplateContent replaces simple placeholders with supplied values', async () => {
    await fc.assert(
      fc.property(
        fc.uniqueArray(variableNameArb, { minLength: 1, maxLength: 6 }),
        fc.array(safeTokenArb, { minLength: 1, maxLength: 6 }),
        (names, valuesRaw) => {
          const values = Object.fromEntries(names.map((name, index) => [name, valuesRaw[index % valuesRaw.length]]));
          const template = names.map((name) => `{{${name}}}`).join('|');
          const rendered = renderTemplateContent(template, values);

          expect(rendered).toBe(names.map((name) => values[name]).join('|'));
        }
      ),
      { numRuns: 100 }
    );
  });

  test('renderTemplateContent includes conditional bodies iff the controlling value is truthy', async () => {
    const conditionalValueArb = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.boolean(),
      fc.integer({ min: 0, max: 2 }),
      fc.constant(''),
      safeTokenArb,
      fc.array(safeTokenArb, { maxLength: 2 })
    );

    await fc.assert(
      fc.property(conditionalValueArb, (value) => {
        const rendered = renderTemplateContent('pre{{#if flag}}BODY{{/if}}post', { flag: value });
        expect(rendered.includes('BODY')).toBe(truthyAccordingToRenderer(value));
      }),
      { numRuns: 100 }
    );
  });

  test('renderTemplateContent expands each blocks once per item with this substitution', async () => {
    await fc.assert(
      fc.property(fc.array(safeTokenArb, { maxLength: 6 }), (items) => {
        const rendered = renderTemplateContent('{{#each items}}<{{this}}>{{/each}}', { items });
        expect(rendered).toBe(items.map((item) => `<${item}>`).join(''));
      }),
      { numRuns: 100 }
    );
  });

  test('renderTemplateContent is idempotent for the same safe values', async () => {
    const contentArb = fc.record({
      prefix: textArb,
      suffix: textArb,
      name: safeTokenArb,
      items: fc.array(safeTokenArb, { maxLength: 4 }),
      flag: fc.boolean()
    }).map(({ prefix, suffix, name, items, flag }) => ({
      template: `${prefix} {{name}} {{#if flag}}FLAG{{/if}} {{#each items}}[{{this}}]{{/each}} ${suffix}`,
      values: { name, items, flag }
    }));

    await fc.assert(
      fc.property(contentArb, ({ template, values }) => {
        const first = renderTemplateContent(template, values);
        const second = renderTemplateContent(first, values);
        expect(second).toBe(first);
      }),
      { numRuns: 100 }
    );
  });

  test('renderTemplateContent removes all placeholder markers when every simple placeholder is supplied', async () => {
    await fc.assert(
      fc.property(fc.uniqueArray(variableNameArb, { minLength: 1, maxLength: 6 }), (names) => {
        const values = Object.fromEntries(names.map((name, index) => [name, `value${index}`]));
        const template = names.map((name) => `{{${name}}}`).join(' ');
        const rendered = renderTemplateContent(template, values);

        expect(rendered.includes('{{')).toBe(false);
        expect(rendered.includes('}}')).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  test('renderTemplateContent leaves unknown placeholders unchanged', async () => {
    await fc.assert(
      fc.property(variableNameArb, safeTokenArb, (unknownName, knownValue) => {
        const rendered = renderTemplateContent(`{{${unknownName}}}`, { known: knownValue });
        expect(rendered).toBe(`{{${unknownName}}}`);
      }),
      { numRuns: 100 }
    );
  });

  test('resolveTemplateInheritance returns the full target-to-root chain for valid linear inheritance', async () => {
    await fc.assert(
      fc.property(fc.uniqueArray(safeTokenArb, { minLength: 1, maxLength: 6 }), (names) => {
        const registry = names.map((name, index) => ({
          name,
          contract: {
            extends: index < names.length - 1 ? names[index + 1] : null,
            variables: [],
            files: []
          }
        }));
        const result = resolveTemplateInheritance(registry, names[0]);

        expect(result.resolved).toBe(true);
        expect(result.chain).toEqual(names);
      }),
      { numRuns: 100 }
    );
  });

  test('resolveTemplateInheritance keeps child variable overrides and collapses duplicate file paths', async () => {
    await fc.assert(
      fc.property(variableNameArb, textArb, textArb, safeTokenArb, (sharedName, parentDescription, childDescription, sharedFile) => {
        const registry = [
          {
            name: 'child',
            contract: {
              extends: 'parent',
              variables: [{ name: sharedName, type: 'number', description: childDescription }],
              files: [sharedFile]
            }
          },
          {
            name: 'parent',
            contract: {
              variables: [{ name: sharedName, type: 'string', description: parentDescription }],
              files: [sharedFile, 'parent-only.txt']
            }
          }
        ];

        const result = resolveTemplateInheritance(registry, 'child');
        const mergedVariable = result.mergedVariables.find((variable) => variable.name === sharedName);

        expect(result.resolved).toBe(true);
        expect(mergedVariable).toEqual(expect.objectContaining({
          name: sharedName,
          type: 'number',
          description: childDescription
        }));
        expect(result.mergedFiles.filter((file) => file === sharedFile)).toHaveLength(1);
      }),
      { numRuns: 100 }
    );
  });

  test('resolveTemplateInheritance detects cyclic inheritance graphs', async () => {
    await fc.assert(
      fc.property(fc.uniqueArray(safeTokenArb, { minLength: 2, maxLength: 6 }), (names) => {
        const registry = names.map((name, index) => ({
          name,
          contract: {
            extends: names[(index + 1) % names.length],
            variables: [],
            files: []
          }
        }));
        const result = resolveTemplateInheritance(registry, names[0]);

        expect(result.resolved).toBe(false);
        expect(result.errors[0]).toContain('circular inheritance detected');
      }),
      { numRuns: 100 }
    );
  });

  test('validateScenePackageContract remains valid for legacy contracts without template-specific fields', async () => {
    await fc.assert(
      fc.property(safeTokenArb, safeTokenArb, fc.integer({ min: 0, max: 10 }), (name, groupPart, versionPatch) => {
        const contract = {
          apiVersion: 'sce.scene.package/v0.1',
          kind: 'scene-template',
          metadata: {
            group: `sce.${groupPart}`,
            name,
            version: `1.0.${versionPatch}`,
            description: 'Legacy contract'
          },
          compatibility: {
            min_sce_version: '>=1.0.0',
            scene_api_version: 'sce.scene/v0.2'
          },
          capabilities: {
            provides: [`scene.${name}.render`],
            requires: []
          },
          parameters: [],
          artifacts: {
            entry_scene: 'scene.yaml',
            generates: ['output.md']
          },
          governance: {
            risk_level: 'low',
            approval_required: false,
            rollback_supported: true
          }
        };

        const result = validateScenePackageContract(contract);
        expect(result.valid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
