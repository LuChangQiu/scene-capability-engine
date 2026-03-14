/**
 * Multi-Agent Configuration Manager
 *
 * Manages `.sce/config/multi-agent.json` for multi-Agent parallel coordination.
 * Co-work baseline is enabled by default for SCE-managed projects; a project
 * can still opt out explicitly by setting `enabled: false`.
 *
 * Requirements: 7.1 (no extra files when disabled), 7.4 (auto-init on first enable)
 */

const path = require('path');
const fsUtils = require('../utils/fs-utils');

const CONFIG_FILENAME = 'multi-agent.json';
const CONFIG_DIR = '.sce/config';

/** @type {import('./multi-agent-config').MultiAgentConfigData} */
const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  heartbeatIntervalMs: 60000,
  heartbeatTimeoutMs: 180000,
  coordinatorEnabled: false,
  maxRetries: 5,
  retryBaseDelayMs: 100,
});

class MultiAgentConfig {
  /**
   * @param {string} workspaceRoot - Absolute path to the project root
   */
  constructor(workspaceRoot) {
    this._workspaceRoot = workspaceRoot;
    this._configPath = path.join(workspaceRoot, CONFIG_DIR, CONFIG_FILENAME);
    this._configDir = path.join(workspaceRoot, CONFIG_DIR);
  }

  /**
   * Read the current configuration.
   * Returns the default config when the file is missing or corrupted.
   *
   * @returns {Promise<object>} Resolved configuration
   */
  async getConfig() {
    const exists = await fsUtils.pathExists(this._configPath);
    if (!exists) {
      return { ...DEFAULT_CONFIG };
    }

    try {
      const data = await fsUtils.readJSON(this._configPath);
      return { ...DEFAULT_CONFIG, ...data };
    } catch (_err) {
      // Corrupted JSON – fall back to defaults with a warning
      console.warn(
        `[MultiAgentConfig] Failed to parse ${this._configPath}, using default config`
      );
      return { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Whether multi-Agent mode is enabled.
   * @returns {Promise<boolean>}
   */
  async isEnabled() {
    const config = await this.getConfig();
    return config.enabled === true;
  }

  /**
   * Whether the central coordinator is enabled.
   * Only meaningful when multi-Agent mode itself is enabled.
   * @returns {Promise<boolean>}
   */
  async isCoordinatorEnabled() {
    const config = await this.getConfig();
    return config.enabled === true && config.coordinatorEnabled === true;
  }

  /**
   * Persist a (partial) configuration update.
   * Merges the provided values with the current config and writes atomically.
   * Auto-initialises the config directory on first write (Requirement 7.4).
   *
   * @param {object} updates - Partial config values to merge
   * @returns {Promise<object>} The full config after the update
   */
  async updateConfig(updates) {
    await fsUtils.ensureDirectory(this._configDir);
    const current = await this.getConfig();
    const merged = { ...current, ...updates };
    await fsUtils.writeJSON(this._configPath, merged);
    return merged;
  }

  /**
   * Enable multi-Agent mode.
   * Convenience wrapper that also initialises the required directory structure.
   *
   * @returns {Promise<object>} The full config after enabling
   */
  async enable() {
    return this.updateConfig({ enabled: true });
  }

  /**
   * Disable multi-Agent mode.
   * @returns {Promise<object>} The full config after disabling
   */
  async disable() {
    return this.updateConfig({ enabled: false });
  }

  /** Absolute path to the config file (useful for tests / diagnostics). */
  get configPath() {
    return this._configPath;
  }
}

module.exports = { MultiAgentConfig, DEFAULT_CONFIG };
