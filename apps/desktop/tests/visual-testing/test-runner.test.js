import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { VisualTestRunner } = require('./test-runner')
const { runPixelSuite } = require('./scripts/run-pixel-tests')

function createRunner(tempDir) {
  const runner = new VisualTestRunner({
    screenshotDir: path.join(tempDir, 'screenshots'),
    reportDir: path.join(tempDir, 'reports'),
    metaDir: path.join(tempDir, 'meta'),
    baselineDir: path.join(tempDir, 'baselines'),
  })
  for (const directory of [
    runner.screenshotDir,
    runner.reportDir,
    runner.metaDir,
    runner.baselineDir,
  ]) {
    fs.mkdirSync(directory, { recursive: true })
  }
  runner.page = {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(500),
    screenshot: vi.fn().mockImplementation(async ({ path: outputPath }) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      fs.writeFileSync(outputPath, Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
      ]))
    }),
  }
  return runner
}

function makeCheckLocator(visible) {
  return {
    first() { return this },
    isVisible: vi.fn().mockResolvedValue(visible),
  }
}

describe('视觉基线门禁', () => {
  afterEach(() => {
    delete process.env.UPDATE_BASELINE
    delete process.env.VISUAL_BASELINE_MAINTENANCE
    delete process.env.CI
  })

  it('默认模式缺少人工审核基线时失败且不写基线', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-baseline-missing-'))
    const runner = createRunner(tempDir)
    const updateBaseline = vi.spyOn(runner.pixelDiff, 'updateBaseline')

    try {
      await expect(runner.pixelRegressionTest('missing', '/accounts'))
        .rejects.toMatchObject({ code: 'ERR_VISUAL_BASELINE_MISSING' })
      expect(updateBaseline).not.toHaveBeenCalled()
      expect(runner.results.at(-1)).toMatchObject({
        test: 'missing',
        status: 'FAILED',
      })
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('只有显式人工维护模式才允许创建基线', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-baseline-update-'))
    const runner = createRunner(tempDir)
    process.env.UPDATE_BASELINE = '1'

    try {
      await expect(runner.pixelRegressionTest('approved', '/accounts')).rejects.toMatchObject({
        code: 'ERR_VISUAL_BASELINE_MISSING',
      })
      process.env.VISUAL_BASELINE_MAINTENANCE = '1'
      await expect(runner.pixelRegressionTest('approved', '/accounts')).resolves.toMatchObject({
        status: 'BASELINE_CREATED',
      })
      expect(fs.existsSync(path.join(tempDir, 'baselines', 'approved.png'))).toBe(true)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it.each(['true', 'TRUE', '1', 'yes', ' YES '])('CI=%s 时即使显式维护也不允许创建基线', async (ciValue) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-baseline-ci-'))
    const runner = createRunner(tempDir)
    process.env.UPDATE_BASELINE = '1'
    process.env.VISUAL_BASELINE_MAINTENANCE = '1'
    process.env.CI = ciValue

    try {
      await expect(runner.pixelRegressionTest('blocked-by-ci', '/accounts'))
        .rejects.toMatchObject({ code: 'ERR_VISUAL_BASELINE_MISSING' })
      expect(fs.existsSync(path.join(tempDir, 'baselines', 'blocked-by-ci.png'))).toBe(false)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it.each(['1', 'yes', ' TRUE '])('CI=%s 时像素门禁将 BASELINE_CREATED 计为失败', async (ciValue) => {
    process.env.CI = ciValue
    const runner = {
      launch: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      generateReport: vi.fn(),
      pixelRegressionTest: vi.fn().mockResolvedValue({ status: 'BASELINE_CREATED' }),
    }

    const summary = await runPixelSuite([{ name: 'new-baseline', route: '/accounts' }], {
      runner,
      allowBaselineCreation: true,
    })

    expect(summary).toMatchObject({ failed: 1, passed: 0, baselined: 1, maintenanceMode: false })
  })

  it('拒绝通过截图和基线文件路径逃逸的测试名', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-test-name-'))
    const runner = createRunner(tempDir)

    try {
      await expect(runner.pixelRegressionTest('../outside', '/accounts'))
        .rejects.toMatchObject({ code: 'ERR_VISUAL_TEST_NAME_INVALID' })
      await expect(runner.captureAndAnalyze('..\\outside', 'inspect'))
        .rejects.toMatchObject({ code: 'ERR_VISUAL_TEST_NAME_INVALID' })
      expect(fs.existsSync(path.join(tempDir, 'outside-current.png'))).toBe(false)
      expect(fs.existsSync(path.join(tempDir, 'outside.png'))).toBe(false)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('默认 PR 门禁把新建基线视为失败', async () => {
    const runner = {
      launch: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      generateReport: vi.fn(),
      pixelRegressionTest: vi.fn().mockResolvedValue({ status: 'BASELINE_CREATED' }),
    }

    const summary = await runPixelSuite([{ name: 'new-baseline', route: '/accounts' }], { runner })

    expect(summary).toMatchObject({ failed: 1, passed: 0, baselined: 1 })
  })
})

describe('视觉视图门禁', () => {
  afterEach(() => {
    delete process.env.UPDATE_BASELINE
  })

  it('ready 选择器不存在时必须失败', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-ready-selector-'))
    const runner = createRunner(tempDir)
    runner.page.waitForSelector = vi.fn().mockRejectedValue(new Error('selector missing'))

    try {
      await expect(runner.aiVisionTest('bad-ready', '/accounts', [
        { name: '标题', text: '账号管理' },
      ], { waitFor: '.missing' })).rejects.toThrow(/selector missing|选择器/)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('每个视觉检查必须声明可执行的选择器或文字断言', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-machine-check-'))
    const runner = createRunner(tempDir)
    runner.page.waitForSelector = vi.fn().mockResolvedValue(undefined)

    try {
      await expect(runner.aiVisionTest('prompt-only', '/accounts', [
        { name: '仅提示词', prompt: '页面是否正常？' },
      ], { waitFor: '.page-title' })).rejects.toMatchObject({
        code: 'ERR_VISUAL_CHECK_INVALID',
      })
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('机器断言失败时记录 FAILED 并拒绝通过', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-check-failed-'))
    const runner = createRunner(tempDir)
    runner.page.waitForSelector = vi.fn().mockResolvedValue(undefined)
    runner.page.locator = vi.fn(() => makeCheckLocator(false))

    try {
      await expect(runner.aiVisionTest('missing-control', '/accounts', [
        { name: '添加按钮', selector: '.add-account-button' },
      ], { waitFor: '.page-title' })).rejects.toMatchObject({
        code: 'ERR_VISUAL_CHECK_FAILED',
      })
      expect(runner.results).toContainEqual(expect.objectContaining({
        test: 'missing-control',
        check: '添加按钮',
        status: 'FAILED',
      }))
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('重定向入口按声明的目标路由等待应用就绪', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-redirect-route-'))
    const runner = createRunner(tempDir)
    runner.page.waitForFunction = vi.fn().mockResolvedValue(undefined)
    runner.page.locator = vi.fn(() => makeCheckLocator(true))

    try {
      await expect(runner.aiVisionTest('providers-redirect', '/providers', [
        { name: '标题', selector: '.page-title' },
      ], {
        expectedRoute: '/model-providers',
        waitFor: '.page-title',
      })).resolves.toMatchObject({ status: 'PASSED' })
      expect(runner.page.goto).toHaveBeenCalledWith(
        expect.stringContaining('/#/providers'),
        expect.any(Object),
      )
      expect(runner.page.waitForFunction.mock.calls[0][1]).toBe('#/model-providers')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
