// @ts-check
import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const e2eRunner = require('../../tests/e2e/helpers/run-all')
const routeSuite = require('../../tests/e2e/helpers/route-functional-suite')
const integrationFlows = require('../../tests/e2e/helpers/integration-flows')
const { FunctionalRunner } = require('../../tests/e2e/helpers/functional-runner')
const finalReport = require('../../tests/e2e/helpers/final-report')
const {
  E2EEnvironmentError,
  preflightE2EEnvironment,
  resetPreflightCache,
} = require('../../tests/e2e/helpers/e2e-preflight')

const desktopRoot = path.resolve(__dirname, '../..')
const projectRoot = path.resolve(desktopRoot, '../..')
const fixturePath = path.join(desktopRoot, 'tests/e2e/fixtures/model-providers.json')
const accountFixturePath = path.join(desktopRoot, 'tests/e2e/fixtures/accounts.json')
const ipcMockPath = path.join(desktopRoot, 'tests/e2e/helpers/ipc-mock.js')

function makeReport() {
  return {
    checks: { total: 1, passed: 1, failed: 0 },
    consoleErrors: [],
    pageErrors: [],
  }
}

function makeFinalSubReport(context, overrides = {}) {
  return {
    url: context.url,
    timestamp: '2026-07-22T10:01:00.000Z',
    run: { id: context.id, startedAt: context.startedAt },
    checks: { total: 2, passed: 2, failed: 0 },
    consoleErrors: [],
    pageErrors: [],
    details: [
      { kind: 'expectNoConsoleError', passed: true, errors: [] },
      { kind: 'expectNoPageError', passed: true, errors: [] },
    ],
    ...overrides,
  }
}

function loadProviderMock() {
  const modelProviders = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
  const sandbox = {
    window: { __fixtures: { modelProviders } },
    console,
    Date,
    Promise,
    setTimeout,
    clearTimeout,
  }
  vm.createContext(sandbox)
  vm.runInContext(fs.readFileSync(ipcMockPath, 'utf8'), sandbox)
  return sandbox.window
}

