import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

// 组件通过 import("@/api/publisher") 的 pipelineList 加载流水线
vi.mock("@/api/publisher", () => ({
  pipelineList: vi.fn(),
}));

import PipelineBrowser from "../components/PipelineBrowser.vue";
import { pipelineList } from "@/api/publisher";
import i18n from "@/i18n";

const mountBrowser = (options = {}) => mount(PipelineBrowser, {
  global: { plugins: [i18n] },
  ...options,
});

describe("PipelineBrowser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18n.global.locale.value = "zh";
  });

  it("renders title", () => {
    const wrapper = mountBrowser();
    expect(wrapper.text()).toContain("视频创作流水线");
  });

  it("shows loading state initially", () => {
    const wrapper = mountBrowser();
    expect(wrapper.find(".loading-state").exists()).toBe(true);
  });

  it("shows error state when IPC fails", async () => {
    pipelineList.mockResolvedValue({ code: -1, message: "Backend offline" });
    const wrapper = mountBrowser();
    await new Promise((r) => setTimeout(r, 50));
    expect(wrapper.text()).toContain("Backend offline");
  });

  it("renders pipelines when loaded", async () => {
    const mockPipelines = [
      { name: "animated-explainer", description: "AI 解释视频", category: "generated", stability: "production", version: "2.0" },
      { name: "talking-head", description: "单人讲话视频", category: "generated", stability: "beta", version: "1.0" },
    ];
    pipelineList.mockResolvedValue({ code: 0, data: mockPipelines });
    const wrapper = mountBrowser();
    await new Promise((r) => setTimeout(r, 50));
    expect(wrapper.findAll(".pipeline-card").length).toBe(2);
    expect(wrapper.find('[data-pipeline-id="animated-explainer"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("AI 讲解视频");
    expect(wrapper.text()).toContain("口播视频");
    expect(wrapper.text()).not.toContain("animated-explainer");

    i18n.global.locale.value = "en";
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("AI Explainer");
    expect(wrapper.text()).toContain("Talking Head");
  });

  it("emits select event when card is clicked", async () => {
    const mockPipeline = { name: "cinematic", description: "电影感视频", category: "generated" };
    pipelineList.mockResolvedValue({ code: 0, data: [mockPipeline] });
    const wrapper = mountBrowser();
    await new Promise((r) => setTimeout(r, 50));
    await wrapper.find(".pipeline-card").trigger("click");
    expect(wrapper.emitted("select")?.[0]?.[0]).toEqual(mockPipeline);
  });

  it("shows 开发中 badge for unavailable pipelines", async () => {
    const mockPipelines = [
      { name: "animation", description: "动画视频", category: "animation", available: false },
      { name: "story2video-compose", description: "全能创作", category: "generated", available: true },
    ];
    pipelineList.mockResolvedValue({ code: 0, data: mockPipelines });
    const wrapper = mountBrowser();
    await new Promise((r) => setTimeout(r, 50));
    const cards = wrapper.findAll(".pipeline-card");
    expect(cards[0].find(".availability-badge.dev").exists()).toBe(true);
    expect(cards[0].text()).toContain("开发中");
    expect(cards[1].find(".availability-badge.ready").exists()).toBe(true);
    expect(cards[1].text()).toContain("可用");
  });

  it("marks unavailable cards with is-unavailable class", async () => {
    const mockPipelines = [
      { name: "animation", description: "动画视频", category: "animation", available: false },
    ];
    pipelineList.mockResolvedValue({ code: 0, data: mockPipelines });
    const wrapper = mountBrowser();
    await new Promise((r) => setTimeout(r, 50));
    expect(wrapper.find(".pipeline-card.is-unavailable").exists()).toBe(true);
  });
});
