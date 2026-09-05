/**
 * 回归保护测试：platform-definitions.browser.js 导出完整性
 *
 * 背景（Bug 复盘 2026-09-05）：
 *   提交 c3c395570 在 Accounts.vue 中新增了 PLATFORM_LOGIN_URLS 导入，
 *   但 platform-definitions.browser.js 缺少该导出，导致 Vite 编译失败。
 *
 * 本测试确保 CJS 版（platform-definitions.js）中所有渲染端需要的数据导出
 * 在 ESM 浏览器版（platform-definitions.browser.js）中同步存在。
 */
import { describe, expect, it } from 'vitest'

// CJS 版 — 渲染端可能消费的所有数据导出
import cjsModule from '../platform-definitions.js'

// ESM 浏览器版 — 渲染端实际使用的版本（Vite resolve.alias 映射）
import * as browserModule from '../platform-definitions.browser.js'

/**
 * 渲染端需要的数据导出清单。
 * 注意：isPlatformAuthHost / isPlatformLoginSuccessUrl / isPlatformCookieDomain
 * 等函数是 Node 主进程专用，不在此清单中。
 */
const RENDERER_DATA_EXPORTS = [
  'PLATFORM_NAMES',
  'PLATFORM_ICONS',
  'PLATFORM_LOGIN_URLS',
  'PLATFORM_DASHBOARD_URLS',
]

describe('platform-definitions.browser.js 导出完整性', () => {
  for (const exportName of RENDERER_DATA_EXPORTS) {
    it(`浏览器版导出 ${exportName}`, () => {
      expect(browserModule).toHaveProperty(exportName)
      expect(browserModule[exportName]).toBeDefined()
      expect(typeof browserModule[exportName]).toBe('object')
    })

    it(`CJS 版和浏览器版的 ${exportName} 平台 key 集合一致`, () => {
      const cjsKeys = Object.keys(cjsModule[exportName] || {})
      const browserKeys = Object.keys(browserModule[exportName] || {})
      expect(browserKeys.sort()).toEqual(cjsKeys.sort())
    })
  }

  it('PLATFORM_LOGIN_URLS 中每个平台都有对应的 PLATFORM_DASHBOARD_URLS', () => {
    const loginPlatforms = Object.keys(browserModule.PLATFORM_LOGIN_URLS)
    const dashboardPlatforms = Object.keys(browserModule.PLATFORM_DASHBOARD_URLS)
    for (const p of loginPlatforms) {
      expect(dashboardPlatforms).toContain(p)
    }
  })

  it('PLATFORM_DASHBOARD_URLS 中每个平台都有对应的 PLATFORM_LOGIN_URLS', () => {
    const loginPlatforms = Object.keys(browserModule.PLATFORM_LOGIN_URLS)
    const dashboardPlatforms = Object.keys(browserModule.PLATFORM_DASHBOARD_URLS)
    for (const p of dashboardPlatforms) {
      expect(loginPlatforms).toContain(p)
    }
  })
})