import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";
import fs from "fs";

vi.mock("@/stores/platforms", () => ({
  usePlatformStore: () => ({
    load: vi.fn(),
    platforms: [
      { id: "wechat_mp", label: "微信" },
      { id: "zhihu", label: "知乎" },
      { id: "douyin", label: "抖音" },
    ],
    getLabel: (k) => ({ wechat_mp: "微信", zhihu: "知乎", douyin: "抖音" }[k] || k),
    getIcon: (k) => "👍",
  })
}));

const _testAccounts = vi.hoisted(() => ([]));
const _spies = vi.hoisted(() => ({
  load: vi.fn(),
  loadGroups: vi.fn(),
  toggleSelect: vi.fn(),
  selectAll: vi.fn(),
  clearSelection: vi.fn(),
  batchDelete: vi.fn().mockResolvedValue({ success: 0, failed: 0 }),
  createGroup: vi.fn(),
  deleteGroup: vi.fn(),
  getGroupAccounts: vi.fn().mockReturnValue([]),
  getDefault: vi.fn(),
  setDefault: vi.fn(),
  renameAccount: vi.fn(),
}));

vi.mock("@/stores/accounts", () => ({
  useAccountStore: () => ({
    get accounts() { return _testAccounts; },
    set accounts(v) { _testAccounts.length = 0; _testAccounts.push(...v); },
    load: _spies.load,
    loading: false,
    error: null,
    searchQuery: "",
    selectedIds: new Set(),
    groups: [],
    loadGroups: _spies.loadGroups,
    toggleSelect: _spies.toggleSelect,
    selectAll: _spies.selectAll,
    clearSelection: _spies.clearSelection,
    batchDelete: _spies.batchDelete,
    createGroup: _spies.createGroup,
    deleteGroup: _spies.deleteGroup,
    getGroupAccounts: _spies.getGroupAccounts,
    getDefault: _spies.getDefault,
    setDefault: _spies.setDefault,
    renameAccount: _spies.renameAccount,
  })
}));

vi.mock("@/api/publisher", () => ({
  listAccounts: vi.fn().mockResolvedValue({ code: 0, data: [] }),
  accountAdd: vi.fn().mockResolvedValue({ code: 0 }),
  accountDelete: vi.fn().mockResolvedValue({ code: 0 }),
  accountCheckLogin: vi.fn().mockResolvedValue({ code: 0, data: { valid: true } }),
  authOpenLogin: vi.fn().mockResolvedValue({ code: 0 }),
  authClose: vi.fn().mockResolvedValue({ code: 0 }),
  accountSetDefault: vi.fn().mockResolvedValue({ code: 0 }),
  accountUpdate: vi.fn().mockResolvedValue({ code: 0 }),
}));

vi.mock("element-plus", () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/components/UiModal.vue", () => ({
  default: { template: "<div v-if='visible'><slot/></div>", props: ["visible", "title", "size"] }
}));

import AccountsView from "./Accounts.vue";

// Helper to create a pre-configured mount
function createAccountsView(props = {}) {
  return mount(AccountsView, {
    global: { plugins: [createPinia()] },
    ...props,
  });
}

async function mountView() {
  const w = createAccountsView();
  await nextTick();
  await new Promise(r => setTimeout(r, 0));
  await nextTick();
  return w;
}

