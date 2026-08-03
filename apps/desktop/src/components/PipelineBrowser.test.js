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
});
