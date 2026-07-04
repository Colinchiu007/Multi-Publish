import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/stores/platforms", () => ({
  usePlatformStore: () => ({ load: vi.fn(), getLabel: (k) => k, getIcon: () => "ἱ0" })
}));

import ProvidersView from "./Providers.vue";

describe("ProvidersView", () => {
  beforeEach(() => { vi.clearAllMocks(); setActivePinia(createPinia()); window.electronAPI = {}; });

  it("renders page title", async () => {
    const w = mount(ProvidersView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.text()).toContain("Provider");
  });

  it("shows filter chips", async () => {
    const w = mount(ProvidersView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.text()).toContain("全部");
  });
});