describe('E2E 统一入口门禁', () => {
  afterEach(() => {
    delete process.env.E2E_CONCURRENCY
    resetPreflightCache()
  })

  it('预检成功时同时确认 Vite 可达和 Chromium 可启动', async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    const launch = vi.fn().mockResolvedValue({ close })

    const result = await preflightE2EEnvironment({
      url: 'http://127.0.0.1:5174',
      httpProbe: vi.fn().mockResolvedValue({ status: 200 }),
      chromiumImpl: { launch },
    })

    expect(result).toMatchObject({ ok: true, url: 'http://127.0.0.1:5174' })
    expect(launch).toHaveBeenCalledWith({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('Vite 不可达时标记环境阻塞，不尝试启动 Chromium', async () => {
    const launch = vi.fn()
    const error = new Error('connect ECONNREFUSED')

    await expect(preflightE2EEnvironment({
      url: 'http://127.0.0.1:5174',
      httpProbe: vi.fn().mockRejectedValue(error),
      chromiumImpl: { launch },
    })).rejects.toMatchObject({
      code: 'E2E_ENVIRONMENT_BLOCKED',
      stage: 'vite',
    })
    expect(launch).not.toHaveBeenCalled()
  })

  it('Chromium 启动失败时提供明确的环境阻塞错误', async () => {
    const launchError = new Error('spawn EPERM')

    await expect(preflightE2EEnvironment({
      url: 'http://127.0.0.1:5174',
      httpProbe: vi.fn().mockResolvedValue({ status: 200 }),
      chromiumImpl: { launch: vi.fn().mockRejectedValue(launchError) },
    })).rejects.toMatchObject({
      code: 'E2E_ENVIRONMENT_BLOCKED',
      stage: 'chromium',
      cause: launchError,
    })
  })

  it('统一入口预检失败时不启动路由/流程套件并写入环境报告', async () => {
    const environmentError = new E2EEnvironmentError(
      'Vite 未启动',
      { stage: 'vite', url: 'http://127.0.0.1:5174' },
    )
    const runRoutes = vi.fn()
    const runFlows = vi.fn()
    const buildReport = vi.fn()

    const result = await e2eRunner.main('all', {
      preflight: vi.fn().mockRejectedValue(environmentError),
      runRoutes,
      runFlows,
      buildReport,
      writePreflightReport: vi.fn(),
    })

    expect(result).toMatchObject({ failed: true, environmentBlocked: true })
    expect(runRoutes).not.toHaveBeenCalled()
    expect(runFlows).not.toHaveBeenCalled()
    expect(buildReport).not.toHaveBeenCalled()
  })

  it.each(['abc', '0', '-1', '1.5', 'Infinity'])('拒绝非法或非正并发值 %s', (value) => {
    expect(() => e2eRunner.parseConcurrency(value)).toThrow(/E2E_CONCURRENCY/)
  })

  it.each(['1', '2', '18'])('接受正整数并发值 %s', (value) => {
    expect(e2eRunner.parseConcurrency(value)).toBe(Number(value))
  })

  it('未配置并发值时默认串行，避免多浏览器重复刷新耗尽资源', () => {
    expect(e2eRunner.parseConcurrency()).toBe(1)
  })

  it('执行器不会绕过非法并发配置', async () => {
    process.env.E2E_CONCURRENCY = '0'
    await expect(e2eRunner.runWithConcurrency(['home'], vi.fn())).rejects.toThrow(/E2E_CONCURRENCY/)
  })

  it('未知运行模式必须在入口失败', async () => {
    expect(() => e2eRunner.validateMode('typo')).toThrow(/未知 E2E 模式/)
    await expect(e2eRunner.main('typo')).rejects.toThrow(/未知 E2E 模式/)
  })

  it('空执行结果和预期数量不符必须失败', () => {
    expect(e2eRunner.hasFailures({}, 1)).toBe(true)
    expect(e2eRunner.hasFailures({ home: makeReport() }, 2)).toBe(true)
    expect(e2eRunner.hasFailures({ home: makeReport() }, 1)).toBe(false)
    expect(e2eRunner.hasFailures({ home: { checks: { total: 1, passed: 1 } } }, 1)).toBe(true)
  })

  it('各执行模式声明固定的预期报告数量', () => {
    expect(e2eRunner.expectedResultCount('routes')).toBe(18)
    expect(e2eRunner.expectedResultCount('flows')).toBe(6)
    expect(e2eRunner.expectedResultCount('all')).toBe(24)
    expect(e2eRunner.expectedResultCount('report')).toBe(0)
  })

  it('CLI 默认启用预检，只有显式参数才允许跳过', () => {
    expect(e2eRunner.parseCliOptions([])).toEqual({ mode: 'all', skipPreflight: false })
    expect(e2eRunner.parseCliOptions(['routes', '--skip-preflight'])).toEqual({ mode: 'routes', skipPreflight: true })
  })

  it('报告模式依据汇总失败数返回失败，不能把 0/24 当作成功', async () => {
    const buildReport = vi.fn().mockReturnValue({
      summary: {
        totalChecks: 24,
        totalPassed: 0,
        totalFailed: 24,
        totalConsoleErrors: 0,
        totalPageErrors: 0,
      },
    })

    const result = await e2eRunner.main('report', {
      buildReport,
      runContext: { id: 'report-failed', startedAt: '2026-07-22T10:00:00.000Z' },
    })

    expect(buildReport).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ failed: true, report: expect.any(Object) })
  })

  it('报告模式在没有任何有效检查时也必须失败', async () => {
    const buildReport = vi.fn().mockReturnValue({
      summary: {
        totalChecks: 0,
        totalPassed: 0,
        totalFailed: 0,
        totalConsoleErrors: 0,
        totalPageErrors: 0,
      },
    })

    const result = await e2eRunner.main('report', {
      buildReport,
      runContext: { id: 'report-empty', startedAt: '2026-07-22T10:00:00.000Z' },
    })

    expect(result).toMatchObject({ failed: true, report: expect.any(Object) })
  })

  it('报告模式没有本轮运行上下文时拒绝读取历史报告', async () => {
    const buildReport = vi.fn()

    const result = await e2eRunner.main('report', { buildReport })

    expect(result).toMatchObject({ failed: true, report: null })
    expect(buildReport).not.toHaveBeenCalled()
  })

  it('预检报告使用原子写入并保留环境阻塞详情', () => {
    const filename = path.join(desktopRoot, 'tests/e2e/reports/e2e-preflight-unit.json')
    const error = new E2EEnvironmentError('Chromium 无法启动', {
      stage: 'chromium',
      url: 'http://127.0.0.1:5176',
    })
    const fileSystem = {
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(),
    }

    const report = e2eRunner.writePreflightReport(error, filename, {
      fs: fileSystem,
      random: () => 'unit',
      now: () => 42,
      warn: vi.fn(),
    })

    expect(fileSystem.writeFileSync).toHaveBeenCalledWith(
      `${filename}.42-unit.tmp`,
      expect.stringContaining('E2E_ENVIRONMENT_BLOCKED'),
      'utf8',
    )
    expect(fileSystem.renameSync).toHaveBeenCalledWith(`${filename}.42-unit.tmp`, filename)
    expect(report).toMatchObject({ status: 'ENVIRONMENT_BLOCKED', stage: 'chromium' })
    expect(report.reportWriteError).toBeUndefined()
  })

  it('预检报告写入遭遇 EPERM 时不遮蔽原始环境阻塞', async () => {
    const environmentError = new E2EEnvironmentError('Vite 未启动', {
      stage: 'vite',
      url: 'http://127.0.0.1:5176',
    })
    const writeError = Object.assign(new Error('operation not permitted'), { code: 'EPERM' })
    const fileSystem = {
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(() => { throw writeError }),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(),
    }
    const warn = vi.fn()

    const report = e2eRunner.writePreflightReport(environmentError, 'C:\\locked\\e2e-preflight.json', {
      fs: fileSystem,
      random: () => 'unit',
      now: () => 42,
      warn,
    })
    const result = await e2eRunner.main('all', {
      preflight: vi.fn().mockRejectedValue(environmentError),
      writePreflightReport: () => { throw writeError },
    })

    expect(report).toMatchObject({
      status: 'ENVIRONMENT_BLOCKED',
      code: 'E2E_ENVIRONMENT_BLOCKED',
      stage: 'vite',
      reportWriteError: { code: 'EPERM' },
    })
    expect(warn).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      failed: true,
      environmentBlocked: true,
      error: environmentError,
      preflightReport: {
        status: 'ENVIRONMENT_BLOCKED',
        reportWriteError: { code: 'EPERM' },
      },
    })
  })

  it('预检缓存必须按浏览器启动参数隔离，不能复用不同参数的成功结果', async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    const launch = vi.fn().mockResolvedValue({ close })
    const httpProbe = vi.fn().mockResolvedValue({ status: 200 })
    const options = {
      url: 'http://127.0.0.1:5174',
      httpProbe,
      chromiumImpl: { launch },
    }

    await preflightE2EEnvironment({ ...options, headless: true, browserArgs: ['--first'] })
    await preflightE2EEnvironment({ ...options, headless: false, browserArgs: ['--second'] })

    expect(launch).toHaveBeenCalledTimes(2)
    expect(launch).toHaveBeenNthCalledWith(1, { headless: true, args: ['--first'] })
    expect(launch).toHaveBeenNthCalledWith(2, { headless: false, args: ['--second'] })
  })

  it('Windows 已存在预检报告时以兼容替换策略发布新报告', () => {
    const filename = 'C:\\reports\\e2e-preflight.json'
    const renameError = Object.assign(new Error('destination exists'), { code: 'EEXIST' })
    const fileSystem = {
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      renameSync: vi.fn()
        .mockImplementationOnce(() => { throw renameError })
        .mockImplementationOnce(() => undefined),
      unlinkSync: vi.fn(),
    }

    const report = e2eRunner.writePreflightReport(
      new E2EEnvironmentError('Chromium 无法启动', { stage: 'chromium' }),
      filename,
      { fs: fileSystem, now: () => 42, random: () => 'unit', warn: vi.fn() },
    )

    expect(fileSystem.unlinkSync).toHaveBeenCalledWith(filename)
    expect(fileSystem.renameSync).toHaveBeenNthCalledWith(1, `${filename}.42-unit.tmp`, filename)
    expect(fileSystem.renameSync).toHaveBeenNthCalledWith(2, `${filename}.42-unit.tmp`, filename)
    expect(report.reportWriteError).toBeUndefined()
  })

  it('最终报告拒绝 URL、运行标识或时间窗口不匹配的旧子报告', () => {
    const context = {
      id: 'run-current',
      startedAt: '2026-07-22T10:00:00.000Z',
      url: 'http://127.0.0.1:5174',
    }
    const current = {
      url: context.url,
      timestamp: '2026-07-22T10:01:00.000Z',
      run: { id: context.id, startedAt: context.startedAt },
    }

    expect(finalReport.validateRunReport(current, context)).toEqual({ valid: true })
    expect(finalReport.validateRunReport({ ...current, url: 'http://127.0.0.1:5187' }, context))
      .toMatchObject({ valid: false, reason: 'URL_MISMATCH' })
    expect(finalReport.validateRunReport({ ...current, timestamp: '2026-07-22T09:59:59.000Z' }, context))
      .toMatchObject({ valid: false, reason: 'STALE_REPORT' })
    expect(finalReport.validateRunReport({ ...current, run: { id: 'run-old', startedAt: context.startedAt } }, context))
      .toMatchObject({ valid: false, reason: 'RUN_ID_MISMATCH' })
  })

  it('最终路由汇总把页面错误判为失败，且不把损坏报告计入覆盖率', () => {
    const context = {
      id: 'run-current',
      startedAt: '2026-07-22T10:00:00.000Z',
      url: 'http://127.0.0.1:5174',
    }
    const reports = {
      'home.functional.json': makeFinalSubReport(context, {
        pageErrors: [{ message: '页面运行时错误' }],
        details: [
          { kind: 'expectNoConsoleError', passed: true, errors: [] },
          { kind: 'expectNoPageError', passed: false, errors: ['页面运行时错误'] },
        ],
      }),
      'comments.functional.json': makeFinalSubReport(context, {
        checks: { total: 2, passed: 3, failed: 0 },
      }),
    }

    const coverage = finalReport.aggregateRouteCoverage(context, (filename) => reports[filename] || null)
    const home = coverage.matrix.find((item) => item.spec === 'home')
    const comments = coverage.matrix.find((item) => item.spec === 'comments')

    expect(home).toMatchObject({ status: '❌ FAIL', pageErrors: 1 })
    expect(comments).toMatchObject({ status: 'INVALID_RUN', integrity: 'INVALID_CHECKS' })
    expect(coverage.totals).toMatchObject({ totalPageErrors: 1, coveredRoutes: 1 })
  })

  it('最终集成流汇总把页面错误判为失败并写入总计', () => {
    const context = {
      id: 'run-current',
      startedAt: '2026-07-22T10:00:00.000Z',
      url: 'http://127.0.0.1:5174',
    }
    const reports = {
      'integration.flow-1.json': makeFinalSubReport(context, {
        pageErrors: [{ message: '流程页面错误' }],
      }),
    }

    const coverage = finalReport.aggregateFlowCoverage(context, (filename) => reports[filename] || null)
    const flow = coverage.flows.find((item) => item.key === 'flow-1')

    expect(flow).toMatchObject({ status: '❌ FAIL', pageErrors: 1 })
    expect(coverage.totals).toMatchObject({ totalPageErrors: 1 })
  })

  it('最终报告 CLI 对无效或失败报告必须给出非零退出码', () => {
    expect(finalReport.exitCodeForReport({
      summary: { totalChecks: 0, totalFailed: 0, totalConsoleErrors: 0, totalPageErrors: 0 },
      issues: [],
    })).toBe(1)
    expect(finalReport.exitCodeForReport({
      summary: { totalChecks: 1, totalFailed: 0, totalConsoleErrors: 0, totalPageErrors: 0 },
      issues: [{ severity: 'CRITICAL' }],
    })).toBe(1)
    expect(finalReport.exitCodeForReport({
      summary: { totalChecks: 1, totalFailed: 0, totalConsoleErrors: 0, totalPageErrors: 0 },
      issues: [],
    })).toBe(0)
  })

  it('主入口按运行标识写入独立的预检报告，避免多进程覆盖同一诊断文件', async () => {
    const environmentError = new E2EEnvironmentError('Vite 未启动', {
      stage: 'vite',
      url: 'http://127.0.0.1:5174',
    })
    const writePreflightReport = vi.fn()
    const runContext = { id: 'run / current', startedAt: '2026-07-22T10:00:00.000Z' }

    const result = await e2eRunner.main('all', {
      runContext,
      preflight: vi.fn().mockRejectedValue(environmentError),
      writePreflightReport,
    })

    expect(result).toMatchObject({ failed: true, environmentBlocked: true })
    expect(writePreflightReport).toHaveBeenCalledWith(
      environmentError,
      path.join(desktopRoot, 'tests/e2e/reports/e2e-preflight-run-current.json'),
    )
  })

  it('全量运行把同一运行上下文交给路由、流程和最终报告', async () => {
    const runRoutes = vi.fn().mockResolvedValue(
      Object.fromEntries(Array.from({ length: 18 }, (_, index) => [`route-${index}`, makeReport()])),
    )
    const runFlows = vi.fn().mockResolvedValue(
      Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`flow-${index}`, makeReport()])),
    )
    const buildReport = vi.fn().mockReturnValue({
      summary: { totalChecks: 1, totalPassed: 1, totalFailed: 0, totalConsoleErrors: 0, totalPageErrors: 0 },
      issues: [],
    })
    const context = { id: 'run-current', startedAt: '2026-07-22T10:00:00.000Z' }

    await e2eRunner.main('all', {
      url: 'http://127.0.0.1:5175',
      runContext: context,
      preflight: vi.fn().mockResolvedValue({ ok: true, url: 'http://127.0.0.1:5175' }),
      runRoutes,
      runFlows,
      buildReport,
    })

    const expectedContext = {
      url: 'http://127.0.0.1:5175',
      runId: context.id,
      runStartedAt: context.startedAt,
    }
    expect(runRoutes).toHaveBeenCalledWith(expect.objectContaining(expectedContext))
    expect(runFlows).toHaveBeenCalledWith(expect.objectContaining(expectedContext))
    expect(buildReport).toHaveBeenCalledWith(expect.objectContaining(expectedContext))
  })

  it('预检通过后把同一个 TEST_URL 传给路由、流程和最终报告', async () => {
    const runRoutes = vi.fn().mockResolvedValue(
      Object.fromEntries(Array.from({ length: 18 }, (_, index) => [`route-${index}`, makeReport()])),
    )
    const runFlows = vi.fn().mockResolvedValue(
      Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`flow-${index}`, makeReport()])),
    )
    const buildReport = vi.fn().mockReturnValue({
      summary: {
        totalChecks: 1,
        totalPassed: 1,
        totalFailed: 0,
        totalConsoleErrors: 0,
        totalPageErrors: 0,
      },
    })
    const preflight = vi.fn().mockResolvedValue({ ok: true, url: 'http://127.0.0.1:5175' })

    const result = await e2eRunner.main('all', {
      url: 'http://127.0.0.1:5175',
      preflight,
      runRoutes,
      runFlows,
      buildReport,
    })

    expect(result.failed).toBe(false)
    expect(preflight).toHaveBeenCalledOnce()
    expect(runRoutes).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://127.0.0.1:5175' }))
    expect(runFlows).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://127.0.0.1:5175' }))
    expect(buildReport).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://127.0.0.1:5175' }))
  })
})

