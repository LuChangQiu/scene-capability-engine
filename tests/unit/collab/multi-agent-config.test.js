'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  MultiAgentConfig,
  DEFAULT_CONFIG
} = require('../../../lib/collab/multi-agent-config');

describe('multi-agent-config defaults', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sce-multi-agent-config-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test('uses default-on co-work baseline when config file is missing', async () => {
    const config = new MultiAgentConfig(tempDir);

    await expect(config.getConfig()).resolves.toEqual(DEFAULT_CONFIG);
    await expect(config.isEnabled()).resolves.toBe(true);
    await expect(config.isCoordinatorEnabled()).resolves.toBe(false);
  });

  test('allows explicit project opt-out via enabled=false', async () => {
    const config = new MultiAgentConfig(tempDir);

    await config.updateConfig({ enabled: false });

    await expect(config.isEnabled()).resolves.toBe(false);
    await expect(config.isCoordinatorEnabled()).resolves.toBe(false);
  });
});
