const EventEmitter = require('events');
const fs = require('fs-extra');
const path = require('path');
const FileWatcher = require('./file-watcher');
const EventDebouncer = require('./event-debouncer');
const ActionExecutor = require('./action-executor');
const ExecutionLogger = require('./execution-logger');

function sleep(ms) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });
}

/**
 * WatchManager - Watch 模式管理器
 * 
 * 协调所有 watch 组件，管理生命周期
 */
class WatchManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      configFile: config.configFile || '.sce/watch-config.json',
      basePath: config.basePath || process.cwd(),
      autoStart: config.autoStart !== false,
      ...config
    };
    
    // 组件实例
    this.fileWatcher = null;
    this.debouncer = null;
    this.executor = null;
    this.logger = null;
    
    // 状态
    this.isRunning = false;
    this.watchConfig = null;
    
    // 统计信息
    this.stats = {
      startedAt: null,
      stoppedAt: null,
      filesWatched: 0,
      eventsProcessed: 0,
      actionsExecuted: 0
    };
  }

  /**
   * 启动 watch 模式
   * 
   * @param {Object} config - 配置（可选，如果不提供则从文件加载）
   * @returns {Promise<void>}
   */
  async start(config = null) {
    if (this.isRunning) {
      throw new Error('WatchManager is already running');
    }

    try {
      // 1. 加载配置
      if (config) {
        this.watchConfig = config;
      } else {
        this.watchConfig = await this.loadConfig();
      }

      // 2. 验证配置
      this._validateConfig(this.watchConfig);

      // 3. 初始化组件
      await this._initializeComponents();

      // 4. 启动文件监控
      await this._startWatching();

      // 5. 更新状态
      this.isRunning = true;
      this.stats.startedAt = new Date();

      this.emit('started', {
        config: this.watchConfig,
        timestamp: new Date()
      });

    } catch (error) {
      this.isRunning = false;
      this.emit('error', {
        message: 'Failed to start watch mode',
        error,
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * 停止 watch 模式
   * 
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      // 1. 停止文件监控
      if (this.fileWatcher) {
        await this.fileWatcher.stop();
      }

      // 2. 清理 debouncer
      if (this.debouncer) {
        this.debouncer.clear();
      }

      // 3. 更新状态
      this.isRunning = false;
      this.stats.stoppedAt = new Date();

      this.emit('stopped', {
        stats: this.getStats(),
        timestamp: new Date()
      });

    } catch (error) {
      this.emit('error', {
        message: 'Failed to stop watch mode',
        error,
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * 重启 watch 模式
   * 
   * @returns {Promise<void>}
   */
  async restart() {
    await this.stop();
    await sleep(1000);
    await this.start();
  }

  /**
   * 初始化组件
   * 
   * @private
   * @returns {Promise<void>}
   */
  async _initializeComponents() {
    // 1. 初始化 logger
    this.logger = new ExecutionLogger({
      logDir: path.join(this.config.basePath, '.sce/watch/logs'),
      logLevel: this.watchConfig.logging?.level || 'info',
      maxLogSize: this._parseSize(this.watchConfig.logging?.maxSize || '10MB'),
      enableRotation: this.watchConfig.logging?.rotation !== false
    });

    // 2. 初始化 executor
    this.executor = new ActionExecutor({
      maxRetries: this.watchConfig.retry?.maxAttempts || 3,
      retryBackoff: this.watchConfig.retry?.backoff || 'exponential',
      cwd: this.config.basePath
    });

    // 监听执行事件
    this.executor.on('execution:success', (data) => {
      this.logger.info('execution:success', data);
      this.stats.actionsExecuted++;
    });

    this.executor.on('execution:error', (data) => {
      this.logger.error('execution:error', data);
    });

    // 3. 初始化 debouncer
    this.debouncer = new EventDebouncer({
      defaultDelay: this.watchConfig.debounce?.default || 2000
    });

    // 4. 初始化 file watcher
    this.fileWatcher = new FileWatcher({
      patterns: this.watchConfig.patterns || [],
      ignored: this.watchConfig.ignored || [],
      persistent: true
    });

    // 监听文件事件
    this.fileWatcher.on('file:changed', (data) => this._handleFileEvent('changed', data));
    this.fileWatcher.on('file:added', (data) => this._handleFileEvent('added', data));
    this.fileWatcher.on('file:deleted', (data) => this._handleFileEvent('deleted', data));
  }

  /**
   * 启动文件监控
   * 
   * @private
   * @returns {Promise<void>}
   */
  async _startWatching() {
    await this.fileWatcher.start(this.config.basePath);
    this.stats.filesWatched = this.fileWatcher.getWatchedFiles().length;
  }

  /**
   * 处理文件事件
   * 
   * @private
   * @param {string} eventType - 事件类型
   * @param {Object} data - 事件数据
   */
  _handleFileEvent(eventType, data) {
    this.stats.eventsProcessed++;

    // 查找匹配的动作
    const action = this._findMatchingAction(data.path);

    if (!action) {
      this.logger.debug('no_action_found', {
        file: data.path,
        eventType
      });
      return;
    }

    // 获取 debounce 延迟
    const delay = action.debounce || 
                  this.watchConfig.debounce?.perPattern?.[data.path] ||
                  this.watchConfig.debounce?.default ||
                  2000;

    // 使用 debouncer 处理
    this.debouncer.debounce(
      data.path,
      async () => {
        await this._executeAction(action, data);
      },
      delay
    );
  }

  /**
   * 查找匹配的动作
   * 
   * @private
   * @param {string} filePath - 文件路径
   * @returns {Object|null} 动作配置
   */
  _findMatchingAction(filePath) {
    if (!this.watchConfig.actions) {
      return null;
    }

    // 规范化路径
    const normalizedPath = filePath.replace(/\\/g, '/');

    // 查找匹配的模式
    for (const [pattern, action] of Object.entries(this.watchConfig.actions)) {
      // 使用 FileWatcher 的 matchesPattern 方法
      // 但需要创建一个临时的 FileWatcher 来测试模式
      const { minimatch } = require('minimatch');
      
      if (minimatch(normalizedPath, pattern, { dot: true })) {
        return action;
      }
    }

    return null;
  }

  /**
   * 执行动作
   * 
   * @private
   * @param {Object} action - 动作配置
   * @param {Object} fileData - 文件数据
   * @returns {Promise<void>}
   */
  async _executeAction(action, fileData) {
    try {
      const context = {
        file: fileData.path,
        event: fileData.event,
        timestamp: fileData.timestamp
      };

      await this.executor.execute(action, context);

    } catch (error) {
      this.emit('action:error', {
        action,
        file: fileData.path,
        error,
        timestamp: new Date()
      });
    }
  }

  /**
   * 验证配置
   * 
   * @private
   * @param {Object} config - 配置
   */
  _validateConfig(config) {
    if (!config) {
      throw new Error('Configuration is required');
    }

    if (!config.patterns || !Array.isArray(config.patterns) || config.patterns.length === 0) {
      throw new Error('At least one pattern is required');
    }

    if (config.actions && typeof config.actions !== 'object') {
      throw new Error('Actions must be an object');
    }
  }

  /**
   * 解析大小字符串
   * 
   * @private
   * @param {string} sizeStr - 大小字符串（如 '10MB'）
   * @returns {number} 字节数
   */
  _parseSize(sizeStr) {
    const units = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024
    };

    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([A-Z]+)$/i);
    if (!match) {
      throw new Error(`Invalid size format: ${sizeStr}`);
    }

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    if (!units[unit]) {
      throw new Error(`Unknown size unit: ${unit}`);
    }

    return Math.floor(value * units[unit]);
  }

  /**
   * 加载配置
   * 
   * @returns {Promise<Object>} 配置对象
   */
  async loadConfig() {
    const configPath = path.join(this.config.basePath, this.config.configFile);

    try {
      if (!await fs.pathExists(configPath)) {
        // 返回默认配置
        return this._getDefaultConfig();
      }

      const config = await fs.readJson(configPath);
      
      this.emit('config:loaded', {
        configPath,
        timestamp: new Date()
      });

      return config;

    } catch (error) {
      this.emit('error', {
        message: 'Failed to load configuration',
        error,
        configPath,
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * 保存配置
   * 
   * @param {Object} config - 配置对象
   * @returns {Promise<void>}
   */
  async saveConfig(config) {
    const configPath = path.join(this.config.basePath, this.config.configFile);

    try {
      // 验证配置
      this._validateConfig(config);

      // 确保目录存在
      await fs.ensureDir(path.dirname(configPath));

      // 保存配置
      await fs.writeJson(configPath, config, { spaces: 2 });

      this.emit('config:saved', {
        configPath,
        timestamp: new Date()
      });

    } catch (error) {
      this.emit('error', {
        message: 'Failed to save configuration',
        error,
        configPath,
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * 获取默认配置
   * 
   * @private
   * @returns {Object} 默认配置
   */
  _getDefaultConfig() {
    return {
      enabled: true,
      patterns: ['**/*.md'],
      ignored: ['**/node_modules/**', '**/.git/**'],
      actions: {},
      debounce: {
        default: 2000
      },
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
  }

  /**
   * 获取状态
   * 
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      config: this.watchConfig,
      stats: this.getStats(),
      components: {
        fileWatcher: this.fileWatcher ? this.fileWatcher.getStatus() : null,
        debouncer: this.debouncer ? this.debouncer.getStats() : null,
        executor: this.executor ? this.executor.getStats() : null,
        logger: this.logger ? this.logger.getMetrics() : null
      }
    };
  }

  /**
   * 获取统计信息
   * 
   * @returns {Object} 统计信息
   */
  getStats() {
    const stats = { ...this.stats };

    if (stats.startedAt && this.isRunning) {
      stats.uptime = Date.now() - stats.startedAt.getTime();
    }

    return stats;
  }

  /**
   * 获取日志
   * 
   * @param {number} lines - 行数
   * @returns {Promise<Array>} 日志条目
   */
  async getLogs(lines = 100) {
    if (!this.logger) {
      return [];
    }

    return await this.logger.readLogs(lines);
  }

  /**
   * 获取指标
   * 
   * @returns {Object} 指标数据
   */
  getMetrics() {
    if (!this.logger) {
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        successRate: 0,
        averageDuration: 0,
        timeSaved: 0,
        byAction: {},
        errors: []
      };
    }

    return this.logger.getMetrics();
  }

  /**
   * 导出指标
   * 
   * @param {string} format - 格式
   * @param {string} outputPath - 输出路径
   * @returns {Promise<string>} 输出文件路径
   */
  async exportMetrics(format = 'json', outputPath = null) {
    if (!this.logger) {
      throw new Error('Logger not initialized');
    }

    return await this.logger.exportMetrics(format, outputPath);
  }
}

module.exports = WatchManager;
