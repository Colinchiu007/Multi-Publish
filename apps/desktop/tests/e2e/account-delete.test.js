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
    await page.waitForSelector('.account-card-grid')
    const before = await page.locator('.account-card-grid .account-row').count()
    // 点击删除第一个账号
    await page.locator('.account-card-grid [data-testid^="delete-"]').first().click()
    await page.waitForSelector('.el-message-box')
    // 确认删除
    await page.locator('.el-message-box__btns button:has-text("确定")').click()
    await page.waitForSelector('.account-results-panel')
    // 验证账号已删除（列表长度减少）
    const remaining = await page.locator('.account-card-grid .account-row').count()
    expect(remaining).toBeLessThan(before)
  })

  it('should not delete on cancel', async () => {
    if (!E2E_ENABLED) return
    const page = this.page
    // 导航到账号管理页
    await page.click('[data-testid=nav-accounts]')
    await page.waitForSelector('.account-card-grid')
    const before = await page.locator('.account-card-grid .account-row').count()
    // 点击删除
    await page.locator('.account-card-grid [data-testid^="delete-"]').first().click()
    await page.waitForSelector('.el-message-box')
    // 取消删除
    await page.locator('.el-message-box__btns button:has-text("取消")').click()
    await page.waitForSelector('.account-results-panel')
    // 验证账号未被删除（列表仍包含元素）
    const remaining = await page.locator('.account-card-grid .account-row').count()
    expect(remaining).toBe(before)
  })
})
