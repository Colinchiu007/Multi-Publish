import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { usePlatformStore } from "./platforms.js";

describe("usePlatformStore", () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); delete window.electronAPI; });

  it("initial state is empty before load", () => {
    const s = usePlatformStore();
    expect(s.platforms).toEqual([]); expect(s.loaded).toBe(false);
  });

  it("load() uses fallback when electronAPI missing", async () => {
    const s = usePlatformStore(); await s.load();
    expect(s.loaded).toBe(true);
    expect(s.platforms.length).toBeGreaterThan(10);
    expect(s.getLabel("wechat_mp")).toBe("微信公众号");
    expect(s.getIcon("douyin")).toBe("🎵");
  });

  it("load() fetches from electronAPI when available", async () => {
    window.electronAPI = { getPlatformDefinitions: vi.fn().mockResolvedValue({ code: 0, data: { names: { test: "Test Platform" }, icons: { test: "🔬" } } }) };
    const s = usePlatformStore(); await s.load();
    expect(s.platforms).toEqual([{ id: "test", label: "Test Platform" }]);
    expect(s.getIcon("test")).toBe("🔬");
  });

  it("load() falls back on API error", async () => {
    window.electronAPI = { getPlatformDefinitions: vi.fn().mockRejectedValue(new Error("fail")) };
    const s = usePlatformStore(); await s.load();
    expect(s.loaded).toBe(true);
    expect(s.platforms.length).toBeGreaterThan(10); // fallback
  });

  it("load() skips if already loaded", async () => {
    window.electronAPI = { getPlatformDefinitions: vi.fn() };
    const s = usePlatformStore();
    s.loaded = true; // already loaded
    await s.load();
    expect(window.electronAPI.getPlatformDefinitions).not.toHaveBeenCalled();
  });

  it("getLabel returns id as fallback", () => {
    const s = usePlatformStore();
    expect(s.getLabel("unknown_id")).toBe("unknown_id");
  });

  it("getIcon returns empty string as fallback", () => {
    const s = usePlatformStore();
    expect(s.getIcon("unknown_id")).toBe("");
  });
});

