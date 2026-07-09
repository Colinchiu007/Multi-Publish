import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";
import { ElMessage } from "element-plus";

const pushSpy = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: pushSpy }),
  useRoute: () => ({ query: {} }),
}));

vi.mock("@/stores/platforms", () => ({
  usePlatformStore: () => ({
    load: vi.fn(),
    platforms: [{ id: "wechat_mp", label: "微信" }, { id: "zhihu", label: "知乎" }],
    getLabel: (k) => ({ wechat_mp: "微信", zhihu: "知乎" }[k] || k),
    getIcon: () => "ἱ0",
  })
}));

vi.mock("@/stores/accounts", () => ({
  useAccountStore: () => ({ load: vi.fn(), accounts: [], byPlatform: {}, getDefault: () => null })
}));

vi.mock("@/stores/license", () => ({
  useLicenseStore: () => ({ isPro: true })
}));

vi.mock("@/stores/templates", () => ({
  useTemplateStore: () => ({ load: vi.fn() })
}));

vi.mock("element-plus", () => ({
  ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}));

vi.mock("@element-plus/icons-vue", () => ({ UploadFilled: { template: "<span>U</span>" } }));

vi.mock("@/api/publisher", () => ({
  renderStart: vi.fn(),
  renderCancel: vi.fn(),
  renderGetStatus: vi.fn().mockResolvedValue({ ready: true }),
  renderInstallDeps: vi.fn(),
  onRenderProgress: vi.fn(() => vi.fn()),
  onRenderComplete: vi.fn(() => vi.fn()),
  onRenderError: vi.fn(() => vi.fn()),
  onRenderInstallProgress: vi.fn(() => vi.fn()),
  publishBatch: vi.fn(),
  onProgress: vi.fn(() => vi.fn()),
  sensitiveCheck: vi.fn().mockResolvedValue({ code: 0, data: { words: [] } }),
  batchCreate: vi.fn(),
  storeGetSetting: vi.fn(),
  offlineStatus: vi.fn().mockResolvedValue({ code: 0, data: { offline: false } }),
  offlineAddToCache: vi.fn(),
  aiGenerate: vi.fn().mockResolvedValue({ success: true, text: "AI生成文案内容" }),
}));

// Publish.vue
describe("PublishView (deep)", () => {
  beforeEach(() => { vi.clearAllMocks(); setActivePinia(createPinia()); });

  async function mountPublish() {
    const m = await import("./Publish.vue");
    return mount(m.default || m, {
      global: { plugins: [createPinia()],
        components: { UiButton: { template: "<button><slot/></button>" }, UiInput: { template: "<input/>" } },
        stubs: { "el-checkbox-group": true, "el-checkbox": true, "el-upload": true, "el-icon": true, TagSuggester: true, OptimalTimeTip: true, TitleAssistantPanel: true, ArticleEditor: true, TemplatePicker: true, UpgradeModal: true, AiWriterPanel: true }
      }
    });
  }

  it("shows page title", async () => {
    const w = await mountPublish();
    expect(w.text()).toContain("一键发布");
  });

  it("shows batch mode toggle", async () => {
    const w = await mountPublish();
    expect(w.text()).toContain("批量模式");
  });

  it("validates empty title", async () => {
    const w = await mountPublish();
    await w.vm.handlePublish();
    expect(ElMessage.warning).toHaveBeenCalled();
  });
});

// CreateView.vue
describe("CreateView (deep)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  async function mountCreate() {
    const m = await import("./CreateView.vue");
    return mount(m.default || m, {
      global: { components: { UiButton: { template: "<button><slot/></button>" }, UiSelect: { template: "<select><slot/></select>" } } }
    });
  }

  it("shows mode tabs", async () => {
    const w = await mountCreate();
    const tabs = w.findAll(".mode-tab");
    expect(tabs.length).toBe(3);
  });

  it("canRender changes with text", async () => {
    const w = await mountCreate();
    await nextTick();
    expect(w.vm.canRender).toBe(false);
    w.vm.text = "hello";
    await nextTick();
    expect(w.vm.canRender).toBe(true);
  });

  it("aiWrite generates content", async () => {
    const w = await mountCreate();
    await nextTick();
    w.vm.aiWrite();
    await new Promise(r => setTimeout(r, 1100));
    await nextTick();
    expect(w.vm.text.length).toBeGreaterThan(0);
  });
});

// ResultView.vue
describe("ResultView (deep)", () => {
  it("shows empty state", async () => {
    const m = await import("./ResultView.vue");
    const w = mount(m.default || m, {
      global: { components: { UiButton: { template: "<button><slot/></button>" } } }
    });
    await nextTick();
    expect(w.text()).toContain("没有可预览的视频");
  });
});
