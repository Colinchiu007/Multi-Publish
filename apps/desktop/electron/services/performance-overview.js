// @ts-check
/**
 * performance-overview — 作品互动回流的唯一聚合口径（P2-6c）
 *
 * 纯函数：不读数据库、不读墙上时钟。判据在这里钉死，store 只负责按同一口径把行喂进来。
 * 口径说明见 01-docs/PRD-PUBLISH-METRICS-DASHBOARD-2026-10-04.md §三（V1–V13）。
 *
 * 最关键的一条是 V1：views/likes/... 是**累计计数**，跨快照求和会把同一作品重复计入数倍，
 * 而虚高的数字在界面上完全正常、没有任何报错，只能在这一层拦。
 */

const OVERVIEW_TRACKED_LIMIT = Number(process.env.MP_PERF_OVERVIEW_TRACKED_LIMIT) || 2000
const OVERVIEW_SNAPSHOT_LIMIT = Number(process.env.MP_PERF_OVERVIEW_SNAPSHOT_LIMIT) || 20000

const DEFAULT_WINDOW_DAYS = 30
const MIN_WINDOW_DAYS = 7
const MAX_WINDOW_DAYS = 90
const WEEK_DAYS = 7

const KNOWN_RECRAWL_STATUS = ['pending', 'ok', 'failed', 'unsupported', 'untrackable', 'manual']
const METRIC_FIELDS = ['views', 'likes', 'comments', 'favorites', 'shares']
const INTERACTION_FIELDS = ['likes', 'comments', 'favorites', 'shares']

/**
 * V5：缺席（null/undefined/空串）、非有限数、负数一律归零并计入 invalidMetrics。
 * 归零而不整条丢弃，是因为采集侧本来就靠零值表达「解析不出来」
 * （`platform-metrics/index.js` 自述「解析失败返回零值由上层记 failed」）；
 * 但不计数就会让「看板比实际少」无从解释。
 */
function readMetric (raw) {
  if (raw === null || raw === undefined || raw === '') return { value: 0, invalid: true }
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return { value: 0, invalid: true }
  return { value: Math.floor(n), invalid: false }
}

/**
 * V3/V9：日期键只在能解析成时刻时可用，其余返回 null 交给调用方计数。
 * ⚠️ 一律按**解析后的 UTC 日**分桶，不按字符串前 10 位——
 * `2026-10-04T08:00:00+08:00` 的真实 UTC 日是 10-04 而字典序会把它和 `2026-10-04T…Z` 混在一起比大小
 * （QM-6 后端轴 FB1：靠字典序既排不对、也分不对桶）。
 */
function dateKeyOf (epochMs) {
  if (!Number.isFinite(epochMs)) return null
  return new Date(epochMs).toISOString().slice(0, 10)
}

/**
 * 时刻解析（FB1）：Date 可解析的字符串（含带时区偏移）优先；
 * 纯数字串按 epoch 秒/毫秒补处理——V8 的 Date.parse 对 '1728000000000' 返回 NaN（本机实测），
 * 不补就会把真实存在的旧数据判成"无日期"。无法解析 → NaN，由调用方计入 droppedUndated。
 */
function toEpochMs (raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw !== 'string' || !raw.trim()) return NaN
  const parsed = Date.parse(raw)
  if (Number.isFinite(parsed)) return parsed
  if (/^\d{13}$/.test(raw)) return Number(raw)
  if (/^\d{10}$/.test(raw)) return Number(raw) * 1000
  return NaN
}

/** V10：非法回落默认，合法但越界钳到 7..90 */
function resolveWindowDays (input) {
  const n = Number(input)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_WINDOW_DAYS
  return Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, Math.round(n)))
}

function normalizePlatform (raw) {
  return String(raw === null || raw === undefined ? '' : raw).trim().toLowerCase()
}

function zeroMetrics () {
  const m = {}
  for (const field of METRIC_FIELDS) m[field] = 0
  m.interactions = 0
  return m
}

function interactionsOf (m) {
  return INTERACTION_FIELDS.reduce((s, field) => s + m[field], 0)
}

/** 把一份指标累加进目标合计（interactions 只统计非播放的四项，播放单列） */
function accumulate (target, source) {
  let interactions = 0
  for (const field of METRIC_FIELDS) {
    target[field] += source[field]
    if (field !== 'views') interactions += source[field]
  }
  target.interactions += interactions
  return target
}

