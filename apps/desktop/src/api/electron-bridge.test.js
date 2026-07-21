import { describe, it, expect, vi, beforeEach } from "vitest";
import { reactive } from "vue";

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

  it("invoke 在调用 contextBridge 前将 Vue Proxy 转换为纯 JSON", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });
    globalThis.window = { electronAPI: { submit: fn } };
    const payload = reactive({
      title: "标题",
      nested: { tags: ["A", "B"] },
    });

    const { invoke } = await import("../api/electron-bridge");
    await invoke("submit", payload, undefined, "plain");

    const [received, missing, plain] = fn.mock.calls[0];
    expect(received).toEqual({ title: "标题", nested: { tags: ["A", "B"] } });
    expect(received).not.toBe(payload);
    expect(() => structuredClone(received)).not.toThrow();
    expect(missing).toBeUndefined();
    expect(plain).toBe("plain");
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
