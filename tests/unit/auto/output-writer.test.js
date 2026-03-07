const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { maybeWriteOutput, maybeWriteTextOutput } = require('../../../lib/auto/output-writer');

describe('auto output writer', () => {
  test('writes json output and backfills output_file', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-output-writer-'));
    try {
      const result = { mode: 'demo', ok: true };
      await maybeWriteOutput(result, 'result.json', tempDir, { pathModule: path, fs });
      expect(result.output_file).toBe(path.join(tempDir, 'result.json'));
      expect(await fs.readJson(result.output_file)).toEqual({ mode: 'demo', ok: true });
    } finally {
      await fs.remove(tempDir);
    }
  });

  test('writes text output and backfills output_file', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-output-writer-'));
    try {
      const result = { mode: 'demo' };
      await maybeWriteTextOutput(result, 'hello', 'result.txt', tempDir, { pathModule: path, fs });
      expect(result.output_file).toBe(path.join(tempDir, 'result.txt'));
      expect(await fs.readFile(result.output_file, 'utf8')).toBe('hello');
    } finally {
      await fs.remove(tempDir);
    }
  });
});
