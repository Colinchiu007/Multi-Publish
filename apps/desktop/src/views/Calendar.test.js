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

import CalendarView from "./Calendar.vue";

describe("CalendarView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {
      schedulerList: vi.fn().mockResolvedValue({ code: 0, data: [] }),
    };
  });

  it("renders page title", async () => {
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.text()).toContain("发布日历");
  });
});
