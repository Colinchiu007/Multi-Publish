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
  pipelineResumeOrchestration: vi.fn(),
  pipelineAdvanceToNextCheckpoint: vi.fn(),
  pipelineGetRunContext: vi.fn(),
  storeGetSetting: vi.fn(),
  storeSetSetting: vi.fn(),
  story2videoImportMedia: vi.fn(),
  story2videoTranscribe: vi.fn(),
  story2videoListProjects: vi.fn().mockResolvedValue({ code: 0, data: [] }),
  story2videoDeleteProject: vi.fn(),
}));

vi.mock("@/api/tts-voice-catalog", () => ({
  getTtsVoiceCatalog: vi.fn().mockResolvedValue({
    code: 0,
    data: { providerId: "", model: "", selectedVoiceId: null, voices: [] },
  }),
  selectTtsVoice: vi.fn().mockResolvedValue({
    code: 0,
    data: { providerId: "", model: "", selectedVoiceId: null, voices: [] },
  }),
}));

import UiButton from "@/components/UiButton.vue";
import UiSelect from "@/components/UiSelect.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: "/create/result", name: "result", component: { template: "<div>result</div>" } }]
});

import CreateView from "./CreateView.vue";
import i18n from "@/i18n";

describe("CreateView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {};
    window.localStorage.clear();
  });

  it("renders page header", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    expect(w.text()).toContain("视频创作");
  });

  it("shows three view tabs", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    const tabs = w.findAll(".view-tab");
    expect(tabs.length).toBe(3);
  });

  it("switches to quick view shows mode tabs", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.view = "quick";
    await nextTick();
    const tabs = w.findAll(".mode-tab");
    expect(tabs.length).toBe(2);
  });

  it("switches quick mode to gallery shows upload", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.view = "quick";
    await nextTick();
    expect(w.vm.canQuickRender).toBe(false);
  });

  it("canQuickRender is true with non-empty quickText", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.view = "quick";
    w.vm.quickText = "hello world";
    await nextTick();
    expect(w.vm.canQuickRender).toBe(true);
  });

  it("canQuickRender is false when quickRendering", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.view = "quick";
    w.vm.quickText = "test";
    w.vm.quickRendering = true;
    expect(w.vm.canQuickRender).toBe(false);
  });

  it("canQuickRender is false when gallery mode with no images", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.view = "quick";
    w.vm.quickMode = "gallery";
    expect(w.vm.canQuickRender).toBe(false);
  });

  it("canQuickRender is true when gallery has images", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await new Promise(r => setTimeout(r, 0));
    expect(mocks.renderGetStatus).toHaveBeenCalled();
  });

  it("loads pipelines on mount", async () => {
    const mocks = await import("@/api/publisher");
    mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    expect(mocks.pipelineList).toHaveBeenCalled();
  });

  it("挂载时重新接上主进程仍在运行的编排流水线（HMR/重启后不丢失运行态）", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineStatus.mockImplementation((name) => {
      if (name === "story2video-compose") {
        return Promise.resolve({ code: 0, data: { status: "running", orchestrationMode: "orchestrator", id: "run_resume_1", stages: [] } });
      }
      return Promise.resolve({ code: 0, data: { status: "idle" } });
    });
    mocks.pipelineGetRunContext.mockResolvedValue({
      code: 0,
      data: { status: { status: "running" }, currentStage: 2, stages: [{ name: "split", status: "completed" }, { name: "optimize", status: "running" }], context: {} },
    });
    mocks.pipelineList.mockResolvedValue({
      code: 0,
      data: [{ name: "story2video-compose", available: true, stages: ["split", "domain_enrich", "optimize", "generate_assets", "compose", "publish"] }],
    });
    try {
      const w = mount(CreateView, {
        global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
      });
      await new Promise((r) => setTimeout(r, 100));
      await nextTick();
      expect(w.vm.selectedPipeline?.name).toBe("story2video-compose");
      expect(w.vm.orchestrationRunId).toBe("run_resume_1");
      expect(w.vm.pipelineRunStatus?.status).toBe("running");
      w.unmount();
    } finally {
      // 恢复 mock 实现，避免泄漏到后续用例（beforeEach 的 clearAllMocks 不重置实现）
      mocks.pipelineStatus.mockRestore();
      mocks.pipelineGetRunContext.mockRestore();
      mocks.pipelineList.mockRestore();
    }
  });

  it("阶段清单展示场景数/优化进度/资源进度详情", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    const now = new Date().toISOString();
    w.vm.pipelineRunStatus = {
      status: "running",
      currentStage: 2,
      progress: 50,
      stages: [
        { name: "split", status: "completed", startedAt: now },
        { name: "optimize", status: "completed", startedAt: now },
        { name: "generate_assets", status: "running", startedAt: now },
        { name: "compose", status: "pending" },
      ],
    };
    w.vm.orchestrationStages = w.vm.pipelineRunStatus.stages;
    w.vm.selectedPipeline = { name: "story2video-compose", available: true, stages: ["split", "optimize", "generate_assets", "compose"] };
    w.vm.orchestrationContext = {
      split: { scenes: [{}, {}] },
      optimize_progress: { done: 2, total: 2 },
      assets_progress: { imagesDone: 0, imagesTotal: 2, ttsDone: 1, ttsTotal: 2 },
    };
    w.vm.story2videoRunMeta = { createdAt: new Date(Date.now() - 65000).toISOString(), endedAt: null };
    await nextTick();
    expect(w.text()).toContain("拆分为了 2 个场景");
    expect(w.text()).toContain("共 2 个场景，已完成 2 个");
    expect(w.text()).toContain("图片 0/2");
    expect(w.text()).toContain("旁白 1/2");
    expect(w.text()).toContain("已用时");
    expect(w.find('[data-testid="story2video-stage-detail-generate_assets"]').text()).toContain("图片 0/2");
    w.unmount();
  });

  it("compose 阶段展示子进度条与片段文案", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    const now = new Date().toISOString();
    w.vm.pipelineRunStatus = {
      status: "running",
      currentStage: 3,
      progress: 66,
      stages: [
        { name: "split", status: "completed", startedAt: now },
        { name: "optimize", status: "completed", startedAt: now },
        { name: "generate_assets", status: "completed", startedAt: now },
        { name: "compose", status: "running", startedAt: now },
      ],
    };
    w.vm.orchestrationStages = w.vm.pipelineRunStatus.stages;
    w.vm.selectedPipeline = { name: "story2video-compose", available: true, stages: ["split", "optimize", "generate_assets", "compose"] };
    w.vm.orchestrationContext = {
      split: { scenes: [{}, {}] },
      optimize_progress: { done: 2, total: 2 },
      assets_progress: { imagesDone: 2, imagesTotal: 2, ttsDone: 2, ttsTotal: 2 },
      compose_progress: { phase: "segments", percent: 39, segmentsDone: 3, segmentsTotal: 5 },
    };
    w.vm.story2videoRunMeta = { createdAt: new Date(Date.now() - 65000).toISOString(), endedAt: null };
    await nextTick();
    expect(w.text()).toContain("正在合成片段 3/5 · 39%");
    const bar = w.find('[data-testid="story2video-stage-compose-progress"]');
    expect(bar.exists()).toBe(true);
    expect(bar.find(".stage-sub-fill").attributes("style")).toContain("width: 39%");
    w.unmount();
  });

  it("compose 阶段无子进度数据时安全降级（不渲染子进度条）", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    const now = new Date().toISOString();
    w.vm.pipelineRunStatus = {
      status: "running",
      currentStage: 1,
      progress: 50,
      stages: [
        { name: "split", status: "completed", startedAt: now },
        { name: "compose", status: "running", startedAt: now },
      ],
    };
    w.vm.orchestrationStages = w.vm.pipelineRunStatus.stages;
    w.vm.selectedPipeline = { name: "story2video-compose", available: true, stages: ["split", "compose"] };
    w.vm.orchestrationContext = { split: { scenes: [{}, {}] } };
    await nextTick();
    expect(w.find('[data-testid="story2video-stage-compose-progress"]').exists()).toBe(false);
    // 阶段名「视频合成」仍展示，但无 compose_progress 时不得渲染子进度文案
    expect(w.text()).not.toContain("正在合成片段");
    expect(w.find('[data-testid="story2video-stage-detail-compose"]').exists()).toBe(false);
    w.unmount();
  });

  it("恢复上次保存的图片轮播选项（跳过已禁用 provider，恢复折叠状态并提示）", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineList.mockResolvedValue({ code: 0, data: [] });
    mocks.storeGetSetting.mockResolvedValue({
      code: 0,
      data: {
        version: 1,
        s2vConfig: {
          imageStyle: "anime", voiceSpeed: 1.5, voiceProvider: "disabled-provider",
          splitLanguage: "en", splitTargetSeconds: 8,
          // 参数治理（7.1.19）：旧快照可能带已移除的系统管理参数，恢复时必须被白名单忽略
          voicePitch: -2, creativeLevel: 7, splitBaseWordsPerSecond: 9.9,
        },
        s2vOutputConfig: { resolution: "1920x1080", fps: 60 },
        ui: { expandedGroups: ["appearance", "voice"] },
      },
    });
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await new Promise((r) => setTimeout(r, 50));
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", available: true, stages: [] };
    w.vm.s2vVoiceProviders = [{ id: "minimax-tts" }, { id: "edge-tts" }];
    w.vm.s2vImageProviders = [{ id: "minimax-image" }];
    await w.vm.restoreS2VLastOptions();
    expect(w.vm.s2vConfig.imageStyle).toBe("anime");
    expect(w.vm.s2vConfig.voiceSpeed).toBe(1.5);
    expect(w.vm.s2vConfig.splitLanguage).toBe("en");
    expect(w.vm.s2vConfig.voiceProvider).not.toBe("disabled-provider");
    expect(w.vm.s2vOutputConfig.fps).toBe(60);
    // 旧快照缺新字段 → 恢复后保留默认值（字数主控 20 / follow-audio / N=6 / 时长视图）
    expect(w.vm.s2vConfig.splitTargetCharsPerScene).toBe(20);
    expect(w.vm.s2vConfig.sceneDurationMode).toBe("follow-audio");
    expect(w.vm.s2vConfig.minSceneDuration).toBe(6);
    expect(w.vm.s2vConfig.splitViewMode).toBe("seconds");
    // 旧快照带回陈旧 splitTargetSeconds=8 → restore 按主控字数 20 + 恢复后的语言 en(2.8) × voice.speed 1.5 自愈为 round(20/4.2)=5
    expect(w.vm.s2vConfig.splitTargetSeconds).toBe(5);
    // 参数治理（7.1.19）：旧快照中的已移除系统管理参数被忽略，不污染当前配置
    expect(w.vm.s2vConfig).not.toHaveProperty("voicePitch");
    expect(w.vm.s2vConfig).not.toHaveProperty("creativeLevel");
    expect(w.vm.s2vConfig).not.toHaveProperty("splitBaseWordsPerSecond");
    // 恢复表单折叠状态
    expect(w.vm.s2vOpenSections.appearance).toBe(true);
    expect(w.vm.s2vOpenSections.voice).toBe(true);
    // 恢复轻提示
    expect(w.vm.s2vOptionsToast).toContain("已恢复");
    // 恢复 mock 实现，避免泄漏到后续用例（beforeEach 的 clearAllMocks 不重置实现）
    mocks.storeGetSetting.mockReset();
    w.unmount();
  });

  it("保存并重置图片轮播选项设置", async () => {
    const mocks = await import("@/api/publisher");
    mocks.storeGetSetting.mockResolvedValue(null);
    mocks.storeSetSetting.mockResolvedValue({ code: 0 });
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", available: true, stages: [] };
    w.vm.s2vConfig.imageStyle = "cyberpunk";
    await w.vm.saveS2VLastOptions();
    expect(mocks.storeSetSetting).toHaveBeenCalledWith("story2video.lastOptions.v1", expect.objectContaining({
      version: 1,
      s2vConfig: expect.objectContaining({ imageStyle: "cyberpunk" }),
    }));
    // 折叠状态随快照保存，保存后显示轻提示
    const savedCall = mocks.storeSetSetting.mock.calls.find(([key]) => key === "story2video.lastOptions.v1");
    expect(savedCall[1].ui.expandedGroups).toEqual(expect.arrayContaining(["basic"]));
    expect(w.vm.s2vOptionsToast).toContain("已保存");
    await w.vm.resetS2VLastOptions();
    expect(w.vm.s2vConfig.imageStyle).toBe("cinematic");
    expect(mocks.storeSetSetting).toHaveBeenCalledWith("story2video.lastOptions.v1", null);
    w.unmount();
  });

  it("音色克隆：渲染上传要求提示并映射全部克隆错误码", async () => {
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await nextTick();
    w.vm.s2vVoiceCloneRequirements = {
      allowedExtensions: [".mp3", ".m4a", ".wav"],
      maxSampleCount: 1,
      maxSampleBytes: 20971520,
      minSampleDurationSeconds: 10,
      maxSampleDurationSeconds: 300,
    };
    const hint = w.vm.s2vVoiceCloneHint();
    expect(hint).toContain("mp3、m4a、wav");
    expect(hint).toContain("10 秒");
    expect(hint).toContain("5 分钟");
    expect(hint).toContain("20 MB");
    // 未映射到函数文本（回归：method 需调用而非直接插值）
    expect(String(hint)).not.toContain("function");

    expect(w.vm.friendlyVoiceCatalogError("VOICE_CLONE_SAMPLE_DURATION_INVALID")).toContain("时长不符合要求");
    expect(w.vm.friendlyVoiceCatalogError("VOICE_CLONE_SAMPLE_EXTENSION_UNSUPPORTED")).toContain("mp3、m4a 或 wav");
    expect(w.vm.friendlyVoiceCatalogError("VOICE_CLONE_SAMPLE_TOO_LARGE")).toContain("大小超出限制");
    expect(w.vm.friendlyVoiceCatalogError("VOICE_CLONE_SELECTION_UNAVAILABLE")).toContain("音频样本暂存不可用");
    expect(w.vm.friendlyVoiceCatalogError("VOICE_CLONE_UNAVAILABLE")).toContain("音色克隆服务暂时不可用");
    expect(w.vm.friendlyVoiceCatalogError("VOICE_CLONE_DIALOG_UNAVAILABLE")).toContain("文件选择窗口");
    expect(w.vm.friendlyVoiceCatalogError("VOICE_CLONE_MODEL_MISMATCH")).toContain("模型设置");
    // 未知错误仍走兜底，不回退到函数文本
    expect(w.vm.friendlyVoiceCatalogError("SOME_UNKNOWN_X")).toContain("无法加载音色列表");
    w.unmount();
  });

  it("pipelineList 返回异常格式时展示默认加载错误", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineList.mockResolvedValueOnce({});
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await new Promise(r => setTimeout(r, 0));

    expect(w.vm.pipelineError).toBe("加载失败");
    expect(w.vm.pipelineLoading).toBe(false);
  });

  it("pipelineList 拒绝时保留错误并结束加载态", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineList.mockRejectedValueOnce(new Error("IPC 不可用"));
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.quickRendering = true;
    await w.vm.cancelQuickRender();
    expect(mocks.renderCancel).toHaveBeenCalled();
    expect(w.vm.quickRendering).toBe(false);
  });

  it("aiWrite generates content", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await new Promise(r => setTimeout(r, 0));
    expect(w.vm.quickResult).toEqual({ outputPath: "/tmp/test.mp4" });
  });

  it("onRenderError sets quickError", async () => {
    const mocks = await import("@/api/publisher");
    mocks.onRenderError.mockImplementation(cb => { cb({ message: "render failed" }); return vi.fn(); });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await new Promise(r => setTimeout(r, 0));
    expect(w.vm.quickError).toBe("render failed");
  });

  it("onRenderInstallProgress updates installLog", async () => {
    const mocks = await import("@/api/publisher");
    mocks.onRenderInstallProgress.mockImplementation(cb => { cb({ text: "installing..." }); return vi.fn(); });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    expect(w.vm.isOrchestratedPipeline("story2video-compose")).toBe(true);
  });

  it("isOrchestratedPipeline returns false for other pipelines", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    expect(w.vm.isOrchestratedPipeline("cinematic")).toBe(false);
    expect(w.vm.isOrchestratedPipeline("talking-head")).toBe(false);
  });

  it("has s2vConfig with required fields", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    expect(w.vm.s2vConfig).toHaveProperty("imageStyle");
    expect(w.vm.s2vConfig).toHaveProperty("imageProvider");
    expect(w.vm.s2vConfig).toHaveProperty("voiceId");
    expect(w.vm.s2vConfig).toHaveProperty("voiceProvider");
    expect(w.vm.s2vConfig).toHaveProperty("voiceSpeed");
    expect(w.vm.s2vConfig).toHaveProperty("voiceVolume");
    // 参数治理（7.1.19/R2）：系统管理参数前端不声明（R1：voicePitch/creativeLevel/splitBaseWordsPerSecond；R2：splitSpeechRate/concurrency/autoAdvance）
    expect(w.vm.s2vConfig).not.toHaveProperty("voicePitch");
    expect(w.vm.s2vConfig).not.toHaveProperty("creativeLevel");
    expect(w.vm.s2vConfig).not.toHaveProperty("splitBaseWordsPerSecond");
    expect(w.vm.s2vConfig).not.toHaveProperty("splitSpeechRate");
    expect(w.vm.s2vConfig).not.toHaveProperty("concurrency");
    expect(w.vm.s2vConfig).not.toHaveProperty("autoAdvance");
    expect(w.vm.s2vConfig.splitLanguage).toBe("auto");
  });

  it("does not expose unconfigured static image providers in the Story2Video selector", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    await nextTick();

    const optionValues = w.findAll("option").map(option => option.attributes("value"));
    expect(optionValues).toContain("");
    expect(optionValues).not.toContain("dall-e");
    expect(optionValues).not.toContain("openai-image");
    expect(optionValues).not.toContain("comfyui");
    w.unmount();
  });

  it("Story2Video 隐藏通用视觉、LLM、预算和手动检查点控制", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    await nextTick();

    expect(w.text()).not.toContain("视觉风格");
    expect(w.text()).not.toContain("LLM 模型");
    expect(w.text()).not.toContain("温度:");
    expect(w.text()).not.toContain("预算模式");
    expect(w.text()).not.toContain("预算上限");
    expect(w.text()).not.toContain("检查点策略");
    w.unmount();
  });

  it("Story2Video 隐藏无效的比例、情绪、字体和离线占位图选项", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    await nextTick();

    expect(w.text()).not.toContain("宽高比");
    expect(w.text()).not.toContain("情绪");
    expect(w.text()).not.toContain("字幕字体");
    expect(w.text()).not.toContain("离线占位图");
    expect(w.find("#s2v-voice-options").exists()).toBe(false);
    expect(w.text()).not.toContain("音调:");
    expect(w.text()).not.toContain("并发数");
    expect(w.text()).not.toContain("创意强度:");
    expect(w.text()).not.toContain("自动推进");
    expect(w.text()).not.toContain("仅创建运行");
    w.unmount();
  });

  it("Story2Video 负向提示词输入与运行配置保持 500 字符上限一致", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    await nextTick();

    const negativePrompt = w.findAll(".config-item").find(item => item.find("label").text() === "负向提示词");
    expect(negativePrompt.find("textarea").attributes("maxlength")).toBe("500");
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
    [{ code: 1, message: "轮询 IPC 失败" }, "story2video.operation_failed"],
    [{ code: 0, data: null }, "story2video.run_status_unavailable"],
  ])("编排轮询遇到无效响应时向用户显示错误并停止轮询", async (response, expectedMessage) => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineGetRunContext.mockResolvedValueOnce(response);
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.orchestrationRunId = "run-poll-error";
    w.vm.pollTimer = 1;

    await w.vm.updateOrchestrationStatus();

    expect(w.vm.orchestrationError).toBe("");
    expect(w.vm.story2videoErrorDialog.messageKey).toBe(expectedMessage);
    expect(w.find(".orchestration-error").exists()).toBe(false);
    expect(w.vm.pipelineRunStatus).toMatchObject({ status: "failed" });
    expect(w.vm.pollTimer).toBeNull();
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
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.orchestrationRunId = "run-terminal-error";
    w.vm.pollTimer = 1;

    await w.vm.updateOrchestrationStatus();

    expect(w.vm.orchestrationError).toBe("");
    expect(w.vm.story2videoErrorDialog.messageKey).toBe("story2video.operation_failed");
    expect(w.vm.pipelineRunStatus).toMatchObject({ status: "failed" });
    expect(w.vm.pollTimer).toBeNull();
    w.unmount();
  });

  it("检查点推进返回失败结果时显示具体错误", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineAdvanceToNextCheckpoint.mockResolvedValueOnce({
      code: 0,
      data: { success: false, error: "图片服务商未配置 API Key" },
    });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.orchestrationRunId = "run-advance-error";

    await w.vm.advanceOrchestration();

    expect(w.vm.orchestrationError).toBe("");
    expect(w.vm.story2videoErrorDialog.messageKey).toBe("story2video.model_configuration_required");
    expect(w.vm.pipelineRunStatus).toMatchObject({ status: "failed" });
    w.unmount();
  });

  it("完成但缺少可预览视频时使用应用内弹窗", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();

    const handled = w.vm.applyOrchestrationOutcome({
      completed: true,
      context: { story2videoProject: { projectId: "project-no-preview" } },
    });

    expect(handled).toBe(true);
    expect(w.vm.orchestrationError).toBe("");
    expect(w.vm.story2videoErrorDialog).toEqual({ visible: true, detail: '', messageKey:  "story2video.preview_missing",
      messageParams: {},
    });
    expect(alertSpy).not.toHaveBeenCalled();

    alertSpy.mockRestore();
    w.unmount();
  });
  it("Story2Video 模型配置错误使用应用内弹窗，不调用原生 alert", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineStartOrchestrated.mockResolvedValue({
      code: -1,
      message: "Story2Video 默认 LLM 不可用，请先完成模型设置",
    });
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", description: "test", stages: [], category: "generated" };
    w.vm.pipelineText = "测试文案";

    await w.vm.startPipeline();
    await nextTick();

    expect(w.vm.story2videoErrorDialog).toEqual({ visible: true, detail: '', messageKey:  "story2video.model_configuration_required",
      messageParams: {},
    });
    expect(alertSpy).not.toHaveBeenCalled();

    w.vm.closeStory2VideoErrorDialog();
    await nextTick();
    expect(w.vm.story2videoErrorDialog.visible).toBe(false);
    alertSpy.mockRestore();
    w.unmount();
  });
  it("Story2Video IPC 权限拒绝显示登录/权益提示，不回退为泛化失败", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineStartOrchestrated.mockResolvedValue({
      code: -3,
      message: "当前许可证无权访问 pipeline:startOrchestrated",
    });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", description: "test", stages: [], category: "generated" };
    w.vm.pipelineText = "1";

    await w.vm.startPipeline();

    expect(w.vm.story2videoErrorDialog).toEqual({ visible: true, detail: '', messageKey:  "story2video.access_denied",
      messageParams: {},
    });
    w.unmount();
  });
  it("Story2Video 在调用 IPC 前拒绝超过 6000 个 Unicode 字符的文案", async () => {
    const mocks = await import("@/api/publisher");
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    w.vm.pipelineText = "😀".repeat(6001);

    await w.vm.startPipeline();

    expect(mocks.pipelineStartOrchestrated).not.toHaveBeenCalled();
    expect(w.vm.story2videoErrorDialog).toMatchObject({
      visible: true,
      messageKey: "story2video.text_too_long",
      messageParams: { max: 6000, maxFormatted: "6,000" },
    });
    w.unmount();
  });

  it("startPipeline dispatches to orchestrated for story2video-compose", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineStartOrchestrated.mockResolvedValue({ code: 0, data: { runId: "run-123" } });
    mocks.pipelineGetRunContext.mockResolvedValue({ code: 0, data: { status: { status: "running" }, context: {} } });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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

  it("后端返回乱序列表时仍将 Story2Video 显示在首位", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineList.mockResolvedValue({
      code: 0,
      data: [
        { name: "cinematic", description: "电影", category: "generated" },
        { name: "story2video-compose", description: "Story2Video", category: "generated" },
        { name: "animated-explainer", description: "动画", category: "generated" },
      ],
    });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await w.vm.loadPipelines();

    expect(w.vm.pipelines.map(pipeline => pipeline.name)).toEqual([
      "story2video-compose", "cinematic", "animated-explainer",
    ]);
    expect(w.find('[data-pipeline-id="story2video-compose"]').exists()).toBe(true);
    w.unmount();
  });
  it("流水线卡片优先显示后端 stageCount", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    w.vm.pipelineText = "唐朝长安的夜景";
    w.vm.selectedStyle = "cinematic-dark";
    w.vm.checkpointPolicy = "none";
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
      voiceVolume: 0.8,
      transition: "slide-right",
      subtitleEnabled: false,      subtitleSize: "size4",
      subtitleStyleName: "style2",
      bgmPath: "C:/media/bgm.mp3",
      bgmVolume: 7,
      splitLanguage: "auto",
      splitMode: "precise",
      splitMaxSentenceLength: 120,
      splitTargetSeconds: 4,
      promptStyle: "anime",
      watermarkText: "测试水印",
      platforms: ["bilibili"],
      publishEnabled: true,
      title: "长安夜景",
      tagsText: "历史,夜景",
    };

    await w.vm.startPipeline();

    expect(mocks.pipelineStartOrchestrated).toHaveBeenCalledWith("story2video-compose", expect.objectContaining({
      text: "唐朝长安的夜景",
      inputMode: "text",
      checkpointPolicy: "none",
      autoAdvance: true,
      story2videoTextConfig: expect.objectContaining({
        version: 1,
        mode: "text",
        prompt: "唐朝长安的夜景",
        size: "1080x1920",
        contentType: "history",
        split: expect.objectContaining({ language: "auto", mode: "precise", maxSentenceLength: 120, targetSeconds: 4, baseWordsPerSecond: 3.3 }),
        optimize: expect.objectContaining({ style: "anime" }),
        image: expect.objectContaining({ provider: "local-diffusion", style: "watercolor", effect: "pan-left", aspectRatio: "9:16" }),
        voice: expect.objectContaining({ provider: "piper", id: "custom-voice-id", speed: 1.2, volume: 0.8 }),
        subtitle: expect.objectContaining({ enabled: false, size: "size4", style: "style2" }),
        bgm: { enabled: true, path: "C:/media/bgm.mp3", volume: 7 },
        transition: "slide-right",
        output: { fps: 24, format: "webm" },
        publish: expect.objectContaining({ enabled: true, platforms: ["bilibili"], title: "长安夜景", tags: ["历史", "夜景"] }),
      }),
    }));
    const request = mocks.pipelineStartOrchestrated.mock.calls.at(-1)[1].story2videoTextConfig;
    expect(request).not.toHaveProperty("seconds");
    // 参数治理（7.1.19）：提交不携带系统管理参数（creativeLevel/voice.pitch），由 normalizer 默认兜底
    expect(request.optimize).not.toHaveProperty("creativeLevel");
    expect(request.voice).not.toHaveProperty("pitch");
    // 参数治理 R2：提交不携带 split.speechRate（normalizer 以 voice.speed 派生）与顶层 concurrency（默认 3 兜底）
    expect(request.split).not.toHaveProperty("speechRate");
    expect(request).not.toHaveProperty("concurrency");
    // split.baseWordsPerSecond 仍随提交按语言表显式下发（auto → 3.3），与 normalizer 语言表兜底同源
    expect(request.split.baseWordsPerSecond).toBe(3.3);
    // params 保留字面量 autoAdvance: true（流水线自动推进）
    expect(mocks.pipelineStartOrchestrated.mock.calls.at(-1)[1].autoAdvance).toBe(true);
    expect(request).not.toHaveProperty("versions");
    expect(request).not.toHaveProperty("perImageDuration");
    expect(w.vm.outputConfig).toEqual({ resolution: "3840x2160", fps: 60, format: "mp4" });
    w.unmount();
  });

  it("S2V 编排提交字数主控与最短场景时长参数（默认 + 显式开启）", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineStartOrchestrated.mockResolvedValue({ code: 0, data: { runId: "run-duration-contract" } });
    mocks.pipelineGetRunContext.mockResolvedValue({ code: 0, data: { status: { status: "paused" }, context: {} } });
    const mountS2V = () => {
      const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
      w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
      w.vm.pipelineText = "分镜时长契约";
      return w;
    };

    // 默认：字数主控 20 + follow-audio + minSceneDuration 6
    const w1 = mountS2V();
    await w1.vm.startPipeline();
    const defaultConfig = mocks.pipelineStartOrchestrated.mock.calls.at(-1)[1].story2videoTextConfig;
    expect(defaultConfig.split.targetCharsPerScene).toBe(20);
    expect(defaultConfig.sceneDurationMode).toBe("follow-audio");
    expect(defaultConfig.minSceneDuration).toBe(6);
    w1.unmount();

    // 显式：字数 30 + min-duration + N=8
    const w2 = mountS2V();
    w2.vm.s2vConfig = { ...w2.vm.s2vConfig, splitTargetCharsPerScene: 30, sceneDurationMode: "min-duration", minSceneDuration: 8 };
    await w2.vm.startPipeline();
    const explicitConfig = mocks.pipelineStartOrchestrated.mock.calls.at(-1)[1].story2videoTextConfig;
    expect(explicitConfig.split.targetCharsPerScene).toBe(30);
    expect(explicitConfig.sceneDurationMode).toBe("min-duration");
    expect(explicitConfig.minSceneDuration).toBe(8);
    w2.unmount();
  });

  it("Story2Video 只显示文字输入并拒绝旧图片模式", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineStartOrchestrated.mockResolvedValue({ code: 0, data: { runId: "run-images" } });
    mocks.pipelineGetRunContext.mockResolvedValue({ code: 0, data: { status: { status: "running" }, context: {} } });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "screen-demo", stages: [] };
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();

    await w.vm.handleS2VBgmFile({ target: { files: [{ name: "bgm.mp3", size: 5 }] } });

    expect(w.vm.s2vConfig.bgmPath).toBe("");
    expect(alertSpy).not.toHaveBeenCalled();
    expect(w.vm.story2videoErrorDialog.messageKey).toBe("story2video.media_invalid");
    alertSpy.mockRestore();
    w.unmount();
  });


  it("BGM 格式不支持时细分提示具体格式与允许列表", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();

    await w.vm.handleS2VBgmFile({ target: { files: [{ name: "bgm.flac", size: 100 }] } });

    expect(w.vm.s2vConfig.bgmPath).toBe("");
    expect(w.vm.story2videoErrorDialog.messageKey).toBe("story2video.media_format_invalid");
    expect(w.vm.story2videoErrorDialog.messageParams.extension).toBe(".FLAC");
    expect(w.vm.story2videoErrorDialog.messageParams.kindLabel).toBe("背景音乐");
    w.unmount();
  });

  it("BGM 大小超限时细分提示最大与当前大小", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();

    // 16MB > 15MB（bgm 上限）
    await w.vm.handleS2VBgmFile({ target: { files: [{ name: "big.mp3", size: 16 * 1024 * 1024 }] } });

    expect(w.vm.s2vConfig.bgmPath).toBe("");
    expect(w.vm.story2videoErrorDialog.messageKey).toBe("story2video.media_size_exceeded");
    expect(w.vm.story2videoErrorDialog.messageParams.maxMb).toBe(15);
    expect(w.vm.story2videoErrorDialog.messageParams.actualMb).toBe(16);
    w.unmount();
  });

  it("主进程拒绝导入时把具体原因透传为细分提示", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoImportMedia.mockResolvedValue({ code: -1, message: "不支持的媒体格式" });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();

    await w.vm.handleS2VBgmFile({ target: { files: [{ name: "bgm.mp3", size: 5 }] } });

    expect(w.vm.s2vConfig.bgmPath).toBe("");
    expect(w.vm.story2videoErrorDialog.messageKey).toBe("story2video.media_format_invalid");
    w.unmount();
  });

  it("主进程报告文件不可读时细分提示", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoImportMedia.mockResolvedValue({ code: -1, message: "媒体文件不存在或不可读" });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();

    await w.vm.handleS2VBgmFile({ target: { files: [{ name: "bgm.mp3", size: 5 }] } });

    expect(w.vm.s2vConfig.bgmPath).toBe("");
    expect(w.vm.story2videoErrorDialog.messageKey).toBe("story2video.media_unreadable");
    w.unmount();
  });

  it("媒体文件要求提示文字按类别渲染", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    await nextTick();

    expect(w.vm.mediaRequirementsBgmText).toContain("15MB");
    expect(w.vm.mediaRequirementsAudioText).toContain("50MB");
    expect(w.vm.mediaRequirementsImageText).toContain("10MB");
    expect(w.vm.mediaRequirementsVideoText).toContain("512MB");
    w.unmount();
  });
  it("startPipeline uses normal pipelineStart for non-orchestrated", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineStart.mockResolvedValue({ code: 0, data: {} });
    mocks.pipelineStatus.mockResolvedValue({ code: 0, data: { status: "running", stages: [] } });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "custom-pipeline", description: "test", stages: [], category: "custom", available: true };
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "custom-pipeline", stages: [], available: true };
    w.vm.pipelineText = "创作内容";
    w.vm.inputMode = "text";

    await w.vm.startPipeline();

    expect(mocks.pipelineStart).toHaveBeenCalledWith("custom-pipeline", expect.objectContaining({
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "custom-pipeline", stages: [], available: true };
    w.vm.inputMode = "video";
    w.vm.pipelineVideo = { name: "source.mp4", path: "C:/media/source.mp4" };

    await w.vm.startPipeline();

    expect(mocks.pipelineStart).toHaveBeenCalledWith("custom-pipeline", expect.objectContaining({
      video: "C:/media/source.mp4",
    }));
    alertSpy.mockRestore();
    w.unmount();
  });

  it("Story2Video 视频素材模式明确拒绝启动，不静默丢弃参数", async () => {
    const mocks = await import("@/api/publisher");
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    w.vm.inputMode = "video";
    w.vm.pipelineVideo = { name: "source.mp4", path: "C:/media/source.mp4" };

    await w.vm.startPipeline();

    expect(mocks.pipelineStartOrchestrated).not.toHaveBeenCalled();
    expect(w.vm.story2videoErrorDialog).toEqual({ visible: true, detail: '', messageKey:  "story2video.text_input_only",
      messageParams: {},
    });
    expect(alertSpy).not.toHaveBeenCalled();
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    expect(w.vm.llmConfig).toHaveProperty("temperature");
    expect(w.vm.llmConfig).not.toHaveProperty("provider");
    expect(w.vm.llmConfig).not.toHaveProperty("model");
  });
});

