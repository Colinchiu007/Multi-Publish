const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const {
  createDevServerController,
  terminateManagedProcess,
} = require('../src/dev-server-controller');

const scriptPath = path.join(__dirname, '..', 'scripts', 'run-autonomous-e2e.js');

class FakeChild extends EventEmitter {
  constructor(pid = 4242) {
    super();
    this.pid = pid;
    this.exitCode = null;
    this.signalCode = null;
    this.stderr = new EventEmitter();
    this.killCalls = [];
  }

  kill(signal) { this.killCalls.push(signal); }

  finish(code = 0, signal = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('exit', code, signal);
    this.emit('close', code, signal);
  }
}

function createWindowsHarness(overrides = {}) {
  const child = overrides.child || new FakeChild();
  const spawnCalls = [];
  const execCalls = [];
  const controller = createDevServerController({
    cwd: 'C:\\project\\apps\\desktop',
    port: '5173',
    platform: 'win32',
    fetchImpl: async () => ({ ok: true, status: 200 }),
    portProbeImpl: async () => false,
    sleepImpl: async () => {},
    spawnImpl(command, args, options) {
      spawnCalls.push({ command, args, options });
      return child;
    },
    execFileSyncImpl(command, args, options) {
      execCalls.push({ command, args, options });
      child.finish(1, 'SIGTERM');
    },
    ...overrides,
  });

  return { child, controller, execCalls, spawnCalls };
}

describe('自主 E2E Vite 进程控制器', () => {
  it('脚本可被安全加载，且不包含按镜像名终止 Node 的命令', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');

    assert.match(source, /if\s*\(require\.main\s*===\s*module\)/);
    assert.match(source, /createDevServerController/);
    assert.doesNotMatch(source, /taskkill[^\r\n]*\/IM\s+node\.exe/i);
  });

  it('启动时不终止其他进程，并以固定地址和严格端口启动 Vite', async () => {
    const { controller, execCalls, spawnCalls } = createWindowsHarness();

    await controller.start();

    assert.equal(execCalls.length, 0, '启动前不得执行任何 taskkill');
    assert.equal(spawnCalls.length, 1);
    assert.deepEqual(
      spawnCalls[0].args,
      ['vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
    );
    assert.equal(spawnCalls[0].options.cwd, 'C:\\project\\apps\\desktop');
  });

  it('目标端口已被占用时不启动 Vite，也不把旧服务误判为就绪', async () => {
    const { controller, execCalls, spawnCalls } = createWindowsHarness({
      portProbeImpl: async () => true,
    });

    await assert.rejects(controller.start(), /Vite 端口 5173 已被占用/);
    assert.equal(spawnCalls.length, 0);
    assert.equal(execCalls.length, 0);
  });

  it('Windows 清理仅按受管 PID 终止进程树，并且可重复调用', async () => {
    const { controller, execCalls } = createWindowsHarness();
    await controller.start();

    await controller.stop();
    await controller.stop();

    assert.equal(execCalls.length, 1);
    assert.equal(execCalls[0].command.toLowerCase(), 'taskkill');
    assert.deepEqual(execCalls[0].args, ['/PID', '4242', '/T', '/F']);
    assert.doesNotMatch(execCalls[0].args.join(' '), /\/IM|node\.exe/i);
  });

  it('Windows 终止命令和回退均未生效时 fail closed', async () => {
    const child = new FakeChild();

    await assert.rejects(
      terminateManagedProcess(child, {
        platform: 'win32',
        stopTimeoutMs: 5,
        execFileSyncImpl() { throw new Error('Access is denied'); },
      }),
      /无法终止受管进程 PID 4242/,
    );
    assert.deepEqual(child.killCalls, ['SIGTERM']);
  });

  it('Vite 在就绪前退出时立即失败并带出 stderr', async () => {
    const child = new FakeChild();
    const { controller } = createWindowsHarness({
      child,
      fetchImpl: async () => new Promise(() => {}),
      execFileSyncImpl() {},
      spawnImpl() {
        queueMicrotask(() => {
          child.stderr.emit('data', Buffer.from('Error: Port 5173 is already in use'));
          child.finish(1, null);
        });
        return child;
      },
    });

    await assert.rejects(controller.start(), (error) => {
      assert.match(error.message, /Port 5173 is already in use/);
      assert.match(error.message, /退出码 1/);
      return true;
    });
  });

  it('HTTP 探针悬空时仍遵守启动超时并清理受管进程', async () => {
    const child = new FakeChild();
    const execCalls = [];
    const controller = createDevServerController({
      cwd: 'C:\\project\\apps\\desktop',
      port: '5173',
      platform: 'win32',
      maxWaitMs: 20,
      pollIntervalMs: 1,
      fetchImpl: async () => new Promise(() => {}),
      portProbeImpl: async () => false,
      spawnImpl: () => child,
      execFileSyncImpl(command, args) {
        execCalls.push({ command, args });
        child.finish(1, 'SIGTERM');
      },
    });

    const guard = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('测试等待超时')), 500);
    });
    await assert.rejects(
      Promise.race([controller.start(), guard]),
      /Vite 未能在 1s 内启动/,
    );
    assert.equal(execCalls.length, 1, '启动超时后必须清理受管进程');
  });

  it('Windows 真实清理不会终止无关 Node 进程', { skip: process.platform !== 'win32' }, async (t) => {
    const idleScript = 'setInterval(() => {}, 1000)';
    const sentinel = spawn(process.execPath, ['-e', idleScript], { stdio: 'ignore' });
    const managed = spawn(process.execPath, ['-e', idleScript], { stdio: 'ignore' });

    t.after(async () => {
      await terminateManagedProcess(sentinel, { platform: 'win32' });
      await terminateManagedProcess(managed, { platform: 'win32' });
    });

    await terminateManagedProcess(managed, { platform: 'win32' });

    assert.ok(
      managed.exitCode !== null || managed.signalCode !== null,
      '受管进程应退出',
    );
    assert.equal(sentinel.exitCode, null, '无关 Node 进程必须保持运行');
    assert.equal(sentinel.signalCode, null, '无关 Node 进程不得收到终止信号');
    assert.doesNotThrow(() => process.kill(sentinel.pid, 0));
  });
});
