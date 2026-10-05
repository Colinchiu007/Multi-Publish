import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import { setActivePinia, createPinia } from "pinia";
import fs from "node:fs";
import path from "node:path";
import i18n from "@/i18n";

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

// Dashboard 自 2026-09-15 起消费 useIdentity（登录门禁范式）；
// 文件级 mock 让既有用例与门禁用例都不依赖真实 identity store / pinia 装配。
const identityAuthenticatedRef = ref(false);
const identitySignInMock = vi.fn(async () => true);
vi.mock("@/composables/useIdentity", () => ({
  useIdentity: () => ({
    isAuthenticated: identityAuthenticatedRef,
    signIn: (...args) => identitySignInMock(...args),
  }),
}));

import DashboardView from "./Dashboard.vue";

describe("DashboardView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identityAuthenticatedRef.value = false;
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
    const w = mount(DashboardView, { global: { plugins: [createPinia(), i18n] } });
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.text()).toContain("数据看板");
  });

  it("loads and displays stats on mount", async () => {
    const w = mount(DashboardView, { global: { plugins: [createPinia(), i18n] } });
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    const text = w.text();
    expect(text).toContain("500");
    expect(text).toContain("42");
    expect(text).toContain("90.5");
  });

  it("shows recent publishes", async () => {
    const w = mount(DashboardView, { global: { plugins: [createPinia(), i18n] } });
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(w.text()).toContain("Test");
  });

  it("benchmark button allows analysis input", async () => {
    const w = mount(DashboardView, { global: { plugins: [createPinia(), i18n] } });
    await nextTick();
    w.vm.benchmarkTitle = "My Article";
    w.vm.doBenchmark();
    expect(w.vm.benchmarkActiveTitle).toBe("My Article");
  });

  it("shows TrialBanner component", async () => {
    const w = mount(DashboardView, { global: { plugins: [createPinia(), i18n] } });
    await nextTick();
    expect(w.findComponent({ name: "TrialBanner" }).exists()).toBe(true);
  });

  it("refresh button calls syncAll and updates data", async () => {
    const w = mount(DashboardView, { global: { plugins: [createPinia(), i18n] } });
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
    const w = mount(DashboardView, { global: { plugins: [createPinia(), i18n] } });
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(warnSpy).toHaveBeenCalledWith("Load cached failed:", "Network error");
    warnSpy.mockRestore();
  });

  it("shows trend chart when stats daily data is available", async () => {
    const w = mount(DashboardView, { global: { plugins: [createPinia(), i18n] } });
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(w.text()).toContain("发布趋势");
  });

  it("benchmark button disabled when input is empty", async () => {
    const w = mount(DashboardView, { global: { plugins: [createPinia(), i18n] } });
    await nextTick();
    w.vm.benchmarkTitle = "";
    w.vm.doBenchmark();
    expect(w.vm.benchmarkActiveTitle).toBe("");
  });
});

