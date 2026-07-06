// @ts-check
/**
 * flutter-skill-bridge.js — AI E2E testing bridge integration
 *
 * Integrates flutter-skill-electron SDK into Multi-Publish Electron app.
 * Exposes a WebSocket JSON-RPC server (port 18118) for AI agents to
 * inspect, tap, type, and screenshot the app.
 *
 * Usage in main.js:
 *   const flutterSkillBridge = require('./flutter-skill-bridge');
 *   flutterSkillBridge.start(mainWindow);
 *
 * Start Electron with CDP for CLI-based testing:
 *   electron main.js --remote-debugging-port=9222
 */

// eslint-disable-next-line no-unused-vars
const path = require('path');
const log = require('./logger');

let bridge = null;

/**
 * Start the flutter-skill bridge
 * @param {BrowserWindow} mainWindow - The main Electron window
 * @param {object} options
 * @param {number} options.port - WebSocket port (default 18118)
 * @param {boolean} options.enabled - Enable bridge (default: check env var)
 */
function start(mainWindow, options) {
  options = options || {};

  // Feature flag: FLUTTER_SKILL_BRIDGE=1 or --flutter-skill flag
  let enabled = options.enabled;
  if (enabled === undefined) {
    enabled = process.env.FLUTTER_SKILL_BRIDGE === '1' ||
              process.argv.includes('--flutter-skill');
  }

  if (!enabled) {
    log.info('FlutterSkill', 'Bridge disabled (set FLUTTER_SKILL_BRIDGE=1 to enable)');
    return;
  }

  try {
    let FlutterSkillElectron = require('../../../packages/flutter-skill-bridge/flutter-skill-electron.js');
    if (typeof FlutterSkillElectron === 'object' && FlutterSkillElectron.default) {
      FlutterSkillElectron = FlutterSkillElectron.default;
    }
    bridge = new FlutterSkillElectron({
      window: mainWindow,
      port: options.port || 18118,
      appName: 'multi-publish',
    });
    bridge.start();
    log.info('FlutterSkill', 'Bridge started on port ' + (options.port || 18118));
  } catch (e) {
    log.error('FlutterSkill', 'Failed to start bridge: ' + e.message);
  }
}

/**
 * Stop the bridge
 */
function stop() {
  if (bridge) {
    // eslint-disable-next-line no-unused-vars
    try { bridge.stop(); } catch (e) { /* ignore */ }
    bridge = null;
    log.info('FlutterSkill', 'Bridge stopped');
  }
}

/**
 * Check if bridge is running
 */
function isRunning() {
  return bridge !== null;
}

module.exports = { start, stop, isRunning };
