import { describe, it, expect, vi, beforeEach } from "vitest";

describe("electron-bridge", () => {
  beforeEach(() => {
    delete globalThis.window?.electronAPI;
  });

  it("invoke calls window.electronAPI method", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });
    globalThis.window = { electronAPI: { testMethod: fn } };

    const { invoke } = await import("../api/electron-bridge");
    const result = await invoke("testMethod", "arg1", 42);

    expect(fn).toHaveBeenCalledWith("arg1", 42);
    expect(result).toEqual({ ok: true });
  });

  it("invoke returns undefined when electronAPI unavailable", async () => {
    const { invoke } = await import("../api/electron-bridge");
    const result = await invoke("missingMethod");
    expect(result).toBeUndefined();
  });

  it("invokeWithFallback uses fallback when electronAPI missing", async () => {
    const { invokeWithFallback } = await import("../api/electron-bridge");
    const fallback = { code: -1, message: "not available" };
    const result = await invokeWithFallback("missing", fallback);
    expect(result).toEqual(fallback);
  });

  it("invokeWithFallback returns real result when electronAPI available", async () => {
    const fn = vi.fn().mockResolvedValue({ code: 0, data: ["a"] });
    globalThis.window = { electronAPI: { list: fn } };

    const { invokeWithFallback } = await import("../api/electron-bridge");
    const result = await invokeWithFallback("list", { code: -1 });
    expect(result).toEqual({ code: 0, data: ["a"] });
  });

  it("on registers event listener", async () => {
    const removeSpy = vi.fn();
    const onSpy = vi.fn(() => removeSpy);
    globalThis.window = { electronAPI: { onTest: onSpy } };

    const { on } = await import("../api/electron-bridge");
    const cb = vi.fn();
    const cleanup = on("Test", cb);

    expect(onSpy).toHaveBeenCalled();
    cleanup();
    expect(removeSpy).toHaveBeenCalled();
  });

  it("on returns noop cleanup when electronAPI unavailable", async () => {
    const { on } = await import("../api/electron-bridge");
    const cleanup = on("Test", vi.fn());
    expect(typeof cleanup).toBe("function");
    expect(cleanup()).toBeUndefined();
  });
});