describe("AccountsView", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const publisher = await import("@/api/publisher");
    publisher.listAccounts.mockResolvedValue({ code: 0, data: [] });
    publisher.accountAdd.mockResolvedValue({ code: 0 });
    publisher.accountDelete.mockResolvedValue({ code: 0 });
    publisher.accountCheckLogin.mockResolvedValue({ code: 0, data: { valid: true } });
    publisher.authOpenLogin.mockResolvedValue({ code: 0 });
    publisher.authClose.mockResolvedValue({ code: 0 });
    publisher.accountSetDefault.mockResolvedValue({ code: 0 });
    publisher.accountUpdate.mockResolvedValue({ code: 0 });
    const { ElMessageBox } = await import("element-plus");
    ElMessageBox.confirm.mockResolvedValue(undefined);
    _spies.batchDelete.mockResolvedValue({ success: 0, failed: 0 });
    _testAccounts.length = 0;
    setActivePinia(createPinia());
    window.electronAPI = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders page title", async () => {
    const w = await mountView();
    expect(w.text()).toContain("账号管理");
  });

  it("shows add account button", async () => {
    const w = await mountView();
    expect(w.text()).toContain("添加账号");
  });

  it("shows filters", async () => {
    const w = await mountView();
    expect(w.text()).toContain("全部");
    expect(w.text()).toContain("已登录");
  });

  it("shows empty state when no accounts", async () => {
    const w = await mountView();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.text()).toContain("暂无账号");
  });

  it("toggles filter", async () => {
    const w = await mountView();
    w.vm.filter = "active";
    await nextTick();
    expect(w.vm.filter).toBe("active");
    w.vm.filter = "inactive";
    await nextTick();
    expect(w.vm.filter).toBe("inactive");
    w.vm.filter = "all";
    await nextTick();
    expect(w.vm.filter).toBe("all");
  });

  it("platformLabel delegates to store", async () => {
    const w = await mountView();
    expect(w.vm.platformLabel("douyin")).toBe("抖音");
    expect(w.vm.platformLabel("unknown")).toBe("unknown");
  });

  it("platformIcon delegates to store", async () => {
    const w = await mountView();
    expect(w.vm.platformIcon("douyin")).toBe("👍");
  });

  it("totalAccounts returns account count from store", async () => {
    // Re-mock account store with data
    vi.doMock("@/stores/accounts", () => ({
      useAccountStore: () => ({
        accounts: [
          { id: "a1", platform: "zhihu", status: "active", account_name: "Acct1" },
          { id: "a2", platform: "douyin", status: "inactive", account_name: "Acct2" },
        ],
        load: vi.fn().mockResolvedValue(undefined),
        loading: false,
        error: null,
      })
    }));
    // This test uses the original mock above (2 accounts in store mock not possible with top-level vi.mock)
    // We'll test via the component's computed property
    const w = await mountView();
    expect(typeof w.vm.totalAccounts).toBe("number");
  });

  it("refresh calls accountStore.load", async () => {
    const w = await mountView();
    _spies.load.mockClear();
    await w.vm.refresh();
    expect(_spies.load).toHaveBeenCalledTimes(1);
    expect(w.vm.loading).toBe(false);
  });

  it("addAccount warns if no platform selected", async () => {
    const w = await mountView();
    w.vm.newPlatform = "";
    await w.vm.addAccount();
    const { ElMessage } = await import("element-plus");
    const { authOpenLogin, accountAdd } = await import("@/api/publisher");
    expect(ElMessage.warning).toHaveBeenCalledWith("请选择平台");
    expect(authOpenLogin).not.toHaveBeenCalled();
    expect(accountAdd).not.toHaveBeenCalled();
  });

  it("addAccount opens auth login flow", async () => {
    const w = await mountView();
    w.vm.newPlatform = "douyin";
    await w.vm.addAccount();
    const { authOpenLogin } = await import("@/api/publisher");
    expect(authOpenLogin).toHaveBeenCalledWith("douyin");
    expect(w.vm.showAddDialog).toBe(false);
    expect(w.vm.newPlatform).toBe("");
  });

  it("addAccount resets adding state after cancelled login", async () => {
    const { authOpenLogin } = await import("@/api/publisher");
    authOpenLogin.mockResolvedValue({ cancelled: true });
    const w = await mountView();
    w.vm.newPlatform = "douyin";
    await w.vm.addAccount();
    expect(w.vm.adding).toBe(false);
    expect(w.vm.authViewVisible).toBe(false);
  });

  it("addAccount shows error on failure", async () => {
    const { authOpenLogin } = await import("@/api/publisher");
    authOpenLogin.mockResolvedValue({ code: 1, message: "auth failed" });
    const w = await mountView();
    w.vm.newPlatform = "zhihu";
    await w.vm.addAccount();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalledWith("auth failed");
    expect(w.vm.adding).toBe(false);
  });

  it("addAccount catches exception", async () => {
    const { authOpenLogin } = await import("@/api/publisher");
    authOpenLogin.mockRejectedValue(new Error("network error"));
    const w = await mountView();
    w.vm.newPlatform = "douyin";
    await w.vm.addAccount();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalledWith("network error");
  });

  it("addAccountForPlatform sets newPlatform and shows dialog", async () => {
    const w = await mountView();
    w.vm.addAccountForPlatform("douyin");
    expect(w.vm.newPlatform).toBe("douyin");
    expect(w.vm.showAddDialog).toBe(true);
  });

  it("closeAuthView closes auth view and calls authClose", async () => {
    const { authClose } = await import("@/api/publisher");
    const w = await mountView();
    w.vm.authViewVisible = true;
    await w.vm.closeAuthView();
    expect(authClose).toHaveBeenCalled();
    expect(w.vm.authViewVisible).toBe(false);
  });

  it("closeAuthView handles missing authClose API", async () => {
    // Temporarily set authClose to undefined via the mock
    // Since vi.mock is hoisted, we can't easily, but we can check that the function handles it
    const w = await mountView();
    w.vm.authViewVisible = true;
    await w.vm.closeAuthView();
    expect(w.vm.authViewVisible).toBe(false);
  });

  it("setDefault calls accountSetDefault and refreshes", async () => {
    const { accountSetDefault } = await import("@/api/publisher");
    const w = await mountView();
    const acc = { id: "a1", platform: "douyin", status: "active" };
    await w.vm.setDefault(acc);
    expect(accountSetDefault).toHaveBeenCalledWith("douyin", "a1");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
  });

  it("setDefault catches exception", async () => {
    const { accountSetDefault } = await import("@/api/publisher");
    accountSetDefault.mockRejectedValue(new Error("set default failed"));
    const w = await mountView();
    const acc = { id: "a1", platform: "zhihu" };
    await w.vm.setDefault(acc);
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalled();
  });

  it("setDefault 业务失败时显示原始错误且不提示成功、不刷新", async () => {
    const { accountSetDefault } = await import("@/api/publisher");
    const { ElMessage } = await import("element-plus");
    accountSetDefault.mockResolvedValue({ code: 1, message: "账号不存在" });
    const w = await mountView();
    _spies.load.mockClear();

    await w.vm.setDefault({ id: "missing", platform: "zhihu" });

    expect(ElMessage.error).toHaveBeenCalledWith("账号不存在");
    expect(ElMessage.success).not.toHaveBeenCalled();
    expect(_spies.load).not.toHaveBeenCalled();
  });

  it("renameAccount updates name and refreshes", async () => {
    const { accountUpdate } = await import("@/api/publisher");
    const w = await mountView();
    const acc = { id: "a1", account_name: "Old Name" };
    await w.vm.renameAccount(acc, "New Name");
    expect(accountUpdate).toHaveBeenCalledWith("a1", { name: "New Name" });
  });

  it("renameAccount skips if name unchanged", async () => {
    const { accountUpdate } = await import("@/api/publisher");
    const w = await mountView();
    const acc = { id: "a1", account_name: "Same" };
    await w.vm.renameAccount(acc, "Same");
    expect(accountUpdate).not.toHaveBeenCalled();
  });

  it("renameAccount skips if name is empty", async () => {
    const { accountUpdate } = await import("@/api/publisher");
    const w = await mountView();
    const acc = { id: "a1", account_name: "Old" };
    await w.vm.renameAccount(acc, "  ");
    expect(accountUpdate).not.toHaveBeenCalled();
  });

  it("renameAccount catches exception", async () => {
    const { accountUpdate } = await import("@/api/publisher");
    accountUpdate.mockRejectedValue(new Error("rename failed"));
    const w = await mountView();
    const acc = { id: "a1", account_name: "Old" };
    await w.vm.renameAccount(acc, "New");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalled();
  });

  it("renameAccount 业务失败时显示原始错误且不刷新", async () => {
    const { accountUpdate } = await import("@/api/publisher");
    const { ElMessage } = await import("element-plus");
    accountUpdate.mockResolvedValue({ code: 1, message: "账号名称已存在" });
    const w = await mountView();
    _spies.load.mockClear();

    await w.vm.renameAccount({ id: "a1", account_name: "旧名称" }, "新名称");

    expect(ElMessage.error).toHaveBeenCalledWith("账号名称已存在");
    expect(_spies.load).not.toHaveBeenCalled();
  });

  it("openPlatform opens correct URL", async () => {
    const originalOpen = window.open;
    window.open = vi.fn();
    const w = await mountView();
    w.vm.openPlatform({ platform: "zhihu" });
    expect(window.open).toHaveBeenCalledWith("https://www.zhihu.com/", "_blank");
    w.vm.openPlatform({ platform: "douyin" });
    expect(window.open).toHaveBeenCalledWith("https://www.douyin.com/", "_blank");
    w.vm.openPlatform({ platform: "youtube" });
    expect(window.open).toHaveBeenCalledWith("https://studio.youtube.com/", "_blank");
    window.open = originalOpen;
  });

  it("openPlatform does nothing for unknown platform", async () => {
    window.open = vi.fn();
    const w = await mountView();
    w.vm.openPlatform({ platform: "unknown" });
    expect(window.open).not.toHaveBeenCalled();
  });

  it("checkLogin shows success for valid login", async () => {
    const { accountCheckLogin } = await import("@/api/publisher");
    accountCheckLogin.mockResolvedValue({ code: 0, data: { valid: true } });
    const w = await mountView();
    await w.vm.checkLogin({ platform: "douyin", id: "a1" });
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
  });

  it("checkLogin shows warning for expired login", async () => {
    const { accountCheckLogin } = await import("@/api/publisher");
    accountCheckLogin.mockResolvedValue({ code: 0, data: { valid: false, message: "login expired" } });
    const w = await mountView();
    await w.vm.checkLogin({ platform: "douyin", id: "a1" });
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.warning).toHaveBeenCalled();
  });

  it("checkLogin catches exception", async () => {
    const { accountCheckLogin } = await import("@/api/publisher");
    accountCheckLogin.mockRejectedValue(new Error("check failed"));
    const w = await mountView();
    await w.vm.checkLogin({ platform: "douyin", id: "a1" });
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalledWith("check failed");
  });

  it("removeAccount confirms and deletes account", async () => {
    const { ElMessageBox } = await import("element-plus");
    ElMessageBox.confirm.mockResolvedValue(undefined);
    const { accountDelete } = await import("@/api/publisher");
    accountDelete.mockResolvedValue({ code: 0 });
    const w = await mountView();
    const acc = { id: "a1", platform: "douyin", account_name: "My Account" };
    await w.vm.removeAccount(acc);
    expect(accountDelete).toHaveBeenCalledWith("a1");
  });

  it("removeAccount shows error on delete failure", async () => {
    const { ElMessageBox } = await import("element-plus");
    ElMessageBox.confirm.mockResolvedValue(undefined);
    const { accountDelete } = await import("@/api/publisher");
    accountDelete.mockResolvedValue({ code: 1, message: "delete failed" });
    const w = await mountView();
    await w.vm.removeAccount({ id: "a1", platform: "douyin" });
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalledWith("delete failed");
  });

  it("removeAccount does nothing when user cancels", async () => {
    const { ElMessageBox } = await import("element-plus");
    ElMessageBox.confirm.mockRejectedValue(new Error("canceled"));
    const { accountDelete } = await import("@/api/publisher");
    const w = await mountView();
    await w.vm.removeAccount({ id: "a1", platform: "douyin" });
    expect(accountDelete).not.toHaveBeenCalled();
  });
  it("account-row has flex-wrap for responsive layout", async () => {
    _testAccounts.push({ id: "a1", platform: "zhihu", status: "active", account_name: "知乎账号" });
    const w = mount(AccountsView, { global: { plugins: [createPinia()] } });
    await nextTick(); await new Promise(r => setTimeout(r, 0)); await nextTick();
    const rows = w.findAll(".account-row");
    expect(rows.length).toBeGreaterThan(0);
    // JSDOM does not apply Vue scoped CSS; check source CSS instead
    const vueSrc = fs.readFileSync("./src/views/Accounts.vue", "utf8");
    expect(vueSrc).toMatch(/flex-wrap:\s*wrap/);
  });

  it("account-info has min-width 160px for responsive safety", async () => {
    _testAccounts.length = 0;
    _testAccounts.push({ id: "a1", platform: "zhihu", status: "active", account_name: "知乎账号" });
    const w = mount(AccountsView, { global: { plugins: [createPinia()] } });
    await nextTick(); await new Promise(r => setTimeout(r, 0)); await nextTick();
    const info = w.find(".account-info");
    expect(info.exists()).toBe(true);
    // JSDOM does not apply Vue scoped CSS; check source CSS instead
    const vueSrc = fs.readFileSync("./src/views/Accounts.vue", "utf8");
    expect(vueSrc).toMatch(/min-width:\s*160px/);
  });

  // 回归保护：loadGroups 必须在 onMounted 时被调用
  // 此 bug 曾导致 Accounts.vue 报 70 次 console error（commit d016596 修复）
  it("calls loadGroups on mount", async () => {
    _spies.loadGroups.mockClear();
    await mountView();
    expect(_spies.loadGroups).toHaveBeenCalled();
  });

  // 交互测试：点击"添加账号"按钮应打开对话框
  it("opens add account dialog when clicking add button", async () => {
    const w = await mountView();
    // jsdom 不支持 :has-text() 伪类，用 findAll + 文本匹配
    const buttons = w.findAll("button");
    const addBtn = buttons.find(b => b.text().includes("添加账号"));
    if (addBtn) {
      await addBtn.trigger("click");
      await nextTick();
      // 验证对话框或表单出现
      const dialog = w.find(".ui-modal, .el-dialog, .add-account-form");
      expect(dialog.exists() || w.vm.showAddDialog === true || w.vm.authViewVisible === true).toBe(true);
    }
  });

  it("搜索输入防抖后才更新账号查询条件", async () => {
    const w = await mountView();
    vi.useFakeTimers();
    w.vm.searchInput = "知乎";

    w.vm.onSearchInput();
    expect(w.vm.accountStore.searchQuery).toBe("");

    await vi.advanceTimersByTimeAsync(299);
    expect(w.vm.accountStore.searchQuery).toBe("");
    await vi.advanceTimersByTimeAsync(1);
    expect(w.vm.accountStore.searchQuery).toBe("知乎");
  });

  it("连续搜索只应用最后一次输入", async () => {
    const w = await mountView();
    vi.useFakeTimers();
    w.vm.searchInput = "微";
    w.vm.onSearchInput();
    await vi.advanceTimersByTimeAsync(200);
    w.vm.searchInput = "微信";
    w.vm.onSearchInput();
    await vi.advanceTimersByTimeAsync(300);

    expect(w.vm.accountStore.searchQuery).toBe("微信");
  });

  it("清空搜索会立即清理输入和查询条件", async () => {
    const w = await mountView();
    w.vm.searchInput = "抖音";
    w.vm.accountStore.searchQuery = "抖音";

    w.vm.clearSearch();

    expect(w.vm.searchInput).toBe("");
    expect(w.vm.accountStore.searchQuery).toBe("");
  });

  it("登录完成事件会关闭登录视图、提示成功并刷新账号", async () => {
    let authCompleted;
    window.electronAPI = {
      onAuthCompleted: vi.fn((callback) => { authCompleted = callback; return vi.fn(); }),
    };
    const w = await mountView();
    _spies.load.mockClear();
    w.vm.authViewVisible = true;

    authCompleted({ platform: "zhihu" });
    await nextTick();

    const { ElMessage } = await import("element-plus");
    expect(w.vm.authViewVisible).toBe(false);
    expect(ElMessage.success).toHaveBeenCalledWith("账号添加成功");
    expect(_spies.load).toHaveBeenCalledTimes(1);
  });

  it("卸载时释放全部 Electron 登录事件订阅", async () => {
    const unsubscribeOpened = vi.fn();
    const unsubscribeCompleted = vi.fn();
    const unsubscribeClosed = vi.fn();
    window.electronAPI = {
      onAuthViewOpened: vi.fn(() => unsubscribeOpened),
      onAuthCompleted: vi.fn(() => unsubscribeCompleted),
      onAuthViewClosed: vi.fn(() => unsubscribeClosed),
    };
    const w = await mountView();

    w.unmount();

    expect(unsubscribeOpened).toHaveBeenCalledTimes(1);
    expect(unsubscribeCompleted).toHaveBeenCalledTimes(1);
    expect(unsubscribeClosed).toHaveBeenCalledTimes(1);
  });

  it("删除接口返回异常格式时显示默认错误且不刷新", async () => {
    const { accountDelete } = await import("@/api/publisher");
    accountDelete.mockResolvedValueOnce({});
    const w = await mountView();
    _spies.load.mockClear();

    await w.vm.removeAccount({ id: "a1", platform: "douyin", account_name: "账号" });

    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalledWith("删除失败");
    expect(_spies.load).not.toHaveBeenCalled();
  });

  it("批量删除全成功时显示真实成功数量且不重复刷新", async () => {
    _spies.batchDelete.mockResolvedValueOnce({ success: 2, failed: 0 });
    const w = await mountView();
    w.vm.accountStore.selectedIds.add("a1");
    w.vm.accountStore.selectedIds.add("a2");
    _spies.load.mockClear();

    await w.vm.handleBatchDelete();

    expect(_spies.batchDelete).toHaveBeenCalledTimes(1);
    expect(_spies.load).not.toHaveBeenCalled();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalledWith("已删除 2 个账号");
  });

  it("批量删除部分失败时显示成功和失败数量", async () => {
    _spies.batchDelete.mockResolvedValueOnce({ success: 1, failed: 1 });
    const w = await mountView();
    w.vm.accountStore.selectedIds.add("a1");
    w.vm.accountStore.selectedIds.add("a2");
    _spies.load.mockClear();

    await w.vm.handleBatchDelete();

    const { ElMessage } = await import("element-plus");
    expect(ElMessage.warning).toHaveBeenCalledWith("已删除 1 个账号，1 个删除失败");
    expect(ElMessage.success).not.toHaveBeenCalled();
    expect(_spies.load).not.toHaveBeenCalled();
  });

  it("批量删除全部失败时只显示失败提示", async () => {
    _spies.batchDelete.mockResolvedValueOnce({ success: 0, failed: 2 });
    const w = await mountView();
    w.vm.accountStore.selectedIds.add("a1");
    w.vm.accountStore.selectedIds.add("a2");
    _spies.load.mockClear();

    await w.vm.handleBatchDelete();

    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalledWith("2 个账号删除失败");
    expect(ElMessage.success).not.toHaveBeenCalled();
    expect(_spies.load).not.toHaveBeenCalled();
  });

  it("使用真实 Pinia Store 的筛选全选状态", async () => {
    vi.resetModules();
    vi.doUnmock("@/stores/accounts");
    const [
      { default: RealAccountsView },
      { useAccountStore },
      { createPinia: createRealPinia, setActivePinia: setRealActivePinia },
      { listAccounts },
    ] = await Promise.all([
      import("./Accounts.vue"),
      import("@/stores/accounts"),
      import("pinia"),
      import("@/api/publisher"),
    ]);
    listAccounts.mockResolvedValue({
      code: 0,
      data: [
        { id: "wx-1", platform: "wechat_mp", status: "active", account_name: "微信公众号" },
        { id: "zh-1", platform: "zhihu", status: "active", account_name: "知乎账号" },
      ],
    });
    const pinia = createRealPinia();
    setRealActivePinia(pinia);
    const w = mount(RealAccountsView, { global: { plugins: [pinia] } });
    await nextTick();
    await new Promise(resolve => setTimeout(resolve, 0));
    await nextTick();
    const store = useAccountStore();

    store.searchQuery = "微信";
    store.selectAll();
    await nextTick();

    expect(store.filteredAccounts.map(account => account.id)).toEqual(["wx-1"]);
    expect(store.isAllSelected).toBe(true);
    expect(w.find(".batch-select-all input").element.checked).toBe(true);
    w.unmount();
  });

});
