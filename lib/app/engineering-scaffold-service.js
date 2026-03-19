const path = require('path');
const fs = require('fs-extra');

const DEFAULT_ENGINEERING_SCAFFOLD_ENTRIES = Object.freeze([
  'README.md',
  'config',
  'steering',
  'knowledge',
  'specs'
]);

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeOverwritePolicy(value) {
  const candidate = normalizeString(value).toLowerCase();
  if (!candidate) {
    return 'missing-only';
  }
  if (['never', 'missing-only', 'explicit'].includes(candidate)) {
    return candidate;
  }
  throw new Error(`invalid overwrite policy: ${value}`);
}

async function pathExists(fileSystem, targetPath) {
  try {
    return await fileSystem.pathExists(targetPath);
  } catch (error) {
    return false;
  }
}

async function copyEntryRecursive(sourcePath, targetPath, state, options) {
  const { fileSystem, overwritePolicy } = options;
  const sourceStat = await fileSystem.stat(sourcePath);

  if (sourceStat.isDirectory()) {
    const exists = await pathExists(fileSystem, targetPath);
    if (exists) {
      state.skippedDirectoryCount += 1;
      if (overwritePolicy === 'never') {
        return;
      }
    } else {
      await fileSystem.ensureDir(targetPath);
      state.createdDirectoryCount += 1;
    }

    const entries = (await fileSystem.readdir(sourcePath)).sort();
    for (const entry of entries) {
      await copyEntryRecursive(
        path.join(sourcePath, entry),
        path.join(targetPath, entry),
        state,
        options
      );
    }
    return;
  }

  const exists = await pathExists(fileSystem, targetPath);
  if (exists) {
    if (overwritePolicy === 'explicit') {
      await fileSystem.ensureDir(path.dirname(targetPath));
      await fileSystem.copy(sourcePath, targetPath, {
        overwrite: true,
        errorOnExist: false
      });
      state.createdFileCount += 1;
      return;
    }
    state.skippedFileCount += 1;
    return;
  }

  await fileSystem.ensureDir(path.dirname(targetPath));
  await fileSystem.copy(sourcePath, targetPath, {
    overwrite: false,
    errorOnExist: true
  });
  state.createdFileCount += 1;
}

async function scaffoldEngineeringWorkspace(options = {}) {
  const workspacePath = normalizeString(options.workspacePath);
  if (!workspacePath) {
    throw new Error('workspacePath is required');
  }

  const fileSystem = options.fileSystem || fs;
  const templateRoot = options.templateRoot
    ? path.resolve(options.templateRoot)
    : path.resolve(__dirname, '../../template/.sce');
  const overwritePolicy = normalizeOverwritePolicy(options.overwritePolicy);
  const scaffoldEntries = Array.isArray(options.entries) && options.entries.length > 0
    ? options.entries
    : DEFAULT_ENGINEERING_SCAFFOLD_ENTRIES;
  const result = {
    workspacePath,
    createdDirectoryCount: 0,
    skippedDirectoryCount: 0,
    failedDirectoryCount: 0,
    createdFileCount: 0,
    skippedFileCount: 0,
    failedFileCount: 0,
    overwritePolicy
  };
  const scaffoldRoot = path.join(workspacePath, '.sce');
  const scaffoldRootExists = await pathExists(fileSystem, scaffoldRoot);

  if (scaffoldRootExists) {
    result.skippedDirectoryCount += 1;
    if (overwritePolicy === 'never') {
      return result;
    }
  } else {
    await fileSystem.ensureDir(scaffoldRoot);
    result.createdDirectoryCount += 1;
  }

  for (const entry of scaffoldEntries) {
    const sourcePath = path.join(templateRoot, entry);
    const targetPath = path.join(scaffoldRoot, entry);
    if (!await pathExists(fileSystem, sourcePath)) {
      throw new Error(`engineering scaffold template entry is missing: ${entry}`);
    }
    try {
      await copyEntryRecursive(sourcePath, targetPath, result, {
        fileSystem,
        overwritePolicy
      });
    } catch (error) {
      const targetExists = await pathExists(fileSystem, targetPath);
      if (targetExists) {
        result.failedFileCount += 1;
      } else {
        result.failedDirectoryCount += 1;
      }
    }
  }

  return result;
}

module.exports = {
  DEFAULT_ENGINEERING_SCAFFOLD_ENTRIES,
  normalizeOverwritePolicy,
  scaffoldEngineeringWorkspace
};
