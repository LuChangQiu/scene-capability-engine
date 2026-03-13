const EventEmitter = require('events');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

function sleep(ms) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });
}

/**
 * ActionExecutor - 动作执行器
 * 
 * 执行基于文件变化的命令，支持重试、超时和命令验证
 */
class ActionExecutor extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      retryBackoff: config.retryBackoff || 'exponential', // 'linear' or 'exponential'
      timeout: config.timeout || 30000, // 30 seconds
      allowedCommands: config.allowedCommands || null, // null = allow all
      cwd: config.cwd || process.cwd(),
      ...config
    };
    
    // 执行历史
    this.executionHistory = [];
    this.maxHistorySize = config.maxHistorySize || 100;
    
    // 统计信息
    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      retriedExecutions: 0,
      timeoutExecutions: 0
    };
  }

  /**
   * 执行命令
   * 
   * @param {Object} action - 动作配置
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 执行结果
   */
  async execute(action, context = {}) {
    if (!action || action.command === undefined || action.command === null) {
      throw new Error('Action must have a command property');
    }

    if (typeof action.command !== 'string' || action.command.trim().length === 0) {
      throw new Error('Action command cannot be empty');
    }

    const startTime = Date.now();
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // 1. 验证命令
      this._validateAction(action);

      // 2. 插值命令
      const command = this._interpolateCommand(action.command, context);

      // 3. 验证命令安全性
      this._validateCommand(command);

      this.emit('execution:start', {
        executionId,
        command,
        context,
        timestamp: new Date()
      });

      // 4. 执行命令
      const result = await this._executeCommand(command, action);

      const duration = Date.now() - startTime;

      // 5. 记录成功
      this.stats.totalExecutions++;
      this.stats.successfulExecutions++;

      const executionRecord = {
        executionId,
        command,
        context,
        result: {
          success: true,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: 0
        },
        duration,
        timestamp: new Date(),
        retries: 0
      };

      this._addToHistory(executionRecord);

      this.emit('execution:success', executionRecord);

      return executionRecord.result;

    } catch (error) {
      const duration = Date.now() - startTime;

      // 6. 处理错误
      this.stats.totalExecutions++;
      this.stats.failedExecutions++;

      const executionRecord = {
        executionId,
        command: action.command,
        context,
        result: {
          success: false,
          error: error.message,
          stdout: error.stdout || '',
          stderr: error.stderr || '',
          exitCode: error.code || -1
        },
        duration,
        timestamp: new Date(),
        retries: 0
      };

      this._addToHistory(executionRecord);

      this.emit('execution:error', {
        ...executionRecord,
        error
      });

      // 7. 重试（如果配置）
      if (action.retry !== false && this.config.maxRetries > 0) {
        return await this._retryExecution(action, context, error, executionId);
      }

      throw error;
    }
  }

  /**
   * 执行命令（内部方法）
   * 
   * @private
   * @param {string} command - 命令
   * @param {Object} action - 动作配置
   * @returns {Promise<Object>} 执行结果
   */
  async _executeCommand(command, action) {
    const timeout = action.timeout || this.config.timeout;

    try {
      const result = await execAsync(command, {
        cwd: this.config.cwd,
        timeout,
        maxBuffer: 1024 * 1024 * 10 // 10MB
      });

      return result;
    } catch (error) {
      // 检查是否超时
      if (error.killed && error.signal === 'SIGTERM') {
        this.stats.timeoutExecutions++;
        this.emit('execution:timeout', {
          command,
          timeout,
          timestamp: new Date()
        });
      }

      throw error;
    }
  }

  /**
   * 重试执行
   * 
   * @private
   * @param {Object} action - 动作配置
   * @param {Object} context - 执行上下文
   * @param {Error} originalError - 原始错误
   * @param {string} executionId - 执行ID
   * @returns {Promise<Object>} 执行结果
   */
  async _retryExecution(action, context, originalError, executionId) {
    const maxRetries = action.maxRetries || this.config.maxRetries;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // 计算延迟
      const delay = this._calculateRetryDelay(attempt);

      this.emit('execution:retry', {
        executionId,
        attempt,
        maxRetries,
        delay,
        error: originalError.message,
        timestamp: new Date()
      });

      // 等待
      await sleep(delay);

      try {
        // 重新执行
        const command = this._interpolateCommand(action.command, context);
        const result = await this._executeCommand(command, action);

        // 成功
        this.stats.retriedExecutions++;

        const executionRecord = {
          executionId,
          command,
          context,
          result: {
            success: true,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: 0
          },
          duration: 0,
          timestamp: new Date(),
          retries: attempt
        };

        this._addToHistory(executionRecord);

        this.emit('execution:retry:success', {
          ...executionRecord,
          attempt
        });

        return executionRecord.result;

      } catch (error) {
        // 继续重试
        if (attempt === maxRetries) {
          // 最后一次重试失败
          this.emit('execution:retry:failed', {
            executionId,
            attempts: maxRetries,
            error: error.message,
            timestamp: new Date()
          });

          throw error;
        }
      }
    }
  }

  /**
   * 计算重试延迟
   * 
   * @private
   * @param {number} attempt - 尝试次数
   * @returns {number} 延迟时间（毫秒）
   */
  _calculateRetryDelay(attempt) {
    const baseDelay = this.config.retryDelay;

    if (this.config.retryBackoff === 'exponential') {
      return baseDelay * Math.pow(2, attempt - 1);
    } else {
      return baseDelay * attempt;
    }
  }

  /**
   * 验证动作
   * 
   * @private
   * @param {Object} action - 动作配置
   */
  _validateAction(action) {
    if (!action.command || typeof action.command !== 'string') {
      throw new Error('Action command must be a non-empty string');
    }

    if (action.command.trim().length === 0) {
      throw new Error('Action command cannot be empty');
    }
  }

  /**
   * 插值命令
   * 
   * @private
   * @param {string} command - 命令模板
   * @param {Object} context - 上下文数据
   * @returns {string} 插值后的命令
   */
  _interpolateCommand(command, context) {
    let result = command;

    // 替换 ${variable} 格式的变量
    const matches = command.match(/\$\{([^}]+)\}/g);

    if (matches) {
      matches.forEach(match => {
        const key = match.slice(2, -1); // 移除 ${ 和 }
        const value = this._getNestedValue(context, key);

        if (value !== undefined) {
          result = result.replace(match, value);
        }
      });
    }

    return result;
  }

  /**
   * 获取嵌套值
   * 
   * @private
   * @param {Object} obj - 对象
   * @param {string} path - 路径（如 'a.b.c'）
   * @returns {*} 值
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * 验证命令安全性
   * 
   * @private
   * @param {string} command - 命令
   */
  _validateCommand(command) {
    // 如果配置了允许的命令列表
    if (this.config.allowedCommands && Array.isArray(this.config.allowedCommands)) {
      const isAllowed = this.config.allowedCommands.some(pattern => {
        if (typeof pattern === 'string') {
          return command.startsWith(pattern);
        } else if (pattern instanceof RegExp) {
          return pattern.test(command);
        }
        return false;
      });

      if (!isAllowed) {
        throw new Error(`Command not allowed: ${command}`);
      }
    }

    // 检查危险命令
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,  // rm -rf /
      /:\(\)\{.*\}:/,    // Fork bomb
      />\s*\/dev\/sd/    // Write to disk device
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        throw new Error(`Dangerous command detected: ${command}`);
      }
    }
  }

  /**
   * 添加到历史记录
   * 
   * @private
   * @param {Object} record - 执行记录
   */
  _addToHistory(record) {
    this.executionHistory.push(record);

    // 限制历史记录大小
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift();
    }
  }

  /**
   * 获取执行历史
   * 
   * @param {number} limit - 限制数量
   * @returns {Array} 执行历史
   */
  getExecutionHistory(limit = null) {
    if (limit) {
      return this.executionHistory.slice(-limit);
    }
    return [...this.executionHistory];
  }

  /**
   * 清除执行历史
   */
  clearHistory() {
    this.executionHistory = [];
    this.emit('history:cleared');
  }

  /**
   * 获取统计信息
   * 
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalExecutions > 0
        ? (this.stats.successfulExecutions / this.stats.totalExecutions * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      retriedExecutions: 0,
      timeoutExecutions: 0
    };

    this.emit('stats:reset');
  }

  /**
   * 设置允许的命令
   * 
   * @param {Array} commands - 允许的命令列表
   */
  setAllowedCommands(commands) {
    if (!Array.isArray(commands)) {
      throw new Error('Allowed commands must be an array');
    }

    this.config.allowedCommands = commands;
    this.emit('config:updated', { allowedCommands: commands });
  }

  /**
   * 获取配置
   * 
   * @returns {Object} 配置
   */
  getConfig() {
    return { ...this.config };
  }
}

module.exports = ActionExecutor;
