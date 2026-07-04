import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

import ViralAnalysisView from "./ViralAnalysis.vue";

describe("ViralAnalysisView", () => {
  beforeEach(() => { vi.clearAllMocks(); setActivePinia(createPinia()); window.electronAPI = {}; });

  it("renders page title", async () => {
    const w = mount(ViralAnalysisView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.text()).toContain("爆款分析");
  });
});
