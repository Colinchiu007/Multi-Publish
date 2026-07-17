import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock logger
vi.mock("../services/logger", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

let registerHandlers;

beforeAll(async () => {
  const mod = await import("./store");
  registerHandlers = mod.default || mod;
});

function createMockIpcMain() {
  const handlers = {};
  return {
    handle: vi.fn((channel, fn) => {
      handlers[channel] = fn;
    }),
    _getHandler: (channel) => handlers[channel],
    _callHandler: async (channel, ...args) => {
      if (!handlers[channel]) throw new Error(`No handler for ${channel}`);
      return handlers[channel]({} , ...args);
    },
  };
}

function createMockStore() {
  return {
    addAccount: vi.fn(),
    getAccount: vi.fn(),
    listAccounts: vi.fn(),
    deleteAccount: vi.fn(),
    setDefaultAccount: vi.fn(),
    getDefaultAccount: vi.fn(),
    updateAccount: vi.fn(),
    addPublishRecord: vi.fn(),
    listPublishHistory: vi.fn(),
    getPublishStats: vi.fn(),
    addScheduledTask: vi.fn(),
    listScheduledTasks: vi.fn(),
    deleteTask: vi.fn(),
    getSetting: vi.fn(),
    setSetting: vi.fn(),
    listCallbackLogs: vi.fn(),
  };
}

describe("store IPC handlers", () => {
  let ipcMain;
  let mockStore;

  beforeEach(() => {
    ipcMain = createMockIpcMain();
    mockStore = createMockStore();
    registerHandlers(ipcMain, { store: mockStore });
  });

  it("registers all 19 store handlers", () => {
    const expected = [
      "store:add-account",
      "store:get-account",
      "store:list-accounts",
      "store:delete-account",
      "store:set-default-account",
      "store:get-default-account",
      "store:update-account",
      "store:add-publish-record",
      "store:list-publish-history",
      "store:get-publish-stats",
      "store:add-scheduled-task",
      "store:list-scheduled-tasks",
      "store:delete-task",
      "store:get-setting",
      "store:set-setting",
      "store:list-callback-logs",
      "draftSave",
      "draftList",
      "draftDelete",
    ];
    expect(ipcMain.handle).toHaveBeenCalledTimes(expected.length);
    for (const ch of expected) {
      expect(ipcMain.handle).toHaveBeenCalledWith(ch, expect.any(Function));
    }
  });

  describe("store:add-account", () => {
    it("returns code 0 on success", async () => {
      mockStore.addAccount.mockReturnValue(true);
      const result = await ipcMain._callHandler("store:add-account", { id: "acc1", platform: "github" });
      expect(result).toEqual({ code: 0, data: true });
      expect(mockStore.addAccount).toHaveBeenCalledWith({ id: "acc1", platform: "github" });
    });

    it("returns code -1 on failure", async () => {
      mockStore.addAccount.mockReturnValue(false);
      const result = await ipcMain._callHandler("store:add-account", { id: "acc1" });
      expect(result).toEqual({ code: -1, data: false });
    });
  });

  describe("store:get-account", () => {
    it("returns account data when found", async () => {
      const account = { id: "acc1", platform: "github", username: "test" };
      mockStore.getAccount.mockReturnValue(account);
      const result = await ipcMain._callHandler("store:get-account", "acc1");
      expect(result).toEqual({ code: 0, data: account });
      expect(mockStore.getAccount).toHaveBeenCalledWith("acc1");
    });

    it("returns code -10 (NOT_FOUND) when not found", async () => {
      mockStore.getAccount.mockReturnValue(null);
      const result = await ipcMain._callHandler("store:get-account", "nonexistent");
      expect(result).toEqual({ code: -10, data: null });
    });
  });

  describe("store:list-accounts", () => {
    it("returns all accounts for platform", async () => {
      const accounts = [{ id: "acc1" }, { id: "acc2" }];
      mockStore.listAccounts.mockReturnValue(accounts);
      const result = await ipcMain._callHandler("store:list-accounts", "github");
      expect(result).toEqual({ code: 0, data: accounts });
      expect(mockStore.listAccounts).toHaveBeenCalledWith("github");
    });

    it("works without platform filter", async () => {
      mockStore.listAccounts.mockReturnValue([]);
      const result = await ipcMain._callHandler("store:list-accounts");
      expect(result).toEqual({ code: 0, data: [] });
    });
  });

  describe("store:delete-account", () => {
    it("deletes and returns code 0", async () => {
      const result = await ipcMain._callHandler("store:delete-account", "acc1");
      expect(result).toEqual({ code: 0, data: true });
      expect(mockStore.deleteAccount).toHaveBeenCalledWith("acc1");
    });
  });

  describe("store:set-default-account", () => {
    it("sets default and returns code 0", async () => {
      const result = await ipcMain._callHandler("store:set-default-account", { platform: "github", accountId: "acc1" });
      expect(result).toEqual({ code: 0, data: true });
      expect(mockStore.setDefaultAccount).toHaveBeenCalledWith("github", "acc1");
    });
  });

  describe("store:get-default-account", () => {
    it("returns account when found", async () => {
      const account = { id: "acc1" };
      mockStore.getDefaultAccount.mockReturnValue(account);
      const result = await ipcMain._callHandler("store:get-default-account", "github");
      expect(result).toEqual({ code: 0, data: account });
    });

    it("returns code -10 (NOT_FOUND) when not set", async () => {
      mockStore.getDefaultAccount.mockReturnValue(null);
      const result = await ipcMain._callHandler("store:get-default-account", "github");
      expect(result).toEqual({ code: -10, data: null });
    });
  });

  describe("store:update-account", () => {
    it("updates and returns code 0", async () => {
      const fields = { username: "new_name" };
      const result = await ipcMain._callHandler("store:update-account", { id: "acc1", fields });
      expect(result).toEqual({ code: 0, data: true });
      expect(mockStore.updateAccount).toHaveBeenCalledWith("acc1", fields);
    });
  });

  describe("store:add-publish-record", () => {
    it("returns id on success", async () => {
      mockStore.addPublishRecord.mockReturnValue("rec123");
      const record = { platform: "github", status: "success" };
      const result = await ipcMain._callHandler("store:add-publish-record", record);
      expect(result).toEqual({ code: 0, data: { id: "rec123" } });
      expect(mockStore.addPublishRecord).toHaveBeenCalledWith(record);
    });

    it("returns code -1 on failure", async () => {
      mockStore.addPublishRecord.mockReturnValue(null);
      const result = await ipcMain._callHandler("store:add-publish-record", {});
      expect(result).toEqual({ code: -1, data: { id: null } });
    });
  });

  describe("store:list-publish-history", () => {
    it("returns history data", async () => {
      const history = [{ id: "rec1" }];
      mockStore.listPublishHistory.mockReturnValue(history);
      const result = await ipcMain._callHandler("store:list-publish-history", { limit: 10 });
      expect(result).toEqual({ code: 0, data: history });
      expect(mockStore.listPublishHistory).toHaveBeenCalledWith({ limit: 10 });
    });
  });

  describe("store:get-publish-stats", () => {
    it("returns stats", async () => {
      const stats = { total: 42, byPlatform: {} };
      mockStore.getPublishStats.mockReturnValue(stats);
      const result = await ipcMain._callHandler("store:get-publish-stats");
      expect(result).toEqual({ code: 0, data: stats });
    });
  });

  describe("store:add-scheduled-task", () => {
    it("returns id on success", async () => {
      mockStore.addScheduledTask.mockReturnValue("task123");
      const task = { platform: "github", time: "2026-07-06T10:00:00Z" };
      const result = await ipcMain._callHandler("store:add-scheduled-task", task);
      expect(result).toEqual({ code: 0, data: { id: "task123" } });
      expect(mockStore.addScheduledTask).toHaveBeenCalledWith(task);
    });

    it("returns code -1 on failure", async () => {
      mockStore.addScheduledTask.mockReturnValue(null);
      const result = await ipcMain._callHandler("store:add-scheduled-task", {});
      expect(result).toEqual({ code: -1, data: { id: null } });
    });
  });

  describe("store:list-scheduled-tasks", () => {
    it("returns scheduled tasks", async () => {
      const tasks = [{ id: "task1" }];
      mockStore.listScheduledTasks.mockReturnValue(tasks);
      const result = await ipcMain._callHandler("store:list-scheduled-tasks");
      expect(result).toEqual({ code: 0, data: tasks });
    });
  });

  describe("store:delete-task", () => {
    it("deletes and returns code 0", async () => {
      const result = await ipcMain._callHandler("store:delete-task", "task1");
      expect(result).toEqual({ code: 0, data: true });
      expect(mockStore.deleteTask).toHaveBeenCalledWith("task1");
    });
  });

  describe("store:get-setting", () => {
    it("returns setting value", async () => {
      mockStore.getSetting.mockReturnValue("dark");
      const result = await ipcMain._callHandler("store:get-setting", "theme");
      expect(result).toEqual({ code: 0, data: "dark" });
      expect(mockStore.getSetting).toHaveBeenCalledWith("theme");
    });
  });

  describe("store:set-setting", () => {
    it("sets setting and returns code 0", async () => {
      const result = await ipcMain._callHandler("store:set-setting", "theme", "light");
      expect(result).toEqual({ code: 0, data: true });
      expect(mockStore.setSetting).toHaveBeenCalledWith("theme", "light");
    });
  });

  describe("store:list-callback-logs", () => {
    it("returns callback logs", async () => {
      const logs = [{ id: "log1" }];
      mockStore.listCallbackLogs.mockReturnValue(logs);
      const result = await ipcMain._callHandler("store:list-callback-logs", 20);
      expect(result).toEqual({ code: 0, data: logs });
      expect(mockStore.listCallbackLogs).toHaveBeenCalledWith(20);
    });
  });
});