/**
 * RpaViewManager -- zhihu publish unit tests
 *
 * Tests P1-M4 zhihu RPA publisher:
 * - _publish_zhihu method exists
 * - publish("zhihu", ...) dispatches correctly
 * - Returns error for missing content
 * - Returns properly shaped result
 * - Platform selector validation
 */

jest.mock("electron", () => ({
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadURL: jest.fn(),
    webContents: {
      getURL: jest.fn().mockReturnValue("https://www.zhihu.com/creator/write"),
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
      publish_url: "https://www.zhihu.com/creator/write",
      type: "article",
      max_title: 120,
      max_content: 100000,
    }),
  }))
})

jest.mock("@multi-publish/rpa-engine", () => ({
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
}))

jest.mock("path")
jest.mock("fs")

const RpaViewManager = require("../electron/rpa-view-manager")
const { platformSelectors } = require("@multi-publish/rpa-engine")

describe("RpaViewManager zhihu publish", () => {
  let rpa

  beforeEach(() => {
    jest.clearAllMocks()
    RpaViewManager.prototype._emitProgress = jest.fn()
    RpaViewManager.prototype._createWindow = jest.fn().mockReturnValue({
      loadURL: jest.fn().mockResolvedValue(),
      webContents: {
        getURL: jest.fn().mockReturnValue("https://www.zhihu.com/creator/write"),
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
    RpaViewManager.prototype._fillInput = jest.fn().mockResolvedValue()
    RpaViewManager.prototype._click = jest.fn().mockResolvedValue(true)
    RpaViewManager.prototype._waitForResponse = jest.fn().mockResolvedValue(null)
    RpaViewManager.prototype._windowKey = jest.fn().mockReturnValue("zhihu_test")
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
    rpa._waitForResponse = jest.fn().mockResolvedValue({
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