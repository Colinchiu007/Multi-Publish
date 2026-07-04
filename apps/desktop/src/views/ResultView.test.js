import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({ history: createWebHistory(), routes: [
  { path: "/create", name: "create", component: { template: "<div>create</div>" } },
] });

import UiButton from "@/components/UiButton.vue";
import ResultView from "./ResultView.vue";

describe("ResultView", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("renders page title", async () => {
    const w = mount(ResultView, { global: { plugins: [router], components: { UiButton } } });
    await nextTick();
    expect(w.text()).toContain("视频预览");
  });

  it("shows empty state when no video path", async () => {
    const w = mount(ResultView, { global: { plugins: [router], components: { UiButton } } });
    await nextTick();
    expect(w.text()).toContain("没有可预览的视频");
  });
});
