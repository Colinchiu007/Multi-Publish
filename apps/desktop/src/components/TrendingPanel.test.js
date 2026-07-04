import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

import TrendingPanel from "./TrendingPanel.vue";

describe("TrendingPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.intelligenceFetchTrending = vi.fn();
  });

  it("shows loading state", async () => {
    window.intelligenceFetchTrending.mockImplementation(() => new Promise(() => {}));
    const w = mount(TrendingPanel);
    await nextTick();
    expect(w.text()).toContain("加载中");
  });

  it("shows error state with retry", async () => {
    window.intelligenceFetchTrending.mockRejectedValue(new Error("网络错误"));
    const w = mount(TrendingPanel);
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(w.text()).toContain("网络错误");
    expect(w.text()).toContain("重新加载");
  });

  it("retries on reload button click", async () => {
    window.intelligenceFetchTrending.mockRejectedValueOnce(new Error("首次失败"));
    window.intelligenceFetchTrending.mockResolvedValueOnce([]);
    const w = mount(TrendingPanel);
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    // Click retry button
    const retryBtn = w.findAll("button").filter(b => b.text().includes("重新加载"));
    await retryBtn[0].trigger("click");
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(window.intelligenceFetchTrending).toHaveBeenCalledTimes(2);
  });

  it("shows empty state", async () => {
    window.intelligenceFetchTrending.mockResolvedValue([]);
    const w = mount(TrendingPanel);
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(w.text()).toContain("暂无热门内容");
  });

  it("displays trending items", async () => {
    window.intelligenceFetchTrending.mockResolvedValue([
      { title: "AI breakthrough", source: "reddit", url: "https://reddit.com/r/ai", upvotes: 1200, comments: 340, engagementScore: 4.5 },
      { title: "New JS framework", source: "github", url: "https://github.com/test", upvotes: 800, comments: 50, engagementScore: 2.3 },
    ]);
    const w = mount(TrendingPanel);
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(w.text()).toContain("AI breakthrough");
    expect(w.text()).toContain("New JS framework");
    expect(w.text()).toContain("reddit");
    expect(w.text()).toContain("github");
    expect(w.text()).toContain("1200");
    expect(w.text()).toContain("800");
  });

  it("filters by source tab", async () => {
    window.intelligenceFetchTrending.mockResolvedValue([
      { title: "Reddit post", source: "reddit", url: "https://reddit.com/r/test", upvotes: 100, comments: 10, engagementScore: 1.0 },
      { title: "HN post", source: "hackernews", url: "https://news.ycombinator.com/item?id=1", upvotes: 200, comments: 20, engagementScore: 2.0 },
    ]);
    const w = mount(TrendingPanel);
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(w.text()).toContain("Reddit post");
    expect(w.text()).toContain("HN post");
    // Click HN filter tab
    const hnBtn = w.findAll("button").filter(b => b.text().includes("HN"));
    await hnBtn[0].trigger("click");
    await nextTick();
    expect(w.text()).toContain("HN post");
    expect(w.text()).not.toContain("Reddit post");
  });
});