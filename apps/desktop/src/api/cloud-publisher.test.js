/**
 * api/cloud-publisher.js — 完整测试
 * 策略：数据驱动，覆盖 normal + fallback 路径
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const exportedNames = [
  "cloudPublishSubmit", "cloudPublishListTasks", "cloudPublishGetTask", "cloudPublishPlatforms",
];

const apiMeta = {
  cloudPublishSubmit:     { args: [{ videoUrl: "https://x.com/v.mp4", platform: "bilibili" }], fallback: { ok: false, error: "electronAPI not available" }, returns: "object" },
  cloudPublishListTasks:  { args: [], fallback: { ok: false, error: "electronAPI not available" }, returns: "object" },
  cloudPublishGetTask:    { args: ["task-1"], fallback: { ok: false, error: "electronAPI not available" }, returns: "object" },
  cloudPublishPlatforms:  { args: [], fallback: { ok: false, error: "electronAPI not available" }, returns: "object" },
};

function createMockApi() {
  const mock = {};
  for (const name of exportedNames) {
    mock[name] = vi.fn();
  }
  return mock;
}

describe("api/cloud-publisher — 所有函数导出", () => {
  it("导出 " + exportedNames.length + " 个函数", async () => {
    const mod = await import("./cloud-publisher.js");
    for (const name of exportedNames) {
      expect(typeof mod[name]).toBe("function");
    }
  });
});

describe("api/cloud-publisher — normal 路径", () => {
  let mockApi;
  beforeEach(async () => {
    vi.resetModules();
    delete window.electronAPI;
  });
  function setupNormal(name) {
    mockApi = createMockApi();
    const resolvedValue = { ok: true, name };
    mockApi[name].mockResolvedValue(resolvedValue);
    window.electronAPI = mockApi;
    return resolvedValue;
  }
  for (const [name, meta] of Object.entries(apiMeta)) {
    it(name + " — 调用委托", async () => {
      const resolved = setupNormal(name);
      const m = await import("./cloud-publisher.js");
      const result = await m[name](...meta.args);
      expect(mockApi[name]).toHaveBeenCalledWith(...meta.args);
      expect(result).toEqual(resolved);
    });
  }
});

describe("api/cloud-publisher — fallback 路径", () => {
  let mod;
  beforeEach(async () => {
    vi.resetModules();
    delete window.electronAPI;
    mod = await import("./cloud-publisher.js");
  });
  for (const [name, meta] of Object.entries(apiMeta)) {
    it(name + " — fallback", async () => {
      const result = await mod[name](...meta.args);
      expect(result).toEqual(meta.fallback);
    });
  }
});

