// @ts-check
/**
 * provider-anomaly - 模型服务调用异常检测（耗时异常/超时/网络错误）
 *
 * 目的：当某个 provider 调用时长异常（如 agnes-llm 单次 2-3 分钟）或反复失败时，
 * 记录结构化异常快照，供流水线 getRunContext 下发，前端展示友好提示，
 * 并写入 app 日志（含 provider/model/耗时），便于用户/官方/AI 定位「模型自身问题」。
 *
 * 仅内存快照（不落库）：重启即清空，避免状态膨胀。
 */

'use strict'

const { EventEmitter } = require('events')

const SLOW_THRESHOLDS_MS = Object.freeze({
  llm: 30000,
  tts: 30000,
  image: 60000,
  video: 120000,
  audio: 30000,
  default: 60000,
})

const MAX_SNAPSHOT = 5

function slowThresholdMs (category) {
  return Number.isFinite(SLOW_THRESHOLDS_MS[category])
    ? SLOW_THRESHOLDS_MS[category]
    : SLOW_THRESHOLDS_MS.default
}

class ProviderAnomalyBus {
  constructor () {
    this._emitter = new EventEmitter()
    this._anomalies = new Map() // providerId -> { providerId, category, model, latencyMs, kind, lastAt }
  }

  /** 判断耗时是否超过该类别阈值（模型服务响应异常） */
  isSlow (category, latencyMs) {
    const threshold = slowThresholdMs(category)
    return Number.isFinite(Number(latencyMs)) && Number(latencyMs) >= threshold
  }

  /**
   * 上报一次异常调用（慢响应/超时/网络错误）。
   * @param {object} call - { providerId, category, model, latencyMs, kind: 'slow'|'timeout'|'network' }
   */
  report (call) {
    if (!call || typeof call.providerId !== 'string' || !call.providerId.trim()) return
    const entry = {
      providerId: call.providerId,
      category: call.category || 'default',
      model: typeof call.model === 'string' && call.model.trim() ? call.model.trim() : '',
      latencyMs: Number.isFinite(Number(call.latencyMs)) ? Number(call.latencyMs) : null,
      kind: call.kind || 'slow',
      lastAt: new Date().toISOString(),
    }
    this._anomalies.set(call.providerId, entry)
    this._emitter.emit('anomaly', entry)
  }

  /** 最近异常快照（按最近更新时间排序，最多 MAX_SNAPSHOT 条） */
  snapshot () {
    return Array.from(this._anomalies.values())
      .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
      .slice(0, MAX_SNAPSHOT)
  }
  /**
   * 仅返回 sinceIso（含）之后记录的异常（用于按流水线运行归属过滤，避免跨运行残留）。
   * - sinceIso 支持 ISO 字符串或 epoch 毫秒数；非法/缺失时回退全量快照（不隐藏警告）。
   * - 先过滤后截断：仅统计运行窗口内的条目再取最近 MAX_SNAPSHOT 条，避免截断误丢运行内条目。
   * - 新运行恒有 createdAt（引擎创建运行即写入），无 createdAt 回退全量仅覆盖历史/异常数据场景。
   * - 已知边界：条目只记录 lastAt 不记录 runId，跨运行/并发运行的异常按时间近似归属，
   *   未来如需精确归属可在 report() 增加 runId 维度。
   */
  snapshotSince (sinceIso) {
    const since = typeof sinceIso === 'number' ? sinceIso : Date.parse(String(sinceIso || ''))
    if (!Number.isFinite(since)) return this.snapshot()
    return Array.from(this._anomalies.values())
      .filter((entry) => Date.parse(entry.lastAt) >= since)
      .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
      .slice(0, MAX_SNAPSHOT)
  }

  clear () {
    this._anomalies.clear()
  }

  on (event, handler) { this._emitter.on(event, handler) }
}

module.exports = {
  ProviderAnomalyBus,
  providerAnomalyBus: new ProviderAnomalyBus(),
  slowThresholdMs,
  MAX_SNAPSHOT,
}
