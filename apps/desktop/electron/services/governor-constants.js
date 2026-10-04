// @ts-check
/**
 * governor-constants.js — ApiUsageGovernor 的纯常量与纯函数集合
 *
 * 从 api-usage-governor.js 抽取，目的是将「不依赖类实例、不依赖宿主状态」的
 * 计时常量、默认限流档位、以及 sleep/jitter/retryAfterMs 等纯函数集中到独立模块，
 * 使主模块保持 <500 行（债务熔断门禁要求严格小于 500）。
 *
 * 注意：本模块不得引入任何与运行时状态（log / AsyncLocalStorage / 类实例）相关的依赖，
 * 保持纯静态、可单测。
 */

const WINDOW_MS = 60 * 1000
const MAX_QUEUE_WAIT_MS = 30 * 1000
const MAX_PACE_WAIT_MS = 180 * 1000
const MAX_COOLDOWN_WAIT_MS = 45 * 1000
const TRANSIENT_RETRIES = 2
const RATE_ADAPT_FACTOR = 0.75
const RATE_RECOVER_STEP = 0.05

const DEFAULT_LIMITS = Object.freeze({
  llm: Object.freeze({ rpm: 30, maxConcurrent: 2, cooldownMs: 30000, retry429: 3 }),
  tts: Object.freeze({ rpm: 10, maxConcurrent: 2, cooldownMs: 30000, retry429: 3 }),
  image: Object.freeze({ rpm: 10, maxConcurrent: 2, cooldownMs: 30000, retry429: 3 }),
  // 2026-08-13：视频为异步任务制（提交+轮询+下载），服务端任务队列支持多路并行；
  // 并发默认 2 可将视频串行时长减半（配合 model-call-scheduler 视频并发评估）。rpm 仍约束提交速率。
  video: Object.freeze({ rpm: 4, maxConcurrent: 2, cooldownMs: 60000, retry429: 2 }),
  audio: Object.freeze({ rpm: 10, maxConcurrent: 2, cooldownMs: 30000, retry429: 3 }),
  default: Object.freeze({ rpm: 20, maxConcurrent: 2, cooldownMs: 30000, retry429: 3 }),
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))

function jitter(baseMs) {
  return baseMs + Math.round(Math.random() * 1500)
}

function retryAfterMs(error) {
  const raw = error?.context?.retryAfter ?? error?.response?.headers?.['retry-after']
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000
  return 0
}

module.exports = {
  WINDOW_MS,
  MAX_QUEUE_WAIT_MS,
  MAX_PACE_WAIT_MS,
  MAX_COOLDOWN_WAIT_MS,
  TRANSIENT_RETRIES,
  RATE_ADAPT_FACTOR,
  RATE_RECOVER_STEP,
  DEFAULT_LIMITS,
  sleep,
  jitter,
  retryAfterMs,
}
