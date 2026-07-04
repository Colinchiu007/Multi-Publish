import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

// Mock global API function
const mockBenchmark = {
  benchmark: {
    sampleSize: 100,
    engagement: { avg: 75.3, median: 72.1, top10: 95.0, top25: 85.0 },
    upvotes: { avg: 120, median: 85, top10: 500, top25: 250 },
    comments: { avg: 30, median: 20, top10: 100, top25: 60 },
    topSources: ["\u77e5\u4e4e", "B\u7ad9", "\u5c0f\u7ea2\u4e66"],
    generatedAt: "2026-07-04T12:00:00Z"
  }
};

vi.stubGlobal("intelligenceGetBenchmark", vi.fn().mockResolvedValue(mockBenchmark));

import BenchmarkChart from "./BenchmarkChart.vue";

describe("BenchmarkChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.intelligenceGetBenchmark = vi.fn().mockResolvedValue(mockBenchmark);
  });

  it("renders loading state initially", async () => {
    globalThis.intelligenceGetBenchmark.mockImplementation(() => new Promise(function(r) { /* never resolve */ }));
    const w = mount(BenchmarkChart, { props: { title: "\u6d4b\u8bd5\u6587\u7ae0\u6807\u9898" } });
    await nextTick();
    await new Promise(function(r) { return setTimeout(r, 10); });
    expect(w.text()).toContain("\u52a0\u8f7d");
  });

  it("renders error for short title", async () => {
    const w = mount(BenchmarkChart, { props: { title: "AB" } });
    await nextTick();
    expect(w.text()).toContain("\u6807\u9898\u8fc7\u77ed");
  });

  it("renders benchmark data after fetch", async () => {
    const w = mount(BenchmarkChart, { props: { title: "\u5982\u4f55\u5199\u51fa\u7206\u6b3e\u6587\u7ae0" } });
    await nextTick();
    await new Promise(function(r) { return setTimeout(r, 50); });
    expect(w.text()).toContain("75.3");
    expect(w.text()).toContain("\u77e5\u4e4e");
  });

  it("renders error state when API returns error", async () => {
    globalThis.intelligenceGetBenchmark.mockResolvedValue({ error: "API \u914d\u989d\u4e0d\u8db3" });
    const w = mount(BenchmarkChart, { props: { title: "\u6d4b\u8bd5\u6587\u7ae0\u6807\u9898" } });
    await nextTick();
    await new Promise(function(r) { return setTimeout(r, 50); });
    expect(w.text()).toContain("API");
  });

  it("renders error state when API throws", async () => {
    globalThis.intelligenceGetBenchmark.mockRejectedValue(new Error("\u7f51\u7edc\u9519\u8bef"));
    const w = mount(BenchmarkChart, { props: { title: "\u6d4b\u8bd5\u6587\u7ae0\u6807\u9898" } });
    await nextTick();
    await new Promise(function(r) { return setTimeout(r, 50); });
    expect(w.text()).toContain("\u7f51\u7edc\u9519\u8bef");
  });

  it("renders insufficient data message", async () => {
    globalThis.intelligenceGetBenchmark.mockResolvedValue({ message: "\u6570\u636e\u4e0d\u8db3" });
    const w = mount(BenchmarkChart, { props: { title: "\u6d4b\u8bd5\u6587\u7ae0\u6807\u9898" } });
    await nextTick();
    await new Promise(function(r) { return setTimeout(r, 50); });
    expect(w.text()).toContain("\u6570\u636e\u4e0d\u8db3");
  });
});