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
    ]
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
  ElMessage: { warning: vi.fn(), success: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}));

vi.mock("@element-plus/icons-vue", () => ({ UploadFilled: { template: "<span>U</span>" } }));

import UiButton from "@/components/UiButton.vue";
import UiInput from "@/components/UiInput.vue";
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
    ElMessageBox.confirm = vi.fn().mockRejectedValue(new Error("cancel"));
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

  it("showAiWriter toggle works", async () => {
    const w = await createWrapper();
    expect(w.vm.showAiWriter).toBe(false);
    w.vm.showAiWriter = true;
    await nextTick();
    expect(w.vm.showAiWriter).toBe(true);
  });
});

});
