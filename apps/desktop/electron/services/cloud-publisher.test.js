import { describe, it, expect, vi } from "vitest";

vi.mock("../services/logger", () => ({ log: { error: vi.fn(), info: vi.fn() } }));

const CloudPublisher = require("../services/cloud-publisher");

describe("CloudPublisher", () => {
  let mockAxios;

  beforeEach(() => {
    mockAxios = { post: vi.fn(), get: vi.fn() };
  });

  describe("constructor", () => {
    it("default orchestrator URL", () => {
      expect(new CloudPublisher({ axios: mockAxios })._orchestratorUrl).toBe("http://39.105.42.85");
    });
    it("custom URL", () => {
      const cp = new CloudPublisher({ axios: mockAxios, orchestratorUrl: "http://x:3000" });
      expect(cp._orchestratorUrl).toBe("http://x:3000");
    });
    it("injects axios instance", () => {
      const cp = new CloudPublisher({ axios: mockAxios });
      expect(cp._axios).toBe(mockAxios);
    });
  });

  describe("getSupportedPlatforms()", () => {
    it("returns array with id+name", () => {
      const p = new CloudPublisher({ axios: mockAxios }).getSupportedPlatforms();
      expect(p.length).toBeGreaterThanOrEqual(2);
      expect(p[0]).toHaveProperty("id");
    });
    it("includes bilibili and douyin", () => {
      const ids = new CloudPublisher({ axios: mockAxios }).getSupportedPlatforms().map(x => x.id);
      expect(ids).toContain("bilibili");
      expect(ids).toContain("douyin");
    });
  });

  describe("submitTask()", () => {
    it("POST with full payload", async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { task_id: "t1", status: "queued" } });
      const cp = new CloudPublisher({ axios: mockAxios, orchestratorUrl: "http://t" });
      const r = await cp.submitTask({ videoUrl: "u.mp4", platform: "bili", title: "t", desc: "d", tags: ["a"], coverUrl: "c.jpg" });
      expect(mockAxios.post).toHaveBeenCalledWith("http://t/api/jobs/publish-video", expect.objectContaining({
        video_url: "u.mp4", platform: "bili", mode: "cloud",
      }));
      expect(r).toEqual({ task_id: "t1", status: "queued" });
    });

    it("POST with minimal payload (defaults)", async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { task_id: "t2" } });
      await new CloudPublisher({ axios: mockAxios, orchestratorUrl: "http://t" }).submitTask({ videoUrl: "v.mp4", platform: "dy", title: "x" });
      expect(mockAxios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        desc: "", tags: [], cover_url: "",
      }));
    });
  });

  describe("listTasks()", () => {
    it("GET /api/jobs/publish", async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { items: [{ id: "t1" }] } });
      const r = await new CloudPublisher({ axios: mockAxios, orchestratorUrl: "http://t" }).listTasks();
      expect(mockAxios.get).toHaveBeenCalledWith("http://t/api/jobs/publish");
      expect(r).toEqual({ items: [{ id: "t1" }] });
    });
  });

  describe("getTask()", () => {
    it("GET with taskId", async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { id: "abc", status: "done" } });
      const r = await new CloudPublisher({ axios: mockAxios, orchestratorUrl: "http://t" }).getTask("abc");
      expect(mockAxios.get).toHaveBeenCalledWith("http://t/api/jobs/publish/abc");
      expect(r).toEqual({ id: "abc", status: "done" });
    });
  });

  describe("registerIpcHandlers()", () => {
    it("throws in non-electron env", () => {
      expect(() => new CloudPublisher({ axios: mockAxios }).registerIpcHandlers()).toThrow();
    });
  });
});