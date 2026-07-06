import { describe, it, expect, beforeAll } from "vitest";

describe("pipeline IPC handlers", () => {
  const mockIpcMain = {
    _handlers: {},
    handle(channel, fn) {
      this._handlers[channel] = fn;
    },
  };

  beforeAll(() => {
    const register = require("./pipeline");
    register(mockIpcMain);
  });

  it("registers pipelines:list handler", () => {
    expect(mockIpcMain._handlers["pipelines:list"]).toBeDefined();
  });

  it("registers pipelines:get handler", () => {
    expect(mockIpcMain._handlers["pipelines:get"]).toBeDefined();
  });

  it("pipelines:list returns success: false when backend is down", async () => {
    const result = await mockIpcMain._handlers["pipelines:list"]();
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("pipelines:get returns success: false when backend is down", async () => {
    const result = await mockIpcMain._handlers["pipelines:get"]({}, "animated-explainer");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
