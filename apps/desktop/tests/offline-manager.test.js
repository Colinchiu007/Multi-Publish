/**
 * OfflineManager unit tests
 */
jest.mock("electron", () => ({
  app: {
    getPath: jest.fn().mockReturnValue("/tmp/test-user-data"),
  },
  net: {
    isConnected: jest.fn().mockReturnValue(true),
    on: jest.fn(),
  },
}))

jest.mock("fs", () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn().mockReturnValue("[]"),
  writeFileSync: jest.fn(),
}))

const offlineManager = require("../electron/offline-manager")

describe("OfflineManager", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test("isOffline returns false initially", () => {
    expect(offlineManager.isOffline()).toBe(false)
  })

  test("loadCache returns empty array when no cache", () => {
    const fs = require("fs")
    fs.existsSync.mockReturnValue(false)
    const result = offlineManager.loadCache()
    expect(result).toEqual([])
  })

  test("saveCache writes to file", () => {
    const fs = require("fs")
    const result = offlineManager.saveCache([{ id: 1 }])
    expect(result).toBe(true)
    expect(fs.writeFileSync).toHaveBeenCalled()
  })

  test("addToCache adds task to cache", () => {
    const fs = require("fs")
    fs.existsSync.mockReturnValue(false)
    const result = offlineManager.addToCache({ id: 1, platform: "weibo" })
    expect(result).toBe(true)
    expect(fs.writeFileSync).toHaveBeenCalled()
  })

  test("onNetworkChange updates offline state", () => {
    offlineManager.onNetworkChange(true)
    expect(offlineManager.isOffline()).toBe(true)

    offlineManager.onNetworkChange(false)
    expect(offlineManager.isOffline()).toBe(false)
  })
})