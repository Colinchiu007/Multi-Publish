const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const {
  PROJECT_ROOT,
  assert,
  getResults,
  resetResults,
} = require('./test-helpers');
const { isIgnorableConsoleError, resolveGuiExitCode } = require('./electron-gui-v9');

const WORKFLOW_DIR = path.join(PROJECT_ROOT, '.github', 'workflows');

function readWorkflow(name) {
  const source = fs.readFileSync(path.join(WORKFLOW_DIR, name), 'utf8');
  return { source, workflow: yaml.load(source) };
}

function workflowSteps(workflow) {
  return Object.values(workflow.jobs).flatMap((job) => job.steps || []);
}

describe('GUI CI 退出码契约', () => {
  beforeEach(() => {
    resetResults();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('从真实测试配置定位项目根目录', () => {
    const expectedRoot = path.resolve(__dirname, '../../..').replace(/\\/g, '/');

    expect(PROJECT_ROOT).toBe(expectedRoot);
  });

  it('存在失败断言时返回非零退出码', () => {
    assert('失败断言', false);

    expect(resolveGuiExitCode({ results: getResults() })).toBe(1);
  });

  it.each([
    ['控制台错误', { consoleErrors: ['渲染进程报错'] }],
    ['页面错误', { pageErrors: [new Error('未捕获异常')] }],
    ['运行异常', { runnerError: new Error('测试执行失败') }],
  ])('%s会返回非零退出码', (_name, errors) => {
    expect(resolveGuiExitCode({
      results: getResults(),
      ...errors,
    })).toBe(1);
  });

  it('断言和运行过程均无错误时返回零退出码', () => {
    assert('成功断言', true);

    expect(resolveGuiExitCode({ results: getResults() })).toBe(0);
  });

  it('只忽略 CI 环境已知的 Chromium/网络噪声', () => {
    expect(isIgnorableConsoleError("Request Autofill.enable failed. {'code':-32601}"))
      .toBe(true);
    expect(isIgnorableConsoleError('Failed to load resource: net::ERR_NETWORK_ACCESS_DENIED'))
      .toBe(true);
    expect(isIgnorableConsoleError('Error: 许可证权限不足'))
      .toBe(false);
  });

  it('没有执行任何断言时返回非零退出码', () => {
    expect(resolveGuiExitCode({ results: getResults() })).toBe(1);
  });

  it('runner 使用 exitCode，并保留异步关闭机会', () => {
    const runnerPath = path.join(__dirname, 'electron-gui-v9.js');
    const source = fs.readFileSync(runnerPath, 'utf8');
    const closeIndex = source.indexOf('await app.close()');
    const exitCodeIndex = source.indexOf('process.exitCode');

    expect(closeIndex).toBeGreaterThan(-1);
    expect(exitCodeIndex).toBeGreaterThan(closeIndex);
    expect(source).toContain('window.on("pageerror"');
    expect(source).toContain('message.type() === "error" && !isIgnorableConsoleError');
    expect(source).toContain(
      'resolveGuiExitCode({ results, consoleErrors, pageErrors, runnerError })',
    );
    expect(source).not.toMatch(/process\.exit\s*\(/);
  });

  it('runner 在查找主窗口前监听所有新窗口的启动期错误', () => {
    const source = fs.readFileSync(path.join(__dirname, 'electron-gui-v9.js'), 'utf8');
    const listenerIndex = source.indexOf('app.on("window"');
    const findWindowIndex = source.indexOf('await findMainWindow(app)');

    expect(listenerIndex).toBeGreaterThan(-1);
    expect(findWindowIndex).toBeGreaterThan(listenerIndex);
  });
});

describe('GUI/CI 工作流门禁契约', () => {
  const workflowNames = [
    'build.yml',
    'electron-ci.yml',
    'gui-test.yml',
    'quality-gate.yml',
  ];

  it.each(workflowNames)('%s 是结构完整的 GitHub Actions 工作流', (name) => {
    const { workflow } = readWorkflow(name);

    expect(workflow).toHaveProperty('on');
    expect(workflow).toHaveProperty('jobs');
    expect(Object.keys(workflow.jobs).length).toBeGreaterThan(0);
  });

  it.each(workflowNames)('%s 的门禁步骤不允许 continue-on-error', (name) => {
    const { workflow } = readWorkflow(name);

    expect(workflowSteps(workflow).filter((step) => step['continue-on-error'] === true)).toEqual([]);
  });

  it('GUI 工作流分层执行浏览器 E2E 和 Electron GUI 门禁', () => {
    const { source } = readWorkflow('gui-test.yml');

    expect(source).toContain('- name: Start Vite server');
    expect(source).toContain('- name: Browser E2E gates');
    expect(source).toContain('- name: Electron GUI gate');
    expect(source).toContain('- name: Stop Vite server');
    expect(source).toContain('npm run test:e2e');
    expect(source).toContain('node apps/desktop/tests/electron-gui-v9.js');
    expect(source).not.toMatch(/electron-gui-v9\.js\s*\|\|/);
    expect(source).not.toMatch(/e2e-smoke\.js;\s*echo/);
  });

  it('GUI 工作流在自身、依赖清单和共享包变化时也会触发', () => {
    const { workflow } = readWorkflow('gui-test.yml');
    const pullRequestPaths = workflow.on.pull_request.paths;

    expect(pullRequestPaths).toEqual(expect.arrayContaining([
      '.github/workflows/gui-test.yml',
      'package.json',
      'package-lock.json',
      'packages/**',
    ]));
  });

  it('质量门禁执行真实 E2E 和视觉测试，并且只清理自己启动的服务', () => {
    const { source } = readWorkflow('quality-gate.yml');

    expect(source).toMatch(/npm(?:\.cmd)? run test:e2e -w @multi-publish\/desktop/);
    expect(source).toMatch(/npm(?:\.cmd)? run test:visual:pixel/);
    expect(source).not.toContain('taskkill /F /IM node.exe');
    expect(source).toMatch(/taskkill \/PID .*\/T \/F/);
  });

  it('质量门禁不会掩盖 Playwright 安装和 Vue 构建失败', () => {
    const { source } = readWorkflow('quality-gate.yml');

    expect(source).toMatch(/playwright install chromium[\s\S]{0,180}\$LASTEXITCODE/);
    expect(source).toMatch(/npm(?:\.cmd)? run build:vue[\s\S]{0,180}\$LASTEXITCODE/);
  });

  it('Windows 原生命令统一手动捕获退出码，不受 PowerShell 版本默认值影响', () => {
    const { workflow } = readWorkflow('quality-gate.yml');
    const steps = workflow.jobs.gate.steps;
    const guardedStepNames = [
      'Gate 7 - Visual regression',
      'Gate 8 - Browser E2E',
      'Gate 9 - Autonomous coverage audit',
    ];

    for (const name of guardedStepNames) {
      const step = steps.find((candidate) => candidate.name === name);
      expect(step.run).toContain('$PSNativeCommandUseErrorActionPreference = $false');
    }
  });

  it('Electron 冒烟测试只把超时存活视为成功', () => {
    const { source } = readWorkflow('electron-ci.yml');

    expect(source).not.toContain('|| true');
    expect(source).toContain('status=$?');
    expect(source).toContain('"$status" -eq 124');
    expect(source).toContain('exit "$status"');
  });

  it('Electron 自托管任务锁定 Linux runner，避免被 Windows runner 误接收', () => {
    const { workflow } = readWorkflow('electron-ci.yml');

    expect(workflow.jobs['electron-tests']['runs-on']).toEqual(['self-hosted', 'linux', 'x64']);
  });

  it('Electron CI 在运行 Vitest 前显式安装开发依赖和 Electron 运行时', () => {
    const { workflow } = readWorkflow('electron-ci.yml');
    const steps = workflow.jobs['electron-tests'].steps;
    const dependencySteps = steps.filter((step) => step.name === 'Install dependencies');
    const electronSteps = steps.filter((step) => step.name === 'Install Electron runtime');
    const testSteps = steps.filter((step) => step.name === 'Unit tests (Vitest, non-Electron)');

    expect(dependencySteps).toHaveLength(1);
    expect(electronSteps).toHaveLength(1);
    expect(testSteps).toHaveLength(1);
    expect(dependencySteps[0].run.trim()).toBe('npm ci --include=dev');
    expect(electronSteps[0].run.trim()).toBe('node node_modules/electron/install.js');

    const dependencyIndex = steps.indexOf(dependencySteps[0]);
    const electronIndex = steps.indexOf(electronSteps[0]);
    const testIndex = steps.indexOf(testSteps[0]);

    expect(dependencyIndex).toBeLessThan(electronIndex);
    expect(electronIndex).toBeLessThan(testIndex);
  });

  it('自主审计成功分支不会继续写入基础设施失败状态', () => {
    const { source } = readWorkflow('quality-gate.yml');

    expect(source).toMatch(/if \(\$exitCode -eq 0\)[\s\S]{0,300}exit 0/);
  });

  it('构建工作流的 Gitee 发布脚本完整且不吞掉上传失败', () => {
    const { source } = readWorkflow('build.yml');

    expect(source).toMatch(/tag_name\\?":\\?"\$\{TAG\}/);
    expect(source).toContain('/attach_files');
    expect(source).toMatch(/release_id=.*node/);
    expect(source).toContain('${RELEASE_API}/${release_id}/attach_files');
    expect(source).not.toContain('${RELEASE_API}/${TAG}/attach_files');
    expect(source).toContain('echo "Gitee sync completed"');
    expect(source).not.toMatch(/\|\|\s*echo\s+"Failed to upload/);
  });
});
