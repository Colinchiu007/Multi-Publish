import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Global mocks — must be at top level for hoisting ----
const { createMockLogger } = require("./test-helpers");
vi.mock("../services/logger", () => createMockLogger());
vi.mock("axios", () => ({ default: { get: vi.fn().mockResolvedValue({ data: { data: { list: [] } } }) } }));

// ---- Offline Manager (JS implementation) ----
describe("offline-manager", () => {
  let offline;

  beforeEach(() => {
    vi.resetModules();
    offline = require("../services/offline-manager");
  });

  describe("exports", () => {
    it("exports all expected functions", () => {
      expect(typeof offline.isOffline).toBe("function");
      expect(typeof offline.loadCache).toBe("function");
      expect(typeof offline.saveCache).toBe("function");
      expect(typeof offline.addToCache).toBe("function");
      expect(typeof offline.clearSuccessfulTasks).toBe("function");
      expect(typeof offline.clearAllCached).toBe("function");
      expect(typeof offline.onNetworkChange).toBe("function");
      expect(typeof offline.startMonitoring).toBe("function");
      expect(typeof offline.getStatus).toBe("function");
      expect(typeof offline.setTaskQueue).toBe("function");
      expect(typeof offline.processCachedTasks).toBe("function");
    });
  });

  describe("isOffline()", () => {
    it("returns boolean (default false)", () => {
      expect(typeof offline.isOffline()).toBe("boolean");
    });

    it("reflects onNetworkChange calls", () => {
      offline.onNetworkChange(true);
      expect(offline.isOffline()).toBe(true);
      offline.onNetworkChange(false);
      expect(offline.isOffline()).toBe(false);
    });
  });

  describe("getStatus()", () => {
    it("returns status with JS API shape: offline/cachedCount/cachedTasks", () => {
      const status = offline.getStatus();
      expect(status).toHaveProperty("offline");
      expect(status).toHaveProperty("cachedCount");
      expect(status).toHaveProperty("cachedTasks");
      expect(typeof status.offline).toBe("boolean");
      expect(typeof status.cachedCount).toBe("number");
      expect(Array.isArray(status.cachedTasks)).toBe(true);
    });

    it("cachedCount equals cachedTasks.length", () => {
      const status = offline.getStatus();
      expect(status.cachedCount).toBe(status.cachedTasks.length);
    });
  });

  describe("setTaskQueue()", () => {
    it("stores queue reference", () => {
      const mockQueue = { add: vi.fn() };
      expect(() => offline.setTaskQueue(mockQueue)).not.toThrow();
    });

    it("accepts null gracefully", () => {
      expect(() => offline.setTaskQueue(null)).not.toThrow();
    });
  });

  describe("processCachedTasks()", () => {
    it("returns 0 when no taskQueue set", () => {
      expect(offline.processCachedTasks()).toBe(0);
    });
  });

  describe("clearAllCached()", () => {
    it("does not throw", () => {
      expect(() => offline.clearAllCached()).not.toThrow();
    });

    it("clears cachedCount to 0", () => {
      offline.clearAllCached();
      expect(offline.getStatus().cachedCount).toBe(0);
    });
  });

  describe("startMonitoring()", () => {
    it("accepts no args", () => {
      expect(() => offline.startMonitoring()).not.toThrow();
    });

    it("accepts mainWin arg", () => {
      const mockWin = { webContents: { send: vi.fn() }, isDestroyed: () => false };
      expect(() => offline.startMonitoring(mockWin)).not.toThrow();
    });
  });

  describe("edge cases", () => {
    it("handles repeated onNetworkChange toggles", () => {
      for (let i = 0; i < 10; i++) offline.onNetworkChange(i % 2 === 0);
      expect(offline.isOffline()).toBe(false);
    });
  });
});

// ---- Publish Monitor (JS implementation) ----
describe("publish-monitor", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("exports", () => {
    it("exports expected API", () => {
      const m = require("../services/publish-monitor");
      expect(typeof m.createMonitorTask).toBe("function");
      expect(typeof m.checkPublishStatus).toBe("function");
      expect(typeof m.POLL_INTERVAL).toBe("number");
      expect(typeof m.MAX_RETRIES).toBe("number");
    });
  });

  describe("constants", () => {
    it("POLL_INTERVAL is positive", () => {
      expect(require("../services/publish-monitor").POLL_INTERVAL).toBeGreaterThan(0);
    });

    it("MAX_RETRIES is positive integer", () => {
      const m = require("../services/publish-monitor");
      expect(m.MAX_RETRIES).toBeGreaterThan(0);
      expect(Number.isInteger(m.MAX_RETRIES)).toBe(true);
    });
  });

  describe("createMonitorTask()", () => {
    it("creates task with stop()", () => {
      const m = require("../services/publish-monitor");
      const t = m.createMonitorTask({ postId: "t1", platform: "weibo", cookies: "", callback: vi.fn() });
      expect(t).toBeDefined();
      expect(typeof t.stop).toBe("function");
      t.stop();
    });

    it("calls callback with skipped for unsupported platform", () => {
      const cb = vi.fn();
      const m = require("../services/publish-monitor");
      const t = m.createMonitorTask({ postId: "t2", platform: "no_such_platform", callback: cb });
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ status: "skipped" }));
      t.stop();
    });

    it("handles missing platform", () => {
      const cb = vi.fn();
      const m = require("../services/publish-monitor");
      const t = m.createMonitorTask({ postId: "t3", callback: cb });
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ status: "skipped" }));
      t.stop();
    });
  });

  describe("checkPublishStatus()", () => {
    it("returns status for nonexistent task", async () => {
      const m = require("../services/publish-monitor");
      const r = await m.checkPublishStatus("x", "weibo", "", "https://x.com/api");
      expect(r).toHaveProperty("status");
      expect(r).toHaveProperty("postId");
    }, 15000);
  });

  describe("edge cases", () => {
    it("multiple stop() calls safe", () => {
      const m = require("../services/publish-monitor");
      const t = m.createMonitorTask({ postId: "t4", platform: "weibo", callback: vi.fn() });
      expect(() => { t.stop(); t.stop(); t.stop(); }).not.toThrow();
    });
  });
});