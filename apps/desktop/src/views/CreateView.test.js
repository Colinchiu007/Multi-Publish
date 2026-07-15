import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/api/publisher", () => ({
  renderStart: vi.fn(),
  renderCancel: vi.fn(),
  renderGetStatus: vi.fn().mockResolvedValue({ code: 0, data: { ready: true } }),
  renderInstallDeps: vi.fn().mockResolvedValue({ code: 0, data: { success: true } }),
  onRenderProgress: vi.fn().mockReturnValue(vi.fn()),
  onRenderComplete: vi.fn().mockReturnValue(vi.fn()),
  onRenderError: vi.fn().mockReturnValue(vi.fn()),
  onRenderInstallProgress: vi.fn().mockReturnValue(vi.fn()),
  aiGenerate: vi.fn().mockResolvedValue({ code: 0, data: { text: "AI生成文案内容" } }),
  pipelineList: vi.fn().mockResolvedValue({ code: 0, data: [] }),
  pipelineStart: vi.fn(),
  pipelinePause: vi.fn(),
  pipelineResume: vi.fn(),
  pipelineCancel: vi.fn(),
  pipelineStatus: vi.fn(),
  pipelineAdvance: vi.fn(),
  pipelineHistory: vi.fn().mockResolvedValue({ code: 0, data: [] }),
  pipelineStartOrchestrated: vi.fn(),
  pipelineAdvanceToNextCheckpoint: vi.fn(),
  pipelineGetRunContext: vi.fn(),
}));

import UiButton from "@/components/UiButton.vue";
import UiSelect from "@/components/UiSelect.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: "/create/result", name: "result", component: { template: "<div>result</div>" } }]
});

import CreateView from "./CreateView.vue";

describe("CreateView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {};
  });

  it("renders page header", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    expect(w.text()).toContain("视频创作");
  });

  it("shows three view tabs", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    const tabs = w.findAll(".view-tab");
    expect(tabs.length).toBe(3);
  });

  it("switches to quick view shows mode tabs", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.view = "quick";
    await nextTick();
    const tabs = w.findAll(".mode-tab");
    expect(tabs.length).toBe(2);
  });

  it("switches quick mode to gallery shows upload", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.view = "quick";
    await nextTick();
    const tabs = w.findAll(".mode-tab");
    await tabs[1].trigger("click");
    await nextTick();
    expect(w.text()).toContain("上传图片");
  });

  it("canQuickRender is false with empty quickText", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.view = "quick";
    await nextTick();
    expect(w.vm.canQuickRender).toBe(false);
  });

  it("canQuickRender is true with non-empty quickText", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.view = "quick";
    w.vm.quickText = "hello world";
    await nextTick();
    expect(w.vm.canQuickRender).toBe(true);
  });

  it("canQuickRender is false when quickRendering", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.view = "quick";
    w.vm.quickText = "test";
    w.vm.quickRendering = true;
    expect(w.vm.canQuickRender).toBe(false);
  });

  it("canQuickRender is false when gallery mode with no images", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.view = "quick";
    w.vm.quickMode = "gallery";
    expect(w.vm.canQuickRender).toBe(false);
  });

  it("canQuickRender is true when gallery has images", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.view = "quick";
    w.vm.quickMode = "gallery";
    w.vm.quickImages = [{ path: "/img.png", preview: "blob:1" }];
    expect(w.vm.canQuickRender).toBe(true);
  });

  it("gets renderStatus on mount", async () => {
    const mocks = await import("@/api/publisher");
    mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await new Promise(r => setTimeout(r, 0));
    expect(mocks.renderGetStatus).toHaveBeenCalled();
  });

  it("loads pipelines on mount", async () => {
    const mocks = await import("@/api/publisher");
    mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    expect(mocks.pipelineList).toHaveBeenCalled();
  });
});

