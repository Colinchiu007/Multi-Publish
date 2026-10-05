import { afterEach, describe, expect, it, vi } from 'vitest'

// 批次 1：暗色基线通道 —— CLI 侧主题解析与透传（runner 侧见 test-runner.test.js）
const { resolveTheme, runPixelSuite } = require('./scripts/run-pixel-tests')

describe('像素门禁主题（暗色基线通道）', () => {
  const originalTheme = process.env.THEME

  afterEach(() => {
    if (originalTheme === undefined) delete process.env.THEME
    else process.env.THEME = originalTheme
  })

  it('THEME=dark 跑暗色，其余一律浅色（非法值不产第三套命名）', () => {
    expect(resolveTheme('dark')).toBe('dark')
    expect(resolveTheme('DARK ')).toBe('dark')
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('')).toBe('light')
    expect(resolveTheme(undefined)).toBe('light')
    expect(resolveTheme('weird')).toBe('light')
  })

  it('未显式传参时从 THEME 环境变量取值', () => {
    process.env.THEME = 'dark'
    expect(resolveTheme()).toBe('dark')
    delete process.env.THEME
    expect(resolveTheme()).toBe('light')
  })

  it('套件把 theme 透传给每个用例，结果与摘要均带 theme 标记', async () => {
    const calls = []
    const runner = {
      launch: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      generateReport: vi.fn(),
      pixelRegressionTest: vi.fn().mockImplementation(async (name, route, options) => {
        calls.push({ name, route, theme: options.theme })
        return { status: 'PASSED' }
      }),
    }

    const summary = await runPixelSuite(
      [{ name: 'a-view', route: '/accounts' }],
      { runner, theme: 'dark' },
    )

    expect(calls).toEqual([{ name: 'a-view', route: '/accounts', theme: 'dark' }])
    expect(summary.theme).toBe('dark')
    expect(summary.failed).toBe(0)
    expect(summary.results[0]).toMatchObject({ test: 'a-view', theme: 'dark', status: 'PASSED' })
  })

  it('未显式传 theme 时套件按 THEME 决定（默认浅色）', async () => {
    const themes = []
    const runner = {
      launch: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      generateReport: vi.fn(),
      pixelRegressionTest: vi.fn().mockImplementation(async (name, route, options) => {
        themes.push(options.theme)
        return { status: 'PASSED' }
      }),
    }

    const summary = await runPixelSuite([{ name: 'a-view', route: '/accounts' }], { runner })
    expect(themes).toEqual(['light'])
    expect(summary.theme).toBe('light')
  })

  it('暗色用例失败时按既有格式记录（不特殊化错误文案）', async () => {
    const runner = {
      launch: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      generateReport: vi.fn(),
      pixelRegressionTest: vi.fn().mockRejectedValue(new Error('像素对比失败 (a-view): misMatchPercentage=1.00%')),
    }

    const summary = await runPixelSuite(
      [{ name: 'a-view', route: '/accounts' }],
      { runner, theme: 'dark' },
    )
    expect(summary.failed).toBe(1)
    expect(summary.results[0].error).toContain('像素对比失败 (a-view)')
    expect(summary.results[0].theme).toBe('dark')
  })
})

