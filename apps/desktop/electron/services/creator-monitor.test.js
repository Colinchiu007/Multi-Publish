/**
 * creator-monitor.test.js — 博主监控：失败分级与配额求解
 *
 * 两块都是「算错会静默出事」而非「算错会报错」的逻辑，因此单独锁死：
 *
 * 1. **失败分级按 API reason，不按 HTTP 状态码**
 *    YouTube 的 quotaExceeded / dailyLimitExceeded / rateLimitExceeded /
 *    userRateLimitExceeded **全部返回 403**。若按状态码粗判（4xx=可自愈、
 *    5xx=瞬时），配额耗尽会被当成真故障累计到自动暂停 —— 用户因配额被锁死。
 *    反向也踩过：ipRefererBlocked 是**应用级** 403，若归「单条错误」则
 *    表现为「每条都失败但博主永不暂停」，监控静默失效。
 *
 * 2. **配额联立求解**
 *    只按默认间隔验算会漏掉下限场景：间隔下限 5 分钟时，
 *    50 博主 × (1440/5) = 14400 units，是探测池 1500 的 9.6 倍。
 */
const {
  classifyFailure,
  FAILURE_TIERS,
  projectedProbeUnits,
  assertQuotaFits,
  buildSkipSet,
  PROJECTION_BASIS,
} = require('./creator-monitor')

/** 构造 YouTube Data API 典型错误体 */
function apiErr (code, reason) {
  return { code, message: 'err', errors: reason ? [{ reason, domain: 'youtube.api' }] : [] }
}

describe('creator-monitor · 失败分级 · 节流（403 陷阱）', () => {
  // 这组是本文件最核心的用例：按 HTTP 状态码分类的实现会在此全部失败。
  const throttled = [
    ['quotaExceeded', 403],
    ['dailyLimitExceeded', 403],
    ['rateLimitExceeded', 403],
    ['userRateLimitExceeded', 403],
    ['userRateLimitExceededUnreg', 403],
  ]
  for (const [reason, code] of throttled) {
    it(`${reason}（HTTP ${code}）判为 throttled，且不计入连续失败`, () => {
      const r = classifyFailure(code, apiErr(code, reason))
      expect(r.tier).toBe(FAILURE_TIERS.THROTTLED)
      expect(r.countsAsFailure).toBe(false)
    })
  }

  it('无 reason 的裸 429 也判节流（HTTP 429 语义即 Too Many Requests）', () => {
    const r = classifyFailure(429, { code: 429, errors: [] })
    expect(r.tier).toBe(FAILURE_TIERS.THROTTLED)
    expect(r.countsAsFailure).toBe(false)
  })

  it('节流必须原样带出 reason，供日志与 UI 归因', () => {
    expect(classifyFailure(403, apiErr(403, 'quotaExceeded')).reason).toBe('quotaExceeded')
  })
})

describe('creator-monitor · 失败分级 · 不可自愈（首次即暂停）', () => {
  it('keyInvalid 即使是 HTTP 400 也判 fatal（不能假设它一定是 403）', () => {
    const r = classifyFailure(400, apiErr(400, 'keyInvalid'))
    expect(r.tier).toBe(FAILURE_TIERS.FATAL)
    expect(r.countsAsFailure).toBe(true)
  })

  it('keyInvalid 为 403 时同样 fatal', () => {
    expect(classifyFailure(403, apiErr(403, 'keyInvalid')).tier).toBe(FAILURE_TIERS.FATAL)
  })

  for (const reason of ['keyInvalid', 'accessNotConfigured', 'ipRefererBlocked', 'forbidden']) {
    it(`${reason} 判 fatal`, () => {
      expect(classifyFailure(403, apiErr(403, reason)).tier).toBe(FAILURE_TIERS.FATAL)
    })
  }

  it('ipRefererBlocked 是应用级 403，不得归为单条错误', () => {
    // 归 item 会变成「每条都失败但博主永不暂停」，监控静默失效
    const r = classifyFailure(403, apiErr(403, 'ipRefererBlocked'))
    expect(r.tier).not.toBe(FAILURE_TIERS.ITEM)
  })

  it('无 reason 的 401 判 fatal（鉴权问题不会自愈）', () => {
    expect(classifyFailure(401, { code: 401, errors: [] }).tier).toBe(FAILURE_TIERS.FATAL)
  })
})

