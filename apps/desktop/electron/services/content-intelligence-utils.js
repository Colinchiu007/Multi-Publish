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

module.exports = { calculateStats, deduplicateResults, calculateHourDistribution };
