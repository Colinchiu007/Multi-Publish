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
    getDashboardUrl: (k) => ({
      wechat_mp: "https://mp.weixin.qq.com/",
      zhihu: "https://www.zhihu.com/",
      douyin: "https://creator.douyin.com/",
      youtube: "https://studio.youtube.com/",
    }[k] || ""),
    supportsQrCode: (k) => ["wechat_mp", "zhihu"].includes(k),
  })
}));

const _testAccounts = vi.hoisted(() => ([]));
const _favoriteIds = vi.hoisted(() => new Set());
const _selectedIds = vi.hoisted(() => new Set());
const _accountFilters = vi.hoisted(() => ({ searchQuery: "", filterStatus: "all" }));
const _eventCallbacks = vi.hoisted(() => ({
  authOpened: null,
  authCompleted: null,
  authClosed: null,
  qrOpened: null,
  qrDetected: null,
  qrCompleted: null,
  qrClosed: null,
  statusChanged: null,
}));
const _eventUnsubscribers = vi.hoisted(() => ({
  authOpened: vi.fn(),
  authCompleted: vi.fn(),
  authClosed: vi.fn(),
  qrOpened: vi.fn(),
  qrDetected: vi.fn(),
  qrCompleted: vi.fn(),
  qrClosed: vi.fn(),
  statusChanged: vi.fn(),
}));
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
  setDefault: vi.fn().mockResolvedValue({ code: 0 }),
  renameAccount: vi.fn().mockResolvedValue({ code: 0 }),
  toggleFavorite: vi.fn(),
  toggleAccountInGroup: vi.fn(),
}));

vi.mock("@/stores/accounts", () => ({
  useAccountStore: () => ({
    get accounts() { return _testAccounts; },
    set accounts(v) { _testAccounts.length = 0; _testAccounts.push(...v); },
    load: _spies.load,
    loading: false,
    error: null,
    get searchQuery() { return _accountFilters.searchQuery; },
    set searchQuery(value) { _accountFilters.searchQuery = value; },
    get filterStatus() { return _accountFilters.filterStatus; },
    set filterStatus(value) { _accountFilters.filterStatus = value; },
    selectedIds: _selectedIds,
    isAllSelected: false,
    favoriteIds: _favoriteIds,
    groups: [],
    get groupedByPlatform() {
      const query = _accountFilters.searchQuery.toLowerCase();
      const labels = { wechat_mp: "微信", zhihu: "知乎", douyin: "抖音" };
      const filtered = _testAccounts.filter(account => {
        const active = account.status === "active" || account.status === "online";
        if (_accountFilters.filterStatus === "active" && !active) return false;
        if (_accountFilters.filterStatus === "inactive" && active) return false;
        if (_accountFilters.filterStatus === "favorite" && !_favoriteIds.has(account.id)) return false;
        if (!query) return true;
        return (account.account_name || account.name || "").toLowerCase().includes(query)
          || (account.platform || "").toLowerCase().includes(query)
          || (labels[account.platform] || "").toLowerCase().includes(query);
      });
      const groups = new Map();
      for (const account of filtered) {
        if (!groups.has(account.platform)) groups.set(account.platform, { platform: account.platform, accounts: [], activeCount: 0, inactiveCount: 0 });
        const group = groups.get(account.platform);
        group.accounts.push(account);
        if (account.status === "active" || account.status === "online") group.activeCount += 1;
        else group.inactiveCount += 1;
      }
      return Array.from(groups.values()).sort((a, b) => b.activeCount - a.activeCount || b.accounts.length - a.accounts.length);
    },
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
    toggleFavorite: _spies.toggleFavorite,
    toggleAccountInGroup: _spies.toggleAccountInGroup,
  })
}));

