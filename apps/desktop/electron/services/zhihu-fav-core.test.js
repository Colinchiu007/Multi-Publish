// @ts-check
/**
 * zhihu-fav-core 单元测试 — URL 类型分类 + 全部收藏合并清单
 *
 * PRD-ZHIHU-FAV-BATCH-2026-10-03 §3.1：
 *  - classifyZhihuUrl：answer/article/pin/video/column/unknown 六分类（B1-B4 降级语义的基础）
 *  - buildUnifiedFavItems：多收藏夹合并 + URL 去重 + favTime 降序 + N 截断 + 全量 200 封顶（A1/A2/A3/Q21）
 */
import { describe, it, expect } from "vitest";

const { classifyZhihuUrl, buildUnifiedFavItems } = require("./zhihu-fav-core");

describe("classifyZhihuUrl", () => {
  it("回答 URL → answer", () => {
    expect(classifyZhihuUrl("https://www.zhihu.com/question/123/answer/456")).toBe("answer");
  });
  it("专栏文章 URL → article", () => {
    expect(classifyZhihuUrl("https://zhuanlan.zhihu.com/p/789")).toBe("article");
  });
  it("想法 URL → pin", () => {
    expect(classifyZhihuUrl("https://www.zhihu.com/pin/1234567890")).toBe("pin");
  });
  it("知乎视频 URL → video", () => {
    expect(classifyZhihuUrl("https://www.zhihu.com/zvideo/1555555555555555555")).toBe("video");
  });
  it("专栏首页 URL → column", () => {
    expect(classifyZhihuUrl("https://zhuanlan.zhihu.com/c_123456789")).toBe("column");
  });
  it("问题页/外链/空值 → unknown", () => {
    expect(classifyZhihuUrl("https://www.zhihu.com/question/123")).toBe("unknown");
    expect(classifyZhihuUrl("https://example.com/foo")).toBe("unknown");
    expect(classifyZhihuUrl("")).toBe("unknown");
    expect(classifyZhihuUrl(null)).toBe("unknown");
    expect(classifyZhihuUrl(undefined)).toBe("unknown");
  });
});

describe("buildUnifiedFavItems", () => {
  const mk = (url, favTime, title) => ({ url, favTime, title, contentType: "", summary: "", likeCount: 0 });

  it("多收藏夹合并为单数组", () => {
    const r = buildUnifiedFavItems([[mk("https://zhuanlan.zhihu.com/p/1", 100, "A")], [mk("https://zhuanlan.zhihu.com/p/2", 90, "B")]], {});
    expect(r.items).toHaveLength(2);
    expect(r.truncated).toBe(false);
  });

  it("跨收藏夹 URL 去重：重复 URL 保留首次出现", () => {
    const r = buildUnifiedFavItems([
      [mk("https://zhuanlan.zhihu.com/p/1", 100, "A")],
      [mk("https://zhuanlan.zhihu.com/p/1", 95, "A-dup")],
      [mk("https://zhuanlan.zhihu.com/p/2", 90, "B")],
    ], {});
    expect(r.items).toHaveLength(2);
    expect(r.items[0].title).toBe("A");
  });

  it("favTime 降序排序", () => {
    const r = buildUnifiedFavItems([[
      mk("https://zhuanlan.zhihu.com/p/1", 100, "old"),
      mk("https://zhuanlan.zhihu.com/p/2", 300, "new"),
      mk("https://zhuanlan.zhihu.com/p/3", 200, "mid"),
    ]], {});
    expect(r.items.map((i) => i.title)).toEqual(["new", "mid", "old"]);
  });

  it("favTime 缺失/为 0 排在最后", () => {
    const r = buildUnifiedFavItems([[
      mk("https://zhuanlan.zhihu.com/p/1", 0, "no-time"),
      mk("https://zhuanlan.zhihu.com/p/2", 300, "new"),
    ]], {});
    expect(r.items.map((i) => i.title)).toEqual(["new", "no-time"]);
  });

  it("count 截断：超过 N 取前 N 且 truncated=true", () => {
    const items = Array.from({ length: 5 }, (_, i) => mk(`https://zhuanlan.zhihu.com/p/${i}`, 500 - i, `t${i}`));
    const r = buildUnifiedFavItems([items], { count: 3 });
    expect(r.items).toHaveLength(3);
    expect(r.truncated).toBe(true);
  });

  it("count 未超时 truncated=false", () => {
    const items = [mk("https://zhuanlan.zhihu.com/p/1", 1, "a")];
    const r = buildUnifiedFavItems([items], { count: 3 });
    expect(r.items).toHaveLength(1);
    expect(r.truncated).toBe(false);
  });

  it("全量模式：count 失效，上限 200 封顶", () => {
    const items = Array.from({ length: 205 }, (_, i) => mk(`https://zhuanlan.zhihu.com/p/full${i}`, 1000 - i, `f${i}`));
    const r = buildUnifiedFavItems([items], { fullMode: true, count: 50 });
    expect(r.items).toHaveLength(200);
    expect(r.truncated).toBe(true);
  });

  it("全量模式：不足 200 时全取且 truncated=false", () => {
    const items = Array.from({ length: 20 }, (_, i) => mk(`https://zhuanlan.zhihu.com/p/fm${i}`, 100 - i, `m${i}`));
    const r = buildUnifiedFavItems([items], { fullMode: true, count: 5 });
    expect(r.items).toHaveLength(20);
    expect(r.truncated).toBe(false);
  });

  it("kind 字段由 classifyZhihuUrl 判定", () => {
    const r = buildUnifiedFavItems([[
      mk("https://www.zhihu.com/question/1/answer/2", 30, "ans"),
      mk("https://zhuanlan.zhihu.com/p/3", 20, "art"),
      mk("https://www.zhihu.com/pin/4", 10, "pin"),
      mk("https://www.zhihu.com/zvideo/5", 5, "vid"),
      mk("https://zhuanlan.zhihu.com/c_6", 1, "col"),
    ]], {});
    expect(r.items.map((i) => i.kind)).toEqual(["answer", "article", "pin", "video", "column"]);
  });

  it("无 Url / 非对象条目跳过", () => {
    const r = buildUnifiedFavItems([[
      mk("https://zhuanlan.zhihu.com/p/1", 2, "ok"),
      null,
      { favTime: 1, title: "no-url" },
    ]], {});
    expect(r.items).toHaveLength(1);
  });

  it("非数组集合入参 → 空结果", () => {
    expect(buildUnifiedFavItems(null, {}).items).toEqual([]);
    expect(buildUnifiedFavItems("x", {}).items).toEqual([]);
  });

  it("空收藏夹集 → 空结果 + truncated=false", () => {
    const r = buildUnifiedFavItems([], { count: 50 });
    expect(r.items).toEqual([]);
    expect(r.truncated).toBe(false);
  });
});
