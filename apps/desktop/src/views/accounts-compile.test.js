/**
 * 回归保护测试：Accounts.vue 模块编译通过
 *
 * 背景（Bug 复盘 2026-09-05）：
 *   提交 c3c395570 在 Accounts.vue 中引入了重复 import 和缺失的 PLATFORM_LOGIN_URLS 导出，
 *   导致 Vite 动态 import 失败（"Failed to fetch dynamically imported module"）。
 *
 * 本测试验证：
 *   1. Accounts.vue 的所有顶层 import 都能成功解析
 *   2. 从 @multi-publish/shared-utils/src/platform-definitions 导入的符号在浏览器版中可用
 */
import { describe, expect, it } from 'vitest'

describe('Accounts.vue 导入完整性', () => {
  it('PLATFORM_LOGIN_URLS 可从 @multi-publish/shared-utils/src/platform-definitions 导入', async () => {
    // Vite 的 resolve.alias 将此模块映射到 platform-definitions.browser.js
    const mod = await import('@multi-publish/shared-utils/src/platform-definitions')
    expect(mod).toHaveProperty('PLATFORM_LOGIN_URLS')
    expect(mod).toHaveProperty('PLATFORM_DASHBOARD_URLS')
    expect(typeof mod.PLATFORM_LOGIN_URLS).toBe('object')
    expect(Object.keys(mod.PLATFORM_LOGIN_URLS).length).toBeGreaterThanOrEqual(14)
  })

  it('formatUserError 可从 @/utils/user-facing-error 导入', async () => {
    const mod = await import('@/utils/user-facing-error')
    expect(mod).toHaveProperty('formatUserError')
    expect(typeof mod.formatUserError).toBe('function')
  })

  it('useAccountStore 可从 @/stores/accounts 导入', async () => {
    const mod = await import('@/stores/accounts')
    expect(mod).toHaveProperty('useAccountStore')
    expect(typeof mod.useAccountStore).toBe('function')
  })

  it('useAccountEvents 可从 @/composables/useAccountEvents 导入', async () => {
    const mod = await import('@/composables/useAccountEvents')
    expect(mod).toHaveProperty('useAccountEvents')
    expect(typeof mod.useAccountEvents).toBe('function')
  })

  it('useAccountActions 可从 @/composables/useAccountActions 导入', async () => {
    const mod = await import('@/composables/useAccountActions')
    expect(mod).toHaveProperty('useAccountActions')
    expect(typeof mod.useAccountActions).toBe('function')
  })

  it('Vite 构建成功（vite build 不报错）', async () => {
    const { execSync } = await import('node:child_process')
    const { default: path } = await import('node:path')
    const { fileURLToPath } = await import('node:url')

    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const desktopRoot = path.resolve(__dirname, '..', '..')

    try {
      // 只做 type-check 级别的构建，跳过实际打包
      execSync('npx vite build --emptyOutDir false --minify false', {
        cwd: desktopRoot,
        stdio: 'pipe',
        timeout: 120000,
      })
    } catch (error) {
      const stderr = error.stderr?.toString() || ''
      const stdout = error.stdout?.toString() || ''
      // 如果构建失败，输出错误信息帮助定位
      throw new Error(
        `vite build 失败：\nstdout: ${stdout.slice(-500)}\nstderr: ${stderr.slice(-500)}`
      )
    }
  }, 180000)
})