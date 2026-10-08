// @ts-nocheck
// TDD —— 先红：平台侧定时时间格式化与校验原语
// 平台侧定时要求：把用户选定的墙钟时间，按**该平台要求的格式与单位**转成提交字段。
// 头条是 'YYYY-MM-DD HH:mm'（本地时区，无时区后缀）；参考产品的秒级平台
// （抖音 timing / B站 dtime / 视频号 effectiveTime）用 Unix 秒。
// 这里提供单一实现，避免每个平台各写一份时间拼接。

const {
  formatForPlatform,
  assertWithinPlatformWindow,
  resolveScheduleSubmission,
} = require('../platform-schedule-time')

const TOUTIAO_CAP = {
  mode: 'api',
  timeField: 'timer_time',
  enableField: 'timer_status',
  enableValueOn: 1,
  timeFormat: 'YYYY-MM-DD HH:mm',
  minLeadMinutes: 5,
  // 与 platform-schedule-capability.json 的头条取值保持一致（2026-10-08 bundle 取证）
  maxHorizonDays: 7
}

// fixture 漂移锁：手工复制的 TOUTIAO_CAP 必须与 JSON 真源逐字段一致，
// 否则本文件测的是一份不存在的平台配置（评审 MINOR：靠注释维持一致性有漂移风险）
const JSON_CAP = require('../platform-schedule-capability.json').platforms.toutiao
const { reason: _r, verified: _v, ...JSON_CAP_FIELDS } = JSON_CAP
describe('TOUTIAO_CAP fixture 与能力 JSON 真源一致', () => {
  it('逐字段相等（忽略 reason/verified 两个展示字段）', () => {
    expect(TOUTIAO_CAP).toEqual(JSON_CAP_FIELDS)
  })
})

describe('platform-schedule-time — 平台侧定时时间原语', () => {
  describe('formatForPlatform：按平台格式产出提交值', () => {
    it('头条产出 YYYY-MM-DD HH:mm（本地时区，无 Z 后缀）', () => {
      // 2026-10-07T09:05:00.000Z == 本地(UTC+8) 17:05
      const value = formatForPlatform('2026-10-07T09:05:00.000Z', TOUTIAO_CAP, { timeZoneOffsetMinutes: 480 })
      expect(value).toBe('2026-10-07 17:05')
    })

    it('月份与日期补零', () => {
      const value = formatForPlatform('2026-01-05T00:00:00.000Z', TOUTIAO_CAP, { timeZoneOffsetMinutes: 480 })
      expect(value).toBe('2026-01-05 08:00')
    })

    it('时间格式不受运行环境 TZ 影响（显式偏移注入，可复现）', () => {
      const a = formatForPlatform('2026-10-07T09:05:00.000Z', TOUTIAO_CAP, { timeZoneOffsetMinutes: 480 })
      const b = formatForPlatform('2026-10-07T09:05:00.000Z', TOUTIAO_CAP, { timeZoneOffsetMinutes: 0 })
      expect(a).toBe('2026-10-07 17:05')
      expect(b).toBe('2026-10-07 09:05')
    })

    it('非法时间抛错，绝不静默产出错误字符串', () => {
      expect(() => formatForPlatform('not-a-date', TOUTIAO_CAP, {})).toThrow()
    })
  })

  describe('assertWithinPlatformWindow：提交前校验平台约束', () => {
    const now = Date.parse('2026-10-07T00:00:00.000Z')

    it('早于最小提前量 → 抛错并说明最小提前量', () => {
      const tooSoon = new Date(now + 2 * 60 * 1000).toISOString()
      expect(() => assertWithinPlatformWindow(tooSoon, TOUTIAO_CAP, now))
        .toThrow(/5/)
    })

    it('超过最大跨度 → 抛错并说明最大天数', () => {
      const tooFar = new Date(now + 40 * 24 * 3600 * 1000).toISOString()
      expect(() => assertWithinPlatformWindow(tooFar, TOUTIAO_CAP, now))
        .toThrow(/7/)
    })

    it('窗口内合法时间通过', () => {
      const ok = new Date(now + 3 * 24 * 3600 * 1000).toISOString()
      expect(() => assertWithinPlatformWindow(ok, TOUTIAO_CAP, now)).not.toThrow()
    })
  })

  describe('resolveScheduleSubmission：产出可直接提交的字段', () => {
    const now = Date.parse('2026-10-07T00:00:00.000Z')

    it('合法时间 → 返回开启开关 + 时间字段', () => {
      const target = new Date(now + 2 * 24 * 3600 * 1000).toISOString()
      const out = resolveScheduleSubmission(target, TOUTIAO_CAP, { now, timeZoneOffsetMinutes: 480 })
      // 2026-10-07T00:00Z + 2 天 = 2026-10-09T00:00Z = 本地(UTC+8) 2026-10-09 08:00
      expect(out).toEqual({ timer_status: 1, timer_time: '2026-10-09 08:00' })
    })

    it('不传时间 → 返回空提交（保持立即发布语义）', () => {
      const out = resolveScheduleSubmission(undefined, TOUTIAO_CAP, { now, timeZoneOffsetMinutes: 480 })
      expect(out).toEqual({ timer_status: 0, timer_time: '' })
    })

    it('超窗时间 → 抛错，绝不降级为立即发布', () => {
      const tooFar = new Date(now + 400 * 24 * 3600 * 1000).toISOString()
      expect(() => resolveScheduleSubmission(tooFar, TOUTIAO_CAP, { now, timeZoneOffsetMinutes: 480 }))
        .toThrow(/7/)
    })
  })
})
