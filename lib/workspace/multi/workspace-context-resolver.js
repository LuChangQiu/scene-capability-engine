const fs = require('fs-extra');
const path = require('path');

/**
 * WorkspaceContextResolver - Determines the active workspace for command execution
 * 
 * Implements workspace resolution priority logic:
 * 1. Explicit --workspace parameter (highest priority)
 * 2. Current directory matches a registered workspace path
 * 3. Active workspace from global config
 * 4. Error: No workspace context available (lowest priority)
 * 
 * This class is the central component for workspace context detection and resolution.
 */
class WorkspaceContextResolver {
  /**
   * Create a new WorkspaceContextResolver instance
   * 
   * @param {WorkspaceRegistry} registry - Workspace registry instance
   * @param {GlobalConfig} config - Global configuration instance
   */
  constructor(registry, config) {
    this.registry = registry;
    this.config = config;
  }

  /**
   * Resolve workspace using priority rules
   * 
   * Priority order:
   * 1. Explicit workspace parameter
   * 2. Current directory match
   * 3. Active workspace from config
   * 4. Error if no context available
   * 
   * @param {string|null} explicitWorkspace - Explicit --workspace parameter value
   * @param {string|null} currentDir - Current directory (defaults to process.cwd())
   * @returns {Promise<Workspace|null>} Resolved workspace or null
   * @throws {Error} If explicit workspace doesn't exist or no context available
   */
  async resolveWorkspace(explicitWorkspace = null, currentDir = null) {
    // Priority 1: Explicit --workspace parameter
    if (explicitWorkspace) {
      const workspace = await this.registry.getWorkspace(explicitWorkspace);
      if (!workspace) {
        const available = await this.getAvailableWorkspaceNames();
        throw new Error(
          `Workspace "${explicitWorkspace}" does not exist.\n` +
          `Available workspaces: ${available.join(', ') || 'none'}`
        );
      }
      return workspace;
    }

    // Priority 2: Current directory matches a registered workspace
    const targetDir = currentDir || process.cwd();
    const workspaceFromPath = await this.detectWorkspaceFromPath(targetDir);
    if (workspaceFromPath) {
      return workspaceFromPath;
    }

    // Priority 3: Active workspace from config
    const activeWorkspaceName = await this.config.getActiveWorkspace();
    if (activeWorkspaceName) {
      const activeWorkspace = await this.registry.getWorkspace(activeWorkspaceName);
      if (activeWorkspace) {
        return activeWorkspace;
      }
      // Active workspace no longer exists, clear it
      await this.config.clearActiveWorkspace();
    }

    // Priority 4: No workspace context available
    return null;
  }

  /**
   * Detect workspace from a given path
   * 
   * Searches the registry for a workspace that contains the given path.
   * 
   * @param {string} targetPath - Path to search for
   * @returns {Promise<Workspace|null>} Workspace containing the path, or null
   */
  async detectWorkspaceFromPath(targetPath) {
    return await this.registry.findWorkspaceByPath(targetPath);
  }

  /**
   * Check if a directory is a valid sce project directory
   * 
   * @param {string} dirPath - Directory path to check
   * @returns {Promise<boolean>} True if directory contains .sce/ structure
   */
  async isValidSceDirectory(dirPath) {
    try {
      const kiroPath = path.join(dirPath, '.sce');
      const exists = await fs.pathExists(kiroPath);
      
      if (!exists) {
        return false;
      }

      const stats = await fs.stat(kiroPath);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the currently active workspace from config
   * 
   * @returns {Promise<Workspace|null>} Active workspace or null
   */
  async getActiveWorkspace() {
    const activeWorkspaceName = await this.config.getActiveWorkspace();
    if (!activeWorkspaceName) {
      return null;
    }

    const workspace = await this.registry.getWorkspace(activeWorkspaceName);
    if (!workspace) {
      // Active workspace no longer exists, clear it
      await this.config.clearActiveWorkspace();
      return null;
    }

    return workspace;
  }

  /**
   * Set the active workspace in config
   * 
   * @param {string} name - Workspace name
   * @returns {Promise<void>}
   * @throws {Error} If workspace doesn't exist
   */
  async setActiveWorkspace(name) {
    const workspace = await this.registry.getWorkspace(name);
    if (!workspace) {
      const available = await this.getAvailableWorkspaceNames();
      throw new Error(
        `Workspace "${name}" does not exist.\n` +
        `Available workspaces: ${available.join(', ') || 'none'}`
      );
    }

    await this.config.setActiveWorkspace(name);
    await this.registry.updateLastAccessed(name);
  }

  /**
   * Clear the active workspace
   * 
   * @returns {Promise<void>}
   */
  async clearActiveWorkspace() {
    await this.config.clearActiveWorkspace();
  }

  /**
   * Get list of available workspace names
   * 
   * @private
   * @returns {Promise<Array<string>>} Array of workspace names
   */
  async getAvailableWorkspaceNames() {
    const workspaces = await this.registry.listWorkspaces();
    return workspaces.map(ws => ws.name);
  }

  /**
   * Check if current directory should prompt for workspace registration
   * 
   * Returns true if:
   * - Current directory is a valid sce project
   * - Current directory is not within any registered workspace
   * 
   * @param {string|null} currentDir - Current directory (defaults to process.cwd())
   * @returns {Promise<boolean>} True if should prompt for registration
   */
  async shouldPromptForRegistration(currentDir = null) {
    const targetDir = currentDir || process.cwd();

    // Check if it's a valid sce directory
    const isValid = await this.isValidSceDirectory(targetDir);
    if (!isValid) {
      return false;
    }

    // Check if it's already registered
    const workspace = await this.detectWorkspaceFromPath(targetDir);
    return workspace === null;
  }

  /**
   * Resolve workspace with error handling for commands that require a workspace
   * 
   * This is a convenience method that throws a helpful error if no workspace
   * context can be resolved.
   * 
   * @param {string|null} explicitWorkspace - Explicit --workspace parameter value
   * @param {string|null} currentDir - Current directory (defaults to process.cwd())
   * @returns {Promise<Workspace>} Resolved workspace
   * @throws {Error} If no workspace context available
   */
  async resolveWorkspaceOrError(explicitWorkspace = null, currentDir = null) {
    const workspace = await this.resolveWorkspace(explicitWorkspace, currentDir);
    
    if (!workspace) {
      const targetDir = currentDir || process.cwd();
      const isValid = await this.isValidSceDirectory(targetDir);
      
      if (isValid) {
        throw new Error(
          'No workspace context available.\n' +
          'The current directory is a valid sce project but not registered as a workspace.\n' +
          'Action Required: Run "sce workspace create <name>" to register this directory.'
        );
      } else {
        const available = await this.getAvailableWorkspaceNames();
        if (available.length > 0) {
          throw new Error(
            'No workspace context available.\n' +
            'The current directory is not a sce project and no active workspace is set.\n' +
            `Action Required: Run "sce workspace switch <name>" or use --workspace parameter.\n` +
            `Available workspaces: ${available.join(', ')}`
          );
        } else {
          throw new Error(
            'No workspace context available.\n' +
            'No workspaces are registered and the current directory is not a sce project.\n' +
            'Action Required: Run "sce workspace create <name>" to register a workspace.'
          );
        }
      }
    }

    return workspace;
  }
}

module.exports = WorkspaceContextResolver;
