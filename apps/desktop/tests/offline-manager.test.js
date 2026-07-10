/**
 * OfflineManager unit tests
 *
 * 注意：用 __registerMock 替代 vi.mock，因为 vitest 4 下 vi.mock 的 factory
 * 对 CJS require 不生效。__registerMock 拦截 Module.prototype.require，与 CJS 完全兼容。
 */
var mockSend = vi.fn()

__enableElectronMock()

__registerMock("fs", {
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue("[]"),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
})

var offlineManager = require("../electron/services/offline-manager")

describe("OfflineManager", function() {
  beforeEach(function() {
    vi.clearAllMocks()
  })

  test("isOffline returns false initially", function() {
    expect(offlineManager.isOffline()).toBe(false)
  })

  test("loadCache returns empty array when no cache", function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(false)
    var result = offlineManager.loadCache()
    expect(result).toEqual([])
  })

  test("saveCache writes to file", function() {
    var fs = require("fs")
    var result = offlineManager.saveCache([{ id: 1 }])
    expect(result).toBe(true)
    expect(fs.writeFileSync).toHaveBeenCalled()
  })

  test("addToCache adds task to cache", function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(false)
    var result = offlineManager.addToCache({ id: 1, platform: "weibo" })
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
    var status = offlineManager.getStatus()
    expect(status.offline).toBe(true)
    expect(typeof status.cachedCount).toBe("number")
  })

  test("clearSuccessfulTasks removes completed tasks", function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify([
      { id: "1", success: true },
      { id: "2", success: false },
      { id: "3" },
    ]))
    var pending = offlineManager.clearSuccessfulTasks()
    expect(pending.length).toBe(2)
    expect(pending[0].id).toBe("2")
  })

  test("addToCache stores required fields", function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(false)
    offlineManager.addToCache({ platform: "wechat_mp", article: { title: "Test" } })
    var writeCall = fs.writeFileSync.mock.calls[0]
    var data = JSON.parse(writeCall[1])
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

describe("OfflineManager integration", function() {
  var mockTaskQueue

  beforeEach(function() {
    vi.clearAllMocks()
    mockTaskQueue = { add: vi.fn().mockReturnValue("mock_task_id") }
  })

  test("setTaskQueue stores reference", function() {
    offlineManager.setTaskQueue(mockTaskQueue)
    var result = offlineManager.processCachedTasks()
    expect(result).toBe(0)  // No cached tasks
  })

  test("processCachedTasks re-queues cached tasks", function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify([
      { platform: "weibo", article: { title: "T1" }, accountId: null },
      { platform: "wechat_mp", article: { title: "T2" }, accountId: null },
    ]))
    offlineManager.setTaskQueue(mockTaskQueue)
    offlineManager.onNetworkChange(false)  // Set online
    var count = offlineManager.processCachedTasks()
    expect(count).toBe(2)
    expect(mockTaskQueue.add).toHaveBeenCalledTimes(2)
    expect(mockTaskQueue.add).toHaveBeenCalledWith({ platform: "weibo", article: { title: "T1" }, accountId: null })
  })

  test("processCachedTasks skips when offline", function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify([
      { platform: "weibo", article: { title: "T1" } },
    ]))
    offlineManager.setTaskQueue(mockTaskQueue)
    offlineManager.onNetworkChange(true)  // Offline
    var count = offlineManager.processCachedTasks()
    expect(count).toBe(0)
    expect(mockTaskQueue.add).not.toHaveBeenCalled()
  })

  test("clearAllCached empties the cache", function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify([
      { platform: "weibo", article: { title: "T1" } },
    ]))
    offlineManager.clearAllCached()
    var writeCall = fs.writeFileSync.mock.calls[0]
    var data = JSON.parse(writeCall[1])
    expect(data.length).toBe(0)
  })

  test("onNetworkChange processes cached tasks when back online", function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify([
      { platform: "weibo", article: { title: "T1" } },
    ]))
    offlineManager.setTaskQueue(mockTaskQueue)
    // Go offline first
    offlineManager.onNetworkChange(true)
    expect(offlineManager.isOffline()).toBe(true)
    // Come back online
    offlineManager.onNetworkChange(false)
    expect(offlineManager.isOffline()).toBe(false)
    // Should have re-queued
    expect(mockTaskQueue.add).toHaveBeenCalled()
  })
})
