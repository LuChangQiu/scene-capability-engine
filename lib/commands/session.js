const chalk = require('chalk');
const { SessionStore } = require('../runtime/session-store');
const { captureTimelineCheckpoint } = require('../runtime/project-timeline');

function registerSessionCommands(program) {
  const session = program
    .command('session')
    .description('Manage universal runtime sessions (start/resume/snapshot)');

  session
    .command('start [objective]')
    .description('Start a new SCE runtime session')
    .option('--tool <tool>', 'Target tool (codex|claude|cursor|generic)', 'generic')
    .option('--agent-version <version>', 'Target agent version for compatibility tracking')
    .option('--id <id>', 'Custom session id')
    .option('--json', 'Output as JSON')
    .action(async (objective, options) => {
      try {
        await captureTimelineCheckpoint({
          trigger: 'key-event',
          event: 'session.start',
          summary: `session start | tool=${options.tool || 'generic'} | objective=${objective || ''}`.trim(),
          command: 'sce session start'
        }, {
          projectPath: process.cwd()
        });
        const store = new SessionStore(process.cwd());
        const created = await store.startSession({
          tool: options.tool,
          agentVersion: options.agentVersion,
          objective: objective || '',
          sessionId: options.id,
        });
        _printSessionResult('session_start', created, options.json);
      } catch (error) {
        _exitWithError(error, options.json);
      }
    });

  session
    .command('resume [sessionRef]')
    .description('Resume a session by id, or use latest by default')
    .option('--status <status>', 'Status to set after resume', 'active')
    .option('--json', 'Output as JSON')
    .action(async (sessionRef, options) => {
      try {
        await captureTimelineCheckpoint({
          trigger: 'key-event',
          event: 'session.resume',
          summary: `session resume | ref=${sessionRef || 'latest'} | status=${options.status || 'active'}`,
          command: 'sce session resume',
          sessionId: sessionRef || 'latest'
        }, {
          projectPath: process.cwd()
        });
        const store = new SessionStore(process.cwd());
        const resumed = await store.resumeSession(sessionRef || 'latest', {
          status: options.status,
        });
        _printSessionResult('session_resume', resumed, options.json);
      } catch (error) {
        _exitWithError(error, options.json);
      }
    });

  session
    .command('snapshot [sessionRef]')
    .description('Create a session snapshot by id, or use latest by default')
    .option('--summary <summary>', 'Snapshot summary text', '')
    .option('--status <status>', 'Session status after snapshot')
    .option('--payload <json>', 'Optional JSON payload')
    .option('--json', 'Output as JSON')
    .action(async (sessionRef, options) => {
      try {
        await captureTimelineCheckpoint({
          trigger: 'key-event',
          event: 'session.snapshot',
          summary: `session snapshot | ref=${sessionRef || 'latest'} | status=${options.status || 'inherit'}`,
          command: 'sce session snapshot',
          sessionId: sessionRef || 'latest'
        }, {
          projectPath: process.cwd()
        });
        const store = new SessionStore(process.cwd());
        const payload = _parsePayload(options.payload);
        const snapshotted = await store.snapshotSession(sessionRef || 'latest', {
          summary: options.summary,
          status: options.status,
          payload,
        });
        _printSessionResult('session_snapshot', snapshotted, options.json);
      } catch (error) {
        _exitWithError(error, options.json);
      }
    });

  session
    .command('show [sessionRef]')
    .description('Show a session by id, or latest by default')
    .option('--json', 'Output as JSON')
    .action(async (sessionRef, options) => {
      try {
        const store = new SessionStore(process.cwd());
        const current = await store.getSession(sessionRef || 'latest');
        _printSessionResult('session_show', current, options.json);
      } catch (error) {
        _exitWithError(error, options.json);
      }
    });
}

function _parsePayload(raw) {
  if (raw == null || `${raw}`.trim() === '') {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (_error) {
    throw new Error('Invalid --payload JSON');
  }
}

function _printSessionResult(action, session, asJson = false) {
  if (asJson) {
    console.log(JSON.stringify({
      success: true,
      action,
      session,
    }, null, 2));
    return;
  }

  const snapshots = Array.isArray(session.snapshots) ? session.snapshots.length : 0;
  console.log(chalk.green('✓ Session updated'));
  console.log(chalk.gray(`Session: ${session.session_id}`));
  console.log(chalk.gray(`Tool: ${session.tool}`));
  if (session.agent_version) {
    console.log(chalk.gray(`Agent version: ${session.agent_version}`));
  }
  console.log(chalk.gray(`Status: ${session.status}`));
  console.log(chalk.gray(`Snapshots: ${snapshots}`));
  if (session.steering && session.steering.compatibility) {
    const supported = session.steering.compatibility.supported;
    const label = supported === null ? 'unknown' : supported;
    console.log(chalk.gray(`Compatibility: ${label} (${session.steering.compatibility.rule})`));
  }
  if (session.objective) {
    console.log(chalk.gray(`Objective: ${session.objective}`));
  }
}

function _exitWithError(error, asJson = false) {
  if (asJson) {
    console.log(JSON.stringify({
      success: false,
      error: error.message,
    }, null, 2));
  } else {
    console.error(chalk.red('Error:'), error.message);
  }
  process.exit(1);
}

module.exports = {
  registerSessionCommands,
};
