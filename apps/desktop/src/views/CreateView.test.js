import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/api/publisher", () => ({
  renderStart: vi.fn(),
  renderCancel: vi.fn(),
  renderGetStatus: vi.fn().mockResolvedValue({ ready: true }),
  renderInstallDeps: vi.fn().mockResolvedValue({ success: true }),
  onRenderProgress: vi.fn().mockReturnValue(vi.fn()),
  onRenderComplete: vi.fn().mockReturnValue(vi.fn()),
  onRenderError: vi.fn().mockReturnValue(vi.fn()),
  onRenderInstallProgress: vi.fn().mockReturnValue(vi.fn()),
}));

// Stub components used in CreateView
import UiButton from "@/components/UiButton.vue";
import UiSelect from "@/components/UiSelect.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: "/create/result", name: "result", component: { template: "<div>result</div>" } }]
});

import CreateView from "./CreateView.vue";

describe("CreateView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {};
  });

  it("renders page header and mode tabs", async () => {
    const w = mount(CreateView, {
      global: {
        plugins: [router],
        components: { UiButton, UiSelect }
      }
    });
    await nextTick();
    expect(w.text()).toContain("视频创作");
    expect(w.find(".mode-tab").exists()).toBe(true);
  });

  it("switches mode between text and gallery", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    const tabs = w.findAll(".mode-tab");
    expect(tabs.length).toBe(2);
    await tabs[1].trigger("click");
    await nextTick();
    expect(w.text()).toContain("上传图片");
  });

  it("canRender is false with empty text", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    expect(w.vm.canRender).toBe(false);
  });

  it("canRender is true with non-empty text", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.text = "hello world";
    await nextTick();
    expect(w.vm.canRender).toBe(true);
  });

  it("shows error when electronAPI missing on startRender", async () => {
    delete window.electronAPI;
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.text = "test";
    await w.vm.startRender();
    await nextTick();
    expect(w.text()).toContain("渲染引擎不可用");
  });

  it("calls renderStart with correct props", async () => {
    const mocks = await import("@/api/publisher");
    window.electronAPI = { renderStart: vi.fn() };
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.text = "scene1\nscene2\nscene3";
    await w.vm.startRender();
    await nextTick();
    expect(mocks.renderStart).toHaveBeenCalled();
    const arg = mocks.renderStart.mock.calls[0][0];
    expect(arg.props.cuts.length).toBe(3);
    expect(arg.props.cuts[0].text).toBe("scene1");
  });

  it("calls renderCancel", async () => {
    const mocks = await import("@/api/publisher");
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.rendering = true;
    await w.vm.cancelRender();
    expect(mocks.renderCancel).toHaveBeenCalled();
  });

  it("gets status on mount", async () => {
    const mocks = await import("@/api/publisher");
    mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    expect(mocks.renderGetStatus).toHaveBeenCalled();
  });

  it("adds and removes images", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    const file = new File(["dummy"], "test.png", { type: "image/png" });
    w.vm.addImages([file]);
    await nextTick();
    expect(w.vm.images.length).toBe(1);
    w.vm.removeImage(0);
    await nextTick();
    expect(w.vm.images.length).toBe(0);
  });

  it("calls aiWrite", async () => {
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.aiWrite();
    await new Promise(r => setTimeout(r, 1100));
    await nextTick();
    expect(w.vm.text.length).toBeGreaterThan(0);
  });

  it("sets result from onRenderComplete callback", async () => {
    window.electronAPI = {};
    const mocks = await import("@/api/publisher");
    // onRenderComplete should trigger when called
    mocks.onRenderComplete.mockImplementation(cb => { cb({ outputPath: "/tmp/test.mp4" }); return vi.fn(); });
    const w = mount(CreateView, {
      global: { plugins: [router], components: { UiButton, UiSelect } }
    });
    await nextTick();
    w.vm.rendering = true;
    // Trigger the onRenderComplete callback that was set up in setupListeners
    await nextTick();
    expect(w.vm.result).toEqual({ outputPath: "/tmp/test.mp4" });
    expect(w.vm.progress).toBe(100);
  });
});
