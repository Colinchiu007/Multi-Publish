import { describe, it, expect } from "vitest";
import {
  parseCookieString,
  normalizeCookieForPlaywright,
  serializeCookiesFromContext,
} from "../services/cookie-converter";

describe("cookie-converter", () => {
  describe("parseCookieString", () => {
    it("parses standard cookie string", () => {
      const result = parseCookieString("name1=val1; name2=val2");
      expect(result).toEqual([
        { name: "name1", value: "val1" },
        { name: "name2", value: "val2" },
      ]);
    });

    it("returns empty array for empty input", () => {
      expect(parseCookieString("")).toEqual([]);
      expect(parseCookieString(null)).toEqual([]);
      expect(parseCookieString(undefined)).toEqual([]);
    });

    it("handles single cookie", () => {
      expect(parseCookieString("sessionid=abc123")).toEqual([
        { name: "sessionid", value: "abc123" },
      ]);
    });

    it("trims whitespace", () => {
      expect(parseCookieString("  a=b ;  c=d  ")).toEqual([
        { name: "a", value: "b" },
        { name: "c", value: "d" },
      ]);
    });
  });

  describe("normalizeCookieForPlaywright", () => {
    it("returns null for invalid input", () => {
      expect(normalizeCookieForPlaywright(null)).toBeNull();
      expect(normalizeCookieForPlaywright({})).toBeNull();
      expect(normalizeCookieForPlaywright({ name: "" })).toBeNull();
    });

    it("adds default domain and path", () => {
      const result = normalizeCookieForPlaywright({ name: "test", value: "v" }, "example.com");
      expect(result.name).toBe("test");
      expect(result.value).toBe("v");
      expect(result.domain).toBe("example.com");
      expect(result.path).toBe("/");
    });

    it("preserves optional fields", () => {
      const result = normalizeCookieForPlaywright({
        name: "sess",
        value: "tok",
        domain: ".example.com",
        path: "/app",
        expires: 1700000000,
        httpOnly: true,
        secure: true,
        sameSite: "Strict",
      });
      expect(result.domain).toBe(".example.com");
      expect(result.path).toBe("/app");
      expect(result.expires).toBe(1700000000);
      expect(result.httpOnly).toBe(true);
      expect(result.secure).toBe(true);
      expect(result.sameSite).toBe("Strict");
    });
  });

  describe("serializeCookiesFromContext", () => {
    it("serializes empty array", () => {
      expect(serializeCookiesFromContext([])).toBe("[]");
    });

    it("serializes cookies", () => {
      const json = serializeCookiesFromContext([
        { name: "a", value: "1", domain: ".x.com", path: "/" },
      ]);
      const parsed = JSON.parse(json);
      expect(parsed[0].name).toBe("a");
      expect(parsed[0].value).toBe("1");
    });
  });
});
