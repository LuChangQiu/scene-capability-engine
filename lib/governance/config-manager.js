/**
 * Configuration Manager
 * 
 * Manages document governance configuration
 */

const fs = require('fs-extra');
const path = require('path');

class ConfigManager {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.configPath = path.join(projectPath, '.sce/config/docs.json');
    this.config = null;
  }
  
  /**
   * Load configuration
   * 
   * @returns {Promise<Object>}
   */
  async load() {
    if (await fs.pathExists(this.configPath)) {
      try {
        this.config = await fs.readJson(this.configPath);
        
        // Validate and merge with defaults to ensure all required fields exist
        const defaults = this.getDefaults();
        this.config = { ...defaults, ...this.config };
        
      } catch (error) {
        console.warn('Config file corrupted, using defaults');
        this.config = this.getDefaults();
      }
    } else {
      this.config = this.getDefaults();
    }
    
    return this.config;
  }
  
  /**
   * Get default configuration
   * 
   * @returns {Object}
   */
  getDefaults() {
    return {
      rootAllowedFiles: [
        'README.md',
        'README.zh.md',
        'CHANGELOG.md',
        'CONTRIBUTING.md'
      ],
      specAllowedRootFiles: [
        'requirements.md',
        'design.md',
        'tasks.md',
        'collaboration.json'
      ],
      specSubdirs: [
        'reports',
        'scripts',
        'tests',
        'results',
        'docs'
      ],
      temporaryPatterns: [
        '*-SUMMARY.md',
        'SESSION-*.md',
        '*-COMPLETE.md',
        'TEMP-*.md',
        'WIP-*.md',
        'MVP-*.md'
      ]
    };
  }
  
  /**
   * Save configuration
   * 
   * @param {Object} config - Configuration to save
   * @returns {Promise<void>}
   */
  async save(config) {
    await fs.ensureDir(path.dirname(this.configPath));
    await fs.writeJson(this.configPath, config, { spaces: 2 });
    this.config = config;
  }
  
  /**
   * Update a configuration value
   * 
   * @param {string} key - Configuration key
   * @param {any} value - New value
   * @returns {Promise<void>}
   */
  async set(key, value) {
    if (!this.config) {
      await this.load();
    }
    
    this.config[key] = value;
    await this.save(this.config);
  }
  
  /**
   * Get a configuration value
   * 
   * @param {string} key - Configuration key
   * @returns {any} - Configuration value
   */
  get(key) {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    
    return this.config[key];
  }
  
  /**
   * Get all configuration
   * 
   * @returns {Object} - Complete configuration object
   */
  getAll() {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    
    return { ...this.config };
  }
  
  /**
   * Reset to defaults
   * 
   * @returns {Promise<void>}
   */
  async reset() {
    this.config = this.getDefaults();
    await this.save(this.config);
  }
  
  /**
   * Validate configuration structure
   * 
   * @param {Object} config - Configuration to validate
   * @returns {Object} - Validation result { valid: boolean, errors: string[] }
   */
  validate(config) {
    const errors = [];
    
    // Check required fields
    if (!config.rootAllowedFiles || !Array.isArray(config.rootAllowedFiles)) {
      errors.push('rootAllowedFiles must be an array');
    }
    
    if (!config.specSubdirs || !Array.isArray(config.specSubdirs)) {
      errors.push('specSubdirs must be an array');
    }

    if (!config.specAllowedRootFiles || !Array.isArray(config.specAllowedRootFiles)) {
      errors.push('specAllowedRootFiles must be an array');
    }
    
    if (!config.temporaryPatterns || !Array.isArray(config.temporaryPatterns)) {
      errors.push('temporaryPatterns must be an array');
    }
    
    // Check array contents
    if (config.rootAllowedFiles && Array.isArray(config.rootAllowedFiles)) {
      if (config.rootAllowedFiles.some(f => typeof f !== 'string')) {
        errors.push('rootAllowedFiles must contain only strings');
      }
    }
    
    if (config.specSubdirs && Array.isArray(config.specSubdirs)) {
      if (config.specSubdirs.some(d => typeof d !== 'string')) {
        errors.push('specSubdirs must contain only strings');
      }
    }

    if (config.specAllowedRootFiles && Array.isArray(config.specAllowedRootFiles)) {
      if (config.specAllowedRootFiles.some(f => typeof f !== 'string')) {
        errors.push('specAllowedRootFiles must contain only strings');
      }
    }
    
    if (config.temporaryPatterns && Array.isArray(config.temporaryPatterns)) {
      if (config.temporaryPatterns.some(p => typeof p !== 'string')) {
        errors.push('temporaryPatterns must contain only strings');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = ConfigManager;
