import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useTemplateStore } from "./templates.js";

describe("useTemplateStore", () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); delete window.electronAPI; });

  it("initial state is empty", () => {
    const s = useTemplateStore();
    expect(s.templates).toEqual([]); expect(s.loading).toBe(false);
    expect(s.categories).toEqual([]);
  });

  it("load() fetches templates from electronAPI", async () => {
    window.electronAPI = { templateList: vi.fn().mockResolvedValue({ code: 0, data: [{ id: "t1", title: "Template 1" }] }) };
    const s = useTemplateStore(); await s.load();
    expect(s.templates.length).toBe(1); expect(s.templates[0].title).toBe("Template 1");
  });

  it("load() handles missing electronAPI", async () => {
    const s = useTemplateStore(); await s.load();
    expect(s.templates).toEqual([]);
  });

  it("load() handles API error", async () => {
    window.electronAPI = { templateList: vi.fn().mockRejectedValue(new Error("fail")) };
    const s = useTemplateStore(); await s.load();
    expect(s.templates).toEqual([]); expect(s.error).toBe("fail");
  });

  it("add() adds template via electronAPI", async () => {
    window.electronAPI = { templateAdd: vi.fn().mockResolvedValue({ code: 0, data: { id: "t2", title: "New" } }) };
    const s = useTemplateStore(); var result = await s.add({ title: "New" });
    expect(result.id).toBe("t2"); expect(s.templates.length).toBe(1);
    expect(window.electronAPI.templateAdd).toHaveBeenCalledWith({ title: "New" });
  });

  it("add() returns null on API failure", async () => {
    window.electronAPI = { templateAdd: vi.fn().mockResolvedValue({ code: 1 }) };
    const s = useTemplateStore(); var result = await s.add({ title: "X" });
    expect(result).toBeNull();
  });

  it("update() updates template in store", async () => {
    window.electronAPI = { templateUpdate: vi.fn().mockResolvedValue({ code: 0, data: { id: "t1", title: "Updated" } }) };
    const s = useTemplateStore(); s.templates = [{ id: "t1", title: "Old" }];
    var result = await s.update("t1", { title: "Updated" });
    expect(result.title).toBe("Updated"); expect(s.templates[0].title).toBe("Updated");
  });

  it("remove() removes template from store", async () => {
    window.electronAPI = { templateDelete: vi.fn().mockResolvedValue({ code: 0 }) };
    const s = useTemplateStore(); s.templates = [{ id: "t1", title: "X" }];
    var result = await s.remove("t1");
    expect(result).toBe(true); expect(s.templates.length).toBe(0);
  });

  it("byCategory groups templates correctly", () => {
    const s = useTemplateStore();
    s.templates = [{ id: "t1", category: "tech" }, { id: "t2", category: "tech" }, { id: "t3", category: "life" } ];
    expect(s.byCategory.tech.length).toBe(2);
    expect(s.byCategory.life.length).toBe(1);
    expect(s.categories).toEqual(["tech", "life"]);
  });

  it("byCategory defaults to other", () => {
    const s = useTemplateStore();
    s.templates = [{ id: "t1" }]; // no category
    expect(s.byCategory.other.length).toBe(1);
  });
});

