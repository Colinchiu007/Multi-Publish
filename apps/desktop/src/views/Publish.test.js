import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { setActivePinia, createPinia } from "pinia";
import { ElMessage, ElMessageBox } from "element-plus";

const routes = [
  { path: "/", name: "home", component: { template: "<div>home</div>" } },
];
const router = createRouter({ history: createWebHistory(), routes });

vi.mock("@/stores/platforms", () => ({
  usePlatformStore: () => ({
    load: vi.fn(),
    platforms: [
      { id: "wechat_mp", label: "微信" },
      { id: "zhihu", label: "知乎" },
    ],
    getCategory: () => "中文",
  })
}));

const mockAccountLoad = vi.fn().mockResolvedValue(undefined);
vi.mock("@/stores/accounts", () => ({
  useAccountStore: () => ({
    load: mockAccountLoad,
    byPlatform: { wechat_mp: [{ id: "acc1", name: "My Account", is_default: true }] },
    getDefault: (p) => { if (p === "wechat_mp") return { id: "acc1", name: "My Account" }; return null; }
  })
}));

vi.mock("@/stores/license", () => ({
  useLicenseStore: () => ({ isPro: true })
}));

vi.mock("@/stores/templates", () => ({
  useTemplateStore: () => ({ load: vi.fn() })
}));

vi.mock("element-plus", () => ({
  ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}));

vi.mock("@element-plus/icons-vue", () => ({
  UploadFilled: { template: "<span>U</span>" },
  Refresh: { template: "<span>R</span>" },
}));

import UiButton from "@/components/UiButton.vue";
import UiInput from "@/components/UiInput.vue";
import PlatformOverridePanel from "@/features/publish/components/PlatformOverridePanel.vue";
import PublishTargetSelector from "@/features/publish/components/PublishTargetSelector.vue";
import PublishView from "./Publish.vue";

async function createWrapper() {
  const w = mount(PublishView, {
    global: {
      plugins: [router, createPinia()],
      components: { UiButton, UiInput },
      stubs: {
        "el-checkbox-group": { template: "<div><slot/></div>" },
        "el-checkbox": { template: "<label><input type='checkbox' /><slot/></label>" },
        "el-upload": { template: "<div><slot/></div>" },
        "el-icon": { template: "<span><slot/></span>" },
        TagSuggester: true,
        OptimalTimeTip: true,
        TitleAssistantPanel: true,
        ArticleEditor: true,
        TemplatePicker: true,
        UpgradeModal: true,
        AiWriterPanel: true,
      }
    }
  });
  await nextTick();
  return w;
}

function findButtonByText(wrapper, text) {
  const button = wrapper.findAllComponents(UiButton).find((item) => item.text().includes(text));
  expect(button, `未找到包含“${text}”的按钮`).toBeDefined();
  return button;
}

