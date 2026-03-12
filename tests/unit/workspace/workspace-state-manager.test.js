const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const WorkspaceStateManager = require('../../../lib/workspace/multi/workspace-state-manager');

describe('WorkspaceStateManager', () => {
  let tempDir;
  let statePath;
  let manager;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = path.join(os.tmpdir(), `sce-state-test-${Date.now()}`);
    await fs.ensureDir(tempDir);
    statePath = path.join(tempDir, 'workspace-state.json');
    manager = new WorkspaceStateManager(statePath);
  });

  afterEach(async () => {
    // Clean up
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe('Constructor', () => {
    it('should create manager with custom path', () => {
      expect(manager.statePath).toBe(statePath);
      expect(manager.loaded).toBe(false);
    });

    it('should use default path when not provided', () => {
      const defaultManager = new WorkspaceStateManager();
      const expectedPath = path.join(os.homedir(), '.sce', 'workspace-state.json');
      expect(defaultManager.statePath).toBe(expectedPath);
    });
  });

  describe('load() - New Format', () => {
    it('should initialize empty state when file does not exist', async () => {
      await manager.load();
      
      expect(manager.loaded).toBe(true);
      expect(manager.state.version).toBe('1.0');
      expect(manager.state.activeWorkspace).toBeNull();
      expect(manager.state.workspaces.size).toBe(0);
    });

    it('should load existing state file', async () => {
      // Create state file
      const data = {
        version: '1.0',
        activeWorkspace: 'test-ws',
        workspaces: [{
          name: 'test-ws',
          path: '/test/path',
          createdAt: new Date().toISOString(),
          lastAccessed: new Date().toISOString()
        }],
        preferences: {
          autoDetectWorkspace: false,
          confirmDestructiveOperations: true
        }
      };
      await fs.writeFile(statePath, JSON.stringify(data), 'utf8');

      await manager.load();

      expect(manager.state.activeWorkspace).toBe('test-ws');
      expect(manager.state.workspaces.size).toBe(1);
      expect(manager.state.preferences.autoDetectWorkspace).toBe(false);
    });
  });

  describe('save()', () => {
    it('should save state to file', async () => {
      await manager.load();
      
      // Create workspace directory
      const wsPath = path.join(tempDir, 'test-project');
      await fs.ensureDir(path.join(wsPath, '.sce'));
      
      await manager.createWorkspace('test-ws', wsPath);

      // Verify file exists
      expect(await fs.pathExists(statePath)).toBe(true);

      // Verify content
      const content = await fs.readFile(statePath, 'utf8');
      const data = JSON.parse(content);
      expect(data.workspaces).toHaveLength(1);
      expect(data.workspaces[0].name).toBe('test-ws');
    });

    it('should create directory if it does not exist', async () => {
      const nestedPath = path.join(tempDir, 'nested', 'dir', 'state.json');
      const nestedManager = new WorkspaceStateManager(nestedPath);
      
      await nestedManager.load();
      await nestedManager.save();

      expect(await fs.pathExists(nestedPath)).toBe(true);
    });
  });

  describe('createWorkspace()', () => {
    it('should create a new workspace', async () => {
      await manager.load();
      
      const wsPath = path.join(tempDir, 'test-project');
      await fs.ensureDir(path.join(wsPath, '.sce'));
      
      const workspace = await manager.createWorkspace('test-ws', wsPath);

      expect(workspace.name).toBe('test-ws');
      expect(manager.state.workspaces.size).toBe(1);
    });

    it('should reject duplicate workspace names', async () => {
      await manager.load();
      
      const wsPath = path.join(tempDir, 'test-project');
      await fs.ensureDir(path.join(wsPath, '.sce'));
      
      await manager.createWorkspace('test-ws', wsPath);

      await expect(manager.createWorkspace('test-ws', wsPath))
        .rejects.toThrow('already exists');
    });

    it('should reject invalid workspace paths', async () => {
      await manager.load();
      
      const invalidPath = path.join(tempDir, 'invalid');
      await fs.ensureDir(invalidPath);

      await expect(manager.createWorkspace('test-ws', invalidPath))
        .rejects.toThrow('not a valid sce project');
    });

    it('should reject empty workspace names', async () => {
      await manager.load();
      
      await expect(manager.createWorkspace('', '/some/path'))
        .rejects.toThrow('cannot be empty');
    });
  });

  describe('getWorkspace()', () => {
    it('should return workspace by name', async () => {
      await manager.load();
      
      const wsPath = path.join(tempDir, 'test-project');
      await fs.ensureDir(path.join(wsPath, '.sce'));
      await manager.createWorkspace('test-ws', wsPath);

      const workspace = await manager.getWorkspace('test-ws');
      expect(workspace).not.toBeNull();
      expect(workspace.name).toBe('test-ws');
    });

    it('should return null for non-existent workspace', async () => {
      await manager.load();
      
      const workspace = await manager.getWorkspace('non-existent');
      expect(workspace).toBeNull();
    });
  });

  describe('listWorkspaces()', () => {
    it('should return all workspaces', async () => {
      await manager.load();
      
      const ws1Path = path.join(tempDir, 'project1');
      const ws2Path = path.join(tempDir, 'project2');
      await fs.ensureDir(path.join(ws1Path, '.sce'));
      await fs.ensureDir(path.join(ws2Path, '.sce'));
      
      await manager.createWorkspace('ws1', ws1Path);
      await manager.createWorkspace('ws2', ws2Path);

      const workspaces = await manager.listWorkspaces();
      expect(workspaces).toHaveLength(2);
    });

    it('should return empty array when no workspaces', async () => {
      await manager.load();
      
      const workspaces = await manager.listWorkspaces();
      expect(workspaces).toHaveLength(0);
    });
  });

  describe('removeWorkspace()', () => {
    it('should remove workspace', async () => {
      await manager.load();
      
      const wsPath = path.join(tempDir, 'test-project');
      await fs.ensureDir(path.join(wsPath, '.sce'));
      await manager.createWorkspace('test-ws', wsPath);

      const removed = await manager.removeWorkspace('test-ws');
      expect(removed).toBe(true);
      expect(manager.state.workspaces.size).toBe(0);
    });

    it('should return false for non-existent workspace', async () => {
      await manager.load();
      
      const removed = await manager.removeWorkspace('non-existent');
      expect(removed).toBe(false);
    });

    it('should clear active workspace if removing active one', async () => {
      await manager.load();
      
      const wsPath = path.join(tempDir, 'test-project');
      await fs.ensureDir(path.join(wsPath, '.sce'));
      await manager.createWorkspace('test-ws', wsPath);
      await manager.switchWorkspace('test-ws');

      await manager.removeWorkspace('test-ws');
      expect(manager.state.activeWorkspace).toBeNull();
    });
  });

  describe('switchWorkspace()', () => {
    it('should switch to existing workspace', async () => {
      await manager.load();
      
      const wsPath = path.join(tempDir, 'test-project');
      await fs.ensureDir(path.join(wsPath, '.sce'));
      await manager.createWorkspace('test-ws', wsPath);

      await manager.switchWorkspace('test-ws');
      expect(manager.state.activeWorkspace).toBe('test-ws');
    });

    it('should throw error for non-existent workspace', async () => {
      await manager.load();
      
      await expect(manager.switchWorkspace('non-existent'))
        .rejects.toThrow('does not exist');
    });

    it('should update last accessed timestamp', async () => {
      await manager.load();
      
      const wsPath = path.join(tempDir, 'test-project');
      await fs.ensureDir(path.join(wsPath, '.sce'));
      await manager.createWorkspace('test-ws', wsPath);

      const workspace = await manager.getWorkspace('test-ws');
      const originalTime = workspace.lastAccessed.getTime();

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      await manager.switchWorkspace('test-ws');
      const updatedWorkspace = await manager.getWorkspace('test-ws');
      expect(updatedWorkspace.lastAccessed.getTime()).toBeGreaterThan(originalTime);
    });
  });

  describe('getActiveWorkspace()', () => {
    it('should return active workspace', async () => {
      await manager.load();
      
      const wsPath = path.join(tempDir, 'test-project');
      await fs.ensureDir(path.join(wsPath, '.sce'));
      await manager.createWorkspace('test-ws', wsPath);
      await manager.switchWorkspace('test-ws');

      const active = await manager.getActiveWorkspace();
      expect(active).not.toBeNull();
      expect(active.name).toBe('test-ws');
    });

    it('should return null when no active workspace', async () => {
      await manager.load();
      
      const active = await manager.getActiveWorkspace();
      expect(active).toBeNull();
    });

    it('should clear invalid active workspace', async () => {
      await manager.load();
      
      // Manually set invalid active workspace
      manager.state.activeWorkspace = 'non-existent';

      const active = await manager.getActiveWorkspace();
      expect(active).toBeNull();
      expect(manager.state.activeWorkspace).toBeNull();
    });
  });

  describe('findWorkspaceByPath()', () => {
    it('should find workspace containing path', async () => {
      await manager.load();
      
      const wsPath = path.join(tempDir, 'test-project');
      await fs.ensureDir(path.join(wsPath, '.sce'));
      await manager.createWorkspace('test-ws', wsPath);

      const subPath = path.join(wsPath, 'subfolder', 'file.txt');
      const workspace = await manager.findWorkspaceByPath(subPath);
      
      expect(workspace).not.toBeNull();
      expect(workspace.name).toBe('test-ws');
    });

    it('should return null when path not in any workspace', async () => {
      await manager.load();
      
      const workspace = await manager.findWorkspaceByPath('/random/path');
      expect(workspace).toBeNull();
    });
  });

  describe('Preferences', () => {
    it('should get preference value', async () => {
      await manager.load();
      
      const value = await manager.getPreference('autoDetectWorkspace');
      expect(value).toBe(true);
    });

    it('should set preference value', async () => {
      await manager.load();
      
      await manager.setPreference('autoDetectWorkspace', false);
      const value = await manager.getPreference('autoDetectWorkspace');
      expect(value).toBe(false);
    });

    it('should get all preferences', async () => {
      await manager.load();
      
      const prefs = await manager.getPreferences();
      expect(prefs).toHaveProperty('autoDetectWorkspace');
      expect(prefs).toHaveProperty('confirmDestructiveOperations');
    });
  });

  describe('Utility Methods', () => {
    it('should check if workspace exists', async () => {
      await manager.load();
      
      const wsPath = path.join(tempDir, 'test-project');
      await fs.ensureDir(path.join(wsPath, '.sce'));
      await manager.createWorkspace('test-ws', wsPath);

      expect(await manager.hasWorkspace('test-ws')).toBe(true);
      expect(await manager.hasWorkspace('non-existent')).toBe(false);
    });

    it('should count workspaces', async () => {
      await manager.load();
      
      expect(await manager.count()).toBe(0);

      const wsPath = path.join(tempDir, 'test-project');
      await fs.ensureDir(path.join(wsPath, '.sce'));
      await manager.createWorkspace('test-ws', wsPath);

      expect(await manager.count()).toBe(1);
    });

    it('should clear all workspaces', async () => {
      await manager.load();
      
      const wsPath = path.join(tempDir, 'test-project');
      await fs.ensureDir(path.join(wsPath, '.sce'));
      await manager.createWorkspace('test-ws', wsPath);

      await manager.clear();
      expect(await manager.count()).toBe(0);
      expect(manager.state.activeWorkspace).toBeNull();
    });

    it('should reset to default state', async () => {
      await manager.load();
      
      const wsPath = path.join(tempDir, 'test-project');
      await fs.ensureDir(path.join(wsPath, '.sce'));
      await manager.createWorkspace('test-ws', wsPath);
      await manager.setPreference('autoDetectWorkspace', false);

      await manager.reset();
      
      expect(await manager.count()).toBe(0);
      expect(manager.state.activeWorkspace).toBeNull();
      expect(manager.state.preferences.autoDetectWorkspace).toBe(true);
    });
  });

  describe('Atomic Operations', () => {
    it('should use temp file for atomic save', async () => {
      await manager.load();
      
      const wsPath = path.join(tempDir, 'test-project');
      await fs.ensureDir(path.join(wsPath, '.sce'));
      
      // Mock fs.rename to verify temp file usage
      const originalRename = fs.rename;
      let tempFileUsed = false;
      fs.rename = jest.fn(async (from, to) => {
        if (from.endsWith('.tmp')) {
          tempFileUsed = true;
        }
        return originalRename(from, to);
      });

      await manager.createWorkspace('test-ws', wsPath);

      expect(tempFileUsed).toBe(true);

      // Restore original
      fs.rename = originalRename;
    });
  });
});
