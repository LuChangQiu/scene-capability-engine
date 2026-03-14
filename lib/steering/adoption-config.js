const fs = require('fs-extra');
const path = require('path');

/**
 * AdoptionConfig - 管理 adoption-config.json 配置文件
 * 
 * 记录项目采用 sce 时的配置选择
 */
class AdoptionConfig {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.configPath = path.join(projectPath, '.sce', 'adoption-config.json');
  }

  /**
   * 读取配置文件
   * 
   * @returns {Promise<Object|null>} 配置对象，如果不存在则返回 null
   */
  async read() {
    try {
      const exists = await fs.pathExists(this.configPath);
      if (!exists) {
        return null;
      }

      const content = await fs.readFile(this.configPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Error reading adoption config: ${error.message}`);
      return null;
    }
  }

  /**
   * 写入配置文件
   * 
   * @param {Object} config - 配置对象
   * @returns {Promise<boolean>} 是否成功
   */
  async write(config) {
    try {
      // 确保目录存在
      await fs.ensureDir(path.dirname(this.configPath));

      // 写入配置
      await fs.writeFile(
        this.configPath,
        JSON.stringify(config, null, 2),
        'utf8'
      );

      return true;
    } catch (error) {
      console.error(`Error writing adoption config: ${error.message}`);
      return false;
    }
  }

  /**
   * 更新 steering 策略配置
   * 
   * @param {string} strategy - 策略 ('use-sce' | 'use-project')
   * @param {string|null} backupId - 备份 ID（如果有）
   * @returns {Promise<boolean>} 是否成功
   */
  async updateSteeringStrategy(strategy, backupId = null) {
    // 读取现有配置
    let config = await this.read();

    if (!config) {
      // 创建新配置
      config = {
        version: '1.0.0',
        adoptedAt: new Date().toISOString(),
        multiUserMode: true
      };
    }

    // 更新 steering 策略
    config.steeringStrategy = strategy;
    
    if (backupId) {
      config.steeringBackupId = backupId;
    }

    config.lastUpdated = new Date().toISOString();

    // 写入配置
    return await this.write(config);
  }

  /**
   * 更新多用户模式配置
   * 
   * @param {boolean} enabled - 是否启用多用户模式
   * @returns {Promise<boolean>} 是否成功
   */
  async updateMultiUserMode(enabled) {
    let config = await this.read();

    if (!config) {
      config = {
        version: '1.0.0',
        adoptedAt: new Date().toISOString()
      };
    }

    config.multiUserMode = enabled;
    config.lastUpdated = new Date().toISOString();

    return await this.write(config);
  }

  /**
   * 获取 steering 策略
   * 
   * @returns {Promise<string|null>} 策略或 null
   */
  async getSteeringStrategy() {
    const config = await this.read();
    return config ? config.steeringStrategy : null;
  }

  /**
   * 获取 steering 备份 ID
   * 
   * @returns {Promise<string|null>} 备份 ID 或 null
   */
  async getSteeringBackupId() {
    const config = await this.read();
    return config ? config.steeringBackupId : null;
  }

  /**
   * 检查是否启用多用户模式
   * 
   * @returns {Promise<boolean>} 是否启用
   */
  async isMultiUserMode() {
    const config = await this.read();
    return config ? (typeof config.multiUserMode === 'boolean' ? config.multiUserMode : true) : true;
  }

  /**
   * 创建初始配置
   * 
   * @param {Object} options - 配置选项
   * @returns {Promise<boolean>} 是否成功
   */
  async initialize(options = {}) {
    const config = {
      version: '1.0.0',
      adoptedAt: new Date().toISOString(),
      steeringStrategy: options.steeringStrategy || 'use-sce',
      multiUserMode: typeof options.multiUserMode === 'boolean' ? options.multiUserMode : true,
      ...options
    };

    return await this.write(config);
  }
}

module.exports = AdoptionConfig;
