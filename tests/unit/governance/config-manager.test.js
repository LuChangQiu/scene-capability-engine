/**
 * Unit Tests for ConfigManager
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const ConfigManager = require('../../../lib/governance/config-manager');

describe('ConfigManager', () => {
  let tempDir;
  let configManager;
  
  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-manager-test-'));
    configManager = new ConfigManager(tempDir);
  });
  
  afterEach(async () => {
    // Clean up temporary directory
    await fs.remove(tempDir);
  });
  
  describe('getDefaults', () => {
    it('should return default configuration with all required fields', () => {
      const defaults = configManager.getDefaults();
      
      expect(defaults).toHaveProperty('rootAllowedFiles');
      expect(defaults).toHaveProperty('specAllowedRootFiles');
      expect(defaults).toHaveProperty('specSubdirs');
      expect(defaults).toHaveProperty('temporaryPatterns');
      
      expect(Array.isArray(defaults.rootAllowedFiles)).toBe(true);
      expect(Array.isArray(defaults.specAllowedRootFiles)).toBe(true);
      expect(Array.isArray(defaults.specSubdirs)).toBe(true);
      expect(Array.isArray(defaults.temporaryPatterns)).toBe(true);
    });
    
    it('should include standard root allowed files', () => {
      const defaults = configManager.getDefaults();
      
      expect(defaults.rootAllowedFiles).toContain('README.md');
      expect(defaults.rootAllowedFiles).toContain('README.zh.md');
      expect(defaults.rootAllowedFiles).toContain('CHANGELOG.md');
      expect(defaults.rootAllowedFiles).toContain('CONTRIBUTING.md');
      expect(defaults.specAllowedRootFiles).toContain('requirements.md');
      expect(defaults.specAllowedRootFiles).toContain('design.md');
      expect(defaults.specAllowedRootFiles).toContain('tasks.md');
      expect(defaults.specAllowedRootFiles).toContain('collaboration.json');
    });
    
    it('should include standard spec subdirectories', () => {
      const defaults = configManager.getDefaults();
      
      expect(defaults.specSubdirs).toContain('reports');
      expect(defaults.specSubdirs).toContain('scripts');
      expect(defaults.specSubdirs).toContain('tests');
      expect(defaults.specSubdirs).toContain('results');
      expect(defaults.specSubdirs).toContain('docs');
    });
    
    it('should include temporary file patterns', () => {
      const defaults = configManager.getDefaults();
      
      expect(defaults.temporaryPatterns).toContain('*-SUMMARY.md');
      expect(defaults.temporaryPatterns).toContain('SESSION-*.md');
      expect(defaults.temporaryPatterns).toContain('*-COMPLETE.md');
    });
  });
  
  describe('load', () => {
    it('should return defaults when config file does not exist', async () => {
      const config = await configManager.load();
      const defaults = configManager.getDefaults();
      
      expect(config).toEqual(defaults);
    });
    
    it('should load existing config file', async () => {
      const customConfig = {
        rootAllowedFiles: ['README.md', 'CUSTOM.md'],
        specAllowedRootFiles: ['requirements.md', 'design.md', 'tasks.md', 'meta.json'],
        specSubdirs: ['reports', 'custom'],
        temporaryPatterns: ['TEMP-*.md']
      };
      
      // Create config file
      const configPath = path.join(tempDir, '.sce/config/docs.json');
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeJson(configPath, customConfig);
      
      const config = await configManager.load();
      
      expect(config.rootAllowedFiles).toEqual(customConfig.rootAllowedFiles);
      expect(config.specAllowedRootFiles).toEqual(customConfig.specAllowedRootFiles);
      expect(config.specSubdirs).toEqual(customConfig.specSubdirs);
      expect(config.temporaryPatterns).toEqual(customConfig.temporaryPatterns);
    });
    
    it('should merge with defaults when config file has missing fields', async () => {
      const partialConfig = {
        rootAllowedFiles: ['README.md', 'CUSTOM.md']
      };
      
      // Create config file with partial data
      const configPath = path.join(tempDir, '.sce/config/docs.json');
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeJson(configPath, partialConfig);
      
      const config = await configManager.load();
      const defaults = configManager.getDefaults();
      
      expect(config.rootAllowedFiles).toEqual(partialConfig.rootAllowedFiles);
      expect(config.specAllowedRootFiles).toEqual(defaults.specAllowedRootFiles);
      expect(config.specSubdirs).toEqual(defaults.specSubdirs);
      expect(config.temporaryPatterns).toEqual(defaults.temporaryPatterns);
    });
    
    it('should use defaults when config file is corrupted', async () => {
      // Create corrupted config file
      const configPath = path.join(tempDir, '.sce/config/docs.json');
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeFile(configPath, 'invalid json {{{', 'utf8');
      
      // Spy on console.warn
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const config = await configManager.load();
      const defaults = configManager.getDefaults();
      
      expect(config).toEqual(defaults);
      expect(warnSpy).toHaveBeenCalledWith('Config file corrupted, using defaults');
      
      warnSpy.mockRestore();
    });
  });
  
  describe('save', () => {
    it('should save configuration to file', async () => {
      const customConfig = {
        rootAllowedFiles: ['README.md'],
        specAllowedRootFiles: ['requirements.md', 'tasks.md'],
        specSubdirs: ['reports'],
        temporaryPatterns: ['TEMP-*.md']
      };
      
      await configManager.save(customConfig);
      
      const configPath = path.join(tempDir, '.sce/config/docs.json');
      const savedConfig = await fs.readJson(configPath);
      
      expect(savedConfig).toEqual(customConfig);
    });
    
    it('should create config directory if it does not exist', async () => {
      const customConfig = {
        rootAllowedFiles: ['README.md'],
        specAllowedRootFiles: ['requirements.md', 'tasks.md'],
        specSubdirs: ['reports'],
        temporaryPatterns: ['TEMP-*.md']
      };
      
      await configManager.save(customConfig);
      
      const configDir = path.join(tempDir, '.sce/config');
      const exists = await fs.pathExists(configDir);
      
      expect(exists).toBe(true);
    });
    
    it('should update internal config state after save', async () => {
      const customConfig = {
        rootAllowedFiles: ['README.md'],
        specAllowedRootFiles: ['requirements.md', 'tasks.md'],
        specSubdirs: ['reports'],
        temporaryPatterns: ['TEMP-*.md']
      };
      
      await configManager.save(customConfig);
      
      expect(configManager.config).toEqual(customConfig);
    });
  });
  
  describe('set', () => {
    it('should update a configuration value', async () => {
      await configManager.load();
      
      const newValue = ['README.md', 'CUSTOM.md'];
      await configManager.set('rootAllowedFiles', newValue);
      
      expect(configManager.config.rootAllowedFiles).toEqual(newValue);
    });
    
    it('should persist the change to file', async () => {
      await configManager.load();
      
      const newValue = ['README.md', 'CUSTOM.md'];
      await configManager.set('rootAllowedFiles', newValue);
      
      const configPath = path.join(tempDir, '.sce/config/docs.json');
      const savedConfig = await fs.readJson(configPath);
      
      expect(savedConfig.rootAllowedFiles).toEqual(newValue);
    });
    
    it('should load config if not already loaded', async () => {
      const newValue = ['README.md', 'CUSTOM.md'];
      await configManager.set('rootAllowedFiles', newValue);
      
      expect(configManager.config).toBeDefined();
      expect(configManager.config.rootAllowedFiles).toEqual(newValue);
    });
  });
  
  describe('get', () => {
    it('should return a configuration value', async () => {
      await configManager.load();
      
      const value = configManager.get('rootAllowedFiles');
      const defaults = configManager.getDefaults();
      
      expect(value).toEqual(defaults.rootAllowedFiles);
    });
    
    it('should throw error if config not loaded', () => {
      expect(() => {
        configManager.get('rootAllowedFiles');
      }).toThrow('Configuration not loaded');
    });
  });
  
  describe('getAll', () => {
    it('should return complete configuration', async () => {
      await configManager.load();
      
      const config = configManager.getAll();
      const defaults = configManager.getDefaults();
      
      expect(config).toEqual(defaults);
    });
    
    it('should return a copy of the configuration', async () => {
      await configManager.load();
      
      const config = configManager.getAll();
      config.rootAllowedFiles = ['MODIFIED.md'];
      
      // Original should not be modified
      expect(configManager.config.rootAllowedFiles).not.toEqual(['MODIFIED.md']);
    });
    
    it('should throw error if config not loaded', () => {
      expect(() => {
        configManager.getAll();
      }).toThrow('Configuration not loaded');
    });
  });
  
  describe('reset', () => {
    it('should reset configuration to defaults', async () => {
      // Set custom config
      const customConfig = {
        rootAllowedFiles: ['CUSTOM.md'],
        specAllowedRootFiles: ['requirements.md', 'design.md'],
        specSubdirs: ['custom'],
        temporaryPatterns: ['CUSTOM-*.md']
      };
      await configManager.save(customConfig);
      
      // Reset
      await configManager.reset();
      
      const defaults = configManager.getDefaults();
      expect(configManager.config).toEqual(defaults);
    });
    
    it('should persist reset to file', async () => {
      // Set custom config
      const customConfig = {
        rootAllowedFiles: ['CUSTOM.md'],
        specAllowedRootFiles: ['requirements.md', 'design.md'],
        specSubdirs: ['custom'],
        temporaryPatterns: ['CUSTOM-*.md']
      };
      await configManager.save(customConfig);
      
      // Reset
      await configManager.reset();
      
      const configPath = path.join(tempDir, '.sce/config/docs.json');
      const savedConfig = await fs.readJson(configPath);
      const defaults = configManager.getDefaults();
      
      expect(savedConfig).toEqual(defaults);
    });
  });
  
  describe('validate', () => {
    it('should validate correct configuration', () => {
      const validConfig = {
        rootAllowedFiles: ['README.md'],
        specAllowedRootFiles: ['requirements.md', 'tasks.md'],
        specSubdirs: ['reports'],
        temporaryPatterns: ['TEMP-*.md']
      };
      
      const result = configManager.validate(validConfig);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should detect missing rootAllowedFiles', () => {
      const invalidConfig = {
        specAllowedRootFiles: ['requirements.md'],
        specSubdirs: ['reports'],
        temporaryPatterns: ['TEMP-*.md']
      };
      
      const result = configManager.validate(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('rootAllowedFiles must be an array');
    });
    
    it('should detect non-array rootAllowedFiles', () => {
      const invalidConfig = {
        rootAllowedFiles: 'not-an-array',
        specAllowedRootFiles: ['requirements.md'],
        specSubdirs: ['reports'],
        temporaryPatterns: ['TEMP-*.md']
      };
      
      const result = configManager.validate(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('rootAllowedFiles must be an array');
    });
    
    it('should detect non-string values in rootAllowedFiles', () => {
      const invalidConfig = {
        rootAllowedFiles: ['README.md', 123, null],
        specAllowedRootFiles: ['requirements.md'],
        specSubdirs: ['reports'],
        temporaryPatterns: ['TEMP-*.md']
      };
      
      const result = configManager.validate(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('rootAllowedFiles must contain only strings');
    });
    
    it('should detect missing specAllowedRootFiles', () => {
      const invalidConfig = {
        rootAllowedFiles: ['README.md'],
        specSubdirs: ['reports'],
        temporaryPatterns: ['TEMP-*.md']
      };

      const result = configManager.validate(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('specAllowedRootFiles must be an array');
    });

    it('should detect non-string values in specAllowedRootFiles', () => {
      const invalidConfig = {
        rootAllowedFiles: ['README.md'],
        specAllowedRootFiles: ['requirements.md', false],
        specSubdirs: ['reports'],
        temporaryPatterns: ['TEMP-*.md']
      };

      const result = configManager.validate(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('specAllowedRootFiles must contain only strings');
    });

    it('should detect missing specSubdirs', () => {
      const invalidConfig = {
        rootAllowedFiles: ['README.md'],
        specAllowedRootFiles: ['requirements.md'],
        temporaryPatterns: ['TEMP-*.md']
      };
      
      const result = configManager.validate(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('specSubdirs must be an array');
    });
    
    it('should detect non-string values in specSubdirs', () => {
      const invalidConfig = {
        rootAllowedFiles: ['README.md'],
        specAllowedRootFiles: ['requirements.md'],
        specSubdirs: ['reports', 123],
        temporaryPatterns: ['TEMP-*.md']
      };
      
      const result = configManager.validate(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('specSubdirs must contain only strings');
    });
    
    it('should detect missing temporaryPatterns', () => {
      const invalidConfig = {
        rootAllowedFiles: ['README.md'],
        specAllowedRootFiles: ['requirements.md'],
        specSubdirs: ['reports']
      };
      
      const result = configManager.validate(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('temporaryPatterns must be an array');
    });
    
    it('should detect non-string values in temporaryPatterns', () => {
      const invalidConfig = {
        rootAllowedFiles: ['README.md'],
        specAllowedRootFiles: ['requirements.md'],
        specSubdirs: ['reports'],
        temporaryPatterns: ['TEMP-*.md', false]
      };
      
      const result = configManager.validate(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('temporaryPatterns must contain only strings');
    });
    
    it('should detect multiple validation errors', () => {
      const invalidConfig = {
        rootAllowedFiles: 'not-an-array',
        specAllowedRootFiles: null,
        specSubdirs: null,
        temporaryPatterns: 123
      };
      
      const result = configManager.validate(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
  
  describe('integration', () => {
    it('should support full lifecycle: load, modify, save, reload', async () => {
      // Load defaults
      const config1 = await configManager.load();
      expect(config1.rootAllowedFiles).toContain('README.md');
      
      // Modify
      await configManager.set('rootAllowedFiles', ['README.md', 'CUSTOM.md']);
      
      // Create new instance and reload
      const configManager2 = new ConfigManager(tempDir);
      const config2 = await configManager2.load();
      
      expect(config2.rootAllowedFiles).toEqual(['README.md', 'CUSTOM.md']);
    });
    
    it('should support reset after customization', async () => {
      // Customize
      await configManager.load();
      await configManager.set('rootAllowedFiles', ['CUSTOM.md']);
      
      // Reset
      await configManager.reset();
      
      // Verify
      const defaults = configManager.getDefaults();
      expect(configManager.config).toEqual(defaults);
    });
  });
});
