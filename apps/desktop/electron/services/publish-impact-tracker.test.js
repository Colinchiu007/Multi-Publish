import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/logger", () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

const PublishImpactTracker = require("../services/publish-impact-tracker");

describe("PublishImpactTracker", () => {
  let mockCi;

  beforeEach(() => {
    mockCi = {
      searchMentions: vi.fn().mockResolvedValue({ total: 3, items: [{ id: "m1" }] }),
      saveImpactSnapshot: vi.fn().mockResolvedValue({ id: "snap1" }),
    };
  });

  describe("constructor", () => {
    it("stores contentIntelligence", () => {
      const t = new PublishImpactTracker(mockCi);
      expect(t.ci).toBe(mockCi);
    });
    it("initializes _timers as Map", () => {
      const t = new PublishImpactTracker(mockCi);
      expect(t._timers instanceof Map).toBe(true);
    });
  });

  describe("scheduleImpactTracking()", () => {
    it("schedules tracking and returns schedule", () => {
      const t = new PublishImpactTracker(mockCi);
      vi.useFakeTimers();
      const result = t.scheduleImpactTracking({ articleId: "a1", title: "test", keywords: "kw", platform: "wx" });
      expect(result).toBeDefined();
      expect(result.articleId).toBe("a1");
      expect(result.schedule.length).toBeGreaterThanOrEqual(3);
      vi.useRealTimers();
    });
    it("rejects missing articleId", () => {
      const t = new PublishImpactTracker(mockCi);
      const result = t.scheduleImpactTracking({ title: "test" });
      expect(result).toBeUndefined();
    });
    it("rejects missing keywords and title", () => {
      const t = new PublishImpactTracker(mockCi);
      const result = t.scheduleImpactTracking({ articleId: "a1" });
      expect(result).toBeUndefined();
    });
  });

  describe("getActiveTrackings()", () => {
    it("returns empty array initially", () => {
      const t = new PublishImpactTracker(mockCi);
      expect(t.getActiveTrackings()).toEqual([]);
    });
    it("returns scheduled trackings", () => {
      const t = new PublishImpactTracker(mockCi);
      vi.useFakeTimers();
      t.scheduleImpactTracking({ articleId: "a1", title: "test", keywords: "kw" });
      const active = t.getActiveTrackings();
      expect(active.length).toBe(1);
      expect(active[0].articleId).toBe("a1");
      vi.useRealTimers();
    });
  });

  describe("cancelTracking()", () => {
    it("cancels existing tracking", () => {
      const t = new PublishImpactTracker(mockCi);
      vi.useFakeTimers();
      t.scheduleImpactTracking({ articleId: "a1", title: "test", keywords: "kw" });
      t.cancelTracking("a1");
      expect(t.getActiveTrackings().length).toBe(0);
      vi.useRealTimers();
    });
    it("cancel non-existent is safe", () => {
      const t = new PublishImpactTracker(mockCi);
      expect(() => t.cancelTracking("nope")).not.toThrow();
    });
  });

  describe("registerIpcHandlers()", () => {
    it("throws in non-electron env", () => {
      const t = new PublishImpactTracker(mockCi);
      expect(() => t.registerIpcHandlers()).toThrow();
    });
  });
});