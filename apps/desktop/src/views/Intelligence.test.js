import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";
import i18n from "@/i18n";

vi.mock("@/components/TrendingPanel.vue", () => ({ default: { template: "<div>trending-panel</div>" } }));
vi.mock("@/components/ReferenceFinder.vue", () => ({ default: { template: "<div v-if='visible'>ref-finder</div>", props: ["visible", "searchText"] } }));
vi.mock("element-plus", () => ({ ElMessage: { success: vi.fn() } }));

// 组件已 import { intelligenceSearch, intelligenceSearchTitles } from '@/api/publisher'
// 必须用 vi.mock 拦截 ESM import
vi.mock("@/api/publisher", () => ({
  intelligenceSearch: vi.fn(),
  intelligenceSearchTitles: vi.fn(),
}));

import { intelligenceSearch, intelligenceSearchTitles } from "@/api/publisher";
import IntelligenceView from "./Intelligence.vue";
import EmptyState from "@/components/EmptyState.vue";

describe("IntelligenceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {};
  });

  function createView() {
    return mount(IntelligenceView, { global: { plugins: [createPinia(), i18n] } });
  }

  it("renders page title", async () => {
    const w = createView();
    await nextTick();
    expect(w.text()).toContain("\u5185\u5bb9\u60c5\u62a5");
  });

  it("shows search input", async () => {
    const w = createView();
    await nextTick();
    const input = w.find("input");
    expect(input.exists()).toBe(true);
  });

  it("formatTime formats timestamp", async () => {
    const w = createView();
    await nextTick();
    const result = w.vm.formatTime("2026-07-05T10:00:00Z");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("formatTime handles null/undefined", async () => {
    const w = createView();
    await nextTick();
    expect(w.vm.formatTime(null)).toBe("");
    expect(w.vm.formatTime(undefined)).toBe("");
  });

  it("formatTime handles invalid input gracefully", async () => {
    const w = createView();
    await nextTick();
    const result = w.vm.formatTime("invalid-date");
    // 契约变更（unify-desktop-frontend 2.4）：旧实现将 Intl 内部文案 "Invalid Date" 直出给用户；
    // 统一后解析失败返回调用方声明的 invalidText（此处为原始输入回显），且绝不抛异常。
    expect(result).toBe("invalid-date");
  });

  it("sourceLabel returns correct labels", async () => {
    const w = createView();
    await nextTick();
    expect(w.vm.sourceLabel("reddit")).toBe("Reddit");
    expect(w.vm.sourceLabel("hackernews")).toBe("HN");
    expect(w.vm.sourceLabel("github")).toBe("GitHub");
    expect(w.vm.sourceLabel("unknown")).toBe("unknown");
  });

  it("sourceColor returns correct colors", async () => {
    const w = createView();
    await nextTick();
    expect(w.vm.sourceColor("reddit")).toBe("var(--color-source-reddit)");
    expect(w.vm.sourceColor("hackernews")).toBe("var(--color-source-hn)");
    expect(w.vm.sourceColor("github")).toBe("var(--color-text-primary)");
    expect(w.vm.sourceColor("unknown")).toBe("var(--color-text-muted)");
  });

  it("scoreColor returns color based on score threshold", async () => {
    const w = createView();
    await nextTick();
    expect(w.vm.scoreColor(2.5)).toBe("#2e7d32");
    expect(w.vm.scoreColor(2.0)).toBe("#2e7d32");
    expect(w.vm.scoreColor(1.5)).toBe("#f57c00");
    expect(w.vm.scoreColor(1.0)).toBe("#f57c00");
    expect(w.vm.scoreColor(0.5)).toBe("var(--color-text-muted)");
  });

  it("selectedSources defaults to all sources", async () => {
    const w = createView();
    await nextTick();
    expect(w.vm.selectedSources).toContain("reddit");
    expect(w.vm.selectedSources).toContain("hackernews");
    expect(w.vm.selectedSources).toContain("github");
    expect(w.vm.selectedSources.length).toBe(3);
  });

  it("doSearch requires non-empty query", async () => {
    const w = createView();
    await nextTick();
    w.vm.query = "";
    await w.vm.doSearch();
    expect(intelligenceSearch).not.toHaveBeenCalled();
  });

  it("doSearch calls intelligenceSearch with query and sources", async () => {
    vi.mocked(intelligenceSearch).mockResolvedValue({ code: 0, data: { total: 2, results: [], timestamp: "2026-07-05T10:00:00Z" } });
    vi.mocked(intelligenceSearchTitles).mockResolvedValue({ code: 0, data: { titleAnalysis: null } });
    const w = createView();
    await nextTick();
    w.vm.query = "AI trends";
    await w.vm.doSearch();
    expect(intelligenceSearch).toHaveBeenCalledWith("AI trends", {
      sources: ["reddit", "hackernews", "github"],
      limit: 10,
    });
    expect(w.vm.searching).toBe(false);
  });

  it("doSearch sets result and titleAnalysis", async () => {
    vi.mocked(intelligenceSearch).mockResolvedValue({
      code: 0, data: { total: 1, results: [{ id: "1", title: "AI", source: "reddit", engagement: 1.5 }], timestamp: "2026-07-05T10:00:00Z" }
    });
    vi.mocked(intelligenceSearchTitles).mockResolvedValue({
      code: 0, data: { titleAnalysis: { patterns: [["AI", 3]], suggestion: { tip: "Use AI" } } }
    });
    const w = createView();
    await nextTick();
    w.vm.query = "AI";
    await w.vm.doSearch();
    expect(w.vm.result).toBeTruthy();
    expect(w.vm.result.total).toBe(1);
    expect(w.vm.titleAnalysis).toBeTruthy();
    expect(w.vm.titleAnalysis.suggestion.tip).toBe("Use AI");
  });

  it("doSearch handles API error gracefully", async () => {
    vi.mocked(intelligenceSearch).mockRejectedValue(new Error("API error"));
    const w = createView();
    await nextTick();
    w.vm.query = "test";
    await w.vm.doSearch();
    expect(w.vm.searching).toBe(false);
    expect(w.vm.result).toBeNull();
  });

  it("clearSearch clears query and results", async () => {
    const w = createView();
    await nextTick();
    w.vm.query = "test";
    w.vm.result = { total: 1 };
    w.vm.titleAnalysis = { patterns: [] };
    w.vm.clearSearch();
    expect(w.vm.query).toBe("");
    expect(w.vm.result).toBeNull();
    expect(w.vm.titleAnalysis).toBeNull();
  });

  it("useAsReference sets ref text and shows dialog", async () => {
    const w = createView();
    await nextTick();
    const item = { title: "AI Article" };
    w.vm.useAsReference(item);
    expect(w.vm.refSearchText).toBe("AI Article");
    expect(w.vm.refVisible).toBe(true);
  });

  it("insertRef shows success message", async () => {
    const w = createView();
    await nextTick();
    const ref = { title: "Reference Title" };
    w.vm.insertRef(ref);
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
  });

  // 相关性门禁挂在 search() 共用出口 ⇒ 情报页也会因过滤而归零。
  // 归零时若仍只报「暂无结果，试试其他关键词」，就把"源有响应"谎称成"你没搜对"，
  // 用户会反复换关键词排障。这两条锁住两种归零必须可区分。
  it("情报页结果被门禁过滤为空时，空态必须带上被过滤条数", async () => {
    vi.mocked(intelligenceSearch).mockResolvedValue({
      code: 0,
      data: { total: 0, results: [], droppedIrrelevant: 7, timestamp: "2026-09-28T10:00:00Z" }
    });
    vi.mocked(intelligenceSearchTitles).mockResolvedValue({ code: 0, data: { titleAnalysis: null } });
    const w = createView();
    await nextTick();
    w.vm.query = "AI trends";
    await w.vm.doSearch();
    await nextTick();
    const empty = w.findComponent(EmptyState);
    expect(empty.exists()).toBe(true);
    expect(empty.props("description")).toContain("7");
  });

  it("源真的无响应时情报页不得谎称已过滤", async () => {
    vi.mocked(intelligenceSearch).mockResolvedValue({
      code: 0,
      data: { total: 0, results: [], timestamp: "2026-09-28T10:00:00Z" }
    });
    vi.mocked(intelligenceSearchTitles).mockResolvedValue({ code: 0, data: { titleAnalysis: null } });
    const w = createView();
    await nextTick();
    w.vm.query = "AI trends";
    await w.vm.doSearch();
    await nextTick();
    const empty = w.findComponent(EmptyState);
    expect(empty.exists()).toBe(true);
    expect(empty.props("description")).toBe("");
  });
  // PRD-HREF-SCHEME-GUARD：第三方 API 的 url 字段由提交人可控，非 http/https 一律不得成链
  it('结果 url 不是 http/https 时不产出锚点，标题降级为纯文本且内容不丢', async () => {
    const w = createView();
    w.vm.result = {
      query: "红烧肉",
      total: 2,
      droppedIrrelevant: 0,
      sources: [],
      timestamp: 0,
      results: [
        { source: "hackernews", id: "safe", title: "安全标题", url: "https://news.ycombinator.com/item?id=1",
          author: "a", engagement: 1.2, upvotes: 1, comments: 0, snippet: "" },
        { source: "hackernews", id: "bad", title: "恶意标题", url: "javascript:window.electronAPI.store.set('pwned','1')",
          author: "b", engagement: 2.0, upvotes: 9, comments: 9, snippet: "" },
      ],
    };
    await nextTick();
    const links = w.findAll("a.int-link");
    expect(links).toHaveLength(1);
    expect(links[0].attributes("href")).toBe("https://news.ycombinator.com/item?id=1");
    expect(w.html()).not.toContain("javascript:");
    const plain = w.findAll("span.int-link").map(s => s.text());
    expect(plain).toContain("恶意标题");
  });
});
