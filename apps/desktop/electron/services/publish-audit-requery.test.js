// @vitest-environment node
const {
  AUDIT_REQUERY_VERIFIED_PLATFORMS,
  AUDIT_REQUERY_CANDIDATE_PLATFORMS,
  COOKIE_SOURCE,
  resolveAuditRequeryCookies,
  allowCandidateRequery,
  decideAuditRequery,
} = require('./publish-audit-requery')

/**
 * P0-1 第二切片：审核回查「能不能查」的策略层。
 *
 * 根因：phase4-events 传的 `task.article?.cookies` 全仓只读未写（恒空），
 * 监控历来用空 cookie 轮询 → 必然失败 12 次后 timeout。本层做两件事：
 *   ① 凭证解析（任务自带优先 → auth 分区只读补齐 → 拿不到就 none）
 *   ② 端点能力分级（verified / candidate / unsupported）显式化，避免
 *      「代码在跑」被误读成「能力可用」
 */
describe('publish-audit-requery — 凭证解析', () => {
  it('任务自带凭证优先，且不触碰 auth 分区', async () => {
    let readerCalled = false
    const r = await resolveAuditRequeryCookies({
      platform: 'zhihu',
      accountId: 'acc-1',
      providedCookies: '  a=1; b=2  ',
      readAuthCookies: async () => { readerCalled = true; return { cookieString: 'x=9' } },
    })
    expect(r).toEqual({ cookies: 'a=1; b=2', source: COOKIE_SOURCE.PROVIDED })
    expect(readerCalled).toBe(false)
  })

  it('自带为空时从 auth 分区补齐（登录态真实所在）', async () => {
    const r = await resolveAuditRequeryCookies({
      platform: 'zhihu',
      accountId: 'acc-1',
      providedCookies: '',
      readAuthCookies: async (platform, accountId) => {
        expect(platform).toBe('zhihu')
        expect(accountId).toBe('acc-1')
        return { cookieString: 'z_c0=tok' }
      },
    })
    expect(r).toEqual({ cookies: 'z_c0=tok', source: COOKIE_SOURCE.AUTH_PARTITION })
  })

  it('两处都拿不到 → none（调用点据此跳过，不发起必然失败的轮询）', async () => {
    const r = await resolveAuditRequeryCookies({
      platform: 'zhihu', accountId: 'acc-1', providedCookies: '   ',
      readAuthCookies: async () => ({ cookieString: '' }),
    })
    expect(r).toEqual({ cookies: '', source: COOKIE_SOURCE.NONE })
  })

  it('auth 读取抛错/返回畸形一律降级 none（绝不冒泡影响发布主流程）', async () => {
    const boom = await resolveAuditRequeryCookies({
      platform: 'zhihu', accountId: 'a',
      readAuthCookies: async () => { throw new Error('session gone') },
    })
    expect(boom).toEqual({ cookies: '', source: COOKIE_SOURCE.NONE })
    const weird = await resolveAuditRequeryCookies({
      platform: 'zhihu', accountId: 'a',
      readAuthCookies: async () => null,
    })
    expect(weird).toEqual({ cookies: '', source: COOKIE_SOURCE.NONE })
  })

  it('平台为空不尝试读取', async () => {
    const r = await resolveAuditRequeryCookies({ platform: '', providedCookies: '' })
    expect(r.source).toBe(COOKIE_SOURCE.NONE)
  })

  it('accountId 缺省传 null（不传 undefined，便于下游拼分区名）', async () => {
    await resolveAuditRequeryCookies({
      platform: 'weibo',
      readAuthCookies: async (platform, accountId) => {
        expect(accountId).toBeNull()
        return { cookieString: '' }
      },
    })
  })
})

describe('publish-audit-requery — 能力分级决策', () => {
  it('无凭证一律不查（原因 no-cookies）', () => {
    expect(decideAuditRequery({ platform: 'zhihu', cookies: '' })).toEqual({ start: false, reason: 'no-cookies' })
    expect(decideAuditRequery({ platform: 'zhihu', cookies: '   ' })).toEqual({ start: false, reason: 'no-cookies' })
  })

  it('候选平台默认参与探索性轮询（保持既有意图，凭证已修复）', () => {
    for (const platform of AUDIT_REQUERY_CANDIDATE_PLATFORMS) {
      expect(decideAuditRequery({ platform, cookies: 'c=1' }), platform).toEqual({ start: true, reason: 'candidate' })
    }
  })

  it('MP_AUDIT_REQUERY_CANDIDATES=0 可关闭探索性轮询', () => {
    for (const off of ['0', 'false', 'off', 'no', 'OFF']) {
      expect(decideAuditRequery({ platform: 'zhihu', cookies: 'c=1', env: { MP_AUDIT_REQUERY_CANDIDATES: off } }).start).toBe(false)
    }
    expect(decideAuditRequery({ platform: 'zhihu', cookies: 'c=1', env: { MP_AUDIT_REQUERY_CANDIDATES: '0' } }).reason)
      .toBe('candidates-disabled')
    expect(allowCandidateRequery({ MP_AUDIT_REQUERY_CANDIDATES: '1' })).toBe(true)
    expect(allowCandidateRequery({})).toBe(true)
  })

  it('表外平台不查（unsupported-platform），且与空值/未知平台判定互不干扰', () => {
    expect(decideAuditRequery({ platform: 'kuaishou', cookies: 'c=1' })).toEqual({ start: false, reason: 'unsupported-platform' })
    expect(decideAuditRequery({ platform: 'unknown_platform', cookies: 'c=1' })).toEqual({ start: false, reason: 'unsupported-platform' })
    expect(decideAuditRequery({})).toEqual({ start: false, reason: 'no-cookies' })
  })

  it('verified 表当前为空（诚实标注：本仓尚无任何平台的审核回查真机证据）', () => {
    expect(AUDIT_REQUERY_VERIFIED_PLATFORMS).toEqual([])
    // verified 一旦有平台，决策必须走 verified 分支（当前无平台可验，故用空表断言 + 逻辑覆盖）
    expect(decideAuditRequery({ platform: 'zhihu', cookies: 'c=1', env: { MP_AUDIT_REQUERY_CANDIDATES: '0' } }).reason)
      .toBe('candidates-disabled')
  })

  it('候选表不得退化成空集（空表会让「全部 unsupported」被误当正常）', () => {
    expect(AUDIT_REQUERY_CANDIDATE_PLATFORMS.length).toBeGreaterThanOrEqual(7)
  })
})

describe('publish-audit-requery — 与 publish-monitor 端点表 parity（防两表漂移）', () => {
  it('候选平台键集必须与 publish-monitor 的 CHECK_URLS 完全一致', () => {
    // 两处各写一份平台清单必然漂移：新增端点却忘了登记候选 → 该平台静默永不回查；
    // 登记了候选却没有端点 → 决策说 start 但监控侧 callback 直接 skipped（假绿）。
    const monitorPath = require.resolve('./publish-monitor')
    const source = require('fs').readFileSync(monitorPath, 'utf8')
    const match = source.match(/const CHECK_URLS = \{([\s\S]*?)\n\}/)
    expect(match, 'publish-monitor 必须保留 CHECK_URLS 字面量表').toBeTruthy()
    const keys = [...match[1].matchAll(/^\s*(\w+):\s*'/gm)].map(m => m[1]).sort()
    expect(keys).toEqual([...AUDIT_REQUERY_CANDIDATE_PLATFORMS].sort())
  })
})
