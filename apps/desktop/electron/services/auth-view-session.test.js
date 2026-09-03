import { describe, it, expect, vi, beforeEach } from "vitest"
const session = require('./auth-view-session')

describe("auth-view-session", () => {
  describe("setCookies", () => {
    it("sets cookies on session", async () => {
      const mockSession = { cookies: { set: vi.fn().mockResolvedValue() } }
      await session.setCookies(mockSession, [{ name: "test", value: "val" }])
      expect(mockSession.cookies.set).toHaveBeenCalledWith([{ name: "test", value: "val" }])
    })
    it("skips when empty", async () => {
      const mockSession = { cookies: { set: vi.fn() } }
      await session.setCookies(mockSession, null)
      expect(mockSession.cookies.set).not.toHaveBeenCalled()
    })
  })

  describe("restoreLocalStorage", () => {
    it("calls did-finish-load with localStorage data", () => {
      const mockExecJs = vi.fn().mockResolvedValue(undefined)
      const mockView = {
        webContents: {
          on: vi.fn(),
          once: vi.fn(),
          executeJavaScript: mockExecJs,
        },
      }
      session.restoreLocalStorage(mockView, { theme: "dark" })

      // Verify did-finish-load handler is registered via once
      expect(mockView.webContents.once).toHaveBeenCalledWith(
        "did-finish-load",
        expect.any(Function)
      )
    })
  })

  describe("restoreIndexedDB", () => {
    it("registers a schema-creating IndexedDB restoration before the page finishes loading", async () => {
      let didFinishLoad
      const mockView = {
        webContents: {
          once: vi.fn((_event, listener) => { didFinishLoad = listener }),
          executeJavaScript: vi.fn().mockResolvedValue(undefined),
        },
      }

      const restored = session.restoreIndexedDB(mockView, { auth: { token: "private" } })

      expect(mockView.webContents.once).toHaveBeenCalledWith(
        "did-finish-load",
        expect.any(Function),
      )
      await didFinishLoad()
      await restored
      expect(mockView.webContents.executeJavaScript).toHaveBeenCalledWith(
        expect.stringContaining("createObjectStore(storeName)"),
      )
      expect(mockView.webContents.executeJavaScript).toHaveBeenCalledWith(
        expect.stringContaining("__multi_publish_indexeddb_key__"),
      )
      expect(mockView.webContents.executeJavaScript).toHaveBeenCalledWith(
        expect.stringContaining("db.version + 1"),
      )
      expect(mockView.webContents.executeJavaScript).toHaveBeenCalledWith(
        expect.stringContaining("Array.isArray(records)"),
      )
    })
  })
})