describe('根脚本入口门禁', () => {
  it('源代码测试文件不得被 .gitignore 静默排除', () => {
    const ignoredFiles = execFileSync(
      'git',
      [
        'ls-files', '--others', '--ignored', '--exclude-standard', '--',
        ':(glob)apps/desktop/electron/**/*.test.js',
        ':(glob)apps/desktop/src/**/*.test.js',
        ':(glob)apps/desktop/tests/**/*.test.js',
        ':(glob)packages/*/src/**/*.test.js',
        ':(glob)packages/*/test/**/*.test.js',
        ':(glob)packages/*/tests/**/*.test.js',
      ],
      { cwd: projectRoot, encoding: 'utf8' },
    )
      .split(/\r?\n/)
      .filter(Boolean)

    expect(ignoredFiles).toEqual([])
  })

  it('package.json 中直接调用的 Node 脚本必须真实存在', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
    const missing = []

    for (const [name, command] of Object.entries(packageJson.scripts || {})) {
      const matches = command.matchAll(/(?:^|&&|\|\|)\s*node\s+([^\s&|]+\.js)/g)
      for (const match of matches) {
        const relativePath = match[1].replace(/^['"]|['"]$/g, '')
        if (!fs.existsSync(path.resolve(projectRoot, relativePath))) {
          missing.push({ name, relativePath })
        }
      }
    }

    expect(missing).toEqual([])
  })

  it('桌面测试脚本引用的 Vitest 配置必须真实存在', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'))
    const missing = []

    for (const [name, command] of Object.entries(packageJson.scripts || {})) {
      const matches = command.matchAll(/(?:--config|-c)\s+([^\s&|]+\.js)/g)
      for (const match of matches) {
        const relativePath = match[1].replace(/^['"]|['"]$/g, '')
        if (!fs.existsSync(path.resolve(desktopRoot, relativePath))) {
          missing.push({ name, relativePath })
        }
      }
    }

    expect(missing).toEqual([])
  })

  it('循环依赖门禁不得吞掉失败退出码', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))

    expect(packageJson.scripts['check:circular']).not.toMatch(/\|\||non-blocking|WARN/)
  })

  it('依赖检查门禁不得吞掉失败退出码', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))

    expect(packageJson.scripts['check:deps']).not.toMatch(/\|\||non-blocking|WARN/)
  })

  it.each(['build.yml', 'electron-ci.yml'])('%s 的依赖检查失败必须阻止流水线', (workflow) => {
    const source = fs.readFileSync(path.join(projectRoot, '.github/workflows', workflow), 'utf8')
    const dependencyStep = source.match(/- name: Dependency check[\s\S]*?(?=\n\s+- name:|$)/)?.[0] || ''

    expect(dependencyStep).not.toContain('continue-on-error')
    expect(dependencyStep).toContain('npm run check:deps')
  })
})

