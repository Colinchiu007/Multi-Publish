import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createRouter, createWebHistory } from "vue-router";

vi.mock("@/api/publisher", () => ({
  story2videoExportZip: vi.fn(),
  story2videoCreateShareUrl: vi.fn(),
  story2videoCopyPath: vi.fn(),
  story2videoShowInFolder: vi.fn(),
  story2videoSaveAs: vi.fn(),
  story2videoGetProject: vi.fn(),
  story2videoImportMedia: vi.fn(),
  story2videoUpdateSegments: vi.fn(),
  story2videoReplaceSegmentAudio: vi.fn(),
  story2videoRetrySegment: vi.fn(),
  story2videoRecomposeProject: vi.fn(),
  story2videoSelectSceneMaterial: vi.fn(),
  story2videoGenerateSceneImage: vi.fn(),
  story2videoGenerateSceneVideo: vi.fn(),
  story2videoRegenerateSceneSubtitle: vi.fn(),
  story2videoRegenerateSceneAudio: vi.fn(),
  story2videoRegenerateScenePrompt: vi.fn(),
  videoProcess: vi.fn(),
}));

const router = createRouter({ history: createWebHistory(), routes: [
  { path: "/", component: { template: "<div>root</div>" } },
  { path: "/create", name: "create", component: { template: "<div>create</div>" } },
  { path: "/create/result", name: "create-result", component: { template: "<div>result</div>" } },
  { path: "/publish", name: "publish", component: { template: "<div>publish</div>" } },
] });

import UiButton from "@/components/UiButton.vue";
import ResultView from "./ResultView.vue";

