const { spawn, execFileSync } = require('node:child_process');
const net = require('node:net');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = '5173';
const DEFAULT_MAX_WAIT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_STOP_TIMEOUT_MS = 5_000;

function normalizePort(port) {
  const value = Number(port ?? DEFAULT_PORT);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`无效的 Vite 端口: ${port}`);
  }
  return String(value);
}

function isExited(child) {
  return !child || child.exitCode !== null || child.signalCode !== null;
}

function isTcpPortListening(options) {
  const timeoutMs = options.timeoutMs ?? 500;
  return new Promise((resolve) => {
    let settled = false;
    const socket = net.createConnection({ host: options.host, port: options.port });
    const finish = (listening) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(listening);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

function waitForExit(child, timeoutMs) {
  if (isExited(child)) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      child.removeListener('close', onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once('exit', onExit);
    child.once('close', onExit);
  });
}

async function terminateManagedProcess(child, options = {}) {
  if (isExited(child)) return;

  const platform = options.platform || process.platform;
  const execFileSyncImpl = options.execFileSyncImpl || execFileSync;
  const killProcessGroupImpl = options.killProcessGroupImpl || process.kill.bind(process);
  const stopTimeoutMs = options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS;

  if (platform === 'win32' && child.pid) {
    try {
      execFileSyncImpl('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch (_) {
      if (!isExited(child)) child.kill?.('SIGTERM');
    }
  } else if (child.pid) {
    try {
      killProcessGroupImpl(-child.pid, 'SIGTERM');
    } catch (_) {
      if (!isExited(child)) child.kill?.('SIGTERM');
    }
  } else {
    child.kill?.('SIGTERM');
  }

  let exited = await waitForExit(child, stopTimeoutMs);
  if (!exited && platform !== 'win32' && child.pid) {
    try {
      killProcessGroupImpl(-child.pid, 'SIGKILL');
    } catch (_) {
      if (!isExited(child)) child.kill?.('SIGKILL');
    }
    exited = await waitForExit(child, stopTimeoutMs);
  }
  if (!exited && !isExited(child)) {
    throw new Error(`无法终止受管进程 PID ${child.pid ?? '未知'}`);
  }
}

function createStartupFailure(child, stderr) {
  const detail = stderr.trim();
  const status = child.signalCode
    ? `信号 ${child.signalCode}`
    : `退出码 ${child.exitCode ?? '未知'}`;
  return new Error(`Vite 在就绪前退出（${status}）${detail ? `\n${detail}` : ''}`);
}

async function waitForReady(child, options) {
  const {
    fetchImpl,
    maxWaitMs,
    onStderr,
    pollIntervalMs,
    sleepImpl,
    url,
  } = options;
  if (isExited(child)) throw createStartupFailure(child, '');

  let stderr = '';
  let rejectExited;
  const abortController = new AbortController();
  const timeoutSeconds = Math.max(1, Math.ceil(maxWaitMs / 1_000));
  let deadlineTimer;

  const exited = new Promise((_, reject) => {
    rejectExited = reject;
  });
  exited.catch(() => {});
  const deadlineExceeded = new Promise((_, reject) => {
    deadlineTimer = setTimeout(() => {
      abortController.abort();
      reject(new Error(`Vite 未能在 ${timeoutSeconds}s 内启动: ${url}`));
    }, maxWaitMs);
  });
  deadlineExceeded.catch(() => {});

  const onData = (chunk) => {
    const text = chunk.toString();
    stderr = `${stderr}${text}`.slice(-4_000);
    onStderr?.(text);
  };
  const onError = (error) => rejectExited(new Error(`Vite 进程启动失败: ${error.message}`));
  const onExit = () => rejectExited(createStartupFailure(child, stderr));

  child.stderr?.on('data', onData);
  child.once('error', onError);
  child.once('exit', onExit);

  const deadline = Date.now() + maxWaitMs;
  try {
    while (Date.now() < deadline) {
      const probe = Promise.resolve()
        .then(() => fetchImpl(url, { method: 'HEAD', signal: abortController.signal }))
        .then(response => Boolean(response && (response.ok || response.status === 304)))
        .catch(() => false);
      const ready = await Promise.race([probe, exited, deadlineExceeded]);
      if (ready) return;

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await Promise.race([
        sleepImpl(Math.min(pollIntervalMs, remaining)),
        exited,
        deadlineExceeded,
      ]);
    }
    throw new Error(`Vite 未能在 ${timeoutSeconds}s 内启动: ${url}`);
  } finally {
    clearTimeout(deadlineTimer);
    abortController.abort();
    child.stderr?.removeListener('data', onData);
    child.removeListener('error', onError);
    child.removeListener('exit', onExit);
  }
}

function createDevServerController(options = {}) {
  const platform = options.platform || process.platform;
  const host = options.host || DEFAULT_HOST;
  const port = normalizePort(options.port);
  const url = `http://${host}:${port}`;
  const spawnImpl = options.spawnImpl || spawn;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const portProbeImpl = options.portProbeImpl || isTcpPortListening;
  const sleepImpl = options.sleepImpl || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  let managedProcess = null;
  let stopPromise = null;

  if (typeof fetchImpl !== 'function') throw new Error('当前 Node.js 不支持 fetch');
  if (!options.cwd) throw new Error('Vite 工作目录不能为空');

  async function stop() {
    if (stopPromise) return stopPromise;
    if (!managedProcess) return;

    const child = managedProcess;
    managedProcess = null;
    stopPromise = terminateManagedProcess(child, {
      platform,
      execFileSyncImpl: options.execFileSyncImpl,
      killProcessGroupImpl: options.killProcessGroupImpl,
      stopTimeoutMs: options.stopTimeoutMs,
    }).finally(() => {
      stopPromise = null;
    });
    return stopPromise;
  }

  async function start() {
    if (managedProcess && !isExited(managedProcess)) return { process: managedProcess, url };
    if (stopPromise) await stopPromise;
    if (await portProbeImpl({ host, port: Number(port) })) {
      throw new Error(`Vite 端口 ${port} 已被占用: ${host}`);
    }

    const viteArgs = ['vite', '--host', host, '--port', port, '--strictPort'];
    managedProcess = spawnImpl('npx', viteArgs, {
      cwd: options.cwd,
      detached: platform !== 'win32',
      shell: platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
      await waitForReady(managedProcess, {
        fetchImpl,
        maxWaitMs,
        onStderr: options.onStderr,
        pollIntervalMs,
        sleepImpl,
        url,
      });
      return { process: managedProcess, url };
    } catch (error) {
      await stop();
      throw error;
    }
  }

  return {
    get process() { return managedProcess; },
    start,
    stop,
    url,
  };
}

module.exports = {
  createDevServerController,
  terminateManagedProcess,
};
