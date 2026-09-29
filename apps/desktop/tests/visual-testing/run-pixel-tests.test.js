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
