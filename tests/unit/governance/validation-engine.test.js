/**
 * Unit tests for ValidationEngine
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const ValidationEngine = require('../../../lib/governance/validation-engine');

describe('ValidationEngine', () => {
  let testDir;
  let engine;
  let config;
  
  beforeEach(async () => {
    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validation-test-'));
    
    // Default config
    config = {
      rootAllowedFiles: ['README.md', 'README.zh.md', 'CHANGELOG.md', 'CONTRIBUTING.md'],
      specAllowedRootFiles: ['requirements.md', 'design.md', 'tasks.md', 'collaboration.json'],
      specSubdirs: ['reports', 'scripts', 'tests', 'results', 'docs'],
      temporaryPatterns: ['*-SUMMARY.md', 'SESSION-*.md', '*-COMPLETE.md']
    };
    
    engine = new ValidationEngine(testDir, config);
  });
  
  afterEach(async () => {
    // Clean up test directory
    await fs.remove(testDir);
  });
  
  describe('validateRootDirectory', () => {
    test('should pass when only allowed files exist', async () => {
      // Create allowed files
      await fs.writeFile(path.join(testDir, 'README.md'), '# Test');
      await fs.writeFile(path.join(testDir, 'CHANGELOG.md'), '# Changelog');
      
      const report = await engine.validate();
      
      expect(report.valid).toBe(true);
      expect(report.errors).toHaveLength(0);
    });
    
    test('should detect non-allowed markdown files in root', async () => {
      // Create non-allowed file
      await fs.writeFile(path.join(testDir, 'TEMP-notes.md'), '# Notes');
      
      const report = await engine.validate();
      
      expect(report.valid).toBe(false);
      expect(report.errors).toHaveLength(1);
      expect(report.errors[0].type).toBe('root_violation');
      expect(report.errors[0].path).toContain('TEMP-notes.md');
    });
    
    test('should detect multiple violations in root', async () => {
      await fs.writeFile(path.join(testDir, 'TEMP-1.md'), '# Temp 1');
      await fs.writeFile(path.join(testDir, 'TEMP-2.md'), '# Temp 2');
      await fs.writeFile(path.join(testDir, 'SESSION-notes.md'), '# Session');
      
      const report = await engine.validate();
      
      expect(report.valid).toBe(false);
      expect(report.errors).toHaveLength(3);
    });
  });
  
  describe('validateSpec', () => {
    test('should pass when Spec has all required files', async () => {
      const specPath = path.join(testDir, '.sce/specs/test-spec');
      await fs.ensureDir(specPath);
      await fs.writeFile(path.join(specPath, 'requirements.md'), '# Requirements');
      await fs.writeFile(path.join(specPath, 'design.md'), '# Design');
      await fs.writeFile(path.join(specPath, 'tasks.md'), '# Tasks');
      await fs.writeFile(path.join(specPath, 'collaboration.json'), '{}');
      
      const report = await engine.validate({ spec: 'test-spec' });
      
      expect(report.valid).toBe(true);
      expect(report.errors).toHaveLength(0);
      expect(report.warnings).toHaveLength(0);
    });
    
    test('should detect missing required files', async () => {
      const specPath = path.join(testDir, '.sce/specs/test-spec');
      await fs.ensureDir(specPath);
      await fs.writeFile(path.join(specPath, 'requirements.md'), '# Requirements');
      // Missing design.md and tasks.md
      
      const report = await engine.validate({ spec: 'test-spec' });
      
      expect(report.valid).toBe(false);
      expect(report.errors).toHaveLength(2);
      expect(report.errors[0].type).toBe('missing_required_file');
      expect(report.errors[0].path).toContain('design.md');
      expect(report.errors[1].path).toContain('tasks.md');
    });
    
    test('should detect non-existent Spec directory', async () => {
      const report = await engine.validate({ spec: 'non-existent-spec' });
      
      expect(report.valid).toBe(false);
      expect(report.errors).toHaveLength(1);
      expect(report.errors[0].type).toBe('missing_spec');
    });
    
    test('should warn about misplaced artifacts', async () => {
      const specPath = path.join(testDir, '.sce/specs/test-spec');
      await fs.ensureDir(specPath);
      await fs.writeFile(path.join(specPath, 'requirements.md'), '# Requirements');
      await fs.writeFile(path.join(specPath, 'design.md'), '# Design');
      await fs.writeFile(path.join(specPath, 'tasks.md'), '# Tasks');
      await fs.writeFile(path.join(specPath, 'analysis.md'), '# Analysis');
      
      const report = await engine.validate({ spec: 'test-spec' });
      
      expect(report.valid).toBe(true); // No errors, only warnings
      expect(report.warnings).toHaveLength(1);
      expect(report.warnings[0].type).toBe('misplaced_artifact');
      expect(report.warnings[0].path).toContain('analysis.md');
    });
    
    test('should warn about non-standard subdirectories', async () => {
      const specPath = path.join(testDir, '.sce/specs/test-spec');
      await fs.ensureDir(specPath);
      await fs.writeFile(path.join(specPath, 'requirements.md'), '# Requirements');
      await fs.writeFile(path.join(specPath, 'design.md'), '# Design');
      await fs.writeFile(path.join(specPath, 'tasks.md'), '# Tasks');
      await fs.ensureDir(path.join(specPath, 'custom-dir'));
      
      const report = await engine.validate({ spec: 'test-spec' });
      
      expect(report.valid).toBe(true); // No errors, only warnings
      expect(report.warnings).toHaveLength(1);
      expect(report.warnings[0].type).toBe('invalid_subdirectory');
      expect(report.warnings[0].path).toContain('custom-dir');
    });
    
    test('should not warn about hidden subdirectories', async () => {
      const specPath = path.join(testDir, '.sce/specs/test-spec');
      await fs.ensureDir(specPath);
      await fs.writeFile(path.join(specPath, 'requirements.md'), '# Requirements');
      await fs.writeFile(path.join(specPath, 'design.md'), '# Design');
      await fs.writeFile(path.join(specPath, 'tasks.md'), '# Tasks');
      await fs.ensureDir(path.join(specPath, '.hidden'));
      
      const report = await engine.validate({ spec: 'test-spec' });
      
      expect(report.valid).toBe(true);
      expect(report.warnings).toHaveLength(0);
    });
    
    test('should validate standard subdirectories as compliant', async () => {
      const specPath = path.join(testDir, '.sce/specs/test-spec');
      await fs.ensureDir(specPath);
      await fs.writeFile(path.join(specPath, 'requirements.md'), '# Requirements');
      await fs.writeFile(path.join(specPath, 'design.md'), '# Design');
      await fs.writeFile(path.join(specPath, 'tasks.md'), '# Tasks');
      await fs.ensureDir(path.join(specPath, 'reports'));
      await fs.ensureDir(path.join(specPath, 'scripts'));
      await fs.ensureDir(path.join(specPath, 'tests'));
      
      const report = await engine.validate({ spec: 'test-spec' });
      
      expect(report.valid).toBe(true);
      expect(report.warnings).toHaveLength(0);
    });
  });
  
  describe('validateAllSpecs', () => {
    test('should validate multiple Specs', async () => {
      // Create two Specs
      const spec1Path = path.join(testDir, '.sce/specs/spec-1');
      const spec2Path = path.join(testDir, '.sce/specs/spec-2');
      
      await fs.ensureDir(spec1Path);
      await fs.writeFile(path.join(spec1Path, 'requirements.md'), '# Requirements');
      await fs.writeFile(path.join(spec1Path, 'design.md'), '# Design');
      await fs.writeFile(path.join(spec1Path, 'tasks.md'), '# Tasks');
      
      await fs.ensureDir(spec2Path);
      await fs.writeFile(path.join(spec2Path, 'requirements.md'), '# Requirements');
      // Missing design.md and tasks.md in spec-2
      
      const report = await engine.validate({ all: true });
      
      expect(report.valid).toBe(false);
      expect(report.errors).toHaveLength(2); // Missing files in spec-2
    });
    
    test('should pass when all Specs are compliant', async () => {
      const spec1Path = path.join(testDir, '.sce/specs/spec-1');
      const spec2Path = path.join(testDir, '.sce/specs/spec-2');
      
      await fs.ensureDir(spec1Path);
      await fs.writeFile(path.join(spec1Path, 'requirements.md'), '# Requirements');
      await fs.writeFile(path.join(spec1Path, 'design.md'), '# Design');
      await fs.writeFile(path.join(spec1Path, 'tasks.md'), '# Tasks');
      
      await fs.ensureDir(spec2Path);
      await fs.writeFile(path.join(spec2Path, 'requirements.md'), '# Requirements');
      await fs.writeFile(path.join(spec2Path, 'design.md'), '# Design');
      await fs.writeFile(path.join(spec2Path, 'tasks.md'), '# Tasks');
      
      const report = await engine.validate({ all: true });
      
      expect(report.valid).toBe(true);
      expect(report.errors).toHaveLength(0);
    });
  });
  
  describe('generateReport', () => {
    test('should include summary statistics', async () => {
      await fs.writeFile(path.join(testDir, 'TEMP-1.md'), '# Temp');
      
      const specPath = path.join(testDir, '.sce/specs/test-spec');
      await fs.ensureDir(specPath);
      await fs.writeFile(path.join(specPath, 'requirements.md'), '# Requirements');
      // Missing design.md and tasks.md
      
      const report = await engine.validate({ all: true });
      
      expect(report.summary).toBeDefined();
      expect(report.summary.totalErrors).toBe(3); // 1 root + 2 missing files
      expect(report.summary.totalWarnings).toBe(0);
    });
    
    test('should provide recommendations in error objects', async () => {
      await fs.writeFile(path.join(testDir, 'TEMP-notes.md'), '# Notes');
      
      const report = await engine.validate();
      
      expect(report.errors[0].recommendation).toBeDefined();
      expect(report.errors[0].recommendation).toBeTruthy();
    });
  });
  
  describe('edge cases', () => {
    test('should handle empty project', async () => {
      const report = await engine.validate();
      
      expect(report.valid).toBe(true);
      expect(report.errors).toHaveLength(0);
    });
    
    test('should handle project with no Specs', async () => {
      await fs.writeFile(path.join(testDir, 'README.md'), '# Test');
      
      const report = await engine.validate({ all: true });
      
      expect(report.valid).toBe(true);
      expect(report.errors).toHaveLength(0);
    });
    
    test('should handle validation without options', async () => {
      await fs.writeFile(path.join(testDir, 'README.md'), '# Test');
      
      const report = await engine.validate();
      
      expect(report).toBeDefined();
      expect(report.valid).toBe(true);
    });
  });
});
