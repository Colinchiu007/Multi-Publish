'use strict'
/**
 * platform-schedule-time.js — 平台侧定时的时间格式化与提交原语
 *
 * 平台侧定时的第一步就是把「用户选定的墙钟时间」转成**该平台要求的格式**。
 * 各平台差异很大（参考产品 4.0 逆向实测）：
 *   - 秒级 Unix 时间戳：抖音 `timing`、B站 `dtime`、视频号 `effectiveTime`、
 *     知乎 `postTime`、公众号/百家号 `publishTime`（均 `parseInt(prePubTime/1e3)`）
 *   - 毫秒原样：快手 `publishTime`
 *   - 字符串：头条号/网易号 `YYYY-MM-DD HH:mm:ss`、微博图文 `YYYY-MM-DD HH:mm`
 *   - 表单开关型：大鱼号 `is_timed_release` + `time_for_release`
 *   - 5 分钟取整：一点号 / 企鹅号（`convertToMinuteMultipleOf5`）
 *
 * 本模块只实现**格式与单位换算**这一个原语，各平台的字段装配交给
 * platform-schedule-capability 注册表 + 对应 publisher，避免每个平台各写一份
 * 时间拼接逻辑（那必然漂移）。
 *
 * 时区纪律：平台侧定时提交的是**本地墙钟时间**（平台服务器按其所在时区解释），
 * 因此格式化必须显式注入时区偏移，不能依赖运行环境的 TZ —— 否则同一份代码在
 * 开发机与 CI 上产出不同结果。
 */

/**
 * 按平台要求的时间格式产出提交值。
 * @param {string|number|Date|null|undefined} value 用户选定的时间
 * @param {{timeFormat: string}} cap 平台能力条目
 * @param {{timeZoneOffsetMinutes?: number}} [options]
 * @returns {string}
 */
function formatForPlatform (value, cap, options = {}) {
  const date = toDate(value)
  if (!date) throw new Error(`定时发布时间无效：${String(value)}`)

  const offsetMinutes = Number(options.timeZoneOffsetMinutes) || 0
  const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000)

  const y = shifted.getUTCFullYear()
  const mo = pad2(shifted.getUTCMonth() + 1)
  const d = pad2(shifted.getUTCDate())
  const h = pad2(shifted.getUTCHours())
  const mi = pad2(shifted.getUTCMinutes())
  const s = pad2(shifted.getUTCSeconds())

  switch (cap && cap.timeFormat) {
    case 'YYYY-MM-DD HH:mm':
      return `${y}-${mo}-${d} ${h}:${mi}`
    case 'YYYY-MM-DD HH:mm:ss':
      return `${y}-${mo}-${d} ${h}:${mi}:${s}`
    case 'unix-seconds':
      return String(Math.floor(date.getTime() / 1000))
    case 'unix-ms':
      return String(date.getTime())
    default:
      throw new Error(`未知的平台时间格式：${cap && cap.timeFormat}`)
  }
}

/**
 * 校验目标时间是否落在平台允许的窗口内。
 * 抛出带明确数值的错误，供渲染层直接展示（用户需要知道「至少 5 分钟」「最多 30 天」）。
 * @param {string|number|Date|null|undefined} value
 * @param {{minLeadMinutes?: number, maxHorizonDays?: number}} cap
 * @param {number} [now] 注入当前时间便于测试
 * @returns {Date}
 */
function assertWithinPlatformWindow (value, cap, now = Date.now()) {
  const date = toDate(value)
  if (!date) throw new Error(`定时发布时间无效：${String(value)}`)

  const minLeadMinutes = Number(cap && cap.minLeadMinutes) || 0
  const maxHorizonDays = Number(cap && cap.maxHorizonDays) || 0
  const deltaMinutes = (date.getTime() - now) / 60000

  if (minLeadMinutes > 0 && deltaMinutes < minLeadMinutes) {
    throw new Error(`定时发布至少需要提前 ${minLeadMinutes} 分钟（当前约 ${Math.round(deltaMinutes)} 分钟）`)
  }
  if (maxHorizonDays > 0 && deltaMinutes > maxHorizonDays * 24 * 60) {
    throw new Error(`定时发布不能超过 ${maxHorizonDays} 天`)
  }
  return date
}

/**
 * 产出可直接并入发布请求的字段集合。
 * 未提供时间时返回「关闭定时」形态，保持立即发布语义。
 * 超窗/非法一律抛错，**绝不降级为立即发布**（静默发出用户以为没发出的内容）。
 * @param {string|number|Date|null|undefined} value
 * @param {object} cap
 * @param {{now?: number, timeZoneOffsetMinutes?: number}} [options]
 * @returns {Record<string, string|number>}
 */
function resolveScheduleSubmission (value, cap, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now()

  if (value === undefined || value === null || value === '') {
    return { [cap.enableField]: 0, [cap.timeField]: '' }
  }

  assertWithinPlatformWindow(value, cap, now)
  return {
    [cap.enableField]: cap.enableValueOn,
    [cap.timeField]: formatForPlatform(value, cap, options)
  }
}

function toDate (value) {
  if (value === undefined || value === null || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function pad2 (n) {
  return (n < 10 ? '0' : '') + n
}

module.exports = {
  formatForPlatform,
  assertWithinPlatformWindow,
  resolveScheduleSubmission
}