describe('覆盖率与变异测试门禁', () => {
  it('Stryker 使用 Windows 兼容的原地模式并覆盖核心重构文件', () => {
    const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'stryker.conf.json'), 'utf8'))

    expect(config.inPlace).toBe(true)
    expect(config.mutate).toEqual(expect.arrayContaining([
      'apps/desktop/electron/core/**/*.js',
      'apps/desktop/electron/bootstrap/**/*.js',
      'apps/desktop/electron/bootstrap.js',
      'apps/desktop/electron/main.js',
      'apps/desktop/electron/window.js',
      'apps/desktop/electron/shutdown.js',
      'packages/shared-utils/src/scheduler.js',
      '!**/*.test.js',
      '!**/*.spec.js',
    ]))
  })

  it('Stryker 专用配置不再排除已经验证可运行的有效测试套件', () => {
    const configSource = fs.readFileSync(path.join(desktopRoot, 'vitest.stryker.config.js'), 'utf8')
    const validSuites = [
      'ai-generator.test.js',
      'api-platform-adapter.test.js',
      'composition-manager.test.js',
      'pipeline-engine.test.js',
      'service-bus-plugin-registry.test.js',
      'stage-executor-publish.test.js',
      'stage-executor.test.js',
      'video-engine.test.js',
    ]

    for (const suite of validSuites) expect(configSource).not.toContain(`electron/tests/${suite}`)
  })
})

