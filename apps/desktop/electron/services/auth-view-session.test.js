import { describe, it, expect, vi, beforeAll } from "vitest";

let session;

beforeAll(async () => {
  session = await import("./auth-view-session");
});

describe("auth-view-session", () => {
  describe("createSession", () => {
    it("creates session from partition with accountId", () => {
      const mockSession = { fromPartition: vi.fn(() => "session-instance") };
      const result = session.createSession("acc-123", mockSession);
      expect(mockSession.fromPartition).toHaveBeenCalledWith("persist:auth-acc-123", { cache: true });
      expect(result).toBe("session-instance");
    });
  });

  describe("setCookies", () => {
    it("sets cookies via session.cookies.set", async () => {
      const mockSession = { cookies: { set: vi.fn().mockResolvedValue() } };
      const cookies = [{ name: "token", value: "abc" }];
      await session.setCookies(mockSession, cookies);
      expect(mockSession.cookies.set).toHaveBeenCalledWith(cookies);
    });

    it("does nothing for empty cookies", async () => {
      const mockSession = { cookies: { set: vi.fn() } };
      await session.setCookies(mockSession, []);
      expect(mockSession.cookies.set).not.toHaveBeenCalled();
    });

    it("does nothing for null cookies", async () => {
      const mockSession = { cookies: { set: vi.fn() } };
      await session.setCookies(mockSession, null);
      expect(mockSession.cookies.set).not.toHaveBeenCalled();
    });
  });

  describe("restoreLocalStorage", () => {
    it("calls did-finish-load with localStorage data", () => {
      const mockExecJs = vi.fn().mockResolvedValue(undefined);
      const mockView = {
        webContents: {
          on: vi.fn(),
          executeJavaScript: mockExecJs,
        },
      };
      session.restoreLocalStorage(mockView, { theme: "dark" });

      // Verify did-finish-load handler is registered
      expect(mockView.webContents.on).toHaveBeenCalledWith(
        "did-finish-load",
        expect.any(Function),
        { once: true }
      );
    });
  });
});