describe('像素门禁环境前置检查（缺浏览器 ≠ 通过，也 ≠ UI 回归）', () => {
  // 起因：本机没有 Playwright 浏览器时，`chromium.launch()` 抛的是 Playwright 自己的
  // "Executable doesn't exist … run npx playwright install"，被 main().catch 压成
  // 一句「像素门禁失败: …」+ exit 1 —— 与"UI 真的回归了"在退出码与文案上完全同形。
  // 后果有两种，都发生过：把环境问题误判成回归去改代码；或以"我跑了 test:visual:pixel
  // 且它没报回归"当视觉中性证据（其实一帧都没渲染）。故：环境缺失必须单独成码、
  // 给出可执行补救、且**发生在 launch 之前**（不允许留下一份部分产物）。
  it('缺浏览器时抛 ERR_VISUAL_ENV_MISSING，并给出安装命令与查找路径', () => {
    const { preflightVisualEnvironment } = require('./scripts/run-pixel-tests')
    let message = ''
    let code = ''
    try {
      preflightVisualEnvironment({
        resolveExecutablePath: () => 'C:/ms-playwright/chromium-1234/chrome.exe',
        existsSync: () => false,
      })
    } catch (error) {
      message = error.message
      code = error.code
    }
    expect(code).toBe('ERR_VISUAL_ENV_MISSING')
    expect(message).toContain('playwright install chromium')
    expect(message).toContain('chromium-1234')
    // 明确告诉下一个人：这不是回归，也不允许当作"已验证"
    expect(message).toMatch(/不是|non-regression/i)
    expect(message).toMatch(/不得|must not/i)
  })

  it('playwright 本身 require 不上时也归为环境缺失，而不是让 Node 抛裸 MODULE_NOT_FOUND', () => {
    const { preflightVisualEnvironment } = require('./scripts/run-pixel-tests')
    expect(() => preflightVisualEnvironment({
      resolveExecutablePath: () => { throw new Error("Cannot find module 'playwright'") },
      existsSync: () => true,
    })).toThrow(/ERR_VISUAL_ENV_MISSING|环境/)
  })

  it('浏览器在位时必须放行（不得把环境检查写成一律拦）', () => {
    const { preflightVisualEnvironment } = require('./scripts/run-pixel-tests')
    expect(() => preflightVisualEnvironment({
      resolveExecutablePath: () => 'C:/ms-playwright/chromium-1234/chrome.exe',
      existsSync: () => true,
    })).not.toThrow()
  })

  it('检查必须前置于 launch：环境缺失时 runner.launch 一次都不能被调用', async () => {
    const { main } = require('./scripts/run-pixel-tests')
    const launch = vi.fn()
    const close = vi.fn()
    await expect(main({
      envCheck: () => {
        const error = new Error('视觉环境缺失：未找到 Chromium（模拟）')
        error.code = 'ERR_VISUAL_ENV_MISSING'
        throw error
      },
      runner: { launch, close, generateReport: vi.fn(), pixelRegressionTest: vi.fn() },
      theme: 'light',
    })).rejects.toThrow(/模拟/)
    expect(launch).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
  })

  // 本机实测到的第二种同形故障：dev server 没起时，19 个视图全部
  // `page.goto: net::ERR_CONNECTION_REFUSED`，被汇总成「像素视觉门禁存在 19 个失败」——
  // 与真实回归在退出码与文案上完全同形，且比"缺浏览器"更常发生。
  it('目标端口拒连时报 ERR_VISUAL_ENV_MISSING 并点名 TEST_URL，不得报成 N 个回归', async () => {
    const { preflightVisualTarget } = require('./scripts/run-pixel-tests')
    const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5174'), { code: 'ECONNREFUSED' })
    await expect(preflightVisualTarget({
      url: 'http://127.0.0.1:5174',
      openConnection: () => Promise.reject(refused),
    })).rejects.toThrow(/环境/)
    await expect(preflightVisualTarget({
      url: 'http://127.0.0.1:5174',
      openConnection: () => Promise.reject(refused),
    })).rejects.toMatchObject({ code: 'ERR_VISUAL_ENV_MISSING' })
  })

  it('可达错误文案必须含"不是回归"与补救方向（起 dev server / 核对 TEST_URL 指向哪个 worktree）', async () => {
    const { preflightVisualTarget } = require('./scripts/run-pixel-tests')
    const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    const message = await preflightVisualTarget({
      url: 'http://127.0.0.1:5174/#/',
      openConnection: () => Promise.reject(refused),
    }).then(() => '', (error) => error.message)
    expect(message).toContain('127.0.0.1:5174')
    expect(message).toContain('TEST_URL')
    expect(message).toMatch(/不是.*回归/)
    expect(message).toMatch(/dev server|QG Visual|视觉/)
  })

  it('端口可连通时必须放行（不得把可达性检查写成一律拦）', async () => {
    const { preflightVisualTarget } = require('./scripts/run-pixel-tests')
    let calls = 0
    const openConnection = async () => { calls += 1 }
    const outcome = await preflightVisualTarget({ url: 'http://127.0.0.1:5174', openConnection })
    expect(outcome).toEqual({ host: '127.0.0.1', port: 5174 })
    expect(calls).toBe(1)
  })

  it('目标不可达时同样不得进入 launch（可达性检查也在启动之前）', async () => {
    const { main } = require('./scripts/run-pixel-tests')
    const launch = vi.fn()
    await expect(main({
      envCheck: () => ({ executablePath: 'ok' }),
      targetCheck: () => Promise.reject(Object.assign(
        new Error('视觉环境缺失：dev server 未就绪（模拟）'),
        { code: 'ERR_VISUAL_ENV_MISSING' },
      )),
      runner: { launch, close: vi.fn(), generateReport: vi.fn(), pixelRegressionTest: vi.fn() },
      theme: 'light',
    })).rejects.toThrow(/模拟/)
    expect(launch).not.toHaveBeenCalled()
  })
})
