import { describe, it, expect } from "vitest";

describe("content-intelligence-utils", () => {
  describe("calculateStats", () => {
    it("returns zeros for empty array", async () => {
      const { calculateStats } = await import("../services/content-intelligence-utils");
      const s = calculateStats([]);
      expect(s.avg).toBe(0);
      expect(s.median).toBe(0);
      expect(s.p90).toBe(0);
      expect(s.p75).toBe(0);
    });

    it("calculates stats for single value", async () => {
      const { calculateStats } = await import("../services/content-intelligence-utils");
      const s = calculateStats([42]);
      expect(s.avg).toBe(42);
      expect(s.median).toBe(42);
    });

    it("calculates stats for multiple values", async () => {
      const { calculateStats } = await import("../services/content-intelligence-utils");
      const s = calculateStats([10, 20, 30, 40, 50]);
      expect(s.avg).toBe(30);
      expect(s.median).toBe(30);
      expect(s.p90).toBe(50);
      expect(s.p75).toBe(40);
    });

    it("handles even-length array median", async () => {
      const { calculateStats } = await import("../services/content-intelligence-utils");
      const s = calculateStats([1, 2, 3, 4]);
      expect(s.median).toBe(2.5);
    });
  });

  describe("deduplicateResults", () => {
    it("removes duplicate titles", async () => {
      const { deduplicateResults } = await import("../services/content-intelligence-utils");
      const items = [
        { title: "Hello World This Is A Long Enough Title" },
        { title: "Hello World This Is A Long Enough Title" },
        { title: "Different Title Here" },
      ];
      const deduped = deduplicateResults(items);
      expect(deduped).toHaveLength(2);
      expect(deduped[0].title).toBe("Hello World This Is A Long Enough Title");
    });

    it("returns empty array for empty input", async () => {
      const { deduplicateResults } = await import("../services/content-intelligence-utils");
      expect(deduplicateResults([])).toEqual([]);
    });
  });

  describe("calculateHourDistribution", () => {
    it("counts items by hour", async () => {
      const { calculateHourDistribution } = await import("../services/content-intelligence-utils");
      const items = [
        { created_utc: 1000 },   // Thu Jan 01 1970 00:16:40 UTC -> hour 0
        { created_utc: 3600 },   // 01:00:00 -> hour 1
        { created_utc: 7200 },   // 02:00:00 -> hour 2
      ];
      const dist = calculateHourDistribution(items);
      expect(dist[0]).toBe(1);
      expect(dist[1]).toBe(1);
      expect(dist[2]).toBe(1);
    });

    it("handles empty array", async () => {
      const { calculateHourDistribution } = await import("../services/content-intelligence-utils");
      expect(calculateHourDistribution([])).toEqual({});
    });
  });
});
