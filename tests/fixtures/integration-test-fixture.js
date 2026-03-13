const fs = require('fs-extra');
const os = require('os');
const path = require('path');

/**
 * IntegrationTestFixture - Provides consistent test environment setup and teardown
 * for integration tests. Creates isolated test directories with .sce structure.
 */
class IntegrationTestFixture {
  constructor(testName) {
    this.testName = testName;
    this.fixtureRoot = path.join(os.tmpdir(), 'sce-integration-fixtures');
    this.testDir = path.join(this.fixtureRoot, this.sanitizeTestName(testName));
    this.updateDerivedPaths();
  }

  sanitizeTestName(value) {
    return String(value || 'integration-test')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'integration-test';
  }

  updateDerivedPaths() {
    this.sceDir = path.join(this.testDir, '.sce');
    this.specsDir = path.join(this.sceDir, 'specs');
    this.configFile = path.join(this.sceDir, 'config.json');
  }

  /**
   * Set up the test environment
   * Creates test directory structure and default configuration
   */
  async setup() {
    await fs.ensureDir(this.fixtureRoot);
    this.testDir = await fs.mkdtemp(path.join(this.fixtureRoot, `${this.sanitizeTestName(this.testName)}-`));
    this.updateDerivedPaths();
    await fs.ensureDir(this.testDir);
    await fs.ensureDir(this.sceDir);
    await fs.ensureDir(this.specsDir);
    await this.createDefaultConfig();
  }

  /**
   * Clean up the test environment
   * Removes all test files and directories
   */
  async cleanup() {
    try {
      await fs.remove(this.testDir);
    } catch (error) {
      console.warn(`Cleanup warning for ${this.testName}:`, error.message);
    }
  }

  /**
   * Create default .sce/config.json
   */
  async createDefaultConfig() {
    const config = {
      version: '1.0.0',
      workspaces: [],
      activeWorkspace: null,
      created: new Date().toISOString()
    };
    await fs.writeJson(this.configFile, config, { spaces: 2 });
  }

  /**
   * Create a spec with requirements, design, and tasks files
   * @param {string} specName - Name of the spec (e.g., '01-00-feature-name')
   * @param {object} content - Spec content { requirements, design, tasks }
   */
  async createSpec(specName, content = {}) {
    const specDir = path.join(this.specsDir, specName);
    await fs.ensureDir(specDir);

    if (content.requirements) {
      await fs.writeFile(
        path.join(specDir, 'requirements.md'),
        content.requirements,
        'utf8'
      );
    }

    if (content.design) {
      await fs.writeFile(
        path.join(specDir, 'design.md'),
        content.design,
        'utf8'
      );
    }

    if (content.tasks) {
      await fs.writeFile(
        path.join(specDir, 'tasks.md'),
        content.tasks,
        'utf8'
      );
    }

    return specDir;
  }

  /**
   * Create a workspace configuration
   * @param {string} workspaceName - Name of the workspace
   * @param {object} options - Workspace options
   * @returns {string} Workspace path
   */
  async createWorkspace(workspaceName, options = {}) {
    const workspacePath = options.path || path.join(this.testDir, workspaceName);
    await fs.ensureDir(workspacePath);

    const config = await this.getWorkspaceConfig();
    config.workspaces.push({
      name: workspaceName,
      path: workspacePath,
      created: new Date().toISOString(),
      ...options
    });

    await fs.writeJson(this.configFile, config, { spaces: 2 });
    return workspacePath;
  }

  /**
   * Get workspace configuration
   * @returns {object} Workspace configuration
   */
  async getWorkspaceConfig() {
    if (await fs.pathExists(this.configFile)) {
      return await fs.readJson(this.configFile);
    }
    return {
      version: '1.0.0',
      workspaces: [],
      activeWorkspace: null
    };
  }

  /**
   * Update workspace configuration
   * @param {object} config - New configuration
   */
  async updateWorkspaceConfig(config) {
    await fs.writeJson(this.configFile, config, { spaces: 2 });
  }

  /**
   * Write a file relative to test directory
   * @param {string} relativePath - Path relative to test directory
   * @param {string} content - File content
   */
  async writeFile(relativePath, content) {
    const filePath = path.join(this.testDir, relativePath);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf8');
  }

  /**
   * Read a file relative to test directory
   * @param {string} relativePath - Path relative to test directory
   * @returns {string} File content
   */
  async readFile(relativePath) {
    const filePath = path.join(this.testDir, relativePath);
    return await fs.readFile(filePath, 'utf8');
  }

  /**
   * Check if a file exists relative to test directory
   * @param {string} relativePath - Path relative to test directory
   * @returns {boolean} True if file exists
   */
  async fileExists(relativePath) {
    const filePath = path.join(this.testDir, relativePath);
    return await fs.pathExists(filePath);
  }

  /**
   * Get absolute path for a relative path
   * @param {string} relativePath - Path relative to test directory
   * @returns {string} Absolute path
   */
  getAbsolutePath(relativePath) {
    return path.join(this.testDir, relativePath);
  }

  /**
   * List files in a directory relative to test directory
   * @param {string} relativePath - Path relative to test directory
   * @returns {Array<string>} List of file names
   */
  async listFiles(relativePath = '') {
    const dirPath = path.join(this.testDir, relativePath);
    if (await fs.pathExists(dirPath)) {
      return await fs.readdir(dirPath);
    }
    return [];
  }

  /**
   * Get all specs in the test workspace
   * @returns {Array<string>} List of spec names
   */
  async getSpecs() {
    if (await fs.pathExists(this.specsDir)) {
      return await fs.readdir(this.specsDir);
    }
    return [];
  }
}

module.exports = IntegrationTestFixture;
