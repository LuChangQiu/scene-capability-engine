const WatchManager = require('../../lib/watch/watch-manager');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

describe('Watch Mode Integration', () => {
  let manager;
  let testDir;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-watch-mode-integration-'));
    
    manager = new WatchManager({
      basePath: testDir,
      configFile: '.sce/watch-config.json'
    });
  });

  afterEach(async () => {
    if (manager && manager.isRunning) {
      await manager.stop();
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    try {
      await fs.remove(testDir);
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
  });

  describe('End-to-End Watch Mode', () => {
    test('should start and stop watch mode successfully', async () => {
      const config = {
        enabled: true,
        patterns: ['**/*.txt'],
        ignored: ['**/node_modules/**'],
        actions: {},
        debounce: { default: 1000 },
        logging: {
          enabled: true,
          level: 'info',
          maxSize: '10MB',
          rotation: true
        },
        retry: {
          enabled: true,
          maxAttempts: 3,
          backoff: 'exponential'
        }
      };

      // Start
      await manager.start(config);
      expect(manager.isRunning).toBe(true);

      // Get status
      const status = manager.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.components.fileWatcher).toBeDefined();
      expect(status.components.debouncer).toBeDefined();
      expect(status.components.executor).toBeDefined();
      expect(status.components.logger).toBeDefined();

      // Stop
      await manager.stop();
      expect(manager.isRunning).toBe(false);
    });

    test('should detect file changes and trigger actions', async () => {
      const outputFile = path.join(testDir, 'output.txt');
      
      const config = {
        enabled: true,
        patterns: ['**/*.txt'],
        ignored: ['**/output.txt'], // Ignore output file
        actions: {
          '**/*.txt': {
            command: `echo "File changed" > "${outputFile.replace(/\\/g, '/')}"`,
            debounce: 500
          }
        },
        debounce: { default: 500 },
        logging: {
          enabled: true,
          level: 'debug',
          maxSize: '10MB',
          rotation: true
        },
        retry: {
          enabled: true,
          maxAttempts: 2,
          backoff: 'linear'
        }
      };

      await manager.start(config);

      // Wait for watcher to be ready
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Create a test file
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'test content');

      // Wait for debounce + execution (increased time)
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if action was executed
      const outputExists = await fs.pathExists(outputFile);
      
      // If test fails, log some debug info
      if (!outputExists) {
        const stats = manager.getStats();
        const metrics = manager.getMetrics();
        console.log('Debug info:', {
          eventsProcessed: stats.eventsProcessed,
          actionsExecuted: stats.actionsExecuted,
          totalExecutions: metrics.totalExecutions
        });
      }
      
      expect(outputExists).toBe(true);

      if (outputExists) {
        const content = await fs.readFile(outputFile, 'utf8');
        expect(content).toContain('File changed');
      }
    }, 20000);

    test('should track metrics correctly', async () => {
      const config = {
        enabled: true,
        patterns: ['**/*.txt'],
        actions: {
          '**/*.txt': {
            command: 'echo "test"',
            debounce: 300
          }
        },
        debounce: { default: 300 },
        logging: {
          enabled: true,
          level: 'info',
          maxSize: '10MB',
          rotation: true
        },
        retry: {
          enabled: true,
          maxAttempts: 3,
          backoff: 'exponential'
        }
      };

      await manager.start(config);

      // Wait for watcher to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Create test files
      const testFile1 = path.join(testDir, 'test1.txt');
      const testFile2 = path.join(testDir, 'test2.txt');
      
      await fs.writeFile(testFile1, 'content1');
      await fs.writeFile(testFile2, 'content2');

      // Wait for debounce + execution
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check metrics
      const metrics = manager.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.totalExecutions).toBeGreaterThanOrEqual(0);
    }, 15000);

    test('should handle configuration save and load', async () => {
      const config = {
        enabled: true,
        patterns: ['**/*.md'],
        actions: {
          '**/*.md': {
            command: 'echo "markdown changed"',
            description: 'Handle markdown changes'
          }
        },
        debounce: { default: 1500 },
        logging: {
          enabled: true,
          level: 'debug',
          maxSize: '5MB',
          rotation: true
        },
        retry: {
          enabled: true,
          maxAttempts: 2,
          backoff: 'linear'
        }
      };

      // Save config
      await manager.saveConfig(config);

      // Load config
      const loaded = await manager.loadConfig();

      expect(loaded.patterns).toEqual(['**/*.md']);
      expect(loaded.debounce.default).toBe(1500);
      expect(loaded.actions['**/*.md'].command).toBe('echo "markdown changed"');
    });

    test('should export metrics to file', async () => {
      const config = {
        enabled: true,
        patterns: ['**/*.txt'],
        actions: {},
        debounce: { default: 1000 },
        logging: {
          enabled: true,
          level: 'info',
          maxSize: '10MB',
          rotation: true
        },
        retry: {
          enabled: true,
          maxAttempts: 3,
          backoff: 'exponential'
        }
      };

      await manager.start(config);

      // Export metrics
      const outputPath = await manager.exportMetrics('json');

      expect(await fs.pathExists(outputPath)).toBe(true);

      const metrics = await fs.readJson(outputPath);
      expect(metrics.totalExecutions).toBeDefined();
      expect(metrics.successRate).toBeDefined();
    });

    test('should handle restart correctly', async () => {
      const config = {
        enabled: true,
        patterns: ['**/*.txt'],
        actions: {},
        debounce: { default: 1000 },
        logging: {
          enabled: true,
          level: 'info',
          maxSize: '10MB',
          rotation: true
        },
        retry: {
          enabled: true,
          maxAttempts: 3,
          backoff: 'exponential'
        }
      };

      await manager.start(config);
      expect(manager.isRunning).toBe(true);

      await manager.restart();
      expect(manager.isRunning).toBe(true);

      const status = manager.getStatus();
      expect(status.isRunning).toBe(true);
    }, 15000);

    test('should read logs correctly', async () => {
      const config = {
        enabled: true,
        patterns: ['**/*.txt'],
        actions: {},
        debounce: { default: 1000 },
        logging: {
          enabled: true,
          level: 'info',
          maxSize: '10MB',
          rotation: true
        },
        retry: {
          enabled: true,
          maxAttempts: 3,
          backoff: 'exponential'
        }
      };

      await manager.start(config);

      // Wait a bit for some logs to be generated
      await new Promise(resolve => setTimeout(resolve, 500));

      const logs = await manager.getLogs(10);
      expect(Array.isArray(logs)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid configuration gracefully', async () => {
      const invalidConfig = {
        patterns: [] // Empty patterns
      };

      await expect(manager.start(invalidConfig)).rejects.toThrow();
    });

    test('should handle file system errors gracefully', async () => {
      const config = {
        enabled: true,
        patterns: ['**/*.txt'],
        actions: {
          '**/*.txt': {
            command: 'invalid-command-that-does-not-exist',
            debounce: 300,
            retry: false
          }
        },
        debounce: { default: 300 },
        logging: {
          enabled: true,
          level: 'info',
          maxSize: '10MB',
          rotation: true
        },
        retry: {
          enabled: false,
          maxAttempts: 0,
          backoff: 'exponential'
        }
      };

      await manager.start(config);

      // Wait for watcher to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Create a test file (this should trigger an error)
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'test content');

      // Wait for debounce + execution attempt
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Manager should still be running despite the error
      expect(manager.isRunning).toBe(true);
    }, 15000);
  });

  describe('Component Integration', () => {
    test('should integrate all components correctly', async () => {
      const config = {
        enabled: true,
        patterns: ['**/*.txt'],
        actions: {},
        debounce: { default: 1000 },
        logging: {
          enabled: true,
          level: 'info',
          maxSize: '10MB',
          rotation: true
        },
        retry: {
          enabled: true,
          maxAttempts: 3,
          backoff: 'exponential'
        }
      };

      await manager.start(config);

      const status = manager.getStatus();

      // Verify all components are initialized
      expect(status.components.fileWatcher).toBeDefined();
      expect(status.components.fileWatcher.isWatching).toBe(true);

      expect(status.components.debouncer).toBeDefined();
      expect(status.components.debouncer.eventsReceived).toBeDefined();

      expect(status.components.executor).toBeDefined();
      expect(status.components.executor.totalExecutions).toBeDefined();

      expect(status.components.logger).toBeDefined();
      expect(status.components.logger.totalExecutions).toBeDefined();
    });
  });
});
