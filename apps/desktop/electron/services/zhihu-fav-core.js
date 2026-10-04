// @ts-check
/**
 * zhihu-fav-core — 知乎收藏批量采集的纯函数核心（2026-10-03）
 *
 * PRD-ZHIHU-FAV-BATCH-2026-10-03 §3.1：
 *  - classifyZhihuUrl：按 URL 形态判定内容类型（answer/article/pin/video/column/unknown）。
 *    降级语义（用户决策 B1-B4/Q28/Q29/Q8）：
 *      answer/article → 正文采集；column → 单条登记；pin → 仅登记；video → 仅登记不发布。
 *  - buildUnifiedFavItems：「全部收藏」合并清单 —— 多收藏夹数组合并、跨夹 URL 去重
 *    （保留首次出现）、favTime 降序（缺失/0 排最后）、count 截断或全量 200 封顶（Q21C）。
 *
 * 纯函数、无 IO；被 zhihu-favlist handler（清单拉取与 run 编排）消费。
 */

/** 全量模式封顶（用户 Q21C：200） */
const FULL_MODE_CAP = 200

/**
 * 判定知乎 URL 的内容类型。
 * @param {string} url
 * @returns {'answer'|'article'|'pin'|'video'|'column'|'unknown'}
 */
function classifyZhihuUrl (url) {
  if (typeof url !== 'string' || !url) return 'unknown'
  let u
  try {
    u = new URL(url)
  } catch {
    return 'unknown'
  }
  const host = u.hostname.toLowerCase()
  const isZhihu = host === 'zhihu.com' || host.endsWith('.zhihu.com')
  if (!isZhihu) return 'unknown'
  const parts = u.pathname.split('/').filter(Boolean)
  if (parts[0] === 'question' && parts[2] === 'answer') return 'answer'
  if (parts[0] === 'pin') return 'pin'
  if (parts[0] === 'zvideo') return 'video'
  if (host === 'zhuanlan.zhihu.com') {
    if (parts[0] === 'p') return 'article'
    if (parts[0] && parts[0].indexOf('c_') === 0) return 'column'
  }
  return 'unknown'
}

/**
 * 归一单条清单项：补 kind、清洗数值字段。
 * @param {object} raw
 */
function normalizeFavItem (raw) {
  const kind = classifyZhihuUrl(raw.url)
  return {
    url: String(raw.url || ''),
    title: String(raw.title || ''),
    contentType: String(raw.contentType || ''),
    summary: String(raw.summary || ''),
    favTime: Number(raw.favTime) || 0,
    likeCount: Number(raw.likeCount) || 0,
    kind,
  }
}

/**
 * 「全部收藏」合并清单（scope=all）：
 * 合并多收藏夹条目 → URL 去重（保留首次出现）→ favTime 降序（缺失排最后）→ 截断。
 * @param {Array<Array<object>>} collections - 每个收藏夹的 items 数组
 * @param {{ count?: number, fullMode?: boolean }} [opts]
 * @returns {{ items: Array, truncated: boolean, totalBeforeCut: number }}
 */
function buildUnifiedFavItems (collections, opts = {}) {
  if (!Array.isArray(collections)) {
    return { items: [], truncated: false, totalBeforeCut: 0 }
  }
  const seen = new Set()
  const merged = []
  for (const list of collections) {
    if (!Array.isArray(list)) continue
    for (const raw of list) {
      if (!raw || !raw.url) continue
      const url = String(raw.url)
      if (seen.has(url)) continue
      seen.add(url)
      merged.push(normalizeFavItem(raw))
    }
  }
  merged.sort((a, b) => (Number(b.favTime) || 0) - (Number(a.favTime) || 0))
  const totalBeforeCut = merged.length
  let limit
  if (opts.fullMode === true) {
    limit = FULL_MODE_CAP
  } else {
    const n = Number(opts.count)
    limit = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 50
  }
  const truncated = merged.length > limit
  return { items: merged.slice(0, limit), truncated, totalBeforeCut }
}

module.exports = {
  classifyZhihuUrl,
  buildUnifiedFavItems,
  normalizeFavItem,
  FULL_MODE_CAP,
}
