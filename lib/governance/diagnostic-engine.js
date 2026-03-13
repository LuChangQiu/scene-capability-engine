/**
 * Diagnostic Engine
 * 
 * Scans and analyzes project documentation structure
 */

const path = require('path');
const FileScanner = require('./file-scanner');
const ConfigManager = require('./config-manager');

class DiagnosticEngine {
  constructor(projectPath, config) {
    this.projectPath = projectPath;
    this.config = config;
    this.scanner = new FileScanner(projectPath);
    this.violations = [];
  }
  
  /**
   * Run full diagnostic scan
   * 
   * @returns {Promise<DiagnosticReport>}
   */
  async scan() {
    this.violations = []; // Reset violations
    
    await this.scanRootDirectory();
    await this.scanSpecDirectories();
    
    return this.generateReport();
  }
  
  /**
   * Scan root directory for violations
   * 
   * @returns {Promise<void>}
   */
  async scanRootDirectory() {
    const mdFiles = await this.scanner.findMarkdownFiles(this.projectPath);
    const allowedFiles = this.config.rootAllowedFiles || [];
    
    for (const filePath of mdFiles) {
      const basename = path.basename(filePath);
      
      if (!allowedFiles.includes(basename)) {
        // Check if it's a temporary document
        const isTemporary = this.scanner.matchesPattern(filePath, this.config.temporaryPatterns || []);
        
        this.violations.push({
          type: 'root_violation',
          path: filePath,
          description: `Unexpected markdown file in root directory: ${basename}`,
          severity: isTemporary ? 'warning' : 'error',
          recommendation: isTemporary 
            ? `Delete temporary file: ${basename}` 
            : `Move ${basename} to appropriate location or delete if temporary`
        });
      }
    }
  }
  
  /**
   * Scan all Spec directories
   * 
   * @returns {Promise<void>}
   */
  async scanSpecDirectories() {
    const specDirs = await this.scanner.findSpecDirectories();
    
    for (const specDir of specDirs) {
      await this.scanSpecDirectory(specDir);
    }
  }
  
  /**
   * Scan a single Spec directory
   * 
   * @param {string} specPath - Path to Spec directory
   * @returns {Promise<void>}
   */
  async scanSpecDirectory(specPath) {
    const specName = path.basename(specPath);
    const requiredFiles = ['requirements.md', 'design.md', 'tasks.md'];
    const allowedRootFiles = this.config.specAllowedRootFiles || requiredFiles;
    
    // Check for missing required files
    for (const requiredFile of requiredFiles) {
      const filePath = path.join(specPath, requiredFile);
      const exists = await this.scanner.exists(filePath);
      
      if (!exists) {
        this.violations.push({
          type: 'missing_required_file',
          path: filePath,
          description: `Missing required file in Spec ${specName}: ${requiredFile}`,
          severity: 'error',
          recommendation: `Create ${requiredFile} in ${specName}`
        });
      }
    }
    
    // Check for temporary documents in Spec directory
    const mdFiles = await this.scanner.findMarkdownFiles(specPath);
    const temporaryFiles = this.scanner.matchPatterns(mdFiles, this.config.temporaryPatterns || []);
    
    for (const tempFile of temporaryFiles) {
      const basename = path.basename(tempFile);
      
      // Don't flag required files as temporary even if they match patterns
      if (!requiredFiles.includes(basename)) {
        this.violations.push({
          type: 'temporary_document',
          path: tempFile,
          description: `Temporary document should be deleted: ${basename}`,
          severity: 'warning',
          recommendation: `Delete temporary file: ${basename} from ${specName}`
        });
      }
    }
    
    // Check for misplaced artifacts (files not in subdirectories)
    const allFiles = await this.scanner.getFiles(specPath);
    
    for (const filePath of allFiles) {
      const basename = path.basename(filePath);
      
      // Skip required files
      if (allowedRootFiles.includes(basename)) {
        continue;
      }
      
      // Skip temporary files (already flagged as temporary_document)
      if (this.scanner.matchesPattern(filePath, this.config.temporaryPatterns || [])) {
        continue;
      }
      
      // This is a misplaced artifact
      this.violations.push({
        type: 'misplaced_artifact',
        path: filePath,
        description: `Artifact not in subdirectory: ${basename}`,
        severity: 'warning',
        recommendation: `Move ${basename} to appropriate subdirectory (${this.config.specSubdirs.join(', ')})`
      });
    }
    
    // Check subdirectory naming
    const subdirs = await this.scanner.getSubdirectories(specPath);
    const allowedSubdirs = this.config.specSubdirs || [];
    
    for (const subdirPath of subdirs) {
      const subdirName = path.basename(subdirPath);
      
      // Skip hidden directories
      if (subdirName.startsWith('.')) {
        continue;
      }
      
      if (!allowedSubdirs.includes(subdirName)) {
        this.violations.push({
          type: 'invalid_subdirectory',
          path: subdirPath,
          description: `Non-standard subdirectory in Spec ${specName}: ${subdirName}`,
          severity: 'info',
          recommendation: `Rename to one of: ${allowedSubdirs.join(', ')}, or remove if not needed`
        });
      }
    }
  }
  
