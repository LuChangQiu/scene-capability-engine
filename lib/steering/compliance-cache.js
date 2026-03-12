const fs = require('fs-extra');
const path = require('path');
const os = require('os');

/**
 * ComplianceCache - Manages version-based check caching
 * 
 * Stores the last successful compliance check version to avoid
 * repeated checks for the same sce version.
 */
class ComplianceCache {
  /**
   * Create a new ComplianceCache instance
   * 
   * @param {string} cachePath - Optional custom cache file path
   */
  constructor(cachePath = null) {
    this.cachePath = cachePath || this.getDefaultCachePath();
  }

  /**
   * Get the default cache file path
   * 
   * @returns {string} Path to ~/.sce/steering-check-cache.json
   */
  getDefaultCachePath() {
    const homeDir = os.homedir();
    return path.join(homeDir, '.sce', 'steering-check-cache.json');
  }

  /**
   * Check if cache is valid for current version
   * 
   * @param {string} currentVersion - Current sce version
   * @returns {boolean} True if cache is valid
   */
  isValid(currentVersion) {
    try {
      if (!fs.existsSync(this.cachePath)) {
        return false;
      }

      const cache = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
      return cache.version === currentVersion && cache.lastCheck === 'success';
    } catch (error) {
      // Treat any cache read error as cache miss
      return false;
    }
  }

  /**
   * Update cache with successful check
   * 
   * @param {string} version - sce version
   * @returns {boolean} True if update succeeded
   */
  update(version) {
    try {
      const cacheDir = path.dirname(this.cachePath);
      
      // Ensure cache directory exists
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      const cacheData = {
        version,
        timestamp: new Date().toISOString(),
        lastCheck: 'success'
      };

      fs.writeFileSync(this.cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
      return true;
    } catch (error) {
      // Log error but don't throw - cache write failure is not critical
      console.warn(`Warning: Failed to update compliance cache: ${error.message}`);
      return false;
    }
  }

  /**
   * Clear the cache
   * 
   * @returns {boolean} True if clear succeeded
   */
  clear() {
    try {
      if (fs.existsSync(this.cachePath)) {
        fs.unlinkSync(this.cachePath);
      }
      return true;
    } catch (error) {
      console.warn(`Warning: Failed to clear compliance cache: ${error.message}`);
      return false;
    }
  }
}

module.exports = ComplianceCache;
