import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

vi.mock("element-plus", () => ({
  ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue(undefined) },
}));

const pushSpy = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: pushSpy })
}));


function mountCollection(options) {
  return mount(CollectionView, {
    global: { mocks: { $t: (key) => key } },
    ...options,
  });
}

import CollectionView from "./Collection.vue";

describe("CollectionView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {};
  });

  it("renders page title and buttons", async () => {
    const w = mountCollection();
    await nextTick();
    expect(w.text()).toContain("collection.tabCollect");
    expect(w.text()).toContain("新建草稿");
  });

  it("loadDrafts reads from electronAPI on mount", async () => {
    window.electronAPI = {
      storeGetSetting: vi.fn().mockResolvedValue(JSON.stringify([
        { id: "d1", title: "Saved", content: "hello", source: "manual", created_at: "2026-07-05" }
      ]))
    };
    const w = mountCollection();
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(window.electronAPI.storeGetSetting).toHaveBeenCalledWith("drafts");
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].title).toBe("Saved");
  });

  it("loadDrafts handles missing API gracefully", async () => {
    window.electronAPI = {};
    const w = mountCollection();
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.vm.drafts).toEqual([]);
  });

  it("loadDrafts handles JSON parse failure", async () => {
    window.electronAPI = {
      storeGetSetting: vi.fn().mockResolvedValue("invalid json{{{")
    };
    const w = mountCollection();
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.vm.drafts).toEqual([]);
  });

  it("saveDrafts calls electronAPI.storeSetSetting", async () => {
    window.electronAPI = {
      storeSetSetting: vi.fn().mockResolvedValue(undefined)
    };
    const w = mountCollection();
    await nextTick();
    w.vm.drafts = [{ id: "d1", title: "Test" }];
    await w.vm.saveDrafts();
    expect(window.electronAPI.storeSetSetting).toHaveBeenCalledWith("drafts", JSON.stringify([{ id: "d1", title: "Test" }]));
  });

  it("saveDrafts handles missing API gracefully", async () => {
    window.electronAPI = {};
    const w = mountCollection();
    await nextTick();
    w.vm.drafts = [{ id: "d1" }];
    await w.vm.saveDrafts();
    expect(w.vm.drafts.length).toBe(1);
  });

  it("creates a new draft and navigates", async () => {
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mountCollection();
    await nextTick();
    w.vm.createDraft();
    await nextTick();
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].source).toBe("manual");
    expect(pushSpy).toHaveBeenCalledWith("/publish?draft=" + w.vm.drafts[0].id);
  });

  it("imports from clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: vi.fn().mockResolvedValue("Title line\nContent here") },
      writable: true, configurable: true
    });
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mountCollection();
    await nextTick();
    await w.vm.importFromClipboard();
    await nextTick();
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].title).toBe("Title line");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
  });

  it("handles clipboard read failure", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: vi.fn().mockRejectedValue(new Error("denied")) },
      writable: true, configurable: true
    });
    const w = mountCollection();
    await nextTick();
    await w.vm.importFromClipboard();
    await nextTick();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalled();
  });

  it("handles empty clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: vi.fn().mockResolvedValue("") },
      writable: true, configurable: true
    });
    const w = mountCollection();
    await nextTick();
    await w.vm.importFromClipboard();
    await nextTick();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.warning).toHaveBeenCalled();
  });

  it("openCollection opens webview tab when API available", async () => {
    window.electronAPI = {
      webviewOpenTab: vi.fn().mockResolvedValue(undefined)
    };
    const w = mountCollection();
    await nextTick();
    await w.vm.openCollection("weibo");
    expect(window.electronAPI.webviewOpenTab).toHaveBeenCalledWith({ platform: "weibo" });
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
  });

  it("openCollection shows info when no webview API", async () => {
    window.electronAPI = {};
    const w = mountCollection();
    await nextTick();
    await w.vm.openCollection("zhihu");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.info).toHaveBeenCalled();
  });

  it("editDraft navigates to publish", async () => {
    const w = mountCollection();
    await nextTick();
    await w.vm.editDraft({ id: "d1" });
    expect(pushSpy).toHaveBeenCalledWith("/publish?draft=d1");
  });

  it("goPublish navigates to publish", async () => {
    const w = mountCollection();
    await nextTick();
    await w.vm.goPublish({ id: "d2" });
    expect(pushSpy).toHaveBeenCalledWith("/publish?draft=d2");
  });

  it("deleteDraft confirms and removes draft", async () => {
    const { ElMessageBox } = await import("element-plus");
    ElMessageBox.confirm.mockResolvedValue(undefined);
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mountCollection();
    await nextTick();
    w.vm.drafts = [{ id: "d1" }, { id: "d2" }];
    await w.vm.deleteDraft({ id: "d1" });
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].id).toBe("d2");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
  });

  it("deleteDraft does nothing on cancel", async () => {
    const { ElMessageBox } = await import("element-plus");
    ElMessageBox.confirm.mockRejectedValue(new Error("canceled"));
    const w = mountCollection();
    await nextTick();
    w.vm.drafts = [{ id: "d1" }];
    await w.vm.deleteDraft({ id: "d1" });
    expect(w.vm.drafts.length).toBe(1);
  });

  it("collectUrl warns if no urlCollectFetch API", async () => {
    window.electronAPI = {};
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com";
    await w.vm.collectUrl();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.warning).toHaveBeenCalled();
  });

  it("collectUrl warns if URL is empty", async () => {
    window.electronAPI = {
      urlCollectFetch: vi.fn()
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "";
    await w.vm.collectUrl();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.warning).toHaveBeenCalled();
  });

  it("collectUrl succeeds with API", async () => {
    window.electronAPI = {
      urlCollectFetch: vi.fn().mockResolvedValue({ code: 0, data: { title: "Article", description: "Desc", coverImage: "img.jpg" } })
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com/article";
    await w.vm.collectUrl();
    expect(window.electronAPI.urlCollectFetch).toHaveBeenCalledWith("https://example.com/article");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
    expect(w.vm.collectedResult).toBeTruthy();
    expect(w.vm.collectedResult.title).toBe("Article");
  });

  it("collectUrl shows error on API failure", async () => {
    window.electronAPI = {
      urlCollectFetch: vi.fn().mockResolvedValue({ code: 1, message: "collection failed" })
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com/fail";
    await w.vm.collectUrl();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalledWith("collection failed");
  });

  it("collectUrl 反爬安全验证页 → 回退 urlCollectFetch 而非误报成功", async () => {
    window.electronAPI = {
      aggregationCollect: vi.fn().mockResolvedValue({
        title: "百度安全验证",
        content: "网络不给力，请稍后重试",
        word_count: 0,
      }),
      urlCollectFetch: vi.fn().mockResolvedValue({
        code: 0,
        data: { title: "真实文章标题", content: "真实正文内容" },
      }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://baijiahao.baidu.com/s?id=123";
    await w.vm.collectUrl();
    // 不应把「百度安全验证」当成功结果，而应回退到 Node 端 stealth 采集
    expect(window.electronAPI.urlCollectFetch).toHaveBeenCalledWith("https://baijiahao.baidu.com/s?id=123");
    expect(w.vm.collectedResult).toBeTruthy();
    expect(w.vm.collectedResult.title).toBe("真实文章标题");
  });

  it("collectUrl catches exception", async () => {
    window.electronAPI = {
      urlCollectFetch: vi.fn().mockRejectedValue(new Error("network error"))
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com/error";
    await w.vm.collectUrl();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalled();
  });

  it("collectUrl 抖音链接 → 走 aggregationCollectVideo 视频通道", async () => {
    window.electronAPI = {
      aggregationCollect: vi.fn(),
      aggregationCollectVideo: vi.fn().mockResolvedValue({
        title: "抖音测试视频",
        content: "这是口播文案",
        transcript: "这是口播文案",
        word_count: 6,
        media_type: "video",
        video_url: "https://v.douyin.com/abc/",
        duration: 125.5,
        metadata: { platform: "douyin", asr_engine: "faster_whisper" },
      }),
      storeSetSetting: vi.fn(),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://v.douyin.com/abc123/";
    await w.vm.collectUrl();
    expect(window.electronAPI.aggregationCollectVideo).toHaveBeenCalledWith({ url: "https://v.douyin.com/abc123/" });
    expect(window.electronAPI.aggregationCollect).not.toHaveBeenCalled();
    expect(w.vm.collectedResult).toBeTruthy();
    expect(w.vm.collectedResult.mediaType).toBe("video");
    expect(w.vm.collectedResult.content).toBe("这是口播文案");
    expect(w.vm.collectedResult.duration).toBe(125.5);
    expect(w.vm.collectedResult.platform).toBe("douyin");
    expect(w.vm.collectedItems.length).toBe(1);
  });

  it("collectUrl 小红书链接 → 走视频通道", async () => {
    window.electronAPI = {
      aggregationCollectVideo: vi.fn().mockResolvedValue({
        title: "小红书视频", content: "文案", transcript: "文案", word_count: 2,
        media_type: "video", duration: 60, metadata: { platform: "xiaohongshu" },
      }),
      storeSetSetting: vi.fn(),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://xhslink.com/xyz";
    await w.vm.collectUrl();
    expect(window.electronAPI.aggregationCollectVideo).toHaveBeenCalledWith({ url: "https://xhslink.com/xyz" });
  });

  it("collectUrl 普通网页链接 → 不走视频通道（回归保护）", async () => {
    window.electronAPI = {
      aggregationCollect: vi.fn().mockResolvedValue({ title: "文章", content: "正文", word_count: 2 }),
      aggregationCollectVideo: vi.fn(),
      storeSetSetting: vi.fn(),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://www.zhihu.com/question/123";
    await w.vm.collectUrl();
    expect(window.electronAPI.aggregationCollectVideo).not.toHaveBeenCalled();
    expect(window.electronAPI.aggregationCollect).toHaveBeenCalled();
  });

  it("collectUrl 视频通道失败（-6 引擎不可用）→ 显示错误不回退图文", async () => {
    window.electronAPI = {
      aggregationCollect: vi.fn(),
      aggregationCollectVideo: vi.fn().mockResolvedValue({
        code: -6, message: "语音转写引擎不可用，请安装 faster-whisper：pip install faster-whisper",
      }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://v.douyin.com/abc/";
    await w.vm.collectUrl();
    expect(window.electronAPI.aggregationCollect).not.toHaveBeenCalled();
    expect(w.vm.collectError).toBeTruthy();
    expect(w.vm.collectError.code).toBe(-6);
    expect(w.vm.collectError.message).toContain("faster-whisper");
  });

  it("collectUrl 视频通道失败（-8 无音轨）→ 显示错误", async () => {
    window.electronAPI = {
      aggregationCollectVideo: vi.fn().mockResolvedValue({ code: -8, message: "该视频无音轨，无法进行语音转写" }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://www.xiaohongshu.com/explore/x";
    await w.vm.collectUrl();
    expect(w.vm.collectError.code).toBe(-8);
    expect(w.vm.collectError.message).toContain("无音轨");
  });

  it("collectUrl 视频通道不可用 → 提示且不回退图文采集", async () => {
    window.electronAPI = {
      aggregationCollect: vi.fn(),
      urlCollectFetch: vi.fn(),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://v.douyin.com/abc/";
    await w.vm.collectUrl();
    expect(window.electronAPI.aggregationCollect).not.toHaveBeenCalled();
    expect(window.electronAPI.urlCollectFetch).not.toHaveBeenCalled();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.warning).toHaveBeenCalled();
  });

  it("isVideoPlatformUrl 域名检测", async () => {
    const w = mountCollection();
    expect(w.vm.isVideoPlatformUrl("https://v.douyin.com/abc/")).toBe(true);
    expect(w.vm.isVideoPlatformUrl("https://www.douyin.com/video/730")).toBe(true);
    expect(w.vm.isVideoPlatformUrl("https://www.xiaohongshu.com/explore/x")).toBe(true);
    expect(w.vm.isVideoPlatformUrl("https://xhslink.com/x")).toBe(true);
    expect(w.vm.isVideoPlatformUrl("https://www.zhihu.com/question/1")).toBe(false);
    expect(w.vm.isVideoPlatformUrl("https://example.com")).toBe(false);
    expect(w.vm.isVideoPlatformUrl("not a url")).toBe(false);
  });

  it("collectAndRewrite 抖音链接 → 走视频通道并用转写文案改写", async () => {
    window.electronAPI = {
      aggregationCollect: vi.fn(),
      aggregationCollectVideo: vi.fn().mockResolvedValue({
        title: "抖音视频", content: "转写文案内容足够长可以改写", transcript: "转写文案内容足够长可以改写",
        word_count: 13, media_type: "video", duration: 90, metadata: { platform: "douyin" },
      }),
      aggregationRewrite: vi.fn().mockResolvedValue({ result_content: "改写后的文案", word_count: 7 }),
      storeSetSetting: vi.fn(),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://v.douyin.com/abc/";
    await w.vm.collectAndRewrite();
    expect(window.electronAPI.aggregationCollectVideo).toHaveBeenCalledWith({ url: "https://v.douyin.com/abc/" });
    expect(window.electronAPI.aggregationCollect).not.toHaveBeenCalled();
    expect(window.electronAPI.aggregationRewrite).toHaveBeenCalledWith(
      expect.objectContaining({ content: "转写文案内容足够长可以改写" })
    );
    expect(w.vm.collectedResult.mediaType).toBe("video");
    expect(w.vm.rewriteResult).toBe("改写后的文案");
  });

  it("formatVideoDuration 时长格式化", async () => {
    const w = mountCollection();
    expect(w.vm.formatVideoDuration(0)).toBe("");
    expect(w.vm.formatVideoDuration(65)).toBe("1:05");
    expect(w.vm.formatVideoDuration(185)).toBe("3:05");  });

  it("collectUrl 失败时错误横幅显示细分文案（安全验证类）", async () => {
    window.electronAPI = {
      aggregationCollect: vi.fn().mockResolvedValue({ code: -99, message: "URL 触发安全验证，请尝试在浏览器环境采集" }),
      urlCollectFetch: vi.fn().mockResolvedValue({ code: 1, message: "采集失败: 目标页面触发了安全验证" }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://zhuanlan.zhihu.com/p/123";
    await w.vm.collectUrl();
    // 错误横幅应显示 security_challenge 细分文案（含建议），而非笼统「采集失败」
    expect(w.vm.collectErrorDetail).toContain("安全验证");
    expect(w.vm.collectErrorRetryable).toBe(true);
  });

  it("collectUrl 失败时错误横幅显示细分文案（超时类）", async () => {
    window.electronAPI = {
      aggregationCollect: vi.fn().mockResolvedValue({ code: -1, message: "请求超时，请稍后重试" }),
      urlCollectFetch: vi.fn().mockResolvedValue({ code: 1, message: "采集失败: timeout of 30000ms exceeded" }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com/slow";
    await w.vm.collectUrl();
    expect(w.vm.collectErrorDetail).toContain("超时");
    expect(w.vm.collectErrorRetryable).toBe(true);
  });

  it("collectUrl 失败时输入类错误不显示重试按钮", async () => {
    window.electronAPI = {
      aggregationCollect: vi.fn().mockResolvedValue({ code: -99, message: "URL 格式不正确" }),
      urlCollectFetch: vi.fn().mockResolvedValue({ code: 1, message: "无效的 URL" }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "not-a-url";
    await w.vm.collectUrl();
    expect(w.vm.collectErrorDetail).toContain("链接格式无效");
    expect(w.vm.collectErrorRetryable).toBe(false);
  });

  // ── 视频采集错误细分提示（回归：具体提示曾被 unknown 通用文案吞掉） ──

  it("视频 >10 分钟拒绝 → 显示「视频过长（含实际时长）+ 上限」而非通用失败", async () => {
    window.electronAPI = {
      aggregationCollectVideo: vi.fn().mockResolvedValue({
        code: -422, status: 422,
        message: "VIDEOCLONE_FILE_TOO_LARGE: 视频过长（15:32），采集仅支持 10 分钟内的短视频",
      }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://v.douyin.com/too-long/";
    await w.vm.collectUrl();
    expect(w.vm.collectErrorDetail).toContain("视频过长");
    expect(w.vm.collectErrorDetail).toContain("15:32");
    expect(w.vm.collectErrorDetail).toContain("10 分钟");
    expect(w.vm.collectErrorRetryable).toBe(false);
  });

  it("视频无音轨 → 显示「无音轨，无法转写」提示", async () => {
    window.electronAPI = {
      aggregationCollectVideo: vi.fn().mockResolvedValue({
        code: -422, status: 422,
        message: "-8: 该视频无音轨，无法进行语音转写",
      }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://v.douyin.com/no-audio/";
    await w.vm.collectUrl();
    expect(w.vm.collectErrorDetail).toContain("无音轨");
    expect(w.vm.collectErrorRetryable).toBe(false);
  });

  it("ASR 引擎缺失 → 显示安装指引（pip install faster-whisper）", async () => {
    window.electronAPI = {
      aggregationCollectVideo: vi.fn().mockResolvedValue({
        code: -422, status: 422,
        message: "-6: 语音转写引擎不可用，请安装 faster-whisper：pip install faster-whisper（国内可设 HF_ENDPOINT=https://hf-mirror.com）",
      }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://v.douyin.com/abc/";
    await w.vm.collectUrl();
    expect(w.vm.collectErrorDetail).toContain("pip install faster-whisper");
    expect(w.vm.collectErrorRetryable).toBe(false);
  });

  it("转写超时 → 显示「转写超时 + 建议较短视频」且可重试", async () => {
    window.electronAPI = {
      aggregationCollectVideo: vi.fn().mockResolvedValue({
        code: -422, status: 422,
        message: "-7: 转写超时（300 秒），请尝试较短的短视频",
      }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://v.douyin.com/slow/";
    await w.vm.collectUrl();
    expect(w.vm.collectErrorDetail).toContain("转写超时");
    expect(w.vm.collectErrorDetail).toContain("较短的短视频");
    expect(w.vm.collectErrorRetryable).toBe(true);
  });

  it("creates draft from collected result", async () => {
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mountCollection();
    await nextTick();
    w.vm.collectedResult = { title: "Article", content: "Content", coverImage: "img.jpg", source: "url" };
    w.vm.linkUrl = "https://example.com/article";
    await w.vm.createFromCollected();
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].title).toBe("Article");
    expect(w.vm.drafts[0].content).toBe("Content");
    expect(w.vm.drafts[0].coverImage).toBe("img.jpg");
    expect(w.vm.collectedResult).toBeNull();
    expect(w.vm.linkUrl).toBe("");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalled();
  });

  it("createFromCollected does nothing if no collected result", async () => {
    const w = mountCollection();
    await nextTick();
    w.vm.collectedResult = null;
    w.vm.drafts = [];
    await w.vm.createFromCollected();
    expect(w.vm.drafts.length).toBe(0);
  });

  it("shows empty state when no drafts", async () => {
    const w = mountCollection();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.text()).toContain("暂无草稿");
  });

  it("shows drafts list", async () => {
    const w = mountCollection();
    await nextTick();
    w.vm.drafts = [{ id: "d1", title: "Saved Draft", content: "hello", source: "manual", created_at: "2026-07-05" }];
    await nextTick();
    expect(w.text()).toContain("Saved Draft");
  });

  it("collectedItems accumulates after collectUrl", async () => {
    window.electronAPI = {
      urlCollectFetch: vi.fn().mockResolvedValue({ code: 0, data: { title: "A1", content: "c1" } }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com/1";
    await w.vm.collectUrl();
    expect(w.vm.collectedItems.length).toBe(1);
    expect(w.vm.collectedItems[0].title).toBe("A1");
    w.vm.linkUrl = "https://example.com/2";
    await w.vm.collectUrl();
    expect(w.vm.collectedItems.length).toBe(2);
    expect(w.vm.collectedItems[0].title).toBe("A1"); // newest first
    expect(w.vm.collectedItems[0].id).toBeDefined();
  });

  it("createFromItem creates draft from list item", async () => {
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mountCollection();
    await nextTick();
    w.vm.drafts = [];
    const item = { id: "abc", title: "From List", content: "list content", source: "rss", sourceUrl: "https://ex.com" };
    await w.vm.createFromItem(item);
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].title).toBe("From List");
    expect(w.vm.drafts[0].source).toBe("rss");
    expect(pushSpy).toHaveBeenCalled();
  });

  it("sendItemToPipeline navigates to create", async () => {
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mountCollection();
    await nextTick();
    const item = { id: "abc", title: "Pipeline Item", content: "content", source: "url" };
    await w.vm.sendItemToPipeline(item);
    expect(w.vm.drafts.length).toBe(1);
    expect(pushSpy).toHaveBeenCalledWith(expect.stringContaining("/create?draft="));
  });

  it("goPublishFromItem navigates to publish", async () => {
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mountCollection();
    await nextTick();
    const item = { id: "abc", title: "Publish Item", content: "content", source: "url" };
    await w.vm.goPublishFromItem(item);
    expect(w.vm.drafts.length).toBe(1);
    expect(pushSpy).toHaveBeenCalledWith(expect.stringContaining("/publish?draft="));
  });

  it("collectedItems list renders in template", async () => {
    const w = mountCollection();
    await nextTick();
    w.vm.collectedItems = [
      { id: "i1", title: "Item 1", content: "c1", source: "url", wordCount: 100 },
      { id: "i2", title: "Item 2", content: "c2", source: "rss", wordCount: 200 },
    ];
    await nextTick();
    expect(w.text()).toContain("采集结果（2 篇）");
    expect(w.text()).toContain("Item 1");
    expect(w.text()).toContain("Item 2");
    expect(w.text()).toContain("视频创作");
    expect(w.text()).toContain("发布");
  });

  it("clear button removes collectedItems", async () => {
    const w = mountCollection();
    await nextTick();
    w.vm.collectedItems = [{ id: "i1", title: "Item", content: "c", source: "url" }];
    w.vm.collectedResult = { id: "i1", title: "Item" };
    await nextTick();
    expect(w.vm.collectedItems.length).toBe(1);
    // Click clear button
    const btn = w.find(".cohere-section-title button");
    await btn.trigger("click");
    expect(w.vm.collectedItems.length).toBe(0);
    expect(w.vm.collectedResult).toBeNull();
  });

  it("renders one-click rewrite button", async () => {
    const w = mountCollection();
    await nextTick();
    expect(w.text()).toContain("oneClickRewrite");
  });

  it("collectAndRewrite warns if URL is empty", async () => {
    window.electronAPI = {
      aggregationCollect: vi.fn(),
      aggregationRewrite: vi.fn(),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "";
    await w.vm.collectAndRewrite();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.warning).toHaveBeenCalled();
    expect(window.electronAPI.aggregationCollect).not.toHaveBeenCalled();
  });

  it("collectAndRewrite warns if aggregation API unavailable", async () => {
    window.electronAPI = {};
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com/article";
    await w.vm.collectAndRewrite();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.warning).toHaveBeenCalled();
  });

  it("collectAndRewrite collects and rewrites in one action", async () => {
    window.electronAPI = {
      aggregationCollect: vi.fn().mockResolvedValue({
        title: "原始文章标题",
        content: "这是采集到的原文内容，长度超过二十个字，用于测试一键改写流程。",
        word_count: 30,
      }),
      aggregationRewrite: vi.fn().mockResolvedValue({
        result_content: "这是改写后的内容，与原文不同。",
        word_count: 15,
      }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com/article";
    await w.vm.collectAndRewrite();
    expect(window.electronAPI.aggregationCollect).toHaveBeenCalledWith({
      url: "https://example.com/article",
      source_type: "url",
      rewrite: false,
    });
    expect(window.electronAPI.aggregationRewrite).toHaveBeenCalledWith({
      content: "这是采集到的原文内容，长度超过二十个字，用于测试一键改写流程。",
      style: "轻松易懂",
      length: "keep",
    });
    expect(w.vm.collectedResult).toBeTruthy();
    expect(w.vm.collectedResult.content).toContain("这是采集到的原文内容");
    expect(w.vm.rewriteResult).toBe("这是改写后的内容，与原文不同。");
    expect(w.vm.collectedItems.length).toBe(1);
    expect(w.vm.oneClickRewriting).toBe(false);
    expect(w.vm.collecting).toBe(false);
  });

  it("collectAndRewrite keeps original content when rewrite fails", async () => {
    window.electronAPI = {
      aggregationCollect: vi.fn().mockResolvedValue({
        title: "原始文章标题",
        content: "这是采集到的原文内容，长度超过二十个字，用于测试一键改写流程。",
        word_count: 30,
      }),
      aggregationRewrite: vi.fn().mockResolvedValue({ code: -99, message: "改写服务不可用" }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com/article";
    await w.vm.collectAndRewrite();
    expect(w.vm.collectedResult).toBeTruthy();
    expect(w.vm.collectedResult.content).toContain("这是采集到的原文内容");
    expect(w.vm.rewriteResult).toBe("");
    expect(w.vm.rewriteError).toBeTruthy();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
    expect(ElMessage.error).toHaveBeenCalled();
  });

  it("collectAndRewrite falls back to urlCollectFetch", async () => {
    window.electronAPI = {
      aggregationCollect: vi.fn().mockResolvedValue({ code: -4, message: "CONTENT_UNEXTRACTABLE" }),
      aggregationRewrite: vi.fn().mockResolvedValue({
        result_content: "回退采集后改写成功。",
      }),
      urlCollectFetch: vi.fn().mockResolvedValue({
        code: 0,
        data: { title: "回退标题", content: "回退采集到的正文内容，长度超过二十个字。", coverImage: "" },
      }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com/article";
    await w.vm.collectAndRewrite();
    expect(window.electronAPI.urlCollectFetch).toHaveBeenCalledWith("https://example.com/article");
    expect(w.vm.collectedResult.title).toBe("回退标题");
    expect(w.vm.rewriteResult).toBe("回退采集后改写成功。");
  });

  it("rewriteCollected no longer overwrites original content", async () => {
    window.electronAPI = {
      aggregationRewrite: vi.fn().mockResolvedValue({
        result_content: "改写后的内容。",
      }),
    };
    const w = mountCollection();
    await nextTick();
    w.vm.collectedResult = { title: "T", content: "原始正文内容，长度超过二十个字用于测试。", description: "" };
    await w.vm.rewriteCollected();
    expect(w.vm.collectedResult.content).toBe("原始正文内容，长度超过二十个字用于测试。");
    expect(w.vm.rewriteResult).toBe("改写后的内容。");
  });

  it("clearResult resets collectedResult and rewriteResult", async () => {
    const w = mountCollection();
    await nextTick();
    w.vm.collectedResult = { id: "i1", title: "T", content: "C" };
    w.vm.rewriteResult = "R";
    w.vm.rewriteError = { code: -99, message: "e" };
    w.vm.collectError = { code: -99, message: "e" };
    w.vm.clearResult();
    expect(w.vm.collectedResult).toBeNull();
    expect(w.vm.rewriteResult).toBe("");
    expect(w.vm.rewriteError).toBeNull();
    expect(w.vm.collectError).toBeNull();
  });

  it("renders collection tabs and switches to records tab", async () => {
    const w = mountCollection();
    await nextTick();
    expect(w.text()).toContain("collection.tabCollect");
    expect(w.text()).toContain("collection.tabRecords");
    // 默认在采集 tab
    expect(w.vm.activeTab).toBe("collect");
    // 切换到采集记录 tab
    await w.vm.switchTab("records");
    await nextTick();
    expect(w.vm.activeTab).toBe("records");
    expect(w.text()).toContain("collection.recordsEmptyTitle");
  });

  it("switchTab ignores invalid tab", async () => {
    const w = mountCollection();
    await nextTick();
    await w.vm.switchTab("invalid");
    expect(w.vm.activeTab).toBe("collect");
  });

  it("loadCollectedItems reads persisted records on mount", async () => {
    window.electronAPI = {
      storeGetSetting: vi.fn().mockImplementation(async (key) => {
        if (key === "collected_items") return JSON.stringify([
          { id: "c1", title: "Record A", content: "hello", source: "url" }
        ]);
        return null;
      })
    };
    const w = mountCollection();
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.vm.collectedItems.length).toBe(1);
    expect(w.vm.collectedItems[0].title).toBe("Record A");
  });

  it("loadCollectedItems handles parse failure", async () => {
    window.electronAPI = {
      storeGetSetting: vi.fn().mockImplementation(async (key) => {
        if (key === "collected_items") return "not-json{{{";
        return null;
      })
    };
    const w = mountCollection();
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.vm.collectedItems).toEqual([]);
  });

  it("openRecordForEdit creates draft and navigates to publish", async () => {
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mountCollection();
    await nextTick();
    w.vm.drafts = [];
    const item = { id: "rec1", title: "Record Title", content: "record content", source: "rss", sourceUrl: "https://ex.com" };
    await w.vm.openRecordForEdit(item);
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].title).toBe("Record Title");
    expect(pushSpy).toHaveBeenCalledWith("/publish?draft=" + w.vm.drafts[0].id);
  });

  it("openRecordForEdit does nothing for invalid item", async () => {
    const w = mountCollection();
    await nextTick();
    w.vm.drafts = [];
    await w.vm.openRecordForEdit(null);
    expect(w.vm.drafts.length).toBe(0);
  });

  it("deleteRecord confirms and removes record", async () => {
    const { ElMessageBox } = await import("element-plus");
    ElMessageBox.confirm.mockResolvedValue(undefined);
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mountCollection();
    await nextTick();
    w.vm.collectedItems = [{ id: "r1" }, { id: "r2" }];
    await w.vm.deleteRecord({ id: "r1" });
    expect(w.vm.collectedItems.length).toBe(1);
    expect(w.vm.collectedItems[0].id).toBe("r2");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
  });

  it("deleteRecord does nothing on cancel", async () => {
    const { ElMessageBox } = await import("element-plus");
    ElMessageBox.confirm.mockRejectedValue(new Error("canceled"));
    const w = mountCollection();
    await nextTick();
    w.vm.collectedItems = [{ id: "r1" }];
    await w.vm.deleteRecord({ id: "r1" });
    expect(w.vm.collectedItems.length).toBe(1);
  });

  it("clearAllRecords clears list after confirm", async () => {
    const { ElMessageBox } = await import("element-plus");
    ElMessageBox.confirm.mockResolvedValue(undefined);
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mountCollection();
    await nextTick();
    w.vm.collectedItems = [{ id: "r1" }, { id: "r2" }];
    w.vm.collectedResult = { id: "r1" };
    await w.vm.clearAllRecords();
    expect(w.vm.collectedItems.length).toBe(0);
    expect(w.vm.collectedResult).toBeNull();
  });

  it("collectUrl persists collected items to store", async () => {
    const storeSet = vi.fn().mockResolvedValue(undefined);
    window.electronAPI = {
      urlCollectFetch: vi.fn().mockResolvedValue({ code: 0, data: { title: "Persisted", content: "body" } }),
      storeSetSetting: storeSet,
    };
    const w = mountCollection();
    await nextTick();
    w.vm.linkUrl = "https://example.com/persist";
    await w.vm.collectUrl();
    expect(storeSet).toHaveBeenCalledWith("collected_items", expect.stringContaining("Persisted"));
  });
});
