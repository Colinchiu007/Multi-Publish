import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createRouter, createWebHistory } from "vue-router";

const pushSpy = vi.fn();
const router = createRouter({ history: createWebHistory(), routes: [
  { path: "/", name: "home", component: { template: "<div>home</div>" } },
] });
const routes = {
  useRouter: () => ({ push: pushSpy })
};
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: pushSpy }),
  createRouter: vi.fn(),
  createWebHistory: vi.fn(),
}));

import HomeView from "./Home.vue";

describe("HomeView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      getVersion: vi.fn().mockResolvedValue("2.0.0"),
      storeGetPublishStats: vi.fn().mockResolvedValue({ code: 0, data: { total: 42, success: 38, failed: 4 } }),
      storeListAccounts: vi.fn().mockResolvedValue({ code: 0, data: [{ id: "a1" }, { id: "a2" }] }),
    };
  });

  it("renders page title and version from API", async () => {
    const w = mount(HomeView, { global: { plugins: [] } });
    await nextTick();
    // Wait for onMounted async
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    const text = w.text();
    expect(text).toContain("社媒管家");
    expect(text).toContain("v2.0.0");
  });

  it("shows navigation cards", async () => {
    const w = mount(HomeView, { global: { plugins: [] } });
    await nextTick();
    expect(w.text()).toContain("一键发布");
    expect(w.text()).toContain("账号管理");
  });

  it("shows platform tags", async () => {
    const w = mount(HomeView, { global: { plugins: [] } });
    await nextTick();
    expect(w.text()).toContain("微信公众号");
  });

  it("loads and displays stats on mount", async () => {
    const w = mount(HomeView, { global: { plugins: [] } });
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    const text = w.text();
    expect(text).toContain("42");
    expect(text).toContain("38");
    expect(text).toContain("4");
    expect(text).toContain("2");
  });

  it("navigates on card click", async () => {
    const w = mount(HomeView, { global: { plugins: [] } });
    await nextTick();
    const cards = w.findAll(".cohere-stat-card");
    await cards[0].trigger("click");
    expect(pushSpy).toHaveBeenCalledWith("/publish");
  });

  it("handles missing electronAPI gracefully", async () => {
    delete window.electronAPI;
    const w = mount(HomeView, { global: { plugins: [] } });
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    expect(w.vm.loaded).toBe(true);
  });
});
