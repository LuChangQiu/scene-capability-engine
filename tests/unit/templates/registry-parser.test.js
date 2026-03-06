const path = require('path');
const fs = require('fs-extra');
const os = require('os');

const RegistryParser = require('../../../lib/templates/registry-parser');
const { ValidationError } = require('../../../lib/templates/template-error');

describe('RegistryParser', () => {
  let parser;
  let tempDir;

  beforeEach(async () => {
    parser = new RegistryParser();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-registry-parser-'));
  });

  afterEach(async () => {
    parser.clearCache();
    await fs.remove(tempDir);
  });

  test('accepts capability-template with complete ontology triads', async () => {
    const registryPath = path.join(tempDir, 'template-registry.json');
    await fs.writeJson(registryPath, {
      version: '2.0.0',
      templates: [
        {
          id: 'moqui/order-capability',
          name: 'Order Capability Template',
          template_type: 'capability-template',
          category: 'moqui',
          description: 'Capability template',
          difficulty: 'advanced',
          tags: ['moqui', 'order'],
          applicable_scenarios: ['order-management'],
          files: ['capability.yaml'],
          min_sce_version: '3.3.13',
          ontology_scope: {
            domains: ['erp'],
            entities: ['OrderHeader'],
            relations: ['OrderHeader->Customer'],
            business_rules: ['order-total-required'],
            decisions: ['order-risk-routing']
          },
          risk_level: 'medium',
          rollback_contract: {
            supported: true,
            strategy: 'compensating-action'
          }
        }
      ]
    }, { spaces: 2 });

    const parsed = await parser.parseRegistry(registryPath);
    expect(parsed.templates).toHaveLength(1);
    expect(parsed.templates[0].template_type).toBe('capability-template');
    expect(parsed.templates[0].min_sce_version).toBe('3.3.13');
    expect(parsed.templates[0].ontology_core.ready).toBe(true);
    expect(parsed.templates[0].ontology_core.coverage_ratio).toBe(1);
  });

  test('rejects spec-scaffold missing required triad file', () => {
    const registry = {
      version: '2.0.0',
      templates: [
        {
          id: 'web/basic-spec',
          name: 'Basic Spec Scaffold',
          template_type: 'spec-scaffold',
          category: 'web-features',
          description: 'Scaffold template',
          difficulty: 'beginner',
          tags: ['spec'],
          applicable_scenarios: ['feature-development'],
          files: ['requirements.md', 'tasks.md'],
          min_sce_version: '3.3.13',
          risk_level: 'low',
          rollback_contract: {
            supported: true,
            strategy: 'git-revert'
          }
        }
      ]
    };

    expect(() => parser.validateRegistrySchema(registry)).toThrow(ValidationError);
  });

  test('rejects capability-template missing ontology scope', () => {
    const registry = {
      version: '2.0.0',
      templates: [
        {
          id: 'moqui/order-capability',
          name: 'Order Capability Template',
          template_type: 'capability-template',
          category: 'moqui',
          description: 'Capability template',
          difficulty: 'advanced',
          tags: ['moqui', 'order'],
          applicable_scenarios: ['order-management'],
          files: ['capability.yaml'],
          min_sce_version: '3.3.13',
          risk_level: 'medium',
          rollback_contract: {
            supported: true,
            strategy: 'compensating-action'
          }
        }
      ]
    };

    expect(() => parser.validateRegistrySchema(registry)).toThrow(ValidationError);
  });

  test('rejects capability-template missing ontology triads', () => {
    const registry = {
      version: '2.0.0',
      templates: [
        {
          id: 'moqui/order-capability',
          name: 'Order Capability Template',
          template_type: 'capability-template',
          category: 'moqui',
          description: 'Capability template',
          difficulty: 'advanced',
          tags: ['moqui', 'order'],
          applicable_scenarios: ['order-management'],
          files: ['capability.yaml'],
          min_sce_version: '3.3.13',
          ontology_scope: {
            domains: ['erp'],
            entities: ['OrderHeader'],
            relations: ['OrderHeader->Customer'],
            business_rules: []
          },
          risk_level: 'medium',
          rollback_contract: {
            supported: true,
            strategy: 'compensating-action'
          }
        }
      ]
    };

    expect(() => parser.validateRegistrySchema(registry)).toThrow(ValidationError);
    try {
      parser.validateRegistrySchema(registry);
    } catch (error) {
      expect(error.details.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('missing required ontology triads: business_rules, decision_strategy')
      ]));
    }
  });

  test('normalizes legacy entry with default template type', () => {
    const normalized = parser.normalizeTemplateEntry({
      id: 'legacy/template',
      name: 'Legacy Template',
      category: 'other',
      description: 'Legacy',
      difficulty: 'intermediate',
      tags: ['legacy'],
      files: ['requirements.md', 'design.md', 'tasks.md']
    });

    expect(normalized.template_type).toBe('spec-scaffold');
    expect(normalized.min_sce_version).toBeNull();
    expect(normalized.max_sce_version).toBeNull();
    expect(normalized.rollback_contract).toBeNull();
  });

  test('evaluates version compatibility using min/max bounds', () => {
    const template = {
      min_sce_version: '3.3.0',
      max_sce_version: '3.4.0'
    };

    expect(parser.isTemplateCompatible(template, '3.3.13')).toBe(true);
    expect(parser.isTemplateCompatible(template, '3.2.9')).toBe(false);
    expect(parser.isTemplateCompatible(template, '3.4.1')).toBe(false);
  });
});
