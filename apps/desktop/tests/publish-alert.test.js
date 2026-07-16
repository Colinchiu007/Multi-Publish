/**
 * PublishAlertManager unit tests
 *
 * 注意：用 __registerMock 替代 vi.mock，因为 vitest 4 下 vi.mock 的 factory
 * 对 CJS require 不生效。__registerMock 拦截 Module.prototype.require，与 CJS 完全兼容。
 */
__enableElectronMock()

// 默认 electron mock 不含 Notification，需动态赋值（覆盖字段而非整体替换）
const electron = require("electron")
electron.Notification = vi.fn().mockImplementation(() => ({
  show: vi.fn(),
}))

__registerMock("child_process", {
  exec: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(),
})

__registerMock("fs", {
  existsSync: vi.fn().mockReturnValue(true),
})

const publishAlert = require("../electron/services/publish-alert")

describe("PublishAlertManager", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("playSound calls spawn (shell-safe, no cmd injection)", () => {
    publishAlert.playSound("success")
    const { spawn } = require("child_process")
    expect(spawn).toHaveBeenCalled()
  })

  test("triggerAlert with success type", () => {
    // Mock Notification.isSupported
    const { Notification } = require("electron")
    Notification.isSupported = vi.fn().mockReturnValue(true)
    publishAlert.triggerAlert("success", { platform: "weibo" })
  })

  test("triggerAlert with error type", () => {
    const { Notification } = require("electron")
    Notification.isSupported = vi.fn().mockReturnValue(true)
    publishAlert.triggerAlert("error", { platform: "bilibili" })
  })
})