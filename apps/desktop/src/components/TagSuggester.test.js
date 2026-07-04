import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

// Mock Pinia platform store
vi.mock("@/stores/platforms", () => ({
  usePlatformStore: () => ({
    load: vi.fn(),
    getLabel: (key) => {
      const labels = { zhihu: "知乎", weibo: "微博", bilibili: "B站" };
      return labels[key] || key;
    }
  })
}));

// Mock Element Plus message
vi.mock("element-plus", () => ({
  ElMessage: { success: vi.fn() }
}));

import TagSuggester from "./TagSuggester.vue";

describe("TagSuggester", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {
      intelligenceSuggestTags: vi.fn()
    };
    if (!navigator.clipboard) {
      navigator.clipboard = { writeText: vi.fn() };
    }
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
    const w = mount(TagSuggester, { props: { content: "" } });
    await nextTick();
    await w.setProps({ content: "这是一篇测试文章内容" });
    // Wait for debounce timer (800ms)
    await new Promise(r => setTimeout(r, 900));
    await nextTick();
    expect(w.text()).toContain("分析内容中");
  });

  it("shows suggestions when API succeeds", async () => {
    window.electronAPI.intelligenceSuggestTags.mockResolvedValue({
      keywords: ["#测试", "文章"],
      relatedTerms: ["技术", "编程"],
      byPlatform: { zhihu: ["#知乎", "科技"], weibo: ["#微博", "热门"] }
    });
    const w = mount(TagSuggester, { props: { content: "" } });
    await nextTick();
    await w.setProps({ content: "这是一篇测试文章内容" });
    await new Promise(r => setTimeout(r, 900));
    await nextTick();
    expect(w.text()).toContain("提取关键词");
    expect(w.text()).toContain("#测试");
    expect(w.text()).toContain("文章");
    expect(w.text()).toContain("相关话题");
    expect(w.text()).toContain("技术");
    expect(w.text()).toContain("各平台标签");
    expect(w.text()).toContain("知乎");
    expect(w.text()).toContain("微博");
  });

  it("shows error when API fails", async () => {
    window.electronAPI.intelligenceSuggestTags.mockRejectedValue(new Error("API请求失败"));
    const w = mount(TagSuggester, { props: { content: "" } });
    await nextTick();
    await w.setProps({ content: "这是一篇测试文章内容" });
    await new Promise(r => setTimeout(r, 900));
    await nextTick();
    expect(w.text()).toContain("标签分析失败");
  });

  it("handles null API response gracefully", async () => {
    window.electronAPI.intelligenceSuggestTags.mockResolvedValue(null);
    const w = mount(TagSuggester, { props: { content: "" } });
    await nextTick();
    await w.setProps({ content: "这是一篇测试文章内容" });
    await new Promise(r => setTimeout(r, 900));
    await nextTick();
    expect(w.text()).toContain("提取关键词");
  });

  it("emits close on close button click", async () => {
    const w = mount(TagSuggester, { props: { content: "测试内容" } });
    await nextTick();
    await w.find(".cohere-btn-ghost").trigger("click");
    expect(w.emitted("close")).toBeTruthy();
  });
});