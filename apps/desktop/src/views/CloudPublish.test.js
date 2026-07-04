import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/stores/platforms", () => ({
  usePlatformStore: () => ({
    load: vi.fn(),
    getLabel: (k) => k,
  })
}));

vi.mock("@/stores/license", () => ({
  useLicenseStore: () => ({ isPro: true })
}));

import UiButton from "@/components/UiButton.vue";
import UiInput from "@/components/UiInput.vue";
import CloudPublishView from "./CloudPublish.vue";

describe("CloudPublishView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it("renders page title", async () => {
    const w = mount(CloudPublishView, {
      global: { plugins: [createPinia()], components: { UiButton, UiInput } }
    });
    await nextTick();
    expect(w.text()).toContain("云端发布");
  });
});
