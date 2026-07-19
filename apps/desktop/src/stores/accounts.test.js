import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@/api/publisher", () => ({
  listAccounts: vi.fn(),
  accountDelete: vi.fn(),
  accountSetDefault: vi.fn(),
  accountUpdate: vi.fn(),
}));

import { useAccountStore } from "./accounts.js";
import {
  accountDelete,
  accountSetDefault,
  accountUpdate,
  listAccounts,
} from "@/api/publisher";

const accountsFixture = [
  { id: "wx-1", platform: "wechat_mp", name: "Beta", status: "active", created_at: "2026-02-01" },
  { id: "zh-1", platform: "zhihu", account_name: "Alpha", status: "offline", created_at: "2026-01-01" },
  { id: "wx-2", platform: "wechat_mp", name: "Gamma", status: "online", created_at: null },
];

describe("useAccountStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    vi.resetAllMocks();
    localStorage.clear();
    delete window.electronAPI;
    listAccounts.mockResolvedValue({ code: 0, data: [] });
  });

  describe("初始状态与加载", () => {
    it("初始化所有公开状态和 getter", () => {
      const store = useAccountStore();

      expect(store.accounts).toEqual([]);
      expect(store.groups).toEqual([]);
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
      expect(store.searchQuery).toBe("");
      expect(store.filterStatus).toBe("all");
      expect(store.filterPlatform).toBe("");
      expect(store.sortBy).toBe("name");
      expect(store.sortOrder).toBe("asc");
      expect(store.selectedIds).toEqual(new Set());
      expect(store.isAllSelected).toBe(false);
      expect(store.byPlatform).toEqual({});
      expect(store.filteredAccounts).toEqual([]);
      expect(store.groupedByPlatform).toEqual([]);
    });

    it("从标准成功响应加载账号并恢复本地分组", async () => {
      const groups = [{ id: "grp-1", name: "公众号" }];
      localStorage.setItem("mp_account_groups", JSON.stringify(groups));
      listAccounts.mockResolvedValue({ code: 0, data: accountsFixture });
      const store = useAccountStore();

      await store.load();

      expect(store.accounts).toEqual(accountsFixture);
      expect(store.groups).toEqual(groups);
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
    });

    it("兼容直接返回数组的响应", async () => {
      listAccounts.mockResolvedValue(accountsFixture);
      const store = useAccountStore();

      await store.load();

      expect(store.accounts).toEqual(accountsFixture);
    });

    it.each([
      ["空响应", null],
      ["非零状态码", { code: 1, data: accountsFixture }],
      ["data 不是数组", { code: 0, data: {} }],
    ])("%s 时清空已有账号", async (_label, response) => {
      listAccounts.mockResolvedValue(response);
      const store = useAccountStore();
      store.accounts = accountsFixture;

      await store.load();

      expect(store.accounts).toEqual([]);
      expect(store.loading).toBe(false);
    });

    it("请求期间设置 loading，完成后恢复", async () => {
      let resolveRequest;
      listAccounts.mockImplementation(() => new Promise(resolve => { resolveRequest = resolve; }));
      const store = useAccountStore();

      const pending = store.load();
      expect(store.loading).toBe(true);
      resolveRequest({ code: 0, data: [] });
      await pending;

      expect(store.loading).toBe(false);
    });

    it("请求失败时清空已有账号、记录错误并结束 loading", async () => {
      listAccounts.mockRejectedValue(new Error("network"));
      const store = useAccountStore();
      store.accounts = accountsFixture;

      await store.load();

      expect(store.accounts).toEqual([]);
      expect(store.error).toBe("network");
      expect(store.loading).toBe(false);
    });

    it("重复加载会替换数据并清除上一次错误", async () => {
      listAccounts
        .mockRejectedValueOnce(new Error("temporary"))
        .mockResolvedValueOnce({ code: 0, data: accountsFixture });
      const store = useAccountStore();

      await store.load();
      await store.load();

      expect(listAccounts).toHaveBeenCalledTimes(2);
      expect(store.accounts).toEqual(accountsFixture);
      expect(store.error).toBeNull();
    });
  });

  describe("账号 getter、筛选与排序", () => {
    it("按平台聚合账号，包括缺少 platform 的账号", () => {
      const store = useAccountStore();
      store.accounts = [...accountsFixture, { id: "unknown" }];

      expect(store.byPlatform.wechat_mp).toHaveLength(2);
      expect(store.byPlatform.zhihu).toHaveLength(1);
      expect(store.byPlatform.undefined).toEqual([{ id: "unknown" }]);
    });

    it.each([
      ["名称", "be", ["wx-1"]],
      ["账号名", "ALP", ["zh-1"]],
      ["平台", "WECHAT", ["wx-1", "wx-2"]],
      ["无匹配", "missing", []],
    ])("搜索支持%s并忽略大小写", (_label, query, expectedIds) => {
      const store = useAccountStore();
      store.accounts = accountsFixture;
      store.searchQuery = query;

      expect(store.filteredAccounts.map(account => account.id)).toEqual(expectedIds);
    });

    it("搜索时账号缺少所有可搜索字段也不会报错", () => {
      const store = useAccountStore();
      store.accounts = [{ id: "empty" }];
      store.searchQuery = "query";

      expect(store.filteredAccounts).toEqual([]);
    });

    it("状态筛选将 active 和 online 视为活跃", () => {
      const store = useAccountStore();
      store.accounts = accountsFixture;

      store.filterStatus = "active";
      expect(store.filteredAccounts.map(account => account.id)).toEqual(["wx-1", "wx-2"]);

      store.filterStatus = "inactive";
      expect(store.filteredAccounts.map(account => account.id)).toEqual(["zh-1"]);
    });

    it("平台筛选与搜索条件组合生效且不修改原数组", () => {
      const store = useAccountStore();
      store.accounts = accountsFixture;
      store.searchQuery = "a";
      store.filterPlatform = "wechat_mp";

      expect(store.filteredAccounts.map(account => account.id)).toEqual(["wx-1", "wx-2"]);
      expect(store.accounts.map(account => account.id)).toEqual(["wx-1", "zh-1", "wx-2"]);
    });

    it("名称排序使用 account_name 和空字符串作为回退值", () => {
      const store = useAccountStore();
      store.accounts = [
        { id: "empty" },
        { id: "account-name", account_name: "Alpha" },
        { id: "name", name: "beta" },
      ];

      expect(store.filteredAccounts.map(account => account.id)).toEqual(["empty", "account-name", "name"]);
      store.sortOrder = "desc";
      expect(store.filteredAccounts.map(account => account.id)).toEqual(["name", "account-name", "empty"]);
    });

    it("按创建时间升序和降序排序，缺失时间按 epoch 处理", () => {
      const store = useAccountStore();
      store.accounts = accountsFixture;
      store.sortBy = "created_at";

      expect(store.filteredAccounts.map(account => account.id)).toEqual(["wx-2", "zh-1", "wx-1"]);
      store.sortOrder = "desc";
      expect(store.filteredAccounts.map(account => account.id)).toEqual(["wx-1", "zh-1", "wx-2"]);
    });

    it("按任意字段排序并保持相等值的原始顺序", () => {
      const store = useAccountStore();
      store.accounts = [
        { id: "a", priority: 2 },
        { id: "b", priority: 1 },
        { id: "c", priority: 2 },
        { id: "d" },
      ];
      store.sortBy = "priority";

      expect(store.filteredAccounts.map(account => account.id)).toEqual(["d", "b", "a", "c"]);
      store.sortOrder = "desc";
      expect(store.filteredAccounts.map(account => account.id)).toEqual(["a", "c", "b", "d"]);
    });

    it("排序比较器对右侧账号缺失字段使用空值回退", () => {
      const store = useAccountStore();
      store.accounts = [
        { id: "empty" },
        { id: "dated", created_at: "2026-01-01", priority: 1 },
      ];

      store.sortBy = "created_at";
      expect(store.filteredAccounts.map(account => account.id)).toEqual(["empty", "dated"]);

      store.sortBy = "priority";
      expect(store.filteredAccounts.map(account => account.id)).toEqual(["empty", "dated"]);
    });

    it("平台分组统计活跃和非活跃账号，并按活跃数及总数排序", () => {
      const store = useAccountStore();
      store.accounts = [
        { id: "a1", platform: "a", status: "active" },
        { id: "a2", platform: "a", status: "offline" },
        { id: "b1", platform: "b", status: "online" },
        { id: "b2", platform: "b", status: "offline" },
        { id: "b3", platform: "b", status: "offline" },
        { id: "c1", platform: "c", status: "offline" },
      ];

      expect(store.groupedByPlatform).toEqual([
        { platform: "b", accounts: expect.any(Array), activeCount: 1, inactiveCount: 2 },
        { platform: "a", accounts: expect.any(Array), activeCount: 1, inactiveCount: 1 },
        { platform: "c", accounts: expect.any(Array), activeCount: 0, inactiveCount: 1 },
      ]);
      expect(store.groupedByPlatform[0].accounts.map(account => account.id)).toEqual(["b1", "b2", "b3"]);
    });

    it("平台分组遵循当前筛选条件", () => {
      const store = useAccountStore();
      store.accounts = accountsFixture;
      store.filterStatus = "inactive";

      expect(store.groupedByPlatform.map(group => group.platform)).toEqual(["zhihu"]);
    });
  });

  describe("本地分组", () => {
    it("loadGroups 从 localStorage 恢复分组", () => {
      const groups = [{ id: "grp-1", name: "知乎组" }];
      localStorage.setItem("mp_account_groups", JSON.stringify(groups));
      const store = useAccountStore();

      store.loadGroups();

      expect(store.groups).toEqual(groups);
    });

    it.each([
      ["没有缓存", null],
      ["缓存 JSON 损坏", "{invalid"],
    ])("%s 时 loadGroups 回退为空数组", (_label, raw) => {
      if (raw !== null) localStorage.setItem("mp_account_groups", raw);
      const store = useAccountStore();
      store.groups = [{ id: "stale" }];

      store.loadGroups();

      expect(store.groups).toEqual([]);
    });

    it("localStorage 读取异常时 loadGroups 回退为空数组", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
      const store = useAccountStore();
      store.groups = [{ id: "stale" }];

      expect(() => store.loadGroups()).not.toThrow();
      expect(store.groups).toEqual([]);
    });

    it("createGroup 创建唯一分组、规范化空平台并持久化", () => {
      vi.spyOn(Date, "now").mockReturnValue(123);
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const store = useAccountStore();

      const group = store.createGroup("常用账号", "");

      expect(group).toEqual({ id: expect.stringMatching(/^grp_123_/), name: "常用账号", platformFilter: null });
      expect(store.groups).toEqual([group]);
      expect(JSON.parse(localStorage.getItem("mp_account_groups"))).toEqual([group]);
    });

    it("deleteGroup 删除目标分组并持久化", () => {
      const store = useAccountStore();
      store.groups = [{ id: "keep" }, { id: "delete" }];

      store.deleteGroup("delete");

      expect(store.groups).toEqual([{ id: "keep" }]);
      expect(JSON.parse(localStorage.getItem("mp_account_groups"))).toEqual([{ id: "keep" }]);
    });

    it("重复删除不存在的分组保持状态不变", () => {
      const store = useAccountStore();
      store.groups = [{ id: "keep" }];

      store.deleteGroup("missing");
      store.deleteGroup("missing");

      expect(store.groups).toEqual([{ id: "keep" }]);
    });

    it("getGroupAccounts 对不存在分组返回空数组", () => {
      const store = useAccountStore();
      store.accounts = accountsFixture;

      expect(store.getGroupAccounts("missing")).toEqual([]);
    });

    it("getGroupAccounts 按分组平台筛选账号", () => {
      const store = useAccountStore();
      store.accounts = accountsFixture;
      store.groups = [{ id: "wechat", platformFilter: "wechat_mp" }];

      expect(store.getGroupAccounts("wechat").map(account => account.id)).toEqual(["wx-1", "wx-2"]);
    });

    it("无平台限制的分组返回账号数组副本", () => {
      const store = useAccountStore();
      store.accounts = accountsFixture;
      store.groups = [{ id: "all", platformFilter: null }];

      const result = store.getGroupAccounts("all");

      expect(result).toEqual(accountsFixture);
      expect(result).not.toBe(store.accounts);
    });
  });

  describe("选择与批量操作", () => {
    it("toggleSelect 可选择并再次取消同一账号", () => {
      const store = useAccountStore();

      store.toggleSelect("a1");
      expect(store.selectedIds).toEqual(new Set(["a1"]));
      store.toggleSelect("a1");
      expect(store.selectedIds).toEqual(new Set());
    });

    it("selectAll 只选择筛选结果，再次调用清空选择", () => {
      const store = useAccountStore();
      store.accounts = accountsFixture;
      store.filterPlatform = "wechat_mp";

      store.selectAll();
      expect(store.selectedIds).toEqual(new Set(["wx-1", "wx-2"]));
      expect(store.isAllSelected).toBe(true);

      store.selectAll();
      expect(store.selectedIds).toEqual(new Set());
      expect(store.isAllSelected).toBe(false);
    });

    it("空列表全选保持空集合且不进入全选状态", () => {
      const store = useAccountStore();

      store.selectAll();

      expect(store.selectedIds).toEqual(new Set());
      expect(store.isAllSelected).toBe(false);
    });

    it("全选后取消一个账号，再次全选会补齐全部账号", () => {
      const store = useAccountStore();
      store.accounts = accountsFixture;

      store.selectAll();
      store.toggleSelect("zh-1");
      expect(store.isAllSelected).toBe(false);

      store.selectAll();

      expect(store.selectedIds).toEqual(new Set(["wx-1", "zh-1", "wx-2"]));
      expect(store.isAllSelected).toBe(true);
    });

    it("筛选条件变化后全选状态只反映当前可见账号", () => {
      const store = useAccountStore();
      store.accounts = accountsFixture;
      store.toggleSelect("wx-1");
      store.toggleSelect("wx-2");

      store.filterPlatform = "wechat_mp";
      expect(store.isAllSelected).toBe(true);

      store.filterPlatform = "zhihu";
      expect(store.isAllSelected).toBe(false);
    });

    it("刷新后移除已不存在账号的选择", async () => {
      listAccounts.mockResolvedValue({ code: 0, data: [accountsFixture[0]] });
      const store = useAccountStore();
      store.selectedIds = new Set(["wx-1", "missing"]);

      await store.load();

      expect(store.selectedIds).toEqual(new Set(["wx-1"]));
      expect(store.isAllSelected).toBe(true);
    });

    it("clearSelection 可重复清理选择和全选状态", () => {
      const store = useAccountStore();
      store.selectedIds = new Set(["a1"]);
      store.isAllSelected = true;

      store.clearSelection();
      store.clearSelection();

      expect(store.selectedIds).toEqual(new Set());
      expect(store.isAllSelected).toBe(false);
    });

    it("batchDelete 汇总成功、业务失败和异常并重新加载", async () => {
      accountDelete
        .mockResolvedValueOnce({ code: 0 })
        .mockResolvedValueOnce({ code: 1 })
        .mockRejectedValueOnce(new Error("offline"));
      const store = useAccountStore();
      store.selectedIds = new Set(["a", "b", "c"]);
      store.isAllSelected = true;

      const result = await store.batchDelete();

      expect(result).toEqual({ success: 1, failed: 2 });
      expect(accountDelete.mock.calls).toEqual([["a"], ["b"], ["c"]]);
      expect(store.selectedIds).toEqual(new Set());
      expect(store.isAllSelected).toBe(false);
      expect(listAccounts).toHaveBeenCalledTimes(1);
    });

    it("batchDelete 没有选中账号时不调用删除 API，但仍同步账号列表", async () => {
      const store = useAccountStore();

      await expect(store.batchDelete()).resolves.toEqual({ success: 0, failed: 0 });
      expect(accountDelete).not.toHaveBeenCalled();
      expect(listAccounts).toHaveBeenCalledTimes(1);
    });

    it("batchSetStatus 为每个选中账号更新状态并汇总结果", async () => {
      accountUpdate
        .mockResolvedValueOnce({ code: 0 })
        .mockResolvedValueOnce({ code: 2 })
        .mockRejectedValueOnce(new Error("timeout"));
      const store = useAccountStore();
      store.selectedIds = new Set(["a", "b", "c"]);

      const result = await store.batchSetStatus("inactive");

      expect(result).toEqual({ success: 1, failed: 2 });
      expect(accountUpdate.mock.calls).toEqual([
        ["a", { status: "inactive" }],
        ["b", { status: "inactive" }],
        ["c", { status: "inactive" }],
      ]);
      expect(store.selectedIds).toEqual(new Set());
      expect(listAccounts).toHaveBeenCalledTimes(1);
    });

    it("batchSetStatus 没有选中账号时不调用更新 API", async () => {
      const store = useAccountStore();

      await expect(store.batchSetStatus("active")).resolves.toEqual({ success: 0, failed: 0 });
      expect(accountUpdate).not.toHaveBeenCalled();
      expect(listAccounts).toHaveBeenCalledTimes(1);
    });
  });

  describe("单账号操作", () => {
    it("getDefault 优先返回平台默认账号", () => {
      const store = useAccountStore();
      store.accounts = [
        { id: "a1", platform: "wx", is_default: false },
        { id: "a2", platform: "wx", is_default: true },
      ];

      expect(store.getDefault("wx")).toEqual(store.accounts[1]);
    });

    it("getDefault 没有显式默认账号时返回首个账号", () => {
      const store = useAccountStore();
      store.accounts = [{ id: "a1", platform: "wx", is_default: false }];

      expect(store.getDefault("wx")).toEqual(store.accounts[0]);
    });

    it("getDefault 在平台不存在或平台列表为空时返回 null", () => {
      const store = useAccountStore();

      expect(store.getDefault("wx")).toBeNull();
    });

    it("setDefault 成功后重新加载并返回原响应", async () => {
      const response = { code: 0, data: { id: "a1" } };
      accountSetDefault.mockResolvedValue(response);
      const store = useAccountStore();

      await expect(store.setDefault("a1", "wx")).resolves.toBe(response);
      expect(accountSetDefault).toHaveBeenCalledWith("wx", "a1");
      expect(listAccounts).toHaveBeenCalledTimes(1);
    });

    it("setDefault 业务失败时返回响应且不重新加载", async () => {
      const response = { code: 1, message: "not found" };
      accountSetDefault.mockResolvedValue(response);
      const store = useAccountStore();

      await expect(store.setDefault("a1", "wx")).resolves.toBe(response);
      expect(listAccounts).not.toHaveBeenCalled();
    });

    it("setDefault API 异常时返回统一失败结果", async () => {
      accountSetDefault.mockRejectedValue(new Error("offline"));
      const store = useAccountStore();

      await expect(store.setDefault("a1", "wx")).resolves.toEqual({ code: -1, message: "offline" });
      expect(listAccounts).not.toHaveBeenCalled();
    });

    it("renameAccount 成功后重新加载并返回原响应", async () => {
      const response = { code: 0 };
      accountUpdate.mockResolvedValue(response);
      const store = useAccountStore();

      await expect(store.renameAccount("a1", "新名称")).resolves.toBe(response);
      expect(accountUpdate).toHaveBeenCalledWith("a1", { name: "新名称" });
      expect(listAccounts).toHaveBeenCalledTimes(1);
    });

    it("renameAccount 业务失败时不重新加载", async () => {
      const response = { code: 1, message: "duplicate" };
      accountUpdate.mockResolvedValue(response);
      const store = useAccountStore();

      await expect(store.renameAccount("a1", "重复名称")).resolves.toBe(response);
      expect(listAccounts).not.toHaveBeenCalled();
    });

    it("renameAccount API 异常时返回统一失败结果", async () => {
      accountUpdate.mockRejectedValue(new Error("timeout"));
      const store = useAccountStore();

      await expect(store.renameAccount("a1", "新名称")).resolves.toEqual({ code: -1, message: "timeout" });
      expect(listAccounts).not.toHaveBeenCalled();
    });
  });
});
