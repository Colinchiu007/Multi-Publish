import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

const mockStore = { isTrial: false, isFree: false, daysRemaining: 0 };
vi.mock("@/stores/license", () => ({
  useLicenseStore: () => mockStore
}));

import TrialBanner from "./TrialBanner.vue";

describe("TrialBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it("shows trial banner when isTrial=true", async () => {
    mockStore.isTrial = true; mockStore.isFree = false; mockStore.daysRemaining = 5;
    const w = mount(TrialBanner, { props: { dismissed: false } });
    await nextTick();
    expect(w.find(".trial-banner").exists()).toBe(true);
    expect(w.find(".trial-banner").classes()).toContain("trial");
    expect(w.text()).toContain("5");
  });

  it("shows free banner when isFree=true", async () => {
    mockStore.isTrial = false; mockStore.isFree = true; mockStore.daysRemaining = 0;
    const w = mount(TrialBanner, { props: { dismissed: false } });
    await nextTick();
    expect(w.find(".trial-banner").exists()).toBe(true);
    expect(w.find(".trial-banner").classes()).toContain("free");
    expect(w.text()).toContain("升级 Pro");
  });

  it("does not show when dismissed=true", async () => {
    mockStore.isTrial = true; mockStore.isFree = false; mockStore.daysRemaining = 3;
    const w = mount(TrialBanner, { props: { dismissed: true } });
    await nextTick();
    expect(w.find(".trial-banner").exists()).toBe(false);
  });

  it("does not show when isPro", async () => {
    mockStore.isTrial = false; mockStore.isFree = false; mockStore.daysRemaining = 0;
    const w = mount(TrialBanner, { props: { dismissed: false } });
    await nextTick();
    expect(w.find(".trial-banner").exists()).toBe(false);
  });

  it("emits upgrade on button click", async () => {
    mockStore.isTrial = true; mockStore.isFree = false; mockStore.daysRemaining = 7;
    const w = mount(TrialBanner, { props: { dismissed: false } });
    await nextTick();
    await w.find(".banner-btn").trigger("click");
    expect(w.emitted("upgrade")).toBeTruthy();
  });

  it("emits dismiss on close click", async () => {
    mockStore.isTrial = true; mockStore.isFree = false; mockStore.daysRemaining = 7;
    const w = mount(TrialBanner, { props: { dismissed: false } });
    await nextTick();
    await w.find(".banner-close").trigger("click");
    expect(w.emitted("dismiss")).toBeTruthy();
  });
});
