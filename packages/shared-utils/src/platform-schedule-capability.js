'use strict'
/**
 * platform-schedule-capability.js — 平台侧定时能力注册表（单一真源，主进程 / Node 侧 CommonJS 版）
 *
 * 背景（2026-10-07 架构变更）
 * ------------------------
 * 定时发布从「本地定时器到点触发一次立即发布」改为「平台侧定时：创建时把时间参数
 * 提交给平台，由平台服务器到点发布」。这个变更的关键不在定时器，而在**每个平台
 * 是否真的支持平台侧定时、以及用什么方式提交**。
 *
 * 为什么必须有这张表
 * ----------------
 * 参考产品（4.0 逆向实测）34 个 worker 里 27 个走平台侧定时，7 个不支持
 * （皮皮虾 / 搜狐视频 / 豆瓣 / 得物 / 简书号 / WiFi万能钥匙 / 豆包）。
 * 这 7 个平台的 worker 里 `prePubTime` 出现 **0 次** —— 也就是说用户勾了定时、
 * 内容却**立即发布**，属最危险的静默失败形态。
 *
 * 本仓明令禁止这种行为：`unsupported` 平台在**创建时**就被显式阻断，
 * 绝不静默回落到本地定时、更不静默立即发布。回落到本地定时同样不行 ——
 * 那会让用户以为「关掉应用也在发」，而实际不会。
 *
 * 三态模型
 * --------
 *   api          —— 平台有直连发布接口，时间字段随发布请求一起提交（本仓头条即此类）
 *   rpa          —— 平台无直连接口，须在 RPA 发布页勾选「定时发布」并填时间
 *   unsupported  —— 平台不支持平台侧定时，创建时阻断并给出可展示原因
 *
 * 未知平台一律 fail-closed（按 unsupported 处理），绝不默认支持。
 *
 * 未验证平台的取值纪律
 * --------------------
 * 判定「某平台支持平台侧定时」需要登录该平台、确认其发布页/接口确有定时能力，
 * 属于真机取证范畴。本表**不猜测**：未经真机证实的平台一律登记为 `unsupported`
 * 并写明原因，待取证后逐个改写。这样做的代价是「当前只有头条可用」，
 * 换来的是「绝不会静默发出用户以为没发出的内容」。
 *
 * 逐平台数据在 platform-schedule-capability.json（**单一来源**，CJS 与 ESM 孪生共同消费）。
 * 头条取值依据：直连发布接口 mp.toutiao.com/mp/agw/article/publish 的 form-urlencoded
 * 载荷已实现定时字段（timer_status=1 + timer_time，格式 YYYY-MM-DD HH:mm），
 * 见 packages/rpa-engine/src/toutiao-direct-publish.js。该能力此前被当作「绕过 DOM
 * 死锁的手段」硬编码为「+60 秒」，本次变更把它提升为用户可选的真实定时模式。
 *
 * ⚠ 渲染进程请勿直接 import 本文件（浏览器无法执行 CommonJS）。
 *   渲染层经 vite alias 消费 ESM 孪生 platform-schedule-capability.browser.js，
 *   两侧函数层漂移由 __tests__/platform-schedule-capability.test.js 的 parity 回归拦截。
 */

/**
 * @typedef {object} PlatformScheduleCapability
 * @property {'api'|'rpa'|'unsupported'} mode
 * @property {string} reason 不可支持时的原因码（供渲染层映射到 locale 文案）
 * @property {string} [timeField] 平台侧定时时间字段名（提交到平台的键）
 * @property {string} [enableField] 「开启定时」开关字段名
 * @property {number|string} [enableValueOn] 开关开启时的取值
 * @property {string} [timeFormat] 时间字符串格式（api 模式必填）
 * @property {number} [minLeadMinutes] 最小提前量（分钟），0 表示平台未强制
 * @property {number} [maxHorizonDays] 最大可排期跨度（天），0 表示平台未强制
 * @property {boolean} [verified] 是否已经真机取证证实
 */

