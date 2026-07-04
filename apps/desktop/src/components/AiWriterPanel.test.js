import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    currentRoute: { value: { path: "/" } }
  })
}));

import AiWriterPanel from "./AiWriterPanel.vue";

// Helper: wait for async onMounted checkConfig to complete
async function waitConfig() {
  await new Promise(r => setTimeout(r, 20));
  await nextTick();
}

describe("AiWriterPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      aiIsConfigured: vi.fn(),
      aiGenerateTitles: vi.fn(),
      aiEnhanceContent: vi.fn(),
      aiGenerateSummary: vi.fn()
    };
  });

  it("shows unconfigured state when API not configured", async () => {
    window.electronAPI.aiIsConfigured.mockResolvedValue({ code: 0, data: false });
    const w = mount(AiWriterPanel, { props: { sourceContent: "" } });
    await waitConfig();
    expect(w.text()).toContain("需要配置 LLM API Key");
    expect(w.text()).toContain("前往 Provider 设置");
  });

  it("shows configured state when API is configured", async () => {
    window.electronAPI.aiIsConfigured.mockResolvedValue({ code: 0, data: true });
    const w = mount(AiWriterPanel, { props: { sourceContent: "" } });
    await waitConfig();
    expect(w.text()).toContain("AI 辅助写作");
    expect(w.text()).toContain("标题生成");
    expect(w.text()).toContain("内容润色");
    expect(w.text()).toContain("生成摘要");
  });

  it("navigates to providers on configure button click", async () => {
    window.electronAPI.aiIsConfigured.mockResolvedValue({ code: 0, data: false });
    const w = mount(AiWriterPanel, { props: { sourceContent: "" } });
    await waitConfig();
    // Click "前往 Provider 设置" (second button: first is close button)
    const providerBtn = w.findAll("button").filter(b => b.text().includes("Provider"));
    await providerBtn[0].trigger("click");
    expect(w.emitted("close")).toBeTruthy();
  });

  it("generates titles and displays results", async () => {
    window.electronAPI.aiIsConfigured.mockResolvedValue({ code: 0, data: true });
    window.electronAPI.aiGenerateTitles.mockResolvedValue({
      code: 0,
      data: ["标题一：AI的未来", "标题二：深度学习入门"]
    });
    const w = mount(AiWriterPanel, { props: { sourceContent: "" } });
    await waitConfig();
    const input = w.find("input");
    await input.setValue("AI技术");
    const generateBtn = w.findAll("button").filter(b => b.text().includes("生成标题"));
    await generateBtn[0].trigger("click");
    await nextTick();
    expect(w.text()).toContain("标题一：AI的未来");
    expect(w.text()).toContain("标题二：深度学习入门");
  });

  it("emits apply-title on title click", async () => {
    window.electronAPI.aiIsConfigured.mockResolvedValue({ code: 0, data: true });
    window.electronAPI.aiGenerateTitles.mockResolvedValue({
      code: 0,
      data: ["测试标题"]
    });
    const w = mount(AiWriterPanel, { props: { sourceContent: "" } });
    await waitConfig();
    const input = w.find("input");
    await input.setValue("测试");
    const generateBtn = w.findAll("button").filter(b => b.text().includes("生成标题"));
    await generateBtn[0].trigger("click");
    await nextTick();
    const resultItem = w.find(".result-item");
    await resultItem.trigger("click");
    expect(w.emitted("apply-title")).toBeTruthy();
    expect(w.emitted("apply-title")[0]).toEqual(["测试标题"]);
  });

  it("enhances content and displays result", async () => {
    window.electronAPI.aiIsConfigured.mockResolvedValue({ code: 0, data: true });
    window.electronAPI.aiEnhanceContent.mockResolvedValue({
      code: 0,
      data: "这是润色后的内容"
    });
    const w = mount(AiWriterPanel, {
      props: { sourceContent: "这是一段需要润色的原文内容，长度超过十个字" }
    });
    await waitConfig();
    // Click enhance mode tab
    const enhanceTab = w.findAll("button").filter(b => b.text().includes("内容润色"));
    await enhanceTab[0].trigger("click");
    await nextTick();
    // Click enhance action button
    const enhanceBtn = w.findAll("button").filter(b => b.text().includes("润色正文"));
    await enhanceBtn[0].trigger("click");
    await nextTick();
    expect(w.text()).toContain("润色后的内容");
  });

  it("generates summary and displays result", async () => {
    window.electronAPI.aiIsConfigured.mockResolvedValue({ code: 0, data: true });
    window.electronAPI.aiGenerateSummary.mockResolvedValue({
      code: 0,
      data: "这是生成的摘要内容"
    });
    const w = mount(AiWriterPanel, {
      props: { sourceContent: "这是一段用于生成摘要的原文内容，长度超过二十个字以确保可以正常生成摘要。" }
    });
    await waitConfig();
    // Find summary action button (the one with cohere-btn-primary class, not the mode tab)
    const allButtons = w.findAll("button");
    const actionBtn = allButtons.filter(b => b.classes().includes("cohere-btn-primary") && b.text().includes("生成摘要"));
    if (actionBtn.length === 0) {
      // Click the summary mode tab first, then find the action button
      const summaryTab = allButtons.filter(b => b.text() === "📝 生成摘要");
      await summaryTab[0].trigger("click");
      await nextTick();
      const afterSwitch = w.findAll("button");
      const afterAction = afterSwitch.filter(b => b.classes().includes("cohere-btn-primary"));
      await afterAction[0].trigger("click");
    } else {
      await actionBtn[0].trigger("click");
    }
    await nextTick();
    expect(w.text()).toContain("生成的摘要内容");
  });
});