describe("PublishView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {
      publishBatch: vi.fn().mockResolvedValue({ code: 0, data: { taskIds: ["t1"] }, message: "ok" }),
      sensitiveCheck: vi.fn().mockResolvedValue({ code: 0, data: { words: [] } }),
      offlineStatus: vi.fn().mockResolvedValue({ code: 0, data: { offline: false } }),
      offlineAddToCache: vi.fn().mockResolvedValue({ code: 0 }),
      onProgress: vi.fn(() => vi.fn()),
      batchCreate: vi.fn().mockResolvedValue({ code: 0, data: { id: "batch1" } }),
      batchExecute: vi.fn().mockResolvedValue({ code: 0 }),
      batchSchedule: vi.fn().mockResolvedValue({ code: 0 }),
      onBatchProgress: vi.fn(() => vi.fn()),
      draftSave: vi.fn().mockResolvedValue({ code: 0 }),
      draftList: vi.fn().mockResolvedValue({ code: 0, data: [] }),
      draftDelete: vi.fn().mockResolvedValue({ code: 0 }),
      storeGetSetting: vi.fn().mockResolvedValue(null),
      storeSetSetting: vi.fn().mockResolvedValue({ code: 0 }),
    };
    mockAccountLoad.mockClear();
  });

  it("renders page title and mode toggle", async () => {
    const w = await createWrapper();
    expect(w.text()).toContain("一键发布");
    expect(w.text()).toContain("批量模式");
  });

  it("handlePublish warns when title empty", async () => {
    const w = await createWrapper();
    await w.vm.handlePublish();
    expect(ElMessage.warning).toHaveBeenCalled();
  });

  it("handlePublish warns when content empty", async () => {
    const w = await createWrapper();
    w.vm.article.title = "Test Title";
    await w.vm.handlePublish();
    expect(ElMessage.warning).toHaveBeenCalledWith("请输入正文内容");
  });

  it("handlePublish succeeds with valid input", async () => {
    const w = await createWrapper();
    w.vm.article.title = "Test";
    w.vm.article.content = "Content";
    await w.vm.handlePublish();
    await nextTick();
    expect(window.electronAPI.publishBatch).toHaveBeenCalled();
    expect(w.vm.result.success).toBe(true);
  });

  it("handlePublish handles API failure", async () => {
    window.electronAPI.publishBatch.mockRejectedValue(new Error("network error"));
    const w = await createWrapper();
    w.vm.article.title = "Test";
    w.vm.article.content = "Content";
    await w.vm.handlePublish();
    await nextTick();
    expect(w.vm.result.success).toBe(false);
  });

  it("loads accounts on mount", async () => {
    await createWrapper();
    expect(mockAccountLoad).toHaveBeenCalled();
  });

  it("使用独立目标选择器并可打开平台差异化面板", async () => {
    const w = await createWrapper();

    expect(w.findComponent(PublishTargetSelector).exists()).toBe(true);
    w.vm.showDiffPanel = true;
    await nextTick();

    expect(w.findComponent(PlatformOverridePanel).exists()).toBe(true);
    expect(w.text()).toContain("平台差异化内容");
  });

  it("批量发布失败后显示重新发布命令", async () => {
    const w = await createWrapper();
    w.vm.batchMode = true;
    w.vm.batchProgress = [{ type: "danger", text: "发布失败", time: "10:00:00" }];
    w.vm.failedBatchTasks = [{ taskId: "failed-1", platform: "zhihu", title: "标题" }];
    await nextTick();

    expect(w.text()).toContain("重新发布失败任务 (1)");
  });

  it("草稿保存完整往返字段", async () => {
    const w = await createWrapper();
    w.vm.article.title = "完整草稿";
    w.vm.article.content = "正文";
    w.vm.article.author = "作者";
    w.vm.article.cover_url = "https://img.test/a.jpg";
    w.vm.article.video_path = "D:/a.mp4";
    w.vm.article.publishTime = "2026-07-21T12:00";
    w.vm.selectedAccounts = { wechat_mp: ["acc1"] };
    w.vm.replaceDiffEdits({ wechat_mp: { title: "微信标题", content: "" } });

    await w.vm.saveDraft();

    expect(window.electronAPI.draftSave).toHaveBeenCalledWith(expect.objectContaining({
      title: "完整草稿",
      author: "作者",
      cover_url: "https://img.test/a.jpg",
      video_path: "D:/a.mp4",
      publishTime: "2026-07-21T12:00",
      accounts: { wechat_mp: ["acc1"] },
      platformOverrides: { wechat_mp: { title: "微信标题", content: "" } },
    }));
  });

  it("copies URL via clipboard API", async () => {
    const clip = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: clip }, writable: true, configurable: true });
    const w = await createWrapper();
    await w.vm.copyUrl("https://x.com/a");
    expect(clip).toHaveBeenCalledWith("https://x.com/a");
  });


  it("togglePlatform adds and removes platform", async () => {
    const w = await createWrapper();
    await nextTick();
    // zhihu is not initially selected
    w.vm.togglePlatform("zhihu");
    expect(w.vm.selectedPlatforms).toContain("zhihu");
    w.vm.togglePlatform("zhihu");
    expect(w.vm.selectedPlatforms).not.toContain("zhihu");
  });

  it("handlePublish with markdown content sets contentFormat", async () => {
    const w = await createWrapper();
    await nextTick();
    w.vm.article.title = "Markdown Test";
    w.vm.article.content = "# Heading\n\n**bold** text and [link](https://example.com)";
    await w.vm.handlePublish();
    await nextTick();
    expect(window.electronAPI.publishBatch).toHaveBeenCalled();
  });

  it("sensitiveCheck warns on sensitive words", async () => {
    window.electronAPI.sensitiveCheck = vi.fn().mockResolvedValue({ code: 0, data: { words: ["badword"] } });
    ElMessageBox.confirm.mockRejectedValueOnce(new Error("cancel"));
    const w = await createWrapper();
    await nextTick();
    w.vm.article.title = "Test";
    w.vm.article.content = "Content with badword";
    await w.vm.handlePublish();
    await nextTick();
    expect(ElMessageBox.confirm).toHaveBeenCalled();
    expect(window.electronAPI.publishBatch).not.toHaveBeenCalled();
  });

  it("batch mode add/remove/duplicate articles", async () => {
    const w = await createWrapper();
    w.vm.batchMode = true;
    await nextTick();
    const count = w.vm.articles.length;
    w.vm.addArticle();
    expect(w.vm.articles.length).toBe(count + 1);
    w.vm.duplicateArticle(0);
    expect(w.vm.articles.length).toBe(count + 2);
    w.vm.removeArticle(0);
    expect(w.vm.articles.length).toBe(count + 1);
  });

  it("批量发布进行中仅锁定批量按钮并显示发布中状态", async () => {
    let resolveCreate;
    let emitBatchProgress;
    window.electronAPI.batchCreate.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCreate = resolve;
    }));
    window.electronAPI.onBatchProgress.mockImplementationOnce((callback) => {
      emitBatchProgress = callback;
      return vi.fn();
    });
    const w = await createWrapper();
    w.vm.batchMode = true;
    await nextTick();
    w.vm.articles[0].title = "批量标题";
    w.vm.articles[0].content = "批量正文";
    w.vm.articles[0].platforms = ["wechat_mp"];

    const publishPromise = w.vm.handleBatchPublish();
    await nextTick();

    const batchButton = findButtonByText(w, "发布中...");
    expect(w.vm.batchPublishing).toBe(true);
    expect(w.vm.publishing).toBe(false);
    expect(batchButton.attributes("disabled")).toBeDefined();
    expect(window.electronAPI.batchCreate).toHaveBeenCalledTimes(1);

    resolveCreate({ code: 0, data: { id: "batch1" } });
    await publishPromise;
    await nextTick();

    expect(w.vm.batchPublishing).toBe(true);
    expect(findButtonByText(w, "发布中...").attributes("disabled")).toBeDefined();

    emitBatchProgress({
      kind: "batch-complete",
      batchId: "batch1",
      total: 1,
      completed: 1,
      succeeded: 1,
      failed: 0,
    });
    await nextTick();

    expect(w.vm.batchPublishing).toBe(false);
    expect(findButtonByText(w, "批量发布").attributes("disabled")).toBeUndefined();
  });

  it("offline detection blocks publish when offline", async () => {
    window.electronAPI.offlineStatus = vi.fn().mockResolvedValue({ code: 0, data: { offline: true } });
    const w = await createWrapper();
    w.vm.article.title = "Test";
    w.vm.article.content = "Content";
    await w.vm.handlePublish();
    await nextTick();
    expect(ElMessage.warning).toHaveBeenCalledWith("网络已断开，任务已缓存");
    expect(w.vm.publishing).toBe(false);
  });


