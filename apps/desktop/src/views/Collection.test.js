import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

vi.mock("element-plus", () => ({
  ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue(undefined) },
}));

const pushSpy = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: pushSpy })
}));


function mountCollection(options) {
  return mount(CollectionView, {
    global: { mocks: { $t: (key) => key } },
    ...options,
  });
}

import CollectionView from "./Collection.vue";

describe("CollectionView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {};
  });

  it("renders page title and buttons", async () => {
    const w = mountCollection();
    await nextTick();
    expect(w.text()).toContain("内容采集");
    expect(w.text()).toContain("新建草稿");
  });

  it("loadDrafts reads from electronAPI on mount", async () => {
    window.electronAPI = {
      storeGetSetting: vi.fn().mockResolvedValue(JSON.stringify([
        { id: "d1", title: "Saved", content: "hello", source: "manual", created_at: "2026-07-05" }
      ]))
    };
    const w = mountCollection();
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(window.electronAPI.storeGetSetting).toHaveBeenCalledWith("drafts");
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].title).toBe("Saved");
  });

  it("loadDrafts handles missing API gracefully", async () => {
    window.electronAPI = {};
    const w = mountCollection();
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.vm.drafts).toEqual([]);
  });

  it("loadDrafts handles JSON parse failure", async () => {
    window.electronAPI = {
      storeGetSetting: vi.fn().mockResolvedValue("invalid json{{{")
    };
    const w = mountCollection();
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.vm.drafts).toEqual([]);
  });

  it("saveDrafts calls electronAPI.storeSetSetting", async () => {
    window.electronAPI = {
      storeSetSetting: vi.fn().mockResolvedValue(undefined)
    };
    const w = mountCollection();
    await nextTick();
    w.vm.drafts = [{ id: "d1", title: "Test" }];
    await w.vm.saveDrafts();
    expect(window.electronAPI.storeSetSetting).toHaveBeenCalledWith("drafts", JSON.stringify([{ id: "d1", title: "Test" }]));
  });

  it("saveDrafts handles missing API gracefully", async () => {
    window.electronAPI = {};
    const w = mountCollection();
    await nextTick();
    w.vm.drafts = [{ id: "d1" }];
    await w.vm.saveDrafts();
    expect(w.vm.drafts.length).toBe(1);
  });

  it("creates a new draft and navigates", async () => {
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mountCollection();
    await nextTick();
    w.vm.createDraft();
    await nextTick();
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].source).toBe("manual");
    expect(pushSpy).toHaveBeenCalledWith("/publish?draft=" + w.vm.drafts[0].id);
  });

  it("imports from clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: vi.fn().mockResolvedValue("Title line\nContent here") },
      writable: true, configurable: true
    });
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mountCollection();
    await nextTick();
    await w.vm.importFromClipboard();
    await nextTick();
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].title).toBe("Title line");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
  });

  it("handles clipboard read failure", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: vi.fn().mockRejectedValue(new Error("denied")) },
      writable: true, configurable: true
    });
    const w = mountCollection();
    await nextTick();
    await w.vm.importFromClipboard();
    await nextTick();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalled();
  });

  it("handles empty clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: vi.fn().mockResolvedValue("") },
      writable: true, configurable: true
    });
    const w = mountCollection();
    await nextTick();
    await w.vm.importFromClipboard();
    await nextTick();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.warning).toHaveBeenCalled();
  });

  it("openCollection opens webview tab when API available", async () => {
    window.electronAPI = {
      webviewOpenTab: vi.fn().mockResolvedValue(undefined)
    };
    const w = mountCollection();
    await nextTick();
    await w.vm.openCollection("weibo");
    expect(window.electronAPI.webviewOpenTab).toHaveBeenCalledWith({ platform: "weibo" });
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
  });

  it("openCollection shows info when no webview API", async () => {
    window.electronAPI = {};
    const w = mountCollection();
    await nextTick();
    await w.vm.openCollection("zhihu");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.info).toHaveBeenCalled();
  });

  it("editDraft navigates to publish", async () => {
    const w = mountCollection();
    await nextTick();
    await w.vm.editDraft({ id: "d1" });
    expect(pushSpy).toHaveBeenCalledWith("/publish?draft=d1");
  });

  it("goPublish navigates to publish", async () => {
    const w = mountCollection();
    await nextTick();
    await w.vm.goPublish({ id: "d2" });
    expect(pushSpy).toHaveBeenCalledWith("/publish?draft=d2");
  });

  it("deleteDraft confirms and removes draft", async () => {
    const { ElMessageBox } = await import("element-plus");
    ElMessageBox.confirm.mockResolvedValue(undefined);
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mountCollection();
    await nextTick();
    w.vm.drafts = [{ id: "d1" }, { id: "d2" }];
    await w.vm.deleteDraft({ id: "d1" });
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].id).toBe("d2");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
  });

  it("deleteDraft does nothing on cancel", async () => {
    const { ElMessageBox } = await import("element-plus");
    ElMessageBox.confirm.mockRejectedValue(new Error("canceled"));
    const w = mountCollection();
    await nextTick();
    w.vm.drafts = [{ id: "d1" }];
    await w.vm.deleteDraft({ id: "d1" });
    expect(w.vm.drafts.length).toBe(1);
  });

  it("collectUrl warns if no urlCollectFetch API", async () => {
    window.electronAPI = {};
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com";
    await w.vm.collectUrl();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.warning).toHaveBeenCalled();
  });

  it("collectUrl warns if URL is empty", async () => {
    window.electronAPI = {
      urlCollectFetch: vi.fn()
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "";
    await w.vm.collectUrl();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.warning).toHaveBeenCalled();
  });

  it("collectUrl succeeds with API", async () => {
    window.electronAPI = {
      urlCollectFetch: vi.fn().mockResolvedValue({ code: 0, data: { title: "Article", description: "Desc", coverImage: "img.jpg" } })
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com/article";
    await w.vm.collectUrl();
    expect(window.electronAPI.urlCollectFetch).toHaveBeenCalledWith("https://example.com/article");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
    expect(w.vm.collectedResult).toBeTruthy();
    expect(w.vm.collectedResult.title).toBe("Article");
  });

  it("collectUrl shows error on API failure", async () => {
    window.electronAPI = {
      urlCollectFetch: vi.fn().mockResolvedValue({ code: 1, message: "collection failed" })
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com/fail";
    await w.vm.collectUrl();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalledWith("collection failed");
  });

  it("collectUrl 反爬安全验证页 → 回退 urlCollectFetch 而非误报成功", async () => {
    window.electronAPI = {
      aggregationCollect: vi.fn().mockResolvedValue({
        title: "百度安全验证",
        content: "网络不给力，请稍后重试",
        word_count: 0,
      }),
      urlCollectFetch: vi.fn().mockResolvedValue({
        code: 0,
        data: { title: "真实文章标题", content: "真实正文内容" },
      }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://baijiahao.baidu.com/s?id=123";
    await w.vm.collectUrl();
    // 不应把「百度安全验证」当成功结果，而应回退到 Node 端 stealth 采集
    expect(window.electronAPI.urlCollectFetch).toHaveBeenCalledWith("https://baijiahao.baidu.com/s?id=123");
    expect(w.vm.collectedResult).toBeTruthy();
    expect(w.vm.collectedResult.title).toBe("真实文章标题");
  });

  it("collectUrl catches exception", async () => {
    window.electronAPI = {
      urlCollectFetch: vi.fn().mockRejectedValue(new Error("network error"))
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com/error";
    await w.vm.collectUrl();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalled();
  });

  it("creates draft from collected result", async () => {
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mountCollection();
    await nextTick();
    w.vm.collectedResult = { title: "Article", content: "Content", coverImage: "img.jpg", source: "url" };
    w.vm.linkUrl = "https://example.com/article";
    await w.vm.createFromCollected();
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].title).toBe("Article");
    expect(w.vm.drafts[0].content).toBe("Content");
    expect(w.vm.drafts[0].coverImage).toBe("img.jpg");
    expect(w.vm.collectedResult).toBeNull();
    expect(w.vm.linkUrl).toBe("");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalled();
  });

  it("createFromCollected does nothing if no collected result", async () => {
    const w = mountCollection();
    await nextTick();
    w.vm.collectedResult = null;
    w.vm.drafts = [];
    await w.vm.createFromCollected();
    expect(w.vm.drafts.length).toBe(0);
  });

  it("shows empty state when no drafts", async () => {
    const w = mountCollection();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.text()).toContain("暂无草稿");
  });

  it("shows drafts list", async () => {
    const w = mountCollection();
    await nextTick();
    w.vm.drafts = [{ id: "d1", title: "Saved Draft", content: "hello", source: "manual", created_at: "2026-07-05" }];
    await nextTick();
    expect(w.text()).toContain("Saved Draft");
  });

  it("collectedItems accumulates after collectUrl", async () => {
    window.electronAPI = {
      urlCollectFetch: vi.fn().mockResolvedValue({ code: 0, data: { title: "A1", content: "c1" } }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com/1";
    await w.vm.collectUrl();
    expect(w.vm.collectedItems.length).toBe(1);
    expect(w.vm.collectedItems[0].title).toBe("A1");
    w.vm.linkUrl = "https://example.com/2";
    await w.vm.collectUrl();
    expect(w.vm.collectedItems.length).toBe(2);
    expect(w.vm.collectedItems[0].title).toBe("A1"); // newest first
    expect(w.vm.collectedItems[0].id).toBeDefined();
  });

  it("createFromItem creates draft from list item", async () => {
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mountCollection();
    await nextTick();
    w.vm.drafts = [];
    const item = { id: "abc", title: "From List", content: "list content", source: "rss", sourceUrl: "https://ex.com" };
    await w.vm.createFromItem(item);
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].title).toBe("From List");
    expect(w.vm.drafts[0].source).toBe("rss");
    expect(pushSpy).toHaveBeenCalled();
  });

  it("sendItemToPipeline navigates to create", async () => {
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mountCollection();
    await nextTick();
    const item = { id: "abc", title: "Pipeline Item", content: "content", source: "url" };
    await w.vm.sendItemToPipeline(item);
    expect(w.vm.drafts.length).toBe(1);
    expect(pushSpy).toHaveBeenCalledWith(expect.stringContaining("/create?draft="));
  });

  it("goPublishFromItem navigates to publish", async () => {
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mountCollection();
    await nextTick();
    const item = { id: "abc", title: "Publish Item", content: "content", source: "url" };
    await w.vm.goPublishFromItem(item);
    expect(w.vm.drafts.length).toBe(1);
    expect(pushSpy).toHaveBeenCalledWith(expect.stringContaining("/publish?draft="));
  });

  it("collectedItems list renders in template", async () => {
    const w = mountCollection();
    await nextTick();
    w.vm.collectedItems = [
      { id: "i1", title: "Item 1", content: "c1", source: "url", wordCount: 100 },
      { id: "i2", title: "Item 2", content: "c2", source: "rss", wordCount: 200 },
    ];
    await nextTick();
    expect(w.text()).toContain("采集结果（2 篇）");
    expect(w.text()).toContain("Item 1");
    expect(w.text()).toContain("Item 2");
    expect(w.text()).toContain("视频创作");
    expect(w.text()).toContain("发布");
  });

  it("clear button removes collectedItems", async () => {
    const w = mountCollection();
    await nextTick();
    w.vm.collectedItems = [{ id: "i1", title: "Item", content: "c", source: "url" }];
    w.vm.collectedResult = { id: "i1", title: "Item" };
    await nextTick();
    expect(w.vm.collectedItems.length).toBe(1);
    // Click clear button
    const btn = w.find(".cohere-section-title button");
    await btn.trigger("click");
    expect(w.vm.collectedItems.length).toBe(0);
    expect(w.vm.collectedResult).toBeNull();
  });

  it("renders one-click rewrite button", async () => {
    const w = mountCollection();
    await nextTick();
    expect(w.text()).toContain("oneClickRewrite");
  });

  it("collectAndRewrite warns if URL is empty", async () => {
    window.electronAPI = {
      aggregationCollect: vi.fn(),
      aggregationRewrite: vi.fn(),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "";
    await w.vm.collectAndRewrite();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.warning).toHaveBeenCalled();
    expect(window.electronAPI.aggregationCollect).not.toHaveBeenCalled();
  });

  it("collectAndRewrite warns if aggregation API unavailable", async () => {
    window.electronAPI = {};
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com/article";
    await w.vm.collectAndRewrite();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.warning).toHaveBeenCalled();
  });

  it("collectAndRewrite collects and rewrites in one action", async () => {
    window.electronAPI = {
      aggregationCollect: vi.fn().mockResolvedValue({
        title: "原始文章标题",
        content: "这是采集到的原文内容，长度超过二十个字，用于测试一键改写流程。",
        word_count: 30,
      }),
      aggregationRewrite: vi.fn().mockResolvedValue({
        result_content: "这是改写后的内容，与原文不同。",
        word_count: 15,
      }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com/article";
    await w.vm.collectAndRewrite();
    expect(window.electronAPI.aggregationCollect).toHaveBeenCalledWith({
      url: "https://example.com/article",
      source_type: "url",
      rewrite: false,
    });
    expect(window.electronAPI.aggregationRewrite).toHaveBeenCalledWith({
      content: "这是采集到的原文内容，长度超过二十个字，用于测试一键改写流程。",
      style: "轻松易懂",
      length: "keep",
    });
    expect(w.vm.collectedResult).toBeTruthy();
    expect(w.vm.collectedResult.content).toContain("这是采集到的原文内容");
    expect(w.vm.rewriteResult).toBe("这是改写后的内容，与原文不同。");
    expect(w.vm.collectedItems.length).toBe(1);
    expect(w.vm.oneClickRewriting).toBe(false);
    expect(w.vm.collecting).toBe(false);
  });

  it("collectAndRewrite keeps original content when rewrite fails", async () => {
    window.electronAPI = {
      aggregationCollect: vi.fn().mockResolvedValue({
        title: "原始文章标题",
        content: "这是采集到的原文内容，长度超过二十个字，用于测试一键改写流程。",
        word_count: 30,
      }),
      aggregationRewrite: vi.fn().mockResolvedValue({ code: -99, message: "改写服务不可用" }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com/article";
    await w.vm.collectAndRewrite();
    expect(w.vm.collectedResult).toBeTruthy();
    expect(w.vm.collectedResult.content).toContain("这是采集到的原文内容");
    expect(w.vm.rewriteResult).toBe("");
    expect(w.vm.rewriteError).toBeTruthy();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
    expect(ElMessage.error).toHaveBeenCalled();
  });

  it("collectAndRewrite falls back to urlCollectFetch", async () => {
    window.electronAPI = {
      aggregationCollect: vi.fn().mockResolvedValue({ code: -4, message: "CONTENT_UNEXTRACTABLE" }),
      aggregationRewrite: vi.fn().mockResolvedValue({
        result_content: "回退采集后改写成功。",
      }),
      urlCollectFetch: vi.fn().mockResolvedValue({
        code: 0,
        data: { title: "回退标题", content: "回退采集到的正文内容，长度超过二十个字。", coverImage: "" },
      }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com/article";
    await w.vm.collectAndRewrite();
    expect(window.electronAPI.urlCollectFetch).toHaveBeenCalledWith("https://example.com/article");
    expect(w.vm.collectedResult.title).toBe("回退标题");
    expect(w.vm.rewriteResult).toBe("回退采集后改写成功。");
  });

  it("rewriteCollected no longer overwrites original content", async () => {
    window.electronAPI = {
      aggregationRewrite: vi.fn().mockResolvedValue({
        result_content: "改写后的内容。",
      }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.collectedResult = { title: "T", content: "原始正文内容，长度超过二十个字用于测试。", description: "" };
    await w.vm.rewriteCollected();
    expect(w.vm.collectedResult.content).toBe("原始正文内容，长度超过二十个字用于测试。");
    expect(w.vm.rewriteResult).toBe("改写后的内容。");
  });

  it("clearResult resets collectedResult and rewriteResult", async () => {
    const w = mountCollection();
    await nextTick();
    w.vm.collectedResult = { id: "i1", title: "T", content: "C" };
    w.vm.rewriteResult = "R";
    w.vm.rewriteError = { code: -99, message: "e" };
    w.vm.collectError = { code: -99, message: "e" };
    w.vm.clearResult();
    expect(w.vm.collectedResult).toBeNull();
    expect(w.vm.rewriteResult).toBe("");
    expect(w.vm.rewriteError).toBeNull();
    expect(w.vm.collectError).toBeNull();
  });
});
