/**
 * Test: publish-frequency-policy.js — 发布频率策略单一真源（v2）
 *
 * 覆盖：15 平台三维度全覆盖、未知平台回落最严档 + fallback 标记、数值下调、
 * 三档日配额 env、抖动比例、回滚退避、紧急放行上限、0 = 显式关闭、非法值回落并出声。
 */
const {
  resolveIntervals,
  resolveJitterRatio,
  resolveReleaseGraceMs,
  resolveEmergencyMaxPerDay,
  isKnownPlatform,
  BASELINE_INTERVALS,
  PLATFORM_FREQUENCY_POLICY,
  SUPPORTED_PLATFORMS,
  MAX_INTERVAL_MS,
  DEFAULT_JITTER_RATIO,
  MIN_RELEASE_GRACE_MS,
  ENV_ACCOUNT_MIN_INTERVAL,
  ENV_PLATFORM_MIN_INTERVAL,
  ENV_DAILY_MAX_LONG,
  ENV_DAILY_MAX_CLIP,
  ENV_DAILY_MAX_SHORT,
  ENV_ACCOUNT_DAILY_MAX,
  ENV_JITTER_RATIO,
  ENV_RELEASE_GRACE_MS,
  ENV_EMERGENCY_MAX_PER_DAY,
  TIER_LONG,
  TIER_CLIP,
  TIER_SHORT,
} = require('../src/publish-frequency-policy')

const MIN = 60 * 1000

