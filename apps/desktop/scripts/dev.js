const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const desktopDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const vitePort = 5174;
const viteUrl = `http://127.0.0.1:${vitePort}`;
const electronUserDataDir = process.env.ELECTRON_USER_DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'multi-publish-electron-dev-'));

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
      const electronArgs = process.platform === 'win32'
        ? [
            `--user-data-dir=${electronUserDataDir}`,
            '--disable-gpu',
            '--disable-gpu-compositing',
            '--disable-gpu-sandbox',
            '--disable-software-rasterizer',
            '--use-gl=swiftshader',
            '--use-angle=swiftshader',
            desktopDir,
          ]
        : [
            electronScript,
            `--user-data-dir=${electronUserDataDir}`,
            '--disable-gpu',
            '--disable-gpu-compositing',
            '--disable-gpu-sandbox',
            '--disable-software-rasterizer',
            '--use-gl=swiftshader',
            '--use-angle=swiftshader',
            desktopDir,
          ];
      electron = spawn(electronCommand, electronArgs, {
        cwd: desktopDir,
        stdio: 'inherit',
        shell: false,
        env: {
          ...process.env,
          ELECTRON_DISABLE_GPU: '1',
          ELECTRON_GPU_SAFE_MODE: '1',
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
