import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'

const {
  CAPTURE_SCENARIOS,
  VIEWPORTS,
  captureScenario,
  screenshotName,
} = require('./scripts/capture-yixiaoer-current')

describe('蚁小二当前界面截图合同', () => {
  it('三个对比目标映射到账号管理和发布记录页', () => {
    expect(CAPTURE_SCENARIOS).toEqual([
      expect.objectContaining({ name: 'accounts', route: '/accounts' }),
      expect.objectContaining({ name: 'publish', route: '/publish/history' }),
      expect.objectContaining({
        name: 'batch-publish',
        route: '/publish/history',
        actionSelector: '[data-testid="start-selection"]',
      }),
    ])
  })

  it('桌面截图沿用 manifest 文件名，移动端使用独立后缀', () => {
    expect(screenshotName('accounts', VIEWPORTS[0])).toBe('accounts.png')
    expect(screenshotName('accounts', VIEWPORTS[1])).toBe('accounts-mobile.png')
  })

  it('批量发布场景在截图前进入批量选择模式', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([]),
      screenshot: vi.fn().mockResolvedValue(undefined),
    }
    const scenario = CAPTURE_SCENARIOS.find(item => item.name === 'batch-publish')

    await captureScenario(page, scenario, VIEWPORTS[0], {
      baseUrl: 'http://127.0.0.1:5174',
      outputDir: path.resolve(process.cwd(), 'tests/visual-testing/screenshots/yixiaoer-parity-test'),
    })

    expect(page.goto).toHaveBeenCalledWith(
      'http://127.0.0.1:5174/#/publish/history',
      expect.objectContaining({ waitUntil: 'domcontentloaded' }),
    )
    expect(page.click).toHaveBeenCalledWith('[data-testid="start-selection"]')
    expect(page.waitForSelector).toHaveBeenCalledWith('.record-selector input', expect.any(Object))
    expect(page.screenshot).toHaveBeenCalledWith(expect.objectContaining({
      path: expect.stringMatching(/batch-publish\.png$/),
      fullPage: false,
    }))
  })
})
