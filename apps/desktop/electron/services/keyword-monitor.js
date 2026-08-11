// @ts-check
/**
 * KeywordMonitor — 关键词背景监测（方案 D.6）
 *
 * 持续监测指定关键词的讨论热度变化，记录趋势。
 * 异常飙升时触发桌面通知。
 *
 * 文件位置: apps/desktop/electron/keyword-monitor.js
 */
const log = require('./logger')

// Default poll interval: 6 hours
const DEFAULT_INTERVAL = 6 * 60 * 60 * 1000
const MAX_KEYWORDS = 20

class KeywordMonitor {
  constructor (contentIntelligence, store) {
    this.ci = contentIntelligence
    this._store = store
    this._watchers = new Map()   // keyword -> { timer, history, threshold }
    this._onAlert = null         // callback for spike alerts
  }

  /**
   * Set alert callback (called when a keyword spikes).
   * @param {function} cb — (keyword, current, previous) => void
   */
  onAlert (cb) {
    this._onAlert = cb
  }

  /**
   * Start monitoring a keyword.
   * @param {string} keyword
   * @param {object} [opts]
   * @param {number} [opts.interval] — Poll interval in ms (default 6h)
   * @param {number} [opts.threshold] — Spike detection multiplier (default 2.0 = 2x)
   */
  startMonitoring (keyword, opts = {}) {
    if (!keyword || keyword.length < 2) return false
    if (this._watchers.size >= MAX_KEYWORDS) {
      log.warn('KeywordMonitor', 'Max keywords reached, cannot add: ' + keyword)
      return false
    }
    if (this._watchers.has(keyword)) return true  // Already monitoring

    const interval = opts.interval || DEFAULT_INTERVAL
    const threshold = opts.threshold || 2.0
    const history = []

    // Load any persisted history
    const saved = this._loadHistory(keyword)
    if (saved) history.push(...saved)

    const watcher = {
      keyword,
      interval,
      threshold,
      history,
      timer: null,
      lastTotal: saved.length > 0 ? saved[saved.length - 1].total : null,
      source: 'user', // user | remote | restored
    }

    // First poll immediately
    this._poll(watcher)

    // Then schedule periodic polls
    watcher.timer = setInterval(() => this._poll(watcher), interval)
    // R28 修复：unref 让定时器不阻止进程退出（后台监控不应持有事件循环）
    if (watcher.timer.unref) watcher.timer.unref()

    this._watchers.set(keyword, watcher)
    log.info('KeywordMonitor', `Started monitoring "${keyword}" every ${Math.round(interval / 60000)}min`)
    return true
  }

  /**
   * Stop monitoring a keyword.
   */
  stopMonitoring (keyword) {
    const watcher = this._watchers.get(keyword)
    if (!watcher) return false
    clearInterval(watcher.timer)
    this._watchers.delete(keyword)
    log.info('KeywordMonitor', `Stopped monitoring "${keyword}"`)
    return true
  }

  /**
   * Get all monitored keywords and their status.
   */
  getStatus () {
    const result = []
    for (const [keyword, w] of this._watchers) {
      result.push({
        keyword,
        samples: w.history.length,
        lastTotal: w.history.length > 0 ? w.history[w.history.length - 1].total : 0,
        lastChecked: w.history.length > 0 ? w.history[w.history.length - 1].checkedAt : null,
        interval: w.interval,
        threshold: w.threshold,
      })
    }
    return result
  }

  /**
   * Get the full history for a keyword.
   */
  getHistory (keyword) {
    const w = this._watchers.get(keyword)
    if (!w) return []
    return w.history
  }

  /**
   * Get all keyword histories (for persistence/restore).
   */
  getAllHistories () {
    const result = {}
    for (const [keyword, w] of this._watchers) {
      result[keyword] = w.history
    }
    return result
  }

  /**
   * Restore watchers from saved state (app restart).
   */
  restoreFromState (state) {
    if (!state || typeof state !== 'object') return
    let count = 0
    for (const [keyword, history] of Object.entries(state)) {
      if (this._watchers.has(keyword)) continue
      const watcher = {
        keyword,
        interval: DEFAULT_INTERVAL,
        threshold: 2.0,
        history: Array.isArray(history) ? history : [],
        timer: null,
        lastTotal: Array.isArray(history) && history.length > 0 ? history[history.length - 1].total : null,
        source: 'restored',
      }
      watcher.timer = setInterval(() => this._poll(watcher), DEFAULT_INTERVAL)
      // R28 修复：unref 让定时器不阻止进程退出（恢复的监控同样不应持有事件循环）
      if (watcher.timer.unref) watcher.timer.unref()
      this._watchers.set(keyword, watcher)
      count++
    }
    if (count > 0) log.info('KeywordMonitor', `Restored ${count} keyword watchers`)
  }

