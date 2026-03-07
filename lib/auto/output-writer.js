async function maybeWriteOutput(result, outCandidate, projectPath, dependencies = {}) {
  const pathModule = dependencies.pathModule;
  const fs = dependencies.fs;
  if (!outCandidate) {
    return;
  }

  const outputPath = pathModule.isAbsolute(outCandidate)
    ? outCandidate
    : pathModule.join(projectPath, outCandidate);
  await fs.ensureDir(pathModule.dirname(outputPath));
  await fs.writeJson(outputPath, result, { spaces: 2 });
  result.output_file = outputPath;
}

async function maybeWriteTextOutput(result, content, outCandidate, projectPath, dependencies = {}) {
  const pathModule = dependencies.pathModule;
  const fs = dependencies.fs;
  if (!outCandidate) {
    return;
  }

  const outputPath = pathModule.isAbsolute(outCandidate)
    ? outCandidate
    : pathModule.join(projectPath, outCandidate);
  await fs.ensureDir(pathModule.dirname(outputPath));
  await fs.writeFile(outputPath, content, 'utf8');
  result.output_file = outputPath;
}

module.exports = {
  maybeWriteOutput,
  maybeWriteTextOutput
};
