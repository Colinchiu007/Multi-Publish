import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

let registerHandlers;

beforeAll(() => {
  registerHandlers = require("./publish");
});

function createMockIpcMain() {
  const handlers = {};
  return {
    handle: vi.fn((channel, fn) => { handlers[channel] = fn; }),
    _callHandler: async (channel, ...args) => {
      if (!handlers[channel]) throw new Error("No handler for " + channel);
      return handlers[channel]({ sender: { send: vi.fn() } }, ...args);
    },
  };
}

function createDeps() {
  return {
    taskQueue: {
      add: vi.fn((task) => "task-" + Date.now()),
      getStatus: vi.fn(() => ({ queued: 0, running: 0, completed: 10, failed: 1 })),
      getHistory: vi.fn(() => [{ id: "t1", status: "completed" }]),
      cancel: vi.fn((id) => id === "valid-id"),
    },
    history: {
      listRecords: vi.fn((opts) => ({ total: 5, records: [] })),
      getRecord: vi.fn((id) => id === "rec-1" ? { id: "rec-1", status: "success" } : null),
      getStats: vi.fn(() => ({ total: 50, byPlatform: {} })),
    },
    BrowserWindow: { getAllWindows: vi.fn(() => []) },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

describe("publish IPC handlers", () => {
  let ipcMain, deps;

  beforeEach(() => {
    ipcMain = createMockIpcMain();
    deps = createDeps();
    registerHandlers(ipcMain, deps);
  });

  it("registers all 8 publish handlers", () => {
    const expected = [
      "publish:wechat", "publish:batch",
      "queue:status", "queue:history", "queue:cancel",
      "history:list", "history:get",
      "dashboard:stats",
    ];
    expect(ipcMain.handle).toHaveBeenCalledTimes(expected.length);
    for (const ch of expected) {
      expect(ipcMain.handle).toHaveBeenCalledWith(ch, expect.any(Function));
    }
  });

  describe("publish:wechat", () => {
    it("adds task to queue when online", async () => {
      const result = await ipcMain._callHandler("publish:wechat", { title: "test" });
      expect(result.code).toBe(0);
      expect(result.data).toHaveProperty("taskId");
    });

    it("returns error code when taskQueue.add throws", async () => {
      deps.taskQueue.add.mockImplementation(() => { throw new Error("queue full"); });
      const result = await ipcMain._callHandler("publish:wechat", { title: "test" });
      expect(result.code).toBe(-100);
      expect(result.message).toBe("queue full");
    });
  });

  describe("publish:batch", () => {
    it("handles string platform list", async () => {
      const result = await ipcMain._callHandler("publish:batch", {
        platforms: ["github", "wechat_mp"],
        article: { title: "批量" },
      });
      expect(result.code).toBe(0);
      expect(result.data.taskIds).toHaveLength(2);
    });

    it("handles object platform list with accountId", async () => {
      const result = await ipcMain._callHandler("publish:batch", {
        platforms: [{ platform: "github", accountId: "acc1" }],
        article: { title: "test" },
      });
      expect(result.code).toBe(0);
      expect(result.data.taskIds).toHaveLength(1);
    });
  });

  describe("queue handlers", () => {
    it("queue:status returns status", async () => {
      const result = await ipcMain._callHandler("queue:status");
      expect(result).toEqual({ queued: 0, running: 0, completed: 10, failed: 1 });
    });

    it("queue:history returns history", async () => {
      const result = await ipcMain._callHandler("queue:history");
      expect(result.code).toBe(0);
      expect(result.data).toHaveLength(1);
    });

    it("queue:cancel succeeds for valid id", async () => {
      const result = await ipcMain._callHandler("queue:cancel", "valid-id");
      expect(result.code).toBe(0);
    });

    it("queue:cancel fails for invalid id", async () => {
      const result = await ipcMain._callHandler("queue:cancel", "invalid-id");
      expect(result.code).toBe(-1);
    });
  });

  describe("history handlers", () => {
    it("history:list returns records", async () => {
      const result = await ipcMain._callHandler("history:list", { page: 1 });
      expect(result.code).toBe(0);
      expect(result.data.total).toBe(5);
    });

    it("history:list handles error", async () => {
      deps.history.listRecords.mockImplementation(() => { throw new Error("DB error"); });
      const result = await ipcMain._callHandler("history:list", {});
      expect(result.code).toBe(-1);
      expect(result.data).toEqual({ total: 0, records: [] });
    });

    it("history:get finds record", async () => {
      const result = await ipcMain._callHandler("history:get", "rec-1");
      expect(result.code).toBe(0);
      expect(result.data.id).toBe("rec-1");
    });

    it("history:get returns error when not found", async () => {
      const result = await ipcMain._callHandler("history:get", "nonexistent");
      expect(result.code).toBe(-1);
      expect(result.message).toBe("记录不存在");
    });
  });

  describe("dashboard:stats", () => {
    it("returns publish stats", async () => {
      const result = await ipcMain._callHandler("dashboard:stats");
      expect(result.code).toBe(0);
      expect(result.data.total).toBe(50);
    });
  });
});
