// @ts-check
/**
 * 发布日历的日期/时间解析纯函数（从 Calendar.vue 拆出，逐文件行数门禁）。
 *
 * 这些函数与视图渲染无关，但有两条必须原样保留的语义，抽取时极易改错：
 *
 * 1. **`YYYY-MM-DD` 是「日期键」而非 UTC 时刻**。定时任务用 `datetime-local`
 *    提交本地墙钟时间（无时区后缀），若把日期键当 UTC 解析，在 UTC+8 下会被
 *    推到前一天，日历事件落到错误的格子里。故 `isDateKey` 标记一路透传，
 *    `toCalendarDateKey` 对日期键原样返回，**不做任何时区换算**。
 * 2. **非法输入返回空串 / +Infinity 而不是抛错或回退到今天**。回退到今天会让
 *    坏数据「看起来正常」，在日历上凭空出现一条今天的事件 —— 宁可事件不显示。
 *
 * 无时区后缀的 datetime 字符串按本地时间解析（与 `datetime-local` 的提交语义一致）。
 */

export function formatCalendarDatePart (value) {
  return String(value).padStart(2, '0')
}

export function hasValidCalendarDate (year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * 解析日期键 / 时间戳 / ISO 字符串。
 * @returns {{ date: Date, isDateKey: boolean } | null}
 */
export function parseCalendarDate (value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : { date: value, isDateKey: false }
  }

  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : { date, isDateKey: false }
  }

  if (typeof value !== 'string') return null

  const dateKeyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateKeyMatch) {
    const year = Number(dateKeyMatch[1])
    const month = Number(dateKeyMatch[2])
    const day = Number(dateKeyMatch[3])
    if (!hasValidCalendarDate(year, month, day)) return null
    return { date: new Date(year, month - 1, day), isDateKey: true }
  }

  const datetimeMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/.exec(value)
  if (!datetimeMatch) return null

  const year = Number(datetimeMatch[1])
  const month = Number(datetimeMatch[2])
  const day = Number(datetimeMatch[3])
  const hours = Number(datetimeMatch[4])
  const minutes = Number(datetimeMatch[5])
  const seconds = datetimeMatch[6] ? Number(datetimeMatch[6]) : 0
  if (!hasValidCalendarDate(year, month, day) || hours >= 24 || minutes >= 60 || seconds >= 60) return null

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : { date, isDateKey: false }
}

/** 归一为 `YYYY-MM-DD`；无法解析返回空串（不显示该事件，而不是错显到今天） */
export function toCalendarDateKey (value) {
  const parsed = parseCalendarDate(value)
  if (!parsed) return ''
  if (parsed.isDateKey) return value

  const date = parsed.date

  return date.getFullYear() + '-' + formatCalendarDatePart(date.getMonth() + 1) + '-' + formatCalendarDatePart(date.getDate())
}

/** 归一为 `HH:mm`；日期键或非法输入返回空串 */
export function toCalendarTime (value) {
  const parsed = parseCalendarDate(value)
  if (!parsed || parsed.isDateKey) return ''

  const date = parsed.date

  return formatCalendarDatePart(date.getHours()) + ':' + formatCalendarDatePart(date.getMinutes())
}

/** 排序用时间戳；非法输入返回 +Infinity（恒排到末尾） */
export function calendarTimestamp (value) {
  const parsed = parseCalendarDate(value)
  return parsed ? parsed.date.getTime() : Number.POSITIVE_INFINITY
}