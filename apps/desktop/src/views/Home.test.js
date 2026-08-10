import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

const pushSpy = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: pushSpy }),
}));

vi.mock("@/stores/identity", () => ({
  useIdentityStore: () => ({ displayName: "测试用户" }),
}));

const platformStoreMock = {
  platforms: [],
  load: vi.fn(),
  getIcon: vi.fn().mockReturnValue(""),
  getLabel: vi.fn().mockImplementation((id) => id),
};
vi.mock("@/stores/platforms", () => ({
  usePlatformStore: () => platformStoreMock,
}));

import HomeView from "./Home.vue";

async function flushMounted(w) {
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
  return w;
}

describe("HomeView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformStoreMock.platforms = [];
    window.electronAPI = {
      storeGetPublishStats: vi.fn().mockResolvedValue({ code: 0, data: { total: 42, success: 38, failed: 4 } }),
      storeListAccounts: vi.fn().mockResolvedValue({ code: 0, data: [{ id: "a1" }, { id: "a2" }] }),
      historyList: vi.fn().mockResolvedValue({ code: 0, data: [] }),
    };
  });

  it("renders welcome section with greeting and static subtitle", async () => {
    const w = await flushMounted(mount(HomeView));
    const text = w.text();
    expect(text).toContain("多平台内容一键发布");
    expect(text).toContain("测试用户");
    expect(text).toMatch(/夜深了|早上好|中午好|下午好|晚上好/);
  });

  it("shows six shortcut entries", async () => {
    const w = await flushMounted(mount(HomeView));
    const shortcuts = w.findAll(".yixiaoer-home-shortcut");
    expect(shortcuts.length).toBe(6);
    expect(w.text()).toContain("一键发布");
    expect(w.text()).toContain("账号管理");
    expect(w.text()).toContain("私信评论");
  });

  it("falls back to built-in platform tags when platform store is empty", async () => {
    const w = await flushMounted(mount(HomeView));
    const tags = w.findAll(".yixiaoer-home-platform-tag");
    expect(tags.length).toBeGreaterThan(0);
    expect(w.text()).toContain("微信公众号");
  });

  it("uses platform store entries when available", async () => {
    platformStoreMock.platforms = [{ id: "weibo", label: "微博" }];
    platformStoreMock.getIcon.mockImplementation((id) => (id === "weibo" ? "✧" : ""));
    const w = await flushMounted(mount(HomeView));
    const tags = w.findAll(".yixiaoer-home-platform-tag");
    expect(tags.length).toBe(1);
    expect(tags[0].text()).toContain("微博");
  });

  it("loads and displays stats, account count and recent activity on mount", async () => {
    window.electronAPI.historyList = vi.fn().mockResolvedValue({
      code: 0,
      data: [{ id: "h1", title: "测试文章", platform: "weibo", status: "success", created_at: "2026-08-10T00:00:00Z" }],
    });
    const w = await flushMounted(mount(HomeView));
    const text = w.text();
    expect(text).toContain("42");
    expect(text).toContain("38");
    expect(text).toContain("4");
    expect(text).toContain("测试文章");
    expect(text).toContain("成功");
    expect(window.electronAPI.storeGetPublishStats).toHaveBeenCalled();
    expect(window.electronAPI.storeListAccounts).toHaveBeenCalled();
    expect(platformStoreMock.load).toHaveBeenCalled();
  });

  it("shows empty recent state when there is no history", async () => {
    const w = await flushMounted(mount(HomeView));
    expect(w.text()).toContain("暂无发布记录，开始你的第一次发布吧！");
  });

  it("navigates on shortcut and quick action click", async () => {
    const w = await flushMounted(mount(HomeView));
    await w.findAll(".yixiaoer-home-shortcut")[0].trigger("click");
    expect(pushSpy).toHaveBeenCalledWith("/publish");
    await w.get('[data-testid="home-add-account"]').trigger("click");
    expect(pushSpy).toHaveBeenCalledWith("/accounts");
  });

  it("handles missing electronAPI gracefully", async () => {
    delete window.electronAPI;
    const w = await flushMounted(mount(HomeView));
    expect(w.find(".yixiaoer-home").exists()).toBe(true);
    expect(w.text()).toContain("暂无发布记录，开始你的第一次发布吧！");
  });
});
