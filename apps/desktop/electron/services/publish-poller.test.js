import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../services/logger", () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

const PublishPoller = require("../services/publish-poller");

describe("PublishPoller", () => {
  let mockAxios;

  beforeEach(() => {
    mockAxios = { get: vi.fn(), put: vi.fn() };
  });

  afterEach(() => {
    // ??????????
  });

  describe("constructor", () => {
    it("defaults orchestratorUrl to empty when no env var (security: no hardcoded IP)", () => {
      const saved = process.env.ORCHESTRATOR_URL
      delete process.env.ORCHESTRATOR_URL
      const p = new PublishPoller({ axios: mockAxios });
      expect(p.orchestratorUrl).toBe("");
      if (saved) process.env.ORCHESTRATOR_URL = saved
    });
    it("reads orchestratorUrl from env var", () => {
      const saved = process.env.ORCHESTRATOR_URL
      process.env.ORCHESTRATOR_URL = "https://env.example.com"
      const p = new PublishPoller({ axios: mockAxios });
      expect(p.orchestratorUrl).toBe("https://env.example.com");
      if (saved) process.env.ORCHESTRATOR_URL = saved
      else delete process.env.ORCHESTRATOR_URL
    });
    it("accepts custom URL", () => {
      const p = new PublishPoller({ axios: mockAxios, orchestratorUrl: "http://x" });
      expect(p.orchestratorUrl).toBe("http://x");
    });
    it("injects axios", () => {
      const p = new PublishPoller({ axios: mockAxios });
      expect(p._axios).toBe(mockAxios);
    });
    it("default pollInterval 2000", () => {
      expect(new PublishPoller({ axios: mockAxios }).pollInterval).toBe(2000);
    });
  });

  describe("start()/stop()", () => {
    it("start sets _running and _timer", () => {
      const p = new PublishPoller({ axios: mockAxios });
      p.start();
      expect(p._running).toBe(true);
      expect(p._timer).toBeDefined();
      p.stop();
    });
    it("stop clears _running and _timer", () => {
      const p = new PublishPoller({ axios: mockAxios });
      p.start();
      p.stop();
      expect(p._running).toBe(false);
      expect(p._timer).toBeNull();
    });
    it("start is idempotent (multiple calls safe)", () => {
      const p = new PublishPoller({ axios: mockAxios });
      p.start();
      const t1 = p._timer;
      p.start();
      expect(p._timer).toBe(t1);
      p.stop();
    });
    it("stop is idempotent", () => {
      const p = new PublishPoller({ axios: mockAxios });
      p.stop();
      p.stop();
      expect(p._running).toBe(false);
    });
  });

  describe("_isRpaEnabled()", () => {
    it("returns true when no rpaCheck", () => {
      const p = new PublishPoller({ axios: mockAxios });
      expect(p._isRpaEnabled("any")).toBe(true);
    });
    it("delegates to rpaCheck when provided", () => {
      const check = vi.fn(() => false);
      const p = new PublishPoller({ axios: mockAxios, rpaCheck: check });
      expect(p._isRpaEnabled("wx")).toBe(false);
      expect(check).toHaveBeenCalledWith("wx");
    });
  });

  describe("_poll()", () => {
    it("fetches pending and processes tasks", async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { items: [{ id: "t1", input_data: { platform: "wx", video_url: "http://v" } }] } });
      const p = new PublishPoller({ axios: mockAxios, orchestratorUrl: "http://t" });
      await p._poll();
      expect(mockAxios.get).toHaveBeenCalledWith("http://t/api/jobs/publish/pending");
    });
    it("handles empty response", async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { items: [] } });
      await new PublishPoller({ axios: mockAxios })._poll();
    });
    it("handles null items", async () => {
      mockAxios.get.mockResolvedValueOnce({ data: {} });
      await new PublishPoller({ axios: mockAxios })._poll();
    });
    it("handles get error gracefully", async () => {
      mockAxios.get.mockRejectedValueOnce(new Error("network"));
      await new PublishPoller({ axios: mockAxios })._poll();
    });
  });

  describe("_updateTaskStatus()", () => {
    it("PUT with status", async () => {
      mockAxios.put.mockResolvedValueOnce({});
      const p = new PublishPoller({ axios: mockAxios, orchestratorUrl: "http://t" });
      await p._updateTaskStatus("t1", "success", { msg: "ok" });
      expect(mockAxios.put).toHaveBeenCalledWith(
        "http://t/api/jobs/publish/t1/status",
        { status: "success", output: { msg: "ok" } }
      );
    });
    it("PUT with error", async () => {
      mockAxios.put.mockResolvedValueOnce({});
      const p = new PublishPoller({ axios: mockAxios, orchestratorUrl: "http://t" });
      await p._updateTaskStatus("t1", "failed", null, "err msg");
      expect(mockAxios.put).toHaveBeenCalledWith(expect.any(String), { status: "failed", error: "err msg" });
    });
  });

  describe("edge cases", () => {
    it("stop before start is safe", () => {
      const p = new PublishPoller({ axios: mockAxios });
      expect(() => p.stop()).not.toThrow();
    });
    it("start then immediate stop", () => {
      const p = new PublishPoller({ axios: mockAxios });
      p.start();
      p.stop();
      expect(p._running).toBe(false);
    });
  });
});