/**
 * Unit tests for DiagnosticEngine
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const DiagnosticEngine = require('../../../lib/governance/diagnostic-engine');
const ConfigManager = require('../../../lib/governance/config-manager');

describe('DiagnosticEngine', () => {
  let tempDir;
  let config;
  
  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'diagnostic-test-'));
    
    // Load default configuration
    const configManager = new ConfigManager(tempDir);
    config = await configManager.load();
  });
  
  afterEach(async () => {
    // Clean up temporary directory
    await fs.remove(tempDir);
  });
  
  describe('constructor', () => {
    it('should create a DiagnosticEngine instance', () => {
      const engine = new DiagnosticEngine(tempDir, config);
      
      expect(engine).toBeDefined();
      expect(engine.projectPath).toBe(tempDir);
      expect(engine.config).toBe(config);
      expect(engine.violations).toEqual([]);
    });
  });
  
  describe('scanRootDirectory', () => {
    it('should not report violations for allowed files', async () => {
      // Create allowed files
      await fs.writeFile(path.join(tempDir, 'README.md'), '# README');
      await fs.writeFile(path.join(tempDir, 'README.zh.md'), '# README');
      await fs.writeFile(path.join(tempDir, 'CHANGELOG.md'), '# CHANGELOG');
      await fs.writeFile(path.join(tempDir, 'CONTRIBUTING.md'), '# CONTRIBUTING');
      
      const engine = new DiagnosticEngine(tempDir, config);
      await engine.scanRootDirectory();
      
      expect(engine.violations).toEqual([]);
    });
    
    it('should report violations for non-allowed files', async () => {
      // Create non-allowed file
      await fs.writeFile(path.join(tempDir, 'EXTRA.md'), '# EXTRA');
      
      const engine = new DiagnosticEngine(tempDir, config);
      await engine.scanRootDirectory();
      
      expect(engine.violations).toHaveLength(1);
      expect(engine.violations[0]).toMatchObject({
        type: 'root_violation',
        severity: 'error',
        description: expect.stringContaining('EXTRA.md')
      });
    });
    
    it('should report temporary files as warnings', async () => {
      // Create temporary file matching pattern
      await fs.writeFile(path.join(tempDir, 'SESSION-SUMMARY.md'), '# SESSION');
      
      const engine = new DiagnosticEngine(tempDir, config);
      await engine.scanRootDirectory();
      
      expect(engine.violations).toHaveLength(1);
      expect(engine.violations[0]).toMatchObject({
        type: 'root_violation',
        severity: 'warning',
        description: expect.stringContaining('SESSION-SUMMARY.md')
      });
    });
    
    it('should handle empty root directory', async () => {
      const engine = new DiagnosticEngine(tempDir, config);
      await engine.scanRootDirectory();
      
      expect(engine.violations).toEqual([]);
    });
    
    it('should report multiple violations', async () => {
      // Create multiple non-allowed files
      await fs.writeFile(path.join(tempDir, 'EXTRA1.md'), '# EXTRA1');
      await fs.writeFile(path.join(tempDir, 'EXTRA2.md'), '# EXTRA2');
      await fs.writeFile(path.join(tempDir, 'TEMP-FILE.md'), '# TEMP');
      
      const engine = new DiagnosticEngine(tempDir, config);
      await engine.scanRootDirectory();
      
      expect(engine.violations).toHaveLength(3);
    });
  });
  
  describe('scanSpecDirectory', () => {
    let specPath;
    
    beforeEach(async () => {
      // Create Spec directory structure
      specPath = path.join(tempDir, '.sce/specs/test-spec');
      await fs.ensureDir(specPath);
    });
    
    it('should report missing required files', async () => {
      const engine = new DiagnosticEngine(tempDir, config);
      await engine.scanSpecDirectory(specPath);
      
      expect(engine.violations).toHaveLength(3);
      expect(engine.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'missing_required_file',
            severity: 'error',
            description: expect.stringContaining('requirements.md')
          }),
          expect.objectContaining({
            type: 'missing_required_file',
            severity: 'error',
            description: expect.stringContaining('design.md')
          }),
          expect.objectContaining({
            type: 'missing_required_file',
            severity: 'error',
            description: expect.stringContaining('tasks.md')
          })
        ])
      );
    });
    
    it('should not report violations for complete Spec', async () => {
      // Create required files
      await fs.writeFile(path.join(specPath, 'requirements.md'), '# Requirements');
      await fs.writeFile(path.join(specPath, 'design.md'), '# Design');
      await fs.writeFile(path.join(specPath, 'tasks.md'), '# Tasks');
      await fs.writeFile(path.join(specPath, 'collaboration.json'), '{}');
      
      const engine = new DiagnosticEngine(tempDir, config);
      await engine.scanSpecDirectory(specPath);
      
      expect(engine.violations).toEqual([]);
    });

    it('should allow collaboration metadata at the Spec root', async () => {
      await fs.writeFile(path.join(specPath, 'requirements.md'), '# Requirements');
      await fs.writeFile(path.join(specPath, 'design.md'), '# Design');
      await fs.writeFile(path.join(specPath, 'tasks.md'), '# Tasks');
      await fs.writeFile(path.join(specPath, 'collaboration.json'), '{}');

      const engine = new DiagnosticEngine(tempDir, config);
      await engine.scanSpecDirectory(specPath);

      expect(engine.violations).toEqual([]);
    });
    
    it('should report temporary documents', async () => {
      // Create required files
      await fs.writeFile(path.join(specPath, 'requirements.md'), '# Requirements');
      await fs.writeFile(path.join(specPath, 'design.md'), '# Design');
      await fs.writeFile(path.join(specPath, 'tasks.md'), '# Tasks');
      
      // Create temporary document
      await fs.writeFile(path.join(specPath, 'SESSION-NOTES.md'), '# Notes');
      
      const engine = new DiagnosticEngine(tempDir, config);
      await engine.scanSpecDirectory(specPath);
      
      expect(engine.violations).toHaveLength(1);
      expect(engine.violations[0]).toMatchObject({
        type: 'temporary_document',
        severity: 'warning',
        description: expect.stringContaining('SESSION-NOTES.md')
      });
    });
    
    it('should report misplaced artifacts', async () => {
      // Create required files
      await fs.writeFile(path.join(specPath, 'requirements.md'), '# Requirements');
      await fs.writeFile(path.join(specPath, 'design.md'), '# Design');
      await fs.writeFile(path.join(specPath, 'tasks.md'), '# Tasks');
      
      // Create misplaced artifact
      await fs.writeFile(path.join(specPath, 'analysis.md'), '# Analysis');
      
      const engine = new DiagnosticEngine(tempDir, config);
      await engine.scanSpecDirectory(specPath);
      
      expect(engine.violations).toHaveLength(1);
      expect(engine.violations[0]).toMatchObject({
        type: 'misplaced_artifact',
        severity: 'warning',
        description: expect.stringContaining('analysis.md')
      });
    });
    
    it('should report invalid subdirectories', async () => {
      // Create required files
      await fs.writeFile(path.join(specPath, 'requirements.md'), '# Requirements');
      await fs.writeFile(path.join(specPath, 'design.md'), '# Design');
      await fs.writeFile(path.join(specPath, 'tasks.md'), '# Tasks');
      
      // Create invalid subdirectory
      await fs.ensureDir(path.join(specPath, 'custom-dir'));
      
      const engine = new DiagnosticEngine(tempDir, config);
      await engine.scanSpecDirectory(specPath);
      
      expect(engine.violations).toHaveLength(1);
      expect(engine.violations[0]).toMatchObject({
        type: 'invalid_subdirectory',
        severity: 'info',
        description: expect.stringContaining('custom-dir')
      });
    });
    
    it('should not report allowed subdirectories', async () => {
      // Create required files
      await fs.writeFile(path.join(specPath, 'requirements.md'), '# Requirements');
      await fs.writeFile(path.join(specPath, 'design.md'), '# Design');
      await fs.writeFile(path.join(specPath, 'tasks.md'), '# Tasks');
      
      // Create allowed subdirectories
      await fs.ensureDir(path.join(specPath, 'reports'));
      await fs.ensureDir(path.join(specPath, 'scripts'));
      await fs.ensureDir(path.join(specPath, 'tests'));
      
      const engine = new DiagnosticEngine(tempDir, config);
      await engine.scanSpecDirectory(specPath);
      
      expect(engine.violations).toEqual([]);
    });
    
    it('should not report hidden subdirectories', async () => {
      // Create required files
      await fs.writeFile(path.join(specPath, 'requirements.md'), '# Requirements');
      await fs.writeFile(path.join(specPath, 'design.md'), '# Design');
      await fs.writeFile(path.join(specPath, 'tasks.md'), '# Tasks');
      
      // Create hidden subdirectory
      await fs.ensureDir(path.join(specPath, '.hidden'));
      
      const engine = new DiagnosticEngine(tempDir, config);
      await engine.scanSpecDirectory(specPath);
      
      expect(engine.violations).toEqual([]);
    });
  });
  
  describe('scanSpecDirectories', () => {
    it('should scan all Spec directories', async () => {
      // Create multiple Spec directories
      const spec1Path = path.join(tempDir, '.sce/specs/spec-1');
      const spec2Path = path.join(tempDir, '.sce/specs/spec-2');
      
      await fs.ensureDir(spec1Path);
      await fs.ensureDir(spec2Path);
      
      const engine = new DiagnosticEngine(tempDir, config);
      await engine.scanSpecDirectories();
      
      // Each Spec is missing 3 required files
      expect(engine.violations).toHaveLength(6);
    });
    
    it('should handle no Spec directories', async () => {
      const engine = new DiagnosticEngine(tempDir, config);
      await engine.scanSpecDirectories();
      
      expect(engine.violations).toEqual([]);
    });
  });
  
  describe('scan', () => {
    it('should scan both root and Spec directories', async () => {
      // Create root violation
      await fs.writeFile(path.join(tempDir, 'EXTRA.md'), '# EXTRA');
      
      // Create Spec with missing files
      const specPath = path.join(tempDir, '.sce/specs/test-spec');
      await fs.ensureDir(specPath);
      
      const engine = new DiagnosticEngine(tempDir, config);
      const report = await engine.scan();
      
      // 1 root violation + 3 missing required files
      expect(report.violations).toHaveLength(4);
      expect(report.compliant).toBe(false);
    });
    
    it('should reset violations on each scan', async () => {
      // Create violation
      await fs.writeFile(path.join(tempDir, 'EXTRA.md'), '# EXTRA');
      
      const engine = new DiagnosticEngine(tempDir, config);
      
      // First scan
      await engine.scan();
      expect(engine.violations).toHaveLength(1);
      
      // Remove violation
      await fs.remove(path.join(tempDir, 'EXTRA.md'));
      
      // Second scan should reset violations
      await engine.scan();
      expect(engine.violations).toEqual([]);
    });
  });
  
  describe('generateReport', () => {
    it('should generate compliant report for clean project', async () => {
      const engine = new DiagnosticEngine(tempDir, config);
      const report = await engine.scan();
      
      expect(report).toMatchObject({
        compliant: true,
        violations: [],
        summary: {
          totalViolations: 0,
          byType: {},
          bySeverity: {
            error: 0,
            warning: 0,
            info: 0
          }
        },
        recommendations: []
      });
    });
    
    it('should generate non-compliant report with violations', async () => {
      // Create violations
      await fs.writeFile(path.join(tempDir, 'EXTRA.md'), '# EXTRA');
      
      const engine = new DiagnosticEngine(tempDir, config);
      const report = await engine.scan();
      
      expect(report).toMatchObject({
        compliant: false,
        violations: expect.arrayContaining([
          expect.objectContaining({
            type: 'root_violation'
          })
        ]),
        summary: {
          totalViolations: 1,
          byType: {
            root_violation: 1
          },
          bySeverity: {
            error: 1,
            warning: 0,
            info: 0
          }
        }
      });
      
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
    
    it('should include all violation fields', async () => {
      // Create violation
      await fs.writeFile(path.join(tempDir, 'EXTRA.md'), '# EXTRA');
      
      const engine = new DiagnosticEngine(tempDir, config);
      const report = await engine.scan();
      
      const violation = report.violations[0];
      expect(violation).toHaveProperty('type');
      expect(violation).toHaveProperty('path');
      expect(violation).toHaveProperty('description');
      expect(violation).toHaveProperty('severity');
      expect(violation).toHaveProperty('recommendation');
      
      // Validate recommendation is non-empty
      expect(violation.recommendation).toBeTruthy();
      expect(violation.recommendation.length).toBeGreaterThan(0);
    });
  });
  
  describe('generateSummary', () => {
    it('should count violations by type', async () => {
      // Create different types of violations
      await fs.writeFile(path.join(tempDir, 'EXTRA.md'), '# EXTRA');
      await fs.writeFile(path.join(tempDir, 'TEMP-FILE.md'), '# TEMP');
      
      const specPath = path.join(tempDir, '.sce/specs/test-spec');
      await fs.ensureDir(specPath);
      
      const engine = new DiagnosticEngine(tempDir, config);
      const report = await engine.scan();
      
      expect(report.summary.byType).toMatchObject({
        root_violation: 2,
        missing_required_file: 3
      });
    });
    
    it('should count violations by severity', async () => {
      // Create error (non-temporary root file)
      await fs.writeFile(path.join(tempDir, 'EXTRA.md'), '# EXTRA');
      
      // Create warning (temporary file)
      await fs.writeFile(path.join(tempDir, 'TEMP-FILE.md'), '# TEMP');
      
      const engine = new DiagnosticEngine(tempDir, config);
      const report = await engine.scan();
      
      expect(report.summary.bySeverity).toMatchObject({
        error: 1,
        warning: 1,
        info: 0
      });
    });
  });
  
  describe('generateRecommendations', () => {
    it('should recommend cleanup for root violations', async () => {
      await fs.writeFile(path.join(tempDir, 'EXTRA.md'), '# EXTRA');
      
      const engine = new DiagnosticEngine(tempDir, config);
      const report = await engine.scan();
      
      expect(report.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringContaining('sce cleanup')
        ])
      );
    });
    
    it('should recommend archive for misplaced artifacts', async () => {
      const specPath = path.join(tempDir, '.sce/specs/test-spec');
      await fs.ensureDir(specPath);
      await fs.writeFile(path.join(specPath, 'requirements.md'), '# Requirements');
      await fs.writeFile(path.join(specPath, 'design.md'), '# Design');
      await fs.writeFile(path.join(specPath, 'tasks.md'), '# Tasks');
      await fs.writeFile(path.join(specPath, 'analysis.md'), '# Analysis');
      
      const engine = new DiagnosticEngine(tempDir, config);
      const report = await engine.scan();
      
      expect(report.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringContaining('sce docs archive')
        ])
      );
    });
    
    it('should recommend validation after fixes', async () => {
      await fs.writeFile(path.join(tempDir, 'EXTRA.md'), '# EXTRA');
      
      const engine = new DiagnosticEngine(tempDir, config);
      const report = await engine.scan();
      
      expect(report.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringContaining('sce validate')
        ])
      );
    });
    
    it('should provide no recommendations for compliant project', async () => {
      const engine = new DiagnosticEngine(tempDir, config);
      const report = await engine.scan();
      
      expect(report.recommendations).toEqual([]);
    });
  });
  
  describe('edge cases', () => {
    it('should handle Spec with only some required files', async () => {
      const specPath = path.join(tempDir, '.sce/specs/test-spec');
      await fs.ensureDir(specPath);
      await fs.writeFile(path.join(specPath, 'requirements.md'), '# Requirements');
      
      const engine = new DiagnosticEngine(tempDir, config);
      await engine.scanSpecDirectory(specPath);
      
      // Missing design.md and tasks.md
      expect(engine.violations).toHaveLength(2);
    });
    
    it('should handle mixed violations in Spec', async () => {
      const specPath = path.join(tempDir, '.sce/specs/test-spec');
      await fs.ensureDir(specPath);
      
      // Missing required files (will create 3 violations)
      // Add temporary document
      await fs.writeFile(path.join(specPath, 'TEMP-NOTES.md'), '# Notes');
      // Add misplaced artifact
      await fs.writeFile(path.join(specPath, 'script.js'), 'console.log()');
      // Add invalid subdirectory
      await fs.ensureDir(path.join(specPath, 'custom'));
      
      const engine = new DiagnosticEngine(tempDir, config);
      await engine.scanSpecDirectory(specPath);
      
      // 3 missing + 1 temporary + 1 misplaced + 1 invalid subdir = 6
      expect(engine.violations).toHaveLength(6);
    });
    
    it('should handle non-existent project path gracefully', async () => {
      const nonExistentPath = path.join(tempDir, 'non-existent');
      const engine = new DiagnosticEngine(nonExistentPath, config);
      
      // Should not throw
      const report = await engine.scan();
      expect(report.compliant).toBe(true);
    });
  });
});
