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
      global: { plugins: [router], components: { UiButton } }
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

  it("handleError shows a localized modal", async () => {
    const w = await createView();
    w.vm.handleError();
    expect(w.vm.story2videoNotificationDialog).toEqual({
      visible: true,
      messageKey: "story2video.operation_failed",
      messageParams: {},
    });
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

  it("重新合成后无法加载预览时不显示成功提示", async () => {
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
      messageKey: "story2video.operation_failed",
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
});
