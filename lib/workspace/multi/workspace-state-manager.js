const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const Workspace = require('./workspace');

/**
 * WorkspaceStateManager - Single Source of Truth for workspace state
 * 
 * Implements the Data Atomicity Principle by managing all workspace-related
 * data in a single configuration file. This ensures atomic updates and
 * eliminates data inconsistency risks.
 * 
 * Architecture: Single file (~/.sce/workspace-state.json) contains:
 * - All workspace entries
 * - Active workspace selection
 * - User preferences
 * 
 * This replaces the previous dual-file approach (workspaces.json + config.json)
 * which violated the Single Source of Truth principle.
 */
class WorkspaceStateManager {
  /**
   * Create a new WorkspaceStateManager instance
   * 
   * @param {string} statePath - Path to workspace-state.json (optional)
   */
  constructor(statePath = null) {
    this.statePath = statePath || this.getDefaultStatePath();
    this.state = {
      version: '1.0',
      activeWorkspace: null,
      workspaces: new Map(),
      preferences: {
        autoDetectWorkspace: true,
        confirmDestructiveOperations: true
      }
    };
    this.loaded = false;
  }

  /**
   * Get the default state file path
   * 
   * @returns {string} Path to ~/.sce/workspace-state.json
   */
  getDefaultStatePath() {
    const homeDir = os.homedir();
    return path.join(homeDir, '.sce', 'workspace-state.json');
  }

  /**
   * Load workspace state from disk
   * 
   * @returns {Promise<boolean>} True if loaded successfully
   */
  async load() {
    try {
      const exists = await fs.pathExists(this.statePath);
      if (exists) {
        await this.loadNewFormat();
        this.loaded = true;
        return true;
      }

      // Initialize empty state
      this.state = {
        version: '1.0',
        activeWorkspace: null,
        workspaces: new Map(),
        preferences: {
          autoDetectWorkspace: true,
          confirmDestructiveOperations: true
        }
      };
      this.loaded = true;
      return true;

    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Workspace state file is corrupted: ${this.statePath}. ` +
                       `Please backup and delete the file, then try again.`);
      }
      throw error;
    }
  }

  /**
   * Load state from new format file
   * 
   * @private
   */
  async loadNewFormat() {
    const content = await fs.readFile(this.statePath, 'utf8');
    const data = JSON.parse(content);

    // Validate version
    if (data.version !== this.state.version) {
      console.warn(`Warning: State version mismatch. Expected ${this.state.version}, got ${data.version}`);
    }

    // Load state
    this.state.version = data.version;
    this.state.activeWorkspace = data.activeWorkspace || null;
    
    // Load workspaces
    this.state.workspaces = new Map();
    if (data.workspaces && Array.isArray(data.workspaces)) {
      for (const workspaceData of data.workspaces) {
        const workspace = Workspace.fromDict(workspaceData);
        this.state.workspaces.set(workspace.name, workspace);
      }
    }

    // Load preferences
    this.state.preferences = {
      autoDetectWorkspace: data.preferences?.autoDetectWorkspace ?? true,
      confirmDestructiveOperations: data.preferences?.confirmDestructiveOperations ?? true
    };
  }

  /**
   * Save workspace state to disk (atomic operation)
   * 
   * Uses temp file + atomic rename to ensure consistency
   * 
   * @returns {Promise<boolean>} True if saved successfully
   */
  async save() {
    try {
      // Ensure directory exists
      const stateDir = path.dirname(this.statePath);
      await fs.ensureDir(stateDir);

      // Serialize state
      const workspacesArray = Array.from(this.state.workspaces.values()).map(ws => ws.toDict());

      const data = {
        version: this.state.version,
        activeWorkspace: this.state.activeWorkspace,
        workspaces: workspacesArray,
        preferences: {
          autoDetectWorkspace: this.state.preferences.autoDetectWorkspace,
          confirmDestructiveOperations: this.state.preferences.confirmDestructiveOperations
        }
      };

      // Write to temp file first
      const tempPath = `${this.statePath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');

      // Atomic rename (ensures consistency)
      await fs.rename(tempPath, this.statePath);

      return true;
    } catch (error) {
      throw new Error(`Failed to save workspace state: ${error.message}`);
    }
  }

  /**
   * Ensure state is loaded before operations
   * 
   * @private
   */
  async ensureLoaded() {
    if (!this.loaded) {
      await this.load();
    }
  }

  // ==================== Workspace Operations ====================

  /**
   * Create a new workspace (atomic operation)
   * 
   * @param {string} name - Unique workspace name
   * @param {string} workspacePath - Path to workspace directory
   * @returns {Promise<Workspace>} Created workspace
   * @throws {Error} If name already exists or path is invalid
   */
  async createWorkspace(name, workspacePath) {
    await this.ensureLoaded();

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Workspace name cannot be empty');
    }

    // Check for duplicate name
    if (this.state.workspaces.has(name)) {
      throw new Error(`Workspace "${name}" already exists`);
    }

    // Validate path (check for .sce directory)
    const kiroPath = path.join(workspacePath, '.sce');
    const kiroExists = await fs.pathExists(kiroPath);
    if (!kiroExists) {
      throw new Error(`Path "${workspacePath}" is not a valid sce project directory. ` +
                     `Ensure it exists and contains a .sce/ directory.`);
    }

    // Create workspace
    const workspace = new Workspace(name, workspacePath);
    this.state.workspaces.set(name, workspace);

    // Atomic save
    await this.save();

    return workspace;
  }