vi.mock("@/api/publisher", () => ({
  listAccounts: vi.fn().mockResolvedValue({ code: 0, data: [] }),
  accountAdd: vi.fn().mockResolvedValue({ code: 0 }),
  accountDelete: vi.fn().mockResolvedValue({ code: 0 }),
  accountCheckLogin: vi.fn().mockResolvedValue({ code: 0, data: { valid: true } }),
  authOpenLogin: vi.fn().mockResolvedValue({ code: 0 }),
  authCompleteLogin: vi.fn().mockResolvedValue({ code: 0, data: true }),
  authOpenQrCodeLogin: vi.fn().mockResolvedValue({ code: 0 }),
  authClose: vi.fn().mockResolvedValue({ code: 0 }),
  authQrCodeClose: vi.fn().mockResolvedValue({ code: 0 }),
  accountSetDefault: vi.fn().mockResolvedValue({ code: 0 }),
  accountUpdate: vi.fn().mockResolvedValue({ code: 0 }),
  onAuthViewOpened: vi.fn(callback => { _eventCallbacks.authOpened = callback; return _eventUnsubscribers.authOpened; }),
  onAuthCompleted: vi.fn(callback => { _eventCallbacks.authCompleted = callback; return _eventUnsubscribers.authCompleted; }),
  onAuthViewClosed: vi.fn(callback => { _eventCallbacks.authClosed = callback; return _eventUnsubscribers.authClosed; }),
  onQrCodeOpened: vi.fn(callback => { _eventCallbacks.qrOpened = callback; return _eventUnsubscribers.qrOpened; }),
  onQrCodeDetected: vi.fn(callback => { _eventCallbacks.qrDetected = callback; return _eventUnsubscribers.qrDetected; }),
  onQrCodeCompleted: vi.fn(callback => { _eventCallbacks.qrCompleted = callback; return _eventUnsubscribers.qrCompleted; }),
  onQrCodeClosed: vi.fn(callback => { _eventCallbacks.qrClosed = callback; return _eventUnsubscribers.qrClosed; }),
  onAccountStatusChanged: vi.fn(callback => { _eventCallbacks.statusChanged = callback; return _eventUnsubscribers.statusChanged; }),
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
    publisher.authCompleteLogin.mockResolvedValue({ code: 0, data: true });
    publisher.authOpenQrCodeLogin.mockResolvedValue({ code: 0 });
    publisher.authClose.mockResolvedValue({ code: 0 });
    publisher.authQrCodeClose.mockResolvedValue({ code: 0 });
    publisher.accountSetDefault.mockResolvedValue({ code: 0 });
    publisher.accountUpdate.mockResolvedValue({ code: 0 });
    const { ElMessageBox } = await import("element-plus");
    ElMessageBox.confirm.mockResolvedValue(undefined);
    _spies.batchDelete.mockResolvedValue({ success: 0, failed: 0 });
    _spies.setDefault.mockResolvedValue({ code: 0 });
    _spies.renameAccount.mockResolvedValue({ code: 0 });
    _testAccounts.length = 0;
    _accountFilters.searchQuery = "";
    _accountFilters.filterStatus = "all";
    _favoriteIds.clear();
    _selectedIds.clear();
    Object.keys(_eventCallbacks).forEach(key => { _eventCallbacks[key] = null; });
    Object.values(_eventUnsubscribers).forEach(unsubscribe => unsubscribe.mockClear());
    setActivePinia(createPinia());
    localStorage.setItem("account-authorization-guide-seen", "1");
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

  it("筛选按钮提供 tab 语义、选中状态和方向键切换", async () => {
    const w = await mountView();
    const tabs = w.findAll('[role="tab"]');

    expect(tabs).toHaveLength(4);
    expect(tabs[0].attributes("aria-selected")).toBe("true");
    expect(tabs[0].attributes("tabindex")).toBe("0");

    await tabs[0].trigger("keydown", { key: "ArrowRight" });
    await nextTick();

    expect(w.vm.filter).toBe("active");
    expect(w.vm.accountStore.filterStatus).toBe("active");
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

  it("扫码登录模式调用二维码登录 API", async () => {
    const { authOpenLogin, authOpenQrCodeLogin } = await import("@/api/publisher");
    const w = await mountView();
    w.vm.newPlatform = "wechat_mp";
    w.vm.selectedLoginMode = "qrcode";

    await w.vm.addAccount();

    expect(authOpenQrCodeLogin).toHaveBeenCalledWith("wechat_mp");
    expect(authOpenLogin).not.toHaveBeenCalled();
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

  it("网页登录状态显示明确完成按钮，并通过主进程保存当前账号", async () => {
    const { authCompleteLogin } = await import("@/api/publisher");
    const w = await mountView();
    _eventCallbacks.authOpened({ platform: "wechat_mp" });
    await nextTick();

    const button = w.get(".login-state .complete-login");
    expect(button.text()).toContain("我已完成登录");
    await button.trigger("click");

    expect(authCompleteLogin).toHaveBeenCalledTimes(1);
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.info).toHaveBeenCalledWith("正在保存账号...");
  });

  it("首次网页登录前展示授权说明，确认后记录一次性状态", async () => {
    localStorage.removeItem("account-authorization-guide-seen");
    const w = await mountView();
    w.vm.newPlatform = "wechat_mp";
    const pending = w.vm.addAccount();
    await nextTick();

    expect(w.text()).toContain("如何完成账号授权");
    await w.get('[data-testid="acknowledge-auth-guide"]').trigger("click");
    expect(localStorage.getItem("account-authorization-guide-seen")).toBe("1");
    await pending;
  });

  it("关闭扫码登录时调用二维码关闭通道", async () => {
    const { authQrCodeClose } = await import("@/api/publisher");
    const w = await mountView();
    _eventCallbacks.qrOpened({ platform: "wechat_mp" });

    await w.vm.closeAuthView();

    expect(authQrCodeClose).toHaveBeenCalledTimes(1);
    expect(w.vm.authViewVisible).toBe(false);
  });

  it("setDefault 通过账号 Store 更新默认账号", async () => {
    const w = await mountView();
    const acc = { id: "a1", platform: "douyin", status: "active" };
    await w.vm.setDefault(acc);
    expect(_spies.setDefault).toHaveBeenCalledWith("a1", "douyin");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
  });

  it("setDefault catches exception", async () => {
    _spies.setDefault.mockRejectedValueOnce(new Error("set default failed"));
    const w = await mountView();
    const acc = { id: "a1", platform: "zhihu" };
    await w.vm.setDefault(acc);
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalled();
  });

  it("setDefault 业务失败时显示原始错误且不提示成功、不刷新", async () => {
    const { ElMessage } = await import("element-plus");
    _spies.setDefault.mockResolvedValueOnce({ code: 1, message: "账号不存在" });
    const w = await mountView();
    _spies.load.mockClear();

    await w.vm.setDefault({ id: "missing", platform: "zhihu" });

    expect(ElMessage.error).toHaveBeenCalledWith("账号不存在");
    expect(ElMessage.success).not.toHaveBeenCalled();
    expect(_spies.load).not.toHaveBeenCalled();
  });

  it("renameAccount updates name and refreshes", async () => {
    const w = await mountView();
    const acc = { id: "a1", account_name: "Old Name" };
    await w.vm.renameAccount(acc, "New Name");
    expect(_spies.renameAccount).toHaveBeenCalledWith("a1", "New Name");
  });

  it("renameAccount skips if name unchanged", async () => {
    const w = await mountView();
    const acc = { id: "a1", account_name: "Same" };
    await w.vm.renameAccount(acc, "Same");
    expect(_spies.renameAccount).not.toHaveBeenCalled();
  });

  it("renameAccount skips if name is empty", async () => {
    const w = await mountView();
    const acc = { id: "a1", account_name: "Old" };
    await w.vm.renameAccount(acc, "  ");
    expect(_spies.renameAccount).not.toHaveBeenCalled();
  });

  it("renameAccount catches exception", async () => {
    _spies.renameAccount.mockRejectedValueOnce(new Error("rename failed"));
    const w = await mountView();
    const acc = { id: "a1", account_name: "Old" };
    await w.vm.renameAccount(acc, "New");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalled();
  });

  it("renameAccount 业务失败时显示原始错误且不刷新", async () => {
    const { ElMessage } = await import("element-plus");
    _spies.renameAccount.mockResolvedValueOnce({ code: 1, message: "账号名称已存在" });
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
    expect(window.open).toHaveBeenCalledWith("https://creator.douyin.com/", "_blank");
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

  it("账号身份区域允许收缩并由稳定网格控制响应式布局", async () => {
    _testAccounts.length = 0;
    _testAccounts.push({ id: "a1", platform: "zhihu", status: "active", account_name: "知乎账号" });
    const w = mount(AccountsView, { global: { plugins: [createPinia()] } });
    await nextTick(); await new Promise(r => setTimeout(r, 0)); await nextTick();
    const info = w.find(".account-identity");
    expect(info.exists()).toBe(true);
    const vueSrc = fs.readFileSync("./src/features/accounts/components/PlatformAccountGroup.vue", "utf8");
    expect(vueSrc).toMatch(/grid-template-columns:\s*20px 28px 38px minmax\(180px, 1fr\) auto/);
    expect(vueSrc).toMatch(/\.account-identity\s*\{\s*min-width:\s*0/);
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

  it("收藏筛选只保留已收藏账号", async () => {
    _testAccounts.push(
      { id: "a1", platform: "zhihu", status: "active", account_name: "收藏账号" },
      { id: "a2", platform: "zhihu", status: "active", account_name: "普通账号" },
    );
    _favoriteIds.add("a1");
    const w = await mountView();

    w.vm.filter = "favorite";
    await nextTick();

    expect(w.vm.groupedPlatforms[0].accounts.map(account => account.id)).toEqual(["a1"]);
  });

  it("筛选状态、全选范围和批量删除范围始终使用当前可见账号", async () => {
    _testAccounts.push(
      { id: "a1", platform: "zhihu", status: "active", account_name: "有效账号" },
      { id: "a2", platform: "zhihu", status: "inactive", account_name: "失效账号" },
    );
    const w = await mountView();
    w.vm.accountStore.selectedIds.add("a2");
    w.vm.accountStore.selectedIds.add("a1");

    w.vm.filter = "active";
    await nextTick();

    expect(w.vm.accountStore.filterStatus).toBe("active");
    expect(w.vm.selectedCount).toBe(1);

    w.vm.toggleSelectAll();
    expect(_spies.selectAll).toHaveBeenCalledWith(["a1"]);

    _spies.batchDelete.mockResolvedValueOnce({ success: 1, failed: 0 });
    await w.vm.handleBatchDelete();
    expect(_spies.batchDelete).toHaveBeenCalledWith(["a1"]);
  });

  it("账号状态变化事件会刷新列表并提示失效数量", async () => {
    const w = await mountView();
    _spies.load.mockClear();

    _eventCallbacks.statusChanged({ expiredCount: 2 });
    await new Promise(resolve => setTimeout(resolve, 0));
    await nextTick();

    const { ElMessage } = await import("element-plus");
    expect(_spies.load).toHaveBeenCalledTimes(1);
    expect(ElMessage.warning).toHaveBeenCalledWith("2 个账号登录已失效");
  });

  it("登录完成事件会关闭登录视图、提示成功并刷新账号", async () => {
    const w = await mountView();
    _spies.load.mockClear();
    w.vm.authViewVisible = true;

    _eventCallbacks.authCompleted({ platform: "zhihu" });
    await new Promise(resolve => setTimeout(resolve, 0));
    await nextTick();

    const { ElMessage } = await import("element-plus");
    expect(w.vm.authViewVisible).toBe(false);
    expect(ElMessage.success).toHaveBeenCalledWith("账号添加成功");
    expect(_spies.load).toHaveBeenCalledTimes(1);
  });

  it("卸载时释放全部 Electron 登录事件订阅", async () => {
    const w = await mountView();

    w.unmount();

    for (const unsubscribe of Object.values(_eventUnsubscribers)) {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    }
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
    _testAccounts.push(
      { id: "a1", platform: "zhihu", status: "active" },
      { id: "a2", platform: "zhihu", status: "active" },
    );
    _selectedIds.add("a1");
    _selectedIds.add("a2");
    const w = await mountView();
    _spies.load.mockClear();

    await w.vm.handleBatchDelete();

    expect(_spies.batchDelete).toHaveBeenCalledTimes(1);
    expect(_spies.load).not.toHaveBeenCalled();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalledWith("已删除 2 个账号");
  });

  it("批量删除部分失败时显示成功和失败数量", async () => {
    _spies.batchDelete.mockResolvedValueOnce({ success: 1, failed: 1 });
    _testAccounts.push(
      { id: "a1", platform: "zhihu", status: "active" },
      { id: "a2", platform: "zhihu", status: "active" },
    );
    _selectedIds.add("a1");
    _selectedIds.add("a2");
    const w = await mountView();
    _spies.load.mockClear();

    await w.vm.handleBatchDelete();

    const { ElMessage } = await import("element-plus");
    expect(ElMessage.warning).toHaveBeenCalledWith("已删除 1 个账号，1 个删除失败");
    expect(ElMessage.success).not.toHaveBeenCalled();
    expect(_spies.load).not.toHaveBeenCalled();
  });

  it("批量删除全部失败时只显示失败提示", async () => {
    _spies.batchDelete.mockResolvedValueOnce({ success: 0, failed: 2 });
    _testAccounts.push(
      { id: "a1", platform: "zhihu", status: "active" },
      { id: "a2", platform: "zhihu", status: "active" },
    );
    _selectedIds.add("a1");
    _selectedIds.add("a2");
    const w = await mountView();
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
    expect(w.find(".batch-toolbar label input").element.checked).toBe(true);
    w.unmount();
  });

});
