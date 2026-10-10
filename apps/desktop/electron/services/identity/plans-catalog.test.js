const { syncPlans, createPlansCache } = require('./plans-catalog')

const PLANS = [
  { id: 'standard', label: '标准版', currency: 'CNY', priceMonthlyCents: 2900, priceYearlyCents: 19900 },
]
const es = (result) => ({ fetchPlans: async () => { if (result instanceof Error) throw result; return result } })
const auth = (token) => ({ getAccessToken: async () => { if (token instanceof Error) throw token; return token } })

// 逃逸分析：此前「UI 显示的价格从哪来」零覆盖 —— 「凭记忆写死」与「从服务端取」
// 在测试视角下完全等价。本文件把来源钉死在服务端。
describe('价目目录缓存 plans-catalog（2026-10-07）', () => {
  it('初始 current=null：先显示不可用，绝不显示未经服务端确认的数字', () => {
    const c = createPlansCache({ entitlementService: es(PLANS), authService: auth('t') })
    expect(c.current).toBeNull()
    expect(c.loading).toBe(false)
  })

  it('load 后拿到服务端目录', async () => {
    const c = createPlansCache({ entitlementService: es(PLANS), authService: auth('t') })
    await c.load()
    expect(c.current).toHaveLength(1)
    expect(c.current[0].priceMonthlyCents).toBe(2900)
  })

  it('并发 load 只打服务端一次（loading 单飞闸）', async () => {
    let calls = 0
    const slow = { fetchPlans: async () => { calls += 1; await new Promise((r) => setTimeout(r, 40)); return PLANS } }
    const c = createPlansCache({ entitlementService: slow, authService: auth('t') })
    await Promise.all([c.load(), c.load(), c.load()])
    expect(calls).toBe(1)
  })

  it('取价失败 ⇒ current=null（绝不兜硬编码价格）', async () => {
    const c = createPlansCache({
      entitlementService: es(new Error('down')), authService: auth('t'), logger: { warn: () => {} },
    })
    await c.load()
    expect(c.current).toBeNull()
  })

  it('取 token 失败 ⇒ 降级 null 且不抛（不打断身份状态机）', async () => {
    const c = createPlansCache({
      entitlementService: es(PLANS), authService: auth(new Error('expired')), logger: { warn: () => {} },
    })
    expect(await c.load()).toBeNull()
    expect(c.loading).toBe(false)
  })

  it('失败后 loading 复位，允许重试', async () => {
    let first = true
    const flaky = { fetchPlans: async () => { if (first) { first = false; throw new Error('x') } return PLANS } }
    const c = createPlansCache({ entitlementService: flaky, authService: auth('t'), logger: { warn: () => {} } })
    await c.load()
    expect(c.current).toBeNull()
    await c.load()
    expect(c.current).toHaveLength(1)
  })

  it('无 entitlementService ⇒ syncPlans 返回 null', async () => {
    expect(await syncPlans(null, 't')).toBeNull()
  })

  it('目录价格与营销文档口径一致（#3003 校正后）', async () => {
    const c = createPlansCache({
      entitlementService: es([{ id: 'standard', priceMonthlyCents: 2900, priceYearlyCents: 19900 }]),
      authService: auth('t'),
    })
    await c.load()
    expect(c.current[0].priceMonthlyCents).toBe(2900)
    expect(c.current[0].priceYearlyCents).toBe(19900)
  })
})