describe("CreateView - quick render", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {};
  });

  it("startQuickRender calls renderStart with text cuts", async () => {
    const mocks = await import("@/api/publisher");
    mocks.renderStart.mockResolvedValue({ code: 0, data: { outputPath: "/tmp/test.mp4" } });
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.view = "quick";
    w.vm.quickText = "scene1\nscene2\nscene3";
    await w.vm.startQuickRender();
    await nextTick();
    expect(mocks.renderStart).toHaveBeenCalled();
    const arg = mocks.renderStart.mock.calls[0][0];
    expect(arg.props.cuts.length).toBe(3);
    expect(arg.props.cuts[0].text).toBe("scene1");
  });

  it("startQuickRender sets quickError on failure", async () => {
    const mocks = await import("@/api/publisher");
    mocks.renderStart.mockResolvedValue({ code: 1, message: "render failed" });
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.view = "quick";
    w.vm.quickText = "test";
    await w.vm.startQuickRender();
    await nextTick();
    expect(w.vm.quickError).toBe("render failed");
    expect(w.vm.quickRendering).toBe(false);
  });

  it("cancelQuickRender calls renderCancel", async () => {
    const mocks = await import("@/api/publisher");
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.quickRendering = true;
    await w.vm.cancelQuickRender();
    expect(mocks.renderCancel).toHaveBeenCalled();
    expect(w.vm.quickRendering).toBe(false);
  });

  it("aiWrite generates content", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.view = "quick";
    await nextTick();
    w.vm.aiWrite();
    await new Promise(r => setTimeout(r, 1100));
    await nextTick();
    expect(w.vm.quickText.length).toBeGreaterThan(0);
  });

  it("viewQuickResult navigates to result page", async () => {
    const push = vi.fn();
    router.push = push;
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.quickResult = { outputPath: "/tmp/video.mp4" };
    w.vm.viewQuickResult();
    expect(push).toHaveBeenCalledWith({ path: "/create/result", query: { path: "/tmp/video.mp4" } });
  });
});

describe("CreateView - callbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {};
  });

  it("onRenderComplete sets quickResult", async () => {
    const mocks = await import("@/api/publisher");
    mocks.onRenderComplete.mockImplementation(cb => { cb({ outputPath: "/tmp/test.mp4" }); return vi.fn(); });
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await new Promise(r => setTimeout(r, 0));
    expect(w.vm.quickResult).toEqual({ outputPath: "/tmp/test.mp4" });
  });

  it("onRenderError sets quickError", async () => {
    const mocks = await import("@/api/publisher");
    mocks.onRenderError.mockImplementation(cb => { cb({ message: "render failed" }); return vi.fn(); });
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await new Promise(r => setTimeout(r, 0));
    expect(w.vm.quickError).toBe("render failed");
  });

  it("onRenderInstallProgress updates installLog", async () => {
    const mocks = await import("@/api/publisher");
    mocks.onRenderInstallProgress.mockImplementation(cb => { cb({ text: "installing..." }); return vi.fn(); });
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await new Promise(r => setTimeout(r, 0));
    expect(w.vm.installLog).toContain("installing");
  });
});

describe("CreateView - S2V orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {};
  });

  it("isOrchestratedPipeline returns true for story2video-compose", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    expect(w.vm.isOrchestratedPipeline("story2video-compose")).toBe(true);
  });

  it("isOrchestratedPipeline returns false for other pipelines", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    expect(w.vm.isOrchestratedPipeline("cinematic")).toBe(false);
    expect(w.vm.isOrchestratedPipeline("talking-head")).toBe(false);
  });

  it("has s2vConfig with required fields", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    expect(w.vm.s2vConfig).toHaveProperty("imageStyle");
    expect(w.vm.s2vConfig).toHaveProperty("aspectRatio");
    expect(w.vm.s2vConfig).toHaveProperty("voiceId");
    expect(w.vm.s2vConfig).toHaveProperty("concurrency");
  });

  it("startPipeline dispatches to orchestrated for story2video-compose", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineStartOrchestrated.mockResolvedValue({ code: 0, data: { runId: "run-123" } });
    mocks.pipelineGetRunContext.mockResolvedValue({ code: 0, data: { status: { status: "running" }, context: {} } });
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", description: "test", stages: [], category: "generated" };
    w.vm.pipelineText = "test text";
    await w.vm.startPipeline();
    expect(mocks.pipelineStartOrchestrated).toHaveBeenCalled();
    expect(mocks.pipelineStart).not.toHaveBeenCalled();
    expect(w.vm.orchestrationRunId).toBe("run-123");
  });

  it("startPipeline uses normal pipelineStart for non-orchestrated", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineStart.mockResolvedValue({ code: 0, data: {} });
    mocks.pipelineStatus.mockResolvedValue({ code: 0, data: { status: "running", stages: [] } });
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "cinematic", description: "test", stages: [], category: "cinematic" };
    w.vm.pipelineText = "test text";
    await w.vm.startPipeline();
    expect(mocks.pipelineStart).toHaveBeenCalled();
    expect(mocks.pipelineStartOrchestrated).not.toHaveBeenCalled();
  });

  it("llmConfig only has temperature (no provider/model)", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    expect(w.vm.llmConfig).toHaveProperty("temperature");
    expect(w.vm.llmConfig).not.toHaveProperty("provider");
    expect(w.vm.llmConfig).not.toHaveProperty("model");
  });
});
