/**
 * PublishAlertManager unit tests
 */
jest.mock("electron", () => ({
  Notification: jest.fn().mockImplementation(() => ({
    show: jest.fn(),
  })),
  shell: { openExternal: jest.fn() },
}))

jest.mock("child_process", () => ({
  exec: jest.fn(),
}))

jest.mock("fs", () => ({
  existsSync: jest.fn().mockReturnValue(true),
}))

const publishAlert = require("../electron/publish-alert")

describe("PublishAlertManager", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test("playSound calls exec", () => {
    publishAlert.playSound("success")
    const { exec } = require("child_process")
    expect(exec).toHaveBeenCalled()
  })

  test("triggerAlert with success type", () => {
    // Mock Notification.isSupported
    const { Notification } = require("electron")
    Notification.isSupported = jest.fn().mockReturnValue(true)
    publishAlert.triggerAlert("success", { platform: "weibo" })
  })

  test("triggerAlert with error type", () => {
    const { Notification } = require("electron")
    Notification.isSupported = jest.fn().mockReturnValue(true)
    publishAlert.triggerAlert("error", { platform: "bilibili" })
  })
})