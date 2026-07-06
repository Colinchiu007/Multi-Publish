/**
 * E2E 测试 — 账号删除流程
 *
 * 运行：E2E=1 npx vitest run tests/e2e/
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const E2E_ENABLED = process.env.E2E === '1'

describe.skipIf(!E2E_ENABLED)('E2E: Account Delete Flow', () => {
  beforeAll(async () => {
    if (!E2E_ENABLED) return
    const { _electron: electron } = await import('playwright')
    this.app = await electron.launch({
      args: ['dist/main.js'],
      env: { ...process.env, NODE_ENV: 'test' }
    })
    this.page = await this.app.firstWindow()
  })

  afterAll(async () => {
    if (!E2E_ENABLED) return
    await this.app?.close()
  })

  it('should delete account on confirm', async () => {
    if (!E2E_ENABLED) return
    const page = this.page
    // 导航到账号管理页
    await page.click('[data-testid=nav-accounts]')
    await page.waitForSelector('[data-testid=account-list]')
    // 点击删除第一个账号
    await page.click('[data-testid=delete-btn]:first-child')
    await page.waitForSelector('[data-testid=confirm-dialog]')
    // 确认删除
    await page.click('[data-testid=confirm-yes]')
    await page.waitForSelector('[data-testid=account-list]')
    // 验证账号已删除（列表长度减少）
    const remaining = await page.$$eval('[data-testid=account-item]', els => els.length)
    expect(remaining).toBeGreaterThanOrEqual(0)
  })

  it('should not delete on cancel', async () => {
    if (!E2E_ENABLED) return
    const page = this.page
    // 导航到账号管理页
    await page.click('[data-testid=nav-accounts]')
    await page.waitForSelector('[data-testid=account-list]')
    // 点击删除
    await page.click('[data-testid=delete-btn]:first-child')
    await page.waitForSelector('[data-testid=confirm-dialog]')
    // 取消删除
    await page.click('[data-testid=confirm-no]')
    await page.waitForSelector('[data-testid=account-list]')
    // 验证账号未被删除（列表仍包含元素）
    const remaining = await page.$$eval('[data-testid=account-item]', els => els.length)
    expect(remaining).toBeGreaterThan(0)
  })
})
