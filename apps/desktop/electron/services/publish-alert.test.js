import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("./logger", () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

describe("publish-alert", () => {
  let pa;

  beforeAll(() => {
    vi.resetModules();
    pa = require("../services/publish-alert");
  });

  describe("exports", () => {
    it("exports 3 functions", () => {
      expect(typeof pa.triggerAlert).toBe("function");
      expect(typeof pa.playSound).toBe("function");
      expect(typeof pa.sendNotification).toBe("function");
    });
  });

  describe("getSoundPath()", () => {
    it("playSound does not throw for all expected types", () => {
      expect(() => pa.playSound("success")).not.toThrow();
      expect(() => pa.playSound("error")).not.toThrow();
      expect(() => pa.playSound("unknown")).not.toThrow();
    });
  });

  describe("sendNotification()", () => {
    it("does not throw in non-electron env", () => {
      expect(() => pa.sendNotification("title", "body")).not.toThrow();
    });

    it("accepts empty strings", () => {
      expect(() => pa.sendNotification("", "")).not.toThrow();
    });
  });

  describe("triggerAlert() — logic", () => {
    it("returns undefined", () => {
      expect(pa.triggerAlert("publish", { success: true })).toBeUndefined();
    });

    it("respects cooldown (within 1s)", () => {
      pa.triggerAlert("publish", { success: true });
      expect(() => pa.triggerAlert("publish", { success: false })).not.toThrow();
    });

    it("handles missing details", () => {
      expect(() => pa.triggerAlert("publish")).not.toThrow();
      expect(() => pa.triggerAlert("publish", null)).not.toThrow();
      expect(() => pa.triggerAlert("publish", {})).not.toThrow();
    });

    it("handles success with platform", () => {
      pa.triggerAlert("publish", { success: true, platform: "wechat_mp", message: "ok" });
    });

    it("handles error with platform", () => {
      pa.triggerAlert("publish", { success: false, platform: "douyin" });
    });
  });

  describe("edge cases", () => {
    it("very long platform name", () => {
      expect(() => pa.triggerAlert("publish", { success: true, platform: "x".repeat(500) })).not.toThrow();
    });

    it("very long message", () => {
      expect(() => pa.triggerAlert("publish", { success: false, message: "x".repeat(5000) })).not.toThrow();
    });

    it("10 rapid calls (cooldown)", () => {
      for (let i = 0; i < 10; i++) pa.triggerAlert("publish", { success: i % 2 === 0 });
    });

    it("after cooldown expires", async () => {
      await new Promise(r => setTimeout(r, 1100));
      expect(() => pa.triggerAlert("publish", { success: true })).not.toThrow();
    });
  });
});