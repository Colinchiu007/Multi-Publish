// 渲染端（vite dev / build）使用的 ESM 平台侧定时能力注册表孪生文件。
// 主进程仍使用 platform-schedule-capability.js（CommonJS），避免改变 Node 端契约。
// 数据单一来源：platform-schedule-capability.json（两侧共同消费，禁止复制数据）。
// 函数层与 CJS 版逐字对齐；漂移由 __tests__/platform-schedule-capability.test.js 的
// parity 回归拦截（对齐 publish-capabilities / account-name-guard 孪生先例）。
//
// 为什么必须有孪生：浏览器无法执行 CommonJS。若渲染层直接
// `import { getPlatformScheduleCapability } from '.../platform-schedule-capability'`，
// vite dev server 会在**运行时**抛「does not provide an export named ...」——
// rollup 构建期有 commonjs 插件兜底、vitest 有自己的 interop，所以打包与单测都绿，
// 只有跑 dev server 的视觉回归会红。2026-10-07 本仓真实踩过一次
// （/create 与 /publish 整页渲染失败，见 openspec/records/platform-side-schedule.md）。
import capabilityData from './platform-schedule-capability.json'
import publishCapabilities from './publish-capabilities.json'

/** 深冻结：JSON 载入后必须冻结，避免调用方通过返回值改写全局注册表。 */
function deepFreeze (obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj)
    for (const value of Object.values(obj)) deepFreeze(value)
  }
  return obj
}

export const PLATFORM_SCHEDULE_CAPABILITY = deepFreeze(capabilityData.platforms)

const UNKNOWN_CAPABILITY = Object.freeze({
  mode: 'unsupported',
  reason: 'unknownPlatform',
  verified: false
})

/**
 * 取某平台的平台侧定时能力。未知平台 fail-closed。
 * @param {unknown} platformId
 * @returns {import('./platform-schedule-capability.js').PlatformScheduleCapability}
 */
export function getPlatformScheduleCapability (platformId) {
  if (typeof platformId !== 'string' || !platformId.trim()) return UNKNOWN_CAPABILITY
  return PLATFORM_SCHEDULE_CAPABILITY[platformId] || UNKNOWN_CAPABILITY
}

/** 某平台是否支持平台侧定时（未知平台 false） */
export function isPlatformSideScheduleSupported (platformId) {
  return getPlatformScheduleCapability(platformId).mode !== 'unsupported'
}

/** 支持平台侧定时的平台 id 列表（供渲染层徽标与提交前校验） */
export function getScheduleCapablePlatforms () {
  return Object.keys(PLATFORM_SCHEDULE_CAPABILITY)
    .filter(id => PLATFORM_SCHEDULE_CAPABILITY[id].mode !== 'unsupported')
}

/**
 * 解析某平台应走的定时模式。
 * @param {unknown} platformId
 * @returns {'platform-side'|'blocked'}
 */
export function resolveScheduleMode (platformId) {
  return isPlatformSideScheduleSupported(platformId) ? 'platform-side' : 'blocked'
}

/**
 * 注册表结构自检：每个平台都必须显式声明能力，不得缺省为支持。
 * @returns {string[]}
 */
export function validateScheduleCapabilityRegistry () {
  const problems = []
  const registryPlatforms = Object.keys(publishCapabilities.platforms)

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