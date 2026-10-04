import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";

vi.mock("@/stores/platforms", () => ({
  usePlatformStore: () => ({
    load: vi.fn(),
    getLabel: (key) => {
      const labels = { zhihu: "知乎", weibo: "微博", bilibili: "B站" };
      return labels[key] || key;
    }
  })
}));

vi.mock("element-plus", () => ({
  ElMessage: { success: vi.fn() }
}));

// 组件已 import { intelligenceSuggestTags } from '@/api/publisher'
// 必须用 vi.mock 拦截 ESM import
// 工厂内创建 vi.fn()，通过 import 拿引用（vi.mock 是 hoisted，不能引用外部变量）
vi.mock("@/api/publisher", () => ({
  intelligenceSuggestTags: vi.fn(),
}));

import { intelligenceSuggestTags } from "@/api/publisher";
import TagSuggester from "./TagSuggester.vue";

import zh from "@/locales/zh";
import en from "@/locales/en";

function makeI18n(locale = "zh") {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: "en",
    messages: { zh, en },
  });
}

function successResponse() {
  return {
    keywords: ["#测试", "文章"],
    relatedTerms: ["技术", "编程"],
    byPlatform: { zhihu: ["知乎", "科技", "知乎热榜"], weibo: ["#微博", "#热门话题", "科技前沿"] },
    byPlatformDetail: {
      zhihu: { content: ["知乎", "科技"], traffic: ["知乎热榜"] },
      weibo: { content: ["#微博"], traffic: ["#热门话题", "科技前沿"] },
    },
    source: "llm",
    calibrated: true,
    matchedTopics: {
      zhihu: [{ tag: "知乎热榜", heat: 92 }],
      weibo: [{ tag: "#热门话题", heat: 88 }, { tag: "科技前沿", heat: 70 }],
    },
  };
}

function fallbackResponse() {
  return {
    keywords: ["#测试", "文章"],
    relatedTerms: ["技术", "编程"],
    byPlatform: { zhihu: ["#知乎", "科技"], weibo: ["#微博", "热门"] },
    source: "extractor",
    calibrated: false,
  };
}

function createWrapper(i18n) {
  return mount(TagSuggester, {
    props: { content: "" },
    attachTo: document.body,
    global: i18n ? { plugins: [i18n] } : {},
  });
}

async function triggerAnalyzeTimed(w, content) {
  await w.setProps({ content });
  vi.advanceTimersByTime(900);
  await nextTick();
}