describe('creator-monitor · 失败分级 · 单资源 vs 博主级', () => {
  it('videoNotFound 判 item：一条视频被删不该停用整个博主', () => {
    const r = classifyFailure(404, apiErr(404, 'videoNotFound'))
    expect(r.tier).toBe(FAILURE_TIERS.ITEM)
    expect(r.countsAsFailure).toBe(false)
  })

  it('invalidPageToken 判博主级而非 item', () => {
    // 分页游标过期是「本次探测没跑完」，归 item 会静默丢失后续分页的全部作品
    const r = classifyFailure(400, apiErr(400, 'invalidPageToken'))
    expect(r.tier).not.toBe(FAILURE_TIERS.ITEM)
    expect(r.countsAsFailure).toBe(true)
  })

  it('channelNotFound 判博主级永久失败，连续 3 次触发 auto_paused', () => {
    const r = classifyFailure(404, apiErr(404, 'channelNotFound'))
    expect(r.tier).toBe(FAILURE_TIERS.PERMANENT)
    expect(r.countsAsFailure).toBe(true)
  })
})

describe('creator-monitor · 失败分级 · 瞬时', () => {
  it('5xx 判 transient 且不计入连续失败', () => {
    const r = classifyFailure(503, apiErr(503, 'backendError'))
    expect(r.tier).toBe(FAILURE_TIERS.TRANSIENT)
    expect(r.countsAsFailure).toBe(false)
  })

  it('无 reason 的 500 仍判 transient', () => {
    expect(classifyFailure(500, { code: 500, errors: [] }).tier).toBe(FAILURE_TIERS.TRANSIENT)
  })

  for (const code of ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN']) {
    it(`传输层 ${code} 判 transient`, () => {
      const r = classifyFailure(0, null, { code })
      expect(r.tier).toBe(FAILURE_TIERS.TRANSIENT)
      expect(r.countsAsFailure).toBe(false)
    })
  }
})

describe('creator-monitor · 失败分级 · 兜底 fail-closed', () => {
  it('reason 缺失且状态码无法归类时计入失败（不静默放行）', () => {
    // 放行会让「所有无法识别的错误」都无声跳过 —— 分类失败本身要暴露
    const r = classifyFailure(418, { code: 418, errors: [] })
    expect(r.countsAsFailure).toBe(true)
  })

  it('未识别的 reason 兜底为计入失败并保留原文供诊断', () => {
    const r = classifyFailure(400, apiErr(400, 'someBrandNewReason'))
    expect(r.reason).toBe('someBrandNewReason')
    expect(r.countsAsFailure).toBe(true)
  })

  it('响应体缺失也不抛异常（分级失败不等于程序崩溃）', () => {
    expect(() => classifyFailure(200, undefined)).not.toThrow()
  })

  it('分级结果永不含 apiKey 明文', () => {
    const r = classifyFailure(400, apiErr(400, 'keyInvalid'), null, 'AIzaSySECRET')
    expect(JSON.stringify(r)).not.toContain('AIzaSySECRET')
  })
})

describe('creator-monitor · reason 优先级', () => {
  it('多个 reason 同时存在时按固定优先级取第一个命中', () => {
    // 响应体可能带多个 errors[]；必须按 配额 > 鉴权 > 不存在 > 单条 的次序，
    // 否则「配额 + 鉴权」会被鉴权抢先，配额耗尽又被误判成凭证问题。
    const body = { code: 403, errors: [{ reason: 'keyInvalid' }, { reason: 'quotaExceeded' }] }
    expect(classifyFailure(403, body).tier).toBe(FAILURE_TIERS.THROTTLED)
  })

  it('配额优先级高于鉴权', () => {
    const body = { code: 403, errors: [{ reason: 'accessNotConfigured' }, { reason: 'dailyLimitExceeded' }] }
    expect(classifyFailure(403, body).tier).toBe(FAILURE_TIERS.THROTTLED)
  })

  it('鉴权优先级高于不存在', () => {
    const body = { code: 400, errors: [{ reason: 'channelNotFound' }, { reason: 'keyInvalid' }] }
    expect(classifyFailure(400, body).tier).toBe(FAILURE_TIERS.FATAL)
  })

  it('单条错误优先级最低', () => {
    const body = { code: 400, errors: [{ reason: 'videoNotFound' }, { reason: 'channelNotFound' }] }
    expect(classifyFailure(400, body).tier).toBe(FAILURE_TIERS.PERMANENT)
  })

  it('优先级顺序已固化为常量，便于文档与 UI 复用', () => {
    expect(PROJECTION_BASIS).toBe('1440/interval_min')
  })
})

