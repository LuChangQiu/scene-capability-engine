const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const ComplianceCache = require('../../../lib/steering/compliance-cache');

describe('ComplianceCache', () => {
  let cache;
  let tempCachePath;

  beforeEach(() => {
    // Create a unique temp cache file for each test
    const tempDir = path.join(os.tmpdir(), `sce-cache-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    tempCachePath = path.join(tempDir, 'steering-check-cache.json');
    cache = new ComplianceCache(tempCachePath);
  });

  afterEach(() => {
    // Clean up temp cache file and directory
    const tempDir = path.dirname(tempCachePath);
    if (fs.existsSync(tempDir)) {
      fs.removeSync(tempDir);
    }
  });

  describe('isValid', () => {
    test('returns false when cache file does not exist', () => {
      expect(cache.isValid('1.0.0')).toBe(false);
    });

    test('returns true when cache version matches current version', () => {
      cache.update('1.0.0');
      expect(cache.isValid('1.0.0')).toBe(true);
    });

    test('returns false when cache version differs from current version', () => {
      cache.update('1.0.0');
      expect(cache.isValid('1.0.1')).toBe(false);
    });

    test('returns false when cache file is corrupted (invalid JSON)', () => {
      const cacheDir = path.dirname(tempCachePath);
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(tempCachePath, 'invalid json{', 'utf8');
      
      expect(cache.isValid('1.0.0')).toBe(false);
    });

    test('returns false when cache file has unexpected format', () => {
      const cacheDir = path.dirname(tempCachePath);
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(tempCachePath, JSON.stringify({ foo: 'bar' }), 'utf8');
      
      expect(cache.isValid('1.0.0')).toBe(false);
    });
  });

  describe('update', () => {
    test('creates cache file with correct structure', () => {
      const result = cache.update('1.2.3');
      
      expect(result).toBe(true);
      expect(fs.existsSync(tempCachePath)).toBe(true);
      
      const cacheData = JSON.parse(fs.readFileSync(tempCachePath, 'utf8'));
      expect(cacheData.version).toBe('1.2.3');
      expect(cacheData.lastCheck).toBe('success');
      expect(cacheData.timestamp).toBeDefined();
      expect(new Date(cacheData.timestamp)).toBeInstanceOf(Date);
    });

    test('creates cache directory if it does not exist', () => {
      const cacheDir = path.dirname(tempCachePath);
      expect(fs.existsSync(cacheDir)).toBe(false);
      
      cache.update('1.0.0');
      
      expect(fs.existsSync(cacheDir)).toBe(true);
      expect(fs.existsSync(tempCachePath)).toBe(true);
    });

    test('overwrites existing cache file', () => {
      cache.update('1.0.0');
      const firstTimestamp = JSON.parse(fs.readFileSync(tempCachePath, 'utf8')).timestamp;
      
      // Wait a bit to ensure different timestamp
      const start = Date.now();
      while (Date.now() - start < 10) { /* wait */ }
      
      cache.update('1.0.1');
      const cacheData = JSON.parse(fs.readFileSync(tempCachePath, 'utf8'));
      
      expect(cacheData.version).toBe('1.0.1');
      expect(cacheData.timestamp).not.toBe(firstTimestamp);
    });
  });

  describe('clear', () => {
    test('removes cache file if it exists', () => {
      cache.update('1.0.0');
      expect(fs.existsSync(tempCachePath)).toBe(true);
      
      const result = cache.clear();
      
      expect(result).toBe(true);
      expect(fs.existsSync(tempCachePath)).toBe(false);
    });

    test('returns true even if cache file does not exist', () => {
      expect(fs.existsSync(tempCachePath)).toBe(false);
      
      const result = cache.clear();
      
      expect(result).toBe(true);
    });
  });

  describe('getDefaultCachePath', () => {
    test('returns path in user home directory', () => {
      const defaultCache = new ComplianceCache();
      const cachePath = defaultCache.getDefaultCachePath();
      
      expect(cachePath).toContain('.sce');
      expect(cachePath).toContain('steering-check-cache.json');
      expect(cachePath).toContain(os.homedir());
    });
  });
});
