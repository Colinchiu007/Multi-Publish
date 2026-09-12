// @ts-check
/**
 * PerformanceRecrawlService — 表现数据回采服务
 *
 * 触发：bootstrap runWhenReady 后延迟 30s + 每 24h 巡检。
 * 筛选：next_recrawl_at 到期 + 发布 7 天内 + status ∈ (pending, ok)。
 * 采样节奏：+1h / +6h / +24h / +72h / +7d（由 nextRecrawlAt 推进），7 天后停止。
 * 执行：平台间顺序 + 请求间 2-5s 随机抖动；单条失败记 failed，连续失败 3 次转 manual。
 * 每次成功 → 插入 performance_snapshot → 更新 tracked_content。
 * 任何失败不阻塞发布/主流程（后台静默）。
 */
const log = require('./logger')
const { getParser } = require('./platform-metrics')

// 采样节奏（发布后偏移，毫秒）；7 天后不再排期
const RECRAWL_OFFSETS_MS = [
  1 * 3600 * 1000,        // +1h
  6 * 3600 * 1000,        // +6h
  24 * 3600 * 1000,       // +24h
  72 * 3600 * 1000,       // +72h
  7 * 24 * 3600 * 1000,   // +7d
]
const MAX_CONSECUTIVE_FAILURES = 3

class PerformanceRecrawlService {
  constructor(opts) {
    opts = opts || {}
    this._store = opts.store || null
    this._running = false
    this._dailyTimer = null
    // 连续失败计数（内存态；应用重启清零可接受——回采是尽力而为）
    this._failureCounts = new Map()
  }

  setStore(store) { this._store = store }

  /** 请求间随机抖动（测试可覆写） */
  _jitter() {
    return new Promise(r => setTimeout(r, 2000 + Math.random() * 3000))
  }

  /**
   * 巡检一轮：取到期内容 → 逐平台回采 → 写快照 → 推进节奏
   */
  async processRound() {
    if (!this._store) return
    if (this._running) return // 防重入
    this._running = true
    try {
      const due = this._store.listDueForRecrawl(Date.now())
      for (const item of due) {
        try {
          await this._recrawlOne(item)
        } catch (e) {
          this._recordFailure(item, e)
        }
        // 请求间 2-5s 随机抖动（低量场景不引入 governor，避免过度工程）
        await this._jitter()
      }
    } finally {
      this._running = false
    }
  }

  async _recrawlOne(item) {
    const parser = getParser(item.platform)
    if (!parser) {
      this._store.updateTrackedContent(item.id, { recrawlStatus: 'unsupported' })
      return
    }

    const contentUrl = parser.resolveContentUrl(item.post_id, item.url)
    if (!contentUrl && !item.post_id) {
      this._store.updateTrackedContent(item.id, { recrawlStatus: 'untrackable' })
      return
    }

    const metrics = await parser.fetchMetrics({ url: contentUrl, postId: item.post_id })

    // 写快照
    this._store.addPerformanceSnapshot({
      trackedContentId: item.id,
      source: 'auto',
      views: metrics.views,
      likes: metrics.likes,
      comments: metrics.comments,
      favorites: metrics.favorites,
      shares: metrics.shares,
      raw: metrics.raw || {},
    })

    // 成功：清失败计数 + 推进采样节奏
    this._failureCounts.delete(item.id)
    const nextAt = this._nextRecrawlAt(item)
    this._store.updateTrackedContent(item.id, {
      recrawlStatus: 'ok',
      lastRecrawlAt: new Date().toISOString(),
      nextRecrawlAt: nextAt,
    })
  }

  _recordFailure(item, e) {
    const count = (this._failureCounts.get(item.id) || 0) + 1
    this._failureCounts.set(item.id, count)
    log.warn('PerformanceRecrawl', 'recrawl failed (' + count + ') for ' + item.platform + ':' + (item.post_id || item.id) + ': ' + (e && e.message))
    if (count >= MAX_CONSECUTIVE_FAILURES) {
      // 连续失败 3 次 → manual（UI 手动录入兜底）
      this._store.updateTrackedContent(item.id, { recrawlStatus: 'manual', nextRecrawlAt: null })
      this._failureCounts.delete(item.id)
    } else {
      // 失败重试：1h 后再试
      this._store.updateTrackedContent(item.id, {
        recrawlStatus: 'failed',
        nextRecrawlAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      })
    }
  }

  /**
   * 推进采样节奏：按发布时间找下一个未过的偏移点；全部过完返回 null（停止自动回采）
   */
  _nextRecrawlAt(item) {
    const publishedAt = new Date(item.created_at).getTime()
    if (!Number.isFinite(publishedAt)) return null
    const now = Date.now()
    for (const offset of RECRAWL_OFFSETS_MS) {
      const candidate = publishedAt + offset
      if (candidate > now) return new Date(candidate).toISOString()
    }
    return null // 7 天窗口结束
  }

  start() {
    if (this._dailyTimer) return
    setTimeout(() => {
      this.processRound().catch(e => log.warn('PerformanceRecrawl', 'initial round failed: ' + e.message))
    }, 30 * 1000).unref?.()
    this._dailyTimer = setInterval(() => {
      this.processRound().catch(e => log.warn('PerformanceRecrawl', 'daily round failed: ' + e.message))
    }, 24 * 3600 * 1000)
    if (this._dailyTimer.unref) this._dailyTimer.unref()
    log.info('PerformanceRecrawl', 'scheduler started (30s delay + daily)')
  }

  stop() {
    if (this._dailyTimer) {
      clearInterval(this._dailyTimer)
      this._dailyTimer = null
    }
  }
}

module.exports = { PerformanceRecrawlService, RECRAWL_OFFSETS_MS }
