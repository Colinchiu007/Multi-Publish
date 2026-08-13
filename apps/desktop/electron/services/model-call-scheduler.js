// @ts-check
/**
 * model-call-scheduler.js — 视频创作/模型调用统一调度机制（薄封装）
 *
 * 目标：把「调用模型的方法」提炼为单独机制，依据前端设置的默认模型（provider config）
 * 与运营后台设置的「每分钟连接次数 / 5小时限额次数」（rate_per_minute / limit_per_5h）
 * 合理安排并行调用数量与排队机制：
 *   - resolveProviderBudget：预算来源 = provider 配置（运营后台值）> 静态表 > 类别默认
 *   - withModelBudget：单次调用走 ApiUsageGovernor（RPM 时间槽排队 + 429 冷却重试 + 5h 请求窗口）
 *   - mapWithModelBudget：有界并发 map（并发上限 = min(请求并发, provider maxConcurrent)），
 *     超出部分进入 worker 队列排队执行
 * 所有数值为保守估计；真实限流由 governor 的 429 自适应（rateFactor 0.75 下调）兜底。
 */
'use strict'

const { PROVIDER_LIMITS } = require('./governor-provider-limits')

const MAX_SAFE_CONCURRENCY = 8

function clampInt(value, min, max, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(min, Math.min(max, Math.floor(num)))
}

function _toPositiveIntOrNull(value, max) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return null
  const num = Number(value)
  if (!Number.isFinite(num) || num < 1) return null
  return Math.min(max, Math.floor(num))
}

/** 归一化每分钟连接次数：正整数，1..100000；非法/空返回 null */
function normalizeRatePerMinute(value) {
  return _toPositiveIntOrNull(value, 100000)
}

/** 归一化 5小时限额次数：正整数，1..10000000；非法/空返回 null */
function normalizeLimitPer5h(value) {
  return _toPositiveIntOrNull(value, 10000000)
}

/**
 * 解析 provider 的调度预算。
 * @param {{ provider?: object|null, type?: string, manager?: object|null, governor?: object|null }} ctx
 *   provider: { id, category, config }（config 含 rate_per_minute/limit_per_5h）
 * @returns {{ rpm: number, maxConcurrent: number, limitPer5h: number|null, source: string }}
 */
function resolveProviderBudget({ provider, type = '', manager, governor }) {
  const providerId = provider && typeof provider.id === 'string' ? provider.id : ''
  const config = (provider && provider.config && typeof provider.config === 'object') ? provider.config : {}
  const staticLimits = (providerId && PROVIDER_LIMITS[providerId]) || {}

  const rpm = normalizeRatePerMinute(config.rate_per_minute)
  const limit5h = normalizeLimitPer5h(config.limit_per_5h)

  // 并发换算：每分钟连接次数 → 并发上限。
  // 同步类（llm/tts/image/stt）：保守取 1/10，下限 1、上限 4（rpm 120 → 4）。
  // 视频（异步任务制，2026-08-13 评估）：生成 = 提交 + 轮询 + 下载；提交/轮询为轻量请求，
  // 服务端任务队列支持多路并行，主流 provider（Kling/Runway/Hailuo/HeyGen/CogVideo/LTX 等）
  // 2 路并行安全，可将视频串行时长减半；rpm 只约束提交速率，并发 = 在途任务数，二者正交。
  // rpm 6 → ceil(6/3)=2；rpm 8 → ceil(8/3)=3→cap 2；rpm 20 → 7→cap 2。
  const baseRpm = rpm || staticLimits.rpm || 20
  const staticConcurrent = clampInt(staticLimits.maxConcurrent, 1, MAX_SAFE_CONCURRENCY, 2)
  const isVideo = type === 'video'
  const isAudio = type === 'audio'
  const maxConcurrent = rpm
    ? (isVideo
        ? Math.max(1, Math.min(2, Math.ceil(baseRpm / 3)))
        : Math.max(1, Math.min(4, Math.round(baseRpm / 10))))
    : staticConcurrent
  // 未配置 rpm：视频默认并发 2（保守可并行）；音频保持 1（场景少、provider 单一）
  const finalConcurrent = (!rpm && isVideo) ? 2 : (!rpm && isAudio) ? 1 : maxConcurrent

  const source = rpm ? 'config' : (staticLimits.rpm ? 'static' : 'default')
  return { rpm: baseRpm, maxConcurrent: finalConcurrent, limitPer5h: limit5h, source }
}

/**
 * 单次受管模型调用（排队/限流/冷却/5h 窗口由 governor 负责）。
 * 无 governor 或未指定 providerId 时直接执行（回退行为与现状一致）。
 */
function withModelBudget({ governor, type, providerId, model }, task) {
  if (typeof task !== 'function') throw new TypeError('withModelBudget requires a task function')
  if (!governor || typeof governor.run !== 'function' || !providerId) return task()
  return governor.run({ type, providerId, model }, task)
}

/**
 * 有界并发 map：按 provider 预算调度并发上限（min(请求并发, maxConcurrent)），
 * 超出部分进入 worker 队列排队执行（保留输入顺序的结果数组）。
 *
 * @param {object} opts
 * @param {any[]} opts.items
 * @param {number} [opts.requestedConcurrency] 请求并发（未传用 fallbackConcurrency）
 * @param {number} [opts.fallbackConcurrency] 未配置预算时的回退并发（默认 3）
 * @param {string} [opts.type] 能力类型 llm/tts/image/video/audio/speech_recognition
 * @param {string} [opts.providerId]
 * @param {object|null} [opts.provider] provider 配置对象（含 config.rate_per_minute）
 * @param {object|null} [opts.manager]
 * @param {object|null} [opts.governor]
 * @param {(item: any, index: number) => Promise<any>} opts.fn
 * @returns {Promise<any[]>} 结果数组（与 items 同序）
 */
async function mapWithModelBudget(opts) {
  const {
    items = [],
    requestedConcurrency,
    fallbackConcurrency = 3,
    type = '',
    providerId,
    provider,
    manager,
    governor,
    fn,
  } = opts || {}
  if (typeof fn !== 'function') throw new TypeError('mapWithModelBudget requires fn')
  const requested = clampInt(requestedConcurrency ?? fallbackConcurrency, 1, MAX_SAFE_CONCURRENCY, fallbackConcurrency)
  const budget = resolveProviderBudget({ provider, type, manager, governor })
  const limit = Math.max(1, Math.min(requested, budget.maxConcurrent))

  const results = new Array(items.length)
  let cursor = 0
  const workers = []
  const runWorker = async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await fn(items[index], index)
    }
  }
  const workerCount = Math.min(limit, items.length)
  for (let i = 0; i < workerCount; i += 1) workers.push(runWorker())
  await Promise.all(workers)
  return results
}

module.exports = { resolveProviderBudget, withModelBudget, mapWithModelBudget, normalizeRatePerMinute, normalizeLimitPer5h, MAX_SAFE_CONCURRENCY }
