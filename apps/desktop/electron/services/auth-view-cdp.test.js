import { describe, it, expect, beforeAll } from "vitest";

let cdp;

beforeAll(async () => {
  cdp = await import("./auth-view-cdp");
});

describe("isLoginSuccess", () => {
  it("detects login with dedeUserID", () => {
    expect(cdp.isLoginSuccess({ code: 0, data: { dedeUserID: "12345" } })).toBe(true);
  });

  it("detects login with mid", () => {
    expect(cdp.isLoginSuccess({ code: 0, data: { mid: "user_abc" } })).toBe(true);
  });

  it("detects login with access_token", () => {
    expect(cdp.isLoginSuccess({ code: 0, data: { access_token: "token_xxx" } })).toBe(true);
  });

  it("detects login with isLogin=true", () => {
    expect(cdp.isLoginSuccess({ data: { isLogin: true } })).toBe(true);
  });

  it("rejects API error response", () => {
    expect(cdp.isLoginSuccess({ code: -1, message: "error" })).toBe(false);
  });

  it("rejects empty data", () => {
    expect(cdp.isLoginSuccess({})).toBe(false);
    expect(cdp.isLoginSuccess(null)).toBe(false);
    expect(cdp.isLoginSuccess(undefined)).toBe(false);
  });
});