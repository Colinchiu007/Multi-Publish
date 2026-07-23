import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock logger
vi.mock("../services/logger", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

let registerHandlers;
const TRUSTED_EVENT = { senderFrame: { url: "app://localhost/index.html" } };
const UNTRUSTED_EVENT = { senderFrame: { url: "https://evil.example/" } };

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
      return handlers[channel](TRUSTED_EVENT, ...args);
    },
    _callHandlerFrom: async (channel, event, ...args) => {
      if (!handlers[channel]) throw new Error(`No handler for ${channel}`);
      return handlers[channel](event, ...args);
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
    getUserSetting: vi.fn(),
    setUserSetting: vi.fn(),
  };
}

describe("store IPC handlers", () => {
  let ipcMain;
  let mockStore;
  let credentialStore;
  let accountStateRestorer;
  let pythonBridge;

  beforeEach(() => {
    ipcMain = createMockIpcMain();
    mockStore = createMockStore();
    credentialStore = {
      hasCredential: vi.fn().mockReturnValue(true),
      deleteCredential: vi.fn().mockReturnValue(true),
    };
    accountStateRestorer = { deleteAccountRecord: vi.fn() };
    pythonBridge = { requestBackend: vi.fn() };
    registerHandlers(ipcMain, {
      app: { getPath: vi.fn(() => "C:\\test-user-data") },
      store: mockStore,
      credentialStore,
      accountStateRestorer,
      pythonBridge,
    });
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
    it("rejects untrusted senders without writing", async () => {
      const result = await ipcMain._callHandlerFrom(
        "store:add-account",
        UNTRUSTED_EVENT,
        { id: "acc1" },
      );
      expect(result).toEqual({ code: -3, message: "未授权的调用来源" });
      expect(mockStore.addAccount).not.toHaveBeenCalled();
    });

    it("returns code 0 on success", async () => {
      mockStore.addAccount.mockReturnValue(true);
      const result = await ipcMain._callHandler("store:add-account", { id: "acc1", platform: "github" });
      expect(result).toEqual({ code: 0, data: true });
      expect(mockStore.addAccount).toHaveBeenCalledWith({ id: "acc1", platform: "github" });
    });

    it("rejects credential-bearing renderer input before persistence", async () => {
      const result = await ipcMain._callHandler("store:add-account", {
        id: "acc1",
        platform: "github",
        name: "公开名称",
        cookies: [{ name: "session", value: "secret" }],
        localStorage: { token: "private" },
        token: "private",
      });

      expect(result).toEqual({ code: -2, message: "账号创建仅支持公开字段" });
      expect(mockStore.addAccount).not.toHaveBeenCalled();
    });

    it("passes only the supported public fields to persistence", async () => {
      mockStore.addAccount.mockReturnValue(true);
      const result = await ipcMain._callHandler("store:add-account", {
        id: "acc1",
        platform: "github",
        name: "公开名称",
        avatar: "avatar.png",
        status: "active",
        ignored: "must not reach store",
      });

      expect(result).toEqual({ code: -2, message: "账号创建仅支持公开字段" });
      expect(mockStore.addAccount).not.toHaveBeenCalled();
    });

    it("accepts a complete public account record", async () => {
      mockStore.addAccount.mockReturnValue(true);
      const result = await ipcMain._callHandler("store:add-account", {
        id: "acc1",
        platform: "github",
        name: "公开名称",
        avatar: "avatar.png",
        status: "active",
      });

      expect(result).toEqual({ code: 0, data: true });
      expect(mockStore.addAccount).toHaveBeenCalledWith({
        id: "acc1",
        platform: "github",
        name: "公开名称",
        avatar: "avatar.png",
        status: "active",
      });
    });

    it("returns code -1 on failure", async () => {
      mockStore.addAccount.mockReturnValue(false);
      const result = await ipcMain._callHandler("store:add-account", { id: "acc1" });
      expect(result).toEqual({ code: -1, data: false });
    });
  });

  describe("store:get-account", () => {
    it("returns only public account data when found", async () => {
      const account = {
        id: "acc1",
        platform: "github",
        name: "test",
        cookies: [{ name: "session", value: "secret" }],
        localStorage: { token: "private" },
      };
      mockStore.getAccount.mockReturnValue(account);
      const result = await ipcMain._callHandler("store:get-account", "acc1");
      expect(result).toEqual({
        code: 0,
        data: {
          id: "acc1",
          platform: "github",
          name: "test",
          account_name: "test",
          status: "active",
          is_default: false,
          has_cookies: true,
          cookie_count: 1,
          has_auth_data: true,
        },
      });
      expect(result.data).not.toHaveProperty("cookies");
      expect(result.data).not.toHaveProperty("localStorage");
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
      const accounts = [
        { id: "acc1", platform: "github", cookies: [{ name: "session" }] },
        { id: "acc2", platform: "github", localStorage: { token: "private" } },
      ];
      mockStore.listAccounts.mockReturnValue(accounts);
      const result = await ipcMain._callHandler("store:list-accounts", "github");
      expect(result.code).toBe(0);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).not.toHaveProperty("cookies");
      expect(result.data[1]).not.toHaveProperty("localStorage");
      expect(result.data[0]).toMatchObject({ id: "acc1", has_cookies: true, cookie_count: 1 });
      expect(result.data[1]).toMatchObject({ id: "acc2", has_auth_data: true });
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
      mockStore.getAccount.mockReturnValue({ id: "acc1", platform: "github" });
      mockStore.deleteAccount.mockReturnValue(true);
      const result = await ipcMain._callHandler("store:delete-account", "acc1");
      expect(result).toEqual({ code: 0, data: true });
      expect(mockStore.deleteAccount).toHaveBeenCalledWith("acc1");
      expect(credentialStore.deleteCredential).toHaveBeenCalledWith("acc1", "C:\\test-user-data");
      expect(accountStateRestorer.deleteAccountRecord).toHaveBeenCalledWith("github", "acc1");
    });

    it("加密凭据删除失败时保留账号记录并返回错误", async () => {
      mockStore.getAccount.mockReturnValue({ id: "acc1", platform: "github" });
      credentialStore.deleteCredential.mockReturnValue(false);

      const result = await ipcMain._callHandler("store:delete-account", "acc1");

      expect(result).toEqual({ code: -1, message: "删除账号加密凭据失败" });
      expect(mockStore.deleteAccount).not.toHaveBeenCalled();
      expect(accountStateRestorer.deleteAccountRecord).not.toHaveBeenCalled();
    });

    it("账号不存在时不会误删其他平台的登录状态", async () => {
      mockStore.getAccount.mockReturnValue(null);

      const result = await ipcMain._callHandler("store:delete-account", "missing");

      expect(result).toEqual({ code: -10, message: "账号不存在" });
      expect(mockStore.deleteAccount).not.toHaveBeenCalled();
      expect(credentialStore.deleteCredential).not.toHaveBeenCalled();
      expect(accountStateRestorer.deleteAccountRecord).not.toHaveBeenCalled();
    });
  });

  describe("store:set-default-account", () => {
    it("sets default and returns code 0", async () => {
      mockStore.setDefaultAccount.mockReturnValue(true);
      const result = await ipcMain._callHandler("store:set-default-account", { platform: "github", accountId: "acc1" });
      expect(result).toEqual({ code: 0, data: true });
      expect(mockStore.setDefaultAccount).toHaveBeenCalledWith("github", "acc1");
    });

    it("拒绝不存在或不属于指定平台的默认账号", async () => {
      mockStore.setDefaultAccount.mockReturnValue(false);

      const result = await ipcMain._callHandler("store:set-default-account", { platform: "github", accountId: "other" });

      expect(result).toEqual({ code: -2, message: "账号不存在或不属于指定平台" });
    });

    it("SQLite 中没有账号时，校验后端账号归属并保存默认账号设置", async () => {
      mockStore.setDefaultAccount.mockReturnValue(false);
      pythonBridge.requestBackend.mockResolvedValue({
        code: 0,
        data: [{ id: "acc1", platform: "github" }],
      });

      const result = await ipcMain._callHandler("store:set-default-account", { platform: "github", accountId: "acc1" });

      expect(result).toEqual({ code: 0, data: true });
      expect(mockStore.setSetting).toHaveBeenCalledWith("default_account:github", "acc1");
    });

    it.each([
      [null, "缺少参数对象"],
      [{ platform: "", accountId: "acc1" }, "平台和账号不能为空"],
      [{ platform: "github", accountId: null }, "平台和账号不能为空"],
    ])("参数无效时返回校验错误", async (arg, message) => {
      const result = await ipcMain._callHandler("store:set-default-account", arg);

      expect(result).toEqual({ code: -2, message });
      expect(mockStore.setDefaultAccount).not.toHaveBeenCalled();
    });
  });

  describe("store:get-default-account", () => {
    it("returns account when found", async () => {
      const account = { id: "acc1", platform: "github", cookies: [{ name: "session", value: "secret" }] };
      mockStore.getDefaultAccount.mockReturnValue(account);
      const result = await ipcMain._callHandler("store:get-default-account", "github");
      expect(result.code).toBe(0);
      expect(result.data).toMatchObject({ id: "acc1", platform: "github", has_cookies: true });
      expect(result.data).not.toHaveProperty("cookies");
    });

    it("returns code -10 (NOT_FOUND) when not set", async () => {
      mockStore.getDefaultAccount.mockReturnValue(null);
      const result = await ipcMain._callHandler("store:get-default-account", "github");
      expect(result).toEqual({ code: -10, data: null });
    });
  });

  describe("store:update-account", () => {
    it("updates and returns code 0", async () => {
      const fields = { name: "new_name" };
      mockStore.getAccount.mockReturnValue({ id: "acc1" });
      mockStore.updateAccount.mockReturnValue(true);
      const result = await ipcMain._callHandler("store:update-account", { id: "acc1", fields });
      expect(result).toEqual({ code: 0, data: true });
      expect(mockStore.updateAccount).toHaveBeenCalledWith("acc1", fields);
    });

    it("rejects missing accounts and empty update fields", async () => {
      mockStore.getAccount.mockReturnValue(null);
      const missing = await ipcMain._callHandler("store:update-account", { id: "missing", fields: { name: "new" } });
      const invalid = await ipcMain._callHandler("store:update-account", { id: "acc1", fields: {} });

      expect(missing).toEqual({ code: -10, message: "账号不存在" });
      expect(invalid).toEqual({ code: -2, message: "缺少可更新字段" });
      expect(mockStore.updateAccount).not.toHaveBeenCalled();
    });

    it("returns validation error when store rejects all update fields", async () => {
      mockStore.getAccount.mockReturnValue({ id: "acc1" });
      mockStore.updateAccount.mockReturnValue(false);

      const result = await ipcMain._callHandler("store:update-account", { id: "acc1", fields: { unknown: true } });

      expect(result).toEqual({ code: -2, message: "没有可更新的账号字段" });
    });

    it("rejects credential fields from the renderer", async () => {
      mockStore.getAccount.mockReturnValue({ id: "acc1" });

      const result = await ipcMain._callHandler("store:update-account", {
        id: "acc1",
        fields: {
          cookies: [{ name: "session", value: "attacker" }],
          localStorage: { token: "attacker" },
        },
      });

      expect(result).toEqual({ code: -2, message: "没有可更新的账号字段" });
      expect(mockStore.updateAccount).not.toHaveBeenCalled();
    });
  });

  it.each([
    ["store:get-account", ["acc1"]],
    ["store:list-accounts", ["github"]],
    ["store:get-default-account", ["github"]],
    ["store:list-publish-history", [{}]],
    ["store:get-publish-stats", []],
    ["store:list-scheduled-tasks", []],
    ["store:get-setting", ["theme"]],
    ["store:list-callback-logs", [10]],
    ["draftList", []],
  ])("%s rejects untrusted senders", async (channel, args) => {
    const result = await ipcMain._callHandlerFrom(channel, UNTRUSTED_EVENT, ...args);

    expect(result).toEqual({ code: -3, message: "未授权的调用来源" });
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
      mockStore.deleteTask.mockReturnValue(true);
      const result = await ipcMain._callHandler("store:delete-task", "task1");
      expect(result).toEqual({ code: 0, data: true });
      expect(mockStore.deleteTask).toHaveBeenCalledWith("task1");
    });

    it("returns validation/not-found errors instead of false success", async () => {
      const invalid = await ipcMain._callHandler("store:delete-task", "");
      mockStore.deleteTask.mockReturnValue(false);
      const missing = await ipcMain._callHandler("store:delete-task", "missing");

      expect(invalid).toEqual({ code: -2, message: "任务 ID 不能为空" });
      expect(missing).toEqual({ code: -10, message: "定时任务不存在" });
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

  describe("Logto owner_subject 隔离", () => {
    it("账号、历史和定时任务调用都使用当前登录用户 sub", async () => {
      const identityService = {
        getState: vi.fn(() => ({ status: "authenticated", user: { sub: "user-a" } })),
      };
      ipcMain = createMockIpcMain();
      mockStore = createMockStore();
      mockStore.getAccount.mockReturnValue({ id: "acc1", platform: "github" });
      mockStore.listAccounts.mockReturnValue([]);
      mockStore.listPublishHistory.mockReturnValue({ total: 0, records: [] });
      mockStore.getPublishStats.mockReturnValue({ total: 0 });
      mockStore.listScheduledTasks.mockReturnValue([]);
      registerHandlers(ipcMain, { store: mockStore, identityService });

      await ipcMain._callHandler("store:add-account", { id: "acc1", owner_subject: "forged" });
      await ipcMain._callHandler("store:get-account", "acc1");
      await ipcMain._callHandler("store:list-accounts", "github");
      await ipcMain._callHandler("store:add-publish-record", { id: "history-1" });
      await ipcMain._callHandler("store:list-publish-history", {});
      await ipcMain._callHandler("store:get-publish-stats");
      await ipcMain._callHandler("store:add-scheduled-task", { id: "task-1" });
      await ipcMain._callHandler("store:list-scheduled-tasks");
      await ipcMain._callHandler("store:delete-task", "task-1");

      expect(mockStore.addAccount).toHaveBeenCalledWith(
        { id: "acc1", owner_subject: "forged" },
        "user-a",
      );
      expect(mockStore.getAccount).toHaveBeenCalledWith("acc1", "user-a");
      expect(mockStore.listAccounts).toHaveBeenCalledWith("github", "user-a");
      expect(mockStore.addPublishRecord).toHaveBeenCalledWith({ id: "history-1" }, "user-a");
      expect(mockStore.listPublishHistory).toHaveBeenCalledWith({}, "user-a");
      expect(mockStore.getPublishStats).toHaveBeenCalledWith("user-a");
      expect(mockStore.addScheduledTask).toHaveBeenCalledWith({ id: "task-1" }, "user-a");
      expect(mockStore.listScheduledTasks).toHaveBeenCalledWith("user-a");
      expect(mockStore.deleteTask).toHaveBeenCalledWith("task-1", "user-a");
    });

  it("身份服务存在但 sub 缺失时拒绝读取 legacy 数据", async () => {
      ipcMain = createMockIpcMain();
      mockStore = createMockStore();
      registerHandlers(ipcMain, {
        store: mockStore,
        identityService: { getState: () => ({ status: "authenticated", user: null }) },
      });

      const result = await ipcMain._callHandler("store:list-accounts");

      expect(result).toMatchObject({ code: -3 });
      expect(mockStore.listAccounts).not.toHaveBeenCalled();
    });

    it("删除账号时向凭证和状态清理传递完整 owner 上下文", async () => {
      const identityService = {
        getState: () => ({ status: "authenticated", user: { sub: "user-a" } }),
      };
      const credentialStore = {
        hasCredential: vi.fn(() => true),
        deleteCredential: vi.fn(() => true),
      };
      const accountStateRestorer = { deleteAccountRecord: vi.fn() };
      ipcMain = createMockIpcMain();
      mockStore = createMockStore();
      mockStore.getAccount.mockReturnValue({ id: "acc1", platform: "douyin" });
      mockStore.deleteAccount.mockReturnValue(true);
      registerHandlers(ipcMain, {
        store: mockStore,
        identityService,
        credentialStore,
        accountStateRestorer,
        userDataDir: "C:/test-user-data",
      });

      const result = await ipcMain._callHandler("store:delete-account", "acc1");

      expect(result).toMatchObject({ code: 0, data: true });
      expect(credentialStore.deleteCredential).toHaveBeenCalledWith(
        "acc1", "C:/test-user-data", "user-a",
      );
      expect(credentialStore.hasCredential).toHaveBeenCalledWith(
        "acc1", "C:/test-user-data", "user-a",
      );
      expect(accountStateRestorer.deleteAccountRecord).toHaveBeenCalledWith(
        "douyin", "acc1", "user-a", "C:/test-user-data",
      );
    });
  });

    it("草稿 IPC 使用当前用户的 scoped setting，不共享 drafts 键", async () => {
      const identityService = {
        getState: vi.fn(() => ({ status: "authenticated", user: { sub: "user-a" } })),
      };
      ipcMain = createMockIpcMain();
      mockStore = createMockStore();
      mockStore.getUserSetting.mockReturnValue([]);
      registerHandlers(ipcMain, { store: mockStore, identityService });

      await ipcMain._callHandler("draftSave", { id: "draft-a", title: "A" });
      await ipcMain._callHandler("draftList");
      await ipcMain._callHandler("draftDelete", "draft-a");

      expect(mockStore.getUserSetting).toHaveBeenCalledWith("drafts", [], "user-a");
      const setCall = mockStore.setUserSetting.mock.calls[0];
      expect(setCall[0]).toBe("drafts");
      expect(JSON.parse(setCall[1])).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "draft-a" }),
      ]));
      expect(setCall[2]).toBe("user-a");
    });

    it("通用 setting IPC 也必须使用当前用户命名空间", async () => {
      const identityService = {
        getState: vi.fn(() => ({ status: "authenticated", user: { sub: "user-a" } })),
      };
      ipcMain = createMockIpcMain();
      mockStore = createMockStore();
      mockStore.getUserSetting.mockReturnValue("value-a");
      registerHandlers(ipcMain, { store: mockStore, identityService });

      await expect(ipcMain._callHandler("store:get-setting", "theme")).resolves.toEqual({
        code: 0,
        data: "value-a",
      });
      await expect(ipcMain._callHandler("store:set-setting", "theme", "dark")).resolves.toMatchObject({ code: 0 });
      expect(mockStore.getSetting).not.toHaveBeenCalled();
      expect(mockStore.setSetting).not.toHaveBeenCalled();
      expect(mockStore.getUserSetting).toHaveBeenCalledWith("theme", null, "user-a");
      expect(mockStore.setUserSetting).toHaveBeenCalledWith("theme", "dark", "user-a");
    });

    it("删除不存在或不属于当前用户的任务返回 NOT_FOUND", async () => {
      const identityService = {
        getState: vi.fn(() => ({ status: "authenticated", user: { sub: "user-a" } })),
      };
      ipcMain = createMockIpcMain();
      mockStore = createMockStore();
      mockStore.deleteTask.mockReturnValue(false);
      registerHandlers(ipcMain, { store: mockStore, identityService });

      const result = await ipcMain._callHandler("store:delete-task", "task-from-b");

      expect(result).toMatchObject({ code: -10, data: false });
      expect(mockStore.deleteTask).toHaveBeenCalledWith("task-from-b", "user-a");
    });

    it("设置默认账号时拒绝跨用户后端回退，也不写 legacy setting", async () => {
      const identityService = {
        getState: vi.fn(() => ({ status: "authenticated", user: { sub: "user-a" } })),
      };
      ipcMain = createMockIpcMain();
      mockStore = createMockStore();
      mockStore.setDefaultAccount.mockReturnValue(false);
      pythonBridge.requestBackend.mockResolvedValue({
        code: 0,
        data: [{ id: "account-from-user-b", platform: "github" }],
      });
      registerHandlers(ipcMain, { store: mockStore, identityService, pythonBridge });

      await expect(ipcMain._callHandler("store:set-default-account", {
        platform: "github",
        accountId: "account-from-user-b",
      })).resolves.toEqual({ code: -2, message: "账号不存在或不属于指定平台" });
      expect(pythonBridge.requestBackend).not.toHaveBeenCalled();
      expect(mockStore.setSetting).not.toHaveBeenCalled();
    });

    it("Logto 用户设置默认账号时不写全局 legacy setting", async () => {
      const identityService = {
        getState: vi.fn(() => ({ status: "authenticated", user: { sub: "user-a" } })),
      };
      ipcMain = createMockIpcMain();
      mockStore = createMockStore();
      mockStore.setDefaultAccount.mockReturnValue(true);
      registerHandlers(ipcMain, { store: mockStore, identityService, pythonBridge });

      await expect(ipcMain._callHandler("store:set-default-account", {
        platform: "github",
        accountId: "account-from-user-a",
      })).resolves.toEqual({ code: 0, data: true });
      expect(mockStore.setDefaultAccount).toHaveBeenCalledWith(
        "github", "account-from-user-a", "user-a",
      );
      expect(mockStore.setSetting).not.toHaveBeenCalled();
    });
});
