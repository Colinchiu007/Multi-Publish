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

  it("invoke 对 File/Blob 原样透传（webUtils.getPathForFile 依赖真实 File，禁止 JSON 序列化）", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });
    globalThis.window = { electronAPI: { importMedia: fn } };
    const file = new File(["audio-bytes"], "bgm.mp3", { type: "audio/mpeg" });

    const { invoke } = await import("../api/electron-bridge");
    await invoke("importMedia", file, "bgm");

    expect(fn.mock.calls[0][0]).toBe(file); // 同一 File 引用，未被 JSON 序列化
    expect(fn.mock.calls[0][1]).toBe("bgm");
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

// ────────────────────────────────────────────────────────────────────────────
// 以下为 M-13（IPC 超时）/ M-14（权限不足 fallback）新增，与上面的既有用例共存。
// 一律沿用本文件的动态 import 风格：静态 import 会在模块加载时求值，而本文件的
// 全部用例都靠「调用前改 globalThis.window」生效，两种风格混用容易出难查的串味。
// ────────────────────────────────────────────────────────────────────────────

/** preload 侧 createPermissionError() 的等价物：Error + name 标记。 */
function permError(method = "accountList") {
  const e = new Error(`许可证权限不足，无法调用 ${method}`);
  e.name = "LicensePermissionError";
  return e;
}

describe("M-14 invokeWithFallback 对「权限不足」", () => {
  beforeEach(() => {
    delete globalThis.window?.electronAPI;
  });

  it("preload 同步抛 LicensePermissionError 时返回 fallback，而不是把异常抛给调用方", async () => {
    globalThis.window = {
      electronAPI: {
        accountList: vi.fn(() => {
          throw permError("accountList");
        }),
      },
    };
    const { invokeWithFallback } = await import("../api/electron-bridge");
    await expect(invokeWithFallback("accountList", { list: [] })).resolves.toEqual({
      list: [],
    });
  });

  it("判定依据是 error.name 而非 message —— 改文案不该影响兜底", async () => {
    globalThis.window = {
      electronAPI: {
        foo: vi.fn(() => {
          const e = new Error("完全不同的文案");
          e.name = "LicensePermissionError";
          throw e;
        }),
      },
    };
    const { invokeWithFallback } = await import("../api/electron-bridge");
    await expect(invokeWithFallback("foo", "FB")).resolves.toBe("FB");
  });

  it("普通错误必须照原样抛出 —— 静默兜底会把真实故障藏起来", async () => {
    globalThis.window = {
      electronAPI: {
        boom: vi.fn(() => {
          throw new Error("主进程真的炸了");
        }),
      },
    };
    const { invokeWithFallback } = await import("../api/electron-bridge");
    await expect(invokeWithFallback("boom", "FB")).rejects.toThrow("主进程真的炸了");
  });

  it("异步 reject 的权限错误同样走 fallback（同步/异步两条路径都要覆盖）", async () => {
    globalThis.window = {
      electronAPI: {
        acc: vi.fn(async () => {
          throw permError("acc");
        }),
      },
    };
    const { invokeWithFallback } = await import("../api/electron-bridge");
    await expect(invokeWithFallback("acc", -1)).resolves.toBe(-1);
  });

  it("正常返回时不得被 fallback 覆盖", async () => {
    globalThis.window = {
      electronAPI: { ok: vi.fn(async () => ({ code: 0, data: 1 })) },
    };
    const { invokeWithFallback } = await import("../api/electron-bridge");
    await expect(invokeWithFallback("ok", "FB")).resolves.toEqual({ code: 0, data: 1 });
  });
});

describe("M-13 invokeWithTimeout", () => {
  beforeEach(() => {
    delete globalThis.window?.electronAPI;
  });

  it("主进程永不返回时按超时返回 fallback，且不抛", async () => {
    globalThis.window = {
      electronAPI: { hang: vi.fn(() => new Promise(() => {})) }, // 永不 settle
    };
    const { invokeWithTimeout } = await import("../api/electron-bridge");
    const t0 = Date.now();
    await expect(invokeWithTimeout("hang", 50, "TIMEOUT")).resolves.toBe("TIMEOUT");
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("在超时前正常返回时不得被 timeout 抢先", async () => {
    globalThis.window = { electronAPI: { fast: vi.fn(async () => "OK") } };
    const { invokeWithTimeout } = await import("../api/electron-bridge");
    await expect(invokeWithTimeout("fast", 5000, "TIMEOUT")).resolves.toBe("OK");
  });

  it("主进程真的 reject 时，错误必须原样抛出而不是被 fallback 吞掉", async () => {
    globalThis.window = {
      electronAPI: {
        err: vi.fn(async () => {
          throw new Error("真实故障");
        }),
      },
    };
    const { invokeWithTimeout } = await import("../api/electron-bridge");
    await expect(invokeWithTimeout("err", 5000, "TIMEOUT")).rejects.toThrow("真实故障");
  });

  it("timeoutMs <= 0 表示不设超时（长任务场景），必须真的等到主进程返回", async () => {
    let resolveIt;
    globalThis.window = {
      electronAPI: {
        slow: vi.fn(
          () =>
            new Promise((r) => {
              resolveIt = r;
            })
        ),
      },
    };
    const { invokeWithTimeout } = await import("../api/electron-bridge");
    const p = invokeWithTimeout("slow", 0, "TIMEOUT");
    resolveIt("终于回来了");
    await expect(p).resolves.toBe("终于回来了");
  });

  it("超时后不得留下会污染后续调用的残留状态（settle-once）", async () => {
    let resolveIt;
    globalThis.window = {
      electronAPI: {
        late: vi.fn(
          () =>
            new Promise((r) => {
              resolveIt = r;
            })
        ),
      },
    };
    const { invokeWithTimeout } = await import("../api/electron-bridge");
    await expect(invokeWithTimeout("late", 30, "TIMEOUT")).resolves.toBe("TIMEOUT");
    resolveIt("迟到值");
    await new Promise((r) => setTimeout(r, 10));
    await expect(invokeWithTimeout("late", 30, "TIMEOUT2")).resolves.toBe("TIMEOUT2");
  });

  it("参数仍经 toPlainIpcValue 处理（不可序列化对象必须照旧抛 TypeError）", async () => {
    globalThis.window = { electronAPI: { take: vi.fn(async (v) => v) } };
    const { invokeWithTimeout } = await import("../api/electron-bridge");
    const cyclic = {};
    cyclic.self = cyclic;
    await expect(invokeWithTimeout("take", 5000, "FB", cyclic)).rejects.toBeInstanceOf(TypeError);
  });

  it("反向锁：无 API 时返回 undefined（与 invoke 一致），不是 fallback", async () => {
    globalThis.window = { electronAPI: {} };
    const { invokeWithTimeout } = await import("../api/electron-bridge");
    await expect(invokeWithTimeout("missing", 50, "FB")).resolves.toBeUndefined();
  });
});