describe('路由通用扫描', () => {
  it('FunctionalRunner 默认继承 TEST_URL', () => {
    const previous = process.env.TEST_URL
    process.env.TEST_URL = 'http://127.0.0.1:5175'
    try {
      expect(new FunctionalRunner().url).toBe('http://127.0.0.1:5175')
      expect(new FunctionalRunner({ url: 'http://127.0.0.1:5176' }).url).toBe('http://127.0.0.1:5176')
    } finally {
      if (previous === undefined) delete process.env.TEST_URL
      else process.env.TEST_URL = previous
    }
  })

  it('FunctionalRunner 将本轮运行上下文写入子报告', () => {
    const runner = new FunctionalRunner({
      url: 'http://127.0.0.1:5175',
      runId: 'run-current',
      runStartedAt: '2026-07-22T10:00:00.000Z',
    })

    expect(runner.generateReport()).toMatchObject({
      url: 'http://127.0.0.1:5175',
      run: { id: 'run-current', startedAt: '2026-07-22T10:00:00.000Z' },
    })
  })

  it('发布正文等待编辑器初始化并确认内容写入', async () => {
    let value = ''
    const editor = {
      first: vi.fn(function first() { return this }),
      waitFor: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn(async (nextValue) => { value = nextValue }),
      evaluate: vi.fn(async () => value),
    }
    const page = {
      locator: vi.fn((selector) => {
        expect(selector).toContain('.ql-editor[contenteditable="true"]')
        expect(selector).toContain('textarea.md-editor')
        return editor
      }),
    }

    await expect(routeSuite.fillPublishBody(page, '正文内容')).resolves.toBe(true)
    expect(editor.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 5000 })
    expect(editor.fill).toHaveBeenCalledWith('正文内容')
    expect(editor.evaluate).toHaveBeenCalledTimes(1)
  })

  it('发布正文编辑器初始化超时时返回失败而不抛错', async () => {
    const timeout = new Error('editor timeout')
    timeout.name = 'TimeoutError'
    const editor = {
      first: vi.fn(function first() { return this }),
      waitFor: vi.fn().mockRejectedValue(timeout),
      fill: vi.fn(),
      evaluate: vi.fn(),
    }
    const page = { locator: vi.fn(() => editor) }

    await expect(routeSuite.fillPublishBody(page, '正文内容')).resolves.toBe(false)
    expect(editor.fill).not.toHaveBeenCalled()
  })

  it('合法重定向按目标路由等待应用就绪', async () => {
    const runner = new FunctionalRunner()
    runner.page = { goto: vi.fn().mockResolvedValue(undefined) }
    runner.waitForAppReady = vi.fn().mockResolvedValue(undefined)

    await runner.goto('/create/pipeline', { expectedRoute: '/create' })

    expect(runner.waitForAppReady).toHaveBeenCalledWith('/create')
  })

  it('重置路由使用唯一地址完成且仅完成一次全页导航', async () => {
    const runner = new FunctionalRunner()
    runner.goto = vi.fn().mockResolvedValue(undefined)
    runner.waitForAppReady = vi.fn().mockResolvedValue(undefined)
    runner.page = {
      goto: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    }

    await runner.resetToRoute('/create/pipeline', { expectedRoute: '/create' })

    expect(runner.goto).not.toHaveBeenCalled()
    expect(runner.page.goto).toHaveBeenCalledWith(
      'http://127.0.0.1:5174/?__e2e_reset=1#/create/pipeline',
      { waitUntil: 'domcontentloaded', timeout: 20000 },
    )
    expect(runner.page.reload).not.toHaveBeenCalled()
    expect(runner.waitForAppReady).toHaveBeenCalledWith('/create')
  })

  it('扫描任何控件前先完整重置到定义路由', async () => {
    const emptyCollection = {
      evaluateAll: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    }
    const r = {
      checks: [],
      goto: vi.fn().mockResolvedValue(undefined),
      resetToRoute: vi.fn().mockResolvedValue(undefined),
      page: { locator: vi.fn(() => emptyCollection) },
    }

    await routeSuite.auditInitialControls(r, { route: '/accounts' })

    expect(r.resetToRoute).toHaveBeenCalledWith('/accounts', { expectedRoute: '/accounts' })
    expect(r.page.locator.mock.invocationCallOrder[0]).toBeGreaterThan(r.resetToRoute.mock.invocationCallOrder[0])
  })

  it('每个初始按钮都在重置后的页面状态中单独执行', async () => {
    const button = {
      count: vi.fn().mockResolvedValue(1),
      isDisabled: vi.fn().mockResolvedValue(false),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const buttons = {
      evaluateAll: vi.fn().mockResolvedValue([{ index: 0, text: '打开弹窗', disabled: false }]),
      nth: vi.fn().mockReturnValue(button),
    }
    const emptyCollection = {
      evaluateAll: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    }
    const r = {
      checks: [],
      goto: vi.fn().mockResolvedValue(undefined),
      resetToRoute: vi.fn().mockResolvedValue(undefined),
      page: {
        locator: vi.fn((selector) => selector === '.cohere-main button' ? buttons : emptyCollection),
      },
    }

    await routeSuite.auditInitialControls(r, { route: '/accounts' })

    expect(r.resetToRoute).toHaveBeenCalledWith('/accounts', { expectedRoute: '/accounts' })
    expect(button.click).toHaveBeenCalledTimes(1)
  })

  it('重复文本按钮优先使用各自的 data-testid 重新定位', async () => {
    const firstButton = {
      count: vi.fn().mockResolvedValue(1),
      isDisabled: vi.fn().mockResolvedValue(false),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const secondButton = {
      count: vi.fn().mockResolvedValue(1),
      isDisabled: vi.fn().mockResolvedValue(false),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const buttons = {
      evaluateAll: vi.fn().mockResolvedValue([
        { index: 0, text: '验证', testid: 'check-account-a', disabled: false },
        { index: 1, text: '验证', testid: 'check-account-b', disabled: false },
      ]),
      nth: vi.fn(),
    }
    const emptyCollection = {
      evaluateAll: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    }
    const r = {
      checks: [],
      resetToRoute: vi.fn().mockResolvedValue(undefined),
      page: {
        locator: vi.fn((selector) => {
          if (selector === '.cohere-main button') return buttons
          if (selector === '.cohere-main button[data-testid="check-account-a"]') return firstButton
          if (selector === '.cohere-main button[data-testid="check-account-b"]') return secondButton
          return emptyCollection
        }),
      },
    }

    await routeSuite.auditInitialControls(r, { route: '/accounts' })

    expect(firstButton.click).toHaveBeenCalledTimes(1)
    expect(secondButton.click).toHaveBeenCalledTimes(1)
    expect(buttons.nth).not.toHaveBeenCalled()
  })

  it('按钮在重渲染中失效时仅重新加载并重试一次', async () => {
    const button = {
      isDisabled: vi.fn().mockResolvedValue(false),
      click: vi.fn()
        .mockRejectedValueOnce(new Error('Element is not attached to the DOM'))
        .mockResolvedValueOnce(undefined),
    }
    const buttons = {
      evaluateAll: vi.fn().mockResolvedValue([
        { index: 0, text: '验证', testid: 'check-account-a', disabled: false },
      ]),
      nth: vi.fn(),
    }
    const emptyCollection = {
      evaluateAll: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    }
    const r = {
      checks: [],
      resetToRoute: vi.fn().mockResolvedValue(undefined),
      page: {
        locator: vi.fn((selector) => {
          if (selector === '.cohere-main button') return buttons
          if (selector === '.cohere-main button[data-testid="check-account-a"]') return button
          return emptyCollection
        }),
      },
    }

    await routeSuite.auditInitialControls(r, { route: '/accounts' })

    expect(button.click).toHaveBeenCalledTimes(2)
    expect(r.checks.find(item => item.name === '初始可用按钮均完成点击扫描')).toMatchObject({ passed: true })
  })

  it('任一初始可编辑字段失败时扫描失败并保留字段详情', async () => {
    const descriptors = [
      { index: 0, tag: 'input', type: 'text', visible: true, disabled: false, placeholder: '标题', name: 'title', testid: 'title' },
      { index: 1, tag: 'textarea', type: '', visible: true, disabled: false, placeholder: '正文', name: 'content', testid: 'content' },
    ]
    const fields = [
      { fill: vi.fn().mockResolvedValue(undefined) },
      { fill: vi.fn().mockRejectedValue(new Error('字段被遮挡')) },
    ]
    const collection = {
      evaluateAll: vi.fn().mockResolvedValue(descriptors),
      nth: vi.fn((index) => fields[index]),
    }
    const r = {
      checks: [],
      page: { locator: vi.fn(() => collection) },
    }

    const result = await routeSuite.auditInitialFields(r)

    expect(result.passed).toBe(false)
    expect(result.details).toMatchObject({ fieldCount: 2, editableCount: 2, exercised: 1 })
    expect(result.details.failures).toEqual([
      expect.objectContaining({ index: 1, type: '', placeholder: '正文', error: '字段被遮挡' }),
    ])
    expect(r.checks.at(-1)).toMatchObject({
      name: '全部初始可编辑表单字段完成输入扫描',
      passed: false,
    })
  })
})

describe('模型服务商 E2E 契约', () => {
  it('fixture 和创建响应全面使用 snake_case', async () => {
    const modelProviders = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
    for (const provider of modelProviders.providers) {
      expect(Object.keys(provider).every((key) => /^[a-z][a-z0-9_]*$/.test(key))).toBe(true)
      expect(provider).not.toHaveProperty('createdAt')
      expect(provider).not.toHaveProperty('isDefault')
      expect(provider).not.toHaveProperty('isPreset')
    }

    const mockWindow = loadProviderMock()
    const response = await mockWindow.electronAPI.modelProviderCreate({
      name: '自定义服务商',
      category: 'llm',
      base_url: 'https://example.com/v1',
      api_key: 'sk-test',
    })

    expect(response.code).toBe(0)
    expect(response.data).toMatchObject({ is_default: false, is_preset: false })
    expect(response.data.created_at).toEqual(expect.any(String))
    expect(Object.keys(response.data).every((key) => /^[a-z][a-z0-9_]*$/.test(key))).toBe(true)
    expect(response.data).not.toHaveProperty('isDefault')
    expect(response.data).not.toHaveProperty('createdAt')
  })

  it('设为默认后重读列表时只有目标服务商是默认项', async () => {
    const mockWindow = loadProviderMock()

    await mockWindow.electronAPI.modelProviderSetDefault('llm', 'preset_anthropic')
    const response = await mockWindow.electronAPI.modelProviderList('llm')
    const defaults = response.data.filter((provider) => provider.is_default)

    expect(defaults).toHaveLength(1)
    expect(defaults[0].id).toBe('preset_anthropic')
    const presets = await mockWindow.electronAPI.modelProviderPresets('llm')
    expect(presets.data.length).toBeGreaterThan(0)
    expect(presets.data.every((provider) => provider.is_preset)).toBe(true)
  })

  it('Flow 3 根据重读列表验证唯一默认项', async () => {
    const r = makeFlow3Runner({
      providers: [
        { id: 'preset_openai', category: 'llm', is_default: true },
        { id: 'preset_anthropic', category: 'llm', is_default: true },
      ],
      configuredCalls: 1,
    })

    await integrationFlows.flows['flow-3'].exercise(r)

    expect(r.checks.find((check) => check.name.includes('唯一默认服务商'))).toMatchObject({ passed: false })
  })

  it('Flow 3 的 AI 配置检查不能在零次 IPC 调用时硬编码通过', async () => {
    const r = makeFlow3Runner({
      providers: [{ id: 'preset_anthropic', category: 'llm', is_default: true }],
      configuredCalls: 0,
    })

    await integrationFlows.flows['flow-3'].exercise(r)

    expect(r.checks.find((check) => check.name.includes('AI 服务商'))).toMatchObject({ passed: false })
  })

  it('Flow 3 等待 AI 面板可见和配置 IPC 后通过正常路径', async () => {
    const r = makeFlow3Runner({
      providers: [{ id: 'preset_anthropic', category: 'llm', is_default: true }],
      configuredCalls: 1,
    })

    await integrationFlows.flows['flow-3'].exercise(r)

    expect(r.checks.find((check) => check.name.includes('AI 写作面板'))).toMatchObject({
      passed: true,
      details: { aiPanelOpened: true, aiPanelVisible: true },
    })
    expect(r.checks.find((check) => check.name.includes('AI 服务商'))).toMatchObject({ passed: true })
  })
})

describe('账号 E2E 契约', () => {
  it('账号 fixture 全面使用 snake_case 时间字段', () => {
    const accounts = JSON.parse(fs.readFileSync(accountFixturePath, 'utf8')).accounts

    expect(accounts.length).toBeGreaterThan(0)
    for (const account of accounts) {
      expect(account).toHaveProperty('created_at')
      expect(account).not.toHaveProperty('createdAt')
    }
  })

  it('新增账号响应与生产序列化字段一致', async () => {
    const mockWindow = loadProviderMock()
    const response = await mockWindow.electronAPI.accountAdd('weibo')

    expect(response).toMatchObject({ code: 0 })
    expect(response.data).toHaveProperty('created_at')
    expect(response.data).not.toHaveProperty('createdAt')
  })
})

describe('平台定义 E2E 契约', () => {
  it('IPC mock 与生产 platform:definitions 返回结构一致', async () => {
    const mockWindow = loadProviderMock()
    const response = await mockWindow.electronAPI.getPlatformDefinitions()

    expect(response).toMatchObject({
      code: 0,
      data: {
        names: expect.any(Object),
        icons: expect.any(Object),
        content_categories: expect.any(Object),
        categories: expect.any(Object),
        dashboardUrls: expect.any(Object),
        qrCodePlatforms: expect.anything(),
      },
    })
    expect(response.data.names.wechat_mp).toBe('微信公众号')
    expect(response.data.icons.douyin).toBe('🎵')
    expect(Array.isArray(response.data.qrCodePlatforms)).toBe(true)

    const accountPlatforms = new Set(
      JSON.parse(fs.readFileSync(accountFixturePath, 'utf8')).accounts.map(account => account.platform),
    )
    for (const platform of accountPlatforms) {
      expect(response.data.names).toHaveProperty(platform)
      expect(response.data.icons).toHaveProperty(platform)
    }
  })
})

function makeFlow3Runner({ providers, configuredCalls }) {
  const clickable = {
    count: vi.fn().mockResolvedValue(1),
    isVisible: vi.fn().mockResolvedValue(true),
    click: vi.fn().mockResolvedValue(undefined),
  }
  const page = {
    evaluate: vi.fn(async (callback) => {
      const source = String(callback)
      if (source.includes('modelProviderSetDefault')) return { code: 0 }
      if (source.includes('modelProviderList')) return { code: 0, data: providers }
      return null
    }),
    locator: vi.fn((selector) => {
      if (selector === '.provider-card') return { count: vi.fn().mockResolvedValue(1) }
      if (selector === 'body') return { innerText: vi.fn().mockResolvedValue('AI 辅助写作') }
      return { first: vi.fn(() => clickable) }
    }),
  }
  return {
    page,
    checks: [],
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    getIpcCalls: vi.fn(async (method) => {
      if (method === 'modelProviderSetDefault') return 1
      if (method === 'modelProviderIsConfigured') return configuredCalls
      if (method === 'aiListProviders') return configuredCalls
      return 0
    }),
  }
}
