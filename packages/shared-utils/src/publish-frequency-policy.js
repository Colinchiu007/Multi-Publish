/**
 * 发布频率策略 — 单一真源（v2）
 *
 * 三个维度：
 *   accountMinMs    —— 同一账号在同一平台两次发布的最小间隔（键 platform:accountId）
 *   platformMinMs   —— 同一平台任意两次发布的最小间隔（键 platform:*，**仅跨账号时绑定**）
 *   accountDailyMax —— 同一账号在同一平台的每日提交上限（本机运营日，见 guard）
 *
 * ⚠️ 下表数值是**工程保守默认**（宁慢不险），不是平台官方规则，本工具不声称符合
 * 任何平台官方规定。依据与自认弱点见 01-docs/PRD-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md §5。
 * 平台若调整节奏，改这一处；禁止在调用方另抄一份。
 * 未登记的平台回落 BASELINE_INTERVALS（最严档），不得回落 0。
 *
 * v2 相对 v1 的变更（change: publish-frequency-policy-v2）：
 *   - 数值下调：账号档 60/30/10 → 20/10/3 分钟；平台档 5/3/1 → 统一 2 分钟
 *   - 新增 tier 与 accountDailyMax（日配额维度；tier 复用既有分组，不新增分类器）
 *   - 间隔源声明上界 7 天（越界钳位并出声）：避免含抖动系数后逼近 setTimeout 上限
 *   - 未登记平台由「静默回落」改为「回落 + fallback 标记」（由守卫出声，进程内去重）
 */

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** 间隔源上界：7 天。超过它会让 wait × (1 + jitterRatio) 逼近 2^31-1（setTimeout 上限） */
const MAX_INTERVAL_MS = 7 * DAY

/** 日配额分档名（与账号档/平台档同表，避免第二套分类器） */
const TIER_LONG = 'long'
const TIER_CLIP = 'clip'
const TIER_SHORT = 'short'

/** 抖动比例默认值（合法域 [0,1)） */
const DEFAULT_JITTER_RATIO = 0.4
/** 回滚后最小退避默认值与下界（下界防「回滚即零等待」的重试风暴） */
const DEFAULT_RELEASE_GRACE_MS = 60 * 1000
const MIN_RELEASE_GRACE_MS = 10 * 1000
/** 紧急放行每日每账号上限默认值与合法域上界 */
const DEFAULT_EMERGENCY_MAX_PER_DAY = 1
const MAX_EMERGENCY_MAX_PER_DAY = 10

const PLATFORM_FREQUENCY_POLICY = Object.freeze({
  // 长文低频
  wechat_mp: Object.freeze({ tier: TIER_LONG, accountMinMs: 20 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 3 }),
  zhihu: Object.freeze({ tier: TIER_LONG, accountMinMs: 20 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 3 }),
  baijiahao: Object.freeze({ tier: TIER_LONG, accountMinMs: 20 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 3 }),
  toutiao: Object.freeze({ tier: TIER_LONG, accountMinMs: 20 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 3 }),

  // 短视频 / 图文社区
  douyin: Object.freeze({ tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5 }),
  kuaishou: Object.freeze({ tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5 }),
  tencent_video: Object.freeze({ tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5 }),
  xiaohongshu: Object.freeze({ tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5 }),
  bilibili: Object.freeze({ tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5 }),
  youtube: Object.freeze({ tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5 }),
  tiktok: Object.freeze({ tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5 }),
  instagram: Object.freeze({ tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5 }),
  facebook: Object.freeze({ tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5 }),

  // 短内容、高频容忍
  weibo: Object.freeze({ tier: TIER_SHORT, accountMinMs: 3 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 20 }),
  twitter: Object.freeze({ tier: TIER_SHORT, accountMinMs: 3 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 20 }),
})

/** 未登记平台回落的最严档（独立常量：改 long 档不应静默改变回落实质） */
const BASELINE_INTERVALS = Object.freeze({
  tier: TIER_LONG,
  accountMinMs: 20 * MIN,
  platformMinMs: 2 * MIN,
  accountDailyMax: 3,
})

const ENV_ACCOUNT_MIN_INTERVAL = 'MP_PUBLISH_MIN_INTERVAL_MS'
const ENV_PLATFORM_MIN_INTERVAL = 'MP_PUBLISH_PLATFORM_MIN_INTERVAL_MS'
const ENV_DAILY_MAX_LONG = 'MP_PUBLISH_DAILY_MAX_LONG'
const ENV_DAILY_MAX_CLIP = 'MP_PUBLISH_DAILY_MAX_CLIP'
const ENV_DAILY_MAX_SHORT = 'MP_PUBLISH_DAILY_MAX_SHORT'
/** 全局覆盖三档日配额（设置该项即三档同值） */
const ENV_ACCOUNT_DAILY_MAX = 'MP_PUBLISH_ACCOUNT_DAILY_MAX'
const ENV_JITTER_RATIO = 'MP_PUBLISH_JITTER_RATIO'
const ENV_RELEASE_GRACE_MS = 'MP_PUBLISH_RELEASE_GRACE_MS'
const ENV_EMERGENCY_MAX_PER_DAY = 'MP_PUBLISH_EMERGENCY_MAX_PER_DAY'

