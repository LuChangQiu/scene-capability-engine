const chokidar = require('chokidar');
const EventEmitter = require('events');
const path = require('path');
const { minimatch } = require('minimatch');

/**
 * FileWatcher - 文件监控器
 * 
 * 监控文件系统变化并触发事件
 */
class FileWatcher extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      patterns: config.patterns || [],
      ignored: config.ignored || ['**/node_modules/**', '**/.git/**', '**/coverage/**'],
      persistent: config.persistent !== false,
      ignoreInitial: config.ignoreInitial !== false,
      awaitWriteFinish: config.awaitWriteFinish !== false ? {
        stabilityThreshold: 2000,
        pollInterval: 100
      } : false,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      ...config
    };
    
    // 验证和规范化模式
    this._validateAndNormalizePatterns();
    
    this.watcher = null;
    this.isWatching = false;
    this.watchedFiles = new Set();
    this.stats = {
      filesWatched: 0,
      eventsEmitted: 0,
      errors: 0,
      recoveries: 0,
      startedAt: null
    };
    this.retryCount = 0;
    this.lastError = null;
    this.basePath = process.cwd();
    this.initializationTimer = null;
    this.recoveryTimer = null;
  }

  /**
   * 验证和规范化模式
   * 
   * @private
   */
  _validateAndNormalizePatterns() {
    // 验证 patterns
    if (!Array.isArray(this.config.patterns)) {
      throw new Error('Patterns must be an array');
    }

    this.config.patterns = this.config.patterns.map(pattern => {
      if (typeof pattern !== 'string') {
        throw new Error('Pattern must be a string');
      }
      
      // 规范化路径分隔符
      return pattern.replace(/\\/g, '/');
    });

    // 验证 ignored patterns
    if (!Array.isArray(this.config.ignored)) {
      throw new Error('Ignored patterns must be an array');
    }

    this.config.ignored = this.config.ignored.map(pattern => {
      if (typeof pattern !== 'string') {
        throw new Error('Ignored pattern must be a string');
      }
      
      return pattern.replace(/\\/g, '/');
    });
  }

  /**
   * 启动文件监控
   * 
   * @param {string} basePath - 基础路径
   * @returns {Promise<void>}
   */
  async start(basePath = process.cwd()) {
    if (this.isWatching) {
      throw new Error('FileWatcher is already running');
    }

    if (!this.config.patterns || this.config.patterns.length === 0) {
      throw new Error('No patterns specified for watching');
    }

    try {
      this.basePath = basePath;

      // 将相对路径转换为绝对路径
      const absolutePatterns = this.config.patterns.map(pattern => {
        if (path.isAbsolute(pattern)) {
          return pattern;
        }
        return path.join(basePath, pattern);
      });

      // 创建 watcher
      this.watcher = chokidar.watch(absolutePatterns, {
        ignored: this.config.ignored,
        persistent: this.config.persistent,
        ignoreInitial: this.config.ignoreInitial,
        awaitWriteFinish: this.config.awaitWriteFinish,
        cwd: basePath
      });

      // 设置事件监听
      this.watcher
        .on('add', (filePath) => this._handleFileAdded(filePath))
        .on('change', (filePath) => this._handleFileChanged(filePath))
        .on('unlink', (filePath) => this._handleFileDeleted(filePath))
        .on('error', (error) => this._handleError(error))
        .on('ready', () => this._handleReady());

      // 等待 watcher 准备就绪
      await new Promise((resolve, reject) => {
        this._clearInitializationTimer();
        this.initializationTimer = setTimeout(() => {
          this.initializationTimer = null;
          reject(new Error('FileWatcher initialization timeout'));
        }, 10000);
        this._unrefTimer(this.initializationTimer);

        this.watcher.once('ready', () => {
          this._clearInitializationTimer();
          this.isWatching = true;
          this.stats.startedAt = new Date();
          resolve();
        });

        this.watcher.once('error', (error) => {
          this._clearInitializationTimer();
          reject(error);
        });
      });

      this.emit('started', { patterns: this.config.patterns });
    } catch (error) {
      this.isWatching = false;
      await this._disposeWatcher();
      throw error;
    }
  }

  /**
   * 停止文件监控
   * 
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isWatching && !this.watcher && !this.initializationTimer && !this.recoveryTimer) {
      return;
    }

    try {
      this._clearInitializationTimer();
      this._clearRecoveryTimer();
      await this._disposeWatcher();

      this.isWatching = false;
      this.watchedFiles.clear();
      
      this.emit('stopped', { stats: this.getStats() });
    } catch (error) {
      this.emit('error', { error, context: 'stop' });
      throw error;
    }
  }

  /**
   * 获取监控状态
   * 
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      isWatching: this.isWatching,
      patterns: this.config.patterns,
      filesWatched: this.watchedFiles.size,
      stats: this.getStats()
    };
  }

  /**
   * 获取统计信息
   * 
   * @returns {Object} 统计信息
   */
  getStats() {
    const stats = { ...this.stats };
    
    if (stats.startedAt) {
      stats.uptime = Date.now() - stats.startedAt.getTime();
    }
    
    return stats;
  }

  /**
   * 处理文件添加事件
   * 
   * @private
   * @param {string} filePath - 文件路径
   */
  _handleFileAdded(filePath) {
    this.watchedFiles.add(filePath);
    this.stats.filesWatched = this.watchedFiles.size;
    this.stats.eventsEmitted++;
    
    this.emit('file:added', {
      path: filePath,
      timestamp: new Date(),
      event: 'add'
    });
  }

  /**
   * 处理文件变化事件
   * 
   * @private
   * @param {string} filePath - 文件路径
   */
  _handleFileChanged(filePath) {
    this.stats.eventsEmitted++;
    
    this.emit('file:changed', {
      path: filePath,
      timestamp: new Date(),
      event: 'change'
    });
  }

  /**
   * 处理文件删除事件
   * 
   * @private
   * @param {string} filePath - 文件路径
   */
  _handleFileDeleted(filePath) {
    this.watchedFiles.delete(filePath);
    this.stats.filesWatched = this.watchedFiles.size;
    this.stats.eventsEmitted++;
    
    this.emit('file:deleted', {
      path: filePath,
      timestamp: new Date(),
      event: 'unlink'
    });
  }

  /**
   * 处理错误事件
   * 
   * @private
   * @param {Error} error - 错误对象
   */
  _handleError(error) {
    this.stats.errors++;
    this.lastError = error;
    
    this.emit('error', {
      error,
      timestamp: new Date(),
      context: 'watcher',
      retryCount: this.retryCount
    });

    // 尝试恢复
    this._attemptRecovery(error);
  }

  /**
   * 尝试从错误中恢复
   * 
   * @private
   * @param {Error} error - 错误对象
   */
  async _attemptRecovery(error) {
    if (this.retryCount >= this.config.maxRetries) {
      this.emit('recovery:failed', {
        error,
        retryCount: this.retryCount,
        message: 'Max retries exceeded'
      });
      
      // 停止监控
      await this.stop();
      return;
    }

    this.retryCount++;
    
    this.emit('recovery:attempt', {
      error,
      retryCount: this.retryCount,
      delay: this.config.retryDelay
    });

    // 延迟后重试
    this._clearRecoveryTimer();
    this.recoveryTimer = setTimeout(async () => {
      this.recoveryTimer = null;
      try {
        // 重启 watcher
        const basePath = this.basePath || process.cwd();
        
        await this.stop();
        await this.start(basePath);
        
        this.stats.recoveries++;
        this.retryCount = 0;
        
        this.emit('recovery:success', {
          retryCount: this.retryCount,
          recoveries: this.stats.recoveries
        });
      } catch (recoveryError) {
        this.emit('recovery:error', {
          error: recoveryError,
          originalError: error,
          retryCount: this.retryCount
        });
        
        // 递归尝试恢复
        await this._attemptRecovery(recoveryError);
      }
    }, this.config.retryDelay);
    this._unrefTimer(this.recoveryTimer);
  }

  /**
   * 处理准备就绪事件
   * 
   * @private
   */
  _handleReady() {
    this.emit('ready', {
      filesWatched: this.watchedFiles.size,
      patterns: this.config.patterns
    });
  }

  /**
   * 检查文件是否匹配模式
   * 
   * @param {string} filePath - 文件路径
   * @returns {boolean} 是否匹配
   */
  matchesPattern(filePath) {
    // 规范化文件路径
    const normalizedPath = filePath.replace(/\\/g, '/');

    // 检查是否匹配任何 watch 模式
    const matchesWatch = this.config.patterns.some(pattern => {
      return minimatch(normalizedPath, pattern, { dot: true });
    });

    if (!matchesWatch) {
      return false;
    }

    // 检查是否匹配任何 ignored 模式
    const matchesIgnored = this.config.ignored.some(pattern => {
      return minimatch(normalizedPath, pattern, { dot: true });
    });

    return !matchesIgnored;
  }

  /**
   * 添加新的监控模式
   * 
   * @param {string|Array<string>} patterns - 要添加的模式
   * @returns {Promise<void>}
   */
  async addPatterns(patterns) {
    if (!this.isWatching) {
      throw new Error('FileWatcher is not running');
    }

    const newPatterns = Array.isArray(patterns) ? patterns : [patterns];
    
    // 验证模式
    newPatterns.forEach(pattern => {
      if (typeof pattern !== 'string') {
        throw new Error('Pattern must be a string');
      }
    });

    // 添加到配置
    this.config.patterns.push(...newPatterns);

    // 更新 watcher
    if (this.watcher) {
      newPatterns.forEach(pattern => {
        this.watcher.add(pattern);
      });
    }

    this.emit('patterns:added', { patterns: newPatterns });
  }

  /**
   * 移除监控模式
   * 
   * @param {string|Array<string>} patterns - 要移除的模式
   * @returns {Promise<void>}
   */
  async removePatterns(patterns) {
    if (!this.isWatching) {
      throw new Error('FileWatcher is not running');
    }

    const removePatterns = Array.isArray(patterns) ? patterns : [patterns];
    
    // 从配置中移除
    this.config.patterns = this.config.patterns.filter(
      pattern => !removePatterns.includes(pattern)
    );

    // 更新 watcher
    if (this.watcher) {
      removePatterns.forEach(pattern => {
        this.watcher.unwatch(pattern);
      });
    }

    this.emit('patterns:removed', { patterns: removePatterns });
  }

  /**
   * 获取当前监控的模式
   * 
   * @returns {Array<string>} 模式列表
   */
  getPatterns() {
    return [...this.config.patterns];
  }

  /**
   * 获取忽略的模式
   * 
   * @returns {Array<string>} 忽略模式列表
   */
  getIgnoredPatterns() {
    return [...this.config.ignored];
  }

  /**
   * 获取所有监控的文件
   * 
   * @returns {Array<string>} 文件路径列表
   */
  getWatchedFiles() {
    return Array.from(this.watchedFiles);
  }

  /**
   * 获取最后一个错误
   * 
   * @returns {Error|null} 最后一个错误
   */
  getLastError() {
    return this.lastError;
  }

  /**
   * 重置错误计数
   */
  resetErrorCount() {
    this.stats.errors = 0;
    this.retryCount = 0;
    this.lastError = null;
    
    this.emit('errors:reset');
  }

  /**
   * 检查是否健康
   * 
   * @returns {Object} 健康状态
   */
  getHealth() {
    const errorRate = this.stats.eventsEmitted > 0 
      ? this.stats.errors / this.stats.eventsEmitted 
      : 0;

    return {
      isHealthy: this.isWatching && errorRate < 0.1,
      isWatching: this.isWatching,
      errorCount: this.stats.errors,
      errorRate,
      recoveries: this.stats.recoveries,
      lastError: this.lastError ? this.lastError.message : null
    };
  }

  _unrefTimer(timer) {
    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }
  }

  _clearInitializationTimer() {
    if (this.initializationTimer) {
      clearTimeout(this.initializationTimer);
      this.initializationTimer = null;
    }
  }

  _clearRecoveryTimer() {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  async _disposeWatcher() {
    if (!this.watcher) {
      return;
    }

    const watcher = this.watcher;
    this.watcher = null;
    await watcher.close();
  }
}

module.exports = FileWatcher;
