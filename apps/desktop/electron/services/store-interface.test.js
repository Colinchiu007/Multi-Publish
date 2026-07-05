import { describe, it, expect, vi } from "vitest";

vi.mock("../services/logger", () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("electron", () => ({ app: { getPath: function () { return ""; } } }));

const { createStore, isValidStore } = require("../services/store-interface");

describe("store-interface", () => {
  describe("createStore", () => {
    it("throws for unknown type", () => {
      expect(function () { createStore({ type: "csv" }); }).toThrow(/unknown store type/i);
    });
  });

  describe("isValidStore", () => {
    it("returns false for null", () => {
      expect(isValidStore(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isValidStore(undefined)).toBe(false);
    });

    it("returns false for incomplete object", () => {
      expect(isValidStore({ init: function () {} })).toBe(false);
    });

    it("returns false for empty object", () => {
      expect(isValidStore({})).toBe(false);
    });
  });
});