describe('creator-monitor · 配额联立求解', () => {
  it('日探测需求 = Σ(1440 / interval_min)', () => {
    expect(projectedProbeUnits([{ check_interval_min: 60 }, { check_interval_min: 60 }])).toBe(48)
  })

  it('50 个博主 @1 小时 = 1200 units，在探测池内', () => {
    const follows = Array.from({ length: 50 }, () => ({ check_interval_min: 60 }))
    expect(projectedProbeUnits(follows)).toBe(1200)
    expect(() => assertQuotaFits(follows, 1500)).not.toThrow()
  })

  it('50 个博主全设 5 分钟下限 = 14400 units，必须拒绝（只验默认值会漏）', () => {
    const follows = Array.from({ length: 50 }, () => ({ check_interval_min: 5 }))
    expect(projectedProbeUnits(follows)).toBe(14400)
    expect(() => assertQuotaFits(follows, 1500)).toThrow(/1500/)
  })

  it('混合间隔按各自频率累加', () => {
    const follows = [{ check_interval_min: 5 }, { check_interval_min: 1440 }]
    expect(projectedProbeUnits(follows)).toBe(288 + 1)
  })

  it('interval_min 缺失或非法时按默认 60 计，不产生 NaN/Infinity', () => {
    const v = projectedProbeUnits([{}, { check_interval_min: 0 }, { check_interval_min: -5 }])
    expect(Number.isFinite(v)).toBe(true)
    expect(v).toBe(72)   // 3 × (1440/60)
  })

  it('拒绝时抛出可判定的错误对象（带 projected / pool，供 UI 展示）', () => {
    const follows = Array.from({ length: 50 }, () => ({ check_interval_min: 5 }))
    try {
      assertQuotaFits(follows, 1500)
      throw new Error('应当抛出')
    } catch (e) {
      expect(e.projected).toBe(14400)
      expect(e.pool).toBe(1500)
    }
  })

  it('待新增的关注项在插入前即校验（不得先写库再判定）', () => {
    // 50×60min = 1200 units；再加一个 5min（288）= 1488，仍在池内 -> 放行
    const fits = Array.from({ length: 50 }, () => ({ check_interval_min: 60 }))
    expect(() => assertQuotaFits(fits, 1500, { check_interval_min: 5 })).not.toThrow()

    // 50×5min 已远超池；再加一项必然超限 -> 拒绝
    const nearFull = Array.from({ length: 50 }, () => ({ check_interval_min: 5 }))
    expect(() => assertQuotaFits(nearFull, 1500, { check_interval_min: 5 })).toThrow()
  })
})

describe('creator-monitor · 超限时的确定性跳过集', () => {
  it('间隔小（检查更频繁）的优先保底，剩余跳过', () => {
    const follows = [
      { id: 'a', check_interval_min: 60 },
      { id: 'b', check_interval_min: 5 },
      { id: 'c', check_interval_min: 60 },
    ]
    const { keep, skip } = buildSkipSet(follows, 300)  // 只够跑一个 5min(288) + 不到一个 60min(24)
    expect(keep.map(f => f.id)).toEqual(['b'])          // 频繁优先保底
    expect(skip.map(f => f.id)).toEqual(['a', 'c'])
  })

  it('同一份数据每次得到完全相同的跳过集（不得依赖遍历顺序）', () => {
    const follows = [
      { id: 'a', check_interval_min: 5 },
      { id: 'b', check_interval_min: 60 },
      { id: 'c', check_interval_min: 60 },
      { id: 'd', check_interval_min: 60 },
    ]
    const r1 = buildSkipSet(follows, 300)
    const r2 = buildSkipSet(follows, 300)
    expect(r1.skip.map(f => f.id)).toEqual(r2.skip.map(f => f.id))
    expect(r1.keep.map(f => f.id)).toEqual(r2.keep.map(f => f.id))
  })

  it('间隔相同则按 id 稳定排序', () => {
    const follows = [
      { id: 'z', check_interval_min: 60 },
      { id: 'a', check_interval_min: 60 },
      { id: 'm', check_interval_min: 60 },
    ]
    const { keep } = buildSkipSet(follows, 50)   // 每项 24 units，只够 2 个
    expect(keep.map(f => f.id)).toEqual(['a', 'm'])
  })

  it('池子够大时全部保留、无人被跳过', () => {
    const follows = [{ id: 'a', check_interval_min: 60 }]
    const { keep, skip } = buildSkipSet(follows, 1500)
    expect(skip).toHaveLength(0)
    expect(keep).toHaveLength(1)
  })
})