describe("TagSuggester", () => {
  let i18n;
  beforeEach(() => {
    vi.mocked(intelligenceSuggestTags).mockReset();
    vi.mocked(intelligenceSuggestTags).mockResolvedValue({ code: 0, data: successResponse() });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setActivePinia(createPinia());
    i18n = makeI18n("zh");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows empty state for short content", async () => {
    const w = mount(TagSuggester, { props: { content: "ab" }, global: { plugins: [makeI18n()] } });
    await nextTick();
    expect(w.text()).toContain("输入内容后自动分析标签");
  });

  it("shows empty state for empty content", async () => {
    const w = mount(TagSuggester, { props: { content: "" }, global: { plugins: [makeI18n()] } });
    await nextTick();
    expect(w.text()).toContain("输入内容后自动分析标签");
  });

  it("shows loading when analyzing", async () => {
    vi.mocked(intelligenceSuggestTags).mockImplementation(() => new Promise(() => {}));
    const w = createWrapper(makeI18n());
    await nextTick();
    await w.setProps({ content: "这是一篇测试文章内容" });
    vi.advanceTimersByTime(900);
    await nextTick();
    // 统一骨架屏：加载态改为骨架（文案只保留给辅助技术）
    expect(w.find('[data-testid="tag-suggester-loading"]').exists()).toBe(true);
    expect(w.findAll(".mp-skeleton-surface").length).toBeGreaterThan(0);
  });

  it("shows suggestions when API succeeds", async () => {
    const w = createWrapper(i18n);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");
    expect(w.text()).toContain("提取关键词");
    expect(w.text()).toContain("#测试");
    expect(w.text()).toContain("相关话题");
    // Tab 化（compact-tag-suggester-tabs）：「各平台标签」纵向堆叠标题被 Tab 行替代
    expect(w.text()).not.toContain("各平台标签");
    expect(w.find('[data-testid="tag-tab-all"]').exists()).toBe(true);
    // 汇总视图默认呈现：每平台一行紧凑摘要
    expect(w.findAll('[data-testid="tag-summary-row"]').length).toBe(2);
  });

  it("shows error when API fails", async () => {
    vi.mocked(intelligenceSuggestTags).mockRejectedValue(new Error("API error"));
    const w = createWrapper(makeI18n());
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");
    expect(w.text()).toContain("标签分析失败");
  });

  it("handles null API response gracefully", async () => {
    vi.mocked(intelligenceSuggestTags).mockResolvedValue(null);
    const w = createWrapper(makeI18n());
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");
    expect(w.text()).toContain("提取关键词");
  });

  it("emits close on close button click", async () => {
    const w = mount(TagSuggester, { props: { content: "测试内容" }, global: { plugins: [makeI18n()] } });
    await nextTick();
    await w.find(".cohere-btn-ghost").trigger("click");
    expect(w.emitted("close")).toBeTruthy();
  });

  it("copies platform tags via Clipboard API", async () => {
    const clipboardMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardMock }, writable: true, configurable: true
    });
    const w = createWrapper(i18n);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");

    const copyBtns = w.findAll("button");
    const copyBtn = copyBtns.find(b => b.text().includes("复制标签"));
    expect(copyBtn).toBeDefined();
    await copyBtn.trigger("click");
    await nextTick();

    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
  });

  it("copies via fallback textarea when clipboard.writeText fails", async () => {
    const clipboardMock = vi.fn().mockRejectedValue(new Error("permission denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardMock }, writable: true, configurable: true
    });
    // Mock execCommand for fallback path
    document.execCommand = vi.fn().mockReturnValue(true);

    const w = createWrapper(i18n);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");

    const copyBtns = w.findAll("button");
    const copyBtn = copyBtns.find(b => b.text().includes("复制标签"));
    expect(copyBtn).toBeDefined();
    await copyBtn.trigger("click");
    await nextTick();

    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
  });

  it("debounces rapid changes", async () => {
    vi.mocked(intelligenceSuggestTags).mockClear();
    vi.mocked(intelligenceSuggestTags).mockResolvedValue({ code: 0, data: successResponse() });
    const w = createWrapper(i18n);
    await nextTick();

    await w.setProps({ content: "a" });
    vi.advanceTimersByTime(100);
    await w.setProps({ content: "ab" });
    vi.advanceTimersByTime(100);
    await w.setProps({ content: "abc" });
    vi.advanceTimersByTime(100);
    await w.setProps({ content: "abcd" });
    vi.advanceTimersByTime(100);

    expect(intelligenceSuggestTags).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    await nextTick();
    expect(intelligenceSuggestTags).toHaveBeenCalledTimes(1);
  });

  it("resets state when content is cleared", async () => {
    const w = createWrapper(i18n);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是测试内容");
    expect(w.text()).toContain("提取关键词");
    await w.setProps({ content: "" });
    await nextTick();
    expect(w.text()).toContain("输入内容后自动分析标签");
  });

  it("shows source AI + calibrated status when source is llm", async () => {
    const w = createWrapper(i18n);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");
    expect(w.text()).toContain("AI 生成");
    expect(w.text()).toContain("热门库校准 ✓");
  });

  it("shows source local + no grouped headers when byPlatformDetail absent", async () => {
    vi.mocked(intelligenceSuggestTags).mockReset();
    vi.mocked(intelligenceSuggestTags).mockResolvedValue({ code: 0, data: fallbackResponse() });
    const w = createWrapper(i18n);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");
    expect(w.text()).toContain("本地摘词");
    // fallback 结构在汇总行内呈现（Tab 化后不再有独立「各平台标签」标题）
    expect(w.text()).not.toContain("各平台标签");
    expect(w.text()).not.toContain("内容标签");
    expect(w.text()).not.toContain("流量标签");
    expect(w.text()).toContain("#知乎");
  });

  it("shows AI not configured status when source missing", async () => {
    vi.mocked(intelligenceSuggestTags).mockReset();
    vi.mocked(intelligenceSuggestTags).mockResolvedValue({
      code: 0,
      data: { keywords: ["#测试"], relatedTerms: [], byPlatform: { zhihu: ["#知乎"] } },
    });
    const w = createWrapper(i18n);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");
    expect(w.text()).toContain("AI 未配置");
  });

  it("renders hot heat badge and tooltip from matchedTopics", async () => {
    const w = createWrapper(i18n);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");
    // Tab 化后热度角标在平台 Tab 的完整分组内；切到知乎 Tab 验证
    const zhihuTab = w.findAll('[role="tab"]').find(b => b.text().includes("知乎"));
    await zhihuTab.trigger("click");
    await nextTick();
    // heat badge number present for matched traffic tag
    expect(w.text()).toContain("92");
    // 建议标签现在都带「点击填入」title；热度提示须按内容精确匹配而非取第一个 [title]
    const hotSpan = w.find('[title*="匹配热门话题"]');
    expect(hotSpan.exists()).toBe(true);
  });

  it("copies merged content+traffic tags from grouped platform", async () => {
    const clipboardMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardMock }, writable: true, configurable: true
    });
    const w = createWrapper(i18n);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");

    const copyBtns = w.findAll("button");
    const copyBtn = copyBtns.find(b => b.text().includes("复制标签"));
    expect(copyBtn).toBeDefined();
    await copyBtn.trigger("click");
    await nextTick();

    expect(clipboardMock).toHaveBeenCalledWith("知乎 科技 知乎热榜");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
  });
});

