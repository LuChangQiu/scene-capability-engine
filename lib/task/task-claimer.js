const fs = require('fs-extra');
const path = require('path');

/**
 * TaskClaimer - 任务认领管理
 * 
 * 管理任务的认领、释放和状态跟踪
 */
class TaskClaimer {
  constructor() {
    this.taskFilePattern = /^(\s*-\s*)\[([ xX~-])\](\*)?\s+(.+)$/;
    this.claimPattern = /\[@([^,]+),\s*claimed:\s*([^\]]+)\]/;
    this.staleDays = 7;
  }

  /**
   * 解析 tasks.md 文件
   * 
   * @param {string} tasksPath - tasks.md 文件路径
   * @returns {Promise<Array>} 任务列表
   */
  async parseTasks(tasksPath, options = {}) {
    try {
      const content = await fs.readFile(tasksPath, 'utf8');
      const lines = content.split(/\r?\n/);
      const tasks = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(this.taskFilePattern);

        if (match) {
          const linePrefix = match[1];
          const status = match[2];
          const isOptional = match[3] === '*';
          const taskContent = match[4];

          // 提取任务 ID 和标题
          const taskIdMatch = taskContent.match(/^(\d+(?:\.\d+)*)(?:\.)?\s+(.+)$/);
          const legacyTaskIdMatch = taskContent.match(/^\*{0,2}\s*Task\s+(\d+(?:\.\d+)*)\s*:\s*(.+)$/i);

          if (taskIdMatch || legacyTaskIdMatch) {
            const taskId = taskIdMatch ? taskIdMatch[1] : legacyTaskIdMatch[1];
            const titleAndClaim = (taskIdMatch ? taskIdMatch[2] : legacyTaskIdMatch[2]).replace(/\*+\s*$/, '').trim();

            // 检查是否有认领信息
            const claimMatch = titleAndClaim.match(this.claimPattern);
            
            let title = titleAndClaim;
            let claimedBy = null;
            let claimedAt = null;

            if (claimMatch) {
              title = titleAndClaim.substring(0, claimMatch.index).trim();
              claimedBy = claimMatch[1];
              claimedAt = claimMatch[2];
            }

            tasks.push({
              lineNumber: i,
              originalLine: line,
              status: this.parseStatus(status),
              isOptional,
              linePrefix,
              taskId,
              title,
              claimedBy,
              claimedAt,
              isStale: claimedAt ? this.isStale(claimedAt) : false
            });
          }
        }
      }

      const markerSectionTasks = this._extractStatusMarkerTasks(lines, tasks);

      if (options && options.preferStatusMarkers === true && markerSectionTasks.length > 0) {
        return markerSectionTasks;
      }

      return tasks;
    } catch (error) {
      throw new Error(`Failed to parse tasks: ${error.message}`);
    }
  }

  /**
   * Extract tasks under the optional status marker section.
   *
   * @param {string[]} lines
   * @param {Array} tasks
   * @returns {Array}
   * @private
   */
  _extractStatusMarkerTasks(lines, tasks) {
    if (!Array.isArray(lines) || !Array.isArray(tasks) || tasks.length === 0) {
      return [];
    }

    const markerHeaderRegex = /^\s*##\s+(?:sce\s+)?Status\s+Markers\s*$/i;
    const sectionHeaderRegex = /^\s*##\s+/;

    const markerLine = lines.findIndex((line) => markerHeaderRegex.test(String(line || '')));
    if (markerLine < 0) {
      return [];
    }

    let nextSectionLine = -1;
    for (let i = markerLine + 1; i < lines.length; i += 1) {
      if (sectionHeaderRegex.test(String(lines[i] || ''))) {
        nextSectionLine = i;
        break;
      }
    }

    return tasks.filter((task) => {
      if (!task || typeof task.lineNumber !== 'number') {
        return false;
      }

      if (task.lineNumber <= markerLine) {
        return false;
      }

      if (nextSectionLine >= 0 && task.lineNumber >= nextSectionLine) {
        return false;
      }

      return true;
    });
  }

  /**
   * 解析任务状态
   * 
   * @param {string} statusChar - 状态字符
   * @returns {string} 状态
   */
  parseStatus(statusChar) {
    switch (statusChar) {
      case ' ':
        return 'not-started';
      case 'x':
      case 'X':
        return 'completed';
      case '-':
        return 'in-progress';
      case '~':
        return 'queued';
      default:
        return 'unknown';
    }
  }

  /**
   * 状态转换为字符
   * 
   * @param {string} status - 状态
   * @returns {string} 状态字符
   */
  statusToChar(status) {
    switch (status) {
      case 'not-started':
        return ' ';
      case 'completed':
        return 'x';
      case 'in-progress':
        return '-';
      case 'queued':
        return '~';
      default:
        return ' ';
    }
  }

  /**
   * 检查认领是否过期
   * 
   * @param {string} claimedAt - 认领时间（ISO 字符串）
   * @returns {boolean} 是否过期
   */
  isStale(claimedAt) {
    try {
      const claimDate = new Date(claimedAt);
      const now = new Date();
      const daysDiff = (now - claimDate) / (1000 * 60 * 60 * 24);
      return daysDiff > this.staleDays;
    } catch (error) {
      return false;
    }
  }

  /**
   * 认领任务
   * 
   * @param {string} projectPath - 项目根目录路径
   * @param {string} specName - Spec 名称
   * @param {string} taskId - 任务 ID
   * @param {string} username - 用户名
   * @param {boolean} force - 是否强制认领
   * @returns {Promise<Object>} 认领结果
   */
  async claimTask(projectPath, specName, taskId, username, force = false) {
    const tasksPath = path.join(projectPath, '.sce/specs', specName, 'tasks.md');

    try {
      // 检查文件是否存在
      const exists = await fs.pathExists(tasksPath);
      if (!exists) {
        return {
          success: false,
          error: `tasks.md not found for spec: ${specName}`
        };
      }

      // 解析任务
      const tasks = await this.parseTasks(tasksPath);
      const task = tasks.find(t => t.taskId === taskId);

      if (!task) {
        return {
          success: false,
          error: `Task not found: ${taskId}`
        };
      }

      // 检查是否已被认领
      if (task.claimedBy && task.claimedBy !== username && !force) {
        return {
          success: false,
          error: `Task already claimed by ${task.claimedBy}`,
          needsForce: true,
          currentClaim: {
            username: task.claimedBy,
            claimedAt: task.claimedAt,
            isStale: task.isStale
          }
        };
      }

      // 读取文件内容
      const content = await fs.readFile(tasksPath, 'utf8');
      const lines = content.split(/\r?\n/);

      // 构建新的任务行
      const claimTimestamp = new Date().toISOString();
      const statusChar = this.statusToChar('in-progress');
      const optionalMarker = task.isOptional ? '*' : '';
      const linePrefix = task.linePrefix || '- ';
      const newLine = `${linePrefix}[${statusChar}]${optionalMarker} ${taskId} ${task.title} [@${username}, claimed: ${claimTimestamp}]`;

      // 替换任务行
      lines[task.lineNumber] = newLine;

      // 写回文件
      await fs.writeFile(tasksPath, lines.join('\n'), 'utf8');

      return {
        success: true,
        taskId,
        username,
        claimedAt: claimTimestamp,
        previousClaim: task.claimedBy ? {
          username: task.claimedBy,
          claimedAt: task.claimedAt
        } : null
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 释放任务认领
   * 
   * @param {string} projectPath - 项目根目录路径
   * @param {string} specName - Spec 名称
   * @param {string} taskId - 任务 ID
   * @param {string} username - 用户名
   * @returns {Promise<Object>} 释放结果
   */
  async unclaimTask(projectPath, specName, taskId, username) {
    const tasksPath = path.join(projectPath, '.sce/specs', specName, 'tasks.md');

    try {
      // 检查文件是否存在
      const exists = await fs.pathExists(tasksPath);
      if (!exists) {
        return {
          success: false,
          error: `tasks.md not found for spec: ${specName}`
        };
      }

      // 解析任务
      const tasks = await this.parseTasks(tasksPath);
      const task = tasks.find(t => t.taskId === taskId);

      if (!task) {
        return {
          success: false,
          error: `Task not found: ${taskId}`
        };
      }

      // 检查是否被当前用户认领
      if (!task.claimedBy) {
        return {
          success: false,
          error: 'Task is not claimed'
        };
      }

      if (task.claimedBy !== username) {
        return {
          success: false,
          error: `Task is claimed by ${task.claimedBy}, not ${username}`
        };
      }

      // 读取文件内容
      const content = await fs.readFile(tasksPath, 'utf8');
      const lines = content.split(/\r?\n/);

      // 构建新的任务行（移除认领信息，重置状态）
      const statusChar = this.statusToChar('not-started');
      const optionalMarker = task.isOptional ? '*' : '';
      const linePrefix = task.linePrefix || '- ';
      const newLine = `${linePrefix}[${statusChar}]${optionalMarker} ${taskId} ${task.title}`;

      // 替换任务行
      lines[task.lineNumber] = newLine;

      // 写回文件
      await fs.writeFile(tasksPath, lines.join('\n'), 'utf8');

      return {
        success: true,
        taskId,
        username,
        unclaimedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取已认领的任务列表
   * 
   * @param {string} projectPath - 项目根目录路径
   * @param {string} specName - Spec 名称
   * @returns {Promise<Array>} 已认领的任务列表
   */
  async getClaimedTasks(projectPath, specName) {
    const tasksPath = path.join(projectPath, '.sce/specs', specName, 'tasks.md');

    try {
      const exists = await fs.pathExists(tasksPath);
      if (!exists) {
        return [];
      }

      const tasks = await this.parseTasks(tasksPath);
      
      return tasks
        .filter(task => task.claimedBy)
        .map(task => ({
          specName,
          taskId: task.taskId,
          taskTitle: task.title,
          claimedBy: task.claimedBy,
          claimedAt: task.claimedAt,
          status: task.status,
          isStale: task.isStale,
          isOptional: task.isOptional
        }));
    } catch (error) {
      return [];
    }
  }

  /**
   * 更新任务状态
   * 
   * @param {string} projectPath - 项目根目录路径
   * @param {string} specName - Spec 名称
   * @param {string} taskId - 任务 ID
   * @param {string} status - 新状态
   * @returns {Promise<Object>} 更新结果
   */
  async updateTaskStatus(projectPath, specName, taskId, status) {
    const tasksPath = path.join(projectPath, '.sce/specs', specName, 'tasks.md');

    try {
      const exists = await fs.pathExists(tasksPath);
      if (!exists) {
        return {
          success: false,
          error: `tasks.md not found for spec: ${specName}`
        };
      }

      const tasks = await this.parseTasks(tasksPath);
      const task = tasks.find(t => t.taskId === taskId);

      if (!task) {
        return {
          success: false,
          error: `Task not found: ${taskId}`
        };
      }

      // 读取文件内容
      const content = await fs.readFile(tasksPath, 'utf8');
      const lines = content.split(/\r?\n/);

      // 构建新的任务行
      const statusChar = this.statusToChar(status);
      const optionalMarker = task.isOptional ? '*' : '';
      
      const linePrefix = task.linePrefix || '- ';
      let newLine = `${linePrefix}[${statusChar}]${optionalMarker} ${taskId} ${task.title}`;
      
      // 保留认领信息（如果有）
      if (task.claimedBy) {
        newLine += ` [@${task.claimedBy}, claimed: ${task.claimedAt}]`;
      }

      // 替换任务行
      lines[task.lineNumber] = newLine;

      // 写回文件
      await fs.writeFile(tasksPath, lines.join('\n'), 'utf8');

      return {
        success: true,
        taskId,
        oldStatus: task.status,
        newStatus: status
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取所有 Spec 的已认领任务
   * 
   * @param {string} projectPath - 项目根目录路径
   * @returns {Promise<Array>} 所有已认领的任务
   */
  async getAllClaimedTasks(projectPath) {
    const specsPath = path.join(projectPath, '.sce/specs');
    
    try {
      const exists = await fs.pathExists(specsPath);
      if (!exists) {
        return [];
      }

      const entries = await fs.readdir(specsPath, { withFileTypes: true });
      const specDirs = entries.filter(entry => entry.isDirectory());

      const allClaimedTasks = [];

      for (const specDir of specDirs) {
        const specName = specDir.name;
        const claimedTasks = await this.getClaimedTasks(projectPath, specName);
        allClaimedTasks.push(...claimedTasks);
      }

      return allClaimedTasks;
    } catch (error) {
      return [];
    }
  }
}

module.exports = TaskClaimer;