describe("ResultView", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  async function createView() {
    await router.push("/");
    const w = mount(ResultView, {
      global: {
        plugins: [router],
        components: { UiButton },
        mocks: { $t: (key, params) => (params && params.label ? params.label : key) }
      }
    });
    await nextTick();
    return w;
  }

  it("renders page title", async () => {
    const w = await createView();
    expect(w.text()).toContain("\u89c6\u9891\u9884\u89c8");
  });

  it("从路由 query 展示 BGM 跳过提示（bgmSkipped=1 + bgmReason）", async () => {
    await router.push({ path: "/create/result", query: { path: "C:/tmp/x.mp4", bgmSkipped: "1", bgmReason: "size_exceeded" } });
    const w = mount(ResultView, { global: { plugins: [router], components: { UiButton } } });
    w.vm.loading = false;
    await nextTick();
    expect(w.vm.bgmSkippedNotice).toContain("背景音乐已跳过");
    expect(w.vm.bgmSkippedNotice).toContain("超过大小上限");
    expect(w.find('[data-testid="story2video-result-bgm-skipped-notice"]').exists()).toBe(true);
    w.unmount();
  });

  it("未带 bgmSkipped 时不显示 BGM 跳过提示", async () => {
    await router.push({ path: "/create/result", query: { path: "C:/tmp/x.mp4" } });
    const w = mount(ResultView, { global: { plugins: [router], components: { UiButton } } });
    w.vm.loading = false;
    await nextTick();
    expect(w.vm.bgmSkippedNotice).toBe("");
    expect(w.find('[data-testid="story2video-result-bgm-skipped-notice"]').exists()).toBe(false);
    w.unmount();
  });

  it("从路由 query 展示完成汇总（时长 + 文件大小）", async () => {
    await router.push({ path: "/create/result", query: { path: "C:/tmp/x.mp4", durationMs: "125000", sizeBytes: "3145728" } });
    const w = mount(ResultView, { global: { plugins: [router], components: { UiButton } } });
    w.vm.loading = false;
    w.vm.videoPath = "C:/tmp/x.mp4";
    w.vm.videoSrc = "file:///C:/tmp/x.mp4";
    await nextTick();
    expect(w.vm.completionSummary).toBe("\u5b8c\u6210\u65f6\u95f4\u5171 2 \u5206 5 \u79d2 \u00b7 \u6587\u4ef6\u5927\u5c0f 3.0 M");
    expect(w.find('[data-testid="completion-summary"]').exists()).toBe(true);
    w.unmount();
  });

  it("provides a back-to-pipeline-list button that navigates to /create", async () => {
    const w = await createView();
    const back = w.find('[data-testid="back-to-pipeline-list"]');
    expect(back.exists()).toBe(true);
    expect(back.text()).toContain("返回流水线列表");
    await back.trigger("click");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(router.currentRoute.value.path).toBe("/create");
  });

  it("shows empty state when no video path", async () => {
    const w = await createView();
    expect(w.text()).toContain("\u6ca1\u6709\u53ef\u9884\u89c8\u7684\u89c6\u9891");
  });

  it("loads video path and shows video player", async () => {
    const w = await createView();
    w.vm.videoPath = "/videos/test.mp4";
    w.vm.videoSrc = "file:///videos/test.mp4";
    await nextTick();
    const video = w.find("video");
    expect(video.exists()).toBe(true);
    expect(w.vm.loading).toBe(false);
  });

  it("非 en 界面展示分段提示词的只读本地翻译（promptTranslation）", async () => {
    const w = await createView();
    w.vm.projectId = "p1";
    w.vm.segments = [
      { id: "s1", text: "旁白一", prompt: "A red apple", promptTranslation: "一个红苹果", imagePath: null, audioPath: null, status: "completed" },
      { id: "s2", text: "旁白二", prompt: "A blue sky", promptTranslation: null, imagePath: null, audioPath: null, status: "completed" },
    ];
    await nextTick();
    const blocks = w.findAll('[data-testid="segment-prompt-translation"]');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text()).toContain("一个红苹果");
  });

  it("handleError shows a localized modal", async () => {
    const w = await createView();
    w.vm.handleError();
    expect(w.vm.story2videoNotificationDialog).toEqual({
      visible: true,
      messageKey: "story2video.videoPreviewFailed",
      messageParams: {},
    });
  });

  it("主视频 URL 解析失败时显示预览缺失，而不是任务级失败", async () => {
    const api = await import("@/api/publisher");
    api.story2videoCreateShareUrl.mockResolvedValue({ code: 1, message: "video unavailable" });
    const w = await createView();

    await w.vm.loadVideoPath("C:/videos/missing.mp4");

    expect(w.vm.story2videoNotificationDialog.messageKey).toBe("story2video.preview_missing");
  });

  it("download 通过主进程保存对话框保存文件，不再用 <a download> 触发", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoSaveAs.mockResolvedValue({ code: 0, data: { path: "C:/saved/test.mp4" } });
    const w = await createView();
    w.vm.videoPath = "/videos/test.mp4";

    const createElementSpy = vi.spyOn(document, "createElement");
    await w.vm.download();

    expect(mocks.story2videoSaveAs).toHaveBeenCalledWith("/videos/test.mp4", expect.stringMatching(/^video_\d+\.mp4$/));
    // 不再创建 <a> 下载链接（跨源/本地 HTTP 媒体 URL 下载会静默失败）
    expect(createElementSpy.mock.calls.filter(c => c[0] === "a")).toHaveLength(0);
    expect(w.vm.story2videoNotificationDialog.messageKey).toBe("story2video.save_completed");
    createElementSpy.mockRestore();
    w.unmount();
  });

  it("download 保存被取消时不提示成功，也不抛错", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoSaveAs.mockResolvedValue({ code: 0, data: { cancelled: true } });
    const w = await createView();
    w.vm.videoPath = "/videos/test.mp4";

    await w.vm.download();
    expect(mocks.story2videoSaveAs).toHaveBeenCalledTimes(1);
    expect(w.vm.story2videoNotificationDialog.visible).toBe(false);
    w.unmount();
  });

  it("download does nothing without videoPath", async () => {
    const w = await createView();
    w.vm.videoPath = null;
    // Should not throw and should return early
    expect(() => w.vm.download()).not.toThrow();
  });

  it("does not render a page-level error banner", async () => {
    const w = await createView();
    w.vm.handleError();
    await nextTick();
    expect(w.find(".error-banner").exists()).toBe(false);
    expect(w.find(".result-message").exists()).toBe(false);
  });

  it("shows download and navigate buttons when video loaded", async () => {
    const w = await createView();
    w.vm.videoPath = "/videos/test.mp4";
    w.vm.videoSrc = "file:///videos/test.mp4";
    await nextTick();
    expect(w.text()).toContain("\u4e0b\u8f7d\u89c6\u9891");
    expect(w.text()).toContain("\u53bb\u53d1\u5e03");
  });

  it("安全加载主进程返回的本地视频地址", async () => {
    const api = await import("@/api/publisher");
    api.story2videoCreateShareUrl.mockResolvedValue({ code: 0, data: { url: "file:///videos/test.mp4" } });
    const w = await createView();

    await w.vm.loadVideoPath("C:/videos/test.mp4");

    expect(api.story2videoCreateShareUrl).toHaveBeenCalledWith("C:/videos/test.mp4");
    expect(w.vm.videoSrc).toBe("file:///videos/test.mp4");
  });

  it("可导出 ZIP、复制本地路径并打开所在文件夹", async () => {
    const api = await import("@/api/publisher");
    api.story2videoExportZip.mockResolvedValue({ code: 0, data: { path: "C:/videos/export.zip" } });
    api.story2videoCopyPath.mockResolvedValue({ code: 0, data: { path: "C:/videos/test.mp4" } });
    api.story2videoShowInFolder.mockResolvedValue({ code: 0, data: { path: "C:/videos/test.mp4" } });
    const w = await createView();
    w.vm.videoPath = "C:/videos/test.mp4";

    await w.vm.exportZip();
    await w.vm.copyLocalPath();
    await w.vm.showInFolder();

    expect(api.story2videoExportZip).toHaveBeenCalledWith([
      { path: "C:/videos/test.mp4", name: "test.mp4" },
    ]);
    expect(api.story2videoCopyPath).toHaveBeenCalledWith("C:/videos/test.mp4");
    expect(api.story2videoShowInFolder).toHaveBeenCalledWith("C:/videos/test.mp4");
    expect(w.vm.story2videoNotificationDialog).toEqual({
      visible: true,
      messageKey: "story2video.path_copied",
      messageParams: {},
    });
  });

  it("持久化项目导出 ZIP 时包含成片、完整旁白和所有分段产物", async () => {
    const api = await import("@/api/publisher");
    api.story2videoExportZip.mockResolvedValue({ code: 0, data: { path: "C:/videos/project.zip" } });
    const w = await createView();
    w.vm.videoPath = "C:/project/video.mp4";
    w.vm.audioPath = "C:/project/narration.m4a";
    w.vm.segments = [{
      id: "segment-0",
      imagePath: "C:/project/image.png",
      audioPath: "C:/project/audio.mp3",
      videoPath: "C:/project/segment.mp4",
    }];

    await w.vm.exportZip();

    expect(api.story2videoExportZip).toHaveBeenCalledWith([
      { path: "C:/project/video.mp4", name: "video.mp4" },
      { path: "C:/project/narration.m4a", name: "narration.m4a" },
      { path: "C:/project/image.png", name: "segment-001-image.png" },
      { path: "C:/project/audio.mp3", name: "segment-001-audio.mp3" },
      { path: "C:/project/segment.mp4", name: "segment-001-video.mp4" },
    ]);
  });

  it("加载持久化项目并展示可编辑分段和完整旁白", async () => {
    const api = await import("@/api/publisher");
    api.story2videoGetProject.mockResolvedValue({ code: 0, data: {
      projectId: "project-1",
      videoPath: "C:/projects/project-1/video.mp4",
      audioPath: "C:/projects/project-1/narration.m4a",
      segments: [
        { id: "segment-0", index: 0, text: "第一段", prompt: "画面一", audioPath: "C:/projects/project-1/audio-0.mp3" },
        { id: "segment-1", index: 1, text: "第二段", prompt: "画面二", audioPath: "C:/projects/project-1/audio-1.mp3" },
      ],
    } });
    api.story2videoCreateShareUrl.mockImplementation(async filePath => ({ code: 0, data: { url: "file:///" + filePath } }));
    const w = await createView();

    await w.vm.loadProject("project-1");
    await nextTick();

    expect(w.findAll(".segment-item textarea")[0].element.value).toBe("第一段");
    expect(w.text()).toContain("完整旁白");
    expect(w.findAll(".segment-item")).toHaveLength(2);
    expect(w.vm.audioSrc).toContain("narration.m4a");
  });

  it("旁白 URL 解析失败不清空已加载项目和成片", async () => {
    const api = await import("@/api/publisher");
    api.story2videoGetProject.mockResolvedValue({ code: 0, data: {
      projectId: "project-audio-degraded",
      videoPath: "C:/projects/project-audio-degraded/video.mp4",
      audioPath: "C:/projects/project-audio-degraded/narration.m4a",
      segments: [],
    } });
    api.story2videoCreateShareUrl.mockImplementation(async filePath => (
      filePath.endsWith("narration.m4a")
        ? { code: 1, message: "narration unavailable" }
        : { code: 0, data: { url: "file:///" + filePath } }
    ));
    const w = await createView();

    await w.vm.loadProject("project-audio-degraded");

    expect(w.vm.projectId).toBe("project-audio-degraded");
    expect(w.vm.project).toBeTruthy();
    expect(w.vm.videoSrc).toContain("video.mp4");
    expect(w.vm.audioSrc).toBeNull();
    expect(w.vm.story2videoNotificationDialog.visible).toBe(false);
  });

  it("场景素材 URL 解析失败不影响成片与项目", async () => {
    const api = await import("@/api/publisher");
    api.story2videoGetProject.mockResolvedValue({ code: 0, data: {
      projectId: "project-scene-degraded",
      videoPath: "C:/projects/project-scene-degraded/video.mp4",
      segments: [{ id: "segment-0", imagePath: "C:/projects/project-scene-degraded/image.png" }],
    } });
    api.story2videoCreateShareUrl.mockImplementation(async filePath => (
      filePath.endsWith("image.png")
        ? { code: 1, message: "scene unavailable" }
        : { code: 0, data: { url: "file:///" + filePath } }
    ));
    const w = await createView();

    await w.vm.loadProject("project-scene-degraded");

    expect(w.vm.projectId).toBe("project-scene-degraded");
    expect(w.vm.videoSrc).toContain("video.mp4");
    expect(w.vm.segments[0].imageUrl).toBeNull();
    expect(w.vm.story2videoNotificationDialog.visible).toBe(false);
  });

  it("分段可重排、保存、单图重试和重新合成", async () => {
    const api = await import("@/api/publisher");
    api.story2videoUpdateSegments.mockResolvedValue({ code: 0, data: { projectId: "project-1", dirty: true, segments: [] } });
    api.story2videoRetrySegment.mockResolvedValue({ code: 0, data: { projectId: "project-1", segments: [] } });
    api.story2videoRecomposeProject.mockResolvedValue({ code: 0, data: { projectId: "project-1", videoPath: "C:/new.mp4", segments: [] } });
    const w = await createView();
    w.vm.projectId = "project-1";
    w.vm.segments = [
      { id: "segment-0", text: "A", prompt: "PA" },
      { id: "segment-1", text: "B", prompt: "PB" },
    ];

    w.vm.moveSegment(1, -1);
    await w.vm.saveSegments();
    await w.vm.retrySegment("segment-1", "image");
    await w.vm.recomposeProject();

    expect(w.vm.segments[0].id).toBe("segment-1");
    expect(api.story2videoUpdateSegments).toHaveBeenCalledWith("project-1", [
      expect.objectContaining({ id: "segment-1" }),
      expect.objectContaining({ id: "segment-0" }),
    ]);
    expect(api.story2videoRetrySegment).toHaveBeenCalledWith("project-1", "segment-1", "image");
    expect(api.story2videoRecomposeProject).toHaveBeenCalledWith("project-1");
  });

  it("重试图片成功后重新解析新图片 URL（防止显示旧图/空白）", async () => {
    const api = await import("@/api/publisher");
    api.story2videoRetrySegment.mockResolvedValue({
      code: 0,
      data: { projectId: "project-1", segments: [{ id: "segment-1", imagePath: "C:/project/segment-1-new.png" }] },
    });
    api.story2videoCreateShareUrl.mockImplementation(async filePath => ({ code: 0, data: { url: "media://" + filePath } }));
    const w = await createView();
    w.vm.projectId = "project-1";
    w.vm.segments = [{ id: "segment-1", imagePath: "C:/project/segment-1-old.png" }];

    await w.vm.retrySegment("segment-1", "image");

    expect(api.story2videoRetrySegment).toHaveBeenCalledWith("project-1", "segment-1", "image");
    // 重试返回的新 imagePath 必须被解析为新的 media URL（回归：旧实现未刷新导致图片不显示）
    expect(w.vm.segments[0].imagePath).toBe("C:/project/segment-1-new.png");
    expect(w.vm.segments[0].imageUrl).toContain("segment-1-new.png");
  });

  it("可导入新旁白并原子替换指定分段音频", async () => {
    const api = await import("@/api/publisher");
    api.story2videoImportMedia.mockResolvedValue({ code: 0, data: { path: "C:/controlled/replacement.mp3" } });
    api.story2videoReplaceSegmentAudio.mockResolvedValue({ code: 0, data: {
      projectId: "project-1", dirty: true,
      segments: [{ id: "segment-0", audioPath: "C:/project/segment-0-replacement.mp3" }],
    } });
    const w = await createView();
    w.vm.projectId = "project-1";
    w.vm.segments = [{ id: "segment-0", audioPath: "C:/project/old.mp3" }];
    const file = new File(["voice"], "replacement.mp3", { type: "audio/mpeg" });
    const event = { target: { files: [file], value: "replacement.mp3" } };

    await w.vm.replaceSegmentAudio("segment-0", event);

    expect(api.story2videoImportMedia).toHaveBeenCalledWith(file, "audio");
    expect(api.story2videoReplaceSegmentAudio).toHaveBeenCalledWith(
      "project-1", "segment-0", "C:/controlled/replacement.mp3"
    );
    expect(w.vm.segments[0].audioPath).toContain("replacement.mp3");
    expect(event.target.value).toBe("");
  });

  it("通过真实视频处理通道导出裁剪片段", async () => {
    const api = await import("@/api/publisher");
    api.videoProcess.mockResolvedValue({ code: 0, data: { success: true, output: "C:/project/video_trim.mp4" } });
    api.story2videoCreateShareUrl.mockResolvedValue({ code: 0, data: { url: "file:///project/video_trim.mp4" } });
    const w = await createView();
    w.vm.videoPath = "C:/project/video.mp4";
    w.vm.trimStart = 1;
    w.vm.trimEnd = 3;

    await w.vm.trimVideo();

    expect(api.videoProcess).toHaveBeenCalledWith("trim", expect.objectContaining({
      input_path: "C:/project/video.mp4", start_seconds: 1, end_seconds: 3, codec: "libx264",
    }));
    expect(w.vm.trimmedPath).toBe("C:/project/video_trim.mp4");
    expect(w.vm.trimmedSrc).toBe("file:///project/video_trim.mp4");
  });

  it("使用双范围控件调整裁剪边界并定位预览", async () => {
    const w = await createView();
    w.vm.videoPath = "C:/project/video.mp4";
    w.vm.videoSrc = "file:///project/video.mp4";
    w.vm.handleVideoMetadata({ target: { duration: 10.04 } });
    await nextTick();

    const startRange = w.find('[data-testid="trim-start-range"]');
    const endRange = w.find('[data-testid="trim-end-range"]');
    expect(startRange.exists()).toBe(true);
    expect(endRange.exists()).toBe(true);
    expect(startRange.attributes("aria-label")).toBe("裁剪开始时间");
    expect(endRange.attributes("aria-label")).toBe("裁剪结束时间");
    expect(w.vm.trimEnd).toBe(10.04);

    const player = w.find(".video-player").element;
    Object.defineProperty(player, "currentTime", { value: 0, writable: true });
    player.play = vi.fn(() => Promise.resolve());
    player.pause = vi.fn();

    await startRange.setValue("2.5");
    await endRange.setValue("7.5");
    expect(w.vm.trimStart).toBe(2.5);
    expect(w.vm.trimEnd).toBe(7.5);
    expect(player.currentTime).toBe(7.5);

    await w.vm.previewTrimRange();
    expect(player.currentTime).toBe(2.5);
    expect(player.play).toHaveBeenCalledOnce();
    player.currentTime = 7.5;
    w.vm.handleTrimPreviewProgress({ target: player });
    expect(player.pause).toHaveBeenCalledOnce();
    expect(player.currentTime).toBe(2.5);
  });

  it("将裁剪范围收敛到真实视频时长且始终保留最小间隔", async () => {
    const w = await createView();
    w.vm.videoPath = "C:/project/video.mp4";
    w.vm.handleVideoMetadata({ target: { duration: 3.03 } });

    w.vm.setTrimBoundary("start", 9);
    expect(w.vm.trimStart).toBeLessThan(w.vm.trimEnd);
    expect(w.vm.trimEnd).toBeLessThanOrEqual(3.03);

    w.vm.setTrimBoundary("end", -1);
    expect(w.vm.trimStart).toBeGreaterThanOrEqual(0);
    expect(w.vm.trimEnd - w.vm.trimStart).toBeGreaterThanOrEqual(0.099);
    expect(w.vm.canTrim).toBe(true);
  });

  it("结果页通过 project 查询参数自动恢复持久化项目", async () => {
    const api = await import("@/api/publisher");
    api.story2videoGetProject.mockResolvedValue({ code: 0, data: {
      projectId: "project-route", videoPath: "C:/route/video.mp4", segments: [],
    } });
    api.story2videoCreateShareUrl.mockResolvedValue({ code: 0, data: { url: "file:///route/video.mp4" } });
    await router.push({ path: "/", query: { project: "project-route" } });

    const w = mount(ResultView, { global: { plugins: [router], components: { UiButton } } });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(api.story2videoGetProject).toHaveBeenCalledWith("project-route");
    expect(w.vm.projectId).toBe("project-route");
  });

  it("重新合成后无法解析成片 URL 时显示预览缺失提示", async () => {
    const api = await import("@/api/publisher");
    api.story2videoRecomposeProject.mockResolvedValue({ code: 0, data: {
      projectId: "project-1", videoPath: "C:/project/recomposed.mp4", segments: [],
    } });
    api.story2videoCreateShareUrl.mockResolvedValue({ code: 1, message: "private provider error" });
    const w = await createView();
    w.vm.projectId = "project-1";

    await w.vm.recomposeProject();

    expect(w.vm.story2videoNotificationDialog).toEqual({
      visible: true,
      messageKey: "story2video.preview_missing",
      messageParams: {},
    });
    expect(w.vm.story2videoNotificationDialog.messageKey).not.toBe("story2video.project_recomposed");
  });

  it("重新合成缺少视频路径时显示预览缺失提示", async () => {
    const api = await import("@/api/publisher");
    api.story2videoRecomposeProject.mockResolvedValue({ code: 0, data: {
      projectId: "project-1", segments: [],
    } });
    const w = await createView();
    w.vm.projectId = "project-1";

    await w.vm.recomposeProject();

    expect(w.vm.story2videoNotificationDialog).toEqual({
      visible: true,
      messageKey: "story2video.preview_missing",
      messageParams: {},
    });
  });

  it("桥接调用拒绝时也显示本地化操作失败提示", async () => {
    const api = await import("@/api/publisher");
    api.story2videoExportZip.mockRejectedValue(new Error("C:/private/path"));
    const w = await createView();
    w.vm.videoPath = "C:/videos/test.mp4";

    await w.vm.exportZip();

    expect(w.vm.story2videoNotificationDialog).toEqual({
      visible: true,
      messageKey: "story2video.operation_failed",
      messageParams: {},
    });
  });

  it("项目含离线降级素材时使用本地化弹窗，而不是页面警告条", async () => {
    const w = await createView();
    w.vm.projectId = "project-degraded";
    w.vm.videoPath = "C:/project/video.mp4";
    w.vm.segments = [{
      id: "segment-0",
      imageMeta: { source: "ffmpeg-placeholder", degraded: true },
      audioMeta: { source: "edge-tts", degraded: false },
    }];
    w.vm.maybeShowDegradedAssetsWarning();
    await nextTick();

    expect(w.find(".asset-warning").exists()).toBe(false);
    expect(w.vm.story2videoNotificationDialog).toEqual({
      visible: true,
      messageKey: "story2video.degraded_assets_warning",
      messageParams: { kinds: "占位图片" },
    });
    w.unmount();
  });

  it("历史详情渲染每场景 3 个素材槽位（图1/图2/视频）并展示选中态", async () => {
    const w = await createView();
    w.vm.projectId = "p1";
    w.vm.segments = [{
      id: "s1",
      imagePath: "C:/img1.png",
      alternateImages: [{ path: "C:/img2.png" }],
      videoPath: "C:/v.mp4",
      selectedMaterial: "image2",
      status: "completed",
    }];
    await nextTick();
    const section = w.find('[data-testid="scene-material-section"]');
    expect(section.exists()).toBe(true);
    const slots = section.findAll(".scene-material-slot");
    expect(slots).toHaveLength(3);
    expect(slots[0].attributes("aria-pressed")).toBe("false");
    expect(slots[1].attributes("aria-pressed")).toBe("true");
    expect(slots[2].attributes("aria-pressed")).toBe("false");
    expect(section.find(".scene-material-badge").exists()).toBe(true);
    w.unmount();
  });

  it("点击已填充素材槽调用 select IPC 并提示已选择", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoSelectSceneMaterial.mockResolvedValue({
      code: 0,
      data: {
        projectId: "p1",
        segments: [{ id: "s1", imagePath: "C:/img1.png", videoPath: "C:/v.mp4", selectedMaterial: "video", status: "completed" }],
      },
    });
    const w = await createView();
    w.vm.projectId = "p1";
    w.vm.segments = [{
      id: "s1", imagePath: "C:/img1.png", videoPath: "C:/v.mp4", selectedMaterial: "image1", status: "completed",
    }];
    await nextTick();
    const section = w.find('[data-testid="scene-material-section"]');
    await section.findAll(".scene-material-slot")[2].trigger("click");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.story2videoSelectSceneMaterial).toHaveBeenCalledWith("p1", "s1", "video");
    expect(w.vm.story2videoNotificationDialog.messageKey).toBe("story2video.material_selected");
    w.unmount();
  });

  it("生成新图/生成视频按钮在 busy 时禁用并显示生成中文案", async () => {
    const w = await createView();
    w.vm.projectId = "p1";
    w.vm.segments = [{ id: "s1", imagePath: "C:/img1.png", status: "completed" }];
    await nextTick();
    const section = w.find('[data-testid="scene-material-section"]');
    const buttons = section.findAll(".scene-material-actions button");
    expect(buttons).toHaveLength(2);
    w.vm.segmentBusy = { s1: "genImage" };
    await nextTick();
    expect(buttons[0].attributes("disabled")).toBeDefined();
    expect(buttons[1].attributes("disabled")).toBeDefined();
    expect(buttons[0].text()).toContain("story2video.sceneMaterial.generating");
    w.unmount();
  });

  it("再次合成按钮复用重新合成流程（recomposeProject）", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoRecomposeProject.mockResolvedValue({ code: 0, data: { videoPath: "C:/new.mp4", segments: [] } });
    const w = await createView();
    w.vm.projectId = "p1";
    w.vm.segments = [{ id: "s1", imagePath: "C:/img1.png", status: "completed" }];
    await nextTick();
    await w.find('[data-testid="recompose-final-button"]').trigger("click");
    await nextTick();
    expect(mocks.story2videoRecomposeProject).toHaveBeenCalledWith("p1");
    w.unmount();
  });

  it("再次合成成功后重新解析素材 URL（回归：旧实现素材区/分段图空白）", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoRecomposeProject.mockResolvedValue({
      code: 0,
      data: {
        projectId: "p1",
        videoPath: "C:/new.mp4",
        segments: [{
          id: "s1", imagePath: "C:/new-image.png", videoPath: "C:/new-seg.mp4", status: "completed",
        }],
      },
    });
    mocks.story2videoCreateShareUrl.mockImplementation(async filePath => ({ code: 0, data: { url: "media://" + filePath } }));
    const w = await createView();
    w.vm.projectId = "p1";
    w.vm.segments = [{ id: "s1", imagePath: "C:/img1.png", status: "completed" }];
    await nextTick();
    await w.vm.recomposeProject();
    await nextTick();
    expect(w.vm.segments[0].imagePath).toBe("C:/new-image.png");
    expect(w.vm.segments[0].imageUrl).toContain("new-image.png");
    expect(w.vm.segments[0].videoPath).toBe("C:/new-seg.mp4");
    expect(w.vm.segments[0].videoUrl).toContain("new-seg.mp4");
    w.unmount();
  });

  it("生成视频缺少旁白音频时错误归一化为 scene_audio_missing 提示", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoGenerateSceneVideo.mockRejectedValue(new Error("该场景没有旁白音频，无法生成视频"));
    const w = await createView();
    w.vm.projectId = "p1";
    w.vm.segments = [{ id: "s1", imagePath: "C:/img1.png", status: "completed" }];
    await nextTick();
    await w.vm.generateSceneVideo("s1");
    await nextTick();
    expect(w.vm.story2videoNotificationDialog.messageKey).toBe("story2video.scene_audio_missing");
    w.unmount();
  });

  it("生成新图成功提示 scene_image_generated 并刷新分段数据", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoGenerateSceneImage.mockResolvedValue({
      code: 0,
      data: {
        projectId: "p1",
        segments: [{
          id: "s1", imagePath: "C:/img1.png",
          alternateImages: [{ path: "C:/img2.png" }], status: "completed",
        }],
      },
    });
    const w = await createView();
    w.vm.projectId = "p1";
    w.vm.segments = [{ id: "s1", imagePath: "C:/img1.png", status: "completed" }];
    await nextTick();
    await w.vm.generateSceneImage("s1");
    await nextTick();
    expect(mocks.story2videoGenerateSceneImage).toHaveBeenCalledWith("p1", "s1");
    expect(w.vm.story2videoNotificationDialog.messageKey).toBe("story2video.scene_image_generated");
    expect(w.vm.segments[0].alternateImages).toHaveLength(1);
    w.unmount();
  });

  it("保存分段透传 videoPrompt/subtitleBlocks/voice 设置字段", async () => {
    const api = await import("@/api/publisher");
    api.story2videoUpdateSegments.mockResolvedValue({ code: 0, data: { projectId: "project-1", dirty: true, segments: [] } });
    const w = await createView();
    w.vm.projectId = "project-1";
    w.vm.segments = [{
      id: "segment-0",
      text: "A",
      prompt: "PA",
      videoPrompt: "VP",
      subtitleBlocks: ["L1", "L2"],
      voiceId: "v1",
      voiceSpeed: 1.2,
      voicePitch: 0.9,
      voiceEmotion: "happy",
    }];
    await w.vm.saveSegments();
    expect(api.story2videoUpdateSegments).toHaveBeenCalledWith("project-1", [
      expect.objectContaining({
        id: "segment-0", text: "A", prompt: "PA", videoPrompt: "VP",
        subtitleBlocks: ["L1", "L2"], voiceId: "v1", voiceSpeed: 1.2, voicePitch: 0.9, voiceEmotion: "happy",
      }),
    ]);
    w.unmount();
  });

  it("字幕 textarea 编辑后拆分 subtitleBlocks 并透传保存", async () => {
    const api = await import("@/api/publisher");
    api.story2videoUpdateSegments.mockResolvedValue({ code: 0, data: { projectId: "project-1", dirty: true, segments: [] } });
    const w = await createView();
    w.vm.projectId = "project-1";
    w.vm.segments = [{ id: "segment-0", subtitleBlocks: ["第一句", "第二句"] }];
    await nextTick();
    const ta = w.find('[data-testid="segment-subtitle-textarea"]');
    expect(ta.exists()).toBe(true);
    expect(ta.element.value).toContain("第一句");
    await ta.setValue("新字幕1\n新字幕2");
    await nextTick();
    expect(w.vm.segments[0].subtitleBlocks).toEqual(["新字幕1", "新字幕2"]);
    await w.vm.saveSegments();
    expect(api.story2videoUpdateSegments).toHaveBeenCalledWith("project-1", [
      expect.objectContaining({ id: "segment-0", subtitleBlocks: ["新字幕1", "新字幕2"] }),
    ]);
    w.unmount();
  });

  it("重新生成字幕成功提示 scene_subtitle_regenerated 并刷新分段", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoRegenerateSceneSubtitle.mockResolvedValue({
      code: 0,
      data: { projectId: "p1", segments: [{ id: "s1", text: "新字幕", subtitleBlocks: ["新字幕"], status: "completed" }] },
    });
    const w = await createView();
    w.vm.projectId = "p1";
    w.vm.segments = [{ id: "s1", text: "旧字幕", status: "completed" }];
    await nextTick();
    await w.vm.regenerateSceneSubtitle("s1");
    await nextTick();
    expect(mocks.story2videoRegenerateSceneSubtitle).toHaveBeenCalledWith("p1", "s1");
    expect(w.vm.story2videoNotificationDialog.messageKey).toBe("story2video.scene_subtitle_regenerated");
    expect(w.vm.segments[0].subtitleBlocks).toEqual(["新字幕"]);
    w.unmount();
  });

  it("重新生成字幕前自动保存未落盘编辑（审查 W3 回归）", async () => {
    const api = await import("@/api/publisher");
    api.story2videoUpdateSegments.mockResolvedValue({
      code: 0,
      data: { projectId: "p1", dirty: true, segments: [{ id: "s1", text: "本地新文案", status: "completed" }] },
    });
    api.story2videoRegenerateSceneSubtitle.mockResolvedValue({
      code: 0,
      data: { projectId: "p1", segments: [{ id: "s1", text: "本地新文案", subtitleBlocks: ["新块"], status: "completed" }] },
    });
    const w = await createView();
    w.vm.projectId = "p1";
    w.vm.segments = [{ id: "s1", text: "本地新文案", status: "completed" }];
    w.vm.segmentsDirty = true;
    await nextTick();
    await w.vm.regenerateSceneSubtitle("s1");
    await nextTick();
    expect(api.story2videoUpdateSegments).toHaveBeenCalledTimes(1);
    expect(api.story2videoRegenerateSceneSubtitle).toHaveBeenCalledWith("p1", "s1");
    expect(w.vm.segments[0].subtitleBlocks).toEqual(["新块"]);
    w.unmount();
  });

  it("任一分段生成中禁用保存分段与重新合成按钮（审查 W2 回归）", async () => {
    const w = await createView();
    w.vm.projectId = "p1";
    w.vm.segments = [{ id: "s1", status: "completed" }];
    await nextTick();
    const saveBtn = w.findAll("button").find(b => b.text().includes("保存分段"));
    const recomposeBtn = w.find('[data-testid="recompose-final-button"]');
    expect(saveBtn.attributes("disabled")).toBeUndefined();
    expect(recomposeBtn.attributes("disabled")).toBeUndefined();
    w.vm.segmentBusy = { s1: "tts" };
    await nextTick();
    expect(saveBtn.attributes("disabled")).toBeDefined();
    expect(recomposeBtn.attributes("disabled")).toBeDefined();
    w.unmount();
  });

  it("清空字幕输入后不回退旧时间轴，手动编辑同步清空时间轴（审查 I1 回归）", async () => {
    const w = await createView();
    w.vm.segments = [{
      id: "s1", subtitleBlocks: [], subtitleTimeline: [{ text: "旧时间轴", startTime: 0, endTime: 1 }], status: "completed",
    }];
    await nextTick();
    expect(w.vm.subtitleBlocksText(w.vm.segments[0])).toBe("");
    w.vm.updateSegmentSubtitleBlocks(w.vm.segments[0], "新字幕1\n新字幕2");
    expect(w.vm.segments[0].subtitleBlocks).toEqual(["新字幕1", "新字幕2"]);
    expect(w.vm.segments[0].subtitleTimeline).toEqual([]);
    w.unmount();
  });

  it("重新生成旁白成功提示 scene_audio_regenerated 并刷新分段", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoRegenerateSceneAudio.mockResolvedValue({
      code: 0,
      data: { projectId: "p1", segments: [{ id: "s1", text: "旁白", audioPath: "C:/a.mp3", status: "completed" }] },
    });
    const w = await createView();
    w.vm.projectId = "p1";
    w.vm.segments = [{ id: "s1", text: "旁白", status: "completed" }];
    await nextTick();
    await w.vm.regenerateSceneAudio("s1");
    await nextTick();
    expect(mocks.story2videoRegenerateSceneAudio).toHaveBeenCalledWith("p1", "s1");
    expect(w.vm.story2videoNotificationDialog.messageKey).toBe("story2video.scene_audio_regenerated");
    expect(w.vm.segments[0].audioPath).toBe("C:/a.mp3");
    w.unmount();
  });

  it("重新生成视频优化词成功提示 scene_prompt_regenerated 并刷新分段", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoRegenerateScenePrompt.mockResolvedValue({
      code: 0,
      data: { projectId: "p1", segments: [{ id: "s1", prompt: "新图词", videoPrompt: "新视频词", status: "completed" }] },
    });
    const w = await createView();
    w.vm.projectId = "p1";
    w.vm.segments = [{ id: "s1", prompt: "旧图词", videoPrompt: "旧视频词", status: "completed" }];
    await nextTick();
    await w.vm.regenerateScenePrompt("s1", "video");
    await nextTick();
    expect(mocks.story2videoRegenerateScenePrompt).toHaveBeenCalledWith("p1", "s1", "video");
    expect(w.vm.story2videoNotificationDialog.messageKey).toBe("story2video.scene_prompt_regenerated");
    expect(w.vm.segments[0].videoPrompt).toBe("新视频词");
    w.unmount();
  });

  it("重新生成字幕失败提示 scene_subtitle_regenerate_failed", async () => {
    const mocks = await import("@/api/publisher");
    mocks.story2videoRegenerateSceneSubtitle.mockRejectedValue(new Error("无法重新生成字幕"));
    const w = await createView();
    w.vm.projectId = "p1";
    w.vm.segments = [{ id: "s1", text: "旧字幕", status: "completed" }];
    await nextTick();
    await w.vm.regenerateSceneSubtitle("s1");
    await nextTick();
    expect(w.vm.story2videoNotificationDialog.messageKey).toBe("story2video.scene_subtitle_regenerate_failed");
    w.unmount();
  });
});