/**
 * @param {object} input
 * @param {Array} [input.trackedRows] - tracked_content 行（已按归属过滤）
 * @param {Array} [input.snapshotRows] - performance_snapshot 行
 * @param {number} [input.windowDays] - 趋势窗口天数
 * @param {number} [input.nowMs] - 注入时钟
 * @param {boolean} [input.trackedTruncated] - 作品侧被扫描上限截断
 * @param {boolean} [input.snapshotTruncated] - 快照侧被扫描上限截断
 * @param {object} [input.limits]
 */
function buildPerformanceOverview (input) {
  const opts = input || {}
  // V13：这一层站在 IPC 边界上，入参再脏也必须给出结构完整的全零结果，不抛错
  const trackedRows = Array.isArray(opts.trackedRows) ? opts.trackedRows : []
  const snapshotRows = Array.isArray(opts.snapshotRows) ? opts.snapshotRows : []
  const windowDays = resolveWindowDays(opts.windowDays)
  const nowMs = Number.isFinite(Number(opts.nowMs)) ? Number(opts.nowMs) : Date.now()
  const limits = {
    tracked: Number(opts.limits && opts.limits.tracked) || OVERVIEW_TRACKED_LIMIT,
    snapshot: Number(opts.limits && opts.limits.snapshot) || OVERVIEW_SNAPSHOT_LIMIT,
  }

  const diagnostics = {
    orphanSnapshots: 0,
    retreats: 0,
    invalidMetrics: 0,
    droppedUndated: 0,
    invalidTrackedRows: 0,
    duplicateTrackedRows: 0,
  }

  const statusTally = {}
  for (const status of KNOWN_RECRAWL_STATUS) statusTally[status] = 0
  statusTally.other = 0

  /** id → { platform, snapshots: Array<{capturedAt:string, epoch:number, seq:number, metrics:object}> } */
  const contents = new Map()
  for (const row of trackedRows) {
    const id = row && row.id !== null && row.id !== undefined ? String(row.id).trim() : ''
    if (!id) { diagnostics.invalidTrackedRows++; continue }
    // FB8：id 是主键，重复只可能来自迁移/手工插入。整行跳过并计数——
    // 若让第一行的 platform 代表该 id 的全部快照，平台分布会静默错位
    if (contents.has(id)) { diagnostics.duplicateTrackedRows++; continue }
    const status = String((row && row.recrawl_status) || '')
    statusTally[KNOWN_RECRAWL_STATUS.includes(status) ? status : 'other'] += 1
    contents.set(id, { platform: normalizePlatform(row.platform), snapshots: [] })
  }

  // V4：关联不到作品的快照不参与任何聚合，但必须计数——静默丢弃会让数字难以解释
  let seq = 0
  for (const row of snapshotRows) {
    const id = row && row.tracked_content_id !== null && row.tracked_content_id !== undefined
      ? String(row.tracked_content_id).trim() : ''
    const content = contents.get(id)
    if (!content) { diagnostics.orphanSnapshots++; seq++; continue }
    const metrics = zeroMetrics()
    for (const field of METRIC_FIELDS) {
      const read = readMetric(row[field])
      if (read.invalid) diagnostics.invalidMetrics++
      metrics[field] = read.value
    }
    metrics.interactions = interactionsOf(metrics)
    content.snapshots.push({
      capturedAt: typeof row.captured_at === 'string' ? row.captured_at : '',
      epoch: toEpochMs(row.captured_at),
      seq: seq++,
      metrics,
    })
  }

  const totals = zeroMetrics()
  const dayBuckets = new Map()
  const platformMap = new Map()
  let covered = 0
  let lastCapturedAt = null
  let lastEpoch = NaN

  for (const content of contents.values()) {
    if (content.snapshots.length === 0) continue
    covered++

    // V2：按解析后的时刻升序，同值时按入参顺序取靠后者（= 更大 rowid），
    // 与 getLatestSnapshot 的 ORDER BY captured_at DESC, rowid DESC 同口径。
    // 不能按 captured_at 字典序：epoch 数字串和带偏移的串会排错序（FB1）。
    const ordered = content.snapshots.slice().sort((a, b) => {
      const ea = Number.isFinite(a.epoch) ? a.epoch : Number.NEGATIVE_INFINITY
      const eb = Number.isFinite(b.epoch) ? b.epoch : Number.NEGATIVE_INFINITY
      if (ea !== eb) return ea - eb
      return a.seq - b.seq
    })
    const latest = ordered[ordered.length - 1]
    accumulate(totals, latest.metrics)
    if (Number.isFinite(latest.epoch) && (!Number.isFinite(lastEpoch) || latest.epoch > lastEpoch)) {
      lastEpoch = latest.epoch
      lastCapturedAt = latest.capturedAt
    }

    let p = platformMap.get(content.platform)
    if (!p) { p = { platform: content.platform, contents: 0, ...zeroMetrics() }; platformMap.set(content.platform, p) }
    p.contents += 1
    accumulate(p, latest.metrics)

    // V7/V8：日增 = 相邻两份之差；负差按 0 计并计数；首份整份计入其采集日
    let prev = null
    for (const point of ordered) {
      const key = dateKeyOf(point.epoch)
      if (key === null) {
        // V3：日期不可信 → 不进趋势，但仍充当后续点的基线（否则下一份会把这段量重复计入）
        diagnostics.droppedUndated++
        prev = point.metrics
        continue
      }
      const delta = zeroMetrics()
      if (!prev) {
        for (const field of METRIC_FIELDS) delta[field] = point.metrics[field]
        delta.interactions = point.metrics.interactions
      } else {
        let retreated = false
        for (const field of METRIC_FIELDS) {
          const diff = point.metrics[field] - prev[field]
          if (diff < 0) { retreated = true } else { delta[field] = diff }
        }
        if (retreated) diagnostics.retreats++
        delta.interactions = interactionsOf(delta)
      }
      let bucket = dayBuckets.get(key)
      if (!bucket) { bucket = zeroMetrics(); dayBuckets.set(key, bucket) }
      accumulate(bucket, delta)
      prev = point.metrics
    }
  }

  // V6 + 稳定排序：互动降序，并列按平台名字典序（并列时按序渲染，避免同一份数据两次渲染跳序）
  const byPlatform = Array.from(platformMap.values()).sort((a, b) => {
    if (b.interactions !== a.interactions) return b.interactions - a.interactions
    return a.platform < b.platform ? -1 : (a.platform > b.platform ? 1 : 0)
  })

  // V9：窗口内逐日补零——省略日期会让"相邻两根柱"其实是隔了五天，用户读出的趋势是错的
  const todayKey = new Date(nowMs).toISOString().slice(0, 10)
  const todayMs = Date.parse(todayKey + 'T00:00:00.000Z')
  const trend = []
  for (let i = windowDays - 1; i >= 0; i--) {
    const key = new Date(todayMs - i * 86400000).toISOString().slice(0, 10)
    const bucket = dayBuckets.get(key)
    trend.push({ date: key, ...(bucket || zeroMetrics()) })
  }

  // V12：前 7 天基线为 0 时不给百分比——`0 → 5` 写成 +100% 或 +∞ 都是假结论；
  // 窗口不足 14 天时前 7 天取不到完整区间，同样返回 null（宁可少说，不可说错）。
  const sliceSum = (from, to) => trend
    .slice(Math.max(0, trend.length - to), Math.max(0, trend.length - from))
    .reduce((s, d) => s + d.interactions, 0)
  const currentWeek = trend.length >= WEEK_DAYS ? sliceSum(0, WEEK_DAYS) : 0
  const previousWeek = trend.length >= WEEK_DAYS * 2 ? sliceSum(WEEK_DAYS, WEEK_DAYS * 2) : 0
  const weekChange = previousWeek > 0
    ? { current: currentWeek, previous: previousWeek, percent: Math.round(((currentWeek - previousWeek) / previousWeek) * 100) }
    : null

  const trackedTotal = contents.size
  return {
    hasData: covered > 0,
    windowDays,
    totals,
    trend,
    byPlatform,
    health: {
      trackedTotal,
      covered,
      coverage: trackedTotal > 0 ? Math.round((covered / trackedTotal) * 100) : 0,
      byStatus: statusTally,
      lastCapturedAt,
      neverRecrawled: trackedTotal > 0 && covered === 0,
    },
    weekChange,
    truncated: { tracked: Boolean(opts.trackedTruncated), snapshot: Boolean(opts.snapshotTruncated) },
    limits,
    diagnostics,
  }
}

module.exports = {
  buildPerformanceOverview,
  OVERVIEW_TRACKED_LIMIT,
  OVERVIEW_SNAPSHOT_LIMIT,
  DEFAULT_WINDOW_DAYS,
  MIN_WINDOW_DAYS,
  MAX_WINDOW_DAYS,
  KNOWN_RECRAWL_STATUS,
}
