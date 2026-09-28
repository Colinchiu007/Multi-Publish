import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

import { config as __vtuConfig } from '@vue/test-utils'
import { createI18n as __createI18n } from 'vue-i18n'
import __zhLocale from '@/locales/zh'
import __enLocale from '@/locales/en'
__vtuConfig.global.plugins = [
  ...(__vtuConfig.global.plugins || []),
  __createI18n({
    legacy: false,
    locale: 'zh',
    fallbackLocale: 'en',
    messages: { zh: __zhLocale, en: __enLocale },
  }),
]
import { nextTick } from "vue";

vi.mock("@/api/publisher", () => ({
  intelligenceSearchTitles: vi.fn()
}));

import { intelligenceSearchTitles } from "@/api/publisher";
import TitleAssistantPanel from "./TitleAssistantPanel.vue";

describe("TitleAssistantPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when not visible", () => {
    const w = mount(TitleAssistantPanel, { props: { visible: false, title: "" } });
    expect(w.find(".title-assistant").exists()).toBe(false);
  });

  it("shows waiting state when visible but no title", async () => {
    const w = mount(TitleAssistantPanel, { props: { visible: true, title: "" } });
    await nextTick();
    expect(w.text()).toContain("输入标题后自动分析");
  });

  it("shows loading state", async () => {
    intelligenceSearchTitles.mockImplementation(() => new Promise(() => {}));
    const w = mount(TitleAssistantPanel, { props: { visible: true, title: "" } });
    await nextTick();
    await w.setProps({ title: "测试标题内容" });
    await new Promise(r => setTimeout(r, 900));
    await nextTick();
    expect(w.text()).toContain("正在分析同类标题");
  });

  it("shows error state", async () => {
    intelligenceSearchTitles.mockRejectedValue(new Error("网络错误"));
    const w = mount(TitleAssistantPanel, { props: { visible: true, title: "" } });
    await nextTick();
    await w.setProps({ title: "测试标题内容" });
    await new Promise(r => setTimeout(r, 900));
    await nextTick();
    expect(w.text()).toContain("搜索失败");
  });

  it("displays title analysis results", async () => {
    intelligenceSearchTitles.mockResolvedValue({
      code: 0,
      data: {
        titleAnalysis: {
          patterns: [["AI", 4], ["技术", 3]],
          suggestion: { tip: "建议使用数字增强吸引力" }
        },
        // 注意：这里不得再出现 source:"github" 的条目 —— 「标题参考」的源域已收窄到
        // reddit/hackernews（GitHub issue 标题不是同类标题）。原版把 github 条目
        // 断言成正确渲染，等于把事故形态钉成了契约。
        results: [
          { id: 1, title: "2024 AI发展趋势", engagement: 3.2, source: "reddit" },
          { id: 2, title: "深度学习入门指南", engagement: 1.5, source: "hackernews" }
        ]
      }
    });
    const w = mount(TitleAssistantPanel, { props: { visible: true, title: "" } });
    await nextTick();
    await w.setProps({ title: "AI技术" });
    await new Promise(r => setTimeout(r, 900));
    await nextTick();
    expect(w.text()).toContain("建议使用数字增强吸引力");
    expect(w.text()).toContain("AI");
    expect(w.text()).toContain("2024 AI发展趋势");
    expect(w.text()).toContain("深度学习入门指南");
    expect(w.text()).toContain("Reddit");
    expect(w.text()).toContain("HN");
    expect(w.text()).not.toContain("GitHub");
  });

  it("未知来源不得兜底显示成 GitHub（品牌名不是缺省值）", async () => {
    intelligenceSearchTitles.mockResolvedValue({
      code: 0,
      data: {
        titleAnalysis: { patterns: null, suggestion: null },
        results: [
          { id: 9, title: "某条来自新源的高互动标题", engagement: 2.4, source: "bilibili" },
          { id: 10, title: "某条没有来源标注的标题", engagement: 1.8 }
        ]
      }
    });
    const w = mount(TitleAssistantPanel, { props: { visible: true, title: "" } });
    await nextTick();
    await w.setProps({ title: "高互动标题" });
    await new Promise(r => setTimeout(r, 900));
    await nextTick();
    expect(w.text()).not.toContain("GitHub");
    // 未知源如实回显其标识，不臆造品牌
    expect(w.text()).toContain("bilibili");
    expect(w.text()).toContain("2.4");
  });

  it("有响应但全部被相关性门禁剔除时，如实显示空态与过滤条数", async () => {
    intelligenceSearchTitles.mockResolvedValue({
      code: 0,
      data: {
        titleAnalysis: { patterns: null, suggestion: null },
        droppedIrrelevant: 3,
        results: []
      }
    });
    const w = mount(TitleAssistantPanel, { props: { visible: true, title: "" } });
    await nextTick();
    await w.setProps({ title: "三步学会做红烧肉" });
    await new Promise(r => setTimeout(r, 900));
    await nextTick();
    expect(w.text()).toContain("暂未找到同类高互动标题");
    // 按结构类名断言"渲染的是哪一支说明"，不按 locale 文案字面量断言（文案改写不该把正确实现判红）
    expect(w.find(".ta-empty-hint--filtered").exists()).toBe(true);
    expect(w.find(".ta-empty-hint--source").exists()).toBe(false);
    // {n} 插值必须真的带上数字
    expect(w.find(".ta-empty-hint--filtered").text()).toContain("3");
    // 空态下不得残留任何列表结构
    expect(w.find(".ta-ref-item").exists()).toBe(false);
    expect(w.find(".ta-empty").exists()).toBe(true);
  });

  it("源完全无响应时显示数据源说明，而不是空白面板", async () => {
    intelligenceSearchTitles.mockResolvedValue({
      code: 0,
      data: { titleAnalysis: { patterns: null, suggestion: null }, results: [] }
    });
    const w = mount(TitleAssistantPanel, { props: { visible: true, title: "" } });
    await nextTick();
    await w.setProps({ title: "三步学会做红烧肉" });
    await new Promise(r => setTimeout(r, 900));
    await nextTick();
    expect(w.text()).toContain("暂未找到同类高互动标题");
    expect(w.find(".ta-empty-hint--source").exists()).toBe(true);
    expect(w.find(".ta-empty-hint--filtered").exists()).toBe(false);
    expect(w.find(".ta-ref-item").exists()).toBe(false);
  });

  it("emits close on close button click", async () => {
    const w = mount(TitleAssistantPanel, { props: { visible: true, title: "测试" } });
    await nextTick();
    await w.find(".cohere-btn-ghost").trigger("click");
    expect(w.emitted("close")).toBeTruthy();
  });

  it("clears data when visible becomes false", async () => {
    intelligenceSearchTitles.mockResolvedValue({
      code: 0,
      data: {
        titleAnalysis: { patterns: [], suggestion: { tip: "测试" } },
        results: [{ id: 1, title: "测试标题", engagement: 1.0, source: "reddit" }]
      }
    });
    const w = mount(TitleAssistantPanel, { props: { visible: true, title: "" } });
    await nextTick();
    await w.setProps({ title: "测试标题" });
    await new Promise(r => setTimeout(r, 900));
    await nextTick();
    expect(w.text()).toContain("测试标题");
    await w.setProps({ visible: false });
    await nextTick();
    expect(w.find(".title-assistant").exists()).toBe(false);
  });
});