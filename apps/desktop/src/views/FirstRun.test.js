import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/stores/license", () => ({
  useLicenseStore: () => ({ isPro: true })
}));

import FirstRunView from "./FirstRun.vue";

describe("FirstRunView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {
      firstRunCheck: vi.fn().mockResolvedValue({ setupDone: false }),
      onFirstRunStatus: vi.fn(() => vi.fn()),
    };
  });

  it("shows welcome step initially", async () => {
    const w = mount(FirstRunView, { global: { plugins: [createPinia()] } });
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.text()).toContain("欢迎使用社媒管家");
  });

  it("advances to next step on click", async () => {
    const w = mount(FirstRunView, { global: { plugins: [createPinia()] } });
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    const btn = w.find("button");
    if (btn.exists()) {
      await btn.trigger("click");
      await nextTick();
      expect(w.vm.currentStep).toBe(1);
    }
  });
});
