import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/stores/platforms", () => ({
  usePlatformStore: () => ({ load: vi.fn(), getLabel: (k) => k, getIcon: () => "icon" })
}));

vi.mock("element-plus", () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() }
}));

import MonitorView from "./Monitor.vue";

describe("MonitorView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it("renders page title", async () => {
    const w = mount(MonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.text()).toContain("\u5206\u5c4f\u76d1\u63a7");
  });

  it("shows layout toggle buttons", async () => {
    const w = mount(MonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    const btns = w.findAll(".layout-btn");
    expect(btns.length).toBeGreaterThanOrEqual(2);
  });

  it("layoutLabel returns correct label for each layout", async () => {
    const w = mount(MonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.vm.layoutLabel).toBe("\u5355\u5c4f");
    w.vm.currentLayout = 2;
    await nextTick();
    expect(w.vm.layoutLabel).toBe("\u53cc\u5c4f");
    w.vm.currentLayout = 3;
    await nextTick();
    expect(w.vm.layoutLabel).toBe("\u4e09\u5c4f");
    w.vm.currentLayout = 4;
    await nextTick();
    expect(w.vm.layoutLabel).toBe("\u56db\u5c4f");
    w.vm.currentLayout = 6;
    await nextTick();
    expect(w.vm.layoutLabel).toBe("\u516d\u5c4f");
  });

  it("layoutLabel defaults to single when no match", async () => {
    const w = mount(MonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    w.vm.currentLayout = 99;
    await nextTick();
    expect(w.vm.layoutLabel).toBe("\u5355\u5c4f");
  });

  it("platformLabel returns label for known platform", async () => {
    const w = mount(MonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.vm.platformLabel("douyin")).toBe("\u6296\u97f3");
    expect(w.vm.platformLabel("weibo")).toBe("\u5fae\u535a");
    expect(w.vm.platformLabel("zhihu")).toBe("\u77e5\u4e4e");
  });

  it("platformLabel returns id for unknown platform", async () => {
    const w = mount(MonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.vm.platformLabel("unknown_platform")).toBe("unknown_platform");
  });

  it("loadTabs refreshes tabs from electronAPI", async () => {
    const mockTabs = [{ id: "tab-0" }, { id: "tab-1" }];
    window.electronAPI = {
      webviewListTabs: vi.fn().mockResolvedValue({ code: 0, data: mockTabs })
    };
    const w = mount(MonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    await w.vm.loadTabs();
    expect(window.electronAPI.webviewListTabs).toHaveBeenCalled();
    expect(w.vm.tabs).toEqual(mockTabs);
  });

  it("loadTabs handles missing API gracefully", async () => {
    window.electronAPI = {};
    const w = mount(MonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    await w.vm.loadTabs();
    expect(w.vm.tabs).toEqual([]);
  });

  it("switchLayout sets currentLayout and calls webviewSetLayout", async () => {
    window.electronAPI = {
      webviewSetLayout: vi.fn().mockResolvedValue(undefined)
    };
    const w = mount(MonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    await w.vm.switchLayout(4);
    expect(w.vm.currentLayout).toBe(4);
    expect(window.electronAPI.webviewSetLayout).toHaveBeenCalledWith(4);
  });

  it("switchLayout handles missing API gracefully", async () => {
    window.electronAPI = {};
    const w = mount(MonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    await w.vm.switchLayout(2);
    expect(w.vm.currentLayout).toBe(2);
  });

  it("confirmAdd warns if no platform selected", async () => {
    window.electronAPI = {};
    const w = mount(MonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    w.vm.newPlatform = "";
    await w.vm.confirmAdd();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.warning).toHaveBeenCalled();
  });

  it("confirmAdd succeeds and closes dialog", async () => {
    window.electronAPI = {
      webviewOpenTab: vi.fn().mockResolvedValue({ code: 0 })
    };
    const w = mount(MonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    w.vm.newPlatform = "douyin";
    w.vm.showDialog = true;
    await w.vm.confirmAdd();
    expect(window.electronAPI.webviewOpenTab).toHaveBeenCalledWith({ platform: "douyin" });
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
    expect(w.vm.showDialog).toBe(false);
    expect(w.vm.newPlatform).toBe("");
  });

  it("confirmAdd shows error from API response", async () => {
    window.electronAPI = {
      webviewOpenTab: vi.fn().mockResolvedValue({ code: 1, message: "platform not login" })
    };
    const w = mount(MonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    w.vm.newPlatform = "weibo";
    await w.vm.confirmAdd();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalledWith("platform not login");
  });

  it("confirmAdd catches exception and shows error", async () => {
    window.electronAPI = {
      webviewOpenTab: vi.fn().mockRejectedValue(new Error("network error"))
    };
    const w = mount(MonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    w.vm.newPlatform = "douyin";
    await w.vm.confirmAdd();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalledWith("network error");
  });

  it("closeAllTabs clears tabs and calls webviewCloseAll", async () => {
    window.electronAPI = {
      webviewCloseAll: vi.fn().mockResolvedValue(undefined)
    };
    const w = mount(MonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    w.vm.tabs = [{ id: "tab-0" }, { id: "tab-1" }];
    await w.vm.closeAllTabs();
    expect(window.electronAPI.webviewCloseAll).toHaveBeenCalled();
    expect(w.vm.tabs).toEqual([]);
  });

  it("closeAllTabs handles missing API gracefully", async () => {
    window.electronAPI = {};
    const w = mount(MonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    w.vm.tabs = [{ id: "tab-0" }];
    await w.vm.closeAllTabs();
    // Without API, tabs are not cleared (no webviewCloseAll call)
    expect(w.vm.tabs.length).toBe(1);
  });
});
