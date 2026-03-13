const { spawn } = require('child_process');
const path = require('path');

function unrefTimer(timer) {
  if (timer && typeof timer.unref === 'function') {
    timer.unref();
  }
}

/**
 * CommandTestHelper - Provides utilities for executing commands and validating output
 * in integration tests. Handles command execution, output capture, and validation.
 */
class CommandTestHelper {
  constructor(fixture) {
    this.fixture = fixture;
    this.timeout = 10000; // Default 10 second timeout
  }

  /**
   * Execute a command in the test environment
   * @param {string} commandName - Name of the command (e.g., 'workspace-multi', 'adopt')
   * @param {Array<string>} args - Command arguments
   * @param {object} options - Execution options
   * @returns {Promise<CommandResult>} Command result with exitCode, stdout, stderr
   */
  async executeCommand(commandName, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || this.timeout;
      const cwd = options.cwd || this.fixture.testDir;
      const env = { ...process.env, ...options.env };

      // Construct command path
      const binPath = path.join(__dirname, '../../bin/sce.js');
      const fullArgs = [commandName, ...args];

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const child = spawn('node', [binPath, ...fullArgs], {
        cwd,
        env,
        shell: true
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeout);
      unrefTimer(timeoutId);

      // Capture stdout
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      // Capture stderr
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle completion
      child.on('close', (exitCode) => {
        clearTimeout(timeoutId);

        if (timedOut) {
          reject(new Error(`Command timed out after ${timeout}ms`));
        } else {
          resolve({
            exitCode: exitCode || 0,
            stdout,
            stderr,
            error: exitCode !== 0 ? new Error(`Command failed with exit code ${exitCode}`) : null
          });
        }
      });

      // Handle errors
      child.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * Capture output from a function execution
   * @param {Function} fn - Function to execute
   * @returns {Promise<string>} Captured output
   */
  async captureOutput(fn) {
    const originalLog = console.log;
    const originalError = console.error;
    let output = '';

    console.log = (...args) => {
      output += args.join(' ') + '\n';
    };

    console.error = (...args) => {
      output += args.join(' ') + '\n';
    };

    try {
      await fn();
      return output;
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  }

  /**
   * Validate output against expected patterns
   * @param {string} output - Output to validate
   * @param {Array<string|RegExp>} expectedPatterns - Patterns to match
   * @returns {boolean} True if all patterns match
   */
  validateOutput(output, expectedPatterns) {
    for (const pattern of expectedPatterns) {
      if (typeof pattern === 'string') {
        if (!output.includes(pattern)) {
          return false;
        }
      } else if (pattern instanceof RegExp) {
        if (!pattern.test(output)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Wait for a file to change
   * @param {string} filePath - Path to file (relative to test directory)
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<void>}
   */
  async waitForFileChange(filePath, timeout = 5000) {
    const absolutePath = this.fixture.getAbsolutePath(filePath);
    const startTime = Date.now();
    let lastMtime = null;

    if (await this.fixture.fileExists(filePath)) {
      const fs = require('fs-extra');
      const stats = await fs.stat(absolutePath);
      lastMtime = stats.mtimeMs;
    }

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(async () => {
        try {
          if (await this.fixture.fileExists(filePath)) {
            const fs = require('fs-extra');
            const stats = await fs.stat(absolutePath);
            
            if (lastMtime === null || stats.mtimeMs > lastMtime) {
              clearInterval(checkInterval);
              resolve();
              return;
            }
          }

          if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval);
            reject(new Error(`File ${filePath} did not change within ${timeout}ms`));
          }
        } catch (error) {
          clearInterval(checkInterval);
          reject(error);
        }
      }, 100);
      unrefTimer(checkInterval);
    });
  }

  /**
   * Wait for a file to exist
   * @param {string} filePath - Path to file (relative to test directory)
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<void>}
   */
  async waitForFile(filePath, timeout = 5000) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(async () => {
        try {
          if (await this.fixture.fileExists(filePath)) {
            clearInterval(checkInterval);
            resolve();
            return;
          }

          if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval);
            reject(new Error(`File ${filePath} did not appear within ${timeout}ms`));
          }
        } catch (error) {
          clearInterval(checkInterval);
          reject(error);
        }
      }, 100);
      unrefTimer(checkInterval);
    });
  }

  /**
   * Assert command succeeded
   * @param {CommandResult} result - Command result
   * @param {string} message - Optional error message
   */
  assertSuccess(result, message) {
    if (result.exitCode !== 0) {
      const errorMsg = message || `Command failed with exit code ${result.exitCode}`;
      throw new Error(`${errorMsg}\nStderr: ${result.stderr}\nStdout: ${result.stdout}`);
    }
  }

  /**
   * Assert command failed
   * @param {CommandResult} result - Command result
   * @param {string} message - Optional error message
   */
  assertFailure(result, message) {
    if (result.exitCode === 0) {
      const errorMsg = message || 'Expected command to fail but it succeeded';
      throw new Error(`${errorMsg}\nStdout: ${result.stdout}`);
    }
  }

  /**
   * Assert output contains text
   * @param {string} output - Output to check
   * @param {string} expected - Expected text
   * @param {string} message - Optional error message
   */
  assertOutputContains(output, expected, message) {
    if (!output.includes(expected)) {
      const errorMsg = message || `Expected output to contain "${expected}"`;
      throw new Error(`${errorMsg}\nActual output: ${output}`);
    }
  }

  /**
   * Assert output matches pattern
   * @param {string} output - Output to check
   * @param {RegExp} pattern - Expected pattern
   * @param {string} message - Optional error message
   */
  assertOutputMatches(output, pattern, message) {
    if (!pattern.test(output)) {
      const errorMsg = message || `Expected output to match ${pattern}`;
      throw new Error(`${errorMsg}\nActual output: ${output}`);
    }
  }
}

module.exports = CommandTestHelper;
