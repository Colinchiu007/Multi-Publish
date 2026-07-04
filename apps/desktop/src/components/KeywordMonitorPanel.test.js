import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

vi.mock("@/api/publisher", () => ({
  keywordStatus: vi.fn(),
  keywordStart: vi.fn(),
  keywordStop: vi.fn(),
  keywordHistory: vi.fn()
}));

vi.mock("../components/UiModal.vue", () => ({
  default: {
    name: "UiModal",
    template: '<div class="ui-modal-mock"><slot /></div>',
    props: ["visible", "title"]
  }
}));

vi.mock("element-plus", () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() }
}));

import { keywordStatus, keywordStart, keywordHistory } from "@/api/publisher";
import KeywordMonitorPanel from "./KeywordMonitorPanel.vue";

describe("KeywordMonitorPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state", async () => {
    keywordStatus.mockImplementation(() => new Promise(() => {}));
    const w = mount(KeywordMonitorPanel);
    await nextTick();
    expect(w.text()).toContain("加载中");
  });

  it("shows empty state after load", async () => {
    keywordStatus.mockResolvedValue({ code: 0, data: [] });
    const w = mount(KeywordMonitorPanel);
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(w.text()).toContain("尚未添加监测关键词");
  });

  it("displays keywords after load", async () => {
    keywordStatus.mockResolvedValue({
      code: 0,
      data: [
        { keyword: "AI技术", lastChecked: "2026-07-04 10:00", samples: 120 },
        { keyword: "机器学习", lastChecked: "2026-07-04 09:00", samples: 85 }
      ]
    });
    const w = mount(KeywordMonitorPanel);
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(w.text()).toContain("AI技术");
    expect(w.text()).toContain("机器学习");
    expect(w.text()).toContain("监测中");
  });

  it("adds keyword via input and button", async () => {
    keywordStatus.mockResolvedValue({ code: 0, data: [] });
    keywordStart.mockResolvedValue({ code: 0 });

    const w = mount(KeywordMonitorPanel);
    await new Promise(r => setTimeout(r, 10));
    await nextTick();

    const input = w.find("input");
    await input.setValue("新关键词");
    await nextTick();

    const addBtn = w.findAll("button").filter(b => b.text().includes("添加"));
    await addBtn[0].trigger("click");
    await new Promise(r => setTimeout(r, 10));
    await nextTick();

    expect(keywordStart).toHaveBeenCalledWith("新关键词", { interval: 6, threshold: 50 });
  });

  it("opens history modal on button click", async () => {
    keywordStatus.mockResolvedValue({
      code: 0,
      data: [{ keyword: "测试关键词", lastChecked: "2026-07-04", samples: 10 }]
    });
    keywordHistory.mockResolvedValue({
      code: 0,
      data: [{ checkedAt: "2026-07-04 10:00", totalMentions: 5, topEngagement: 100 }]
    });

    const w = mount(KeywordMonitorPanel);
    await new Promise(r => setTimeout(r, 10));
    await nextTick();

    const historyBtns = w.findAll("button").filter(b => b.text().includes("查看历史"));
    await historyBtns[0].trigger("click");
    await new Promise(r => setTimeout(r, 10));
    await nextTick();

    expect(keywordHistory).toHaveBeenCalledWith("测试关键词");
  });
});