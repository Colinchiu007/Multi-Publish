import { describe, it, expect } from "vitest";

describe("test-helpers", () => {
  it("createMockLogger returns object with info/warn/error", async () => {
    const { createMockLogger } = await import("../services/test-helpers");
    const mock = createMockLogger();
    expect(typeof mock.info).toBe("function");
    expect(typeof mock.warn).toBe("function");
    expect(typeof mock.error).toBe("function");
  });

  it("createMockElectron returns app + BrowserWindow", async () => {
    const { createMockElectron } = await import("../services/test-helpers");
    const mock = createMockElectron();
    expect(typeof mock.app.getPath).toBe("function");
    expect(mock.app.getPath("userData")).toBe("/tmp/ph-test-data");
    expect(Array.isArray(mock.BrowserWindow.getAllWindows())).toBe(true);
  });

  it("createMockAxios returns get/post/put/delete", async () => {
    const { createMockAxios } = await import("../services/test-helpers");
    const mock = createMockAxios();
    expect(typeof mock.get).toBe("function");
    expect(typeof mock.post).toBe("function");
    expect(typeof mock.isAxiosError).toBe("function");
  });

  it("mockAxiosGet sets resolved value", async () => {
    const { createMockAxios, mockAxiosGet } = await import("../services/test-helpers");
    const axios = createMockAxios();
    mockAxiosGet(axios, { data: { items: [] } });
    const result = await axios.get("/test");
    expect(result).toEqual({ data: { items: [] } });
  });

  it("createMockStore returns Store-like object", async () => {
    const { createMockStore } = await import("../services/test-helpers");
    const store = createMockStore();
    expect(typeof store.getSetting).toBe("function");
    expect(typeof store.setSetting).toBe("function");
    expect(typeof store.listAccounts).toBe("function");
  });
});
