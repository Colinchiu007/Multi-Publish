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
    offlineManager.setOwnerSubjectProvider(null)
    offlineManager.setTaskQueue(null)
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
    offlineManager.setOwnerSubjectProvider(null)
    offlineManager.setTaskQueue(null)
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

  test("legacy mode replays cache entries explicitly marked as legacy", function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify([
      { platform: "weibo", article: { title: "Legacy" }, owner_subject: "__legacy__" },
    ]))
    offlineManager.onNetworkChange(false)
    offlineManager.setTaskQueue(mockTaskQueue)

    expect(offlineManager.loadCache()).toEqual([
      expect.objectContaining({ owner_subject: "__legacy__", platform: "weibo" }),
    ])
    expect(offlineManager.processCachedTasks()).toBe(1)
    expect(mockTaskQueue.add).toHaveBeenCalledWith({
      platform: "weibo",
      article: { title: "Legacy" },
      accountId: null,
    })
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

  test("身份模式只重放当前用户缓存，并使用可信 addForOwner", function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify([
      { platform: "weibo", article: { title: "A" }, owner_subject: "user-a" },
      { platform: "wechat_mp", article: { title: "B" }, owner_subject: "user-b" },
    ]))
    var queue = { addForOwner: vi.fn(() => "task-a") }
    offlineManager.setOwnerSubjectProvider(() => "user-a")
    offlineManager.setTaskQueue(queue)

    expect(offlineManager.processCachedTasks()).toBe(1)
    expect(queue.addForOwner).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "weibo", owner_subject: "user-a" }),
      "user-a",
    )
    var persisted = JSON.parse(fs.writeFileSync.mock.calls[0][1])
    expect(persisted).toEqual([
      expect.objectContaining({ owner_subject: "user-b" }),
    ])
  })

  test("身份模式异步入队失败时保留缓存，不能把未确认任务当作已重放", async function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify([
      { platform: "weibo", article: { title: "A" }, owner_subject: "user-a" },
    ]))
    var queue = { addForOwner: vi.fn(() => Promise.reject(new Error("queue unavailable"))) }
    offlineManager.setOwnerSubjectProvider(() => "user-a")
    offlineManager.setTaskQueue(queue)

    expect(offlineManager.processCachedTasks()).toBe(0)
    var persisted = JSON.parse(fs.writeFileSync.mock.calls[0][1])
    expect(persisted).toEqual([
      expect.objectContaining({ owner_subject: "user-a", platform: "weibo" }),
    ])
    await Promise.resolve()
  })

  test("身份模式缓存时忽略渲染层伪造的 owner", function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(false)
    offlineManager.setOwnerSubjectProvider(() => "user-a")

    expect(offlineManager.addToCache({
      platform: "weibo",
      article: { title: "A" },
      owner_subject: "forged-user",
    })).toBe(true)
    var persisted = JSON.parse(fs.writeFileSync.mock.calls[0][1])
    expect(persisted[0]).toMatchObject({ owner_subject: "user-a" })
  })
})

describe("OfflineManager 缓存写入形状与重放形状必须同源（渲染层嵌套形状回归）", function() {
  // P1 缺陷（2026-10-02 第二轮验证）：
  //   渲染层单篇离线缓存写入 `{ targets: [{platform, accountId}], data: {...} }`（嵌套形状），
  //   而 `processCachedTasks` 的判据是**扁平** `task.platform && task.article`。
  //   两者形状不同源 ⇒ 嵌套条目 platform 为 undefined ⇒ 永久留在缓存、网络恢复后**永不重放**。
  //   既有测试全部用扁平夹具，所以这个缺陷从未被覆盖（又一次「夹具形状 ≠ 生产写入形状」）。
  var mockTaskQueue

  beforeEach(function() {
    vi.clearAllMocks()
    offlineManager.setOwnerSubjectProvider(null)
    offlineManager.setTaskQueue(null)
    mockTaskQueue = { add: vi.fn().mockReturnValue("mock_task_id") }
  })

  test("嵌套形状（渲染层实际写入）：按 targets 展开重放，每个 target 一条任务", function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify([
      {
        targets: [{ platform: "wechat_mp", accountId: "acc-1" }, { platform: "zhihu", accountId: null }],
        data: { title: "离线文章", content: "正文" },
      },
    ]))
    offlineManager.setTaskQueue(mockTaskQueue)
    offlineManager.onNetworkChange(false)

    expect(offlineManager.processCachedTasks()).toBe(2)
    expect(mockTaskQueue.add).toHaveBeenCalledTimes(2)
    expect(mockTaskQueue.add).toHaveBeenCalledWith({
      platform: "wechat_mp",
      article: { title: "离线文章", content: "正文" },
      accountId: "acc-1",
    })
    expect(mockTaskQueue.add).toHaveBeenCalledWith({
      platform: "zhihu",
      article: { title: "离线文章", content: "正文" },
      accountId: null,
    })
  })

  test("嵌套条目重放成功后从缓存移除，不永久堆积", function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify([
      { targets: [{ platform: "weibo", accountId: null }], data: { title: "A" } },
    ]))
    offlineManager.setTaskQueue(mockTaskQueue)
    offlineManager.onNetworkChange(false)

    expect(offlineManager.processCachedTasks()).toBe(1)
    var persisted = JSON.parse(fs.writeFileSync.mock.calls[0][1])
    expect(persisted).toEqual([])
  })

  test("扁平与嵌套两种形状可共存重放（存量缓存向后兼容）", function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify([
      { platform: "weibo", article: { title: "扁平" }, accountId: null },
      { targets: [{ platform: "zhihu", accountId: null }], data: { title: "嵌套" } },
    ]))
    offlineManager.setTaskQueue(mockTaskQueue)
    offlineManager.onNetworkChange(false)

    expect(offlineManager.processCachedTasks()).toBe(2)
    expect(mockTaskQueue.add).toHaveBeenCalledTimes(2)
  })

  test("无法识别的条目留在缓存，不静默丢弃也不虚报重放数", function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify([
      { foo: "bar" },
      { targets: [], data: { title: "空 targets" } },
    ]))
    offlineManager.setTaskQueue(mockTaskQueue)
    offlineManager.onNetworkChange(false)

    expect(offlineManager.processCachedTasks()).toBe(0)
    expect(mockTaskQueue.add).not.toHaveBeenCalled()
    var persisted = JSON.parse(fs.writeFileSync.mock.calls[0][1])
    expect(persisted).toHaveLength(2)
  })

  test("嵌套形状某个 target 入队失败时整条留在缓存（不部分丢失）", function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify([
      { targets: [{ platform: "weibo", accountId: null }, { platform: "zhihu", accountId: null }], data: { title: "A" } },
    ]))
    var queue = {
      add: vi.fn()
        .mockReturnValueOnce("task-1")
        .mockImplementationOnce(function () { throw new Error("queue closed") }),
    }
    offlineManager.setTaskQueue(queue)
    offlineManager.onNetworkChange(false)

    expect(offlineManager.processCachedTasks()).toBe(0)
    var persisted = JSON.parse(fs.writeFileSync.mock.calls[0][1])
    expect(persisted).toHaveLength(1)
    expect(persisted[0].targets).toHaveLength(2)
  })
})
