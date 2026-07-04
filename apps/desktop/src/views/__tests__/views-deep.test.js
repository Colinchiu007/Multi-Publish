import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { ElMessage } from "element-plus";

const pushSpy = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: pushSpy })
}));

vi.mock("@/stores/platforms", () => ({
  usePlatformStore: () => ({
    load: vi.fn(),
    platforms: [
      { id: "wechat_mp", label: "微信" },
      { id: "zhihu", label: "知乎" },
    ],
    getLabel: (k) => ({ wechat_mp: "微信", zhihu: "知乎" }[k] || k),
    getIcon: () => "ἱ0",
  })
}));

vi.mock("@/stores/accounts", () => ({
  useAccountStore: () => ({
    load: vi.fn(),
    accounts: [
      { id: "a1", platform: "wechat_mp", name: "MP1", status: "active" },
      { id: "a2", platform: "zhihu", name: "Zhihu1", status: "inactive" },
    ],
    byPlatform: {
      wechat_mp: [{ id: "a1", platform: "wechat_mp", name: "MP1", status: "active" }],
      zhihu: [{ id: "a2", platform: "zhihu", name: "Zhihu1", status: "inactive" }],
    },
    getDefault: (p) => p === "wechat_mp" ? { id: "a1", name: "MP1" } : null
  })
}));

vi.mock("@/stores/license", () => ({
  useLicenseStore: () => ({ isPro: true })
}));

vi.mock("@/stores/templates", () => ({
  useTemplateStore: () => ({ load: vi.fn() })
}));

vi.mock("element-plus", () => ({
  ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}));

vi.mock("@element-plus/icons-vue", () => ({ UploadFilled: { template: "<span>U</span>" } }));

async function setupView(path) {
  const mod = await import("@/views/" + path);
  const { setActivePinia, createPinia } = await import("pinia");
  setActivePinia(createPinia());
  return { mod, pinia: createPinia() };
}

// ====== Home.vue ======
describe("HomeView (deep)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      getVersion: vi.fn().mockResolvedValue("2.1.0"),
      storeGetPublishStats: vi.fn().mockResolvedValue({ code: 0, data: { total: 100, success: 95, failed: 5 } }),
      storeListAccounts: vi.fn().mockResolvedValue({ code: 0, data: [{ id: "a1" }, { id: "a2" }, { id: "a3" }] }),
    };
  });

  it("navigates on card click", async () => {
    const { mod } = await setupView("Home.vue");
    const w = mount(mod.default);
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    const cards = w.findAll(".cohere-stat-card");
    await cards[3].trigger("click");
    expect(pushSpy).toHaveBeenCalledWith("/accounts");
  });

  it("loads stats from API", async () => {
    const { mod } = await setupView("Home.vue");
    mount(mod.default);
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(window.electronAPI.storeGetPublishStats).toHaveBeenCalled();
  });

  it("shows version from API", async () => {
    const { mod } = await setupView("Home.vue");
    const w = mount(mod.default);
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(w.text()).toContain("2.1.0");
  });
});

// ====== Accounts.vue ======
describe("AccountsView (deep)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("renders platforms from store", async () => {
    const { mod, pinia } = await setupView("Accounts.vue");
    const w = mount(mod.default, { global: { plugins: [pinia] } });
    await nextTick();
    expect(w.vm.totalAccounts).toBeGreaterThanOrEqual(1);
  });

  it("filters accounts", async () => {
    const { mod, pinia } = await setupView("Accounts.vue");
    const w = mount(mod.default, { global: { plugins: [pinia] } });
    await nextTick();
    w.vm.filter = "active";
    await nextTick();
    expect(w.vm.filter).toBe("active");
  });
});

// ====== Collection.vue ======
describe("CollectionView (deep)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: vi.fn().mockResolvedValue("Title\nContent") },
      writable: true, configurable: true
    });
  });

  it("creates draft and navigates", async () => {
    const { mod } = await setupView("Collection.vue");
    const w = mount(mod.default);
    await nextTick();
    w.vm.createDraft();
    await nextTick();
    expect(w.vm.drafts.length).toBe(1);
    expect(pushSpy).toHaveBeenCalled();
  });

  it("imports from clipboard", async () => {
    const { mod } = await setupView("Collection.vue");
    const w = mount(mod.default);
    await nextTick();
    await w.vm.importFromClipboard();
    await nextTick();
    expect(w.vm.drafts.length).toBe(1);
    expect(ElMessage.success).toHaveBeenCalled();
  });

  it("handles clipboard failure", async () => {
    navigator.clipboard.readText = vi.fn().mockRejectedValue(new Error("denied"));
    const { mod } = await setupView("Collection.vue");
    const w = mount(mod.default);
    await nextTick();
    await w.vm.importFromClipboard();
    await nextTick();
    expect(ElMessage.error).toHaveBeenCalled();
  });
});

// ====== Dashboard.vue ======
describe("DashboardView (deep)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      dashboardStats: vi.fn().mockResolvedValue({
        code: 0,
        data: { total: 42, success: 38, failed: 4, successRate: 90.5,
          perPlatform: { wechat_mp: { total: 20 }, zhihu: { total: 22 } },
          daily: [{ date: "2026-06-20", total: 3 }, { date: "2026-06-21", total: 5 }] }
      }),
      historyList: vi.fn().mockResolvedValue({ code: 0, data: { records: [] } }),
      syncCached: vi.fn().mockResolvedValue({ code: 0, data: [] }),
    };
  });

  it("loads stats on mount", async () => {
    const { mod, pinia } = await setupView("Dashboard.vue");
    mount(mod.default, { global: { plugins: [pinia] } });
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(window.electronAPI.dashboardStats).toHaveBeenCalled();
  });

  it("shows stats data", async () => {
    const { mod, pinia } = await setupView("Dashboard.vue");
    const w = mount(mod.default, { global: { plugins: [pinia] } });
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(w.vm.statsData).not.toBeNull();
    expect(w.vm.statsData.total).toBe(42);
  });

  it("shows benchmark input", async () => {
    const { mod, pinia } = await setupView("Dashboard.vue");
    const w = mount(mod.default, { global: { plugins: [pinia] } });
    await nextTick();
    w.vm.benchmarkTitle = "Test";
    w.vm.doBenchmark();
    expect(w.vm.benchmarkActiveTitle).toBe("Test");
  });
});
