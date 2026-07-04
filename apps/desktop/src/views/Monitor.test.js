import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/stores/platforms", () => ({
  usePlatformStore: () => ({ load: vi.fn(), getLabel: (k) => k, getIcon: () => "ἱ0" })
}));

import MonitorView from "./Monitor.vue";

describe("MonitorView", () => {
  beforeEach(() => { vi.clearAllMocks(); setActivePinia(createPinia()); window.electronAPI = {}; });

  it("renders page title", async () => {
    const w = mount(MonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.text()).toContain("分屏监控");
  });

  it("shows layout toggle buttons", async () => {
    const w = mount(MonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    const btns = w.findAll(".layout-btn");
    expect(btns.length).toBeGreaterThanOrEqual(2);
  });
});
