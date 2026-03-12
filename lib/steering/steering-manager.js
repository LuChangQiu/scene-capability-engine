const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer');

/**
 * SteeringManager - 管理 Steering 文件的独占使用
 * 
 * 负责检测、备份、安装和恢复 steering 文件
 */
class SteeringManager {
  constructor() {
    this.steeringDir = '.sce/steering';
    this.backupBaseDir = '.sce/backups';
  }

  /**
   * 检测项目中的 steering 文件
   * 
   * @param {string} projectPath - 项目根目录路径
   * @returns {Promise<Object>} 检测结果
   */
  async detectSteering(projectPath) {
    const steeringPath = path.join(projectPath, this.steeringDir);
    
    // 检查 steering 目录是否存在
    const exists = await fs.pathExists(steeringPath);
    
    if (!exists) {
      return {
        hasExistingSteering: false,
        files: [],
        path: steeringPath
      };
    }

    // 读取 steering 目录中的文件
    const files = await fs.readdir(steeringPath);
    
    // 过滤出 .md 文件
    const mdFiles = files.filter(f => f.endsWith('.md'));
    
    // 获取文件详细信息
    const fileDetails = await Promise.all(
      mdFiles.map(async (file) => {
        const filePath = path.join(steeringPath, file);
        const stats = await fs.stat(filePath);
        return {
          name: file,
          path: filePath,
          size: stats.size,
          modified: stats.mtime
        };
      })
    );

    return {
      hasExistingSteering: mdFiles.length > 0,
      files: fileDetails,
      path: steeringPath,
      count: mdFiles.length
    };
  }

  /**
   * 提示用户选择 steering 策略
   * 
   * @param {Object} detection - detectSteering 的返回结果
   * @returns {Promise<string>} 选择的策略 ('use-sce' | 'use-project')
   */
  async promptStrategy(detection) {
    if (!detection.hasExistingSteering) {
      // 没有现有 steering 文件，默认使用 sce
      return 'use-sce';
    }

    console.log('\n⚠️  Steering Conflict Detected');
    console.log('━'.repeat(60));
    console.log(`Found ${detection.count} existing steering file(s) in ${this.steeringDir}:`);
    console.log('');
    
    detection.files.forEach(file => {
      console.log(`  • ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    });
    
    console.log('');
    console.log('AI IDE loads all files in .sce/steering/, which means you must');
    console.log('choose between sce steering rules OR your project\'s existing rules.');
    console.log('');

    const response = await inquirer.prompt([{
      type: 'list',
      name: 'strategy',
      message: 'How would you like to proceed?',
      choices: [
        {
          name: 'Use sce steering (backup existing files) - Recommended for new sce users',
          value: 'use-sce'
        },
        {
          name: 'Keep existing steering (skip sce steering) - For projects with custom steering rules',
          value: 'use-project'
        }
      ]
    }]);

    return response.strategy;
  }

  /**
   * 备份现有的 steering 文件
   * 
   * @param {string} projectPath - 项目根目录路径
   * @returns {Promise<Object>} 备份结果
   */
  async backupSteering(projectPath) {
    const steeringPath = path.join(projectPath, this.steeringDir);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `steering-${timestamp}`;
    const backupPath = path.join(projectPath, this.backupBaseDir, backupId);

    // 检查 steering 目录是否存在
    const exists = await fs.pathExists(steeringPath);
    if (!exists) {
      return {
        success: false,
        error: 'Steering directory does not exist',
        backupId: null,
        backupPath: null
      };
    }

    try {
      // 创建备份目录
      await fs.ensureDir(backupPath);

      // 复制所有文件
      await fs.copy(steeringPath, backupPath, {
        overwrite: false,
        errorOnExist: false
      });

      // 验证备份
      const backupFiles = await fs.readdir(backupPath);
      const originalFiles = await fs.readdir(steeringPath);

      return {
        success: true,
        backupId,
        backupPath,
        filesBackedUp: backupFiles.length,
        timestamp,
        verified: backupFiles.length === originalFiles.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        backupId,
        backupPath
      };
    }
  }

  /**
   * 安装 sce steering 文件
   * 
   * @param {string} projectPath - 项目根目录路径
   * @returns {Promise<Object>} 安装结果
   */
  async installSceSteering(projectPath) {
    const steeringPath = path.join(projectPath, this.steeringDir);
    const templatePath = path.join(__dirname, '../../template/.sce/steering');

    try {
      // 确保 steering 目录存在
      await fs.ensureDir(steeringPath);

      // 检查模板目录是否存在
      const templateExists = await fs.pathExists(templatePath);
      if (!templateExists) {
        return {
          success: false,
          error: 'sce steering template directory not found',
          filesInstalled: 0
        };
      }

      // 复制模板文件
      const templateFiles = await fs.readdir(templatePath);
      const mdFiles = templateFiles.filter(f => f.endsWith('.md'));

      let installedCount = 0;
      for (const file of mdFiles) {
        const srcPath = path.join(templatePath, file);
        const destPath = path.join(steeringPath, file);
        
        await fs.copy(srcPath, destPath, {
          overwrite: true
        });
        installedCount++;
      }

      return {
        success: true,
        filesInstalled: installedCount,
        files: mdFiles
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        filesInstalled: 0
      };
    }
  }

  /**
   * 从备份恢复 steering 文件
   * 
   * @param {string} projectPath - 项目根目录路径
   * @param {string} backupId - 备份 ID
   * @returns {Promise<Object>} 恢复结果
   */
  async restoreSteering(projectPath, backupId) {
    const steeringPath = path.join(projectPath, this.steeringDir);
    const backupPath = path.join(projectPath, this.backupBaseDir, backupId);

    // 检查备份是否存在
    const backupExists = await fs.pathExists(backupPath);
    if (!backupExists) {
      return {
        success: false,
        error: `Backup not found: ${backupId}`,
        filesRestored: 0
      };
    }

    try {
      // 清空现有 steering 目录
      await fs.emptyDir(steeringPath);

      // 从备份恢复
      await fs.copy(backupPath, steeringPath, {
        overwrite: true
      });

      // 验证恢复
      const restoredFiles = await fs.readdir(steeringPath);

      return {
        success: true,
        filesRestored: restoredFiles.length,
        backupId,
        files: restoredFiles
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        filesRestored: 0,
        backupId
      };
    }
  }

  /**
   * 列出所有可用的 steering 备份
   * 
   * @param {string} projectPath - 项目根目录路径
   * @returns {Promise<Array>} 备份列表
   */
  async listBackups(projectPath) {
    const backupBasePath = path.join(projectPath, this.backupBaseDir);
    
    const exists = await fs.pathExists(backupBasePath);
    if (!exists) {
      return [];
    }

    const entries = await fs.readdir(backupBasePath, { withFileTypes: true });
    const steeringBackups = entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('steering-'))
      .map(entry => entry.name);

    return steeringBackups;
  }
}

module.exports = SteeringManager;
