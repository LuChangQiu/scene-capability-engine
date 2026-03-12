const fs = require('fs-extra');
const path = require('path');

class ContextCollector {
  constructor(projectPath = process.cwd()) {
    this.projectPath = projectPath;
  }

  async collect() {
    const kiroDir = path.join(this.projectPath, '.sce');
    const specsDir = path.join(kiroDir, 'specs');
    const hasKiro = await fs.pathExists(kiroDir);
    const existingSpecs = await this._listSpecs(specsDir);

    return {
      projectPath: this.projectPath,
      hasKiro,
      specsDir,
      existingSpecs,
      totalSpecs: existingSpecs.length,
      preferredLanguage: this._detectLanguagePreference()
    };
  }

  async _listSpecs(specsDir) {
    if (!await fs.pathExists(specsDir)) {
      return [];
    }

    const entries = await fs.readdir(specsDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort((left, right) => left.localeCompare(right));
  }

  _detectLanguagePreference() {
    const lang = `${process.env.SCE_LANG || process.env.LANG || ''}`.toLowerCase();
    if (lang.includes('zh')) {
      return 'zh';
    }

    return 'en';
  }
}

module.exports = { ContextCollector };

