// @ts-check
/**
 * rollout-board-utils.js — 生效看板纯函数（渲染判据单一真源）
 *
 * 为什么独立成模块（与 content-quality-eval-utils.js 同一先例）：
 *   项目前端无 @vue/test-utils，.vue 文件不可直接挂载测试。
 *   把全部渲染判据（百分比换算、排序、时间格式化、候选集构造、空态判定）
 *   提炼为纯函数后，`rollout-view.test.js` 可以不依赖 DOM 覆盖全部规格场景；
 *   RolloutView.vue 只做「调函数 → 塞模板」的薄壳，逻辑改动必先改这里+测试。
 *
 * 契约来源：`ops-center/backend/services/resilience_service.py` rollout_summary()。
 * 语义锚点（docstring 原文）：
 *   - total = 活跃客户端总数（曾 ACK 过的个数）
 *   - acked/stale 按版本分桶；degraded 是独立维度（不与 stale 互斥）
 *   - block_rates 值域 0~1 小数，只统计 acked 当前版的客户端
 */

/**
 * 0~1 小数 → 百分比文案（1 位小数）。非法输入返回 '0.0%' 而非 NaN。
 * @param {number|undefined|null} ratio
 * @returns {string}
 */
export function formatPercent(ratio) {
  const n = Number(ratio)
  if (!Number.isFinite(n)) return '0.0%'
  const clamped = Math.min(Math.max(n, 0), 1)
  return (clamped * 100).toFixed(1) + '%'
}

/**
 * ISO 时间 → 本地可读时间（YYYY-MM-DD HH:mm）。空/非法返回 '—'。
 * @param {string|undefined|null} iso
 * @returns {string}
 */
export function formatAckTime(iso) {
  if (!iso || typeof iso !== 'string') return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (x) => String(x).padStart(2, '0')
  return (
    d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
  )
}

/**
 * block_rates → 降序数组（块名 + 百分比文案）。
 * 输入非对象/空 → 空数组。同名键值非法视为 0。
 * @param {Record<string, number>|undefined|null} blockRates
 * @returns {Array<{name: string, percent: string, ratio: number}>}
 */
export function sortedBlockRates(blockRates) {
  if (!blockRates || typeof blockRates !== 'object' || Array.isArray(blockRates)) return []
  return Object.entries(blockRates)
    .map(([name, ratio]) => {
      const n = Number(ratio)
      const safe = Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0
      return { name, percent: formatPercent(safe), ratio: safe }
    })
    .sort((a, b) => b.ratio - a.ratio)
}

/**
 * 版本切换候选集：当前版本 + 明细中出现过的版本，去重降序。
 * **不伪造**：只来自已见数据（design.md D6 备选 A 被否的原因）。
 * @param {number|undefined|null} currentVersion
 * @param {Array<{config_version: number}>|undefined|null} clients
 * @returns {number[]}
 */
export function versionOptions(currentVersion, clients) {
  const set = new Set()
  const cur = Number(currentVersion)
  if (Number.isFinite(cur) && cur > 0) set.add(cur)
  if (Array.isArray(clients)) {
    for (const c of clients) {
      const v = Number(c && c.config_version)
      if (Number.isFinite(v) && v > 0) set.add(v)
    }
  }
  return [...set].sort((a, b) => b - a)
}

/**
 * 空态判定：total===0（含缺失/非法）→ 引导空态，不渲染 0% 假卡片。
 * @param {{total?: number}|undefined|null} summary
 * @returns {boolean}
 */
export function isEmptySummary(summary) {
  if (!summary || typeof summary !== 'object') return true
  return !(Number(summary.total) > 0)
}

/**
 * 降级行的 tier 徽标文案。degraded=false → ''；tier 缺失 → 'L?'。
 * @param {{degraded?: boolean, degradation_tier?: string|null}} client
 * @returns {string}
 */
export function degradationBadge(client) {
  if (!client || !client.degraded) return ''
  const t = client.degradation_tier
  return (typeof t === 'string' && t.trim()) ? t.trim() : 'L?'
}
