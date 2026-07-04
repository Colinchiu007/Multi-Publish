import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/components/KeywordMonitorPanel.vue", () => ({ default: { template: "<div>keyword-panel</div>" } }));

import KeywordMonitorView from "./KeywordMonitorView.vue";

describe("KeywordMonitorView", () => {
  it("renders page title and panel", async () => {
    const w = mount(KeywordMonitorView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.text()).toContain("关键词监测");
    expect(w.text()).toContain("keyword-panel");
  });
});
