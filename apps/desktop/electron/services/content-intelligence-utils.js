// @ts-check
/**
 * content-intelligence-utils — 内容情报纯计算函数
 * 从 content-intelligence.js 提取，纯逻辑可测试。
 */

/**
 * 统计数组的 avg / median / p90 / p75
 */
function calculateStats(arr) {
  if (!arr || arr.length === 0) {
    return { avg: 0, median: 0, p90: 0, p75: 0 };
  }
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  const avg = arr.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
  const percentile = (p) => {
    const idx = Math.ceil(p / 100 * n) - 1;
    return sorted[Math.max(0, Math.min(idx, n - 1))];
  };
  return {
    avg: Math.round(avg * 100) / 100,
    median: Math.round(median * 100) / 100,
    p90: Math.round(percentile(90) * 100) / 100,
    p75: Math.round(percentile(75) * 100) / 100,
  };
}

/**
 * 按标题前缀去重（前40字符）
 */
function deduplicateResults(results) {
  if (!results || results.length === 0) return [];
  const seen = new Set();
  const deduped = [];
  for (const r of results) {
    const key = (r.title || "").slice(0, 40).toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }
  return deduped;
}

/**
 * 计算 items 的 UTC 小时分布（用于最优发布时间分析）
 * 返回 { [hour: number]: count }
 */
function calculateHourDistribution(items) {
  if (!items || items.length === 0) return {};
  const dist = {};
  for (const r of items) {
    const ts = r.created_utc || r.createdAt || r.timestamp;
    if (!ts) continue;
    const d = new Date(ts * 1000);
    const hour = d.getUTCHours();
    dist[hour] = (dist[hour] || 0) + 1;
  }
  return dist;
}

// ── CJK 感知分词与相关性判定 ─────────────────────────────────────
//
// 标题类文本不能用「按空白切」当分词：中文没有空格，整句会被切成一个
// "词"（实测「申请加入请在这里评论」被当成"同类标题高频词"展示给用户）。
// 这里对拉丁文按词切，对 CJK 连串按相邻二元组展开——二元组是在不引入分词器
// 依赖的前提下，唯一能让「红烧 / 烧肉」这类真实词素浮出来的最小单位。

const CJK_RUN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]{2,}/g;
const LATIN_WORD_RE = /[a-z0-9][a-z0-9'+-]*/g;

const CONTENT_STOPWORDS = new Set([
  // English
  "the", "a", "an", "is", "are", "was", "were", "of", "in", "to",
  "for", "and", "or", "on", "at", "by", "with", "from", "as", "it", "its",
  "that", "this", "these", "those", "be", "been", "being", "have", "has",
  "had", "do", "does", "did", "will", "would", "can", "could", "may", "might",
  "shall", "should", "about", "into", "through", "during", "before", "after",
  "above", "below", "up", "down", "out", "off", "over", "under", "again",
  "further", "then", "once", "here", "there", "all", "each", "every",
  "both", "few", "more", "most", "other", "some", "such", "no", "nor",
  "not", "only", "own", "same", "so", "than", "too", "very",
  // Chinese function words
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一",
  "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着",
  "没有", "看", "好", "自己", "这", "他", "她", "它", "们",
  // 高频二元组虚词（上面的单字停用表覆盖不到二元组）
  "可以", "我们", "你们", "他们", "什么", "怎么", "这个", "那个",
]);

/**
 * 把标题切成「内容词」集合：拉丁词（长度≥2、非纯数字、非停用词）+ CJK 二元组。
 * @param {string} text
 * @returns {string[]} 去重后的词素数组
 */
function tokenizeContentWords(text) {
  if (!text || typeof text !== "string") return [];
  const lowered = text.toLowerCase();
  const out = new Set();

  for (const m of lowered.matchAll(LATIN_WORD_RE)) {
    const w = m[0];
    if (w.length < 2) continue;
    if (/^\d+$/.test(w)) continue;
    if (CONTENT_STOPWORDS.has(w)) continue;
    out.add(w);
  }

  for (const m of lowered.matchAll(CJK_RUN_RE)) {
    const run = m[0];
    for (let i = 0; i + 1 < run.length; i++) {
      const bg = run.slice(i, i + 2);
      if (CONTENT_STOPWORDS.has(bg)) continue;
      out.add(bg);
    }
  }

  return [...out];
}

/**
 * 标题与查询是否共享至少一个内容词。
 *
 * 这是「同类标题」的最小判据。GitHub / Reddit 的搜索接口检索的是**正文**，
 * 实测用中文视频标题「三步学会做红烧肉」查 GitHub issues 返回 3595 条，
 * 首条标题却是「旧文归档 · 2024 年 2 月」——正文命中、标题零重叠。
 * 缺这道判据时任何数据源都能把垃圾送进「高互动参考」。
 *
 * @param {string} title 待判定的结果标题
 * @param {Set<string>} queryTokenSet tokenizeContentWords(query) 的 Set 形态
 * @returns {boolean} 查询无内容词时恒 true（无判据可依，不改语义）
 */
function sharesContentWord(title, queryTokenSet) {
  if (!queryTokenSet || queryTokenSet.size === 0) return true;
  if (!title || typeof title !== "string") return false;
  for (const token of tokenizeContentWords(title)) {
    if (queryTokenSet.has(token)) return true;
  }
  return false;
}

module.exports = {
  calculateStats,
  deduplicateResults,
  calculateHourDistribution,
  tokenizeContentWords,
  sharesContentWord,
  CONTENT_STOPWORDS,
};
