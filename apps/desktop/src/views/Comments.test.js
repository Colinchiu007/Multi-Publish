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

import CommentsView from "./Comments.vue";

describe("CommentsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it("renders page title", async () => {
    const w = mount(CommentsView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.text()).toContain("评论管理");
  });

  it("shows select platform hint when no platform selected", async () => {
    const w = mount(CommentsView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.text()).toContain("选择平台");
  });
});