// ── 交互测试：通过 UI 点击触发，而非 vm 直调 ──────────────────
describe("CreateView - UI interactions", () => {
  beforeEach(async () => {
    // W3（codex 5b）：隔离 storeGetSetting 的 mockResolvedValue 实现泄漏到后续用例
    const mocks = await import("@/api/publisher");
    mocks.storeGetSetting.mockReset();
    mocks.storeGetSetting.mockResolvedValue(null);
  });

  it("clicks view-tab switches view (pipelines/quick/history)", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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

  it("分镜粒度双视图：目标时长输入反推字数主控，切换视图保持一致", async () => {
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    await nextTick();

    // 默认时长视图：输入 8 秒（非默认值）→ 反推字数 round(8 × 3.3 × 1.0) = 26，且同步旧 targetSeconds
    const secondsInput = w.find('[data-testid="s2v-split-target-seconds"]');
    expect(secondsInput.exists()).toBe(true);
    await secondsInput.setValue(8);
    expect(w.vm.s2vConfig.splitTargetCharsPerScene).toBe(26);
    expect(w.vm.s2vConfig.splitTargetSeconds).toBe(8);

    // 切换到字数视图：显示 26；编辑 30 → 主控 30，时长估算 round(30/3.3)=9
    await w.find('[data-testid="s2v-split-view-chars"]').trigger("click");
    await nextTick();
    const charsInput = w.find('[data-testid="s2v-split-target-chars"]');
    expect(charsInput.exists()).toBe(true);
    expect(Number(charsInput.element.value)).toBe(26);
    await charsInput.setValue(30);
    expect(w.vm.s2vConfig.splitTargetCharsPerScene).toBe(30);
    expect(w.vm.s2vConfig.splitTargetSeconds).toBe(9);

    // 切回时长视图：显示估算整数秒 30/3.3 ≈ 9（与提交口径一致）
    await w.find('[data-testid="s2v-split-view-seconds"]').trigger("click");
    await nextTick();
    expect(Number(w.find('[data-testid="s2v-split-target-seconds"]').element.value)).toBe(9);
    w.unmount();
  });

  it("运营后台实时预估（Batch 5b）：静态估算显示分镜数/时长区间/成本", async () => {
    const mocks = await import("@/api/publisher");
    mocks.storeGetSetting.mockResolvedValue({ code: 0, data: null }); // 无样本 → 静态
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    w.vm.pipelineText = "一二三四五六七八九十"; // 10 字，默认每分镜 20 字 → 1 个分镜
    await nextTick();
    await new Promise((r) => setTimeout(r, 20));

    const row = w.find('[data-testid="s2v-estimate-row"]');
    expect(row.exists()).toBe(true);
    expect(row.text()).toContain("1 个分镜");
    // 静态：20 字 / (3.3×1.0) ≈ 6 秒，区间 5~7；成本 = 0.10 + 6×0.05 = 0.40
    expect(row.text()).toContain("5~7 秒");
    expect(row.text()).toContain("¥0.40");
    expect(row.text()).toContain("静态估算");
    w.unmount();
  });

  it("运营后台实时预估（Batch 5b）：本地 TTS 样本校准生效并标注", async () => {
    const mocks = await import("@/api/publisher");
    const nowIso = new Date().toISOString();
    const samples = Array.from({ length: 5 }, () => ({
      language: "zh", provider: "edge-tts", voiceId: "v1", speed: 1,
      chars: 9, durationSeconds: 1, recordedAt: nowIso, // 实际 9 字/s → 校准系数 2.0
    }));
    mocks.pipelineList.mockResolvedValue({ code: 0, data: [] });
    mocks.storeGetSetting.mockResolvedValue({ code: 0, data: samples });
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    w.vm.s2vConfig = { ...w.vm.s2vConfig, splitLanguage: "zh", voiceProvider: "edge-tts", voiceId: "v1" };
    w.vm.pipelineText = "一二三四五六七八九十";
    // 显式触发样本加载（不依赖 mounted 异步链，聚焦校准→预估链路）
    await w.vm.loadS2VTtsSamples();
    await nextTick();
    expect(w.vm.s2vTtsSamples.length).toBe(5);

    const row = w.find('[data-testid="s2v-estimate-row"]');
    expect(row.exists()).toBe(true);
    // 校准后：20 字 / (4.5×2.0) ≈ 2 秒，区间 1~3；成本 = 0.10 + 2×0.05 = 0.20
    expect(row.text()).toContain("1~3 秒");
    expect(row.text()).toContain("¥0.20");
    expect(row.text()).toContain("按本地 TTS 样本校准");
    w.unmount();
  });

  it("运营后台实时预估（Batch 5b）：storeGetSetting 直接返回数组（生产解包形态）同样生效", async () => {
    const mocks = await import("@/api/publisher");
    const nowIso = new Date().toISOString();
    const samples = Array.from({ length: 4 }, () => ({
      language: "zh", provider: "edge-tts", voiceId: "v1", speed: 1,
      chars: 9, durationSeconds: 1, recordedAt: nowIso,
    }));
    mocks.pipelineList.mockResolvedValue({ code: 0, data: [] });
    mocks.storeGetSetting.mockResolvedValue(samples); // 直接数组（生产 wrapper 解包后的形态）
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    w.vm.s2vConfig = { ...w.vm.s2vConfig, splitLanguage: "zh", voiceProvider: "edge-tts", voiceId: "v1" };
    w.vm.pipelineText = "一二三四五六七八九十";
    await w.vm.loadS2VTtsSamples();
    await nextTick();
    expect(w.vm.s2vTtsSamples.length).toBe(4);
    const row = w.find('[data-testid="s2v-estimate-row"]');
    expect(row.exists()).toBe(true);
    expect(row.text()).toContain("按本地 TTS 样本校准");
    w.unmount();
  });

  it("运营后台实时预估（Batch 5b）：样本不足 3 条时回退静态标注（W3 语义）", async () => {
    const mocks = await import("@/api/publisher");
    const nowIso = new Date().toISOString();
    mocks.pipelineList.mockResolvedValue({ code: 0, data: [] });
    mocks.storeGetSetting.mockResolvedValue({ code: 0, data: [
      { language: "zh", provider: "edge-tts", voiceId: "v1", speed: 1, chars: 9, durationSeconds: 1, recordedAt: nowIso },
    ] }); // 仅 1 条 → 不足 CALIBRATION_MIN_SAMPLES=3
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    w.vm.s2vConfig = { ...w.vm.s2vConfig, splitLanguage: "zh", voiceProvider: "edge-tts", voiceId: "v1" };
    w.vm.pipelineText = "一二三四五六七八九十";
    await w.vm.loadS2VTtsSamples();
    await nextTick();
    const row = w.find('[data-testid="s2v-estimate-row"]');
    expect(row.exists()).toBe(true);
    expect(row.text()).toContain("静态估算"); // 未达阈值 → 不标“已校准”
    w.unmount();
  });

  it("运营后台实时预估（Batch 5b）：非 story2video-compose 流水线不显示预估行", async () => {
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await nextTick();
    w.vm.selectedPipeline = { name: "animated-explainer", stages: [] };
    w.vm.pipelineText = "一二三四五六七八九十";
    await nextTick();
    expect(w.find('[data-testid="s2v-estimate-row"]').exists()).toBe(false);
    w.unmount();
  });

  it("运营后台实时预估（Batch 5b）：空文案不显示预估行", async () => {
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    await nextTick();
    expect(w.find('[data-testid="s2v-estimate-row"]').exists()).toBe(false);
    w.unmount();
  });

  it("语言感知估算（Batch 5a）：zh/en 基准语速参与时长↔字数换算，auto 回退 3.3", async () => {
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    await nextTick();

    // zh：8 秒 → round(8 × 4.5) = 36 字；36/4.5 = 8 秒回显
    w.vm.s2vConfig.splitLanguage = "zh";
    await w.find('[data-testid="s2v-split-target-seconds"]').setValue(8);
    expect(w.vm.s2vConfig.splitTargetCharsPerScene).toBe(36);
    expect(w.vm.s2vConfig.splitTargetSeconds).toBe(8);
    expect(w.vm.s2vSplitEstimatedSeconds).toBe(8);

    // en：8 秒 → round(8 × 2.8) = 22 字
    w.vm.s2vConfig.splitLanguage = "en";
    await w.find('[data-testid="s2v-split-target-seconds"]').setValue(8);
    expect(w.vm.s2vConfig.splitTargetCharsPerScene).toBe(22);
    expect(w.vm.s2vConfig.splitTargetSeconds).toBe(8);

    // auto：8 秒 → round(8 × 3.3) = 26 字（默认行为不变）
    w.vm.s2vConfig.splitLanguage = "auto";
    await w.find('[data-testid="s2v-split-target-seconds"]').setValue(8);
    expect(w.vm.s2vConfig.splitTargetCharsPerScene).toBe(26);
    w.unmount();
  });

  it("分镜粒度换算边界：clamp 到 [minWords,maxWords]、无效输入 no-op、语速驱动估算、N 输入自愈", async () => {
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    await nextTick();

    // 时长视图输入 60 秒 → 字数被夹到 maxWords=50
    await w.find('[data-testid="s2v-split-target-seconds"]').setValue(60);
    expect(w.vm.s2vConfig.splitTargetCharsPerScene).toBe(50);

    // 切到字数视图输入 5 → 夹到 minWords=10
    await w.find('[data-testid="s2v-split-view-chars"]').trigger("click");
    await nextTick();
    await w.find('[data-testid="s2v-split-target-chars"]').setValue(5);
    expect(w.vm.s2vConfig.splitTargetCharsPerScene).toBe(10);

    // 无效输入 no-op（保持现值）
    const before = w.vm.s2vConfig.splitTargetCharsPerScene;
    await w.find('[data-testid="s2v-split-target-chars"]').setValue(0);
    expect(w.vm.s2vConfig.splitTargetCharsPerScene).toBe(before);

    // 语速 0.5 → 估算时长随动：20 字 / (3.3×0.5) ≈ 12 秒（整数口径）
    w.vm.s2vConfig.splitTargetCharsPerScene = 20;
    w.vm.s2vConfig.voiceSpeed = 0.5;
    await nextTick();
    expect(w.vm.s2vSplitEstimatedSeconds).toBe(12);

    // N 输入越界自愈：100 → 60，0 → no-op
    await w.find('[data-testid="s2v-min-duration-toggle"]').setValue(true);
    await nextTick();
    await w.find('[data-testid="s2v-min-duration-input"]').setValue(100);
    expect(w.vm.s2vConfig.minSceneDuration).toBe(60);
    await w.find('[data-testid="s2v-min-duration-input"]').setValue(0);
    expect(w.vm.s2vConfig.minSceneDuration).toBe(60);
    w.unmount();
  });

  it("最短场景时长开关默认关闭，开启后 N 输入生效并随配置提交", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineStartOrchestrated.mockResolvedValue({ code: 0, data: { runId: "run-min-duration-ui" } });
    mocks.pipelineGetRunContext.mockResolvedValue({ code: 0, data: { status: { status: "paused" }, context: {} } });
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    w.vm.pipelineText = "最短场景时长";
    await nextTick();

    const toggle = w.find('[data-testid="s2v-min-duration-toggle"]');
    expect(toggle.exists()).toBe(true);
    expect(toggle.element.checked).toBe(false);
    expect(w.find('[data-testid="s2v-min-duration-input"]').exists()).toBe(false);
    expect(w.vm.s2vConfig.sceneDurationMode).toBe("follow-audio");

    // 开启 → N 输入出现并设置 8
    await toggle.setValue(true);
    await nextTick();
    expect(w.vm.s2vConfig.sceneDurationMode).toBe("min-duration");
    const durationInput = w.find('[data-testid="s2v-min-duration-input"]');
    expect(durationInput.exists()).toBe(true);
    await durationInput.setValue(8);
    expect(w.vm.s2vConfig.minSceneDuration).toBe(8);

    // 提交配置携带 min-duration 与 N
    await w.vm.startPipeline();
    const request = mocks.pipelineStartOrchestrated.mock.calls.at(-1)[1].story2videoTextConfig;
    expect(request.sceneDurationMode).toBe("min-duration");
    expect(request.minSceneDuration).toBe(8);
    w.unmount();
  });

  it("未登录本地模式：listProjects 返回 localMode 时显示本地模式提示条", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoListProjects.mockResolvedValue({ code: 0, data: [], localMode: true });
    mocks.pipelineHistory.mockResolvedValue({ code: 0, data: [] });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    w.vm.view = "history";
    await w.vm.loadHistory();
    await nextTick();

    expect(w.vm.historyLocalMode).toBe(true);
    expect(w.vm.story2videoErrorDialog).toMatchObject({ visible: false });
    expect(w.text()).toContain("本机记录");
    w.unmount();
  });

  it("历史加载失败时弹窗携带可操作建议（本地存储原因）", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoListProjects.mockResolvedValue({ code: -1, message: "Story2Video 项目存储不可用", data: [] });
    mocks.pipelineHistory.mockResolvedValue({ code: 0, data: [] });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    w.vm.view = "history";
    await w.vm.loadHistory();
    await nextTick();

    expect(w.vm.story2videoErrorDialog).toMatchObject({ visible: true, messageKey: "story2video.history_load_failed" });
    expect(w.vm.story2videoErrorDialog.detail).toContain("重启");
    w.unmount();
  });

  it("历史加载失败（未登录原因）时弹窗建议登录", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoListProjects.mockResolvedValue({ code: -1, message: "无法识别当前用户", data: [] });
    mocks.pipelineHistory.mockResolvedValue({ code: 0, data: [] });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    w.vm.view = "history";
    await w.vm.loadHistory();
    await nextTick();

    expect(w.vm.story2videoErrorDialog).toMatchObject({ visible: true, messageKey: "story2video.history_load_failed" });
    expect(w.vm.story2videoErrorDialog.detail).toContain("登录");
    w.unmount();
  });

  it("未登录（listProjects 返回空本地历史）时历史记录不弹「无法加载」", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoListProjects.mockResolvedValue({ code: 0, data: [] });
    mocks.pipelineHistory.mockResolvedValue({ code: 0, data: [] });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    w.vm.view = "history";
    await w.vm.loadHistory();
    await nextTick();

    expect(w.vm.historyLoading).toBe(false);
    expect(w.vm.history).toEqual([]);
    expect(w.vm.story2videoErrorDialog).toMatchObject({ visible: false });
    w.unmount();
  });

  it("历史记录请求超时时停止加载、显示错误并保留已完成来源", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoListProjects.mockImplementation(() => new Promise(() => {}));
    mocks.pipelineHistory.mockResolvedValue({ code: 0, data: [{
      id: "completed-run", pipelineName: "Story2Video", status: "completed", title: "已完成流水线",
    }] });
    vi.useFakeTimers();
    try {
      const w = mount(CreateView, {
        global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
      });
      w.vm.view = "history";
      void w.vm.loadHistory();

      await vi.advanceTimersByTimeAsync(8000);
      await nextTick();

      expect(w.vm.historyLoading).toBe(false);
      expect(w.find(".history-error").exists()).toBe(false);
      expect(w.vm.story2videoErrorDialog).toMatchObject({
        visible: true,
        messageKey: "story2video.history_load_failed",
      });
      expect(w.find(".history-status.completed").exists()).toBe(true);
      expect(w.text()).toContain("已完成流水线");
    } finally {
      vi.useRealTimers();
    }
  });
  it("并发历史请求只保留最新一次响应", async () => {
    const mocks = await import("@/api/publisher");
    let resolveOldProjects;
    let resolveOldRuns;
    mocks.story2videoListProjects
      .mockImplementationOnce(() => new Promise(resolve => { resolveOldProjects = resolve; }))
      .mockResolvedValueOnce({ code: 0, data: [{ projectId: "new-project", title: "新记录", status: "completed" }] });
    mocks.pipelineHistory
      .mockImplementationOnce(() => new Promise(resolve => { resolveOldRuns = resolve; }))
      .mockResolvedValueOnce({ code: 0, data: [] });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });

    const first = w.vm.loadHistory();
    await Promise.resolve();
    const second = w.vm.loadHistory();
    await second;
    resolveOldProjects({ code: 0, data: [{ projectId: "old-project", title: "旧记录", status: "completed" }] });
    resolveOldRuns({ code: 0, data: [] });
    await first;
    await nextTick();

    expect(w.vm.history.map(item => item.projectId)).toEqual(["new-project"]);
    expect(w.vm.historyLoading).toBe(false);
  });
  it("clicks btn-start triggers startPipeline", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineStart.mockResolvedValueOnce({ code: 1, message: "测试阻止启动" });
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { id: "p1", name: "normal-pipeline", available: true };
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

  it("未实现引擎的流水线禁用启动按钮并显示提示", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.pipelines = [{ name: "animation", available: false, stages: [] }];
    w.vm.selectedPipeline = { name: "animation", available: false, stages: [] };
    w.vm.pipelineText = "内容";
    await nextTick();
    expect(w.vm.canStartPipeline).toBe(false);
    const startBtn = w.find('[data-testid="start-story2video"]');
    expect(startBtn.attributes("disabled")).toBeDefined();
    const hint = w.find('[data-testid="pipeline-unavailable-hint"]');
    expect(hint.exists()).toBe(true);
    expect(hint.text()).toContain("尚未实现执行引擎");
    w.unmount();
  });

  it("未实现引擎的流水线 startPipeline 被守卫拦截并弹出提示", async () => {
    const mocks = await import("@/api/publisher");
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "animation", available: false, stages: [] };
    w.vm.pipelineText = "内容";
    mocks.pipelineStart.mockClear();
    await w.vm.startPipeline();
    expect(mocks.pipelineStart).not.toHaveBeenCalled();
    expect(w.vm.story2videoErrorDialog.visible).toBe(true);
    expect(w.vm.story2videoErrorDialog.messageKey).toBe("story2video.pipeline_not_implemented");
    w.unmount();
  });

  it("自动流水线使用各自真实阶段名（非 s2v 回退）", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.pipelines = [{ name: "documentary-montage", available: true }];
    w.vm.selectPipeline({ name: "documentary-montage", available: true });
    await nextTick();
    expect(w.vm.orchestrationStages.map(s => s.name)).toEqual([
      "research", "ingest", "edit", "narrate", "render",
    ]);
    w.vm.selectPipeline({ name: "animated-explainer", available: true });
    await nextTick();
    expect(w.vm.orchestrationStages.map(s => s.name)).toEqual([
      "research", "proposal", "script", "scenes", "assets", "editing", "compose", "publish",
    ]);
    w.unmount();
  });

  it("s2v 高级区拆分为分句与时长、模板与输出两个子组", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    w.vm.s2vOpenSections.advanced = true;
    await nextTick();
    const titles = w.findAll(".s2v-subgroup-title").map(t => t.text());
    expect(titles).toEqual(["分句与时长", "模板与输出"]);
    expect(w.text()).toContain("分句语言");
    expect(w.text()).toContain("比例与分辨率");
    expect(w.text()).toContain("720×1280（竖屏）");
    w.unmount();
  });

  it("历史记录优先展示可恢复的 Story2Video 项目并可打开", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoListProjects.mockResolvedValue({ code: 0, data: [{
      projectId: "project-history", pipeline: "story2video-compose", status: "completed",
      title: "历史成片", recoverable: true, updatedAt: "2026-07-22T00:00:00.000Z",
    }] });
    const pushSpy = vi.spyOn(router, "push");
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });

    w.vm.view = "history";
    await w.vm.loadHistory();
    w.vm.historyFilter = "failed";
    await nextTick();

    expect(w.vm.filteredHistory.map(item => item.id)).toEqual(["run-failed"]);
    expect(w.findAll(".history-name").map(item => item.text())).toEqual(["失败任务"]);
  });

  it("失败历史任务显示「从断点继续」并可一键恢复", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoListProjects.mockResolvedValue({ code: 0, data: [] });
    mocks.pipelineHistory.mockResolvedValue({ code: 0, data: [
      { id: "run-failed-r1", pipeline: "story2video-compose", status: "failed", title: "失败任务", error: "provider 429 限流", stages: [{ name: "split", status: "completed" }, { name: "optimize", status: "failed" }] },
    ] });
    mocks.pipelineResumeOrchestration.mockResolvedValue({ code: 0, data: { success: true, runId: "run-failed-r1" } });
    mocks.pipelineGetRunContext.mockResolvedValue({ code: 0, data: { runId: "run-failed-r1", pipeline: "story2video-compose", status: { status: "running" }, stages: [] } });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    w.vm.pipelines = [{ name: "story2video-compose", available: true, stages: [] }];
    w.vm.view = "history";
    await w.vm.loadHistory();
    await nextTick();
    w.vm.historyFilter = "failed";
    await nextTick();

    const resumeBtn = w.find(".history-resume");
    expect(resumeBtn.exists()).toBe(true);
    expect(resumeBtn.text()).toContain("从断点继续");

    await resumeBtn.trigger("click");
    await nextTick();
    expect(mocks.pipelineResumeOrchestration).toHaveBeenCalledWith("run-failed-r1");
    expect(w.vm.view).toBe("pipelines");
    expect(w.vm.orchestrationRunId).toBe("run-failed-r1");
    expect(w.vm.pipelineRunStatus.status).toBe("running");
    w.unmount();
  });

  it("运行中历史任务显示「继续生成」并可一键恢复（重启后 running 快照断点续跑）", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoListProjects.mockResolvedValue({ code: 0, data: [] });
    mocks.pipelineHistory.mockResolvedValue({ code: 0, data: [
      { id: "run-running-r1", pipeline: "story2video-compose", status: "running", title: "进行中任务", error: null, stages: [{ name: "split", status: "completed" }, { name: "optimize", status: "running" }] },
    ] });
    mocks.pipelineResumeOrchestration.mockResolvedValue({ code: 0, data: { success: true, runId: "run-running-r1" } });
    mocks.pipelineGetRunContext.mockResolvedValue({ code: 0, data: { runId: "run-running-r1", pipeline: "story2video-compose", status: { status: "running" }, stages: [] } });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    w.vm.pipelines = [{ name: "story2video-compose", available: true, stages: [] }];
    w.vm.view = "history";
    await w.vm.loadHistory();
    await nextTick();
    w.vm.historyFilter = "running";
    await nextTick();

    const resumeBtn = w.find(".history-resume");
    expect(resumeBtn.exists()).toBe(true);
    expect(resumeBtn.text()).toContain("继续生成");

    await resumeBtn.trigger("click");
    await nextTick();
    expect(mocks.pipelineResumeOrchestration).toHaveBeenCalledWith("run-running-r1");
    expect(w.vm.view).toBe("pipelines");
    w.unmount();
  });

  it("内容政策类失败历史任务不显示「从断点继续」", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoListProjects.mockResolvedValue({ code: 0, data: [] });
    mocks.pipelineHistory.mockResolvedValue({ code: 0, data: [
      { id: "run-policy", pipeline: "story2video-compose", status: "failed", title: "违规任务", error: "content policy: 图片生成需要修改文案" },
    ] });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    w.vm.view = "history";
    await w.vm.loadHistory();
    await nextTick();
    w.vm.historyFilter = "failed";
    await nextTick();

    expect(w.find(".history-resume").exists()).toBe(false);
    w.unmount();
  });

  it("可把当前参数保存为自定义模板、重新应用并删除", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
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
    const confirmSpy = vi.spyOn(window, "confirm");
    w.vm.requestTemplateDeletion();
    expect(w.vm.story2videoTemplateDeleteDialog).toEqual({ visible: true, templateId: selectedId });
    w.vm.closeTemplateDeletionDialog();
    expect(w.vm.s2vTemplateLibrary.some(template => template.id === selectedId)).toBe(true);

    w.vm.requestTemplateDeletion();
    w.vm.confirmTemplateDeletion();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(w.vm.s2vTemplateLibrary.some(template => template.id === selectedId)).toBe(false);
    confirmSpy.mockRestore();
  });
  it("历史记录加载失败时只显示应用内弹窗，不显示页面错误条", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoListProjects.mockResolvedValueOnce({ code: 1, message: "internal path C:/private" });
    mocks.pipelineHistory.mockResolvedValueOnce({ code: 0, data: [] });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });

    w.vm.view = "history";
    await w.vm.loadHistory();
    await nextTick();

    expect(w.find(".history-error").exists()).toBe(false);
    expect(w.vm.story2videoErrorDialog).toEqual({ visible: true, detail: '', messageKey:  "story2video.history_load_failed",
      messageParams: {},
    });
  });

  it("删除 Story2Video 项目须经应用内确认，取消不会调用删除接口", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoDeleteProject.mockResolvedValue({ code: 0 });
    const confirmSpy = vi.spyOn(window, "confirm");
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    w.vm.history = [{ projectId: "project-delete" }];

    w.vm.requestProjectDeletion({ projectId: "project-delete" });
    expect(w.vm.story2videoProjectDeleteDialog).toEqual({ visible: true, projectId: "project-delete" });
    w.vm.closeProjectDeletionDialog();
    expect(mocks.story2videoDeleteProject).not.toHaveBeenCalled();

    w.vm.requestProjectDeletion({ projectId: "project-delete" });
    await w.vm.confirmProjectDeletion();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mocks.story2videoDeleteProject).toHaveBeenCalledWith("project-delete");
    expect(w.vm.history).toEqual([]);
    confirmSpy.mockRestore();
  });

});
  it("历史记录含运行中流水线时置顶并显示阶段进度色块", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoListProjects.mockResolvedValue({ code: 0, data: [{ projectId: "p1", title: "已完成项目", status: "completed" }] });
    mocks.pipelineHistory.mockResolvedValue({ code: 0, data: [
      { id: "run-live", pipeline: "story2video-compose", status: "running", createdAt: "2026-08-07T00:00:00.000Z",
        stages: [{ name: "split", status: "completed" }, { name: "optimize", status: "running" }, { name: "compose", status: "pending" }] },
    ] });
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    w.vm.view = "history";
    await w.vm.loadHistory();
    await nextTick();

    // 运行中流水线排在已完成项目之前
    expect(w.vm.history[0].id).toBe("run-live");
    expect(w.vm.history[0].status).toBe("running");
    const runningItem = w.find(".history-item.is-running");
    expect(runningItem.exists()).toBe(true);
    expect(runningItem.text()).toContain("进行中");
    expect(runningItem.text()).toContain("返回流水线创作查看进度");
    // 阶段进度条（done/active/pending）
    const stageSegs = runningItem.findAll(".history-progress-seg");
    expect(stageSegs.length).toBe(3);
    expect(stageSegs[0].classes()).toContain("done");
    expect(stageSegs[1].classes()).toContain("active");
    expect(stageSegs[2].classes()).toContain("pending");
    // 存在运行中任务时启动 5s 历史轮询
    expect(w.vm.historyPollTimer).not.toBeNull();
    w.unmount();
  });

  it("点击运行中历史项切回流水线创作并尝试恢复查看", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoListProjects.mockResolvedValue({ code: 0, data: [] });
    mocks.pipelineHistory.mockResolvedValue({ code: 0, data: [
      { id: "run-live-2", pipeline: "story2video-compose", status: "running", createdAt: "2026-08-07T00:00:00.000Z", stages: [] },
    ] });
    mocks.pipelineStatus.mockResolvedValue({ code: 0, data: { id: "run-live-2", status: "running", orchestrationMode: "orchestrator" } });
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    w.vm.view = "history";
    await w.vm.loadHistory();
    await nextTick();
    await w.find(".history-item.is-running").trigger("click");
    await nextTick();
    expect(w.vm.view).toBe("pipelines");
    expect(mocks.pipelineStatus).toHaveBeenCalled();
    w.unmount();
  });

  it("refreshRunningHistory 原地更新运行中阶段状态，不重建整个列表", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoListProjects.mockResolvedValue({ code: 0, data: [{ projectId: "p1", title: "已完成项目", status: "completed" }] });
    const running = { id: "run-live-3", pipeline: "story2video-compose", status: "running", createdAt: "2026-08-07T00:00:00.000Z",
      stages: [{ name: "split", status: "completed" }, { name: "optimize", status: "running" }, { name: "compose", status: "pending" }] };
    mocks.pipelineHistory.mockResolvedValue({ code: 0, data: [running] });
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    w.vm.view = "history";
    await w.vm.loadHistory();
    await nextTick();
    const before = w.vm.history;
    expect(before.find(i => i.id === "run-live-3").stages[1].status).toBe("running");

    // 刷新：阶段推进 → 原地更新（数组身份不变，避免整表重渲染闪烁）
    const updated = { ...running, stages: [
      { name: "split", status: "completed" }, { name: "optimize", status: "completed" }, { name: "compose", status: "running" } ] };
    mocks.pipelineHistory.mockResolvedValue({ code: 0, data: [updated] });
    await w.vm.refreshRunningHistory();
    await nextTick();
    expect(w.vm.history).toBe(before);
    const item = w.vm.history.find(i => i.id === "run-live-3");
    expect(item.stages[1].status).toBe("completed");
    expect(item.stages[2].status).toBe("running");
    expect(w.vm.history.some(i => i.projectId === "p1")).toBe(true);
    w.unmount();
  });

  it("refreshRunningHistory 运行结束的项触发完整加载，终态保留在历史中不消失", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoListProjects.mockResolvedValue({ code: 0, data: [] });
    mocks.pipelineHistory.mockResolvedValue({ code: 0, data: [
      { id: "run-fin", pipeline: "story2video-compose", status: "running", createdAt: "2026-08-07T00:00:00.000Z", stages: [] },
    ] });
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    w.vm.view = "history";
    await w.vm.loadHistory();
    await nextTick();
    expect(w.vm.history.some(i => i.id === "run-fin")).toBe(true);

    // 运行结束：终态（failed）出现在 pipelineHistory，刷新后应触发完整加载并显示终态，而不是消失
    mocks.pipelineHistory.mockResolvedValue({ code: 0, data: [
      { id: "run-fin", pipeline: "story2video-compose", status: "failed", createdAt: "2026-08-07T00:00:00.000Z", error: "boom", stages: [] },
    ] });
    await w.vm.refreshRunningHistory();
    await nextTick();
    expect(mocks.pipelineHistory.mock.calls.length).toBeGreaterThan(1); // 触发了完整加载
    const finished = w.vm.history.find(i => i.id === "run-fin");
    expect(finished).toBeTruthy();
    expect(finished.status).toBe("failed");
    w.unmount();
  });

  it("providerWarningText 为空时隐藏横幅", async () => {
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await nextTick();
    expect(w.vm.providerWarningText).toBe("");
    expect(w.find(".provider-warning-banner").exists()).toBe(false);
    w.unmount();
  });

  it("providerWarningText 汇总异常 provider 并给出友好建议", async () => {
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await nextTick();
    // 横幅位于流水线详情视图内，先选中一条流水线
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    w.vm.providerWarnings = [
      { providerId: "agnes-llm", category: "llm", latencyMs: 90000, kind: "slow" },
      { providerId: "openai", category: "llm", latencyMs: 31000, kind: "timeout" },
    ];
    await nextTick();
    const text = w.vm.providerWarningText;
    expect(text).toContain("agnes-llm");
    expect(text).toContain("90 秒");
    expect(text).toContain("openai");
    expect(text).toContain("31 秒");
    expect(text).toContain("模型设置");
    expect(w.find(".provider-warning-banner").exists()).toBe(true);
    w.unmount();
  });

  it("providerWarningText 忽略异常数据（非数组/空数组）", async () => {
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await nextTick();
    w.vm.providerWarnings = "not-an-array";
    await nextTick();
    expect(w.vm.providerWarningText).toBe("");
    w.unmount();

  });
  it("选项自动保存后 toast 短暂显示并自动消失，不影响操作栏", async () => {
    vi.useFakeTimers();
    const mocks = await import("@/api/publisher");
    mocks.storeSetSetting.mockResolvedValue({ code: 0 });
    const w = mount(CreateView, {
      global: { plugins: [router, i18n], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", stages: [] };
    await nextTick();

    // 修改一个选项 → 触发 1s 防抖保存
    w.vm.s2vConfig.bgmVolume = 6;
    await vi.advanceTimersByTimeAsync(1100);
    await nextTick();
    expect(w.find('[data-testid="s2v-options-toast"]').exists()).toBe(true);
    expect(w.vm.s2vOptionsToast).toContain("已保存");

    // 1.6s 后自动消失
    await vi.advanceTimersByTimeAsync(1700);
    await nextTick();
    expect(w.vm.s2vOptionsToast).toBe("");
    expect(w.find('[data-testid="s2v-options-toast"]').exists()).toBe(false);
    w.unmount();
    vi.useRealTimers();
  });

describe("运营开关 videoCreation.maxOutputResolution（4K 能力）", () => {
  it("默认/1080p：前端不出现 4K 分辨率选项", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineList.mockResolvedValue({ code: 0, data: [] });
    mocks.storeGetSetting.mockResolvedValue(null); // 未配置 → 默认 1080p
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await new Promise((r) => setTimeout(r, 50));
    await nextTick();
    expect(w.vm.maxOutputResolution).toBe("1080p");
    const values = w.findAll("option").map((o) => o.attributes("value"));
    expect(values).toContain("1920x1080");
    expect(values).not.toContain("3840x2160");
    expect(w.text()).not.toContain("3840×2160");
    w.unmount();
    mocks.storeGetSetting.mockReset();
  });

  it("运营配置 4k：前端出现 4K 分辨率选项", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineList.mockResolvedValue({ code: 0, data: [] });
    mocks.storeGetSetting.mockResolvedValue({ code: 0, data: "4k" });
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await new Promise((r) => setTimeout(r, 50));
    await nextTick();
    expect(w.vm.maxOutputResolution).toBe("4k");
    const values = w.findAll("option").map((o) => o.attributes("value"));
    expect(values).toContain("3840x2160");
    w.unmount();
    mocks.storeGetSetting.mockReset();
  });

  it("1080p：恢复的旧快照含 4K 时归一化到 1920x1080（历史/模板不残留 4K）", async () => {
    const mocks = await import("@/api/publisher");
    mocks.pipelineList.mockResolvedValue({ code: 0, data: [] });
    // loadMaxOutputResolution 读到快照对象 → 按 1080p 处理；restoreS2VLastOptions 恢复 4K 快照
    mocks.storeGetSetting.mockResolvedValue({
      code: 0,
      data: {
        version: 1,
        s2vConfig: {},
        s2vOutputConfig: { resolution: "3840x2160", fps: 30 },
        ui: { expandedGroups: [] },
      },
    });
    const w = mount(CreateView, { global: { plugins: [router, i18n], components: { UiButton, UiSelect } } });
    await new Promise((r) => setTimeout(r, 50));
    await nextTick();
    w.vm.selectedPipeline = { name: "story2video-compose", available: true, stages: [] };
    w.vm.s2vVoiceProviders = [{ id: "minimax-tts" }, { id: "edge-tts" }];
    w.vm.s2vImageProviders = [{ id: "minimax-image" }];
    await w.vm.restoreS2VLastOptions();
    expect(w.vm.maxOutputResolution).toBe("1080p");
    expect(w.vm.s2vOutputConfig.resolution).toBe("1920x1080");
    w.unmount();
    mocks.storeGetSetting.mockReset();
  });
});
