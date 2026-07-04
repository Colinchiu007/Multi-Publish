import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/stores/platforms", () => ({
  usePlatformStore: () => ({
    load: vi.fn(),
    getLabel: (key) => {
      const labels = { zhihu: "知乎", weibo: "微博", bilibili: "B站" };
      return labels[key] || key;
    }
  })
}));

vi.mock("element-plus", () => ({
  ElMessage: { success: vi.fn() }
}));

import TagSuggester from "./TagSuggester.vue";

function successResponse() {
  return {
    keywords: ["#测试", "文章"],
    relatedTerms: ["技术", "编程"],
    byPlatform: { zhihu: ["#知乎", "科技"], weibo: ["#微博", "热门"] }
  };
}

function createWrapper() {
  return mount(TagSuggester, {
    props: { content: "" },
    attachTo: document.body
  });
}

async function triggerAnalyzeTimed(w, content) {
  await w.setProps({ content });
  vi.advanceTimersByTime(900);
  await nextTick();
}

describe("TagSuggester", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setActivePinia(createPinia());
    window.electronAPI = {
      intelligenceSuggestTags: vi.fn().mockResolvedValue(successResponse())
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows empty state for short content", async () => {
    const w = mount(TagSuggester, { props: { content: "ab" } });
    await nextTick();
    expect(w.text()).toContain("输入内容后自动分析标签");
  });

  it("shows empty state for empty content", async () => {
    const w = mount(TagSuggester, { props: { content: "" } });
    await nextTick();
    expect(w.text()).toContain("输入内容后自动分析标签");
  });

  it("shows loading when analyzing", async () => {
    window.electronAPI.intelligenceSuggestTags.mockImplementation(() => new Promise(() => {}));
    const w = createWrapper();
    await nextTick();
    await w.setProps({ content: "这是一篇测试文章内容" });
    vi.advanceTimersByTime(900);
    await nextTick();
    expect(w.text()).toContain("分析内容中..");
  });

  it("shows suggestions when API succeeds", async () => {
    const w = createWrapper();
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");
    expect(w.text()).toContain("提取关键词");
    expect(w.text()).toContain("#测试");
    expect(w.text()).toContain("相关话题");
    expect(w.text()).toContain("各平台标签");
    expect(w.text()).toContain("知乎");
  });

  it("shows error when API fails", async () => {
    window.electronAPI.intelligenceSuggestTags.mockRejectedValue(new Error("API error"));
    const w = createWrapper();
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");
    expect(w.text()).toContain("标签分析失败");
  });

  it("handles null API response gracefully", async () => {
    window.electronAPI.intelligenceSuggestTags.mockResolvedValue(null);
    const w = createWrapper();
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");
    expect(w.text()).toContain("提取关键词");
  });

  it("emits close on close button click", async () => {
    const w = mount(TagSuggester, { props: { content: "测试内容" } });
    await nextTick();
    await w.find(".cohere-btn-ghost").trigger("click");
    expect(w.emitted("close")).toBeTruthy();
  });

  it("copies platform tags via Clipboard API", async () => {
    const clipboardMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardMock }, writable: true, configurable: true
    });
    const w = createWrapper();
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");

    const copyBtns = w.findAll("button");
    const copyBtn = copyBtns.find(b => b.text().includes("复制标签"));
    expect(copyBtn).toBeDefined();
    await copyBtn.trigger("click");
    await nextTick();

    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
  });

  it("copies via fallback textarea when clipboard.writeText fails", async () => {
    const clipboardMock = vi.fn().mockRejectedValue(new Error("permission denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardMock }, writable: true, configurable: true
    });
    // Mock execCommand for fallback path
    document.execCommand = vi.fn().mockReturnValue(true);

    const w = createWrapper();
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");

    const copyBtns = w.findAll("button");
    const copyBtn = copyBtns.find(b => b.text().includes("复制标签"));
    expect(copyBtn).toBeDefined();
    await copyBtn.trigger("click");
    await nextTick();

    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
  });

  it("debounces rapid changes", async () => {
    window.electronAPI.intelligenceSuggestTags = vi.fn();
    const w = createWrapper();
    await nextTick();

    await w.setProps({ content: "a" });
    vi.advanceTimersByTime(100);
    await w.setProps({ content: "ab" });
    vi.advanceTimersByTime(100);
    await w.setProps({ content: "abc" });
    vi.advanceTimersByTime(100);
    await w.setProps({ content: "abcd" });
    vi.advanceTimersByTime(100);

    expect(window.electronAPI.intelligenceSuggestTags).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    await nextTick();
    expect(window.electronAPI.intelligenceSuggestTags).toHaveBeenCalledTimes(1);
  });

  it("resets state when content is cleared", async () => {
    const w = createWrapper();
    await nextTick();
    await triggerAnalyzeTimed(w, "这是测试内容");
    expect(w.text()).toContain("提取关键词");
    await w.setProps({ content: "" });
    await nextTick();
    expect(w.text()).toContain("输入内容后自动分析标签");
  });
});
