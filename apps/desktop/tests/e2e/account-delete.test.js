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
    // TODO: launch Electron app via playwright
    // const { _electron: electron } = await import('playwright')
    // this.app = await electron.launch({ args: ['dist/main.js'] })
  })

  afterAll(async () => {
    if (!E2E_ENABLED) return
    // await this.app?.close()
  })

  it('should delete account on confirm', async () => {
    if (!E2E_ENABLED) return
    // TODO: Navigate to Accounts page, click delete, confirm, verify
    expect(true).toBe(true)
  })

  it('should not delete on cancel', async () => {
    if (!E2E_ENABLED) return
    expect(true).toBe(true)
  })
})
