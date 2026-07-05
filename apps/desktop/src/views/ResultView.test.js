import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({ history: createWebHistory(), routes: [
  { path: "/", component: { template: "<div>root</div>" } },
  { path: "/create", name: "create", component: { template: "<div>create</div>" } },
  { path: "/publish", name: "publish", component: { template: "<div>publish</div>" } },
] });

import UiButton from "@/components/UiButton.vue";
import ResultView from "./ResultView.vue";

describe("ResultView", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  async function createView() {
    await router.push("/");
    const w = mount(ResultView, {
      global: { plugins: [router], components: { UiButton } }
    });
    await nextTick();
    return w;
  }

  it("renders page title", async () => {
    const w = await createView();
    expect(w.text()).toContain("\u89c6\u9891\u9884\u89c8");
  });

  it("shows empty state when no video path", async () => {
    const w = await createView();
    expect(w.text()).toContain("\u6ca1\u6709\u53ef\u9884\u89c8\u7684\u89c6\u9891");
  });

  it("loads video path and shows video player", async () => {
    const w = await createView();
    w.vm.videoPath = "/videos/test.mp4";
    w.vm.videoSrc = "file:///videos/test.mp4";
    await nextTick();
    const video = w.find("video");
    expect(video.exists()).toBe(true);
    expect(w.vm.loading).toBe(false);
  });

  it("handleError sets error message", async () => {
    const w = await createView();
    w.vm.handleError();
    expect(w.vm.error).toBeTruthy();
  });

  it("download creates download link and clicks it", async () => {
    const w = await createView();
    w.vm.videoPath = "/videos/test.mp4";
    w.vm.videoSrc = "file:///videos/test.mp4";

    const createElementSpy = vi.spyOn(document, "createElement");
    const clickSpy = vi.fn();
    createElementSpy.mockReturnValue({ href: "", download: "", click: clickSpy });

    w.vm.download();
    // Verify download() triggered createElement("a")
    const aCalls = createElementSpy.mock.calls.filter(c => c[0] === "a");
    expect(aCalls.length).toBeGreaterThanOrEqual(1);
    expect(clickSpy).toHaveBeenCalled();
    createElementSpy.mockRestore();
  });

  it("download does nothing without videoPath", async () => {
    const w = await createView();
    w.vm.videoPath = null;
    // Should not throw and should return early
    expect(() => w.vm.download()).not.toThrow();
  });

  it("shows error banner when error is set", async () => {
    const w = await createView();
    w.vm.error = "Video not found";
    await nextTick();
    expect(w.text()).toContain("Video not found");
  });

  it("shows download and navigate buttons when video loaded", async () => {
    const w = await createView();
    w.vm.videoPath = "/videos/test.mp4";
    w.vm.videoSrc = "file:///videos/test.mp4";
    await nextTick();
    expect(w.text()).toContain("\u4e0b\u8f7d\u89c6\u9891");
    expect(w.text()).toContain("\u53bb\u53d1\u5e03");
  });
});
