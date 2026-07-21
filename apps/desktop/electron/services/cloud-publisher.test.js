import { describe, it, expect, vi } from "vitest";

vi.mock("../services/logger", () => ({ log: { error: vi.fn(), info: vi.fn() } }));

const CloudPublisher = require("../services/cloud-publisher");
const { EC } = require("../ipc-handlers/helpers");

describe("CloudPublisher", () => {
  let mockAxios;

  beforeEach(() => {
    mockAxios = { post: vi.fn(), get: vi.fn() };
  });

  describe("constructor", () => {
    it("default orchestrator URL is empty when no env var (security: no hardcoded IP)", () => {
      const hadValue = Object.prototype.hasOwnProperty.call(process.env, "ORCHESTRATOR_URL");
      const saved = process.env.ORCHESTRATOR_URL
      try {
        delete process.env.ORCHESTRATOR_URL
        expect(new CloudPublisher({ axios: mockAxios })._orchestratorUrl).toBe("");
      } finally {
        if (hadValue) process.env.ORCHESTRATOR_URL = saved
        else delete process.env.ORCHESTRATOR_URL
      }
    });
    it("reads orchestrator URL from env var", () => {
      const hadValue = Object.prototype.hasOwnProperty.call(process.env, "ORCHESTRATOR_URL");
      const saved = process.env.ORCHESTRATOR_URL
      try {
        process.env.ORCHESTRATOR_URL = "https://env.example.com"
        expect(new CloudPublisher({ axios: mockAxios })._orchestratorUrl).toBe("https://env.example.com");
      } finally {
        if (hadValue) process.env.ORCHESTRATOR_URL = saved
        else delete process.env.ORCHESTRATOR_URL
      }
    });
    it("custom URL", () => {
      const cp = new CloudPublisher({ axios: mockAxios, orchestratorUrl: "http://x:3000" });
      expect(cp._orchestratorUrl).toBe("http://x:3000");
    });
    it("身份认证开启时拒绝向远程 HTTP 发送 Bearer Token", () => {
      expect(() => new CloudPublisher({
        axios: mockAxios,
        orchestratorUrl: "http://remote.example.com",
        authService: { getAccessToken: vi.fn() },
      })).toThrow(/HTTPS/);
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
    it("提交前在线校验 cloud_publish 权益", async () => {
      const authService = {
        requireEntitlement: vi.fn(async () => true),
        getAccessToken: vi.fn(async () => "access-1"),
      };
      mockAxios.post.mockResolvedValueOnce({ data: { task_id: "t-auth" } });
      const cp = new CloudPublisher({ axios: mockAxios, orchestratorUrl: "https://api.example.com", authService });

      await cp.submitTask({ videoUrl: "v.mp4", platform: "dy", title: "x" });

      expect(authService.requireEntitlement).toHaveBeenCalledWith("cloud_publish", { onlineOnly: true });
      expect(mockAxios.post).toHaveBeenCalledTimes(1);
    });

    it("在线权益校验失败时不发送云端写请求", async () => {
      const authService = {
        requireEntitlement: vi.fn(async () => { throw new Error("ENTITLEMENT_REQUIRED"); }),
        getAccessToken: vi.fn(async () => "access-1"),
      };
      const cp = new CloudPublisher({ axios: mockAxios, orchestratorUrl: "https://api.example.com", authService });

      await expect(cp.submitTask({ videoUrl: "v.mp4", platform: "dy", title: "x" }))
        .rejects.toThrow("ENTITLEMENT_REQUIRED");
      expect(mockAxios.post).not.toHaveBeenCalled();
    });

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
    it("使用注入的 ipcMain 注册全部通道", () => {
      const ipcMain = { handle: vi.fn() };

      new CloudPublisher({ axios: mockAxios }).registerIpcHandlers(ipcMain);

      expect(ipcMain.handle).toHaveBeenCalledTimes(4);
      expect(ipcMain.handle.mock.calls.map(([channel]) => channel)).toEqual([
        "cloud-publisher:submit",
        "cloud-publisher:list-tasks",
        "cloud-publisher:get-task",
        "cloud-publisher:platforms",
      ]);
    });

    it("拒绝不可信页面调用全部云发布通道", async () => {
      const handlers = new Map();
      const ipcMain = { handle: vi.fn((channel, handler) => handlers.set(channel, handler)) };
      new CloudPublisher({ axios: mockAxios }).registerIpcHandlers(ipcMain);
      const untrustedEvent = { senderFrame: { url: "https://evil.example/" } };

      const calls = [
        ["cloud-publisher:submit", { videoUrl: "video.mp4", platform: "douyin", title: "x" }],
        ["cloud-publisher:list-tasks"],
        ["cloud-publisher:get-task", "task-1"],
        ["cloud-publisher:platforms"],
      ];
      for (const [channel, argument] of calls) {
        await expect(handlers.get(channel)(untrustedEvent, argument)).resolves.toEqual({
          code: EC.AUTH_ERROR,
          message: "未授权的调用来源",
        });
      }
      expect(mockAxios.get).not.toHaveBeenCalled();
      expect(mockAxios.post).not.toHaveBeenCalled();
    });
  });
});
