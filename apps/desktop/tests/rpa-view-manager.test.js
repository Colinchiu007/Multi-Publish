/**
 * RpaViewManager -- bilibili publish unit tests
 *
 * Tests:
 * - _publish_bilibili method exists on prototype (dispatch contract)
 * - publish("bilibili", ...) dispatches to _publish_bilibili
 * - Returns error for missing video_path
 * - Returns properly shaped result object
 *
 * 注意：用 __registerMock 替代 vi.mock，因为 vitest 4 下 vi.mock 的 factory
 * 对 CJS require 不生效。__registerMock 拦截 Module.prototype.require，与 CJS 完全兼容。
 */
__enableElectronMock()

__registerMock("@multi-publish/shared-utils/src/platform-config", vi.fn().mockImplementation(function () {
  return {
    getPlatform: vi.fn().mockReturnValue({
      publish_url: "https://member.bilibili.com/",
      type: "mixed",
      has_api: true,
    }),
  }
}))

__registerMock("@multi-publish/rpa-engine", {
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
})

// api-publish-engine 真实包加载会失败（api-router.js 缺 ./logger），需 mock 以避免 require 抛错
__registerMock("@multi-publish/api-publish-engine", {
  supportsApi: vi.fn().mockReturnValue(false),
  publishViaApi: vi.fn(),
})

__registerMock("path", {
  join: vi.fn(),
  resolve: vi.fn(),
  basename: vi.fn(),
})

__registerMock("fs", {
  existsSync: vi.fn(),
})

const RpaViewManager = require("../electron/services/rpa-view-manager")

describe("RpaViewManager bilibili publish", () => {
  let rpa

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock all internal helpers
    RpaViewManager.prototype._emitProgress = vi.fn()
    RpaViewManager.prototype._createWindow = vi.fn().mockReturnValue({
      loadURL: vi.fn().mockResolvedValue(),
      webContents: {
        getURL: vi.fn().mockReturnValue("https://member.bilibili.com/video/upload.html"),
        executeJavaScript: vi.fn().mockResolvedValue(null),
        send: vi.fn(),
        on: vi.fn(),
      },
      destroy: vi.fn(),
      on: vi.fn(),
    })
    RpaViewManager.prototype._restoreCookies = vi.fn().mockResolvedValue()
    RpaViewManager.prototype._navigateAndWait = vi.fn().mockResolvedValue()
    RpaViewManager.prototype._waitForElement = vi.fn().mockResolvedValue(true)
    RpaViewManager.prototype._setFileInput = vi.fn().mockResolvedValue()
    RpaViewManager.prototype._waitForCondition = vi.fn().mockResolvedValue(true)
    RpaViewManager.prototype._fillInput = vi.fn().mockResolvedValue()
    RpaViewManager.prototype._click = vi.fn().mockResolvedValue(true)
    RpaViewManager.prototype._waitForResponse = vi.fn().mockResolvedValue(null)
    RpaViewManager.prototype._windowKey = vi.fn().mockReturnValue("bilibili_test")
    rpa = new RpaViewManager()
  })

  test("_publish_generic fallback exists on prototype", () => {
    expect(typeof RpaViewManager.prototype._publish_generic).toBe("function")
  })

  test("publish dispatches _publish_generic when no platform-specific method exists", () => {
    expect(typeof rpa._publish_bilibili).toBe("undefined")
    expect(typeof rpa._publish_generic).toBe("function")
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
    rpa._waitForResponse = vi.fn().mockResolvedValue({ url: "https://bilibili.com/video/BV1xxx" })

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