// ── openspec/changes/optimize-publish-right-rail：平台联动 + 点击填入 + 空态收敛 ──
describe("TagSuggester — 平台联动与点击填入", () => {
  const FULL_CATALOG = ["zhihu", "weibo", "xiaohongshu", "bilibili", "toutiao"];

  let i18n;
  beforeEach(() => {
    vi.mocked(intelligenceSuggestTags).mockReset();
    vi.mocked(intelligenceSuggestTags).mockResolvedValue({ code: 0, data: successResponse() });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setActivePinia(createPinia());
    i18n = makeI18n("zh");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mountWithPlatforms(platforms) {
    return mount(TagSuggester, {
      props: { content: "", platforms },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
  }

  it("请求只携带所选平台", async () => {
    const w = mountWithPlatforms(["kuaishou", "xiaohongshu"]);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");
    expect(intelligenceSuggestTags).toHaveBeenCalledWith("这是一篇测试文章内容", {
      platforms: ["kuaishou", "xiaohongshu"],
    });
  });

  it("空平台数组回退全量目录", async () => {
    const w = mountWithPlatforms([]);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");
    expect(intelligenceSuggestTags).toHaveBeenCalledWith("这是一篇测试文章内容", {
      platforms: FULL_CATALOG,
    });
  });

  it("未传 platforms prop 时回退全量目录", async () => {
    const w = mount(TagSuggester, {
      props: { content: "" },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");
    expect(intelligenceSuggestTags).toHaveBeenCalledWith("这是一篇测试文章内容", {
      platforms: FULL_CATALOG,
    });
  });

  it("platforms 变化经防抖重新请求", async () => {
    const w = mountWithPlatforms(["zhihu"]);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");
    expect(intelligenceSuggestTags).toHaveBeenCalledTimes(1);

    await w.setProps({ platforms: ["weibo", "bilibili"] });
    vi.advanceTimersByTime(900);
    await nextTick();
    expect(intelligenceSuggestTags).toHaveBeenCalledTimes(2);
    expect(intelligenceSuggestTags).toHaveBeenLastCalledWith("这是一篇测试文章内容", {
      platforms: ["weibo", "bilibili"],
    });
  });

  it("点击关键词标签 emit apply-tag", async () => {
    const w = mountWithPlatforms([]);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");

    const keywordTag = w.findAll('[data-testid="suggested-tag"]').find(el => el.text() === "#测试");
    expect(keywordTag).toBeDefined();
    await keywordTag.trigger("click");
    expect(w.emitted("apply-tag")).toBeTruthy();
    expect(w.emitted("apply-tag")[0]).toEqual(["#测试"]);
  });

  it("点击平台内容标签 emit apply-tag", async () => {
    const w = mountWithPlatforms([]);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");

    const platformTag = w.findAll('[data-testid="suggested-tag"]').find(el => el.text() === "科技");
    expect(platformTag).toBeDefined();
    await platformTag.trigger("click");
    expect(w.emitted("apply-tag")[0]).toEqual(["科技"]);
  });

  it("错误态渲染为一行提示并带重试按钮", async () => {
    vi.mocked(intelligenceSuggestTags).mockRejectedValue(new Error("API error"));
    const w = mountWithPlatforms([]);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");

    const errorRow = w.get('[data-testid="tag-suggester-error"]');
    expect(errorRow.text()).toContain("标签分析失败");
    // 一行收敛：错误行内直接提供重试，不再渲染完整结果结构
    expect(w.text()).not.toContain("提取关键词");
    expect(w.text()).not.toContain("汇总");

    vi.mocked(intelligenceSuggestTags).mockResolvedValue({ code: 0, data: successResponse() });
    const retryBtn = w.findAll("button").find(b => b.text().includes("重试"));
    expect(retryBtn).toBeDefined();
    await retryBtn.trigger("click");
    vi.advanceTimersByTime(900);
    await nextTick();
    expect(w.text()).toContain("提取关键词");
  });
});

// ── openspec/changes/compact-tag-suggester-tabs：平台标签 Tab 化与纵向密度 ──
describe("TagSuggester — Tab 化紧凑呈现", () => {
  let i18n;
  beforeEach(() => {
    vi.mocked(intelligenceSuggestTags).mockReset();
    vi.mocked(intelligenceSuggestTags).mockResolvedValue({ code: 0, data: successResponse() });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setActivePinia(createPinia());
    i18n = makeI18n("zh");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mountWithPlatforms(platforms) {
    return mount(TagSuggester, {
      props: { content: "", platforms },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
  }

  it("默认渲染汇总 Tab 且处于选中态", async () => {
    const w = mountWithPlatforms([]);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");

    const tabs = w.findAll('[role="tab"]');
    expect(tabs.length).toBe(3); // 汇总 + 知乎 + 微博
    const allTab = w.get('[data-testid="tag-tab-all"]');
    expect(allTab.attributes("aria-selected")).toBe("true");
    expect(allTab.text()).toContain("汇总");
  });

  it("汇总视图每平台一行摘要：平台名+标签+复制按钮", async () => {
    const w = mountWithPlatforms([]);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");

    const rows = w.findAll('[data-testid="tag-summary-row"]');
    expect(rows.length).toBe(2);
    // 知乎行：内容+流量合并展示
    const zhihuRow = rows[0];
    expect(zhihuRow.text()).toContain("知乎");
    expect(zhihuRow.text()).toContain("科技");
    expect(zhihuRow.text()).toContain("知乎热榜");
    // 行内保留复制按钮
    const copyBtn = zhihuRow.findAll("button").find(b => b.text().includes("复制标签"));
    expect(copyBtn).toBeDefined();
  });

  it("点击平台 Tab 显示完整分组（内容+流量+热度），再点汇总返回", async () => {
    const w = mountWithPlatforms([]);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");

    // 汇总态不渲染分组小标题
    expect(w.text()).not.toContain("内容标签（描述文章主题）");

    // 切到知乎 Tab
    const zhihuTab = w.findAll('[role="tab"]').find(b => b.text().includes("知乎"));
    await zhihuTab.trigger("click");
    await nextTick();
    expect(zhihuTab.attributes("aria-selected")).toBe("true");
    expect(w.get('[data-testid="tag-tab-all"]').attributes("aria-selected")).toBe("false");
    // 完整分组可见
    expect(w.text()).toContain("内容标签（描述文章主题）");
    expect(w.text()).toContain("流量标签（关联热门话题）");
    expect(w.text()).toContain("92"); // 热度角标
    // 只渲染知乎一组的完整块
    expect(w.findAll('[data-testid="tag-summary-row"]').length).toBe(0);

    // 切回汇总
    await w.get('[data-testid="tag-tab-all"]').trigger("click");
    await nextTick();
    expect(w.findAll('[data-testid="tag-summary-row"]').length).toBe(2);
    expect(w.text()).not.toContain("内容标签（描述文章主题）");
  });

  it("Tab 切换不触发重新请求", async () => {
    const w = mountWithPlatforms([]);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");
    expect(intelligenceSuggestTags).toHaveBeenCalledTimes(1);

    const zhihuTab = w.findAll('[role="tab"]').find(b => b.text().includes("知乎"));
    await zhihuTab.trigger("click");
    await w.get('[data-testid="tag-tab-all"]').trigger("click");
    await zhihuTab.trigger("click");
    vi.advanceTimersByTime(2000);
    await nextTick();

    expect(intelligenceSuggestTags).toHaveBeenCalledTimes(1);
  });

  it("汇总行超容量截断并显示 +N 徽标", async () => {
    // 微博 3 个标签全部可见；构造 8 标签平台验证截断
    vi.mocked(intelligenceSuggestTags).mockReset();
    vi.mocked(intelligenceSuggestTags).mockResolvedValue({
      code: 0,
      data: {
        keywords: ["#测试"],
        relatedTerms: [],
        byPlatform: { weibo: ["#一", "#二", "#三", "#四", "#五", "#六", "#七", "#八"] },
        byPlatformDetail: {
          weibo: { content: ["#一", "#二", "#三", "#四", "#五"], traffic: ["#六", "#七", "#八"] },
        },
        source: "llm",
        calibrated: true,
      },
    });
    const w = mountWithPlatforms([]);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");

    const row = w.get('[data-testid="tag-summary-row"]');
    const badges = row.findAll('[data-testid="tag-more-badge"]');
    expect(badges.length).toBe(1);
    expect(badges[0].text()).toBe("+2");
    // 徽标不可点击填入（非 suggested-tag）
    expect(badges[0].classes()).not.toContain("suggested-tag");
  });

  it("平台从结果中消失后选中 Tab 回落汇总", async () => {
    const w = mountWithPlatforms([]);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");

    // 选中知乎 Tab
    const zhihuTab = w.findAll('[role="tab"]').find(b => b.text().includes("知乎"));
    await zhihuTab.trigger("click");
    await nextTick();
    expect(zhihuTab.attributes("aria-selected")).toBe("true");

    // 重新分析：结果只剩微博 → 知乎 Tab 消失
    vi.mocked(intelligenceSuggestTags).mockReset();
    vi.mocked(intelligenceSuggestTags).mockResolvedValue({
      code: 0,
      data: {
        keywords: ["#测试"],
        relatedTerms: [],
        byPlatform: { weibo: ["#微博", "热门"] },
        byPlatformDetail: { weibo: { content: ["#微博"], traffic: ["热门"] } },
        source: "extractor",
        calibrated: false,
      },
    });
    await w.setProps({ content: "这是一篇全新的测试文章内容" });
    // 异步冲刷：防抖触发 → 请求 → 响应 → suggestions 更新 → watcher 回落 → 重渲染
    await vi.advanceTimersByTimeAsync(900);
    await nextTick();

    expect(w.get('[data-testid="tag-tab-all"]').attributes("aria-selected")).toBe("true");
    // 汇总行只含微博
    const rows = w.findAll('[data-testid="tag-summary-row"]');
    expect(rows.length).toBe(1);
    expect(rows[0].text()).toContain("微博");
  });

  it("汇总行复制按钮仍复制该平台全量标签", async () => {
    const clipboardMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardMock }, writable: true, configurable: true
    });
    vi.mocked(intelligenceSuggestTags).mockReset();
    vi.mocked(intelligenceSuggestTags).mockResolvedValue({
      code: 0,
      data: {
        keywords: ["#测试"],
        relatedTerms: [],
        byPlatform: { weibo: ["#一", "#二", "#三", "#四", "#五", "#六", "#七", "#八"] },
        byPlatformDetail: {
          weibo: { content: ["#一", "#二", "#三", "#四", "#五"], traffic: ["#六", "#七", "#八"] },
        },
        source: "llm",
        calibrated: true,
      },
    });
    const w = mountWithPlatforms([]);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");

    const row = w.get('[data-testid="tag-summary-row"]');
    const copyBtn = row.findAll("button").find(b => b.text().includes("复制标签"));
    await copyBtn.trigger("click");
    await nextTick();

    // 摘要只显示 6 个，但复制的是全量 8 个
    expect(clipboardMock).toHaveBeenCalledWith("#一 #二 #三 #四 #五 #六 #七 #八");
  });

  it("汇总行内标签点击 emit apply-tag", async () => {
    const w = mountWithPlatforms([]);
    await nextTick();
    await triggerAnalyzeTimed(w, "这是一篇测试文章内容");

    const row = w.get('[data-testid="tag-summary-row"]');
    const tag = row.findAll('[data-testid="suggested-tag"]').find(el => el.text() === "科技");
    expect(tag).toBeDefined();
    await tag.trigger("click");
    expect(w.emitted("apply-tag")[0]).toEqual(["科技"]);
  });
});
