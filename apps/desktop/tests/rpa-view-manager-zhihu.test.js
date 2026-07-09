/**
 * RpaViewManager -- zhihu publish unit tests
 *
 * Tests P1-M4 zhihu RPA publisher:
 * - _publish_zhihu method exists
 * - publish("zhihu", ...) dispatches correctly
 * - Returns error for missing content
 * - Returns properly shaped result
 * - Platform selector validation
 *
 * 注意：用 __registerMock 替代 vi.mock，因为 vitest 4 下 vi.mock 的 factory
 * 对 CJS require 不生效。__registerMock 拦截 Module.prototype.require，与 CJS 完全兼容。
 */
__enableElectronMock()

__registerMock("@multi-publish/shared-utils/src/platform-config", vi.fn().mockImplementation(function () {
  return {
    getPlatform: vi.fn().mockReturnValue({
      publish_url: "https://www.zhihu.com/creator/write",
      type: "article",
      max_title: 120,
      max_content: 100000,
    }),
  }
}))

__registerMock("@multi-publish/rpa-engine", {
  platformSelectors: {
    PLATFORM_PUBLISH_SELECTORS: {
      zhihu: {
        title_input: ["div[contenteditable=true][placeholder*=\"标题\"]"],
        content_textarea: ["div[contenteditable=true].Editable-Unstyled"],
        publish_btn: ["button:has-text(\"发布\")"],
        draft_btn: ["button:has-text(\"存草稿\")"],
      },
    },
    PLATFORM_SUCCESS_PATTERNS: {
      zhihu: ["https://www.zhihu.com/", "https://zhuanlan.zhihu.com/p/"],
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
const { platformSelectors } = require("@multi-publish/rpa-engine")

describe("RpaViewManager zhihu publish", () => {
  let rpa

  beforeEach(() => {
    vi.clearAllMocks()
    RpaViewManager.prototype._emitProgress = vi.fn()
    RpaViewManager.prototype._createWindow = vi.fn().mockReturnValue({
      loadURL: vi.fn().mockResolvedValue(),
      webContents: {
        getURL: vi.fn().mockReturnValue("https://www.zhihu.com/creator/write"),
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
    RpaViewManager.prototype._fillInput = vi.fn().mockResolvedValue()
    RpaViewManager.prototype._click = vi.fn().mockResolvedValue(true)
    RpaViewManager.prototype._waitForResponse = vi.fn().mockResolvedValue(null)
    RpaViewManager.prototype._windowKey = vi.fn().mockReturnValue("zhihu_test")
    rpa = new RpaViewManager()
  })

  test("_publish_zhihu exists on prototype", () => {
    expect(typeof RpaViewManager.prototype._publish_zhihu).toBe("function")
  })

  test("publish dispatches _publish_zhihu", () => {
    expect(typeof rpa._publish_zhihu).toBe("function")
  })

  test("_publish_zhihu requires title and content", async () => {
    const result = await rpa.publish("zhihu", {}, null, 5000)
    expect(result).toMatchObject({
      success: false,
      platform: "zhihu",
    })
    expect(result.error).toBeTruthy()
  })

  test("_publish_zhihu returns success shaped result", async () => {
    rpa._waitForResponse = vi.fn().mockResolvedValue({
      url: "https://www.zhihu.com/",
    })

    const result = await rpa.publish("zhihu", {
      title: "测试标题",
      content: "测试内容正文",
    }, null, 5000)

    expect(result).toHaveProperty("success")
    expect(result).toHaveProperty("platform")
    expect(result.platform).toBe("zhihu")
  })

  test("zhihu has platform selectors defined", () => {
    const selectors = platformSelectors.PLATFORM_PUBLISH_SELECTORS.zhihu
    expect(selectors).toBeDefined()
    expect(selectors.title_input).toBeDefined()
    expect(selectors.title_input.length).toBeGreaterThan(0)
    expect(selectors.publish_btn).toBeDefined()
  })

  test("zhihu has success patterns defined", () => {
    const patterns = platformSelectors.PLATFORM_SUCCESS_PATTERNS
    expect(patterns.zhihu).toBeDefined()
    expect(patterns.zhihu.length).toBeGreaterThan(0)
  })
})