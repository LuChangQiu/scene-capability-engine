'use strict';

const fs = require('fs-extra');
const path = require('path');

const TEMPLATE_CONTRACT = {
  apiVersion: 'sce.scene.package/v0.1',
  kind: 'scene-template',
  metadata: {
    group: 'sce.scene',
    name: 'erp-order-query-template',
    version: '0.1.0',
    summary: 'Published fixture template for Moqui core regression suite.'
  },
  compatibility: {
    min_sce_version: '>=1.24.0',
    scene_api_version: 'sce.scene/v0.2',
    moqui_model_version: '3.x',
    adapter_api_version: 'v1'
  },
  capabilities: {
    provides: [
      'erp-order-query-read',
      'erp-order-fulfillment-workflow',
      'erp-inventory-reserve-adjust'
    ],
    requires: [
      'binding:http',
      'profile:erp'
    ]
  },
  capability_contract: {
    bindings: [
      {
        ref: 'order.query.read',
        type: 'query',
        intent: 'Read order summary',
        preconditions: ['order id provided'],
        postconditions: ['order summary returned']
      },
      {
        ref: 'order.fulfillment.workflow',
        type: 'workflow',
        depends_on: 'order.query.read',
        intent: 'Coordinate fulfillment tasks',
        preconditions: ['order validated'],
        postconditions: ['fulfillment instructions prepared']
      }
    ]
  },
  parameters: [
    {
      id: 'order_id',
      type: 'string',
      required: true,
      description: 'Order identifier'
    }
  ],
  artifacts: {
    entry_scene: 'scene.yaml',
    generates: ['scene.yaml', 'scene-package.json']
  },
  governance: {
    risk_level: 'low',
    approval_required: false,
    rollback_supported: true
  },
  ontology_model: {
    entities: [
      { id: 'Order', type: 'aggregate' },
      { id: 'OrderItem', type: 'entity' },
      { id: 'InventoryItem', type: 'entity' }
    ],
    relations: [
      { source: 'Order', target: 'OrderItem', type: 'contains' },
      { source: 'OrderItem', target: 'InventoryItem', type: 'references' }
    ]
  },
  governance_contract: {
    business_rules: [
      {
        id: 'BR-order-status-gate',
        entity_ref: 'Order',
        status: 'active',
        passed: true
      }
    ],
    decision_logic: [
      {
        id: 'DEC-reserve-strategy',
        status: 'resolved',
        automated: true
      }
    ]
  }
};

const SPEC_SCENE_PACKAGE = {
  ...TEMPLATE_CONTRACT,
  metadata: {
    ...TEMPLATE_CONTRACT.metadata,
    summary: 'Regression fixture for Moqui core order query template.'
  }
};

const SPEC_SCENE_YAML = [
  'version: "1.0"',
  'name: "moqui-core-order-query"',
  'description: "Regression fixture scene manifest for moqui core order query template."',
  'steps:',
  '  - id: read-order',
  '    action: query',
  '    target: order.query.read',
  '  - id: plan-fulfillment',
  '    action: workflow',
  '    target: order.fulfillment.workflow'
].join('\n');

async function createMoquiCoreRegressionWorkspace(workspacePath) {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const manifestPath = path.join(workspacePath, 'docs', 'handoffs', 'handoff-manifest.json');
  const scriptsDir = path.join(workspacePath, 'scripts');
  const templateDir = path.join(
    workspacePath,
    '.sce',
    'templates',
    'scene-packages',
    'sce.scene--erp-order-query-read--0.1.0'
  );
  const specDir = path.join(
    workspacePath,
    '.sce',
    'specs',
    '60-10-moqui-core-order-query',
    'custom'
  );

  await fs.ensureDir(path.dirname(manifestPath));
  await fs.ensureDir(scriptsDir);
  await fs.ensureDir(templateDir);
  await fs.ensureDir(specDir);

  await fs.writeJson(manifestPath, {
    timestamp: '2026-02-17T00:00:00.000Z',
    source_project: 'E:/workspace/moqui-core-regression',
    specs: [
      {
        id: '60-10-moqui-core-order-query',
        status: 'completed',
        scene_package: '.sce/specs/60-10-moqui-core-order-query/custom/scene-package.json',
        scene_manifest: '.sce/specs/60-10-moqui-core-order-query/custom/scene.yaml'
      }
    ],
    templates: ['sce.scene--erp-order-query-read--0.1.0'],
    capabilities: ['order-query-read', 'order-fulfillment', 'inventory-adjustment'],
    known_gaps: [],
    ontology_validation: {
      status: 'passed',
      quality_score: 100,
      business_rules: { total: 1, mapped: 1 },
      decision_logic: { total: 1, resolved: 1 }
    }
  }, { spaces: 2 });

  await fs.writeJson(path.join(templateDir, 'scene-package.json'), TEMPLATE_CONTRACT, { spaces: 2 });
  await fs.writeJson(path.join(specDir, 'scene-package.json'), SPEC_SCENE_PACKAGE, { spaces: 2 });
  await fs.writeFile(path.join(specDir, 'scene.yaml'), SPEC_SCENE_YAML, 'utf8');
  const rootBaselineScript = path.join(projectRoot, 'scripts', 'moqui-template-baseline-report.js');
  await fs.writeFile(
    path.join(scriptsDir, 'moqui-template-baseline-report.js'),
    [
      '#!/usr/bin/env node',
      "'use strict';",
      '',
      `require(${JSON.stringify(rootBaselineScript)});`,
      ''
    ].join('\n'),
    'utf8'
  );
}

module.exports = {
  createMoquiCoreRegressionWorkspace
};

