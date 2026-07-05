/**
 * api/providers.js — 完整测试
 * 策略：数据驱动，覆盖 normal + fallback 路径
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const exportedNames = [
  "providerList", "providerCreate", "providerUpdate", "providerDelete", "providerTest",
  "providerListUser", "providerSetUserKey", "providerDeleteUserKey",
];

const apiMeta = {
  providerList:         { args: [], fallback: { code: -1, message: "electronAPI not available", data: [] }, returns: "object" },
  providerCreate:       { args: [{ name: "openai", apiKey: "sk-..." }], fallback: { code: -1, message: "electronAPI not available" }, returns: "object" },
  providerUpdate:       { args: ["openai", { apiKey: "sk-new" }], fallback: { code: -1, message: "electronAPI not available" }, returns: "object" },
  providerDelete:       { args: ["openai"], fallback: { code: -1, message: "electronAPI not available" }, returns: "object" },
  providerTest:         { args: ["openai"], fallback: { code: -1, message: "electronAPI not available" }, returns: "object" },
  providerListUser:     { args: [], fallback: { code: -1, message: "electronAPI not available", data: [] }, returns: "object" },
  providerSetUserKey:   { args: ["openai", "sk-...", "https://api.openai.com"], fallback: { code: -1, message: "electronAPI not available" }, returns: "object" },
  providerDeleteUserKey: { args: ["openai"], fallback: { code: -1, message: "electronAPI not available" }, returns: "object" },
};

function createMockApi() {
  const mock = {};
  for (const name of exportedNames) {
    mock[name] = vi.fn();
  }
  return mock;
}

describe("api/providers — 所有函数导出", () => {
  it("导出 " + exportedNames.length + " 个函数", async () => {
    const mod = await import("./providers.js");
    for (const name of exportedNames) {
      expect(typeof mod[name]).toBe("function");
    }
  });
});

describe("api/providers — normal 路径（electronAPI 存在）", () => {
  let mockApi;
  beforeEach(async () => {
    vi.resetModules();
    delete window.electronAPI;
  });
  function setupNormal(name) {
    mockApi = createMockApi();
    const resolvedValue = { success: true, name };
    mockApi[name].mockResolvedValue(resolvedValue);
    window.electronAPI = mockApi;
    return resolvedValue;
  }
  for (const [name, meta] of Object.entries(apiMeta)) {
    it(name + " — electronAPI 存在时调用委托", async () => {
      const resolved = setupNormal(name);
      const m = await import("./providers.js");
      const result = await m[name](...meta.args);
      expect(mockApi[name]).toHaveBeenCalledWith(...meta.args);
      expect(result).toEqual(resolved);
    });
  }
});

describe("api/providers — fallback 路径（electronAPI 不存在）", () => {
  let mod;
  beforeEach(async () => {
    vi.resetModules();
    delete window.electronAPI;
    mod = await import("./providers.js");
  });
  for (const [name, meta] of Object.entries(apiMeta)) {
    it(name + " — electronAPI 不存在时返回 fallback", async () => {
      const result = await mod[name](...meta.args);
      expect(result).toEqual(meta.fallback);
    });
  }
});

