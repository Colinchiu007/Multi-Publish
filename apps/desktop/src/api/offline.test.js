import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

// Need to test offlineStatus behavior through Publish.vue handlePublish
// We mock publisher API to verify offline flow
describe("offline mode integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {};
  });

  it("offlineStatus API returns offline state", async () => {
    window.electronAPI = { offlineStatus: vi.fn().mockResolvedValue({ code: 0, data: { offline: true, cachedCount: 3, cachedTasks: [] } }) };
    const { offlineStatus } = await import("@/api/publisher");
    const res = await offlineStatus();
    expect(res.code).toBe(0);
    expect(res.data.offline).toBe(true);
    expect(res.data.cachedCount).toBe(3);
  });

  it("offlineAddToCache caches a task", async () => {
    window.electronAPI = { offlineAddToCache: vi.fn().mockResolvedValue({ code: 0, message: "已缓存" }) };
    const { offlineAddToCache } = await import("@/api/publisher");
    const res = await offlineAddToCache({ targets: [{ platform: "weibo" }], data: { title: "test" } });
    expect(res.code).toBe(0);
  });

  it("offlineStatus falls back gracefully when electronAPI missing", async () => {
    delete window.electronAPI;
    const { offlineStatus } = await import("@/api/publisher");
    const res = await offlineStatus();
    expect(res.code).toBe(-1);
  });

  it("offlineAddToCache falls back gracefully when electronAPI missing", async () => {
    delete window.electronAPI;
    const { offlineAddToCache } = await import("@/api/publisher");
    const res = await offlineAddToCache({});
    expect(res.code).toBe(-1);
  });

  it("offlineClearCache clears cached tasks", async () => {
    window.electronAPI = { offlineClearCache: vi.fn().mockResolvedValue({ code: 0 }) };
    const { offlineClearCache } = await import("@/api/publisher");
    const res = await offlineClearCache();
    expect(res.code).toBe(0);
  });

  it("onOfflineRestored returns cleanup function", async () => {
    window.electronAPI = { onOfflineRestored: vi.fn(() => vi.fn()) };
    const { onOfflineRestored } = await import("@/api/publisher");
    const cleanup = onOfflineRestored(() => {});
    expect(typeof cleanup).toBe("function");
  });

  it("onOfflineRestored returns noop when electronAPI missing", async () => {
    delete window.electronAPI;
    const { onOfflineRestored } = await import("@/api/publisher");
    const cleanup = onOfflineRestored(() => {});
    expect(typeof cleanup).toBe("function");
  });
});
