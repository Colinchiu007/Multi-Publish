import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { ElMessage } from "element-plus";

vi.mock("element-plus", () => ({
  ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() }
}));

const pushSpy = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: pushSpy })
}));

import CollectionView from "./Collection.vue";

describe("CollectionView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {};
  });

  it("renders page title and buttons", async () => {
    const w = mount(CollectionView);
    await nextTick();
    expect(w.text()).toContain("内容采集");
    expect(w.text()).toContain("新建草稿");
  });

  it("creates a new draft and navigates", async () => {
    const w = mount(CollectionView);
    await nextTick();
    w.vm.createDraft();
    await nextTick();
    expect(w.vm.drafts.length).toBe(1);
    expect(pushSpy).toHaveBeenCalledWith("/publish?draft=" + w.vm.drafts[0].id);
  });

  it("imports from clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: vi.fn().mockResolvedValue("Title line\nContent here") },
      writable: true, configurable: true
    });
    const w = mount(CollectionView);
    await nextTick();
    await w.vm.importFromClipboard();
    await nextTick();
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].title).toBe("Title line");
    expect(ElMessage.success).toHaveBeenCalled();
  });

  it("handles clipboard read failure", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: vi.fn().mockRejectedValue(new Error("denied")) },
      writable: true, configurable: true
    });
    const w = mount(CollectionView);
    await nextTick();
    await w.vm.importFromClipboard();
    await nextTick();
    expect(ElMessage.error).toHaveBeenCalled();
  });

  it("shows drafts list", async () => {
    const w = mount(CollectionView);
    await nextTick();
    w.vm.drafts = [{ id: "d1", title: "Saved Draft", content: "hello", source: "manual", created_at: "2026-07-05" }];
    await nextTick();
    expect(w.text()).toContain("Saved Draft");
  });
});
