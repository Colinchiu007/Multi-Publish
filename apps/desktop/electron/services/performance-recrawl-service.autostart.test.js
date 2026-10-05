// @ts-check
/**
 * 回采巡检的「收口 → 归因重算」触发契约 + 自动启动接线（P2-6d B2/B3）
 *
 * 背景是两处 docs-vs-code 漂移，都不是猜的：
 *  · `pattern-attribution-service.js` 的头注释写着「每日回采巡检结束后 + IPC 手动触发」，
 *    而实测 `recomputeAll()` 生产调用点只有手动 IPC 一个；
 *  · `PerformanceRecrawlService.start()` 里 30s 首轮 + 24h 周期的定时器写得完整，
 *    但全仓没有任何地方调用它（实测 bootstrap 的 `.start()` 只有六个别的监视器）。
 * 合起来的后果：用户界面上「最近回采 = 从未」与「归因榜恒空」不是没数据，是**没人去采、采完没人去算**。
 *
 * 所以本文件一半量触发语义（算不算、算几次、抛错会不会带崩巡检），
 * 一半量接线（bootstrap 里真的有人拧钥匙）。接线用结构锁：
 * 行为测试要真跑 bootstrap 代价过大，而"漏一行接线"正是这类缺陷的原始形态。
 */
const { PerformanceRecrawlService } = require('./performance-recrawl-service')

function makeService (store) {
  const svc = new PerformanceRecrawlService({ store })
  svc._jitter = async () => {}
  svc._getParser = () => ({
    resolveContentUrl: (postId, url) => url || 'https://example.com/' + postId,
    fetchMetrics: async () => ({ views: 10, likes: 1, comments: 1, favorites: 1, shares: 0, raw: {} }),
  })
  return svc
}

function makeStore (dueRows) {
  const seen = []
  return {
    seen,
    listDueForRecrawl: () => dueRows,
    addPerformanceSnapshot: () => 'snap-1',
    updateTrackedContent: (id, patch) => seen.push([id, patch]),
  }
}

const dueItem = { id: 't1', platform: 'fixture', post_id: 'p1', url: 'https://example.com/note/1' }

describe('回采收口 → 归因重算触发', () => {
  it('处理过到期条目 ⇒ 收口后恰好触发一次重算', async () => {
    let hits = 0
    const svc = makeService(makeStore([dueItem]))
    svc.setAfterRound(() => { hits++ })
    await svc.processRound()
    expect(hits, '巡检真的采到了东西 → 必须让归因跟上，否则榜单永远落后一轮').toBe(1)
  })

  it('多条到期也只触发一次（重算是全量重算，逐条触发等于把自己扫 N 遍）', async () => {
    let hits = 0
    const svc = makeService(makeStore([dueItem, { ...dueItem, id: 't2' }, { ...dueItem, id: 't3' }]))
    svc.setAfterRound(() => { hits++ })
    await svc.processRound()
    expect(hits).toBe(1)
  })

  it('本轮 0 条到期 ⇒ 不触发（无谓的全表 DELETE+INSERT 会把 computed_at 刷成"刚更新过"的假象）', async () => {
    let hits = 0
    const svc = makeService(makeStore([]))
    svc.setAfterRound(() => { hits++ })
    await svc.processRound()
    expect(hits).toBe(0)
  })

  it('重算同步抛错 ⇒ 巡检正常收口、_running 复位、错误出声（旁路不得冒泡）', async () => {
    const svc = makeService(makeStore([dueItem]))
    svc.setAfterRound(() => { throw new Error('boom') })
    await expect(svc.processRound()).resolves.toBeUndefined()
    expect(svc._running, '收口没跑完就把 _running 留在 true ⇒ 之后所有轮次静默停摆').toBe(false)
  })

  it('重算返回的 promise 被拒绝 ⇒ 不产生 unhandledRejection，且巡检仍成功收口', async () => {
    const reasons = []
    const onUnhandled = (reason) => reasons.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const svc = makeService(makeStore([dueItem]))
      svc.setAfterRound(() => Promise.reject(new Error('late boom')))
      await svc.processRound()
      await new Promise(r => setTimeout(r, 0))
      await new Promise(r => setTimeout(r, 0))
      expect(reasons, '异步归因的拒绝必须以 .catch 收掉').toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('未接线（没 setAfterRound）⇒ 巡检照跑，不抛错', async () => {
    const svc = makeService(makeStore([dueItem]))
    await expect(svc.processRound()).resolves.toBeUndefined()
  })

  it('setAfterRound 传非函数一律视为没接（不得把字符串/对象当回调存起来）', async () => {
    const svc = makeService(makeStore([dueItem]))
    svc.setAfterRound('recomputeAll')
    svc.setAfterRound({})
    await expect(svc.processRound()).resolves.toBeUndefined()
    expect(svc._afterRound ?? null).toBe(null)
  })
})

describe('自动巡检的定时器与接线', () => {
  it('start() 幂等：重复调用不得叠加定时器（否则每调一次就多一份巡检与多一份重算）', () => {
    vi.useFakeTimers()
    try {
      const svc = makeService(makeStore([]))
      const intervals = []
      const realSetInterval = global.setInterval
      global.setInterval = (...args) => { intervals.push(args); return realSetInterval(...args) }
      try {
        svc.start()
        svc.start()
        svc.start()
      } finally {
        global.setInterval = realSetInterval
      }
      expect(intervals.length, 'setInterval 只能被调用一次').toBe(1)
      svc.stop()
      expect(svc._dailyTimer).toBe(null)
    } finally {
      vi.useRealTimers()
    }
  })

  it('接线锁：bootstrap 必须真的调 performanceRecrawlService.start()（B3 的原始形态就是没人调）', () => {
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.join(__dirname, '..', 'bootstrap', 'phase3-services.js'), 'utf8')
    // 去掉注释行再判：注释里提一句 start() 不构成接线
    const code = src.split(/\r?\n/).filter(l => !/^\s*\*/.test(l) && !/^\s*\/\//.test(l)).join('\n')
    expect(/performanceRecrawlService\s*\.\s*start\s*\(\s*\)/.test(code),
      'phase3-services.js 里没有真的调用 start()').toBe(true)
  })

  it('接线锁：after-round 必须接到归因重算上（而不是接了个空函数）', () => {
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.join(__dirname, '..', 'bootstrap', 'phase3-services.js'), 'utf8')
    expect(src).toMatch(/setAfterRound\s*\(/)
    expect(src).toMatch(/recomputeAll/)
  })
})
