import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

// 组件通过 import("@/api/publisher") 的 pipelineList 加载管线
vi.mock("@/api/publisher", () => ({
  pipelineList: vi.fn(),
}));

import PipelineBrowser from "../components/PipelineBrowser.vue";
import { pipelineList } from "@/api/publisher";

describe("PipelineBrowser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders title", () => {
    const wrapper = mount(PipelineBrowser);
    expect(wrapper.text()).toContain("视频创作管线");
  });

  it("shows loading state initially", () => {
    const wrapper = mount(PipelineBrowser);
    expect(wrapper.find(".loading-state").exists()).toBe(true);
  });

  it("shows error state when IPC fails", async () => {
    pipelineList.mockResolvedValue({ success: false, error: "Backend offline" });
    const wrapper = mount(PipelineBrowser);
    await new Promise((r) => setTimeout(r, 50));
    expect(wrapper.text()).toContain("Backend offline");
  });

  it("renders pipelines when loaded", async () => {
    const mockPipelines = [
      { name: "animated-explainer", description: "AI 解释视频", category: "generated", stability: "production", version: "2.0" },
      { name: "talking-head", description: "单人讲话视频", category: "generated", stability: "beta", version: "1.0" },
    ];
    pipelineList.mockResolvedValue({ success: true, data: mockPipelines });
    const wrapper = mount(PipelineBrowser);
    await new Promise((r) => setTimeout(r, 50));
    expect(wrapper.findAll(".pipeline-card").length).toBe(2);
    expect(wrapper.text()).toContain("Animated Explainer");
    expect(wrapper.text()).toContain("Talking Head");
  });

  it("emits select event when card is clicked", async () => {
    const mockPipeline = { name: "cinematic", description: "电影感视频", category: "generated" };
    pipelineList.mockResolvedValue({ success: true, data: [mockPipeline] });
    const wrapper = mount(PipelineBrowser);
    await new Promise((r) => setTimeout(r, 50));
    await wrapper.find(".pipeline-card").trigger("click");
    expect(wrapper.emitted("select")?.[0]?.[0]).toEqual(mockPipeline);
  });
});
