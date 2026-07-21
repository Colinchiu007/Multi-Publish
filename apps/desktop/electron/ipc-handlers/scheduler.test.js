import { describe, it, expect, vi, beforeAll } from "vitest";

let registerHandlers;
const TRUSTED_EVENT = {
  sender: { send: vi.fn() },
  senderFrame: { url: "app://localhost/index.html" },
};
const UNTRUSTED_EVENT = { senderFrame: { url: "https://evil.example/" } };

beforeAll(async () => {
  const mod = await import("./scheduler");
  registerHandlers = mod.default || mod;
});

function createMockIpcMain() {
  const handlers = {};
  return {
    handle: vi.fn((channel, fn) => { handlers[channel] = fn; }),
    _callHandler: async (channel, ...args) => {
      if (!handlers[channel]) throw new Error(`No handler for ${channel}`);
      return handlers[channel](TRUSTED_EVENT, ...args);
    },
    _callHandlerFrom: async (channel, event, ...args) => {
      if (!handlers[channel]) throw new Error(`No handler for ${channel}`);
      return handlers[channel](event, ...args);
    },
  };
}

describe("scheduler IPC handlers", () => {
  let ipcMain, scheduler;

  beforeEach(() => {
    ipcMain = createMockIpcMain();
    scheduler = {
      create: vi.fn(({ platform, article, publishTime }) => ({
        id: "sched-1", platform, publishTime, status: "pending",
      })),
      list: vi.fn(() => [{ id: "sched-1", status: "pending" }]),
      cancel: vi.fn(),
    };
    registerHandlers(ipcMain, { scheduler });
  });

  it("registers all 3 scheduler handlers", () => {
    expect(ipcMain.handle).toHaveBeenCalledTimes(3);
    expect(ipcMain.handle).toHaveBeenCalledWith("scheduler:create", expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith("scheduler:list", expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith("scheduler:cancel", expect.any(Function));
  });

  describe("scheduler:create", () => {
    it("rejects untrusted senders without creating a task", async () => {
      const result = await ipcMain._callHandlerFrom(
        "scheduler:create",
        UNTRUSTED_EVENT,
        { platform: "github" },
      );
      expect(result).toEqual({ code: -3, message: "未授权的调用来源" });
      expect(scheduler.create).not.toHaveBeenCalled();
    });

  it("creates a scheduled task", async () => {
      const result = await ipcMain._callHandler("scheduler:create", {
        platform: "github",
        article: { title: "test" },
        publishTime: "2026-07-06T10:00:00Z",
      });
      expect(result.code).toBe(0);
      expect(result.data.id).toBe("sched-1");
      expect(scheduler.create).toHaveBeenCalledWith({
        platform: "github",
        article: { title: "test" },
        publishTime: "2026-07-06T10:00:00Z",
      });
    });

    it("returns error when scheduler.create throws", async () => {
      scheduler.create.mockImplementation(() => { throw new Error("Invalid time"); });
      const result = await ipcMain._callHandler("scheduler:create", {});
      expect(result.code).toBe(-1);
      expect(result.message).toBe("Invalid time");
    });
  });

  it("创建、列表和取消都绑定当前登录用户 sub", async () => {
    const identityService = {
      getState: vi.fn(() => ({ status: "authenticated", user: { sub: "user-a" } })),
    };
    ipcMain = createMockIpcMain();
    scheduler = {
      create: vi.fn((task) => ({ id: "sched-a", ...task, status: "pending" })),
      list: vi.fn(() => []),
      cancel: vi.fn(() => true),
    };
    registerHandlers(ipcMain, { scheduler, identityService });

    await ipcMain._callHandler("scheduler:create", {
      platform: "douyin", article: {}, publishTime: "2026-07-06T10:00:00Z",
    });
    await ipcMain._callHandler("scheduler:list");
    await ipcMain._callHandler("scheduler:cancel", "sched-a");

    expect(scheduler.create).toHaveBeenCalledWith(expect.objectContaining({ owner_subject: "user-a" }));
    expect(scheduler.list).toHaveBeenCalledWith("user-a");
    expect(scheduler.cancel).toHaveBeenCalledWith("sched-a", "user-a");
  });

  describe("scheduler:list", () => {
    it("lists scheduled tasks", async () => {
      const result = await ipcMain._callHandler("scheduler:list");
      expect(result.code).toBe(0);
      expect(result.data).toHaveLength(1);
    });

    it("returns empty array on error", async () => {
      scheduler.list.mockImplementation(() => { throw new Error("DB error"); });
      const result = await ipcMain._callHandler("scheduler:list");
      expect(result.code).toBe(-1);
      expect(result.data).toEqual([]);
    });
  });

  describe("scheduler:cancel", () => {
    it("cancels a scheduled task", async () => {
      const result = await ipcMain._callHandler("scheduler:cancel", "sched-1");
      expect(result.code).toBe(0);
      expect(scheduler.cancel).toHaveBeenCalledWith("sched-1");
    });
  });
});
