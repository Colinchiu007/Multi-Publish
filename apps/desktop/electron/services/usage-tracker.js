// @ts-check
/**
 * UsageTracker - 桌面端使用量统计模块
 *
 * 追踪用户在 Multi-Publish 中的功能使用情况
 * 存储: JSON 文件 (userData/usage-data.json)
 *
 * 使用方式:
 *   const tracker = new UsageTracker()
 *   tracker.trackEvent("publish", "click", { platform: "weibo" })
 *   tracker.trackFeatureUsage("publish_button", "click")
 *   tracker.trackDaily("articles_published", 1)
 *   const stats = tracker.getStats()
 */

const fs = require("fs")
const path = require("path")
const { app } = require("electron")
const log = require("./logger")

class UsageTracker {
  constructor(dataPath) {
    this._dataPath = dataPath || path.join(app.getPath("userData"), "usage-data.json")
    this._data = {
      events: [],
      features: {},
      daily: {},
      sessions: 0,
      since: null,
    }
    this._loaded = false
    this._maxEvents = 1000  // 最多保留最近 1000 条事件
  }

  /**
   * 从磁盘加载数据
   */
  load() {
    try {
      if (fs.existsSync(this._dataPath)) {
        const raw = fs.readFileSync(this._dataPath, "utf-8")
        const parsed = JSON.parse(raw)
        this._data = Object.assign(this._data, parsed)
      }
    } catch (e) {
      log.warn("UsageTracker", "Failed to load: " + e.message)
    }
    if (!this._data.since) this._data.since = new Date().toISOString()
    this._loaded = true
  }

  /**
   * 保存到磁盘
   */
  save() {
    try {
      const dir = path.dirname(this._dataPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const tmpPath = this._dataPath + ".tmp"
      fs.writeFileSync(tmpPath, JSON.stringify(this._data, null, 2), "utf-8")
      fs.renameSync(tmpPath, this._dataPath)
    } catch (e) {
      log.warn("UsageTracker", "Failed to save: " + e.message)
    }
  }

  /**
   * 记录一个功能事件
   * @param {string} feature - 功能名称 (如 "publish", "login", "settings")
   * @param {string} action - 动作 (如 "click", "success", "fail")
   * @param {object} [detail] - 附加信息
   */
  trackEvent(feature, action, detail) {
    if (!this._loaded) this.load()
    this._data.events.push({
      feature: feature,
      action: action,
      detail: detail || {},
      timestamp: new Date().toISOString(),
    })
    // 限制事件数量
    if (this._data.events.length > this._maxEvents) {
      this._data.events = this._data.events.slice(-this._maxEvents)
    }
    this._autoSave()
  }

  /**
   * 记录功能使用次数
   * @param {string} feature - 功能名称
   * @param {string} action - 动作类型
   */
  trackFeatureUsage(feature, action) {
    if (!this._loaded) this.load()
    if (!this._data.features[feature]) this._data.features[feature] = {}
    this._data.features[feature][action] = (this._data.features[feature][action] || 0) + 1
    this._autoSave()
  }

  /**
   * 记录每日统计
   * @param {string} key - 统计项 (如 "articles_published", "platforms_used")
   * @param {number} count - 数量
   */
  trackDaily(key, count) {
    if (!this._loaded) this.load()
    const today = new Date().toISOString().split("T")[0]
    if (!this._data.daily[today]) this._data.daily[today] = {}
    this._data.daily[today][key] = (this._data.daily[today][key] || 0) + count
    this._autoSave()
  }

  /**
   * 记录一次会话
   */
  trackSession() {
    if (!this._loaded) this.load()
    this._data.sessions++
    this._autoSave()
  }

  /**
   * 获取统计摘要
   */
  getStats() {
    if (!this._loaded) this.load()
    return {
      features: this._data.features,
      events: this._data.events,
      sessions: this._data.sessions,
      since: this._data.since,
    }
  }

  /**
   * 获取每日统计
   */
  getDailyStats() {
    if (!this._loaded) this.load()
    return this._data.daily
  }

  /**
   * 重置所有数据
   */
  reset() {
    this._data = {
      events: [],
      features: {},
      daily: {},
      sessions: 0,
      since: new Date().toISOString(),
    }
    this.save()
  }

  /**
   * 惰性保存（每 5 次操作自动存一次，减少磁盘写入）
   */
  _autoSave() {
    if (!this._saveCounter) this._saveCounter = 0
    this._saveCounter++
    if (this._saveCounter % 5 === 0) this.save()
  }
}

module.exports = UsageTracker
