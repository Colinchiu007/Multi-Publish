'use strict'
/**
 * 平台侧定时的时间格式化（rpa-engine 本地实现，2026-10-07）。
 *
 * 为什么在这里再实现一份，而不从 @multi-publish/shared-utils 引入：
 * **rpa-engine 的 package.json 未声明该依赖**（dependencies 为空，workspace 也无
 * 链接），`require('@multi-publish/shared-utils/...')` 在本包内无法解析 ——
 * 跨包硬引会在运行时直接抛 MODULE_NOT_FOUND。
 *
 * 若日后要收敛为单一真源，正确做法是给 rpa-engine 正式加依赖 +
 * workspace 链接，而不是让发布链在运行时做隐式解析。
 *
 * 格式：头条平台按 `YYYY-MM-DD HH:mm` 解释**本地墙钟时间**（无时区后缀）。
 * 依赖运行环境 TZ 会让开发机与生产机产出不同结果，故显式注入偏移。
 */

/** 头条定时字段的时间格式（本地墙钟，无时区后缀） */
const TOUTIAO_TIME_FORMAT = 'YYYY-MM-DD HH:mm'

function pad2 (n) {
  return (n < 10 ? '0' : '') + n
}

/**
 * 把目标时间格式化为头条要求的 `YYYY-MM-DD HH:mm`。
 * @param {string|number|Date} value 目标时间
 * @param {number} [timeZoneOffsetMinutes] 时区偏移（= -new Date().getTimezoneOffset()）
 * @returns {string}
 */
function formatToutiaoPublishTime (value, timeZoneOffsetMinutes = 0) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw new Error('定时发布时间无效：' + String(value))
  }
  const shifted = new Date(date.getTime() + timeZoneOffsetMinutes * 60 * 1000)
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())} ` +
    `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`
}

module.exports = { formatToutiaoPublishTime, TOUTIAO_TIME_FORMAT }