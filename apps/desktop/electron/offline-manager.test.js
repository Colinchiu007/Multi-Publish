/**
 * OfflineManager unit tests
 */
let mockSend = jest.fn()

jest.mock("electron", () => ({
  app: {
    getPath: jest.fn().mockReturnValue("/tmp/test-user-data"),
  },
  net: {
    isConnected: jest.fn().mockReturnValue(true),
    on: jest.fn(),
  },
  BrowserWindow: {
    getAllWindows: jest.fn().mockReturnValue([
      { webContents: { send: mockSend }, isDestroyed: jest.fn().mockReturnValue(false) }
    ]),
  },
}))

jest.mock("fs", () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn().mockReturnValue("[]"),
  writeFileSync: jest.fn(),
}))

let offlineManager = require("../electron/offline-manager")

describe("OfflineManager", function() {
  beforeEach(function() {
    jest.clearAllMocks()
  })

  test("isOffline returns false initially", function() {
    expect(offlineManager.isOffline()).toBe(false)
  })

  test("loadCache returns empty array when no cache", function() {
    let fs = require("fs")
    fs.existsSync.mockReturnValue(false)
    let result = offlineManager.loadCache()
    expect(result).toEqual([])
  })

  test("saveCache writes to file", function() {
    let fs = require("fs")
    let result = offlineManager.saveCache([{ id: 1 }])
    expect(result).toBe(true)
    expect(fs.writeFileSync).toHaveBeenCalled()
  })

  test("addToCache adds task to cache", function() {
    let fs = require("fs")
    fs.existsSync.mockReturnValue(false)
    let result = offlineManager.addToCache({ id: 1, platform: "weibo" })
    expect(result).toBe(true)
    expect(fs.writeFileSync).toHaveBeenCalled()
  })

  test("onNetworkChange updates offline state", function() {
    offlineManager.onNetworkChange(true)
    expect(offlineManager.isOffline()).toBe(true)
    offlineManager.onNetworkChange(false)
    expect(offlineManager.isOffline()).toBe(false)
  })

  test("getStatus returns current state", function() {
    offlineManager.onNetworkChange(true)
    let status = offlineManager.getStatus()
    expect(status.offline).toBe(true)
    expect(typeof status.cachedCount).toBe("number")
  })

  test("clearSuccessfulTasks removes completed tasks", function() {
    let fs = require("fs")
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify([
      { id: "1", success: true },
      { id: "2", success: false },
      { id: "3" },
    ]))
    let pending = offlineManager.clearSuccessfulTasks()
    expect(pending.length).toBe(2)
    expect(pending[0].id).toBe("2")
  })

  test("addToCache stores required fields", function() {
    let fs = require("fs")
    fs.existsSync.mockReturnValue(false)
    offlineManager.addToCache({ platform: "wechat_mp", article: { title: "Test" } })
    let writeCall = fs.writeFileSync.mock.calls[0]
    let data = JSON.parse(writeCall[1])
    expect(data.length).toBe(1)
    expect(data[0].platform).toBe("wechat_mp")
    expect(data[0].cachedAt).toBeDefined()
  })

  test("onNetworkChange sends offline:restored event when back online", function() {
    offlineManager.onNetworkChange(true)
    expect(offlineManager.isOffline()).toBe(true)
    offlineManager.onNetworkChange(false)
    expect(offlineManager.isOffline()).toBe(false)
  })
})