// ─── 未登录门禁（auth-gate 范式，2026-09-15）────────────────────────
// dashboard:stats / history:list 要求登录；AUTH_REQUIRED 不得静默吞掉，
// 也不得与 ENTITLEMENT_REQUIRED（同为 code:-3）混淆。
describe("Dashboard 未登录门禁（auth-gate 范式）", () => {
  const AUTH_GATE = { code: -3, errorCode: "AUTH_REQUIRED", message: "请先登录" };
  const ENTITLEMENT_GATE = { code: -3, errorCode: "ENTITLEMENT_REQUIRED", message: "无权益" };

  beforeEach(() => {
    vi.clearAllMocks();
    identityAuthenticatedRef.value = false;
    window.electronAPI = {
      dashboardStats: vi.fn().mockResolvedValue({ code: 0, data: { total: 3, success: 2, failed: 1, daily: [] } }),
      historyList: vi.fn().mockResolvedValue({ code: 0, data: { total: 0, records: [] } }),
      syncCached: vi.fn().mockResolvedValue({ code: 0, data: [] }),
    };
  });

  function mountGate () {
    return mount(DashboardView, { global: { plugins: [i18n] } });
  }

  async function settle (w) {
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    return w;
  }

  it("已登录（正常返回）不显示登录引导", async () => {
    const w = await settle(mountGate());
    expect(w.find('[data-testid="dashboard-login-gate"]').exists()).toBe(false);
    expect(w.text()).not.toContain("登录后可查看发布统计");
    w.unmount();
  });

  it("未登录被门禁拒绝时显示登录引导而非静默空数据", async () => {
    window.electronAPI.dashboardStats = vi.fn().mockResolvedValue(AUTH_GATE);
    window.electronAPI.historyList = vi.fn().mockResolvedValue(AUTH_GATE);
    const w = await settle(mountGate());
    expect(w.find('[data-testid="dashboard-login-gate"]').exists()).toBe(true);
    expect(w.text()).toContain("登录后可查看发布统计与最近发布。");
    expect(w.get('[data-testid="dashboard-sign-in"]').text()).toBe("去登录");
    w.unmount();
  });

  it("点击去登录触发 identity.signIn，登录成功后自动重载统计数据", async () => {
    window.electronAPI.dashboardStats = vi.fn().mockResolvedValueOnce(AUTH_GATE);
    window.electronAPI.historyList = vi.fn().mockResolvedValueOnce(AUTH_GATE);
    const w = await settle(mountGate());
    expect(w.find('[data-testid="dashboard-login-gate"]').exists()).toBe(true);

    await w.get('[data-testid="dashboard-sign-in"]').trigger("click");
    expect(identitySignInMock).toHaveBeenCalledTimes(1);

    identityAuthenticatedRef.value = true;
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(window.electronAPI.dashboardStats).toHaveBeenCalledTimes(2);
    expect(window.electronAPI.historyList).toHaveBeenCalledTimes(2);
    expect(w.find('[data-testid="dashboard-login-gate"]').exists()).toBe(false);
    w.unmount();
  });

  it("权益不足（ENTITLEMENT_REQUIRED）不误判为登录门禁，保持既有静默/错误路径", async () => {
    window.electronAPI.dashboardStats = vi.fn().mockResolvedValue(ENTITLEMENT_GATE);
    const w = await settle(mountGate());
    expect(w.find('[data-testid="dashboard-login-gate"]').exists()).toBe(false);
    expect(identitySignInMock).not.toHaveBeenCalled();
    w.unmount();
  });
});

/**
 * P2-6c 数据看板：作品互动回流面板接线 + 假数字撤除锁。
 *
 * 结构锁的存在理由：本页曾把 +8.5% / +23% / -2.1% / locale 里的「较上周 +12%」当数据展示。
 * 这些数字没有任何数据源（`sync:cached` 只留每平台一份最新值、没有时间序列），
 * 组件级断言只能证明「今天这几处删了」，证明不了「不会再写回去」，所以必须扫源码。
 */