const TIER_ENV = Object.freeze({
  [TIER_LONG]: ENV_DAILY_MAX_LONG,
  [TIER_CLIP]: ENV_DAILY_MAX_CLIP,
  [TIER_SHORT]: ENV_DAILY_MAX_SHORT,
})

const SUPPORTED_PLATFORMS = Object.freeze(Object.keys(PLATFORM_FREQUENCY_POLICY))

function isKnownPlatform (platform) {
  return typeof platform === 'string' && Object.prototype.hasOwnProperty.call(PLATFORM_FREQUENCY_POLICY, platform)
}

function warnSink (options) {
  return typeof options.warn === 'function' ? options.warn : (msg) => console.warn(msg)
}

/** 取第一个「已设置」的值（`0` 是合法值，不得用 || 兜底） */
function pick (...values) {
  for (const v of values) {
    if (v !== undefined && v !== null) return v
  }
  return undefined
}

/**
 * 解析一个环境变量数值。
 * 未设置 → 回落 fallback；`0` → 显式关闭/归零；非法（非有限数 / 负数 / 空白 / 非整数）
 * → 回落 fallback **并出声**（静默当 0 等于把配置写错变成关掉门禁）；超上界 → 钳位并出声。
 *
 * @param {string|number|undefined|null} raw
 * @param {string} envName
 * @param {number} fallback
 * @param {(msg: string) => void} warn
 * @param {{ integer?: boolean, max?: number }} [bounds]
 */
function parseEnvNumber (raw, envName, fallback, warn, bounds = {}) {
  if (raw === undefined || raw === null) return fallback
  const text = String(raw).trim()
  if (!text) {
    warn(`[PublishFrequency] 环境变量 ${envName} 为空白值，回落默认 ${fallback}`)
    return fallback
  }
  const num = Number(text)
  if (!Number.isFinite(num) || num < 0) {
    warn(`[PublishFrequency] 环境变量 ${envName}="${raw}" 非法（需 >=0 的有限数），回落默认 ${fallback}`)
    return fallback
  }
  if (bounds.integer && !Number.isInteger(num)) {
    warn(`[PublishFrequency] 环境变量 ${envName}="${raw}" 非法（需整数），回落默认 ${fallback}`)
    return fallback
  }
  if (bounds.max !== undefined && num > bounds.max) {
    warn(`[PublishFrequency] 环境变量 ${envName}="${raw}" 超出上界 ${bounds.max}，已钳位到上界`)
    return bounds.max
  }
  return bounds.integer ? num : Math.floor(num)
}

/** 兼容旧名：间隔解析（非整数按 floor，与 v1 语义一致；带上界钳位） */
function parseEnvInterval (raw, envName, fallback, warn) {
  return parseEnvNumber(raw, envName, fallback, warn, { max: MAX_INTERVAL_MS })
}

/**
 * 解析某平台的完整策略。
 *
 * 优先级：设置页覆盖 > 环境变量 > 策略表；未登记平台回落最严基线并置 `fallback: true`
 * （由守卫出声告警，进程内按平台去重）。
 *
 * @param {string} platform - 平台标识；未登记或非法值一律回落最严基线
 * @param {{env?: Record<string,string|undefined>, warn?: (msg: string) => void, overrides?: object}} [options]
 * @returns {{tier: string, accountMinMs: number, platformMinMs: number, accountDailyMax: number, fallback: boolean}}
 */
function resolveIntervals (platform, options = {}) {
  const env = options.env || process.env
  const warn = warnSink(options)
  const fallback = !isKnownPlatform(platform)
  const base = fallback ? BASELINE_INTERVALS : PLATFORM_FREQUENCY_POLICY[platform]
  const ov = options.overrides || {}

  const accountMinMs = parseEnvInterval(
    pick(ov.accountMinMs, env[ENV_ACCOUNT_MIN_INTERVAL]), ENV_ACCOUNT_MIN_INTERVAL, base.accountMinMs, warn
  )
  const platformMinMs = parseEnvInterval(
    pick(ov.platformMinMs, env[ENV_PLATFORM_MIN_INTERVAL]), ENV_PLATFORM_MIN_INTERVAL, base.platformMinMs, warn
  )

  // 日配额：全局覆盖 > 设置页覆盖 > 本档 env > 策略表
  const tier = base.tier
  const globalRaw = pick(ov.accountDailyMax, env[ENV_ACCOUNT_DAILY_MAX])
  const useGlobal = globalRaw !== undefined
  const tierEnvName = TIER_ENV[tier]
  const raw = useGlobal ? globalRaw : pick(ov.dailyMax && ov.dailyMax[tier], env[tierEnvName])
  const accountDailyMax = parseEnvNumber(
    raw,
    useGlobal ? ENV_ACCOUNT_DAILY_MAX : tierEnvName,
    base.accountDailyMax,
    warn,
    { integer: true }
  )

  return { tier, accountMinMs, platformMinMs, accountDailyMax, fallback }
}