  /**
   * Get a workspace by name
   * 
   * @param {string} name - Workspace name
   * @returns {Promise<Workspace|null>} Workspace or null if not found
   */
  async getWorkspace(name) {
    await this.ensureLoaded();
    return this.state.workspaces.get(name) || null;
  }

  /**
   * List all registered workspaces
   * 
   * @returns {Promise<Array<Workspace>>} Array of workspaces
   */
  async listWorkspaces() {
    await this.ensureLoaded();
    return Array.from(this.state.workspaces.values());
  }

  /**
   * Remove a workspace from the registry (atomic operation)
   * 
   * @param {string} name - Workspace name
   * @returns {Promise<boolean>} True if removed, false if not found
   */
  async removeWorkspace(name) {
    await this.ensureLoaded();

    if (!this.state.workspaces.has(name)) {
      return false;
    }

    // Remove workspace
    this.state.workspaces.delete(name);

    // Clear active workspace if it was the removed one
    if (this.state.activeWorkspace === name) {
      this.state.activeWorkspace = null;
    }

    // Atomic save
    await this.save();

    return true;
  }

  /**
   * Switch to a workspace (atomic operation)
   * 
   * Updates both active workspace and last accessed timestamp atomically
   * 
   * @param {string} name - Workspace name
   * @returns {Promise<void>}
   * @throws {Error} If workspace doesn't exist
   */
  async switchWorkspace(name) {
    await this.ensureLoaded();

    const workspace = this.state.workspaces.get(name);
    if (!workspace) {
      const available = Array.from(this.state.workspaces.keys());
      throw new Error(
        `Workspace "${name}" does not exist.\n` +
        `Available workspaces: ${available.join(', ') || 'none'}`
      );
    }

    // Update state atomically
    this.state.activeWorkspace = name;
    workspace.updateLastAccessed();

    // Atomic save
    await this.save();
  }

  /**
   * Get the active workspace
   * 
   * @returns {Promise<Workspace|null>} Active workspace or null
   */
  async getActiveWorkspace() {
    await this.ensureLoaded();

    if (!this.state.activeWorkspace) {
      return null;
    }

    const workspace = this.state.workspaces.get(this.state.activeWorkspace);
    if (!workspace) {
      // Active workspace no longer exists, clear it
      this.state.activeWorkspace = null;
      await this.save();
      return null;
    }

    return workspace;
  }

  /**
   * Clear the active workspace
   * 
   * @returns {Promise<void>}
   */
  async clearActiveWorkspace() {
    await this.ensureLoaded();
    this.state.activeWorkspace = null;
    await this.save();
  }

  /**
   * Find workspace that contains the given path
   * 
   * @param {string} targetPath - Path to search for
   * @returns {Promise<Workspace|null>} Workspace containing the path, or null
   */
  async findWorkspaceByPath(targetPath) {
    await this.ensureLoaded();

    const absolutePath = path.isAbsolute(targetPath) 
      ? targetPath 
      : path.resolve(targetPath);

    for (const workspace of this.state.workspaces.values()) {
      if (workspace.containsPath(absolutePath)) {
        return workspace;
      }
    }

    return null;
  }

  // ==================== Preference Operations ====================

  /**
   * Get a preference value
   * 
   * @param {string} key - Preference key
   * @returns {Promise<any>} Preference value
   */
  async getPreference(key) {
    await this.ensureLoaded();
    return this.state.preferences[key];
  }

  /**
   * Set a preference value
   * 
   * @param {string} key - Preference key
   * @param {any} value - Preference value
   * @returns {Promise<void>}
   */
  async setPreference(key, value) {
    await this.ensureLoaded();
    this.state.preferences[key] = value;
    await this.save();
  }

  /**
   * Get all preferences
   * 
   * @returns {Promise<Object>} All preferences
   */
  async getPreferences() {
    await this.ensureLoaded();
    return { ...this.state.preferences };
  }

  // ==================== Utility Methods ====================

  /**
   * Check if a workspace name exists
   * 
   * @param {string} name - Workspace name
   * @returns {Promise<boolean>} True if exists
   */
  async hasWorkspace(name) {
    await this.ensureLoaded();
    return this.state.workspaces.has(name);
  }

  /**
   * Get count of registered workspaces
   * 
   * @returns {Promise<number>} Number of workspaces
   */
  async count() {
    await this.ensureLoaded();
    return this.state.workspaces.size;
  }

  /**
   * Clear all workspaces (for testing purposes)
   * 
   * @returns {Promise<void>}
   */
  async clear() {
    await this.ensureLoaded();
    this.state.workspaces.clear();
    this.state.activeWorkspace = null;
    await this.save();
  }

  /**
   * Reset to default state
   * 
   * @returns {Promise<void>}
   */
  async reset() {
    this.state = {
      version: '1.0',
      activeWorkspace: null,
      workspaces: new Map(),
      preferences: {
        autoDetectWorkspace: true,
        confirmDestructiveOperations: true
      }
    };
    await this.save();
  }
}

module.exports = WorkspaceStateManager;