/** 深冻结：JSON 载入后必须冻结，避免调用方通过返回值改写全局注册表。 */
function deepFreeze (obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj)
    for (const value of Object.values(obj)) deepFreeze(value)
  }
  return obj
}

/** @type {Readonly<Record<string, PlatformScheduleCapability>>} */
const PLATFORM_SCHEDULE_CAPABILITY = deepFreeze(
  require('./platform-schedule-capability.json').platforms
)

const UNKNOWN_CAPABILITY = Object.freeze({
  mode: 'unsupported',
  reason: 'unknownPlatform',
  verified: false
})

/**
 * 取某平台的平台侧定时能力。未知平台 fail-closed。
 * @param {unknown} platformId
 * @returns {PlatformScheduleCapability}
 */
function getPlatformScheduleCapability (platformId) {
  if (typeof platformId !== 'string' || !platformId.trim()) return UNKNOWN_CAPABILITY
  return PLATFORM_SCHEDULE_CAPABILITY[platformId] || UNKNOWN_CAPABILITY
}

/** 某平台是否支持平台侧定时（未知平台 false） */
function isPlatformSideScheduleSupported (platformId) {
  return getPlatformScheduleCapability(platformId).mode !== 'unsupported'
}

/** 支持平台侧定时的平台 id 列表（供渲染层徽标与提交前校验） */
function getScheduleCapablePlatforms () {
  return Object.keys(PLATFORM_SCHEDULE_CAPABILITY)
    .filter(id => PLATFORM_SCHEDULE_CAPABILITY[id].mode !== 'unsupported')
}

/**
 * 解析某平台应走的定时模式。
 * @param {unknown} platformId
 * @returns {'platform-side'|'blocked'}
 */
function resolveScheduleMode (platformId) {
  return isPlatformSideScheduleSupported(platformId) ? 'platform-side' : 'blocked'
}

/**
 * 注册表结构自检：每个平台都必须显式声明能力，不得缺省为支持。
 * @returns {string[]}
 */
function validateScheduleCapabilityRegistry () {
  const problems = []
  let registryPlatforms
  try {
    registryPlatforms = Object.keys(require('./publish-capabilities.json').platforms)
  } catch (error) {
    return [`无法读取 publish-capabilities.json：${error.message}`]
  }

  for (const platformId of registryPlatforms) {
    const cap = PLATFORM_SCHEDULE_CAPABILITY[platformId]
    if (!cap) {
      problems.push(`${platformId}: 缺少平台侧定时能力声明（必须显式登记，不得缺省为支持）`)
      continue
    }
    if (!['api', 'rpa', 'unsupported'].includes(cap.mode)) {
      problems.push(`${platformId}: 非法 mode ${cap.mode}`)
    }
    if (cap.mode === 'unsupported' && !(typeof cap.reason === 'string' && cap.reason.length > 0)) {
      problems.push(`${platformId}: unsupported 必须给出 reason 供展示`)
    }
    if (cap.mode === 'api') {
      if (!cap.timeField) problems.push(`${platformId}: api 模式必须给出 timeField`)
      if (!cap.enableField) problems.push(`${platformId}: api 模式必须给出 enableField（否则时间字段不生效）`)
      if (!cap.timeFormat) problems.push(`${platformId}: api 模式必须给出 timeFormat`)
      if (!(Number(cap.minLeadMinutes) > 0)) problems.push(`${platformId}: api 模式必须给出正数 minLeadMinutes`)
      if (!(Number(cap.maxHorizonDays) > 0)) problems.push(`${platformId}: api 模式必须给出正数 maxHorizonDays`)
    }
  }

  for (const platformId of Object.keys(PLATFORM_SCHEDULE_CAPABILITY)) {
    if (!registryPlatforms.includes(platformId)) {
      problems.push(`${platformId}: 本表存在但 publish-capabilities.json 未登记（幽灵键）`)
    }
  }
  return problems
}

module.exports = {
  PLATFORM_SCHEDULE_CAPABILITY,
  getPlatformScheduleCapability,
  isPlatformSideScheduleSupported,
  getScheduleCapablePlatforms,
  resolveScheduleMode,
  validateScheduleCapabilityRegistry
}