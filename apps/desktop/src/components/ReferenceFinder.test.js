import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

vi.mock("../components/UiModal.vue", () => ({
  default: {
    name: "UiModal",
    template: '<div class="ui-modal-mock"><slot /></div>',
    props: ["visible", "title", "width", "closeOnClickModal", "destroyOnClose"]
  }
}));

import ReferenceFinder from "./ReferenceFinder.vue";

describe("ReferenceFinder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.intelligenceFindReferences = vi.fn();
  });

  it("shows initial empty state", async () => {
    const w = mount(ReferenceFinder, {
      props: { visible: true, searchText: "" }
    });
    await nextTick();
    expect(w.text()).toContain("输入关键词搜索权威来源");
  });

  it("shows searching state", async () => {
    window.intelligenceFindReferences.mockImplementation(() => new Promise(() => {}));
    const w = mount(ReferenceFinder, {
      props: { visible: true, searchText: "" }
    });
    await nextTick();
    const input = w.find("input");
    await input.setValue("AI技术");
    await nextTick();
    const searchBtn = w.findAll("button").filter(b => b.text().includes("搜索"));
    await searchBtn[0].trigger("click");
    await nextTick();
    expect(w.text()).toContain("搜索中");
  });

  it("shows no results state", async () => {
    window.intelligenceFindReferences.mockResolvedValue({ references: [] });
    const w = mount(ReferenceFinder, {
      props: { visible: true, searchText: "" }
    });
    await nextTick();
    const input = w.find("input");
    await input.setValue("不存在的关键词");
    await nextTick();
    const searchBtn = w.findAll("button").filter(b => b.text().includes("搜索"));
    await searchBtn[0].trigger("click");
    await nextTick();
    expect(w.text()).toContain("未找到相关来源");
  });

  it("shows results after search", async () => {
    window.intelligenceFindReferences.mockResolvedValue({
      references: [
        { title: "AI技术发展趋势", url: "https://example.com/ai", source: "知乎", engagement: "1.2k", snippet: "人工智能技术正在快速发展...", relevance: 45 },
        { title: "深度学习入门", url: "https://example.com/dl", source: "CSDN", engagement: "856", snippet: "深度学习是机器学习的一个分支...", relevance: 30 },
      ]
    });
    const w = mount(ReferenceFinder, {
      props: { visible: true, searchText: "" }
    });
    await nextTick();
    const input = w.find("input");
    await input.setValue("AI技术");
    await nextTick();
    const searchBtn = w.findAll("button").filter(b => b.text().includes("搜索"));
    await searchBtn[0].trigger("click");
    await nextTick();
    expect(w.text()).toContain("AI技术发展趋势");
    expect(w.text()).toContain("深度学习入门");
    expect(w.text()).toContain("知乎");
    expect(w.text()).toContain("CSDN");
  });

  it("auto-searches when visible flips to true with searchText", async () => {
    window.intelligenceFindReferences.mockResolvedValue({
      references: [
        { title: "机器学习", url: "https://example.com/ml", source: "知乎", engagement: "2k", snippet: "机器学习概述...", relevance: 50 }
      ]
    });
    // Mount not visible first, then flip to visible
    const w = mount(ReferenceFinder, {
      props: { visible: false, searchText: "机器学习" }
    });
    await nextTick();
    await w.setProps({ visible: true });
    await nextTick();
    expect(window.intelligenceFindReferences).toHaveBeenCalledWith("机器学习", { limit: 5 });
  });

  it("emits insert-reference on insert button click", async () => {
    window.intelligenceFindReferences.mockResolvedValue({
      references: [
        { title: "测试文章", url: "https://example.com/test", source: "知乎", engagement: "100", snippet: "测试内容", relevance: 40 }
      ]
    });
    const w = mount(ReferenceFinder, {
      props: { visible: false, searchText: "测试" }
    });
    await nextTick();
    await w.setProps({ visible: true });
    await nextTick();
    // Wait for async search to complete
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    const insertBtn = w.findAll("button").filter(b => b.text().includes("插入"));
    expect(insertBtn.length).toBeGreaterThan(0);
    await insertBtn[0].trigger("click");
    expect(w.emitted("insert-reference")).toBeTruthy();
    expect(w.emitted("insert-reference")[0][0]).toMatchObject({
      title: "测试文章",
      url: "https://example.com/test"
    });
  });
});