import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/components/TrendingPanel.vue", () => ({ default: { template: "<div>trending-panel</div>" } }));

import IntelligenceView from "./Intelligence.vue";

describe("IntelligenceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {};
  });

  it("renders page title", async () => {
    const w = mount(IntelligenceView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.text()).toContain("内容情报");
  });

  it("shows search input", async () => {
    const w = mount(IntelligenceView, { global: { plugins: [createPinia()] } });
    await nextTick();
    const input = w.find("input");
    expect(input.exists()).toBe(true);
  });
});