describe("DashboardView 作品互动回流（P2-6c）", () => {
  function overviewPayload (overrides = {}) {
    return {
      code: 0,
      data: {
        hasData: true,
        windowDays: 30,
        totals: { views: 123, likes: 45, comments: 7, favorites: 3, shares: 1, interactions: 56 },
        trend: Array.from({ length: 30 }, (_, i) => ({
          date: "2026-10-" + String(i + 1).padStart(2, "0"),
          views: 0, likes: 0, comments: 0, favorites: 0, shares: 0, interactions: 0,
        })),
        byPlatform: [{ platform: "zhihu", contents: 1, views: 123, likes: 45, comments: 7, favorites: 3, shares: 1, interactions: 56 }],
        health: {
          trackedTotal: 1, covered: 1, coverage: 100,
          byStatus: { pending: 0, ok: 1, failed: 0, unsupported: 0, untrackable: 0, manual: 0, other: 0 },
          lastCapturedAt: "2026-10-03T09:12:00.000Z", neverRecrawled: false,
        },
        weekChange: null,
        truncated: { tracked: false, snapshot: false },
        limits: { tracked: 2000, snapshot: 20000 },
        diagnostics: { orphanSnapshots: 0, orphanSnapshotsDb: 0, retreats: 0, invalidMetrics: 0, droppedUndated: 0, invalidTrackedRows: 0 },
        ...overrides,
      },
    }
  }

  async function settle (w) {
    for (let i = 0; i < 4; i++) {
      await nextTick()
      await new Promise(r => setTimeout(r, 5))
    }
    await nextTick()
    return w
  }

  function mountDashboard () {
    setActivePinia(createPinia())
    window.electronAPI = {
      dashboardStats: vi.fn().mockResolvedValue({ code: 0, data: { total: 4, success: 3, failed: 1, successRate: 75, perPlatform: {}, daily: [] } }),
      historyList: vi.fn().mockResolvedValue({ code: 0, data: { records: [] } }),
      syncCached: vi.fn().mockResolvedValue({ code: 0, data: [] }),
      syncAll: vi.fn().mockResolvedValue({ code: 0 }),
      performanceOverview: vi.fn().mockResolvedValue(overviewPayload()),
    }
    return mount(DashboardView, { global: { plugins: [createPinia(), i18n] } })
  }

  it("回流面板随页面挂载，并把 IPC 数字渲染出来（链未断的证据）", async () => {
    const w = await settle(mountDashboard())
    expect(window.electronAPI.performanceOverview).toHaveBeenCalled()
    expect(w.find('[data-testid="perf-flow-panel"]').exists()).toBe(true)
    expect(w.get('[data-testid="perf-metric-views"]').text()).toBe("123")
    expect(w.get('[data-testid="perf-metric-likes"]').text()).toBe("45")
    w.unmount()
  })

  it("未登录时面板显示登录引导，而不是渲染一排 0", async () => {
    setActivePinia(createPinia())
    window.electronAPI = {
      dashboardStats: vi.fn().mockResolvedValue({ code: -3, errorCode: "AUTH_REQUIRED" }),
      historyList: vi.fn().mockResolvedValue({ code: -3, errorCode: "AUTH_REQUIRED" }),
      syncCached: vi.fn().mockResolvedValue({ code: 0, data: [] }),
      syncAll: vi.fn().mockResolvedValue({ code: 0 }),
      performanceOverview: vi.fn().mockResolvedValue({ code: -3, errorCode: "AUTH_REQUIRED" }),
    }
    const w = await settle(mount(DashboardView, { global: { plugins: [createPinia(), i18n] } }))
    expect(w.get('[data-testid="perf-flow-auth"]').text()).toBe(i18n.global.t("dashboard.metrics.loginRequired"))
    expect(w.find('[data-testid="perf-flow-metrics"]').exists()).toBe(false)
    w.unmount()
  })

  it("页面刷新按钮带动面板重新取数（一个刷新入口，两套数字）", async () => {
    const w = await settle(mountDashboard())
    const before = window.electronAPI.performanceOverview.mock.calls.length
    await w.get('[data-testid="dashboard-refresh-btn"]').trigger("click")
    await settle(w)
    expect(window.electronAPI.performanceOverview.mock.calls.length).toBeGreaterThan(before)
    w.unmount()
  })

  it("模板里不得再出现「±数字%」这类无数据源的变化量，且测量域非空（防自锁失明）", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "Dashboard.vue"), "utf8")
    const template = src.slice(src.indexOf("<template>"), src.indexOf("</template>"))
    // 反失明：测量域本身必须有内容，否则"0 命中"可能只是解析退化成了空串
    expect(template.length).toBeGreaterThan(2000)
    expect((src.match(/stat-value/g) || []).length).toBeGreaterThanOrEqual(6)
    const fabricated = template.match(/[+\u2212-]\d+(?:\.\d+)?%/g) || []
    expect(fabricated, "假百分比字面量: " + fabricated.join(", ")).toEqual([])
    expect(src).not.toContain("dashboard.weekChange")
    expect(src).not.toContain("stat-change")
  })

  it("回流面板的文案全部走 locale（zh/en 成对），模板除注释外不得有中文", () => {
    const panel = fs.readFileSync(path.resolve(__dirname, "../features/dashboard/PerformanceFlowPanel.vue"), "utf8")
    expect(panel.length).toBeGreaterThan(1000)
    const template = panel.slice(0, panel.indexOf("<script"))
    expect(template.length).toBeGreaterThan(500)
    // HTML 注释不渲染（本仓 .vue 模板普遍带中文注释），判据只针对会进包体的字面量
    const visible = template.replace(/<!--[\s\S]*?-->/g, "")
    expect(visible.match(/[\u4e00-\u9fa5]/g) || [], "模板内残留中文字面量").toEqual([])
    for (const key of ["title", "views", "likes", "comments", "favorites", "shares", "trendTitle", "platformTitle", "healthTitle", "loginRequired", "emptyTitle"]) {
      expect(i18n.global.te("dashboard.metrics." + key), "缺键 dashboard.metrics." + key).toBe(true)
    }
  })
})
