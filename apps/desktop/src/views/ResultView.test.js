import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createRouter, createWebHistory } from "vue-router";

vi.mock("@/api/publisher", () => ({
  story2videoExportZip: vi.fn(),
  story2videoCreateShareUrl: vi.fn(),
  story2videoCopyPath: vi.fn(),
  story2videoShowInFolder: vi.fn(),
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

  it("handleError sets error message", async () => {
    const w = await createView();
    w.vm.handleError();
    expect(w.vm.error).toBeTruthy();
  });

  it("download creates download link and clicks it", async () => {
    const w = await createView();
    w.vm.videoPath = "/videos/test.mp4";
    w.vm.videoSrc = "file:///videos/test.mp4";

    const createElementSpy = vi.spyOn(document, "createElement");
    const clickSpy = vi.fn();
    createElementSpy.mockReturnValue({ href: "", download: "", click: clickSpy });

    w.vm.download();
    // Verify download() triggered createElement("a")
    const aCalls = createElementSpy.mock.calls.filter(c => c[0] === "a");
    expect(aCalls.length).toBeGreaterThanOrEqual(1);
    expect(clickSpy).toHaveBeenCalled();
    createElementSpy.mockRestore();
  });

  it("download does nothing without videoPath", async () => {
    const w = await createView();
    w.vm.videoPath = null;
    // Should not throw and should return early
    expect(() => w.vm.download()).not.toThrow();
  });

  it("shows error banner when error is set", async () => {
    const w = await createView();
    w.vm.error = "Video not found";
    await nextTick();
    expect(w.text()).toContain("Video not found");
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

  it("项目含离线降级素材时明确提示，避免把占位图或静音当作真实 AI 产物", async () => {
    const w = await createView();
    w.vm.videoPath = "C:/project/video.mp4";
    w.vm.segments = [{
      id: "segment-0",
      imageMeta: { source: "ffmpeg-placeholder", degraded: true },
      audioMeta: { source: "edge-tts", degraded: false },
    }];
    await nextTick();

    expect(w.find(".asset-warning").text()).toMatch(/离线降级素材/);
    w.unmount();
  });
});
