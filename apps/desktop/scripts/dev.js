const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const devPorts = require('./dev-ports');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const cwd = path.resolve(repoRoot, 'apps', 'desktop');
const userDataDir = process.env.ELECTRON_USER_DATA_DIR || path.join(cwd, '.electron-dev-data');

const vitePort = devPorts.vite;
const cdpPort = devPorts.cdp;
const viteUrl = `http://127.0.0.1:${vitePort}`;

function spawnCommand(command, args, options = {}) {
  return spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  });
}

function spawnNodeScript(scriptPath, args = []) {
  return spawn(process.execPath, [scriptPath, ...args], {
    stdio: 'inherit',
    shell: false,
    cwd,
  });
}

const viteScript = path.resolve(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');

console.log(`[dev] ports: vite=${vitePort} cdp=${cdpPort} derived=${devPorts.derived}`);
const vite = spawnNodeScript(viteScript, ['--host', '0.0.0.0', '--port', String(vitePort), '--strictPort']);

const electron = spawnCommand(
  path.resolve(repoRoot, 'node_modules', '.bin', 'electron'),
  ['.', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${userDataDir}`],
  { cwd, env: { ...process.env, VITE_DEV_SERVER_URL: viteUrl } }
);

let viteExit = null;
let electronExit = null;

function noteExit(kind, code, signal) {
  if (kind === 'vite') viteExit = { code, signal };
  if (kind === 'electron') electronExit = { code, signal };
  if (viteExit || electronExit) {
    const report = {
      pid: kind === 'vite' ? (vite && vite.pid) : (electron && electron.pid),
      code,
      signal,
      kind,
      viteExit,
      electronExit,
    };
    console.error(`[dev] ${kind} exited: ${JSON.stringify(report)}`);
  }
}

vite.on('exit', (code, signal) => { noteExit('vite', code, signal); electron.kill(); });
electron.on('exit', (code, signal) => { noteExit('electron', code, signal); vite.kill(); });

function gracefulShutdown(reason, signal) {
  console.log(`[dev] gracefulShutdown: reason=${reason} signal=${signal}`);
  try { vite.kill(signal || 'SIGTERM'); } catch (_) {}
  try { electron.kill(signal || 'SIGTERM'); } catch (_) {}
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));