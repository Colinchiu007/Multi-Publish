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

  describe("tokenizeContentWords", () => {
    it("中文连串切成相邻二元组，而不是整句一个词", async () => {
      const { tokenizeContentWords } = await import("../services/content-intelligence-utils");
      // 结构断言（QM-3）：精确到数组逐项，禁止用 toContain —— 否则「整句被当成一个词」
      // 这种回归仍然命中子串，测不出来。
      expect(tokenizeContentWords("红烧肉")).toEqual(["红烧", "烧肉"]);
      expect(tokenizeContentWords("申请加入请在这里评论")).toEqual([
        "申请", "请加", "加入", "入请", "请在", "在这", "这里", "里评", "评论",
      ]);
    });

    it("旧实现的按空白切会把整句中文当成一个词（回归对照）", async () => {
      const { tokenizeContentWords } = await import("../services/content-intelligence-utils");
      const legacy = "申请加入请在这里评论"
        .toLowerCase()
        .split(/[\s,.\-!?/\\()[\]{}":;]+/)
        .filter((w) => w.length > 1);
      expect(legacy).toEqual(["申请加入请在这里评论"]);
      // 新实现不得产出任何长度 > 2 的 CJK 词素
      expect(tokenizeContentWords("申请加入请在这里评论").every((w) => w.length <= 2)).toBe(true);
    });

    it("拉丁文按词切，过滤停用词与纯数字", async () => {
      const { tokenizeContentWords } = await import("../services/content-intelligence-utils");
      const t = tokenizeContentWords("How to Build a AI Tool in 2024");
      expect(t).toContain("ai");
      expect(t).toContain("tool");
      expect(t).toContain("build");
      expect(t).not.toContain("a");
      expect(t).not.toContain("to");
      expect(t).not.toContain("in");
      expect(t).not.toContain("2024");
    });

    it("去重且对空值安全", async () => {
      const { tokenizeContentWords } = await import("../services/content-intelligence-utils");
      expect(tokenizeContentWords("红烧红烧肉")).toEqual(["红烧", "烧红", "烧肉"]);
      expect(tokenizeContentWords("")).toEqual([]);
      expect(tokenizeContentWords(null)).toEqual([]);
      expect(tokenizeContentWords(undefined)).toEqual([]);
      expect(tokenizeContentWords(123)).toEqual([]);
    });

    it("补充平面汉字必须按码点成二元组，不得切成半个字符或漏掉", async () => {
      const { tokenizeContentWords } = await import("../services/content-intelligence-utils");
      // 𠀀(U+20000) / 𠀁(U+20001) 在 BMP 区间表之外，且各占两个 UTF-16 代理单元。
      // 旧实现用 \u3400-\u4dbf\u4e00-\u9fff... 区间 + slice(i,i+2) 会同时踩到
      // "整段不匹配"和"把代理对切成半个字符"两个错。
      expect(tokenizeContentWords("𠀀𠀁红烧肉")).toEqual(["𠀀𠀁", "𠀁红", "红烧", "烧肉"]);
      // 关键回归：纯补充平面查询旧实现会切成空集 ⇒ 门禁被整体绕过
      const tokens = tokenizeContentWords("𠀀𠀁𠀂");
      expect(tokens).toEqual(["𠀀𠀁", "𠀁𠀂"]);
      expect(tokens.length).toBeGreaterThan(0);
      // 每个词素都必须是完整码点组合（长度按码点算为 2）
      for (const w of tokens) expect(Array.from(w).length).toBe(2);
    });

    it("URL 与 HTML 实体不得成为「内容词」（否则共享域名即算同类）", async () => {
      const { tokenizeContentWords, sharesContentWord } =
        await import("../services/content-intelligence-utils");
      expect(tokenizeContentWords("https://example.com/path&amp;🚀")).toEqual([]);
      // 「的教」是跨词边界的噪声二元组 —— 这是二元组方案的已知代价（专项 PRD §11.2），
      // 靠 document frequency 排序压制，不在此处逐个排除。
      expect(tokenizeContentWords("看 https://example.com 的教程")).toEqual(["的教", "教程"]);
      expect(tokenizeContentWords("a &lt;b&gt; tag")).toEqual(["tag"]);
      // 两条标题只共享一个 URL 时不得判为同类 —— URL 已被剥离，只剩各自的中文词
      const q = new Set(tokenizeContentWords("https://example.com 红烧肉"));
      expect([...q]).toEqual(["红烧", "烧肉"]);
      expect(sharesContentWord("https://example.com 完全无关的话题", q)).toBe(false);
      // 而真正共享内容词的仍须判为同类
      expect(sharesContentWord("https://example.com 红烧肉的做法", q)).toBe(true);
    });
  });

  describe("sharesContentWord（相关性门禁）", () => {
    it("实测事故场景：正文命中的 GitHub issue 标题必须判为不相关", async () => {
      const { tokenizeContentWords, sharesContentWord } =
        await import("../services/content-intelligence-utils");
      const query = new Set(tokenizeContentWords("三步学会做红烧肉"));
      // 这条就是 api.github.com/search/issues 对「三步学会做红烧肉」返回的第一条结果，
      // 它正文里含查询串，标题与查询零重叠。
      expect(sharesContentWord("旧文归档 · 2024 年 2 月", query)).toBe(false);
    });

    it("真同类标题判为相关", async () => {
      const { tokenizeContentWords, sharesContentWord } =
        await import("../services/content-intelligence-utils");
      const query = new Set(tokenizeContentWords("三步学会做红烧肉"));
      expect(sharesContentWord("红烧肉的家常做法，零失败", query)).toBe(true);
      expect(sharesContentWord("厨房新手：红烧肉入门", query)).toBe(true);
    });

    it("英文标题靠词重叠判定，大小写不敏感", async () => {
      const { tokenizeContentWords, sharesContentWord } =
        await import("../services/content-intelligence-utils");
      const query = new Set(tokenizeContentWords("React 18 tutorial"));
      expect(sharesContentWord("Learn REACT fast in 2024", query)).toBe(true);
      expect(sharesContentWord("Vue 3 migration guide", query)).toBe(false);
    });

    it("无判据时不改语义（查询无内容词 → 全放行）；标题缺失 → 不相关", async () => {
      const { tokenizeContentWords, sharesContentWord } =
        await import("../services/content-intelligence-utils");
      expect(sharesContentWord("任意标题", new Set())).toBe(true);
      expect(sharesContentWord("任意标题", null)).toBe(true);
      expect(tokenizeContentWords("2024")).toEqual([]);
      const emptyQuery = new Set(tokenizeContentWords("2024"));
      expect(sharesContentWord("旧文归档", emptyQuery)).toBe(true);
      const query = new Set(tokenizeContentWords("红烧肉"));
      expect(sharesContentWord("", query)).toBe(false);
      expect(sharesContentWord(undefined, query)).toBe(false);
    });
  });
});
