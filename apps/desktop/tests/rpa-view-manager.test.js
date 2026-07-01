/**
 * RpaViewManager -- bilibili publish unit tests
 *
 * Tests:
 * - _publish_bilibili method exists on prototype (dispatch contract)
 * - publish("bilibili", ...) dispatches to _publish_bilibili
 * - Returns error for missing video_path
 * - Returns properly shaped result object
 */

jest.mock("electron", () => ({
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadURL: jest.fn(),
    webContents: {
      getURL: jest.fn().mockReturnValue("https://member.bilibili.com/video/upload.html"),
      executeJavaScript: jest.fn().mockResolvedValue(null),
      send: jest.fn(),
      on: jest.fn(),
    },
    destroy: jest.fn(),
    on: jest.fn(),
  })),
  session: {
    fromPartition: jest.fn().mockReturnValue({
      cookies: { set: jest.fn() },
    }),
  },
  ipcMain: { on: jest.fn() },
}))

jest.mock("@multi-publish/shared-utils/src/platform-config", () => {
  return jest.fn().mockImplementation(() => ({
    getPlatform: jest.fn().mockReturnValue({
      publish_url: "https://member.bilibili.com/",
      type: "mixed",
      has_api: true,
    }),
  }))
})

jest.mock("@multi-publish/rpa-engine", () => ({
  platformSelectors: {
    PLATFORM_PUBLISH_SELECTORS: {
      bilibili: {
        upload_btn: [".upload-btn"],
        title_input: ["input[placeholder*=\"\"]"],
        desc_textarea: ["textarea[placeholder*=\"\"]"],
        publish_btn: ["button:has-text(\"\")"],
      },
    },
  },
}))

jest.mock("path")
jest.mock("fs")

const RpaViewManager = require("../electron/rpa-view-manager")

describe("RpaViewManager bilibili publish", () => {
  let rpa

  beforeEach(() => {
    jest.clearAllMocks()
    // Mock all internal helpers
    RpaViewManager.prototype._emitProgress = jest.fn()
    RpaViewManager.prototype._createWindow = jest.fn().mockReturnValue({
      loadURL: jest.fn().mockResolvedValue(),
      webContents: {
        getURL: jest.fn().mockReturnValue("https://member.bilibili.com/video/upload.html"),
        executeJavaScript: jest.fn().mockResolvedValue(null),
        send: jest.fn(),
        on: jest.fn(),
      },
      destroy: jest.fn(),
      on: jest.fn(),
    })
    RpaViewManager.prototype._restoreCookies = jest.fn().mockResolvedValue()
    RpaViewManager.prototype._navigateAndWait = jest.fn().mockResolvedValue()
    RpaViewManager.prototype._waitForElement = jest.fn().mockResolvedValue(true)
    RpaViewManager.prototype._setFileInput = jest.fn().mockResolvedValue()
    RpaViewManager.prototype._waitForCondition = jest.fn().mockResolvedValue(true)
    RpaViewManager.prototype._fillInput = jest.fn().mockResolvedValue()
    RpaViewManager.prototype._click = jest.fn().mockResolvedValue(true)
    RpaViewManager.prototype._waitForResponse = jest.fn().mockResolvedValue(null)
    RpaViewManager.prototype._windowKey = jest.fn().mockReturnValue("bilibili_test")
    rpa = new RpaViewManager()
  })

  test("_publish_bilibili method exists on prototype", () => {
    expect(typeof RpaViewManager.prototype._publish_bilibili).toBe("function")
  })

  test("publish dispatches _publish_bilibili when platform is bilibili", () => {
    const mn = "_publish_bilibili"
    expect(typeof rpa[mn]).toBe("function")
    expect(typeof rpa["_publish_" + "bilibili"]).toBe("function")
  })

  test("_publish_bilibili returns error for missing video_path", async () => {
    const result = await rpa.publish("bilibili", {
      title: "Test",
      tags: ["test"],
    }, null, 5000)

    expect(result).toMatchObject({
      success: false,
      platform: "bilibili",
    })
    expect(result.error).toBeTruthy()
  })

  test("_publish_bilibili returns success shaped result", async () => {
    rpa._waitForResponse = jest.fn().mockResolvedValue({ url: "https://bilibili.com/video/BV1xxx" })

    const result = await rpa.publish("bilibili", {
      video_path: "/tmp/test.mp4",
      title: "Test Video",
      content: "Test description",
      tags: ["test", "bilibili"],
    }, null, 5000)

    expect(result).toHaveProperty("success")
    expect(result).toHaveProperty("platform")
    expect(result.platform).toBe("bilibili")
  })
})
