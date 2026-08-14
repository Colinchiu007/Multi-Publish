const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { buildElectronArgs, resolveUserDataDir } = require('./dev-launcher');

const desktopDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const vitePort = 5174;
const viteUrl = `http://127.0.0.1:${vitePort}`;
// 默认固定 D 盘 profile（登录态/模型 key 持久化在同一 userData）；并发会话隔离请显式设 ELECTRON_USER_DATA_DIR
const electronUserDataDir = resolveUserDataDir();
const electronCacheDir = path.join(electronUserDataDir, 'cache');

function spawnCommand(command, args, options = {}) {
  return spawn(command, args, {
    cwd: desktopDir,
    stdio: 'inherit',
    shell: false,
    ...options,
  });
}

function spawnNodeScript(scriptPath, args = []) {
  return spawn(process.execPath, [scriptPath, ...args], {
    cwd: desktopDir,
    stdio: 'inherit',
    shell: false,
  });
}

const viteScript = path.resolve(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const electronScript = path.resolve(repoRoot, 'node_modules', 'electron', 'cli.js');
const electronBinary = path.resolve(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe');

const vite = spawnNodeScript(viteScript, ['--host', '127.0.0.1', '--port', String(vitePort), '--strictPort']);

let electron = null;
let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  if (electron && !electron.killed) electron.kill();
  if (vite && !vite.killed) vite.kill();
  process.exitCode = code;
}

vite.on('exit', (code) => stop(code ?? 1));
vite.on('error', (error) => {
  console.error('[dev] vite failed to start:', error);
  stop(1);
});

function waitForVite(remainingMs) {
  if (stopping) return;
  if (remainingMs <= 0) {
    console.error('[dev] timed out waiting for vite:', viteUrl);
    stop(1);
    return;
  }
  const req = http.get(viteUrl, (res) => {
    res.resume();
    if (res.statusCode && res.statusCode < 500) {
      if (stopping) return;
      const electronCommand = process.platform === 'win32' ? electronBinary : process.execPath;
      const electronArgs = buildElectronArgs({ electronUserDataDir, electronCacheDir, desktopDir });
      const electronSpawnArgs = process.platform === 'win32' ? electronArgs : [electronScript, ...electronArgs];
      electron = spawn(electronCommand, electronSpawnArgs, {
        cwd: desktopDir,
        stdio: 'inherit',
        shell: false,
        env: {
          ...process.env,
          ELECTRON_USER_DATA_DIR: electronUserDataDir,
        },
      });
      electron.on('spawn', () => {
        console.log(`[dev] electron userData: ${electronUserDataDir}`);
      });
      electron.on('exit', (code) => stop(code ?? 0));
      electron.on('error', (error) => {
        console.error('[dev] electron failed to start:', error);
        stop(1);
      });
      return;
    }
    setTimeout(() => waitForVite(remainingMs - 250), 250);
  });
  req.on('error', () => {
    setTimeout(() => waitForVite(remainingMs - 250), 250);
  });
  req.setTimeout(1000, () => {
    req.destroy();
    setTimeout(() => waitForVite(remainingMs - 250), 250);
  });
}

setTimeout(() => waitForVite(120000), 250);

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