  /**
   * 应用运营后台下发的关键词监测目录（运行时同步）
   * 契约：按 keyword upsert；远程条目设置 interval/threshold 并标记 source=remote；
   * 本次下发未包含的远程条目停止监测（缺席即移除）；用户/恢复条目保留；
   * 达到 MAX_KEYWORDS 上限时跳过新增并 warn。
   * @param {Array<object>|null|undefined} entries - 远程监测目录
   * @returns {number} 应用（新增/更新/停止）的条目数
   */
  applyRemoteWatchlist (entries) {
    if (!Array.isArray(entries)) return 0
    const remoteKeywords = new Set()
    let applied = 0
    for (const e of entries) {
      if (!e || typeof e !== 'object') continue
      const keyword = String(e.keyword || '').trim()
      if (!keyword) continue
      remoteKeywords.add(keyword)
      const interval = Number.isFinite(Number(e.interval_minutes))
        ? Math.max(10, Math.min(10080, Math.round(Number(e.interval_minutes)))) * 60 * 1000
        : DEFAULT_INTERVAL
      const threshold = Number.isFinite(Number(e.threshold)) ? Math.max(1, Number(e.threshold)) : 2.0
      const existing = this._watchers.get(keyword)
      if (existing) {
        existing.interval = interval
        existing.threshold = threshold
        // 仅远程来源的词保持 remote（缺席可停止）；用户/恢复词被远程更新时保留原来源，避免缺席误停
        if (existing.source !== 'user' && existing.source !== 'restored') existing.source = 'remote'
        if (existing.timer) clearInterval(existing.timer)
        existing.timer = setInterval(() => this._poll(existing), interval)
        if (existing.timer.unref) existing.timer.unref()
        applied++
      } else {
        if (this._watchers.size >= MAX_KEYWORDS) {
          log.warn('KeywordMonitor', 'Max keywords reached, remote watchlist skip: ' + keyword)
          continue
        }
        const watcher = {
          keyword, interval, threshold,
          history: [], timer: null, lastTotal: null, source: 'remote',
        }
        this._poll(watcher)
        watcher.timer = setInterval(() => this._poll(watcher), interval)
        if (watcher.timer.unref) watcher.timer.unref()
        this._watchers.set(keyword, watcher)
        applied++
      }
    }
    // 缺席即停止远程监测
    let stopped = 0
    for (const [keyword, w] of Array.from(this._watchers.entries())) {
      if (w.source === 'remote' && !remoteKeywords.has(keyword)) {
        clearInterval(w.timer)
        this._watchers.delete(keyword)
        stopped++
      }
    }
    if (applied + stopped > 0) {
      log.info('KeywordMonitor', `remote watchlist applied: ${applied} updated, ${stopped} stopped`)
    }
    return applied + stopped
  }

  /**
   * Stop all watchers (app shutdown).
   */
  stopAll () {
    // eslint-disable-next-line no-unused-vars
    for (const [keyword, w] of this._watchers) {
      clearInterval(w.timer)
    }
    this._watchers.clear()
    log.info('KeywordMonitor', 'All watchers stopped')
  }

  // ── Internal ──────────────────────────────────────────────────

  async _poll (watcher) {
    try {
      const result = await this.ci.search(watcher.keyword, { limit: 5, noCache: true })
      const total = result.total || 0
      const topEngagement = result.results?.[0]?.engagement || 0

      const snapshot = {
        total,
        topEngagement,
        topSource: result.results?.[0]?.source || null,
        topTitle: result.results?.[0]?.title?.slice(0, 60) || null,
        checkedAt: new Date().toISOString(),
      }

      watcher.history.push(snapshot)
      if (watcher.history.length > 50) watcher.history.shift()  // Keep last 50

      // Spike detection
      if (watcher.lastTotal !== null && watcher.threshold > 0) {
        const ratio = watcher.lastTotal > 0 ? total / watcher.lastTotal : 0
        if (ratio >= watcher.threshold) {
          log.info('KeywordMonitor', `Spike detected: "${watcher.keyword}" ${watcher.lastTotal} → ${total} (${ratio.toFixed(1)}x)`)
          if (this._onAlert) {
            this._onAlert(watcher.keyword, total, watcher.lastTotal, ratio)
          }
        }
      }

      watcher.lastTotal = total

      // Persist after each poll
      this._persistAll()

    } catch (e) {
      log.warn('KeywordMonitor', `Poll error for "${watcher.keyword}": ${e.message}`)
    }
  }

  _loadHistory (keyword) {
    if (!this._store || !this._store._ready) return null
    try {
      const key = 'kw_history_' + keyword
      const raw = typeof this._store.getUserSetting === 'function'
        ? this._store.getUserSetting(key, null)
        : this._store.getSetting(key)
      return raw || null
    } catch { return null }
  }

  _persistAll () {
    if (!this._store || !this._store._ready) return
    try {
      for (const [keyword, w] of this._watchers) {
        const key = 'kw_history_' + keyword
        if (typeof this._store.setUserSetting === 'function') {
          this._store.setUserSetting(key, w.history)
        } else {
          this._store.setSetting(key, w.history)
        }
      }
    } catch (e) {
      log.warn('KeywordMonitor', `Persist error: ${e.message}`)
    }
  }
}

module.exports = KeywordMonitor
