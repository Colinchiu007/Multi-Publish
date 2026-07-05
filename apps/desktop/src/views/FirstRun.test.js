import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/stores/license", () => ({
  useLicenseStore: () => ({ isPro: true })
}));

vi.mock("@/api/publisher", () => ({
  onFirstRunStatus: vi.fn(() => vi.fn()),
  firstRunCheck: vi.fn().mockResolvedValue({ setupDone: false }),
}));

import FirstRunView from "./FirstRun.vue";

describe("FirstRunView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {};
  });

  function createView() {
    return mount(FirstRunView, { global: { plugins: [createPinia()] } });
  }

  it("shows welcome step initially", async () => {
    const w = createView();
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.text()).toContain("\u6b22\u8fce\u4f7f\u7528\u793e\u5a92\u7ba1\u5bb6");
  });

  it("advances to next step on click", async () => {
    const w = createView();
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    const btn = w.find("button");
    if (btn.exists()) {
      await btn.trigger("click");
      await nextTick();
      expect(w.vm.currentStep).toBe(1);
    }
  });

  it("notify shows notification and auto-hides", async () => {
    vi.useFakeTimers();
    const w = createView();
    await nextTick();
    w.vm.notify("Test message", "success");
    expect(w.vm.showNotification).toBe(true);
    expect(w.vm.notificationMsg).toBe("Test message");
    expect(w.vm.notificationType).toBe("success");
    vi.advanceTimersByTime(3000);
    expect(w.vm.showNotification).toBe(false);
    vi.useRealTimers();
  });

  it("notify defaults to success type", async () => {
    vi.useFakeTimers();
    const w = createView();
    await nextTick();
    w.vm.notify("Hello");
    expect(w.vm.notificationType).toBe("success");
    vi.useRealTimers();
  });

  it("addAccount opens auth login via electronAPI", async () => {
    window.electronAPI.authOpenLogin = vi.fn().mockResolvedValue({ code: 0 });
    const w = createView();
    await nextTick();
    await w.vm.addAccount("douyin");
    expect(window.electronAPI.authOpenLogin).toHaveBeenCalledWith("douyin");
    expect(w.vm.addingPlatform).toBe("");
  });

  it("addAccount handles authOpenLogin error", async () => {
    window.electronAPI.authOpenLogin = vi.fn().mockResolvedValue({ code: 1, message: "login failed" });
    const spy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const w = createView();
    await nextTick();
    await w.vm.addAccount("douyin");
    expect(spy).toHaveBeenCalledWith("login failed");
    spy.mockRestore();
  });

  it("addAccount falls back to accountAdd when authOpenLogin missing", async () => {
    window.electronAPI.accountAdd = vi.fn().mockResolvedValue({ code: 0 });
    const spy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const w = createView();
    await nextTick();
    await w.vm.addAccount("zhihu");
    expect(window.electronAPI.accountAdd).toHaveBeenCalledWith("zhihu");
    spy.mockRestore();
  });

  it("addAccount catches exception", async () => {
    window.electronAPI.authOpenLogin = vi.fn().mockRejectedValue(new Error("network error"));
    const spy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const w = createView();
    await nextTick();
    await w.vm.addAccount("douyin");
    expect(spy).toHaveBeenCalledWith("network error");
    spy.mockRestore();
  });

  it("retryDeps resets error state", async () => {
    const w = createView();
    await nextTick();
    w.vm.depError = true;
    w.vm.depErrorMessage = "Some error";
    w.vm.depSteps.value = [
      { label: "Python", status: "error", message: "fail" },
    ];
    w.vm.retryDeps();
    expect(w.vm.depError).toBe(false);
    expect(w.vm.depSteps[0].status).toBe("pending");
  });

  it("currentStep advances through all steps", async () => {
    const w = createView();
    await nextTick();
    expect(w.vm.currentStep).toBe(0);
    w.vm.currentStep = 1;
    await nextTick();
    expect(w.vm.currentStep).toBe(1);
    w.vm.currentStep = 2;
    await nextTick();
    expect(w.vm.currentStep).toBe(2);
    w.vm.currentStep = 3;
    await nextTick();
    expect(w.vm.currentStep).toBe(3);
  });

  it("quickPlatforms has 6 platforms", async () => {
    const w = createView();
    await nextTick();
    expect(w.vm.quickPlatforms.length).toBe(6);
  });

  it("allDepsDone allows step advance", async () => {
    const w = createView();
    await nextTick();
    w.vm.allDepsDone = true;
    await nextTick();
    expect(w.vm.allDepsDone).toBe(true);
  });
});

describe("FirstRunView — extra coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {};
  });

  it("onFirstRunStatus step type updates depStep", async () => {
    const mocks = await import("@/api/publisher");
    var cb = null;
    mocks.onFirstRunStatus.mockImplementation(callback => { cb = callback; return vi.fn(); });
    const w = mount(FirstRunView, { global: { plugins: [createPinia()] } });
    await nextTick();
    cb({ type: "step", data: { step: "python", message: "installing..." } });
    await nextTick();
    expect(w.vm.depSteps[0].status).toBe("active");
    expect(w.vm.depSteps[0].message).toBe("installing...");
  });

  it("onFirstRunStatus done type marks all done", async () => {
    const mocks = await import("@/api/publisher");
    var cb = null;
    mocks.onFirstRunStatus.mockImplementation(callback => { cb = callback; return vi.fn(); });
    const w = mount(FirstRunView, { global: { plugins: [createPinia()] } });
    await nextTick();
    cb({ type: "done" });
    await nextTick();
    expect(w.vm.allDepsDone).toBe(true);
    expect(w.vm.depSteps.every(s => s.status === "done")).toBe(true);
  });

  it("onFirstRunStatus error type sets depError", async () => {
    const mocks = await import("@/api/publisher");
    var cb = null;
    mocks.onFirstRunStatus.mockImplementation(callback => { cb = callback; return vi.fn(); });
    mocks.firstRunCheck.mockResolvedValue({ setupDone: false });
    const w = mount(FirstRunView, { global: { plugins: [createPinia()] } });
    await nextTick();
    // Set a step as active first so error handler finds it
    w.vm.depSteps[0].status = "active";
    cb({ type: "error", data: { data: "Connection failed" } });
    await nextTick();
    expect(w.vm.depError).toBe(true);
    expect(w.vm.depErrorMessage).toBe("Connection failed");
  });

  it("firstRunCheck setupDone skips deps step", async () => {
    const mocks = await import("@/api/publisher");
    mocks.firstRunCheck.mockResolvedValue({ setupDone: true });
    const w = mount(FirstRunView, { global: { plugins: [createPinia()] } });
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.vm.allDepsDone).toBe(true);
    expect(w.vm.currentStep).toBe(1);
  });

  it("renders account step (step 2)", async () => {
    const w = mount(FirstRunView, { global: { plugins: [createPinia()] } });
    await nextTick();
    w.vm.currentStep = 2;
    await nextTick();
    expect(w.text()).toContain("添加账号");
  });

  it("renders quick publish tutorial step (step 3)", async () => {
    const w = mount(FirstRunView, { global: { plugins: [createPinia()] } });
    await nextTick();
    w.vm.currentStep = 3;
    await nextTick();
    expect(w.text()).toContain("准备完毕");
  });
});