  /**
   * Generate diagnostic report
   * 
   * @returns {DiagnosticReport}
   */
  generateReport() {
    const compliant = this.violations.length === 0;
    
    return {
      compliant,
      violations: this.violations,
      summary: this.generateSummary(),
      recommendations: this.generateRecommendations()
    };
  }
  
  /**
   * Generate summary statistics
   * 
   * @returns {Object}
   */
  generateSummary() {
    const summary = {
      totalViolations: this.violations.length,
      byType: {},
      bySeverity: {
        error: 0,
        warning: 0,
        info: 0
      }
    };
    
    // Count by type
    for (const violation of this.violations) {
      summary.byType[violation.type] = (summary.byType[violation.type] || 0) + 1;
      summary.bySeverity[violation.severity] = (summary.bySeverity[violation.severity] || 0) + 1;
    }
    
    return summary;
  }
  
  /**
   * Generate actionable recommendations
   * 
   * @returns {string[]}
   */
  generateRecommendations() {
    const recommendations = [];
    const summary = this.generateSummary();
    
    // Root violations
    if (summary.byType.root_violation > 0) {
      recommendations.push('Run `sce cleanup` to remove temporary files from root directory');
    }
    
    // Temporary documents
    if (summary.byType.temporary_document > 0) {
      recommendations.push('Run `sce cleanup` to remove temporary documents from Spec directories');
    }
    
    // Misplaced artifacts
    if (summary.byType.misplaced_artifact > 0) {
      recommendations.push('Run `sce docs archive --spec <spec-name>` to organize artifacts into subdirectories');
    }
    
    // Missing required files
    if (summary.byType.missing_required_file > 0) {
      recommendations.push('Create missing required files (requirements.md, design.md, tasks.md) in affected Specs');
    }
    
    // Invalid subdirectories
    if (summary.byType.invalid_subdirectory > 0) {
      recommendations.push('Rename non-standard subdirectories to match allowed names');
    }
    
    // General recommendation
    if (recommendations.length > 0) {
      recommendations.push('Run `sce validate --all` after fixes to confirm compliance');
    }
    
    return recommendations;
  }
}

/**
 * @typedef {Object} DiagnosticReport
 * @property {boolean} compliant - Whether project is compliant
 * @property {Violation[]} violations - List of violations found
 * @property {Object} summary - Summary statistics
 * @property {string[]} recommendations - Actionable recommendations
 */

/**
 * @typedef {Object} Violation
 * @property {string} type - Violation type (root_violation, spec_violation, etc.)
 * @property {string} path - File or directory path
 * @property {string} description - Human-readable description
 * @property {string} severity - Severity level (error, warning, info)
 * @property {string} recommendation - How to fix
 */

module.exports = DiagnosticEngine;
