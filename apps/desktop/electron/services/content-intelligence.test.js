import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";

// vitest 4 下 vi.mock factory 对 CJS require 不生效，改用 __registerMock + __enableElectronMock
__enableElectronMock()

__registerMock("./logger", {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

let ContentIntelligence;
beforeAll(async () => {
  const mod = await import("./content-intelligence");
  ContentIntelligence = mod.default || mod;
});

describe("ContentIntelligence", () => {
  let ci;
  let mockStore;
  let mockAxios;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore = {
      getSetting: vi.fn(),
      setSetting: vi.fn(),
    };
    ci = new ContentIntelligence(mockStore);
    ci._axios = null;
    ci._searchCache = new Map();

    // Setup mock axios instance
    mockAxios = {
      get: vi.fn().mockResolvedValue({ data: { data: { children: [] } } }),
      post: vi.fn().mockResolvedValue({ data: {} }),
    };
    ci._getAxios = () => mockAxios;
  });

  describe("constructor", () => {
    it("initializes with store reference", () => {
      expect(ci._store).toBe(mockStore);
    });

    it("initializes empty search cache", () => {
      expect(ci._searchCache).toBeInstanceOf(Map);
      expect(ci._searchCache.size).toBe(0);
    });
  });

  describe("search", () => {
    it("returns cached results if available and fresh", async () => {
      const cached = { results: ["item1"], timestamp: Date.now() };
      // 缓存键末段是相关性门禁的判据档位（relevanceOn）。它必须在键里 —— 否则
      // searchTitles（只看 title）与 searchMentions（看 title+snippet+author）
      // 用同一个 query 时会互相串用对方的过滤结果。
      ci._searchCache.set("search:test:reddit,hackernews,github:10:title", cached);
      const result = await ci.search("test");
      expect(result).toEqual(cached.results);
      expect(mockAxios.get).not.toHaveBeenCalled();
    });

    it("不同 relevanceOn 档位必须落在不同缓存键上", async () => {
      const keys = [];
      const record = (key) => keys.push(key);
      ci._setCache = (key) => record(key);
      ci._getCached = () => null;

      await ci.search("test", { noCache: true });
      await ci.search("test", { noCache: true, relevanceOn: ["title", "snippet"] });

      expect(keys).toHaveLength(2);
      expect(keys[0]).not.toEqual(keys[1]);
      expect(keys[0].endsWith(":title")).toBe(true);
      expect(keys[1].endsWith(":title+snippet")).toBe(true);
    });

    it("returns structured object for null query", async () => {
      const result = await ci.search(null);
      expect(result).toBeDefined();
      expect(result).toHaveProperty("results");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("sources");
    });

    it("returns structured object for empty query", async () => {
      const result = await ci.search("");
      expect(result).toBeDefined();
      expect(result).toHaveProperty("results");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("sources");
    });
  });

  describe("fetchTrending", () => {
    it("returns structured object when no sources specified", async () => {
      const result = await ci.fetchTrending({ sources: [] });
      expect(result).toBeDefined();
      expect(result).toHaveProperty("total", 0);
      expect(result).toHaveProperty("results");
      expect(result).toHaveProperty("bySource");
    });
  });

  describe("getOptimalTime", () => {
    it("returns error object when no keyword provided", async () => {
      const result = await ci.getOptimalTime(null);
      expect(result).toBeDefined();
      expect(result).toHaveProperty("error");
      expect(result).toHaveProperty("recommendation");
    });
  });

  describe("searchMentions", () => {
    it("returns empty object for null keywords", async () => {
      const result = await ci.searchMentions(null);
      expect(result).toBeDefined();
    });
  });
});