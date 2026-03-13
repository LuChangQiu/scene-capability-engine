'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs-extra');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeDeep(base, overrides) {
  if (!isPlainObject(base) || !isPlainObject(overrides)) {
    return overrides === undefined ? clone(base) : clone(overrides);
  }

  const result = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      result[key] = mergeDeep(base[key], value);
    } else {
      result[key] = clone(value);
    }
  }
  return result;
}

function createValidContract(overrides = {}) {
  const base = {
    apiVersion: 'sce.scene.package/v0.1',
    kind: 'scene-template',
    metadata: {
      group: 'sce.scene',
      name: 'demo-scene',
      version: '1.0.0',
      description: 'Demo scene package'
    },
    compatibility: {
      min_sce_version: '>=1.0.0',
      scene_api_version: 'sce.scene/v0.2'
    },
    capabilities: {
      provides: ['scene.demo'],
      requires: []
    },
    parameters: [
      {
        id: 'env',
        type: 'string',
        description: 'Target environment',
        required: true
      }
    ],
    artifacts: {
      entry_scene: 'scene.yaml',
      generates: ['scene.yaml', 'playbook.md']
    },
    governance: {
      risk_level: 'low',
      approval_required: false,
      rollback_supported: true,
      approval: {
        required: false
      },
      idempotency: {
        required: true
      }
    },
    capability_contract: {
      bindings: [
        {
          ref: 'moqui.Order.list',
          intent: 'List orders',
          preconditions: ['user.authenticated'],
          postconditions: ['result.length >= 0']
        }
      ]
    },
    governance_contract: {
      data_lineage: {
        sources: [
          {
            ref: 'moqui.Order.list',
            fields: ['orderId']
          }
        ]
      }
    },
    agent_hints: {
      summary: 'Order listing flow',
      complexity: 'low',
      suggested_sequence: ['open', 'review']
    }
  };

  return mergeDeep(base, overrides);
}

function createValidManifest(overrides = {}) {
  const base = {
    apiVersion: 'sce.scene.manifest/v0.1',
    kind: 'SceneManifest',
    metadata: {
      name: 'demo-scene',
      version: '1.0.0'
    },
    spec: {
      capability_contract: {
        bindings: [
          {
            ref: 'moqui.Order.list'
          }
        ]
      },
      governance_contract: {
        business_rules: [],
        decision_logic: []
      }
    }
  };

  return mergeDeep(base, overrides);
}

async function createScenePackageFixture(options = {}) {
  const rootDir = options.rootDir
    ? path.resolve(options.rootDir)
    : await fs.mkdtemp(path.join(os.tmpdir(), 'sce-scene-pkg-'));
  const packageDirName = options.packageDirName || 'package';
  const packageDir = options.rootDir ? path.join(rootDir, packageDirName) : rootDir;

  await fs.ensureDir(packageDir);

  const contract = options.omitScenePackage
    ? null
    : createValidContract(options.contractOverrides || {});
  const manifest = options.omitSceneYaml
    ? null
    : createValidManifest(options.manifestOverrides || {});

  if (contract) {
    await fs.writeJson(path.join(packageDir, 'scene-package.json'), contract, { spaces: 2 });
  }

  if (manifest) {
    const yaml = require('js-yaml');
    await fs.writeFile(path.join(packageDir, 'scene.yaml'), yaml.dump(manifest), 'utf8');
  }

  if (options.includeReadme !== false) {
    await fs.writeFile(
      path.join(packageDir, 'README.md'),
      options.readmeContent || '# Demo Scene\n',
      'utf8'
    );
  }

  const additionalFiles = {
    'playbook.md': '# Playbook\n',
    ...(options.additionalFiles || {})
  };

  for (const [relativePath, content] of Object.entries(additionalFiles)) {
    if (content === null) {
      continue;
    }
    const absolutePath = path.join(packageDir, relativePath);
    await fs.ensureDir(path.dirname(absolutePath));
    await fs.writeFile(absolutePath, content);
  }

  return {
    rootDir,
    packageDir,
    contract,
    manifest,
    cleanup: async () => {
      await fs.remove(rootDir);
    }
  };
}

module.exports = {
  clone,
  mergeDeep,
  createValidContract,
  createValidManifest,
  createScenePackageFixture
};
