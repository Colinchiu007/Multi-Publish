/**
 * E2E 测试 — 账号管理流程
 *
 * 覆盖：添加账号 → 查看列表 → 切换平台
 *
 * 运行：E2E=1 npx vitest run tests/e2e/
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"

const E2E_ENABLED = process.env.E2E === "1"

describe.skipIf(!E2E_ENABLED)("E2E: Account Management", () => {
  beforeAll(async () => {
    if (!E2E_ENABLED) return
    const { _electron: electron } = await import("playwright")
    this.app = await electron.launch({
      args: ["dist/main.js"],
      env: { ...process.env, NODE_ENV: "test" }
    })
    this.page = await this.app.firstWindow()
  })

  afterAll(async () => {
    if (!E2E_ENABLED) return
    await this.app?.close()
  })

  it("should navigate to account management", async () => {
    if (!E2E_ENABLED) return
    const page = this.page
    await page.click("[data-testid=nav-accounts]")
    await page.waitForSelector(".account-results-panel")
    const visible = await page.isVisible(".account-results-panel")
    expect(visible).toBe(true)
  })

  it("should show add account dialog", async () => {
    if (!E2E_ENABLED) return
    const page = this.page
    await page.click("[data-testid=nav-accounts]")
    await page.waitForSelector("[data-testid=account-add]")
    await page.click("[data-testid=account-add]")
    await page.waitForSelector(".ui-modal")
    const dialogVisible = await page.isVisible(".ui-modal")
    expect(dialogVisible).toBe(true)
  })

  it("should select platform in add dialog", async () => {
    if (!E2E_ENABLED) return
    const page = this.page
    await page.click("[data-testid=account-add]")
    await page.waitForSelector(".ui-modal")
    const platformSelect = page.locator(".ui-modal .ui-select")
    const firstPlatform = await platformSelect.locator("option:not([disabled])").first().getAttribute("value")
    await platformSelect.selectOption(firstPlatform)
    const selectedValue = await platformSelect.inputValue()
    expect(selectedValue).toBe(firstPlatform)
  })

  it("should close add dialog on cancel", async () => {
    if (!E2E_ENABLED) return
    const page = this.page
    await page.click("[data-testid=nav-accounts]")
    await page.waitForSelector("[data-testid=account-add]")
    await page.click("[data-testid=account-add]")
    await page.waitForSelector(".ui-modal")
    await page.locator(".ui-modal-footer button:has-text(取消)").click()
    // 对话框关闭后应回到账号列表
    const dialogGone = await page.locator(".ui-modal").isVisible().catch(() => false)
    expect(dialogGone).toBe(false)
  })
})
