import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

vi.mock("element-plus", () => ({
  ElMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue(undefined) },
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

  it("loadDrafts reads from electronAPI on mount", async () => {
    window.electronAPI = {
      storeGetSetting: vi.fn().mockResolvedValue(JSON.stringify([
        { id: "d1", title: "Saved", content: "hello", source: "manual", created_at: "2026-07-05" }
      ]))
    };
    const w = mount(CollectionView);
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(window.electronAPI.storeGetSetting).toHaveBeenCalledWith("drafts", "[]");
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].title).toBe("Saved");
  });

  it("loadDrafts handles missing API gracefully", async () => {
    window.electronAPI = {};
    const w = mount(CollectionView);
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.vm.drafts).toEqual([]);
  });

  it("loadDrafts handles JSON parse failure", async () => {
    window.electronAPI = {
      storeGetSetting: vi.fn().mockResolvedValue("invalid json{{{")
    };
    const w = mount(CollectionView);
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.vm.drafts).toEqual([]);
  });

  it("saveDrafts calls electronAPI.storeSetSetting", async () => {
    window.electronAPI = {
      storeSetSetting: vi.fn().mockResolvedValue(undefined)
    };
    const w = mount(CollectionView);
    await nextTick();
    w.vm.drafts = [{ id: "d1", title: "Test" }];
    await w.vm.saveDrafts();
    expect(window.electronAPI.storeSetSetting).toHaveBeenCalledWith("drafts", JSON.stringify([{ id: "d1", title: "Test" }]));
  });

  it("saveDrafts handles missing API gracefully", async () => {
    window.electronAPI = {};
    const w = mount(CollectionView);
    await nextTick();
    w.vm.drafts = [{ id: "d1" }];
    await w.vm.saveDrafts();
    expect(w.vm.drafts.length).toBe(1);
  });

  it("creates a new draft and navigates", async () => {
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mount(CollectionView);
    await nextTick();
    w.vm.createDraft();
    await nextTick();
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].source).toBe("manual");
    expect(pushSpy).toHaveBeenCalledWith("/publish?draft=" + w.vm.drafts[0].id);
  });

  it("imports from clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: vi.fn().mockResolvedValue("Title line\nContent here") },
      writable: true, configurable: true
    });
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mount(CollectionView);
    await nextTick();
    await w.vm.importFromClipboard();
    await nextTick();
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].title).toBe("Title line");
    const { ElMessage } = await import("element-plus");
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
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalled();
  });

  it("handles empty clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: vi.fn().mockResolvedValue("") },
      writable: true, configurable: true
    });
    const w = mount(CollectionView);
    await nextTick();
    await w.vm.importFromClipboard();
    await nextTick();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.warning).toHaveBeenCalled();
  });

  it("openCollection opens webview tab when API available", async () => {
    window.electronAPI = {
      webviewOpenTab: vi.fn().mockResolvedValue(undefined)
    };
    const w = mount(CollectionView);
    await nextTick();
    await w.vm.openCollection("weibo");
    expect(window.electronAPI.webviewOpenTab).toHaveBeenCalledWith({ platform: "weibo" });
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
  });

  it("openCollection shows info when no webview API", async () => {
    window.electronAPI = {};
    const w = mount(CollectionView);
    await nextTick();
    await w.vm.openCollection("zhihu");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.info).toHaveBeenCalled();
  });

  it("editDraft navigates to publish", async () => {
    const w = mount(CollectionView);
    await nextTick();
    await w.vm.editDraft({ id: "d1" });
    expect(pushSpy).toHaveBeenCalledWith("/publish?draft=d1");
  });

  it("goPublish navigates to publish", async () => {
    const w = mount(CollectionView);
    await nextTick();
    await w.vm.goPublish({ id: "d2" });
    expect(pushSpy).toHaveBeenCalledWith("/publish?draft=d2");
  });

  it("deleteDraft confirms and removes draft", async () => {
    const { ElMessageBox } = await import("element-plus");
    ElMessageBox.confirm.mockResolvedValue(undefined);
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mount(CollectionView);
    await nextTick();
    w.vm.drafts = [{ id: "d1" }, { id: "d2" }];
    await w.vm.deleteDraft({ id: "d1" });
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].id).toBe("d2");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
  });

  it("deleteDraft does nothing on cancel", async () => {
    const { ElMessageBox } = await import("element-plus");
    ElMessageBox.confirm.mockRejectedValue(new Error("canceled"));
    const w = mount(CollectionView);
    await nextTick();
    w.vm.drafts = [{ id: "d1" }];
    await w.vm.deleteDraft({ id: "d1" });
    expect(w.vm.drafts.length).toBe(1);
  });

  it("collectUrl warns if no urlCollect API", async () => {
    window.electronAPI = {};
    const w = mount(CollectionView);
    await nextTick();
    w.vm.linkUrl = "https://example.com";
    await w.vm.collectUrl();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.warning).toHaveBeenCalled();
  });

  it("collectUrl warns if URL is empty", async () => {
    window.electronAPI = {
      urlCollect: vi.fn()
    };
    const w = mount(CollectionView);
    await nextTick();
    w.vm.linkUrl = "";
    await w.vm.collectUrl();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.warning).toHaveBeenCalled();
  });

  it("collectUrl succeeds with API", async () => {
    window.electronAPI = {
      urlCollect: vi.fn().mockResolvedValue({ code: 0, data: { title: "Article", description: "Desc", coverImage: "img.jpg" } })
    };
    const w = mount(CollectionView);
    await nextTick();
    w.vm.linkUrl = "https://example.com/article";
    await w.vm.collectUrl();
    expect(window.electronAPI.urlCollect).toHaveBeenCalledWith("https://example.com/article");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
    expect(w.vm.collectedResult).toBeTruthy();
    expect(w.vm.collectedResult.title).toBe("Article");
  });

  it("collectUrl shows error on API failure", async () => {
    window.electronAPI = {
      urlCollect: vi.fn().mockResolvedValue({ code: 1, message: "collection failed" })
    };
    const w = mount(CollectionView);
    await nextTick();
    w.vm.linkUrl = "https://example.com/fail";
    await w.vm.collectUrl();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalledWith("collection failed");
  });

  it("collectUrl catches exception", async () => {
    window.electronAPI = {
      urlCollect: vi.fn().mockRejectedValue(new Error("network error"))
    };
    const w = mount(CollectionView);
    await nextTick();
    w.vm.linkUrl = "https://example.com/error";
    await w.vm.collectUrl();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalled();
  });

  it("creates draft from collected result", async () => {
    window.electronAPI = { storeSetSetting: vi.fn() };
    const w = mount(CollectionView);
    await nextTick();
    w.vm.collectedResult = { title: "Article", content: "Content", coverImage: "img.jpg", source: "url" };
    w.vm.linkUrl = "https://example.com/article";
    await w.vm.createFromCollected();
    expect(w.vm.drafts.length).toBe(1);
    expect(w.vm.drafts[0].title).toBe("Article");
    expect(w.vm.drafts[0].content).toBe("Content");
    expect(w.vm.drafts[0].coverImage).toBe("img.jpg");
    expect(w.vm.collectedResult).toBeNull();
    expect(w.vm.linkUrl).toBe("");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.success).toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalled();
  });

  it("createFromCollected does nothing if no collected result", async () => {
    const w = mount(CollectionView);
    await nextTick();
    w.vm.collectedResult = null;
    w.vm.drafts = [];
    await w.vm.createFromCollected();
    expect(w.vm.drafts.length).toBe(0);
  });

  it("shows empty state when no drafts", async () => {
    const w = mount(CollectionView);
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.text()).toContain("暂无草稿");
  });

  it("shows drafts list", async () => {
    const w = mount(CollectionView);
    await nextTick();
    w.vm.drafts = [{ id: "d1", title: "Saved Draft", content: "hello", source: "manual", created_at: "2026-07-05" }];
    await nextTick();
    expect(w.text()).toContain("Saved Draft");
  });
});