describe('publish-frequency-policy v2', () => {
  describe('平台覆盖', () => {
    it('15 个支持平台全部登记，且三个维度均为正数', () => {
      expect([...SUPPORTED_PLATFORMS].sort()).toEqual([
        'baijiahao', 'bilibili', 'douyin', 'facebook', 'instagram', 'kuaishou',
        'tencent_video', 'tiktok', 'toutiao', 'twitter', 'wechat_mp', 'weibo',
        'xiaohongshu', 'youtube', 'zhihu',
      ])
      expect(SUPPORTED_PLATFORMS.length).toBe(15)

      for (const platform of SUPPORTED_PLATFORMS) {
        const r = resolveIntervals(platform, { env: {} })
        expect(r.accountMinMs, `${platform} accountMinMs`).toBeGreaterThan(0)
        expect(r.platformMinMs, `${platform} platformMinMs`).toBeGreaterThan(0)
        expect(r.accountDailyMax, `${platform} accountDailyMax`).toBeGreaterThan(0)
        expect(r.fallback, `${platform} fallback`).toBe(false)
      }
    })

    it('三组代表平台逐档精确等于策略表（v2 数值）', () => {
      expect(resolveIntervals('wechat_mp', { env: {} })).toEqual({
        tier: TIER_LONG, accountMinMs: 20 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 3, fallback: false,
      })
      expect(resolveIntervals('douyin', { env: {} })).toEqual({
        tier: TIER_CLIP, accountMinMs: 10 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 5, fallback: false,
      })
      expect(resolveIntervals('weibo', { env: {} })).toEqual({
        tier: TIER_SHORT, accountMinMs: 3 * MIN, platformMinMs: 2 * MIN, accountDailyMax: 20, fallback: false,
      })
    })

    it('数值下调已生效：账号档不再有 60/30/10 分钟', () => {
      for (const platform of SUPPORTED_PLATFORMS) {
        const { accountMinMs } = resolveIntervals(platform, { env: {} })
        expect(accountMinMs, `${platform} 应为 v2 值`).toBeLessThanOrEqual(20 * MIN)
      }
      // 平台档统一 2 分钟
      for (const platform of SUPPORTED_PLATFORMS) {
        expect(resolveIntervals(platform, { env: {} }).platformMinMs, `${platform}`).toBe(2 * MIN)
      }
    })

    it('未知平台回落基线最严档并带 fallback 标记（供守卫出声）', () => {
      const r = resolveIntervals('some_future_platform', { env: {} })
      expect(r).toEqual({ ...BASELINE_INTERVALS, fallback: true })
      expect(r.accountMinMs).toBeGreaterThan(0)
      expect(r.platformMinMs).toBeGreaterThan(0)
      expect(r.accountDailyMax).toBeGreaterThan(0)

      for (const bad of [undefined, null, '', 123, {}]) {
        expect(resolveIntervals(bad, { env: {} }).fallback).toBe(true)
        expect(resolveIntervals(bad, { env: {} }).accountMinMs).toBe(BASELINE_INTERVALS.accountMinMs)
      }
    })

    it('isKnownPlatform 只认策略表内的字符串键', () => {
      expect(isKnownPlatform('douyin')).toBe(true)
      expect(isKnownPlatform('nope')).toBe(false)
      expect(isKnownPlatform(undefined)).toBe(false)
      expect(isKnownPlatform({})).toBe(false)
    })

    it('策略表里每个平台的 platformMinMs 不得大于 accountMinMs', () => {
      for (const [platform, p] of Object.entries(PLATFORM_FREQUENCY_POLICY)) {
        expect(p.platformMinMs, `${platform}`).toBeLessThanOrEqual(p.accountMinMs)
      }
    })
  })

  describe('间隔环境变量覆盖', () => {
    it('合法值覆盖所有平台的两档', () => {
      const env = { [ENV_ACCOUNT_MIN_INTERVAL]: '45000', [ENV_PLATFORM_MIN_INTERVAL]: '9000' }
      const r = resolveIntervals('douyin', { env })
      expect(r.accountMinMs).toBe(45000)
      expect(r.platformMinMs).toBe(9000)
      expect(r.accountDailyMax).toBe(5) // 日配额不受间隔 env 影响
    })

    it('0 表示该档显式关闭，且不得触发告警', () => {
      const warns = []
      const env = { [ENV_ACCOUNT_MIN_INTERVAL]: '0' }
      const r = resolveIntervals('weibo', { env, warn: (m) => warns.push(m) })
      expect(r.accountMinMs).toBe(0)
      expect(r.platformMinMs).toBe(2 * MIN)
      expect(warns).toEqual([])
    })

    it('非法值回落策略表并逐条出声告警（禁止静默当 0）', () => {
      for (const bad of ['abc', '-1', 'NaN', 'Infinity', '12x']) {
        const warns = []
        const env = { [ENV_ACCOUNT_MIN_INTERVAL]: bad }
        const r = resolveIntervals('douyin', { env, warn: (m) => warns.push(m) })
        expect(r.accountMinMs, `bad=${JSON.stringify(bad)}`).toBe(10 * MIN)
        expect(warns.length, `bad=${JSON.stringify(bad)} 必须出声`).toBe(1)
        expect(warns[0]).toContain(ENV_ACCOUNT_MIN_INTERVAL)
      }
    })

    it('超出 7 天上界的间隔被钳位并出声（防抖动后溢出 setTimeout）', () => {
      const warns = []
      const env = { [ENV_ACCOUNT_MIN_INTERVAL]: String(30 * 24 * 60 * MIN) }
      const r = resolveIntervals('douyin', { env, warn: (m) => warns.push(m) })
      expect(r.accountMinMs).toBe(MAX_INTERVAL_MS)
      expect(warns.length).toBe(1)
      expect(warns[0]).toContain('超出上界')
    })

    it('空白值也回落并出声', () => {
      const warns = []
      const r = resolveIntervals('douyin', { env: { [ENV_ACCOUNT_MIN_INTERVAL]: '   ' }, warn: (m) => warns.push(m) })
      expect(r.accountMinMs).toBe(10 * MIN)
      expect(warns.length).toBe(1)
    })
  })

  describe('日配额环境变量（三档 + 全局覆盖）', () => {
    it('三档各自独立覆盖，互不影响', () => {
      const env = {
        [ENV_DAILY_MAX_LONG]: '1',
        [ENV_DAILY_MAX_CLIP]: '7',
        [ENV_DAILY_MAX_SHORT]: '99',
      }
      expect(resolveIntervals('wechat_mp', { env }).accountDailyMax).toBe(1)
      expect(resolveIntervals('douyin', { env }).accountDailyMax).toBe(7)
      expect(resolveIntervals('weibo', { env }).accountDailyMax).toBe(99)
    })

    it('全局覆盖优先于三档 env', () => {
      const env = {
        [ENV_DAILY_MAX_LONG]: '1',
        [ENV_ACCOUNT_DAILY_MAX]: '4',
      }
      expect(resolveIntervals('wechat_mp', { env }).accountDailyMax).toBe(4)
      expect(resolveIntervals('douyin', { env }).accountDailyMax).toBe(4)
    })

    it('0 = 关闭该档配额（与平台档 0 语义一致），且不告警', () => {
      const warns = []
      const r = resolveIntervals('douyin', { env: { [ENV_ACCOUNT_DAILY_MAX]: '0' }, warn: (m) => warns.push(m) })
      expect(r.accountDailyMax).toBe(0)
      expect(warns).toEqual([])
    })

    it('非整数/负数回落并出声', () => {
      for (const bad of ['5.5', '-2', 'abc', '']) {
        const warns = []
        const r = resolveIntervals('douyin', { env: { [ENV_DAILY_MAX_CLIP]: bad }, warn: (m) => warns.push(m) })
        expect(r.accountDailyMax, `bad=${JSON.stringify(bad)}`).toBe(5)
        expect(warns.length, `bad=${JSON.stringify(bad)}`).toBe(1)
      }
    })

    it('设置页覆盖优先于 env', () => {
      const env = { [ENV_DAILY_MAX_CLIP]: '7' }
      const r = resolveIntervals('douyin', { env, overrides: { accountDailyMax: 2 } })
      expect(r.accountDailyMax).toBe(2)
    })
  })

  describe('抖动比例', () => {
    it('默认 0.4；合法值覆盖', () => {
      expect(resolveJitterRatio({ env: {} })).toBe(DEFAULT_JITTER_RATIO)
      expect(resolveJitterRatio({ env: { [ENV_JITTER_RATIO]: '0.2' } })).toBe(0.2)
    })

    it('0 = 关闭抖动且不告警', () => {
      const warns = []
      expect(resolveJitterRatio({ env: { [ENV_JITTER_RATIO]: '0' }, warn: (m) => warns.push(m) })).toBe(0)
      expect(warns).toEqual([])
    })

    it('越界（>=1 / 负数 / 非数 / 空白）回落默认并出声', () => {
      for (const bad of ['1', '-0.1', 'abc', '', '2']) {
        const warns = []
        const r = resolveJitterRatio({ env: { [ENV_JITTER_RATIO]: bad }, warn: (m) => warns.push(m) })
        expect(r, `bad=${JSON.stringify(bad)}`).toBe(DEFAULT_JITTER_RATIO)
        expect(warns.length, `bad=${JSON.stringify(bad)}`).toBe(1)
      }
    })
  })

  describe('回滚退避', () => {
    it('默认 60s；低于 10s 下界钳位并出声（防回滚即零等待的重试风暴）', () => {
      expect(resolveReleaseGraceMs({ env: {} })).toBe(60 * 1000)
      const warns = []
      expect(resolveReleaseGraceMs({ env: { [ENV_RELEASE_GRACE_MS]: '0' }, warn: (m) => warns.push(m) }))
        .toBe(MIN_RELEASE_GRACE_MS)
      expect(warns.length).toBe(1)
      expect(warns[0]).toContain('低于下界')
    })

    it('合法值直通；非整数回落并出声', () => {
      expect(resolveReleaseGraceMs({ env: { [ENV_RELEASE_GRACE_MS]: '30000' } })).toBe(30000)
      const warns = []
      expect(resolveReleaseGraceMs({ env: { [ENV_RELEASE_GRACE_MS]: '1.5' }, warn: (m) => warns.push(m) }))
        .toBe(60 * 1000)
      expect(warns.length).toBe(1)
    })
  })

  describe('紧急放行上限', () => {
    it('默认 1；0 = 关闭且不告警；超上界 10 钳位并出声', () => {
      expect(resolveEmergencyMaxPerDay({ env: {} })).toBe(1)

      const w0 = []
      expect(resolveEmergencyMaxPerDay({ env: { [ENV_EMERGENCY_MAX_PER_DAY]: '0' }, warn: (m) => w0.push(m) })).toBe(0)
      expect(w0).toEqual([])

      const w1 = []
      expect(resolveEmergencyMaxPerDay({ env: { [ENV_EMERGENCY_MAX_PER_DAY]: '99' }, warn: (m) => w1.push(m) })).toBe(10)
      expect(w1.length).toBe(1)
    })
  })

  describe('默认 env 来源', () => {
    it('不传 env 时读 process.env，且不会因缺省而抛', () => {
      const saved = process.env[ENV_ACCOUNT_MIN_INTERVAL]
      delete process.env[ENV_ACCOUNT_MIN_INTERVAL]
      try {
        expect(resolveIntervals('douyin').accountMinMs).toBe(10 * MIN)
      } finally {
        if (saved !== undefined) process.env[ENV_ACCOUNT_MIN_INTERVAL] = saved
      }
    })
  })
})
