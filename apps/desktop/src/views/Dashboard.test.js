import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/stores/platforms", () => ({
  usePlatformStore: () => ({
    load: vi.fn(),
    getLabel: (k) => ({ wechat_mp: "微信", zhihu: "知乎" }[k] || k),
    getIcon: (k) => "📱",
  })
}));

vi.mock("@/api/publisher", () => ({
  syncAll: vi.fn().mockResolvedValue(undefined),
  syncPlatform: vi.fn(),
}));

import DashboardView from "./Dashboard.vue";

describe("DashboardView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {
      dashboardStats: vi.fn().mockResolvedValue({
        code: 0,
        data: { total: 42, success: 38, failed: 4, successRate: 90.5, perPlatform: { wechat_mp: { total: 20 }, zhihu: { total: 22 } }, daily: [{ date: "2026-06-20", total: 3 }, { date: "2026-06-21", total: 5 }] }
      }),
      historyList: vi.fn().mockResolvedValue({ code: 0, data: { records: [{ id: "r1", title: "Test", platform: "wechat_mp", status: "success" }] } }),
      syncCached: vi.fn().mockResolvedValue({ code: 0, data: [{ id: "p1", articles: 10, views: 500, comments: 20, followers: 100 }] }),
    };
  });

  it("renders page title", async () => {
    const w = mount(DashboardView, { global: { plugins: [createPinia()] } });
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.text()).toContain("数据看板");
  });

  it("loads and displays stats on mount", async () => {
    const w = mount(DashboardView, { global: { plugins: [createPinia()] } });
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    const text = w.text();
    expect(text).toContain("500");
    expect(text).toContain("42");
    expect(text).toContain("90.5");
  });

  it("shows recent publishes", async () => {
    const w = mount(DashboardView, { global: { plugins: [createPinia()] } });
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(w.text()).toContain("Test");
  });

  it("benchmark button allows analysis input", async () => {
    const w = mount(DashboardView, { global: { plugins: [createPinia()] } });
    await nextTick();
    w.vm.benchmarkTitle = "My Article";
    w.vm.doBenchmark();
    expect(w.vm.benchmarkActiveTitle).toBe("My Article");
  });

  it("shows TrialBanner component", async () => {
    const w = mount(DashboardView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.findComponent({ name: "TrialBanner" }).exists()).toBe(true);
  });

  it("refresh button calls syncAll and updates data", async () => {
    const w = mount(DashboardView, { global: { plugins: [createPinia()] } });
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    const btn = w.find(".cohere-btn-secondary");
    expect(btn.exists()).toBe(true);
    await btn.trigger("click");
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    const { syncAll } = await import("@/api/publisher");
    expect(syncAll).toHaveBeenCalled();
  });

  it("handles syncCached failure gracefully", async () => {
    window.electronAPI.syncCached = vi.fn().mockRejectedValue(new Error("Network error"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = mount(DashboardView, { global: { plugins: [createPinia()] } });
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(warnSpy).toHaveBeenCalledWith("Load cached failed:", "Network error");
    warnSpy.mockRestore();
  });

  it("shows trend chart when stats daily data is available", async () => {
    const w = mount(DashboardView, { global: { plugins: [createPinia()] } });
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(w.text()).toContain("发布趋势");
  });

  it("benchmark button disabled when input is empty", async () => {
    const w = mount(DashboardView, { global: { plugins: [createPinia()] } });
    await nextTick();
    w.vm.benchmarkTitle = "";
    w.vm.doBenchmark();
    expect(w.vm.benchmarkActiveTitle).toBe("");
  });
});
