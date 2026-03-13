/**
 * Validation Engine
 * 
 * Validates project documentation structure
 */

const path = require('path');
const FileScanner = require('./file-scanner');

class ValidationEngine {
  constructor(projectPath, config) {
    this.projectPath = projectPath;
    this.config = config;
    this.scanner = new FileScanner(projectPath);
    this.validationErrors = [];
    this.validationWarnings = [];
  }
  
  /**
   * Validate project structure
   * 
   * @param {Object} options - Validation options
   * @param {string} options.spec - Specific Spec to validate
   * @param {boolean} options.all - Validate all Specs
   * @returns {Promise<ValidationReport>}
   */
  async validate(options = {}) {
    this.validationErrors = []; // Reset
    this.validationWarnings = []; // Reset
    
    await this.validateRootDirectory();
    
    if (options.spec) {
      await this.validateSpec(options.spec);
    } else if (options.all) {
      await this.validateAllSpecs();
    }
    
    return this.generateReport();
  }
  
  /**
   * Validate root directory
   * 
   * @returns {Promise<void>}
   */
  async validateRootDirectory() {
    const mdFiles = await this.scanner.findMarkdownFiles(this.projectPath);
    const allowedFiles = this.config.rootAllowedFiles || [];
    
    for (const filePath of mdFiles) {
      const basename = path.basename(filePath);
      
      if (!allowedFiles.includes(basename)) {
        this.validationErrors.push({
          type: 'root_violation',
          path: filePath,
          message: `Unexpected markdown file in root: ${basename}`,
          recommendation: 'Move to appropriate location or delete if temporary'
        });
      }
    }
  }
  
  /**
   * Validate all Spec directories
   * 
   * @returns {Promise<void>}
   */
  async validateAllSpecs() {
    const specDirs = await this.scanner.findSpecDirectories();
    
    for (const specDir of specDirs) {
      const specName = path.basename(specDir);
      await this.validateSpec(specName);
    }
  }
  
  /**
   * Validate a Spec directory
   * 
   * @param {string} specName - Spec name
   * @returns {Promise<void>}
   */
  async validateSpec(specName) {
    const specPath = this.scanner.getSpecDirectory(specName);
    const requiredFiles = ['requirements.md', 'design.md', 'tasks.md'];
    const allowedRootFiles = this.config.specAllowedRootFiles || requiredFiles;
    
    // Check if Spec directory exists
    if (!await this.scanner.exists(specPath)) {
      this.validationErrors.push({
        type: 'missing_spec',
        path: specPath,
        message: `Spec directory does not exist: ${specName}`,
        recommendation: `Create Spec directory at ${specPath}`
      });
      return;
    }
    
    // Check required files
    for (const file of requiredFiles) {
      const filePath = path.join(specPath, file);
      if (!await this.scanner.exists(filePath)) {
        this.validationErrors.push({
          type: 'missing_required_file',
          path: filePath,
          message: `Missing required file: ${file}`,
          recommendation: `Create ${file} in ${specName}`
        });
      }
    }
    
    // Check for misplaced artifacts
    const files = await this.scanner.getFiles(specPath);
    const allowedSubdirs = this.config.specSubdirs || [];
    
    for (const filePath of files) {
      const basename = path.basename(filePath);
      
      // Skip required files
      if (allowedRootFiles.includes(basename)) {
        continue;
      }
      
      this.validationWarnings.push({
        type: 'misplaced_artifact',
        path: filePath,
        message: `Artifact not in subdirectory: ${basename}`,
        recommendation: `Move to appropriate subdirectory (${allowedSubdirs.join(', ')})`
      });
    }
    
    // Check subdirectory naming
    const subdirs = await this.scanner.getSubdirectories(specPath);
    
    for (const subdirPath of subdirs) {
      const subdirName = path.basename(subdirPath);
      
      // Skip hidden directories
      if (subdirName.startsWith('.')) {
        continue;
      }
      
      if (!allowedSubdirs.includes(subdirName)) {
        this.validationWarnings.push({
          type: 'invalid_subdirectory',
          path: subdirPath,
          message: `Non-standard subdirectory: ${subdirName}`,
          recommendation: `Rename to one of: ${allowedSubdirs.join(', ')}, or remove if not needed`
        });
      }
    }
  }
  
  /**
   * Generate validation report
   * 
   * @returns {ValidationReport}
   */
  generateReport() {
    return {
      valid: this.validationErrors.length === 0,
      errors: this.validationErrors,
      warnings: this.validationWarnings,
      summary: {
        totalErrors: this.validationErrors.length,
        totalWarnings: this.validationWarnings.length
      }
    };
  }
}

/**
 * @typedef {Object} ValidationReport
 * @property {boolean} valid - Whether validation passed
 * @property {Object[]} errors - Validation errors
 * @property {Object[]} warnings - Validation warnings
 * @property {Object} summary - Summary statistics
 */

module.exports = ValidationEngine;