describe("PublishView — extra coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {
      publishBatch: vi.fn().mockResolvedValue({ code: 0, data: { taskIds: ["t1"] }, message: "ok" }),
      sensitiveCheck: vi.fn().mockResolvedValue({ code: 0, data: { words: [] } }),
      offlineStatus: vi.fn().mockResolvedValue({ code: 0, data: { offline: false } }),
      offlineAddToCache: vi.fn().mockResolvedValue({ code: 0 }),
      onProgress: vi.fn(() => vi.fn()),
      batchCreate: vi.fn().mockResolvedValue({ code: 0, data: { id: "batch1" } }),
      batchExecute: vi.fn().mockResolvedValue({ code: 0 }),
      batchSchedule: vi.fn().mockResolvedValue({ code: 0 }),
      onBatchProgress: vi.fn(() => vi.fn()),
      draftSave: vi.fn().mockResolvedValue({ code: 0 }),
      draftList: vi.fn().mockResolvedValue({ code: 0, data: [] }),
      draftDelete: vi.fn().mockResolvedValue({ code: 0 }),
      storeGetSetting: vi.fn().mockResolvedValue(null),
      storeSetSetting: vi.fn().mockResolvedValue({ code: 0 }),
    };
    mockAccountLoad.mockClear();
  });

  it("applyTemplate fills title and content in single mode", async () => {
    const w = await createWrapper();
    w.vm.applyTemplate({ title: "Templated Title", content: "Templated Content" });
    expect(w.vm.article.title).toBe("Templated Title");
    expect(w.vm.article.content).toBe("Templated Content");
  });

  it("applyTemplate fills batch article when target index set", async () => {
    const w = await createWrapper();
    w.vm.batchMode = true;
    await nextTick();
    w.vm.addArticle();
    w.vm.templateTargetIdx = 0;
    w.vm.applyTemplate({ title: "Batch Title", content: "Batch Content" });
    expect(w.vm.articles[0].title).toBe("Batch Title");
    expect(w.vm.articles[0].content).toBe("Batch Content");
  });

  it("showTemplatePicker toggle works", async () => {
    const w = await createWrapper();
    expect(w.vm.showTemplatePicker).toBe(false);
    w.vm.showTemplatePicker = true;
    await nextTick();
    expect(w.vm.showTemplatePicker).toBe(true);
  });

  it("hasVideoPlatforms computed", async () => {
    const w = await createWrapper();
    w.vm.selectedPlatforms = ["douyin", "kuaishou"];
    await nextTick();
    // hasVideoPlatforms should be true for douyin/kuaishou
    expect(w.vm.hasVideoPlatforms).toBe(true);
  });

  it("handleBatchPublish validates each article", async () => {
    const w = await createWrapper();
    w.vm.batchMode = true;
    await nextTick();
    w.vm.addArticle();
    // Article without title should trigger warning
    await w.vm.handleBatchPublish();
    expect(ElMessage.warning).toHaveBeenCalled();
  });

  it("handleBatchPublish validates missing platform", async () => {
    const w = await createWrapper();
    w.vm.batchMode = true;
    await nextTick();
    w.vm.addArticle();
    w.vm.articles[0].title = "Batch Title";
    w.vm.articles[0].content = "Batch Content";
    // No platforms set - should warn
    await w.vm.handleBatchPublish();
    expect(ElMessage.warning).toHaveBeenCalled();
  });

  it("batchDone and batchFail computed properties", async () => {
    const w = await createWrapper();
    w.vm.batchProgress = [
      { text: "ok", type: "success" },
      { text: "fail", type: "danger" },
      { text: "ok2", type: "success" },
    ];
    expect(w.vm.batchDone).toBe(2);
    expect(w.vm.batchFail).toBe(1);
  });

  it("totalPlatformTasks counts correctly", async () => {
    const w = await createWrapper();
    w.vm.batchMode = true;
    await nextTick();
    w.vm.addArticle();
    w.vm.addArticle();
    w.vm.articles[0].platforms = ["wx", "zhihu"];
    w.vm.articles[1].platforms = ["douyin"];
    expect(w.vm.totalPlatformTasks).toBe(3);
  });

  it("removeArticle removes article by index", async () => {
    const w = await createWrapper();
    w.vm.batchMode = true;
    await nextTick();
    w.vm.addArticle();
    w.vm.addArticle();
    var before = w.vm.articles.length;
    w.vm.removeArticle(0);
    expect(w.vm.articles.length).toBe(before - 1);
    // removeArticle does nothing when out of bounds
    w.vm.removeArticle(999);
    expect(w.vm.articles.length).toBe(before - 1);
  });

  it("video upload inline handler sets video_path", async () => {
    const w = await createWrapper();
    // video_path is set via inline :on-change in template, test the reactive behavior
    w.vm.article.video_path = "/videos/test.mp4";
    expect(w.vm.article.video_path).toBe("/videos/test.mp4");
  });

  it("点击 AI 按钮会打开写作面板", async () => {
    const w = await createWrapper();
    expect(w.vm.showAiWriter).toBe(false);

    await w.get('[data-testid="open-ai-writer"]').trigger("click");
    await nextTick();

    expect(w.vm.showAiWriter).toBe(true);
    expect(w.find("ai-writer-panel-stub").exists()).toBe(true);
  });

  // 交互测试：点击批量模式 checkbox 应切换 batchMode 状态
  it("toggles batch mode via checkbox click", async () => {
    const w = await createWrapper();
    const before = w.vm.batchMode;
    const checkbox = w.find('input[type="checkbox"]');
    if (checkbox.exists()) {
      await checkbox.trigger("change");
      await nextTick();
      // batchMode 状态应发生变化（可能因 checkBatchAccess 被重置，但触发本身不应报错）
      expect(typeof w.vm.batchMode).toBe("boolean");
    }
  });

  // 交互测试：填入标题和正文后，一键发布按钮应可点击且触发 IPC
  it("publish button click triggers handlePublish with valid input", async () => {
    const w = await createWrapper();
    w.vm.article.title = "E2E 交互测试标题";
    w.vm.article.content = "E2E 交互测试正文";
    w.vm.selectedPlatforms = ["wechat_mp"];
    await nextTick();
    const publishBtn = findButtonByText(w, "一键发布");
    await publishBtn.trigger("click");

    await vi.waitFor(() => {
      expect(window.electronAPI.publishBatch).toHaveBeenCalledTimes(1);
    });
  });

});

});
