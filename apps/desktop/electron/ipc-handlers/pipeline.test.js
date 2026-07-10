import { describe, it, expect, beforeAll, vi } from "vitest";

describe("pipeline IPC handlers", () => {
  const mockIpcMain = {
    _handlers: {},
    handle(channel, fn) {
      this._handlers[channel] = fn;
    },
  };

  let pipelineEngine;

  beforeAll(() => {
    const register = require("./pipeline");
    pipelineEngine = {
      listPipelines: vi.fn().mockReturnValue([]),
      getPipeline: vi.fn().mockReturnValue(null),
      start: vi.fn().mockResolvedValue({ success: true }),
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
      getStatus: vi.fn().mockReturnValue({}),
      advance: vi.fn(),
      getHistory: vi.fn().mockReturnValue([]),
      fetchPipelineFromBackend: vi.fn().mockResolvedValue({ success: true }),
    };
    const deps = { pipelineEngine, BrowserWindow: {}, log: { error: vi.fn() } };
    register(mockIpcMain, deps);
  });

  it("registers pipeline:list handler", () => {
    expect(mockIpcMain._handlers["pipeline:list"]).toBeDefined();
  });

  it("registers pipeline:get handler", () => {
    expect(mockIpcMain._handlers["pipeline:get"]).toBeDefined();
  });

  it("pipeline:list delegates to pipelineEngine.listPipelines", async () => {
    const result = await mockIpcMain._handlers["pipeline:list"]();
    expect(pipelineEngine.listPipelines).toHaveBeenCalled();
    // R38：返回 { success, data } 契约（与 PipelineBrowser.vue 前端对齐），非裸数组
    expect(result).toEqual({ success: true, data: [] });
  });

  it("pipeline:history returns { success, data } contract (R38)", async () => {
    const result = await mockIpcMain._handlers["pipeline:history"]();
    expect(pipelineEngine.getHistory).toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: [] });
  });

  it("pipeline:get delegates to pipelineEngine.getPipeline", async () => {
    const result = await mockIpcMain._handlers["pipeline:get"]({}, "animated-explainer");
    expect(pipelineEngine.getPipeline).toHaveBeenCalledWith("animated-explainer");
    expect(result).toBeNull();
  });
});
