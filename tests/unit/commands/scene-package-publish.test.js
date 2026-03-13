const {
  normalizeScenePackagePublishOptions
} = require('../../../lib/commands/scene');

describe('Scene package publish helpers', () => {
  test('normalizeScenePackagePublishOptions applies defaults', () => {
    expect(normalizeScenePackagePublishOptions({})).toEqual({
      spec: undefined,
      specPackage: 'custom/scene-package.json',
      sceneManifest: 'custom/scene.yaml',
      outDir: '.sce/templates/scene-packages',
      templateId: undefined,
      requireOntologyValidation: true,
      ontologyMinScore: null,
      dryRun: false,
      force: false,
      silent: false,
      json: false
    });
  });

  test('normalizeScenePackagePublishOptions trims values and coerces flags', () => {
    expect(normalizeScenePackagePublishOptions({
      spec: ' 77-00-scene-package-publish ',
      specPackage: ' custom/scene-package.json ',
      sceneManifest: ' custom/scene.yaml ',
      outDir: ' .sce/custom-library ',
      templateId: ' erp-template ',
      requireOntologyValidation: false,
      ontologyMinScore: '75',
      dryRun: true,
      force: true,
      silent: true,
      json: true
    })).toEqual({
      spec: '77-00-scene-package-publish',
      specPackage: 'custom/scene-package.json',
      sceneManifest: 'custom/scene.yaml',
      outDir: '.sce/custom-library',
      templateId: 'erp-template',
      requireOntologyValidation: false,
      ontologyMinScore: 75,
      dryRun: true,
      force: true,
      silent: true,
      json: true
    });
  });
});
