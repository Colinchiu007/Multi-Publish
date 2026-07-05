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

vi.mock("@/api/cloud-publisher", () => ({
  cloudPublishPlatforms: vi.fn().mockResolvedValue({ ok: true, data: [{ id: "youtube", name: "YouTube" }, { id: "bilibili", name: "B站" }] }),
  cloudPublishListTasks: vi.fn().mockResolvedValue({ ok: true, data: [{ id: "t1", title: "Test", status: "success", platform: "youtube", created_at: "2026-07-05T10:00:00Z" }] }),
  cloudPublishSubmit: vi.fn().mockResolvedValue({ ok: true, data: { id: "new-task" } }),
  cloudPublishGetTask: vi.fn().mockResolvedValue({ ok: true, data: { id: "t1", status: "success" } }),
}));

import UiButton from "@/components/UiButton.vue";
import UiInput from "@/components/UiInput.vue";
import CloudPublishView from "./CloudPublish.vue";

describe("CloudPublishView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it("renders page title and submit button", async () => {
    const w = mount(CloudPublishView, {
      global: { plugins: [createPinia()], components: { UiButton, UiInput } }
    });
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(w.text()).toContain("云端发布");
  });

  it("loads platforms on mount", async () => {
    const w = mount(CloudPublishView, {
      global: { plugins: [createPinia()], components: { UiButton, UiInput } }
    });
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(w.vm.platforms.length).toBeGreaterThanOrEqual(2);
  });

  it("adds tag from input", async () => {
    const w = mount(CloudPublishView, {
      global: { plugins: [createPinia()], components: { UiButton, UiInput } }
    });
    await nextTick();
    w.vm.tagsInput = "newtag";
    w.vm.addTag();
    expect(w.vm.form.tags).toContain("newtag");
  });

  it("handleSubmit validates required fields", async () => {
    const w = mount(CloudPublishView, {
      global: { plugins: [createPinia()], components: { UiButton, UiInput } }
    });
    await nextTick();
    w.vm.form.videoUrl = "";
    w.vm.form.title = "";
    w.vm.form.platform = "";
    await w.vm.handleSubmit();
    expect(w.vm.submitResult).toBeTruthy();
    expect(w.vm.submitResult.ok).toBe(false);
  });

  it("handleSubmit succeeds with valid data", async () => {
    const w = mount(CloudPublishView, {
      global: { plugins: [createPinia()], components: { UiButton, UiInput } }
    });
    await nextTick();
    w.vm.form.videoUrl = "https://example.com/video.mp4";
    w.vm.form.title = "Test Video";
    w.vm.form.platform = "youtube";
    await w.vm.handleSubmit();
    await nextTick();
    const { cloudPublishSubmit } = await import("@/api/cloud-publisher");
    expect(cloudPublishSubmit).toHaveBeenCalled();
  });

  it("formatTime returns formatted string", async () => {
    const w = mount(CloudPublishView, {
      global: { plugins: [createPinia()], components: { UiButton, UiInput } }
    });
    await nextTick();
    const result = w.vm.formatTime("2026-07-05T10:00:00Z");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });
});
