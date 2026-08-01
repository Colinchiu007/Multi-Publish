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
  story2videoImportMedia: vi.fn(),
  story2videoTranscribe: vi.fn(),
  story2videoListProjects: vi.fn().mockResolvedValue({ code: 0, data: [] }),
  story2videoDeleteProject: vi.fn(),
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
    window.localStorage.clear();
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

  it("pipelineList 返回异常格式时展示默认加载错误", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineList.mockResolvedValueOnce({});
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await new Promise(r => setTimeout(r, 0));

    expect(w.vm.pipelineError).toBe("加载失败");
    expect(w.vm.pipelineLoading).toBe(false);
  });

  it("pipelineList 拒绝时保留错误并结束加载态", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineList.mockRejectedValueOnce(new Error("IPC 不可用"));
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await new Promise(r => setTimeout(r, 0));

    expect(w.vm.pipelineError).toBe("IPC 不可用");
    expect(w.vm.pipelineLoading).toBe(false);
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

  it("renderStart 拒绝时展示异常并复位渲染状态", async () => {
    const mocks = await import("@/api/publisher");
    mocks.renderStart.mockRejectedValueOnce(new Error("渲染 IPC 缺失"));
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.quickText = "测试文案";

    await expect(w.vm.startQuickRender()).resolves.toBeUndefined();

    expect(w.vm.quickError).toBe("渲染异常: 渲染 IPC 缺失");
    expect(w.vm.quickRendering).toBe(false);
    expect(w.vm.quickResult).toBeNull();
  });

  it("renderStart 返回异常格式时展示默认错误并复位", async () => {
    const mocks = await import("@/api/publisher");
    mocks.renderStart.mockResolvedValueOnce({});
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.quickText = "测试文案";

    await w.vm.startQuickRender();

    expect(w.vm.quickError).toBe("渲染失败");
    expect(w.vm.quickRendering).toBe(false);
  });

  it("图库渲染只提交图片预览并按五秒生成镜头", async () => {
    const mocks = await import("@/api/publisher");
    mocks.renderStart.mockResolvedValueOnce({ code: 0, data: { taskId: "r1" } });
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.quickMode = "gallery";
    w.vm.quickImages = [
      { name: "a.png", preview: "data:image/png;base64,a" },
      { name: "b.png", preview: "data:image/png;base64,b" },
    ];

    await w.vm.startQuickRender();

    const cuts = mocks.renderStart.mock.calls.at(-1)[0].props.cuts;
    expect(cuts).toEqual([
      { id: "scene-0", type: "anime_scene", images: ["data:image/png;base64,a"], animation: "ken-burns", in_seconds: 0, out_seconds: 4.5 },
      { id: "scene-1", type: "anime_scene", images: ["data:image/png;base64,b"], animation: "ken-burns", in_seconds: 5, out_seconds: 9.5 },
    ]);
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
    expect(w.vm.s2vConfig).toHaveProperty("imageProvider");
    expect(w.vm.s2vConfig).toHaveProperty("aspectRatio");
    expect(w.vm.s2vConfig).toHaveProperty("voiceId");
    expect(w.vm.s2vConfig).toHaveProperty("voiceProvider");
    expect(w.vm.s2vConfig).toHaveProperty("voiceSpeed");
    expect(w.vm.s2vConfig).toHaveProperty("voicePitch");
    expect(w.vm.s2vConfig).toHaveProperty("voiceEmotion");
    expect(w.vm.s2vConfig).toHaveProperty("voiceVolume");
    expect(w.vm.s2vConfig).toHaveProperty("concurrency");
  });

  it("uses the registered DALL-E provider ID and keeps ComfyUI out of the Story2Video selector", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    await nextTick();

    const optionValues = w.findAll("option").map(option => option.attributes("value"));
    expect(optionValues).toContain("dall-e");
    expect(optionValues).not.toContain("openai-image");
    expect(optionValues).not.toContain("comfyui");
    w.unmount();
  });

  it("Story2Video 隐藏通用视觉、LLM、温度和预算配置，但保留检查点策略", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    await nextTick();

    expect(w.text()).not.toContain("视觉风格");
    expect(w.text()).not.toContain("LLM 模型");
    expect(w.text()).not.toContain("温度:");
    expect(w.text()).not.toContain("预算模式");
    expect(w.text()).not.toContain("预算上限");
    expect(w.text()).toContain("检查点策略");
    w.unmount();
  });

  it("Story2Video 图片生成器列出已启用的图片服务商", async () => {
    const listImageProviders = vi.fn().mockResolvedValue({
      code: 0,
      data: [
        { id: "minimax-image", name: "MiniMax Image", category: "image", enabled: true },
        { id: "disabled-image", name: "Disabled Image", category: "image", enabled: false },
      ],
    });
    window.electronAPI = { modelProviderList: listImageProviders };
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    await new Promise(resolve => setTimeout(resolve, 0));
    await nextTick();

    const imageProviderItem = w.findAll(".config-item").find(item => item.find("label").text() === "图片生成器");
    expect(listImageProviders).toHaveBeenCalledWith("image");
    expect(imageProviderItem.find('option[value="minimax-image"]').text()).toContain("MiniMax Image");
    expect(imageProviderItem.find('option[value="disabled-image"]').exists()).toBe(false);
    w.unmount();
  });

  it.each([
    [{ code: 1, message: "轮询 IPC 失败" }, "轮询 IPC 失败"],
    [{ code: 0, data: null }, "编排状态未返回"],
  ])("编排轮询遇到无效响应时向用户显示错误并停止轮询", async (response, expectedMessage) => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineGetRunContext.mockResolvedValueOnce(response);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.orchestrationRunId = "run-poll-error";
    w.vm.pollTimer = 1;

    await w.vm.updateOrchestrationStatus();

    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining(expectedMessage));
    expect(w.vm.pipelineRunStatus).toMatchObject({ status: "failed" });
    expect(w.vm.pollTimer).toBeNull();
    alertSpy.mockRestore();
    w.unmount();
  });

  it("编排轮询终态失败时显示状态中的具体错误并停止轮询", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineGetRunContext.mockResolvedValueOnce({
      code: 0,
      data: {
        context: {},
        status: { status: "failed", error: "图片生成服务拒绝请求" },
      },
    });
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.orchestrationRunId = "run-terminal-error";
    w.vm.pollTimer = 1;

    await w.vm.updateOrchestrationStatus();

    expect(alertSpy).toHaveBeenCalledWith("图片生成服务拒绝请求");
    expect(w.vm.pipelineRunStatus).toMatchObject({ status: "failed" });
    expect(w.vm.pollTimer).toBeNull();
    alertSpy.mockRestore();
    w.unmount();
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
    w.unmount();
  });

  it("流水线卡片优先显示后端 stageCount", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.pipelineLoading = false;
    w.vm.pipelines = [{
      name: "story2video-compose",
      description: "test",
      category: "generated",
      stageCount: 6,
      estimatedCost: "high",
    }];
    await nextTick();
    expect(w.find(".stage-count").text()).toBe("6 阶段");
    w.unmount();
  });

  it("S2V 编排发送版本化 text 配置并使用独立输出参数", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineStartOrchestrated.mockResolvedValue({ code: 0, data: { runId: "run-contract" } });
    mocks.pipelineGetRunContext.mockResolvedValue({ code: 0, data: { status: { status: "paused" }, context: {} } });
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    w.vm.pipelineText = "唐朝长安的夜景";
    w.vm.selectedStyle = "cinematic-dark";
    w.vm.checkpointPolicy = "manual_all";
    w.vm.outputConfig = { resolution: "3840x2160", fps: 60, format: "mp4" };
    w.vm.s2vOutputConfig = { resolution: "1080x1920", fps: 24, format: "webm" };
    w.vm.s2vConfig = {
      ...w.vm.s2vConfig,
      contentType: "history",
      imageStyle: "watercolor",
      imageProvider: "local-diffusion",
      imageEffect: "pan-left",
      voiceProvider: "piper",
      voiceId: "custom-voice-id",
      voiceSpeed: 1.2,
      voicePitch: -1,
      voiceEmotion: "warm",
      voiceVolume: 0.8,
      transition: "slide-right",
      subtitleEnabled: false,
      subtitleFont: "Noto Sans SC",
      subtitleSize: "size4",
      subtitleStyleName: "style2",
      bgmPath: "C:/media/bgm.mp3",
      bgmVolume: 7,
      seconds: 12,
      perImageDuration: 4,
      generateBase: false,
      generateMerged: true,
      splitLanguage: "auto",
      splitMode: "precise",
      splitMaxSentenceLength: 120,
      splitTargetSeconds: 4,
      promptPlatform: "douyin",
      promptStyle: "anime",
      creativeLevel: 8,
      numCandidates: 2,
      autoDetectStyle: false,
      watermarkText: "测试水印",
      platforms: ["bilibili"],
      publishEnabled: true,
      title: "长安夜景",
      tagsText: "历史,夜景",
      autoAdvance: true,
    };

    await w.vm.startPipeline();

    expect(mocks.pipelineStartOrchestrated).toHaveBeenCalledWith("story2video-compose", expect.objectContaining({
      text: "唐朝长安的夜景",
      inputMode: "text",
      checkpointPolicy: "manual_all",
      autoAdvance: true,
      story2videoTextConfig: expect.objectContaining({
        version: 1,
        mode: "text",
        prompt: "唐朝长安的夜景",
        size: "1080x1920",
        seconds: 12,
        contentType: "history",
        split: expect.objectContaining({ language: "auto", mode: "precise", maxSentenceLength: 120, targetSeconds: 4 }),
        optimize: expect.objectContaining({ platform: "douyin", style: "anime", creativeLevel: 8, numCandidates: 2, autoDetectStyle: false }),
        image: expect.objectContaining({ provider: "local-diffusion", style: "watercolor", effect: "pan-left" }),
        voice: expect.objectContaining({ provider: "piper", id: "custom-voice-id", speed: 1.2, volume: 0.8, pitch: -1, emotion: "warm" }),
        subtitle: expect.objectContaining({ enabled: false, font: "Noto Sans SC", size: "size4", style: "style2" }),
        bgm: { enabled: true, path: "C:/media/bgm.mp3", volume: 7 },
        versions: { generateBase: false, generateMerged: true },
        perImageDuration: 4,
        transition: "slide-right",
        output: { fps: 24, format: "webm" },
        publish: expect.objectContaining({ enabled: true, platforms: ["bilibili"], title: "长安夜景", tags: ["历史", "夜景"] }),
      }),
    }));
    expect(w.vm.outputConfig).toEqual({ resolution: "3840x2160", fps: 60, format: "mp4" });
    w.unmount();
  });

  it("Story2Video 只显示文字输入并拒绝旧图片模式", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineStartOrchestrated.mockResolvedValue({ code: 0, data: { runId: "run-images" } });
    mocks.pipelineGetRunContext.mockResolvedValue({ code: 0, data: { status: { status: "running" }, context: {} } });
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    w.vm.inputMode = "images";
    w.vm.pipelineImages = [{ preview: "data:image/png;base64,aW1hZ2U=" }];
    await nextTick();

    await w.vm.startPipeline();

    const inputTabs = w.findAll(".input-tab").map(tab => tab.text());
    expect(inputTabs).toContain("文案");
    expect(inputTabs).not.toContain("图片");
    expect(inputTabs).not.toContain("旁白/批量音频");
    expect(mocks.pipelineStartOrchestrated).not.toHaveBeenCalled();
    w.unmount();
  });

  it("普通流水线仍保留图片、音频和视频输入", async () => {
    const mocks = await import("@/api/publisher");
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "cinematic", stages: [] };
    await nextTick();
    const inputTabs = w.findAll(".input-tab").map(tab => tab.text());
    expect(inputTabs).toEqual(expect.arrayContaining(["文案", "图片", "旁白/批量音频", "视频素材"]));
    expect(mocks.pipelineStartOrchestrated).not.toHaveBeenCalled();
    w.unmount();
  });

  it("普通流水线仍可识别上传旁白", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoTranscribe.mockResolvedValue({ code: 0, data: { text: "识别后的第一段" } });
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "podcast-repurpose", stages: [] };
    w.vm.inputMode = "audio";
    w.vm.pipelineAudio = [{ name: "voice.mp3", path: "C:/controlled/voice.mp3", transcript: "" }];

    await w.vm.transcribePipelineAudio(0);

    expect(w.vm.pipelineAudio[0].transcript).toBe("识别后的第一段");
    expect(mocks.pipelineStartOrchestrated).not.toHaveBeenCalled();
    w.unmount();
  });

  it("BGM 文件通过 preload 路径桥接解析，不回退到文件名", async () => {
    const mocks = await import("@/api/publisher");
    const importer = vi.fn().mockResolvedValue({ code: 0, data: { path: "C:/controlled/bgm.mp3" } });
    mocks.story2videoImportMedia.mockImplementation(importer);
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();

    await w.vm.handleS2VBgmFile({ target: { files: [{ name: "bgm.mp3", size: 5 }] } });

    expect(importer).toHaveBeenCalledTimes(1);
    expect(w.vm.s2vConfig.bgmPath).toBe("C:/controlled/bgm.mp3");
    w.unmount();
  });

  it("BGM 路径无法解析时清空配置并提示，不发送不可用文件名", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoImportMedia.mockResolvedValue({ code: -1 });
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();

    await w.vm.handleS2VBgmFile({ target: { files: [{ name: "bgm.mp3", size: 5 }] } });

    expect(w.vm.s2vConfig.bgmPath).toBe("");
    expect(alertSpy).toHaveBeenCalledWith("无法读取背景音乐文件路径，请重新选择文件");
    alertSpy.mockRestore();
    w.unmount();
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

  it("普通流水线精确透传文本、输入模式和输出配置", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineStart.mockResolvedValueOnce({ code: 1, message: "暂不启动" });
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "cinematic", stages: [] };
    w.vm.pipelineText = "创作内容";
    w.vm.inputMode = "text";

    await w.vm.startPipeline();

    expect(mocks.pipelineStart).toHaveBeenCalledWith("cinematic", expect.objectContaining({
      text: "创作内容",
      inputMode: "text",
      images: [],
      video: null,
      output: w.vm.outputConfig,
    }));
    expect(alertSpy).toHaveBeenCalledWith("暂不启动");
    alertSpy.mockRestore();
  });

  it("普通视频流水线传递已解析的绝对路径而不是文件名", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineStart.mockResolvedValueOnce({ code: 1, message: "暂不启动" });
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "cinematic", stages: [] };
    w.vm.inputMode = "video";
    w.vm.pipelineVideo = { name: "source.mp4", path: "C:/media/source.mp4" };

    await w.vm.startPipeline();

    expect(mocks.pipelineStart).toHaveBeenCalledWith("cinematic", expect.objectContaining({
      video: "C:/media/source.mp4",
    }));
    alertSpy.mockRestore();
    w.unmount();
  });

  it("Story2Video 视频素材模式明确拒绝启动，不静默丢弃参数", async () => {
    const mocks = await import("@/api/publisher");
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    w.vm.inputMode = "video";
    w.vm.pipelineVideo = { name: "source.mp4", path: "C:/media/source.mp4" };

    await w.vm.startPipeline();

    expect(mocks.pipelineStartOrchestrated).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/Story2Video.*只支持文案输入/));
    alertSpy.mockRestore();
    w.unmount();
  });

  it("编排完成后携带 compose 视频路径进入结果页", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineStartOrchestrated.mockResolvedValueOnce({
      code: 0,
      data: {
        success: true,
        runId: "run-completed",
        completed: true,
        context: { compose: { videoPath: "C:/media/output.mp4" } },
      },
    });
    const pushSpy = vi.spyOn(router, "push");
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    w.vm.pipelineText = "测试文案";

    await w.vm.startPipeline();

    expect(pushSpy).toHaveBeenCalledWith({
      path: "/create/result",
      query: { path: "C:/media/output.mp4" },
    });
    pushSpy.mockRestore();
    w.unmount();
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

// ── 交互测试：通过 UI 点击触发，而非 vm 直调 ──────────────────
describe("CreateView - UI interactions", () => {
  it("clicks view-tab switches view (pipelines/quick/history)", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    const tabs = w.findAll(".view-tab");
    expect(tabs.length).toBeGreaterThanOrEqual(3);
    // 点击"快速渲染"tab
    await tabs[1].trigger("click");
    await nextTick();
    expect(w.vm.view).toBe("quick");
    // 点击"历史记录"tab
    await tabs[2].trigger("click");
    await nextTick();
    expect(w.vm.view).toBe("history");
  });

  it("clicks btn-start triggers startPipeline", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineStart.mockResolvedValueOnce({ code: 1, message: "测试阻止启动" });
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { id: "p1", name: "normal-pipeline" };
    w.vm.pipelineText = "通过界面发起的内容";
    await nextTick();
    const startBtn = w.find(".btn-start");
    expect(startBtn.exists()).toBe(true);
    expect(startBtn.attributes("disabled")).toBeUndefined();

    await startBtn.trigger("click");
    await nextTick();

    expect(mocks.pipelineStart).toHaveBeenCalledWith("normal-pipeline", expect.objectContaining({
      text: "通过界面发起的内容",
      inputMode: "text",
    }));
    expect(alertSpy).toHaveBeenCalledWith("测试阻止启动");
    alertSpy.mockRestore();
  });

  it("历史记录优先展示可恢复的 Story2Video 项目并可打开", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoListProjects.mockResolvedValue({ code: 0, data: [{
      projectId: "project-history", pipeline: "story2video-compose", status: "completed",
      title: "历史成片", recoverable: true, updatedAt: "2026-07-22T00:00:00.000Z",
    }] });
    const pushSpy = vi.spyOn(router, "push");
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });

    w.vm.view = "history";
    await w.vm.loadHistory();
    await nextTick();

    expect(w.text()).toContain("历史成片");
    expect(w.find(".history-status").text()).toBe("已完成");
    expect(w.find(".history-status").classes()).toContain("completed");

    await w.find(".history-open").trigger("click");
    expect(pushSpy).toHaveBeenCalledWith({ path: "/create/result", query: { project: "project-history" } });
    pushSpy.mockRestore();
  });

  it("历史记录可按完成和失败状态筛选", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoListProjects.mockResolvedValue({ code: 0, data: [
      { projectId: "project-ok", pipeline: "story2video-compose", status: "completed", title: "已完成" },
    ] });
    mocks.pipelineHistory.mockResolvedValue({ code: 0, data: [
      { id: "run-failed", pipeline: "story2video-compose", status: "failed", title: "失败任务" },
      { id: "run-cancelled", pipeline: "story2video-compose", status: "cancelled", title: "已取消" },
    ] });
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });

    w.vm.view = "history";
    await w.vm.loadHistory();
    w.vm.historyFilter = "failed";
    await nextTick();

    expect(w.vm.filteredHistory.map(item => item.id)).toEqual(["run-failed"]);
    expect(w.findAll(".history-name").map(item => item.text())).toEqual(["失败任务"]);
  });

  it("可把当前参数保存为自定义模板、重新应用并删除", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.s2vConfig.imageEffect = "pan-up";
    w.vm.s2vConfig.transition = "slide-down";
    w.vm.s2vConfig.subtitleStyle.size = "xl";
    w.vm.s2vOutputConfig.resolution = "1080x1920";
    w.vm.s2vCustomTemplateName = "我的竖屏模板";

    w.vm.saveCurrentS2VTemplate();
    const selectedId = w.vm.s2vConfig.templateId;
    expect(selectedId).toMatch(/^custom-/);
    expect(w.vm.s2vTemplateLibrary.find(template => template.id === selectedId)).toMatchObject({
      name: "我的竖屏模板", category: "custom", imageEffect: "pan-up",
      transitionEffect: "slide-down", size: "1080x1920",
    });

    w.vm.s2vConfig.imageEffect = "none";
    w.vm.applyS2VTemplate();
    expect(w.vm.s2vConfig.imageEffect).toBe("pan-up");
    w.vm.deleteSelectedS2VTemplate();
    expect(w.vm.s2vTemplateLibrary.some(template => template.id === selectedId)).toBe(false);
  });
});