/**
 * 解析抖动比例：`[0, 1)` 有限数；`0` = 关闭抖动（严格退化为 v1 行为）。
 * @param {{env?: object, warn?: Function, overrides?: object}} [options]
 */
function resolveJitterRatio (options = {}) {
  const env = options.env || process.env
  const warn = warnSink(options)
  const ov = options.overrides || {}
  const raw = pick(ov.jitterRatio, env[ENV_JITTER_RATIO])
  if (raw === undefined) return DEFAULT_JITTER_RATIO
  const text = String(raw).trim()
  if (!text) {
    warn(`[PublishFrequency] 环境变量 ${ENV_JITTER_RATIO} 为空白值，回落默认 ${DEFAULT_JITTER_RATIO}`)
    return DEFAULT_JITTER_RATIO
  }
  const num = Number(text)
  if (!Number.isFinite(num) || num < 0 || num >= 1) {
    warn(`[PublishFrequency] 环境变量 ${ENV_JITTER_RATIO}="${raw}" 非法（需 [0,1) 的有限数），回落默认 ${DEFAULT_JITTER_RATIO}`)
    return DEFAULT_JITTER_RATIO
  }
  return num
}

/**
 * 解析回滚后最小退避：整数；低于下界 10s 钳位并出声（防回滚即零等待的重试风暴）。
 * @param {{env?: object, warn?: Function, overrides?: object}} [options]
 */
function resolveReleaseGraceMs (options = {}) {
  const env = options.env || process.env
  const warn = warnSink(options)
  const ov = options.overrides || {}
  const raw = pick(ov.releaseGraceMs, env[ENV_RELEASE_GRACE_MS])
  if (raw === undefined) return DEFAULT_RELEASE_GRACE_MS
  const text = String(raw).trim()
  if (!text) {
    warn(`[PublishFrequency] 环境变量 ${ENV_RELEASE_GRACE_MS} 为空白值，回落默认 ${DEFAULT_RELEASE_GRACE_MS}`)
    return DEFAULT_RELEASE_GRACE_MS
  }
  const num = Number(text)
  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
    warn(`[PublishFrequency] 环境变量 ${ENV_RELEASE_GRACE_MS}="${raw}" 非法（需 >=0 整数），回落默认 ${DEFAULT_RELEASE_GRACE_MS}`)
    return DEFAULT_RELEASE_GRACE_MS
  }
  if (num < MIN_RELEASE_GRACE_MS) {
    warn(`[PublishFrequency] 环境变量 ${ENV_RELEASE_GRACE_MS}="${raw}" 低于下界 ${MIN_RELEASE_GRACE_MS}，已钳位到该下界`)
    return MIN_RELEASE_GRACE_MS
  }
  return num
}

/**
 * 解析紧急放行每日每账号上限：整数 `[0, 10]`；`0` = 关闭该入口。
 * @param {{env?: object, warn?: Function, overrides?: object}} [options]
 */
function resolveEmergencyMaxPerDay (options = {}) {
  const env = options.env || process.env
  const warn = warnSink(options)
  const ov = options.overrides || {}
  const raw = pick(ov.emergencyMaxPerDay, env[ENV_EMERGENCY_MAX_PER_DAY])
  return parseEnvNumber(raw, ENV_EMERGENCY_MAX_PER_DAY, DEFAULT_EMERGENCY_MAX_PER_DAY, warn, {
    integer: true,
    max: MAX_EMERGENCY_MAX_PER_DAY,
  })
}

module.exports = {
  resolveIntervals,
  resolveJitterRatio,
  resolveReleaseGraceMs,
  resolveEmergencyMaxPerDay,
  isKnownPlatform,
  parseEnvNumber,
  PLATFORM_FREQUENCY_POLICY,
  BASELINE_INTERVALS,
  SUPPORTED_PLATFORMS,
  MAX_INTERVAL_MS,
  DEFAULT_JITTER_RATIO,
  DEFAULT_RELEASE_GRACE_MS,
  MIN_RELEASE_GRACE_MS,
  DEFAULT_EMERGENCY_MAX_PER_DAY,
  MAX_EMERGENCY_MAX_PER_DAY,
  TIER_LONG,
  TIER_CLIP,
  TIER_SHORT,
  ENV_ACCOUNT_MIN_INTERVAL,
  ENV_PLATFORM_MIN_INTERVAL,
  ENV_DAILY_MAX_LONG,
  ENV_DAILY_MAX_CLIP,
  ENV_DAILY_MAX_SHORT,
  ENV_ACCOUNT_DAILY_MAX,
  ENV_JITTER_RATIO,
  ENV_RELEASE_GRACE_MS,
  ENV_EMERGENCY_MAX_PER_DAY,
}
